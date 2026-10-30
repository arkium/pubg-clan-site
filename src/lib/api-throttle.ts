import { getPubgApiRateLimitRpm } from '@/lib/pubg-rate-limit-config-service'
import { createPubgApiCallLog } from '@/lib/pubg-api-call-log-service'

// Fallback used only if no configuration is provided.
const PUBG_API_RATE_LIMIT_RPM = 10
const RATE_LIMIT_SAFETY_BUFFER = 1
const RATE_LIMIT_RESET_PADDING_MS = 250

/**
 * Lectures simultanées au plus des endpoints que PUBG ne limite pas (`/matches/{id}`) : sans en-tête `X-RateLimit-*`,
 * lisibles même sans clé (vérifié le 2026-10-27, docs/TODO/synchro-parties-30-min.md). Ils ne passent plus par la file
 * à un appel toutes les 6 s, qui reste celle des endpoints limités (`/players`, `/seasons`, `/clans`…).
 */
export const UNTHROTTLED_CONCURRENCY = 4

/** `/shards/{shard}/matches/{id}` : non soumis au quota de la clé. */
export function isUnthrottledPubgEndpoint(endpoint: string | undefined) {
  return typeof endpoint === 'string' && /\/matches\/[^/?]+$/.test(endpoint)
}

/**
 * Délai de l'unique relance d'un échec passager (5xx, pas de réponse) d'une lecture non limitée : le 2026-10-29, un 502
 * d'une minute chez PUBG a fait attendre deux parties le tour suivant (30 min). Une 404 n'est jamais relancée (partie pas
 * encore publiée : le tour suivant suffit) ; un endpoint limité non plus (la relance prendrait une place du quota).
 */
export const TRANSIENT_RETRY_DELAY_MS = 5_000

function isTransientPubgError(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error)) return false
  const status = (error as { status?: number }).status
  return status === undefined || status === 0 || status >= 500
}

/**
 * Priorité dans la file des endpoints limités : `high` (synchronisation des parties, manches de tournoi — ce qui fait
 * partir une alerte Top 1) passe devant `normal` (par défaut), qui passe devant `low` (tâches de fond : carrière,
 * saisons, clans des joueurs croisés). Ordre d'arrivée conservé à priorité égale.
 */
export type PubgApiPriority = 'high' | 'normal' | 'low'
const PRIORITY_RANK: Record<PubgApiPriority, number> = { high: 0, normal: 1, low: 2 }

