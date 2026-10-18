import { PLAYERS_MIN_MATCHES, PLAYERS_MIN_RANKED, parseCompareKeys, playerStyle, type PlayerRankingEntry, type PlayerRoles, type PlayersMode } from '@/lib/players-ranking'
import type { ComparedSlot, PlayersComparisonPayload, PlayersRankingPayload } from '@/lib/players-ranking-service'
import type { StandardPeriod } from '@/lib/period'

/**
 * Page Joueurs (docs/features/joueurs.md) : réponses figées de `/api/players/ranking` et `/api/players/compare`.
 * 30 joueurs classés dans trois clans (le membre 1, « Joueur Alpha », 15e aux dégâts), 3 en qualification ; la semaine
 * en Squad n'a que 5 classés (état « pas encore assez de parties »). En duo, les dégâts changent (rechargement visible).
 */

const CLANS = [
  { clanId: 1, name: 'Clan Démo', tag: 'DEMO' },
  { clanId: 2, name: 'Les-Ratz', tag: 'RATZ' },
  { clanId: 3, name: 'Aurora', tag: 'AUR' },
]

const NAMES = [
  'Ravek', 'Arcos', 'Bruar', 'Xanor', 'Nyx_tv', 'Mokito', 'Pixos', 'Griar', 'Kaiek', 'Moky',
  'Lux_tv', 'Ekozz89', 'Jaxy', 'Magane97', 'Joueur Alpha', 'Tikane', 'Pépane44', 'Ozza', 'Jin7766', 'Rava',
  'Jinzz', 'Rav7773', 'Vexy', 'Toxra90', 'Skelane', 'Toxou', 'Skely', 'Skelin42', 'Croito', 'Zedzz39',
]

function player(index: number, mode: PlayersMode, period: StandardPeriod): PlayerRankingEntry {
  const name = NAMES[index]
  const memberId = name === 'Joueur Alpha' ? 1 : 100 + index
  const clan = name === 'Joueur Alpha' ? CLANS[0] : CLANS[index % 3]
  const damage = 450 - index * 3 + (mode === 'duo' ? 25 : 0)
  // Rôles : Pixos (7e aux dégâts) est le meilleur Medic, Griar le meilleur tireur ; sur « Tous », Xanor passe Medic.
  const roles: PlayerRoles = {
    fragger: Math.max(0, 100 - index * 3),
    medic: name === 'Pixos' ? 97 : name === 'Xanor' && period === 'all' ? 99 : 30 + ((index * 17) % 60),
    ghost: 20 + ((index * 23) % 70),
    sniper: name === 'Griar' ? 98 : 10 + ((index * 29) % 80),
  }
  return {
    memberId,
    name,
    clanId: clan.clanId,
    clanName: clan.name,
    clanTag: clan.tag,
    // Badge : le plus haut des trois rôles, comme le serveur.
    style: playerStyle(roles),
    matches: 12 + ((index * 7) % 50),
    wins: index % 4,
    avgDamage: damage,
    avgKills: Math.round((3 - index * 0.05) * 100) / 100,
    avgKnocks: Math.round((2.5 + (index % 5) * 0.2) * 100) / 100,
    avgRevives: Math.round((0.4 + ((index * 3) % 10) * 0.08) * 100) / 100,
    avgAssists: Math.round((0.6 + (index % 6) * 0.1) * 100) / 100,
    avgSurvivalSeconds: 900 + ((index * 37) % 400),
    headshotRate: 0.15 + (index % 7) * 0.02,
    avgKillDistance: 40 + ((index * 13) % 90),
    zoneInsideRate: 0.6 + ((index * 11) % 35) / 100,
    roles,
    // Mois précédent : rangs décalés (▲ / ▼), Mokito « nouv. » ; aucune flèche pour « Tous ».
    previousRanks: period === 'all' || name === 'Mokito' ? null : [Math.max(1, index + 1 + ((index % 3) - 1) * 2), 1, 1, 1, 1, 1, 1, 1, 1],
  }
}

