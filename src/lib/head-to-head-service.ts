import { prisma } from '@/lib/prisma'

export type HeadToHeadMatchSummary = {
  squadMatchId: string
  createdAt: string
  mapName: string
  bestPlacementA: number | null
  bestPlacementB: number | null
  totalKillsA: number
  totalKillsB: number
  winner: 'A' | 'B' | 'tie' | null
}

export type HeadToHeadStats = {
  clanIdA: number
  clanIdB: number
  commonMatchCount: number
  matchesWonByA: number
  matchesWonByB: number
  ties: number
  mostKillsInMatchA: number
  mostKillsInMatchB: number
  mostKillsTies: number
  killsAOnB: number
  killsBOnA: number
  matches: HeadToHeadMatchSummary[]
}

function activeMemberFilter(clanId: number) {
  return { clanId, isActive: true, joinStatus: 'active' } as const
}

// Deux clans suivis peuvent partager le même SquadMatch.pubgMatchId (colonne
// globalement unique) s'ils étaient dans le même lobby PUBG — chaque membre y
// garde son propre SquadMember.placement (équipe réelle), donc le "vainqueur"
// de la confrontation se lit sur le meilleur placement par clan, pas sur
// SquadMatch.placement qui n'est pas fiable en configuration multi-clans.
// Voir docs/TODO/todo.md, section "Idées — Comparateur de Clans", § Head-to-Head.
export async function getHeadToHeadStats(clanIdA: number, clanIdB: number): Promise<HeadToHeadStats> {
  const filterA = activeMemberFilter(clanIdA)
  const filterB = activeMemberFilter(clanIdB)

  const commonMatches = await prisma.squadMatch.findMany({
    where: {
      AND: [{ members: { some: { member: filterA } } }, { members: { some: { member: filterB } } }],
    },
    select: {
      id: true,
      createdAt: true,
      mapName: true,
      members: {
        where: { OR: [{ member: filterA }, { member: filterB }] },
        select: { placement: true, kills: true, member: { select: { clanId: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const matches: HeadToHeadMatchSummary[] = commonMatches.map((match) => {
    const placementsA = match.members.filter((m) => m.member.clanId === clanIdA).map((m) => m.placement)
    const placementsB = match.members.filter((m) => m.member.clanId === clanIdB).map((m) => m.placement)
    const killsA = match.members.filter((m) => m.member.clanId === clanIdA).reduce((sum, m) => sum + m.kills, 0)
    const killsB = match.members.filter((m) => m.member.clanId === clanIdB).reduce((sum, m) => sum + m.kills, 0)
    const bestA = placementsA.length > 0 ? Math.min(...placementsA) : null
    const bestB = placementsB.length > 0 ? Math.min(...placementsB) : null
    const winner: HeadToHeadMatchSummary['winner'] =
      bestA === null || bestB === null ? null : bestA === bestB ? 'tie' : bestA < bestB ? 'A' : 'B'

    return {
      squadMatchId: match.id,
      createdAt: match.createdAt.toISOString(),
      mapName: match.mapName,
      bestPlacementA: bestA,
      bestPlacementB: bestB,
      totalKillsA: killsA,
      totalKillsB: killsB,
      winner,
    }
  })

  const matchIds = commonMatches.map((match) => match.id)

  const killEvents =
    matchIds.length > 0
      ? await prisma.killEvent.findMany({
          where: {
            squadMatchId: { in: matchIds },
            OR: [
              { killerMember: filterA, victimMember: filterB },
              { killerMember: filterB, victimMember: filterA },
            ],
          },
          select: { killerMember: { select: { clanId: true } } },
        })
      : []

  let killsAOnB = 0
  let killsBOnA = 0
  for (const event of killEvents) {
    if (event.killerMember?.clanId === clanIdA) killsAOnB++
    else if (event.killerMember?.clanId === clanIdB) killsBOnA++
  }

  return {
    clanIdA,
    clanIdB,
    commonMatchCount: commonMatches.length,
    matchesWonByA: matches.filter((m) => m.winner === 'A').length,
    matchesWonByB: matches.filter((m) => m.winner === 'B').length,
    ties: matches.filter((m) => m.winner === 'tie').length,
    mostKillsInMatchA: matches.filter((m) => m.totalKillsA > m.totalKillsB).length,
    mostKillsInMatchB: matches.filter((m) => m.totalKillsB > m.totalKillsA).length,
    mostKillsTies: matches.filter((m) => m.totalKillsA === m.totalKillsB).length,
    killsAOnB,
    killsBOnA,
    matches: matches.slice(0, 20),
  }
}

export function buildClanPairs(clanIds: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  for (let i = 0; i < clanIds.length - 1; i++) {
    for (let j = i + 1; j < clanIds.length; j++) {
      pairs.push([clanIds[i], clanIds[j]])
    }
  }
  return pairs
}
