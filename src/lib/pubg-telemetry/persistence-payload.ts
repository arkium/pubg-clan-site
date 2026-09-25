import { Prisma } from '@prisma/client'

import { encodeJsonColumn } from '@/lib/pubg-telemetry/json-codec'
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
    message.includes('Unknown argument `phaseSnapshots`') ||
    message.includes('Unknown argument `killSamples`') ||
    message.includes('Unknown argument `shotSamples`') ||
    message.includes('Unknown argument `damageSamples`') ||
    message.includes('Unknown argument `knockoutSamples`') ||
    message.includes('Unknown argument `reviveSamples`') ||
    message.includes('Unknown argument `vehicleSamples`') ||
    message.includes('Unknown argument `killFeedSamples`') ||
    message.includes('Unknown argument `carePackageSamples`') ||
    message.includes('summary does not exist') ||
    message.includes('weaponStats does not exist') ||
    message.includes('memberStats does not exist') ||
    message.includes('positionSamples does not exist') ||
    message.includes('trajectorySegments does not exist') ||
    message.includes('deathSamples does not exist') ||
    message.includes('landingSamples does not exist') ||
    message.includes('phaseSnapshots does not exist') ||
    message.includes('killSamples does not exist') ||
    message.includes('shotSamples does not exist') ||
    message.includes('damageSamples does not exist') ||
    message.includes('knockoutSamples does not exist') ||
    message.includes('reviveSamples does not exist') ||
    message.includes('vehicleSamples does not exist') ||
    message.includes('killFeedSamples does not exist') ||
    message.includes('carePackageSamples does not exist')
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

// Converts NaN/Infinity/undefined within nested structures to null so Prisma's Rust
// engine never receives non-JSON-serializable numbers when writing Json? fields.
function sanitizeJsonForPrisma(value: unknown): unknown {
  if (value === null || value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

export function buildTelemetrySuccessPayloadWithJson(
  basePayload: ReturnType<typeof buildTelemetrySuccessBasePayload>,
  parsed: ParsedTelemetrySnapshot
) {
  return {
    ...basePayload,
    // `summary` reste en clair : cinq routes l'interrogent en SQL par JSON_EXTRACT.
    summary: sanitizeJsonForPrisma(parsed.summary),
    // Tout le reste part compressé (~7 à 9×), les colonnes en clair à NULL. Aucune lecture ne doit
    // les toucher directement : `decodeTelemetryRow` s'en charge, et accepte encore l'ancien
    // format le temps du rattrapage (src/lib/pubg-telemetry/json-codec.ts).
    weaponStats: Prisma.DbNull,
    memberStats: Prisma.DbNull,
    positionSamples: Prisma.DbNull,
    trajectorySegments: Prisma.DbNull,
    deathSamples: Prisma.DbNull,
    landingSamples: Prisma.DbNull,
    phaseSnapshots: Prisma.DbNull,
    killSamples: Prisma.DbNull,
    shotSamples: Prisma.DbNull,
    damageSamples: Prisma.DbNull,
    knockoutSamples: Prisma.DbNull,
    reviveSamples: Prisma.DbNull,
    vehicleSamples: Prisma.DbNull,
    killFeedSamples: Prisma.DbNull,
    carePackageSamples: Prisma.DbNull,
    weaponStatsGz: encodeJsonColumn(parsed.weaponStats),
    memberStatsGz: encodeJsonColumn(parsed.memberStats),
    positionSamplesGz: encodeJsonColumn(parsed.positionSamples),
    trajectorySegmentsGz: encodeJsonColumn(parsed.trajectorySegments),
    deathSamplesGz: encodeJsonColumn(parsed.deathSamples),
    landingSamplesGz: encodeJsonColumn(parsed.landingSamples),
    phaseSnapshotsGz: encodeJsonColumn(parsed.phaseSnapshots),
    killSamplesGz: encodeJsonColumn(parsed.killSamples),
    shotSamplesGz: encodeJsonColumn(parsed.shotSamples),
    damageSamplesGz: encodeJsonColumn(parsed.damageSamples),
    knockoutSamplesGz: encodeJsonColumn(parsed.knockoutSamples),
    reviveSamplesGz: encodeJsonColumn(parsed.reviveSamples),
    vehicleSamplesGz: encodeJsonColumn(parsed.vehicleSamples),
    killFeedSamplesGz: encodeJsonColumn(parsed.killFeedSamples),
    carePackageSamplesGz: encodeJsonColumn(parsed.carePackageSamples ?? []),
  }
}