type QueueItem<T> = {
  fn: () => Promise<T>
  metadata?: PubgApiRequestMetadata
  rank: number
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export type PubgApiRequestMetadata = {
  source?: string
  method?: string
  endpoint?: string
  shard?: string | null
  clanId?: number | null
  memberId?: number | null
  priority?: PubgApiPriority
}

type ExtractedRateLimit = {
  limit: number | null
  remaining: number | null
  resetAt: Date | null
}

export class ApiQueue {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queue: QueueItem<any>[] = []
  private running = false
  private readonly intervalMs: number
  private readonly maxRetries: number
  private logs: string[] = []
  private lastRateLimit: ExtractedRateLimit = {
    limit: null,
    remaining: null,
    resetAt: null,
  }

  private readonly transientRetryDelayMs: number

  constructor(requestsPerMinute = PUBG_API_RATE_LIMIT_RPM, maxRetries = 3, options?: { transientRetryDelayMs?: number }) {
    this.intervalMs = Math.ceil(60_000 / requestsPerMinute)
    this.maxRetries = maxRetries
    this.transientRetryDelayMs = options?.transientRetryDelayMs ?? TRANSIENT_RETRY_DELAY_MS
  }

  private unthrottledRunning = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private unthrottledWaiting: QueueItem<any>[] = []

  add<T>(fn: () => Promise<T>, metadata?: PubgApiRequestMetadata): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = { fn, metadata, rank: PRIORITY_RANK[metadata?.priority ?? 'normal'], resolve, reject }

      if (isUnthrottledPubgEndpoint(metadata?.endpoint)) {
        this.unthrottledWaiting.push(item)
        this.pumpUnthrottled()
        return
      }

      // Après le dernier élément de priorité égale ou plus haute : la plus haute d'abord, l'ordre d'arrivée ensuite.
      const position = this.queue.findIndex((queued) => queued.rank > item.rank)
      if (position < 0) this.queue.push(item)
      else this.queue.splice(position, 0, item)

      if (!this.running) {
        this.running = true
        void this.drain()
      }
    })
  }

  /** Éléments en attente dans la file des endpoints limités (tests, observabilité). */
  get pendingCount() {
    return this.queue.length
  }

  private pumpUnthrottled() {
    while (this.unthrottledRunning < UNTHROTTLED_CONCURRENCY && this.unthrottledWaiting.length > 0) {
      const item = this.unthrottledWaiting.shift()!
      this.unthrottledRunning += 1
      void this.execute(item).finally(() => {
        this.unthrottledRunning -= 1
        this.pumpUnthrottled()
      })
    }
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      await this.waitIfNearRateLimit()
      await this.execute(item)

      if (this.queue.length > 0) {
        await this.sleep(this.intervalMs)
      }
    }
    this.running = false
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async execute(item: QueueItem<any>): Promise<void> {
    const startTime = Date.now()
    const startedAt = new Date(startTime)
    this.log('API call started')
    try {
      const { result, retryCount } = await this.callWithRetry(item.fn, isUnthrottledPubgEndpoint(item.metadata?.endpoint))
      const rateLimit = extractRateLimitFromSuccessValue(result)
      this.updateRateLimitState(rateLimit)
      this.log(`API call succeeded in ${Date.now() - startTime}ms`)
      void createPubgApiCallLog({
        source: item.metadata?.source ?? 'gateway',
        method: item.metadata?.method ?? 'GET',
        endpoint: item.metadata?.endpoint ?? 'unknown-endpoint',
        shard: item.metadata?.shard ?? null,
        statusCode: extractStatusCodeFromValue(result),
        success: true,
        retryCount,
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startTime,
        clanId: item.metadata?.clanId ?? null,
        memberId: item.metadata?.memberId ?? null,
        errorMessage: null,
        rateLimitLimit: rateLimit.limit,
        rateLimitRemaining: rateLimit.remaining,
        rateLimitResetAt: rateLimit.resetAt,
      }).catch(() => undefined)
      item.resolve(result)
    } catch (err) {
      const rateLimit = extractRateLimitFromError(err)
      this.updateRateLimitState(rateLimit)
      this.log(
        `API call failed after ${Date.now() - startTime}ms: ${err instanceof Error ? err.message : String(err)}`
      )
      void createPubgApiCallLog({
        source: item.metadata?.source ?? 'gateway',
        method: item.metadata?.method ?? 'GET',
        endpoint: item.metadata?.endpoint ?? 'unknown-endpoint',
        shard: item.metadata?.shard ?? null,
        statusCode: extractStatusCodeFromError(err),
        success: false,
        retryCount: extractRetryCountFromError(err),
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startTime,
        clanId: item.metadata?.clanId ?? null,
        memberId: item.metadata?.memberId ?? null,
        errorMessage: err instanceof Error ? err.message : String(err),
        rateLimitLimit: rateLimit.limit,
        rateLimitRemaining: rateLimit.remaining,
        rateLimitResetAt: rateLimit.resetAt,
      }).catch(() => undefined)
      item.reject(err)
    }
  }

  private async callWithRetry<T>(fn: () => Promise<T>, allowTransientRetry = false): Promise<{ result: T; retryCount: number }> {
    let lastError: unknown
    let transientRetried = false
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn()
        return { result, retryCount: attempt - 1 }
      } catch (err) {
        lastError = err
        if (this.isRateLimitError(err) && attempt < this.maxRetries) {
          const rateLimit = extractRateLimitFromError(err)
          this.updateRateLimitState(rateLimit)
          const retryDelay = this.resolveRetryDelayMs(rateLimit, attempt)
          this.log(
            `Rate limit hit (429), retrying in ${retryDelay}ms (attempt ${attempt}/${this.maxRetries})`
          )
          await this.sleep(retryDelay)
        } else if (allowTransientRetry && !transientRetried && attempt < this.maxRetries && isTransientPubgError(err)) {
          transientRetried = true
          this.log(`Transient failure, retrying once in ${this.transientRetryDelayMs}ms`)
          await this.sleep(this.transientRetryDelayMs)
        } else {
          if (attempt > 1 && err instanceof Error) {
            ;(err as Error & { retryCount?: number }).retryCount = attempt - 1
          }
          throw err
        }
      }
    }
    if (lastError instanceof Error) {
      ;(lastError as Error & { retryCount?: number }).retryCount = this.maxRetries - 1
    }

    throw lastError
  }

  private isRateLimitError(err: unknown): boolean {
    if (err && typeof err === 'object' && 'status' in err) {
      const status = (err as { status?: number }).status
      if (status === 429) {
        return true
      }
    }

    if (err && typeof err === 'object' && 'response' in err) {
      const response = (err as { response?: { status?: number } }).response
      return response?.status === 429
    }
    return false
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private resolveRetryDelayMs(rateLimit: ExtractedRateLimit, attempt: number): number {
    if (rateLimit.resetAt) {
      const delayUntilReset = rateLimit.resetAt.getTime() - Date.now() + RATE_LIMIT_RESET_PADDING_MS
      if (delayUntilReset > 0) {
        return delayUntilReset
      }
    }

    return this.intervalMs * attempt
  }

  private updateRateLimitState(rateLimit: ExtractedRateLimit): void {
    const hasHeaders =
      rateLimit.limit !== null || rateLimit.remaining !== null || rateLimit.resetAt !== null

    if (!hasHeaders) {
      return
    }

    this.lastRateLimit = {
      limit: rateLimit.limit ?? this.lastRateLimit.limit,
      remaining: rateLimit.remaining ?? this.lastRateLimit.remaining,
      resetAt: rateLimit.resetAt ?? this.lastRateLimit.resetAt,
    }
  }

  private async waitIfNearRateLimit(): Promise<void> {
    const remaining = this.lastRateLimit.remaining
    const resetAt = this.lastRateLimit.resetAt

    if (remaining === null || !resetAt) {
      return
    }

    const now = Date.now()
    if (resetAt.getTime() <= now) {
      this.lastRateLimit.remaining = null
      this.lastRateLimit.resetAt = null
      return
    }

    if (remaining > RATE_LIMIT_SAFETY_BUFFER) {
      return
    }

    const waitMs = resetAt.getTime() - now + RATE_LIMIT_RESET_PADDING_MS
    if (waitMs <= 0) {
      return
    }

    this.log(
      `Rate limit guard: remaining=${remaining}, waiting ${waitMs}ms until next reset before sending the next request`
    )
    await this.sleep(waitMs)

    // Reset stale rate-limit state after waiting for the next server window.
    this.lastRateLimit.remaining = null
    this.lastRateLimit.resetAt = null
  }

  private log(message: string): void {
    const entry = `[ApiQueue ${new Date().toISOString()}] ${message}`
    console.log(entry)
    this.logs.push(entry)
  }

  getLogs(): string[] {
    return [...this.logs]
  }
}

