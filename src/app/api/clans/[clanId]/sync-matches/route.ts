import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { fetchMatchDetails, fetchRecentMatchIds, searchPlayerByName } from '@/lib/pubg'
import { analyzeMatchForSquads } from '@/lib/squad-detector'

function createMatchRecordId(memberId: number, matchId: string) {
  return `${memberId}-${matchId}`
}

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)

  if (!parsedClanId) {
    return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const logs: string[] = []
  const errors: string[] = []
  let importedCount = 0

  try {
    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: {
        id: true,
        name: true,
        members: {
          where: { isActive: true },
          orderBy: { id: 'asc' },
        },
      },
    })

    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const startedAt = new Date()

    console.info(
      `[Clan Sync] Starting clan sync for "${clan.name}" (${clan.id}) at ${startedAt.toISOString()}`
    )

    if (clan.members.length === 0) {
      return NextResponse.json({
        clanId: clan.id,
        clanName: clan.name,
        startedAt: startedAt.toISOString(),
        finishedAt: startedAt.toISOString(),
        importedCount: 0,
        importedMatches: 0,
        membersProcessed: 0,
        errors: [],
        logs: [],
        message: 'No active members found',
      })
    }

    for (const member of clan.members) {
      try {
        let playerId = member.pubgAccountId

        if (!playerId) {
          try {
            const player = await searchPlayerByName(member.pubgPlayerName, member.platformShard)
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
          allMatchIds = await fetchRecentMatchIds(playerId, member.platformShard)
        } catch (err) {
          const msg = `Member ${member.displayName}: failed to fetch match IDs — ${err instanceof Error ? err.message : String(err)}`
          errors.push(msg)
          continue
        }

        const importedMatches = await prisma.match.findMany({
          where: { memberId: member.id },
          select: { pubgMatchId: true },
        })
        const importedMatchIds = new Set(importedMatches.map((match) => match.pubgMatchId))
        const newMatchIds = allMatchIds.filter((matchId) => !importedMatchIds.has(matchId))

        logs.push(
          `Member ${member.displayName}: ${newMatchIds.length} new match(es) out of ${allMatchIds.length} total`
        )

        for (const matchId of newMatchIds) {
          try {
            const matchDetails = await fetchMatchDetails(matchId, playerId, member.platformShard)

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

            const detectedSquad = await analyzeMatchForSquads(clan.id, matchDetails)

            if (detectedSquad) {
              logs.push(
                `Squad detected for match ${matchDetails.id}: ${detectedSquad.members.length} clan member(s)`
              )
            }

            importedCount += 1
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

    const finishedAt = new Date()
    const payload = {
      clanId: clan.id,
      clanName: clan.name,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      importedCount,
      importedMatches: importedCount,
      membersProcessed: clan.members.length,
      status: errors.length > 0 ? 'partial' : 'success',
      errorsCount: errors.length,
      errorsPreview: errors.slice(0, 5),
      errors,
      logs,
    }

    console.info(
      `[Clan Sync] Finished clan sync for "${clan.name}" (${clan.id}) at ${finishedAt.toISOString()} - members: ${clan.members.length}, imported matches: ${importedCount}, errors: ${errors.length}`
    )

    if (errors.length > 0) {
      console.warn(
        `[Clan Sync] Partial result for "${clan.name}" (${clan.id}): imported=${importedCount}, errors=${errors.length}, firstError=${errors[0]}`
      )
      logs.push(
        `[Summary] Partial sync: imported=${importedCount}, errors=${errors.length}`
      )
    } else {
      logs.push(`[Summary] Successful sync: imported=${importedCount}, errors=0`)
    }

    return NextResponse.json(payload)
  } catch (err) {
    console.error('Error syncing matches:', err)
    return NextResponse.json(
      { error: 'Failed to synchronize clan matches' },
      { status: 500 }
    )
  }
}
