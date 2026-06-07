import type { ParsedTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'

type BuildTelemetrySuccessBasePayloadInput = {
  parserVersion: string
  parsedAt: Date
  telemetryGeneratedAt: string | null
  contentLength: number | null
  bytesDownloaded: number
}

export function normalizeErrorMessage(value: string) {
  const trimmed = value.trim()
  if (trimmed.length <= 4000) {
    return trimmed
  }

  return `${trimmed.slice(0, 3997)}...`
}

export function isTelemetryJsonFieldUnsupportedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Unknown argument `summary`') ||
    message.includes('Unknown argument `weaponStats`') ||
    message.includes('Unknown argument `memberStats`') ||
    message.includes('Unknown argument `positionSamples`') ||
    message.includes('Unknown argument `trajectorySegments`') ||
    message.includes('Unknown argument `deathSamples`') ||
    message.includes('Unknown argument `landingSamples`') ||
    message.includes('summary does not exist') ||
    message.includes('weaponStats does not exist') ||
    message.includes('memberStats does not exist') ||
    message.includes('positionSamples does not exist') ||
    message.includes('trajectorySegments does not exist') ||
    message.includes('deathSamples does not exist') ||
    message.includes('landingSamples does not exist')
  )
}

export function buildTelemetrySuccessBasePayload(input: BuildTelemetrySuccessBasePayloadInput) {
  return {
    status: 'success' as const,
    attemptCount: 0,
    lastAttemptAt: input.parsedAt,
    nextRetryAt: null,
    parserVersion: input.parserVersion,
    parsedAt: input.parsedAt,
    sourceGeneratedAt: input.telemetryGeneratedAt
      ? new Date(input.telemetryGeneratedAt)
      : null,
    contentLength: input.contentLength,
    bytesDownloaded: input.bytesDownloaded,
    errorCode: null,
    errorMessage: null,
  }
}

export function buildTelemetrySuccessPayloadWithJson(
  basePayload: ReturnType<typeof buildTelemetrySuccessBasePayload>,
  parsed: ParsedTelemetrySnapshot
) {
  return {
    ...basePayload,
    summary: parsed.summary,
    weaponStats: parsed.weaponStats,
    memberStats: parsed.memberStats,
    positionSamples: parsed.positionSamples,
    trajectorySegments: parsed.trajectorySegments,
    deathSamples: parsed.deathSamples,
    landingSamples: parsed.landingSamples,
    phaseSnapshots: parsed.phaseSnapshots,
  }
}
