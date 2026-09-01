import { captureEncounteredPlayers, countBotsInMatch } from '@/lib/encountered-players'
import { prisma } from '@/lib/prisma'
import { fetchAllRecentMatchIds, fetchMatchDetails, fetchRecentMatchIds, searchPlayerByName } from '@/lib/pubg'
import { analyzeMatchForSquads } from '@/lib/squad-detector'

function createMatchRecordId(memberId: number, matchId: string) {
  return `${memberId}-${matchId}`
}

function isMissingMatchError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('API request failed (404)') && message.includes('/matches/')
}

export type SyncClanMatchesResult = {
  clanId: number
  clanName: string
  startedAt: string
  finishedAt: string
  importedCount: number
  importedMatches: number
  membersProcessed: number
  status: 'success' | 'partial'
  errorsCount: number
  errorsPreview: string[]
  errors: string[]
  skippedCount: number
  skippedPreview: string[]
  skipped: string[]
  logs: string[]
  message?: string
}

export async function syncClanMatches(
  clanId: number,
  options?: { requestedMemberId?: number | null }
): Promise<SyncClanMatchesResult> {
  const requestedMemberId = options?.requestedMemberId ?? null

  const logs: string[] = []
  const errors: string[] = []
  const skipped: string[] = []
  let importedCount = 0

  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
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
    throw new Error('Clan not found')
  }

  const startedAt = new Date()

  console.info(
    `[Clan Sync] Starting clan sync for "${clan.name}" (${clan.id}) at ${startedAt.toISOString()}`
  )

  if (clan.members.length === 0) {
    return {
      clanId: clan.id,
      clanName: clan.name,
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      importedCount: 0,
      importedMatches: 0,
      membersProcessed: 0,
      status: 'success',
      errorsCount: 0,
      errorsPreview: [],
      errors: [],
      skippedCount: 0,
      skippedPreview: [],
      skipped: [],
      logs: [],
      message: 'No active members found',
    }
  }

  const membersToSync = requestedMemberId
    ? clan.members.filter((member) => member.id === requestedMemberId)
    : clan.members

  if (membersToSync.length === 0) {
    throw new Error('Active member not found in this clan')
  }

  const clanAccountIds = new Set(
    clan.members
      .map((member) => member.pubgAccountId)
      .filter((accountId): accountId is string => Boolean(accountId))
  )

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

  return {
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
}
