import 'server-only'

import { fetchMatchDetailsWithTelemetryAsset } from '@/lib/pubg'
import { downloadTelemetryFromAsset } from '@/lib/pubg-telemetry/client'
import { prisma } from '@/lib/prisma'

type ManualTelemetrySyncItemResult = {
  squadMatchId: string
  pubgMatchId: string
  status: 'success' | 'failed'
  bytesDownloaded: number
  contentLength: number | null
  errorCode: string | null
  errorMessage: string | null
}

export type ManualTelemetrySyncResult = {
  requestedCount: number
  selectedCount: number
  processedCount: number
  successCount: number
  failedCount: number
  skippedCount: number
  results: ManualTelemetrySyncItemResult[]
}

function getTelemetryTimeoutMs() {
  const value = Number(process.env.TELEMETRY_FETCH_TIMEOUT_MS ?? '30000')
  if (!Number.isFinite(value) || value <= 0) {
    return 30000
  }

  return Math.floor(value)
}

function getTelemetryMaxAssetSizeBytes() {
  const valueMb = Number(process.env.TELEMETRY_MAX_ASSET_SIZE_MB ?? '250')
  if (!Number.isFinite(valueMb) || valueMb <= 0) {
    return 250 * 1024 * 1024
  }

  return Math.floor(valueMb * 1024 * 1024)
}

function getTelemetryParserVersion() {
  const raw = process.env.TELEMETRY_PARSER_VERSION?.trim()
  return raw && raw.length > 0 ? raw : 'v1'
}

async function consumeStreamAndCountBytes(stream: ReadableStream<Uint8Array>, maxBytes: number) {
  const reader = stream.getReader()
  let total = 0

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }

      total += chunk.value.byteLength

      if (total > maxBytes) {
        throw new Error(`Telemetry asset exceeded max size while streaming (${total} bytes)`)
      }
    }

    return total
  } finally {
    reader.releaseLock()
  }
}

function sanitizeSquadMatchIds(ids: string[]) {
  const unique = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0)))
  return unique.slice(0, 50)
}

