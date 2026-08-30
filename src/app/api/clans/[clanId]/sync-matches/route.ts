import { NextResponse } from 'next/server'

import { captureEncounteredPlayers, countBotsInMatch } from '@/lib/encountered-players'
import { isInternalCronRequest } from '@/lib/internal-api'
import { prisma } from '@/lib/prisma'
import { fetchAllRecentMatchIds, fetchMatchDetails, fetchRecentMatchIds, searchPlayerByName } from '@/lib/pubg'
import { analyzeMatchForSquads } from '@/lib/squad-detector'
import { getActorMemberId, requirePermission } from '@/middleware/auth-permission'

function createMatchRecordId(memberId: number, matchId: string) {
  return `${memberId}-${matchId}`
}

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function isMissingMatchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('API request failed (404)') && message.includes('/matches/')
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  const parsedClanId = parseClanId(clanId)

  if (!parsedClanId) {
    return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  if (!isInternalCronRequest(request)) {
    const roleError = await requirePermission('manage_settings')(request, {
      clanId: parsedClanId,
    })

    if (roleError) {
      return roleError
    }
  }

  const body = (await request.json().catch(() => null)) as { memberId?: unknown } | null
  const requestedMemberId = typeof body?.memberId === 'number' && Number.isInteger(body.memberId) && body.memberId > 0
    ? body.memberId
    : null

  if (requestedMemberId && !isInternalCronRequest(request)) {
    const actorMemberId = await getActorMemberId(request)
    if (actorMemberId !== requestedMemberId) {
      return NextResponse.json({ error: 'A member can only synchronize their own matches' }, { status: 403 })
    }
  }

  const logs: string[] = []
  const errors: string[] = []
  const skipped: string[] = []
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

    const membersToSync = requestedMemberId
      ? clan.members.filter((member) => member.id === requestedMemberId)
      : clan.members

    if (membersToSync.length === 0) {
      return NextResponse.json({ error: 'Active member not found in this clan' }, { status: 404 })
    }

    const clanAccountIds = new Set(
      clan.members
        .map((member) => member.pubgAccountId)
        .filter((accountId): accountId is string => Boolean(accountId))
    )

    // newMatchIds est calculé par membre (memberId + pubgMatchId) — un même
    // match joué par plusieurs membres du clan apparaît donc comme "nouveau"
    // pour chacun d'eux séparément. captureEncounteredPlayers ne doit tourner
    // qu'une fois par vrai match (pubgMatchId), pas une fois par membre présent,
    // sinon les compteurs de croisement sont gonflés d'un facteur = nb de
    // membres du clan dans ce match.
    const capturedEncounterMatchIds = new Set<string>()

    for (const member of membersToSync) {
      try {
        let playerId = member.pubgAccountId

        if (!playerId) {
          try {
            const player = await searchPlayerByName(member.pubgPlayerName, member.platformShard, {
              clanId: clan.id,
              memberId: member.id,
            })
            if (!player) {
              const msg = `Member ${member.displayName}: player not found in PUBG API`
              errors.push(msg)
              continue
            }
            playerId = player.accountId
            clanAccountIds.add(playerId)
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
          // Fusion de deux sources : /seasons/lifetime (matchmaking classe) et
          // /players/{id} (referme aussi matchType='custom', necessaire aux
          // tournois inter-clans - voir docs/TODO/todo.md "Idees - Tournois").
          const [seasonMatchIds, allTimeMatchIds] = await Promise.all([
            fetchRecentMatchIds(playerId, member.platformShard, {
              clanId: clan.id,
              memberId: member.id,
            }),
            fetchAllRecentMatchIds(playerId, member.platformShard, {
              clanId: clan.id,
              memberId: member.id,
            }),
          ])
          allMatchIds = Array.from(new Set([...seasonMatchIds, ...allTimeMatchIds]))
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
            const matchDetails = await fetchMatchDetails(matchId, playerId, member.platformShard, {
              clanId: clan.id,
              memberId: member.id,
            })

            const matchData = {
              id: createMatchRecordId(member.id, matchDetails.id),
              memberId: member.id,
              pubgMatchId: matchDetails.id,
              gameMode: matchDetails.gameMode,
              matchType: matchDetails.matchType,
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
              botCount: countBotsInMatch(matchDetails),
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
                matchType: matchData.matchType,
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
                botCount: matchData.botCount,
              },
              create: matchData,
            })

            const detectedSquad = await analyzeMatchForSquads(clan.id, matchDetails)

            if (detectedSquad) {
              logs.push(
                `Squad detected for match ${matchDetails.id}: ${detectedSquad.members.length} clan member(s)`
              )
            }

            if (!capturedEncounterMatchIds.has(matchDetails.id)) {
              capturedEncounterMatchIds.add(matchDetails.id)

              try {
                await captureEncounteredPlayers(clan.id, matchDetails, member.platformShard, clanAccountIds)
              } catch (encounterError) {
                console.warn(
                  `[Clan Sync] Failed to capture encountered players for match ${matchDetails.id}`,
                  encounterError
                )
              }
            }

            importedCount += 1
          } catch (err) {
            if (isMissingMatchError(err)) {
              const skipMsg = `Member ${member.displayName}, match ${matchId}: skipped (match introuvable sur l'API PUBG)`
              skipped.push(skipMsg)
              logs.push(skipMsg)
              continue
            }

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
      membersProcessed: membersToSync.length,
      status: errors.length > 0 ? 'partial' : 'success',
      errorsCount: errors.length,
      errorsPreview: errors.slice(0, 5),
      errors,
      skippedCount: skipped.length,
      skippedPreview: skipped.slice(0, 5),
      skipped,
      logs,
    }

    console.info(
      `[Clan Sync] Finished clan sync for "${clan.name}" (${clan.id}) at ${finishedAt.toISOString()} - members: ${clan.members.length}, imported matches: ${importedCount}, errors: ${errors.length}, skipped: ${skipped.length}`
    )

    if (errors.length > 0) {
      console.warn(
        `[Clan Sync] Partial result for "${clan.name}" (${clan.id}): imported=${importedCount}, errors=${errors.length}, firstError=${errors[0]}`
      )
      logs.push(
        `[Summary] Partial sync: imported=${importedCount}, errors=${errors.length}`
      )
    } else {
      logs.push(
        `[Summary] Successful sync: imported=${importedCount}, errors=0, skipped=${skipped.length}`
      )
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
