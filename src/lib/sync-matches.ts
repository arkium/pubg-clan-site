import { prisma } from './prisma'
import { ApiQueue } from './api-throttle'
import { fetchMatchDetails, fetchRecentMatchIds, searchPlayerByName } from './pubg'

function createMatchRecordId(memberId: number, matchId: string) {
  return `${memberId}-${matchId}`
}

export type SyncMemberResult = {
  memberId: number
  imported: number
  skipped: number
  errors: string[]
}

export type SyncAllResult = {
  totalMembers: number
  synced: number
  totalImported: number
  errors: Array<{ memberId: number; error: string }>
  logs: string[]
  startedAt: Date
  finishedAt: Date
}

export async function syncMemberMatches(
  memberId: number,
  queue: ApiQueue
): Promise<SyncMemberResult> {
  const result: SyncMemberResult = {
    memberId,
    imported: 0,
    skipped: 0,
    errors: [],
  }

  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
  })

  if (!member) {
    result.errors.push(`Member ${memberId} not found`)
    return result
  }

  let playerId = member.pubgAccountId

  if (!playerId) {
    let player
    try {
      player = await queue.add(() =>
        searchPlayerByName(member.pubgPlayerName, member.platformShard)
      )
    } catch (e) {
      result.errors.push(`Failed to resolve player ID: ${e instanceof Error ? e.message : String(e)}`)
      return result
    }
    if (!player) {
      result.errors.push(`Player "${member.pubgPlayerName}" not found in PUBG API`)
      return result
    }
    playerId = player.accountId
    await prisma.clanMember.update({
      where: { id: memberId },
      data: { pubgAccountId: playerId },
    })
  }

  let allMatchIds: string[]
  try {
    allMatchIds = await queue.add(() =>
      fetchRecentMatchIds(playerId!, member.platformShard)
    )
  } catch (e) {
    result.errors.push(`Failed to fetch match IDs: ${e instanceof Error ? e.message : String(e)}`)
    return result
  }

  const existing = await prisma.match.findMany({
    where: { memberId },
    select: { pubgMatchId: true },
  })

  const importedIds = new Set(existing.map((m) => m.pubgMatchId))
  const toImport = allMatchIds.filter((id) => !importedIds.has(id))
  result.skipped = allMatchIds.length - toImport.length

  for (const matchId of toImport) {
    try {
      const match = await queue.add(() =>
        fetchMatchDetails(matchId, playerId!, member.platformShard)
      )
      const matchData = {
        id: createMatchRecordId(memberId, match.id),
        memberId,
        pubgMatchId: match.id,
        gameMode: match.gameMode,
        mapName: match.mapName,
        kills: match.stats.kills,
        knockouts: match.stats.knockouts,
        assists: match.stats.assists,
        damageDealt: match.stats.damageDealt,
        headshotKills: match.stats.headshotKills,
        revives: match.stats.revives,
        placement: match.stats.position,
        playersAlive: 0,
        duration: match.durationSeconds,
        pubgCreatedAt: new Date(match.createdAt),
      }
      await prisma.match.upsert({
        where: {
          memberId_pubgMatchId: { memberId, pubgMatchId: match.id },
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
      result.imported++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`Match ${matchId}: ${msg}`)
    }
  }

  return result
}

export async function syncAllActiveMembers(): Promise<SyncAllResult> {
  const startedAt = new Date()
  const queue = new ApiQueue()

  const members = await prisma.clanMember.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  let totalImported = 0
  let synced = 0
  const errors: Array<{ memberId: number; error: string }> = []

  for (const member of members) {
    try {
      const result = await syncMemberMatches(member.id, queue)
      totalImported += result.imported
      synced++
      if (result.errors.length > 0) {
        result.errors.forEach((e) => errors.push({ memberId: member.id, error: e }))
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push({ memberId: member.id, error: msg })
    }
  }

  return {
    totalMembers: members.length,
    synced,
    totalImported,
    errors,
    logs: queue.getLogs(),
    startedAt,
    finishedAt: new Date(),
  }
}
