import { prisma } from '@/lib/prisma'
import { SquadPeriod, ClanMatchTypeFilter } from '@/types/squad-matches'
import { matchTypeMatchesFilter } from '@/lib/match-type-filter'
import { teamModeFromMemberCount } from '@/lib/team-mode'
import { CLAN_PLACEMENT_MEMBER_SELECT, clanPlacementMemberWhere, clanPlacementOf } from '@/lib/clan-placement'

// Ranked compris depuis le 2026-10-27 : la vue d'ensemble le propose, comme la Ligue (docs/TODO/aide-des-pages.md §0, f).
const CLAN_MATCH_TYPE_FILTERS: ClanMatchTypeFilter[] = ['official', 'competitive', 'casual', 'custom', 'all']

function getPeriodBounds(period: SquadPeriod, referenceDate = new Date()): { gte: Date; lte: Date } {
  if (period === 'week') {
    const day = referenceDate.getDay()
    const diff = referenceDate.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(referenceDate)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    return { gte: monday, lte: sunday }
  }

  if (period === 'month') {
    const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0)
    const endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999)
    return { gte: startDate, lte: endDate }
  }

  // all-time
  return { gte: new Date(0), lte: new Date('9999-12-31') }
}

function getPeriodKey(period: SquadPeriod, referenceDate = new Date()): string {
  if (period === 'all') {
    return 'all-time'
  }
  if (period === 'week') {
    const tmp = new Date(referenceDate.getTime())
    tmp.setHours(0, 0, 0, 0)
    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
    const week1 = new Date(tmp.getFullYear(), 0, 4)
    const week = 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
    return `week-${referenceDate.getFullYear()}-${String(week).padStart(2, '0')}`
  }
  return `month-${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`
}

function buildWinRate(wins: number, matchesPlayed: number) {
  return matchesPlayed > 0 ? wins / matchesPlayed : 0
}

function buildSynergyKey(memberIds: number[]) {
  return memberIds.join(':')
}

export type CachedClanMatchesPayload = {
  globalStats: {
    totalKills: number
    totalDamage: number
    winRate: number
    matchCount: number
    wins: number
    totalAssists: number
  }
  modePerformance: Array<{
    mode: 'duo' | 'trio' | 'squad'
    matches: number
    kills: number
    wins: number
    losses: number
    damage: number
    assists: number
    durationSeconds: number
  }>
  rosterStats: Array<{
    memberId: number
    displayName: string
    matchesPlayed: number
    totalKills: number
    totalAssists: number
    totalDamage: number
    wins: number
  }>
  byMode: Record<
    'all' | 'duo' | 'trio' | 'squad',
    {
      synergies: {
        topPairs: any[]
        topSquads: any[]
      }
      topPerformers: {
        kills: any[]
        damage: any[]
        survival: any[]
        winRate: any[]
        assists: any[]
        revives: any[]
      }
      rosterStats: Array<{
        memberId: number
        displayName: string
        matchesPlayed: number
        totalKills: number
        totalDamage: number
        totalAssists: number
        totalRevives: number
        averagePlacement: number
        winRate: number
        wins: number
      }>
    }
  >
}

const CACHE_PERIODS: SquadPeriod[] = ['week', 'month', 'all']

/** Parties d'une période du clan, réduites à ce que le cache lit : type, membres actifs du clan et leur place. */
async function loadClanPeriodMatches(clanId: number, period: SquadPeriod, referenceDate: Date): Promise<CacheMatch[]> {
  const bounds = getPeriodBounds(period, referenceDate)
  const squadMatches = await prisma.squadMatch.findMany({
    where: {
      createdAt: { gte: bounds.gte, lte: bounds.lte },
      members: { some: { member: clanPlacementMemberWhere(clanId) } },
    },
    select: {
      matchType: true,
      // Un SquadMatch peut être partagé entre plusieurs clans (voir
      // analyzeMatchForSquads dans squad-detector.ts) : sans ce filtre, un
      // match croisé renverrait aussi les SquadMember de l'autre clan.
      members: {
        where: { member: clanPlacementMemberWhere(clanId) },
        include: { member: { select: { id: true, displayName: true, ...CLAN_PLACEMENT_MEMBER_SELECT } } },
        orderBy: { memberId: 'asc' },
      },
    },
  })
  // Place du clan = celle de ses membres actifs, jamais `SquadMatch.placement` (place du clan qui a créé la ligne).
  return squadMatches.map((match) => ({ ...match, placement: clanPlacementOf(match, clanId) ?? 0 }))
}

