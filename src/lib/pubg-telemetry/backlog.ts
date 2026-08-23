import { prisma } from '@/lib/prisma'

export type TelemetryBacklogMember = {
  memberId: number
  member: {
    id: number
    clanId: number | null
    pubgAccountId: string | null
    platformShard: string
  }
}

export type TelemetryBacklogMatch = {
  id: string
  pubgMatchId: string
  members: TelemetryBacklogMember[]
  telemetry: {
    status: 'success' | 'failed' | 'pending'
    parserVersion: string | null
    attemptCount: number
    nextRetryAt: Date | null
  } | null
}

type ListSquadMatchesNeedingTelemetryOptions = {
  clanId?: number
  parserVersion?: string
  retryMax?: number
}

function normalizeRetryMax(retryMax?: number) {
  if (typeof retryMax !== 'number' || !Number.isFinite(retryMax) || retryMax < 0) {
    return null
  }

  return Math.min(Math.floor(retryMax), 5)
}

function normalizeLimit(limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 20
  }

  return Math.min(Math.floor(limit), 200)
}

export async function listSquadMatchesNeedingTelemetry(
  limit: number,
  options: ListSquadMatchesNeedingTelemetryOptions = {}
): Promise<TelemetryBacklogMatch[]> {
  const parserVersion = options.parserVersion?.trim() ?? null
  const retryMax = normalizeRetryMax(options.retryMax)

  const whereClause = {
    AND: [
      {
        OR: [
          {
            telemetry: null,
          },
          {
            telemetry: {
              is: {
                status: 'failed',
                ...(retryMax !== null
                  ? {
                      attemptCount: {
                        lt: retryMax,
                      },
                    }
                  : {}),
                OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
              },
            },
          },
          ...(parserVersion
            ? [
                {
                  telemetry: {
                    is: {
                      parserVersion: {
                        not: parserVersion,
                      },
                    },
                  },
                },
              ]
            : []),
        ],
      },
      {
        // A match whose telemetry (or the match itself) is confirmed gone for good
        // past PUBG's ~14-15 day retention window never becomes available again —
        // exclude it permanently, regardless of attemptCount/retryMax or a parser
        // version bump above (retrying would just waste API calls on a certain 404).
        OR: [{ telemetry: null }, { telemetry: { is: { errorCode: { not: 'TELEMETRY_DATA_EXPIRED' } } } }],
      },
      {
        matchType: {
          not: 'airoyale', // We do not want telemetry for Casual matches
        },
      },
    ],
    ...(typeof options.clanId === 'number'
      ? {
          members: {
            some: {
              member: {
                clanId: options.clanId,
              },
            },
          },
        }
      : {}),
  }

  const matches = await prisma.squadMatch.findMany({
    where: whereClause,
    orderBy: {
      createdAt: 'desc',
    },
    take: normalizeLimit(limit),
    include: {
      telemetry: {
        select: {
          status: true,
          parserVersion: true,
          attemptCount: true,
          nextRetryAt: true,
        },
      },
      members: {
        include: {
          member: {
            select: {
              id: true,
              clanId: true,
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

  return matches.map((match) => ({
    id: match.id,
    pubgMatchId: match.pubgMatchId,
    telemetry: match.telemetry
      ? {
          status:
            match.telemetry.status === 'success' || match.telemetry.status === 'failed'
              ? match.telemetry.status
              : 'pending',
          parserVersion: match.telemetry.parserVersion,
          attemptCount: match.telemetry.attemptCount,
          nextRetryAt: match.telemetry.nextRetryAt,
        }
      : null,
    members: match.members,
  }))
}