const globalForPubgThrottle = globalThis as typeof globalThis & {
  pubgApiQueue?: ApiQueue
  pubgApiQueueRpm?: number
}

async function getOrCreatePubgApiQueue() {
  const configuredRpm = await getPubgApiRateLimitRpm()

  if (!globalForPubgThrottle.pubgApiQueue || globalForPubgThrottle.pubgApiQueueRpm !== configuredRpm) {
    globalForPubgThrottle.pubgApiQueue = new ApiQueue(configuredRpm)
    globalForPubgThrottle.pubgApiQueueRpm = configuredRpm
  }

  return globalForPubgThrottle.pubgApiQueue
}

export async function enqueuePubgApiRequest<T>(fn: () => Promise<T>) {
  const queue = await getOrCreatePubgApiQueue()
  return queue.add(fn)
}

export async function enqueuePubgApiRequestWithMetadata<T>(
  fn: () => Promise<T>,
  metadata?: PubgApiRequestMetadata
) {
  const queue = await getOrCreatePubgApiQueue()
  return queue.add(fn, metadata)
}

export function getPubgApiQueueLogs() {
  return globalForPubgThrottle.pubgApiQueue?.getLogs() ?? []
}

function extractStatusCodeFromError(err: unknown) {
  if (err && typeof err === 'object') {
    if ('status' in err) {
      const status = (err as { status?: unknown }).status
      if (typeof status === 'number') {
        return status
      }
    }

    if ('response' in err) {
      const response = (err as { response?: { status?: unknown } }).response
      if (typeof response?.status === 'number') {
        return response.status
      }
    }
  }

  return null
}

function extractStatusCodeFromValue(value: unknown) {
  if (value && typeof value === 'object' && 'status' in value) {
    const status = (value as { status?: unknown }).status
    if (typeof status === 'number') {
      return status
    }
  }

  return 200
}

function extractRetryCountFromError(err: unknown) {
  if (err && typeof err === 'object' && 'retryCount' in err) {
    const retryCount = (err as { retryCount?: unknown }).retryCount
    if (typeof retryCount === 'number' && Number.isFinite(retryCount)) {
      return retryCount
    }
  }

  return 0
}

function extractRateLimitFromSuccessValue(value: unknown): ExtractedRateLimit {
  if (!value || typeof value !== 'object') {
    return { limit: null, remaining: null, resetAt: null }
  }

  const headers = (value as { headers?: unknown }).headers
  return parseRateLimitHeaders(headers)
}

function extractRateLimitFromError(err: unknown): ExtractedRateLimit {
  if (!err || typeof err !== 'object') {
    return { limit: null, remaining: null, resetAt: null }
  }

  const rateLimit = parseRateLimitHeaders((err as { responseHeaders?: unknown }).responseHeaders)
  if (rateLimit.limit !== null || rateLimit.remaining !== null || rateLimit.resetAt !== null) {
    return rateLimit
  }

  return parseRateLimitHeaders((err as { response?: { headers?: unknown } }).response?.headers)
}

function parseRateLimitHeaders(headers: unknown): ExtractedRateLimit {
  if (!headers || typeof headers !== 'object') {
    return { limit: null, remaining: null, resetAt: null }
  }

  const normalized = Object.entries(headers as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key.toLowerCase()] = value
      }
      return acc
    },
    {}
  )

  const limit = parseRateLimitNumber(
    normalized['x-ratelimit-limit'] ?? normalized['x-ratelimit-limit-minute']
  )
  const remaining = parseRateLimitNumber(normalized['x-ratelimit-remaining'])
  const resetAt = parseRateLimitResetDate(normalized['x-ratelimit-reset'])

  return { limit, remaining, resetAt }
}

function parseRateLimitNumber(value: string | undefined) {
  if (!value) {
    return null
  }

  const firstSegment = value.split('/')[0]?.trim()
  const parsed = Number(firstSegment)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRateLimitResetDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  const ms = parsed > 9999999999 ? parsed : parsed * 1000
  const asDate = new Date(ms)
  return Number.isNaN(asDate.getTime()) ? null : asDate
}