type CachePayloadEntry = { period: SquadPeriod; matchType: ClanMatchTypeFilter; periodKey: string; payload: CachedClanMatchesPayload }

/** Charges d'une période, une par type de partie, sans rien écrire. */
async function buildPeriodPayloads(clanId: number, period: SquadPeriod, referenceDate: Date): Promise<CachePayloadEntry[]> {
  const squadMatches = await loadClanPeriodMatches(clanId, period, referenceDate)
  const periodKey = getPeriodKey(period, referenceDate)
  return CLAN_MATCH_TYPE_FILTERS.map((matchType) => ({
    period,
    matchType,
    periodKey,
    payload: processMatchesForCache(
      matchType === 'all' ? squadMatches : squadMatches.filter((match) => matchTypeMatchesFilter(match.matchType, matchType))
    ),
  }))
}

/**
 * Une charge du cache, calculée à la lecture sans rien écrire : la route de la vue d'ensemble s'en sert tant que le
 * calcul de la nuit n'a pas écrit la ligne (premier passage d'un clan, Ranked le jour de son ajout).
 */
export async function buildClanMatchesCachePayload(clanId: number, period: SquadPeriod, matchType: ClanMatchTypeFilter, referenceDate = new Date()) {
  const squadMatches = await loadClanPeriodMatches(clanId, period, referenceDate)
  return {
    period,
    matchType,
    periodKey: getPeriodKey(period, referenceDate),
    payload: processMatchesForCache(
      matchType === 'all' ? squadMatches : squadMatches.filter((match) => matchTypeMatchesFilter(match.matchType, matchType))
    ),
  }
}

/**
 * Charges du cache des matchs (période × type de partie), calculées sans rien écrire : `precomputeClanMatchesStats`
 * les enregistre, le script de recalcul (`scripts/recalc-shared-placement.ts`) les compare au cache en simulation.
 */
export async function buildClanMatchesCachePayloads(clanId: number, referenceDate = new Date()) {
  const entries: CachePayloadEntry[] = []
  for (const period of CACHE_PERIODS) entries.push(...(await buildPeriodPayloads(clanId, period, referenceDate)))
  return entries
}

export async function precomputeClanMatchesStats(clanId: number) {
  const referenceDate = new Date()

  for (const period of CACHE_PERIODS) {
    try {
      for (const { matchType, periodKey, payload } of await buildPeriodPayloads(clanId, period, referenceDate)) {
        try {
          await prisma.clanMatchesCache.upsert({
            where: { clanId_period_matchType: { clanId, period, matchType } },
            create: {
              clanId,
              period,
              matchType,
              periodKey,
              payload: payload as any,
              computedAt: new Date(),
            },
            update: {
              periodKey,
              payload: payload as any,
              computedAt: new Date(),
            },
          })
        } catch (err) {
          console.error(
            `[matches-cache] Failed to upsert ${period}/${matchType} for clan ${clanId}`,
            err
          )
        }
      }
    } catch (err) {
      console.error(`[matches-cache] Failed to precompute ${period} for clan ${clanId}`, err)
    }
  }
}

type CacheMatch = {
  matchType: string
  /** Place du clan (`clanPlacementOf`), 0 sans membre classé. */
  placement: number
  members: Array<{ memberId: number; kills: number; damage: number; assists: number; revives: number; member: { displayName: string } }>
}

