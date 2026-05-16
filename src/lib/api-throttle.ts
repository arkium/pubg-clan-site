// PUBG API rate limit: 10 requests per minute
const PUBG_API_RATE_LIMIT_RPM = 10

type QueueItem<T> = {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

export class ApiQueue {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private queue: QueueItem<any>[] = []
  private running = false
  private readonly intervalMs: number
  private readonly maxRetries: number
  private logs: string[] = []

  constructor(requestsPerMinute = PUBG_API_RATE_LIMIT_RPM, maxRetries = 3) {
    this.intervalMs = Math.ceil(60_000 / requestsPerMinute)
    this.maxRetries = maxRetries
  }

  add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      if (!this.running) {
        this.running = true
        void this.drain()
      }
    })
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      const startTime = Date.now()
      this.log('API call started')
      try {
        const result = await this.callWithRetry(item.fn)
        this.log(`API call succeeded in ${Date.now() - startTime}ms`)
        item.resolve(result)
      } catch (err) {
        this.log(
          `API call failed after ${Date.now() - startTime}ms: ${err instanceof Error ? err.message : String(err)}`
        )
        item.reject(err)
      }

      if (this.queue.length > 0) {
        await this.sleep(this.intervalMs)
      }
    }
    this.running = false
  }

  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err
        if (this.isRateLimitError(err) && attempt < this.maxRetries) {
          const retryDelay = this.intervalMs * attempt
          this.log(
            `Rate limit hit (429), retrying in ${retryDelay}ms (attempt ${attempt}/${this.maxRetries})`
          )
          await this.sleep(retryDelay)
        } else {
          throw err
        }
      }
    }
    throw lastError
  }

  private isRateLimitError(err: unknown): boolean {
    if (err && typeof err === 'object' && 'response' in err) {
      const response = (err as { response?: { status?: number } }).response
      return response?.status === 429
    }
    return false
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
