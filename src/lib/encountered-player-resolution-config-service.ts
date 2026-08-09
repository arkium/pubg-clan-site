import { prisma } from '@/lib/prisma'

const BATCH_SIZE_KEY = 'encountered_player_resolution_batch_size'
const DEFAULT_BATCH_SIZE = 5
const MIN_BATCH_SIZE = 1
const MAX_BATCH_SIZE = 40

const ENABLED_KEY = 'encountered_player_resolution_enabled'
const DEFAULT_ENABLED = true

const CACHE_TTL_MS = 30_000

type CachedValue<T> = {
  value: T
  expiresAt: number
}

let cachedBatchSize: CachedValue<number> | null = null
let cachedEnabled: CachedValue<boolean> | null = null

function clampBatchSize(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE
  }

  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, Math.floor(value)))
}

function parseBatchSize(raw: string | null | undefined) {
  if (!raw) {
    return null
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return clampBatchSize(parsed)
}

function getEnvBatchSize() {
  return parseBatchSize(process.env.ENCOUNTERED_PLAYER_RESOLUTION_BATCH_SIZE) ?? DEFAULT_BATCH_SIZE
}

export async function getEncounteredPlayerResolutionBatchSize() {
  const now = Date.now()
  if (cachedBatchSize && cachedBatchSize.expiresAt > now) {
    return cachedBatchSize.value
  }

  try {
    const record = await prisma.appConfig.findUnique({
      where: { key: BATCH_SIZE_KEY },
      select: { value: true },
    })

    const value = parseBatchSize(record?.value) ?? getEnvBatchSize()
    cachedBatchSize = { value, expiresAt: now + CACHE_TTL_MS }
    return value
  } catch {
    const fallback = getEnvBatchSize()
    cachedBatchSize = { value: fallback, expiresAt: now + CACHE_TTL_MS }
    return fallback
  }
}

export async function setEncounteredPlayerResolutionBatchSize(nextBatchSize: number) {
  const value = clampBatchSize(nextBatchSize)

  await prisma.appConfig.upsert({
    where: { key: BATCH_SIZE_KEY },
    update: { value: String(value) },
    create: { key: BATCH_SIZE_KEY, value: String(value) },
  })

  cachedBatchSize = { value, expiresAt: Date.now() + CACHE_TTL_MS }
  return value
}

export function getEncounteredPlayerResolutionBatchSizeBounds() {
  return {
    min: MIN_BATCH_SIZE,
    max: MAX_BATCH_SIZE,
    defaultValue: DEFAULT_BATCH_SIZE,
  }
}

function parseEnabled(raw: string | null | undefined) {
  if (raw === 'true') {
    return true
  }

  if (raw === 'false') {
    return false
  }

  return null
}

function getEnvEnabled() {
  return parseEnabled(process.env.ENCOUNTERED_PLAYER_RESOLUTION_ENABLED) ?? DEFAULT_ENABLED
}

export async function isEncounteredPlayerResolutionEnabled() {
  const now = Date.now()
  if (cachedEnabled && cachedEnabled.expiresAt > now) {
    return cachedEnabled.value
  }

  try {
    const record = await prisma.appConfig.findUnique({
      where: { key: ENABLED_KEY },
      select: { value: true },
    })

    const value = parseEnabled(record?.value) ?? getEnvEnabled()
    cachedEnabled = { value, expiresAt: now + CACHE_TTL_MS }
    return value
  } catch {
    const fallback = getEnvEnabled()
    cachedEnabled = { value: fallback, expiresAt: now + CACHE_TTL_MS }
    return fallback
  }
}

export async function setEncounteredPlayerResolutionEnabled(nextEnabled: boolean) {
  await prisma.appConfig.upsert({
    where: { key: ENABLED_KEY },
    update: { value: String(nextEnabled) },
    create: { key: ENABLED_KEY, value: String(nextEnabled) },
  })

  cachedEnabled = { value: nextEnabled, expiresAt: Date.now() + CACHE_TTL_MS }
  return nextEnabled
}
