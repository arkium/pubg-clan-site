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
    members: match.members,
  }))
}