function processMatchesForCache(matches: CacheMatch[]): CachedClanMatchesPayload {
  const globalStats = { totalKills: 0, totalDamage: 0, wins: 0, matchCount: 0, totalAssists: 0, winRate: 0 }
  
  const modePerformance = {
    duo: { mode: 'duo' as const, matches: 0, kills: 0, wins: 0, losses: 0, damage: 0, assists: 0, durationSeconds: 0 },
    trio: { mode: 'trio' as const, matches: 0, kills: 0, wins: 0, losses: 0, damage: 0, assists: 0, durationSeconds: 0 },
    squad: { mode: 'squad' as const, matches: 0, kills: 0, wins: 0, losses: 0, damage: 0, assists: 0, durationSeconds: 0 },
  }

  const rosterMap = new Map<number, any>()
  
  const modes = ['all', 'duo', 'trio', 'squad'] as const
  const stateByMode = Object.fromEntries(
    modes.map((m) => [
      m,
      {
        pairs: new Map(),
        squads: new Map(),
        performers: new Map(),
      },
    ])
  ) as any

  for (const match of matches) {
    const isWin = match.placement === 1
    const mode = teamModeFromMemberCount(match.members.length) as 'duo' | 'trio' | 'squad'
    // Recalculé depuis les SquadMember (déjà filtrés par clan) plutôt que
    // depuis SquadMatch.totalKills/totalDamage/totalAssists — ces colonnes ne
    // reflètent que le clan ayant créé la ligne en premier sur un match
    // potentiellement partagé entre plusieurs clans.
    const matchTotalKills = match.members.reduce(
      (sum: number, m: { kills: number }) => sum + m.kills,
      0
    )
    const matchTotalDamage = match.members.reduce(
      (sum: number, m: { damage: number }) => sum + m.damage,
      0
    )
    const matchTotalAssists = match.members.reduce(
      (sum: number, m: { assists: number }) => sum + m.assists,
      0
    )

    globalStats.matchCount++
    globalStats.totalKills += matchTotalKills
    globalStats.totalDamage += matchTotalDamage
    globalStats.totalAssists += matchTotalAssists
    if (isWin) globalStats.wins++

    const mp = modePerformance[mode]
    mp.matches++
    mp.kills += matchTotalKills
    mp.damage += matchTotalDamage
    mp.assists += matchTotalAssists
    if (isWin) mp.wins++
    else mp.losses++

    const targetModes = ['all', mode]

    for (const member of match.members) {
      // Global roster stats
      if (!rosterMap.has(member.memberId)) {
        rosterMap.set(member.memberId, {
          memberId: member.memberId,
          displayName: member.member.displayName,
          matchesPlayed: 0,
          totalKills: 0,
          totalAssists: 0,
          totalDamage: 0,
          wins: 0,
        })
      }
      const r = rosterMap.get(member.memberId)
      r.matchesPlayed++
      r.totalKills += member.kills
      r.totalAssists += member.assists
      r.totalDamage += member.damage
      if (isWin) r.wins++

      // Mode-specific performers
      for (const tMode of targetModes) {
        const perfMap = stateByMode[tMode].performers
        if (!perfMap.has(member.memberId)) {
          perfMap.set(member.memberId, {
            memberId: member.memberId,
            displayName: member.member.displayName,
            matchesPlayed: 0,
            totalKills: 0,
            totalDamage: 0,
            totalAssists: 0,
            totalRevives: 0,
            placementTotal: 0,
            wins: 0
          })
        }
        const p = perfMap.get(member.memberId)
        p.matchesPlayed++
        p.totalKills += member.kills
        p.totalDamage += member.damage
        p.totalAssists += member.assists
        p.totalRevives += member.revives
        p.placementTotal += match.placement
        if (isWin) p.wins++
      }
    }

    // Pairs
    if (match.members.length >= 2) {
      for (let left = 0; left < match.members.length - 1; left++) {
        for (let right = left + 1; right < match.members.length; right++) {
          const pairMembers = [match.members[left], match.members[right]].sort((a, b) => a.memberId - b.memberId)
          const memberIds = pairMembers.map(m => m.memberId)
          const key = buildSynergyKey(memberIds)
          
          for (const tMode of targetModes) {
            const pairMap = stateByMode[tMode].pairs
            if (!pairMap.has(key)) {
              pairMap.set(key, {
                memberIds,
                memberNames: pairMembers.map(m => m.member.displayName),
                matchesPlayed: 0,
                wins: 0,
                totalKills: 0,
                totalDamage: 0,
              })
            }
            const p = pairMap.get(key)
            p.matchesPlayed++
            if (isWin) p.wins++
            p.totalKills += pairMembers[0].kills + pairMembers[1].kills
            p.totalDamage += pairMembers[0].damage + pairMembers[1].damage
          }
        }
      }
    }

    // Squads
    if (match.members.length >= 3 && match.members.length <= 4) {
      const squadMembers = [...match.members].sort((a, b) => a.memberId - b.memberId)
      const memberIds = squadMembers.map(m => m.memberId)
      const key = buildSynergyKey(memberIds)

      for (const tMode of targetModes) {
        const squadMap = stateByMode[tMode].squads
        if (!squadMap.has(key)) {
          squadMap.set(key, {
            memberIds,
            memberNames: squadMembers.map(m => m.member.displayName),
            matchesPlayed: 0,
            wins: 0,
            totalKills: 0,
            totalDamage: 0,
          })
        }
        const s = squadMap.get(key)
        s.matchesPlayed++
        if (isWin) s.wins++
        s.totalKills += matchTotalKills
        s.totalDamage += matchTotalDamage
      }
    }
  }

  globalStats.winRate = buildWinRate(globalStats.wins, globalStats.matchCount)

  const byMode: any = {}
  for (const m of modes) {
    const state = stateByMode[m]
    
    const synergies = {
      topPairs: Array.from(state.pairs.values()).map((p: any) => ({
        ...p,
        winRate: buildWinRate(p.wins, p.matchesPlayed)
      })).sort((a: any, b: any) => b.matchesPlayed - a.matchesPlayed || b.winRate - a.winRate || b.totalKills - a.totalKills).slice(0, 5),
      topSquads: Array.from(state.squads.values()).map((s: any) => ({
        ...s,
        winRate: buildWinRate(s.wins, s.matchesPlayed)
      })).sort((a: any, b: any) => b.matchesPlayed - a.matchesPlayed || b.winRate - a.winRate || b.totalKills - a.totalKills).slice(0, 5),
    }

    const perfList = Array.from(state.performers.values()).map((p: any) => ({
      memberId: p.memberId,
      displayName: p.displayName,
      matchesPlayed: p.matchesPlayed,
      totalKills: p.totalKills,
      totalDamage: p.totalDamage,
      totalAssists: p.totalAssists,
      totalRevives: p.totalRevives,
      averagePlacement: p.matchesPlayed > 0 ? p.placementTotal / p.matchesPlayed : 0,
      winRate: buildWinRate(p.wins, p.matchesPlayed),
      wins: p.wins,
    }))

    const sortPerf = (metric: string) => [...perfList].sort((a: any, b: any) => {
      if (metric === 'kills') return b.totalKills - a.totalKills || b.matchesPlayed - a.matchesPlayed
      if (metric === 'damage') return b.totalDamage - a.totalDamage || b.matchesPlayed - a.matchesPlayed
      if (metric === 'survival') return a.averagePlacement - b.averagePlacement || b.matchesPlayed - a.matchesPlayed
      if (metric === 'winRate') return b.winRate - a.winRate || b.matchesPlayed - a.matchesPlayed
      if (metric === 'assists') return b.totalAssists - a.totalAssists || b.matchesPlayed - a.matchesPlayed
      if (metric === 'revives') return b.totalRevives - a.totalRevives || b.matchesPlayed - a.matchesPlayed
      return 0
    })

    byMode[m] = {
      synergies,
      topPerformers: {
        kills: sortPerf('kills').slice(0, 5),
        damage: sortPerf('damage').slice(0, 5),
        survival: sortPerf('survival').slice(0, 5),
        winRate: sortPerf('winRate').slice(0, 5),
        assists: sortPerf('assists').slice(0, 5),
        revives: sortPerf('revives').slice(0, 5),
      },
      rosterStats: [...perfList].sort((a, b) => b.matchesPlayed - a.matchesPlayed),
    }
  }

  return {
    globalStats,
    modePerformance: [modePerformance.duo, modePerformance.trio, modePerformance.squad],
    rosterStats: Array.from(rosterMap.values()).sort((a: any, b: any) => b.matchesPlayed - a.matchesPlayed),
    byMode
  }
}
