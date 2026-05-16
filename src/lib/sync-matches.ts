import { prisma } from './prisma'
import { fetchMatchDetails, fetchRecentMatchIds, searchPlayerByName } from './pubg'

const MATCHES_TO_CONSIDER = 10

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
  startedAt: Date
  finishedAt: Date
}

export async function syncMemberMatches(memberId: number): Promise<SyncMemberResult> {
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

  const shard = member.platformShard
  let playerId = member.pubgAccountId

  if (!playerId) {
    const player = await searchPlayerByName(member.pubgPlayerName, shard)
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

  const allMatchIds = await fetchRecentMatchIds(playerId, shard)
  const recentMatchIds = allMatchIds.slice(0, MATCHES_TO_CONSIDER)

  const existing = await prisma.match.findMany({
    where: {
      memberId,
      pubgMatchId: { in: recentMatchIds },
    },
    select: { pubgMatchId: true },
  })

  const importedIds = new Set(existing.map((m) => m.pubgMatchId))
  const toImport = recentMatchIds.filter((id) => !importedIds.has(id))

  for (const matchId of toImport) {
    try {
      const match = await fetchMatchDetails(matchId, playerId, shard)
      await prisma.match.upsert({
        where: {
          memberId_pubgMatchId: { memberId, pubgMatchId: match.id },
        },
        update: {
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
        },
        create: {
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
        },
      })
      result.imported++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`Match ${matchId}: ${msg}`)
    }
  }

  result.skipped = recentMatchIds.length - toImport.length

  return result
}

export async function syncAllActiveMembers(): Promise<SyncAllResult> {
  const startedAt = new Date()

  const members = await prisma.clanMember.findMany({
    where: { isActive: true },
    select: { id: true },
  })

  let totalImported = 0
  let synced = 0
  const errors: Array<{ memberId: number; error: string }> = []

  for (const member of members) {
    try {
      const result = await syncMemberMatches(member.id)
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
    startedAt,
    finishedAt: new Date(),
  }
}
