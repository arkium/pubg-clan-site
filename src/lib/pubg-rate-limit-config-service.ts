import { prisma } from '@/lib/prisma'

const PUBG_API_RPM_KEY = 'pubg_api_rate_limit_rpm'
const DEFAULT_PUBG_API_RPM = 10
const MIN_PUBG_API_RPM = 1
const MAX_PUBG_API_RPM = 300
const CACHE_TTL_MS = 30_000

type CachedRateLimit = {
  value: number
  expiresAt: number
}

let cachedRateLimit: CachedRateLimit | null = null

function clampRpm(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_PUBG_API_RPM
  }

  return Math.min(MAX_PUBG_API_RPM, Math.max(MIN_PUBG_API_RPM, Math.floor(value)))
}

function parseRpm(raw: string | null | undefined) {
  if (!raw) {
    return null
  }

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return clampRpm(parsed)
}

function getEnvRpm() {
  return parseRpm(process.env.PUBG_API_RATE_LIMIT_RPM) ?? DEFAULT_PUBG_API_RPM
}

export async function getPubgApiRateLimitRpm() {
  const now = Date.now()
  if (cachedRateLimit && cachedRateLimit.expiresAt > now) {
    return cachedRateLimit.value
  }

  try {
    const record = await prisma.appConfig.findUnique({
      where: { key: PUBG_API_RPM_KEY },
      select: { value: true },
    })

    const value = parseRpm(record?.value) ?? getEnvRpm()
    cachedRateLimit = {
      value,
      expiresAt: now + CACHE_TTL_MS,
    }

    return value
  } catch {
    const fallback = getEnvRpm()
    cachedRateLimit = {
      value: fallback,
      expiresAt: now + CACHE_TTL_MS,
    }

    return fallback
  }
}

export async function setPubgApiRateLimitRpm(nextRpm: number) {
  const value = clampRpm(nextRpm)

  await prisma.appConfig.upsert({
    where: { key: PUBG_API_RPM_KEY },
    update: { value: String(value) },
    create: { key: PUBG_API_RPM_KEY, value: String(value) },
  })

  cachedRateLimit = {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  }

  return value
}

export function getPubgApiRateLimitBounds() {
  return {
    min: MIN_PUBG_API_RPM,
    max: MAX_PUBG_API_RPM,
    defaultValue: DEFAULT_PUBG_API_RPM,
  }
}
