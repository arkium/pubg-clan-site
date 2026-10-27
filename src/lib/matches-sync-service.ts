import { captureEncounteredPlayers, countBotsInMatch } from '@/lib/encountered-players'
import { prisma } from '@/lib/prisma'
import { fetchMatchDetails, fetchRecentMatchIdsForPlayers, searchPlayerByName, type MatchResponseCache } from '@/lib/pubg'
import { analyzeMatchForSquads } from '@/lib/squad-detector'

/**
 * Synchronisation des parties d'un clan (docs/TODO/synchro-parties-30-min.md) : les parties des 14 derniers jours de
 * ses membres sont lues **par lots de 10** (`players?filter[playerIds]`, priorité haute dans la file PUBG) — un appel
 * limité pour 10 membres, au lieu de `players/{id}` et `seasons/lifetime` pour chacun — puis chaque partie nouvelle est
 * importée (`matches/{id}`, que PUBG ne limite pas, lu une fois par passage même si plusieurs membres y ont joué). Les
 * rares parties que seul `seasons/lifetime` référence sont rattrapées par la synchronisation de la carrière
 * (`syncClanLifetimeStats`, toutes les 4 heures) avec `importMatchesForMember`.
 */

const SOURCE = 'clan-match-sync'
const PLAYERS_PER_BATCH = 10

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

type SyncMember = { id: number; displayName: string; platformShard: string }

/** Ce qu'un passage partage entre ses membres : journal, détails de parties déjà lus, joueurs du clan. */
type ClanSyncState = {
  clanId: number
  clanAccountIds: Set<string>
  capturedEncounterMatchIds: Set<string>
  matchCache: MatchResponseCache
  logs: string[]
  errors: string[]
  skipped: string[]
}

function createClanSyncState(clanId: number, clanAccountIds: Set<string>): ClanSyncState {
  return { clanId, clanAccountIds, capturedEncounterMatchIds: new Set(), matchCache: new Map(), logs: [], errors: [], skipped: [] }
}