export async function syncTelemetryForSelectedSquadMatches(
  clanId: number,
  squadMatchIds: string[]
): Promise<ManualTelemetrySyncResult> {
  const sanitizedIds = sanitizeSquadMatchIds(squadMatchIds)

  if (sanitizedIds.length === 0) {
    return {
      requestedCount: squadMatchIds.length,
      selectedCount: 0,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: [],
    }
  }

  const matches = await prisma.squadMatch.findMany({
    where: {
      id: { in: sanitizedIds },
      members: {
        some: {
          member: {
            clanId,
          },
        },
      },
    },
    include: {
      members: {
        include: {
          member: {
            select: {
              id: true,
              pubgAccountId: true,
              platformShard: true,
            },
          },
        },
        orderBy: {
          memberId: 'asc',
        },
      },
    },
  })

  const timeoutMs = getTelemetryTimeoutMs()
  const maxAssetSizeBytes = getTelemetryMaxAssetSizeBytes()
  const parserVersion = getTelemetryParserVersion()

  const foundIds = new Set(matches.map((match) => match.id))
  const missingIds = sanitizedIds.filter((id) => !foundIds.has(id))

  const results: ManualTelemetrySyncItemResult[] = []

  for (const missingId of missingIds) {
    results.push({
      squadMatchId: missingId,
      pubgMatchId: 'unknown',
      status: 'failed',
      bytesDownloaded: 0,
      contentLength: null,
      errorCode: 'SQUAD_MATCH_NOT_FOUND',
      errorMessage: 'Squad match not found for this clan',
    })
  }

  for (const match of matches) {
    const candidateMember = match.members.find((entry) => !!entry.member.pubgAccountId)

    if (!candidateMember?.member.pubgAccountId) {
      await prisma.squadMatchTelemetry.upsert({
        where: { squadMatchId: match.id },
        update: {
          status: 'failed',
          parserVersion,
          parsedAt: new Date(),
          sourceGeneratedAt: null,
          contentLength: null,
          bytesDownloaded: 0,
          errorCode: 'PUBG_ACCOUNT_ID_MISSING',
          errorMessage: 'No clan member with PUBG account id found for this squad match',
        },
        create: {
          squadMatchId: match.id,
          status: 'failed',
          parserVersion,
          parsedAt: new Date(),
          sourceGeneratedAt: null,
          contentLength: null,
          bytesDownloaded: 0,
          errorCode: 'PUBG_ACCOUNT_ID_MISSING',
          errorMessage: 'No clan member with PUBG account id found for this squad match',
        },
      })

      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'failed',
        bytesDownloaded: 0,
        contentLength: null,
        errorCode: 'PUBG_ACCOUNT_ID_MISSING',
        errorMessage: 'No clan member with PUBG account id found for this squad match',
      })
      continue
    }

    try {
      const matchDetails = await fetchMatchDetailsWithTelemetryAsset(
        match.pubgMatchId,
        candidateMember.member.pubgAccountId,
        candidateMember.member.platformShard
      )

      if (!matchDetails.telemetryAssetUrl) {
        await prisma.squadMatchTelemetry.upsert({
          where: { squadMatchId: match.id },
          update: {
            status: 'failed',
            parserVersion,
            parsedAt: new Date(),
            sourceGeneratedAt: matchDetails.telemetryGeneratedAt
              ? new Date(matchDetails.telemetryGeneratedAt)
              : null,
            contentLength: null,
            bytesDownloaded: 0,
            errorCode: 'ASSET_URL_MISSING',
            errorMessage: 'No telemetry asset URL returned by PUBG API for this match',
          },
          create: {
            squadMatchId: match.id,
            status: 'failed',
            parserVersion,
            parsedAt: new Date(),
            sourceGeneratedAt: matchDetails.telemetryGeneratedAt
              ? new Date(matchDetails.telemetryGeneratedAt)
              : null,
            contentLength: null,
            bytesDownloaded: 0,
            errorCode: 'ASSET_URL_MISSING',
            errorMessage: 'No telemetry asset URL returned by PUBG API for this match',
          },
        })

        results.push({
          squadMatchId: match.id,
          pubgMatchId: match.pubgMatchId,
          status: 'failed',
          bytesDownloaded: 0,
          contentLength: null,
          errorCode: 'ASSET_URL_MISSING',
          errorMessage: 'No telemetry asset URL returned by PUBG API for this match',
        })
        continue
      }

      const downloaded = await downloadTelemetryFromAsset(matchDetails.telemetryAssetUrl, {
        timeoutMs,
        maxAssetSizeBytes,
      })

      const bytesDownloaded = await consumeStreamAndCountBytes(downloaded.stream, maxAssetSizeBytes)

      await prisma.squadMatchTelemetry.upsert({
        where: { squadMatchId: match.id },
        update: {
          status: 'success',
          parserVersion,
          parsedAt: new Date(),
          sourceGeneratedAt: matchDetails.telemetryGeneratedAt
            ? new Date(matchDetails.telemetryGeneratedAt)
            : null,
          contentLength: downloaded.contentLength,
          bytesDownloaded,
          errorCode: null,
          errorMessage: null,
        },
        create: {
          squadMatchId: match.id,
          status: 'success',
          parserVersion,
          parsedAt: new Date(),
          sourceGeneratedAt: matchDetails.telemetryGeneratedAt
            ? new Date(matchDetails.telemetryGeneratedAt)
            : null,
          contentLength: downloaded.contentLength,
          bytesDownloaded,
          errorCode: null,
          errorMessage: null,
        },
      })

      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'success',
        bytesDownloaded,
        contentLength: downloaded.contentLength,
        errorCode: null,
        errorMessage: null,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      await prisma.squadMatchTelemetry.upsert({
        where: { squadMatchId: match.id },
        update: {
          status: 'failed',
          parserVersion,
          parsedAt: new Date(),
          sourceGeneratedAt: null,
          contentLength: null,
          bytesDownloaded: 0,
          errorCode: 'TELEMETRY_SYNC_FAILED',
          errorMessage: message,
        },
        create: {
          squadMatchId: match.id,
          status: 'failed',
          parserVersion,
          parsedAt: new Date(),
          sourceGeneratedAt: null,
          contentLength: null,
          bytesDownloaded: 0,
          errorCode: 'TELEMETRY_SYNC_FAILED',
          errorMessage: message,
        },
      })

      results.push({
        squadMatchId: match.id,
        pubgMatchId: match.pubgMatchId,
        status: 'failed',
        bytesDownloaded: 0,
        contentLength: null,
        errorCode: 'TELEMETRY_SYNC_FAILED',
        errorMessage: message,
      })
    }
  }

  const successCount = results.filter((item) => item.status === 'success').length
  const failedCount = results.length - successCount

  return {
    requestedCount: squadMatchIds.length,
    selectedCount: sanitizedIds.length,
    processedCount: results.length,
    successCount,
    failedCount,
    skippedCount: Math.max(0, squadMatchIds.length - sanitizedIds.length),
    results,
  }
}
