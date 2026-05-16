import { prisma } from '@/lib/prisma'
import { ApiQueue } from '@/lib/api-throttle'
import { fetchMatchDetails, fetchRecentMatchIds, searchPlayerByName } from '@/lib/pubg'
import { NextRequest, NextResponse } from 'next/server'

function createMatchRecordId(memberId: number, matchId: string) {
  return `${memberId}-${matchId}`
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ clanId: string }> }
) {
  // clanId is reserved for future use when a Clan model is added.
  // Currently all active ClanMember records belong to a single clan.
  await params

  const queue = new ApiQueue()
  const logs: string[] = []
  const errors: string[] = []
  let importedCount = 0

  try {
    const members = await prisma.clanMember.findMany({
      where: { isActive: true },
    })

    if (members.length === 0) {
      return NextResponse.json({
        importedCount: 0,
        membersProcessed: 0,
        errors: [],
        logs: [],
        message: 'No active members found',
      })
    }

    for (const member of members) {
      try {
        let playerId = member.pubgAccountId

        if (!playerId) {
          try {
            const player = await queue.add(() =>
              searchPlayerByName(member.pubgPlayerName, member.platformShard)
            )
            if (!player) {
              const msg = `Member ${member.displayName}: player not found in PUBG API`
              errors.push(msg)
              continue
            }
            playerId = player.accountId
            await prisma.clanMember.update({
              where: { id: member.id },
              data: { pubgAccountId: playerId },
            })
          } catch (err) {
            const msg = `Member ${member.displayName}: failed to resolve player ID — ${err instanceof Error ? err.message : String(err)}`
            errors.push(msg)
            continue
          }
        }

        let allMatchIds: string[]
        try {
          allMatchIds = await queue.add(() =>
            fetchRecentMatchIds(playerId!, member.platformShard)
          )
        } catch (err) {
          const msg = `Member ${member.displayName}: failed to fetch match IDs — ${err instanceof Error ? err.message : String(err)}`
          errors.push(msg)
          continue
        }

        const importedMatches = await prisma.match.findMany({
          where: { memberId: member.id },
          select: { pubgMatchId: true },
        })
        const importedMatchIds = new Set(importedMatches.map((m) => m.pubgMatchId))
        const newMatchIds = allMatchIds.filter((id) => !importedMatchIds.has(id))

        logs.push(
          `Member ${member.displayName}: ${newMatchIds.length} new match(es) out of ${allMatchIds.length} total`
        )

        for (const matchId of newMatchIds) {
          try {
            const matchDetails = await queue.add(() =>
              fetchMatchDetails(matchId, playerId!, member.platformShard)
            )

            const matchData = {
              id: createMatchRecordId(member.id, matchDetails.id),
              memberId: member.id,
              pubgMatchId: matchDetails.id,
              gameMode: matchDetails.gameMode,
              mapName: matchDetails.mapName,
              kills: matchDetails.stats.kills,
              knockouts: matchDetails.stats.knockouts,
              assists: matchDetails.stats.assists,
              damageDealt: matchDetails.stats.damageDealt,
              headshotKills: matchDetails.stats.headshotKills,
              revives: matchDetails.stats.revives,
              placement: matchDetails.stats.position,
              playersAlive: 0,
              duration: matchDetails.durationSeconds,
              pubgCreatedAt: new Date(matchDetails.createdAt),
            }

            await prisma.match.upsert({
              where: {
                memberId_pubgMatchId: {
                  memberId: member.id,
                  pubgMatchId: matchDetails.id,
                },
              },
              update: {
                gameMode: matchData.gameMode,
                mapName: matchData.mapName,
                kills: matchData.kills,
                knockouts: matchData.knockouts,
                assists: matchData.assists,
                damageDealt: matchData.damageDealt,
                headshotKills: matchData.headshotKills,
                revives: matchData.revives,
                placement: matchData.placement,
                playersAlive: matchData.playersAlive,
                duration: matchData.duration,
                pubgCreatedAt: matchData.pubgCreatedAt,
              },
              create: matchData,
            })

            importedCount++
          } catch (err) {
            const msg = `Member ${member.displayName}, match ${matchId}: ${err instanceof Error ? err.message : String(err)}`
            errors.push(msg)
          }
        }
      } catch (err) {
        const msg = `Member ${member.displayName}: unexpected error — ${err instanceof Error ? err.message : String(err)}`
        errors.push(msg)
      }
    }

    logs.push(...queue.getLogs())

    return NextResponse.json({
      importedCount,
      membersProcessed: members.length,
      errors,
      logs,
    })
  } catch (err) {
    console.error('Error syncing matches:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