/** Importe pour un membre les parties de `matchIds` que le site n'a pas encore ; rend le nombre importé. */
async function importMemberMatches(member: SyncMember, playerId: string, matchIds: readonly string[], state: ClanSyncState) {
  const importedMatches = await prisma.match.findMany({
    where: { memberId: member.id },
    select: { pubgMatchId: true },
  })
  const importedMatchIds = new Set(importedMatches.map((match) => match.pubgMatchId))
  const newMatchIds = matchIds.filter((matchId) => !importedMatchIds.has(matchId))

  state.logs.push(`Member ${member.displayName}: ${newMatchIds.length} new match(es) out of ${matchIds.length} total`)

  let importedCount = 0
  let memberLatestMatchAt: Date | null = null

  for (const matchId of newMatchIds) {
    try {
      const matchDetails = await fetchMatchDetails(
        matchId,
        playerId,
        member.platformShard,
        { clanId: state.clanId, memberId: member.id, source: SOURCE },
        state.matchCache
      )

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

      const detectedSquad = await analyzeMatchForSquads(state.clanId, matchDetails)

      if (detectedSquad) {
        state.logs.push(`Squad detected for match ${matchDetails.id}: ${detectedSquad.members.length} clan member(s)`)
      }

      if (!state.capturedEncounterMatchIds.has(matchDetails.id)) {
        state.capturedEncounterMatchIds.add(matchDetails.id)

        try {
          await captureEncounteredPlayers(state.clanId, matchDetails, member.platformShard, state.clanAccountIds)
        } catch (encounterError) {
          console.warn(`[Clan Sync] Failed to capture encountered players for match ${matchDetails.id}`, encounterError)
        }
      }

      const matchCreatedAt = new Date(matchDetails.createdAt)
      if (!memberLatestMatchAt || matchCreatedAt > memberLatestMatchAt) {
        memberLatestMatchAt = matchCreatedAt
      }

      importedCount += 1
    } catch (err) {
      if (isMissingMatchError(err)) {
        const skipMsg = `Member ${member.displayName}, match ${matchId}: skipped (match introuvable sur l'API PUBG)`
        state.skipped.push(skipMsg)
        state.logs.push(skipMsg)
        continue
      }

      state.errors.push(`Member ${member.displayName}, match ${matchId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (memberLatestMatchAt) {
    try {
      const currentMember = await prisma.clanMember.findUnique({
        where: { id: member.id },
        select: { lastMatchAt: true },
      })
      if (!currentMember?.lastMatchAt || memberLatestMatchAt > currentMember.lastMatchAt) {
        await prisma.clanMember.update({
          where: { id: member.id },
          data: { lastMatchAt: memberLatestMatchAt },
        })
      }
    } catch (updateMemberMatchErr) {
      console.warn(`[Clan Sync] Failed to update member lastMatchAt:`, updateMemberMatchErr)
    }
  }

  return importedCount
}

/**
 * Parties récentes de chaque membre, lues par lots de 10 et par shard. Un lot en échec ne fait échouer que ses membres ;
 * un membre absent de la réponse (compte inconnu de PUBG) est une erreur, comme l'était un 404 de `players/{id}`.
 */
async function loadRecentMatchIds(members: ReadonlyArray<SyncMember & { playerId: string }>, state: ClanSyncState) {
  const matchIdsByMember = new Map<number, string[]>()
  const byShard = new Map<string, Array<SyncMember & { playerId: string }>>()
  for (const member of members) byShard.set(member.platformShard, [...(byShard.get(member.platformShard) ?? []), member])

  for (const [shard, shardMembers] of byShard) {
    for (let index = 0; index < shardMembers.length; index += PLAYERS_PER_BATCH) {
      const batch = shardMembers.slice(index, index + PLAYERS_PER_BATCH)
      try {
        const matchIdsByAccount = await fetchRecentMatchIdsForPlayers(
          batch.map((member) => member.playerId),
          shard,
          { clanId: state.clanId, source: SOURCE, priority: 'high' }
        )
        for (const member of batch) {
          const matchIds = matchIdsByAccount.get(member.playerId)
          if (matchIds) matchIdsByMember.set(member.id, matchIds)
          else state.errors.push(`Member ${member.displayName}: absent de la réponse PUBG (compte introuvable)`)
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        for (const member of batch) state.errors.push(`Member ${member.displayName}: failed to fetch match IDs — ${reason}`)
      }
    }
  }

  return matchIdsByMember
}

export async function syncClanMatches(
  clanId: number,
  options?: { requestedMemberId?: number | null }
): Promise<SyncClanMatchesResult> {
  const requestedMemberId = options?.requestedMemberId ?? null

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

  console.info(`[Clan Sync] Starting clan sync for "${clan.name}" (${clan.id}) at ${startedAt.toISOString()}`)

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

  const membersToSync = requestedMemberId ? clan.members.filter((member) => member.id === requestedMemberId) : clan.members

  if (membersToSync.length === 0) {
    throw new Error('Active member not found in this clan')
  }

  const state = createClanSyncState(
    clan.id,
    new Set(clan.members.map((member) => member.pubgAccountId).filter((accountId): accountId is string => Boolean(accountId)))
  )

  // Compte PUBG des membres qui n'en ont pas encore (une recherche par nom, rare).
  const resolved: Array<SyncMember & { playerId: string }> = []
  for (const member of membersToSync) {
    if (member.pubgAccountId) {
      resolved.push({ ...member, playerId: member.pubgAccountId })
      continue
    }
    try {
      const player = await searchPlayerByName(member.pubgPlayerName, member.platformShard, {
        clanId: clan.id,
        memberId: member.id,
      })
      if (!player) {
        state.errors.push(`Member ${member.displayName}: player not found in PUBG API`)
        continue
      }
      state.clanAccountIds.add(player.accountId)
      await prisma.clanMember.update({
        where: { id: member.id },
        data: { pubgAccountId: player.accountId },
      })
      resolved.push({ ...member, playerId: player.accountId })
    } catch (err) {
      state.errors.push(
        `Member ${member.displayName}: failed to resolve player ID — ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  const matchIdsByMember = await loadRecentMatchIds(resolved, state)

  let importedCount = 0
  for (const member of resolved) {
    const matchIds = matchIdsByMember.get(member.id)
    if (!matchIds) continue
    try {
      importedCount += await importMemberMatches(member, member.playerId, matchIds, state)
    } catch (err) {
      state.errors.push(`Member ${member.displayName}: unexpected error — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  try {
    const latestClanMember = await prisma.clanMember.findFirst({
      where: { clanId: clan.id, lastMatchAt: { not: null } },
      orderBy: { lastMatchAt: 'desc' },
      select: { lastMatchAt: true },
    })
    if (latestClanMember?.lastMatchAt) {
      await prisma.clan.update({
        where: { id: clan.id },
        data: { lastMatchAt: latestClanMember.lastMatchAt },
      })
    }
  } catch (clanMatchError) {
    console.warn(`[Clan Sync] Failed to update clan lastMatchAt:`, clanMatchError)
  }

  const finishedAt = new Date()
  const { logs, errors, skipped } = state

  console.info(
    `[Clan Sync] Finished clan sync for "${clan.name}" (${clan.id}) at ${finishedAt.toISOString()} - members: ${clan.members.length}, imported matches: ${importedCount}, errors: ${errors.length}, skipped: ${skipped.length}`
  )

  if (errors.length > 0) {
    console.warn(
      `[Clan Sync] Partial result for "${clan.name}" (${clan.id}): imported=${importedCount}, errors=${errors.length}, firstError=${errors[0]}`
    )
    logs.push(`[Summary] Partial sync: imported=${importedCount}, errors=${errors.length}`)
  } else {
    logs.push(`[Summary] Successful sync: imported=${importedCount}, errors=0, skipped=${skipped.length}`)
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

/**
 * Importe pour un membre des parties connues par une autre lecture (la carrière : `seasons/lifetime`) que le site n'a
 * pas encore. Sans partie nouvelle, une seule lecture de la base.
 */
export async function importMatchesForMember(input: {
  clanId: number
  member: SyncMember & { pubgAccountId: string }
  matchIds: readonly string[]
}): Promise<{ importedCount: number; errors: string[] }> {
  const known = await prisma.match.findMany({
    where: { memberId: input.member.id, pubgMatchId: { in: [...input.matchIds] } },
    select: { pubgMatchId: true },
  })
  const knownIds = new Set(known.map((match) => match.pubgMatchId))
  if (input.matchIds.every((matchId) => knownIds.has(matchId))) return { importedCount: 0, errors: [] }

  const clanMembers = await prisma.clanMember.findMany({
    where: { clanId: input.clanId, isActive: true, pubgAccountId: { not: null } },
    select: { pubgAccountId: true },
  })
  const state = createClanSyncState(input.clanId, new Set(clanMembers.map((member) => member.pubgAccountId!)))
  const importedCount = await importMemberMatches(input.member, input.member.pubgAccountId, input.matchIds, state)
  return { importedCount, errors: state.errors }
}