export function playersRankingResponse(period: StandardPeriod, mode: PlayersMode): PlayersRankingPayload {
  const count = period === 'week' && mode === 'squad' ? 5 : NAMES.length
  const all = NAMES.map((_, index) => player(index, mode, period))
  const ranked = all.slice(0, count)
  const qualifying: PlayerRankingEntry[] = [
    ...all.slice(count),
    { ...player(0, mode, period), memberId: 300, name: 'Lemon', matches: 4, roles: { fragger: 40, medic: 40, ghost: 40, sniper: 40 }, previousRanks: null },
  ].map((entry) => ({ ...entry, matches: Math.min(entry.matches, PLAYERS_MIN_MATCHES - 1), previousRanks: null }))
  return {
    period,
    mode,
    minMatches: PLAYERS_MIN_MATCHES,
    minRanked: PLAYERS_MIN_RANKED,
    totals: { players: 510, clans: 33 },
    ranked,
    qualifying,
    clans: CLANS,
    lastMatchAt: null,
  }
}

function slotOf(entry: PlayerRankingEntry, key: string): ComparedSlot {
  return {
    key,
    kind: 'player',
    memberId: entry.memberId,
    clanId: entry.clanId,
    name: entry.name,
    clanName: entry.clanName,
    clanTag: entry.clanTag,
    players: null,
    matches: entry.matches,
    qualified: entry.matches >= PLAYERS_MIN_MATCHES,
    values: {
      avgDamage: entry.avgDamage,
      avgKills: entry.avgKills,
      avgKnocks: entry.avgKnocks,
      headshotRate: entry.headshotRate,
      avgKillDistance: entry.avgKillDistance,
      avgRevives: entry.avgRevives,
      avgAssists: entry.avgAssists,
      avgSurvivalSeconds: entry.avgSurvivalSeconds,
      avgCircleDelaySeconds: 30 + (entry.memberId % 9),
      avgBlueZoneHits: 20 + (entry.memberId % 7),
    },
    roles: entry.roles,
    weapons: [
      { id: 'ump9', name: 'UMP45', iconId: 'WeapUMP_C', kills: 75, accuracy: 39, matchCount: 30 },
      { id: 'akm', name: 'AKM', iconId: 'WeapAK47_C', kills: 56, accuracy: 31, matchCount: 22 },
      { id: 'kar98k', name: 'Kar98k', iconId: 'WeapKar98k_C', kills: 38, accuracy: 36, matchCount: 15 },
    ],
  }
}

export function playersComparisonResponse(ids: string | null, period: StandardPeriod, mode: PlayersMode): PlayersComparisonPayload {
  const ranking = playersRankingResponse(period, mode)
  const everyone = [...ranking.ranked, ...ranking.qualifying]
  const slots = parseCompareKeys(ids).flatMap((key): ComparedSlot[] => {
    if (key.kind === 'clan') {
      const clan = CLANS.find((entry) => entry.clanId === key.clanId)
      const members = everyone.filter((entry) => entry.clanId === key.clanId)
      if (!clan || members.length === 0) return []
      return [{ ...slotOf(members[0], `clan-${clan.clanId}`), kind: 'clan', memberId: null, name: `Moyenne ${clan.name}`, players: members.length, matches: 420, qualified: true }]
    }
    const entry = everyone.find((candidate) => candidate.memberId === key.memberId)
    return entry ? [slotOf(entry, String(entry.memberId))] : []
  })
  const players = slots.filter((slot) => slot.kind === 'player')
  const duels = players.flatMap((a, i) =>
    players.slice(i + 1).map((b) =>
      // Ravek et Arcos se sont croisés trois fois ; les autres jamais.
      (a.name === 'Ravek' && b.name === 'Arcos') || (a.name === 'Arcos' && b.name === 'Ravek')
        ? { a: a.key, b: b.key, aKills: a.name === 'Ravek' ? 2 : 1, bKills: a.name === 'Ravek' ? 1 : 2, last: { date: '2026-10-03T20:00:00.000Z', mapName: 'Erangel', killer: slots.find((slot) => slot.name === 'Ravek')!.key } }
        : { a: a.key, b: b.key, aKills: 0, bKills: 0, last: null }
    )
  )
  return { period, mode, minMatches: PLAYERS_MIN_MATCHES, slots, duels }
}
