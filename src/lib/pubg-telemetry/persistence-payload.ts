import { Prisma } from '@prisma/client'

import { encodeGeoColumn } from '@/lib/pubg-telemetry/geo-codec'
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
    summary: sanitizeJsonForPrisma(parsed.summary),
    weaponStats: sanitizeJsonForPrisma(parsed.weaponStats),
    memberStats: sanitizeJsonForPrisma(parsed.memberStats),
    // Geolocalisation : ecrite compressee (~8x), la colonne en clair reste vide. Toute lecture
    // passe par `decodeGeoColumn`, qui accepte encore l'ancien format le temps du rattrapage.
    positionSamples: Prisma.DbNull,
    trajectorySegments: Prisma.DbNull,
    positionSamplesGz: encodeGeoColumn(parsed.positionSamples),
    trajectorySegmentsGz: encodeGeoColumn(parsed.trajectorySegments),
    deathSamples: sanitizeJsonForPrisma(parsed.deathSamples),
    landingSamples: sanitizeJsonForPrisma(parsed.landingSamples),
    phaseSnapshots: sanitizeJsonForPrisma(parsed.phaseSnapshots),
    killSamples: sanitizeJsonForPrisma(parsed.killSamples),
    shotSamples: sanitizeJsonForPrisma(parsed.shotSamples),
    damageSamples: sanitizeJsonForPrisma(parsed.damageSamples),
    knockoutSamples: sanitizeJsonForPrisma(parsed.knockoutSamples),
    reviveSamples: sanitizeJsonForPrisma(parsed.reviveSamples),
    vehicleSamples: sanitizeJsonForPrisma(parsed.vehicleSamples),
    killFeedSamples: sanitizeJsonForPrisma(parsed.killFeedSamples),
    carePackageSamples: sanitizeJsonForPrisma(parsed.carePackageSamples ?? []),
  }
}
