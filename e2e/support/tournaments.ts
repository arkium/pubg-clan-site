import type { ApiMock } from './api'
import { CLAN_ID } from './data'

import type { TournamentOverview, TournamentStandingSummary } from '@/lib/tournament-overview'
import type { TournamentParticipant } from '@/lib/tournament-service'
import type { TournamentRoundView, TournamentStandingView } from '@/lib/tournament-standings-view'
import type { TournamentAwardsView, TournamentClanAverage, TournamentLeaders, TournamentWeapon } from '@/lib/tournament-stats'

/**
 * Tournois fictifs des tests de rendu (e2e/tournaments.spec.ts). Les dates sont relatives à l'heure du test : un
 * tournoi « en direct » le reste quel que soit le jour d'exécution. Noms inventés, aucun lien avec la production.
 */

export const LIVE_TOURNAMENT_ID = 'coupe-automne'
export const SOLO_TOURNAMENT_ID = 'solo-showdown'
export const UPCOMING_TOURNAMENT_ID = 'scrims-jeudi'

const DAY = 86_400_000
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()

const ORGANIZER = { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' }
const CLANS: Record<number, { name: string; tag: string }> = {
  [CLAN_ID]: { name: 'Clan Démo', tag: 'DEMO' },
  9: { name: 'La Meute', tag: 'LMT' },
  6: { name: 'Les Ratz', tag: 'RATZ' },
  4: { name: 'Bof Team', tag: 'BOFS' },
}
const clanLabel = (clanId: number) => `[${CLANS[clanId].tag}] ${CLANS[clanId].name}`

function summary(key: string, participant: TournamentParticipant, label: string, totalPoints: number, totalKills: number, wins: number, clanIds: number[]): TournamentStandingSummary {
  return { key, participant, label, clanTags: clanIds.map((id) => CLANS[id]?.tag).filter(Boolean) as string[], memberLabels: [], clanIds, totalPoints, totalKills, wins }
}

const clanRow = (clanId: number, points: number, kills: number, wins: number) =>
  summary(`clan:${clanId}`, { kind: 'clan', clanId }, clanLabel(clanId), points, kills, wins, [clanId])

const LIVE_STANDINGS = [clanRow(9, 58, 18, 2), clanRow(CLAN_ID, 52, 21, 1), clanRow(6, 41, 12, 1), clanRow(4, 22, 8, 0)]

function overview(overrides: Partial<TournamentOverview> & Pick<TournamentOverview, 'id' | 'title' | 'mode' | 'phase'>): TournamentOverview {
  return {
    description: null,
    status: overrides.phase === 'finished' ? 'finished' : overrides.phase === 'draft' ? 'draft' : 'active',
    startDate: at(-40 * DAY),
    endDate: at(-34 * DAY),
    gameMode: 'normal-squad',
    mapName: 'Baltic_Main',
    mapLabel: 'Erangel',
    organizerClan: ORGANIZER,
    roundCount: 4,
    participantCount: 4,
    clanCount: 4,
    playerCount: 16,
    lastRoundAt: null,
    leaders: [],
    standings: [],
    winner: null,
    ...overrides,
  }
}

export function tournamentOverviews(): TournamentOverview[] {
  const soloWinner = summary('player:20', { kind: 'player', memberId: 20, clanId: 6 }, '[RATZ] Nova', 61, 30, 5, [6])
  const teamWinner = {
    ...summary('team:1:21:30', { kind: 'team', memberIds: [1, 21, 30], clanIds: [CLAN_ID, 6, 9] }, '[DEMO] Joueur Alpha, [RATZ] Zed, [LMT] Wolfy', 77, 25, 3, [CLAN_ID, 6, 9]),
    memberLabels: ['[DEMO] Joueur Alpha', '[RATZ] Zed', '[LMT] Wolfy'],
  }
  return [
    overview({
      id: LIVE_TOURNAMENT_ID,
      title: 'Coupe d’automne',
      mode: 'inter_clan',
      phase: 'live',
      startDate: at(-3 * DAY),
      endDate: at(2 * DAY),
      roundCount: 5,
      lastRoundAt: at(-22 * 60_000),
      leaders: LIVE_STANDINGS.slice(0, 3),
      standings: LIVE_STANDINGS,
      winner: LIVE_STANDINGS[0],
    }),
    overview({ id: UPCOMING_TOURNAMENT_ID, title: 'Scrims du jeudi', mode: 'intra_clan', phase: 'upcoming', startDate: at(5 * 3_600_000), endDate: at(6 * 3_600_000), mapName: 'Savage_Main', mapLabel: 'Sanhok', roundCount: 0, participantCount: 0 }),
    overview({ id: 'mix-2', title: 'Mix & Match #2', mode: 'custom_teams', phase: 'upcoming', startDate: at(9 * DAY), endDate: at(15 * DAY), mapName: null, mapLabel: null, roundCount: 0, participantCount: 0 }),
    overview({ id: SOLO_TOURNAMENT_ID, title: 'Solo Showdown', mode: 'solo_ffa', phase: 'finished', gameMode: 'normal-solo', startDate: at(-20 * DAY), endDate: at(-14 * DAY), participantCount: 12, clanCount: 4, winner: soloWinner, leaders: [soloWinner] }),
    overview({ id: 'mix-1', title: 'Mix & Match #1', mode: 'custom_teams', phase: 'finished', startDate: at(-60 * DAY), endDate: at(-54 * DAY), winner: teamWinner, leaders: [teamWinner] }),
    overview({ id: 'ete', title: 'Coupe d’été', mode: 'inter_clan', phase: 'finished', startDate: at(-90 * DAY), endDate: at(-60 * DAY), clanCount: 7, winner: clanRow(9, 142, 60, 6), leaders: [clanRow(9, 142, 60, 6)] }),
  ]
}

// ── Détail ──────────────────────────────────────────────────────────────────────────────────────────

const MAPS = ['Baltic_Main', 'Desert_Main', 'Savage_Main', 'Baltic_Main', 'Tiger_Main']
// Place de chaque clan à chaque manche (La Meute, Clan Démo, Les Ratz, Bof Team).
const PLACES: Record<number, number[]> = { 9: [1, 3, 2, 1, 4], [CLAN_ID]: [2, 1, 5, 3, 2], 6: [4, 2, 1, 6, 3], 4: [7, 9, 12, 8, 1] }

function view(row: TournamentStandingSummary, rank: number): TournamentStandingView {
  return { ...row, totalDamage: row.totalKills * 140, matchesPlayed: 5, bestPlacement: 1, averagePlacement: 3, rank }
}

/** `count` manches ; au-delà de 5, cartes et places reprennent le même cycle (puces paginées, forme bornée). */
function rounds(count = MAPS.length): TournamentRoundView[] {
  return Array.from({ length: count }, (_, index) => {
    const scores = LIVE_STANDINGS.map((row) => {
      const clanId = (row.participant as { clanId: number }).clanId
      const place = PLACES[clanId][index % MAPS.length]
      return { key: row.key, label: row.label, points: Math.max(0, 11 - place) + 3, totalKills: 3, bestPlacement: place, placementScore: Math.max(0, 11 - place), killScore: 3, winBonus: place === 1 ? 2 : 0, memberLabels: [] }
    }).sort((left, right) => right.points - left.points)
    return {
      index: index + 1,
      matchId: `match-${index + 1}`,
      createdAt: at(-(count - index) * 3_600_000),
      mapName: MAPS[index % MAPS.length],
      gameMode: 'normal-squad',
      winnerLabel: scores.find((score) => score.bestPlacement === 1)?.label ?? null,
      mvp: { memberId: 1, label: '[DEMO] Joueur Alpha', kills: 6, damage: 820 },
      scores,
    }
  })
}

const RULES = {
  mode: 'inter_clan' as const,
  mixedSquadRule: 'full_share' as const,
  placementPoints: { '1': 10, '2': 6, '3': 5, '4': 4, '5': 3, '6': 2, '7': 1, '8': 1, '9': 0, '10': 0 },
  killPoints: 1,
  winBonus: 2,
  bestOfRounds: null,
}

// ── Statistiques (podium, tops, moyenne par clan, awards, armes — 2026-10-11) ──────────────────────────

/** Le lecteur (membre 1) est 9e des killers : sa ligne s'ajoute sous le top 5. Premier des scorers. */
function leaders(): TournamentLeaders {
  const killers = Array.from({ length: 12 }, (_, index) => {
    const memberId = index === 8 ? 1 : 100 + index
    return {
      key: `player:${memberId}`,
      memberId,
      label: memberId === 1 ? '[DEMO] Joueur Alpha' : `[LMT] Tireur ${index + 1}`,
      rank: index + 1,
      kills: 24 - index * 2,
      damage: 3000 - index * 200,
      points: 40 - index,
    }
  })
  const scorers = Array.from({ length: 12 }, (_, index) => {
    const memberId = index === 0 ? 1 : 200 + index
    return {
      key: `player:${memberId}`,
      memberId,
      label: memberId === 1 ? '[DEMO] Joueur Alpha' : `[RATZ] Joueur ${index + 1}`,
      rank: index + 1,
      kills: 10,
      damage: 1200,
      points: 60 - index * 3,
    }
  })
  return { killers, scorers }
}

/** Moyenne par player : le clan du lecteur est 2e, Les Ratz passent devant avec un seul player. */
function clanAverages(): TournamentClanAverage[] {
  const rows: Array<[number, number, number, number]> = [
    [6, 1, 48, 12],
    [CLAN_ID, 4, 150, 21],
    [9, 8, 240, 18],
    [4, 4, 60, 8],
  ]
  return rows.map(([clanId, players, points, kills], index) => ({
    key: `clan:${clanId}`,
    participant: { kind: 'clan', clanId },
    label: clanLabel(clanId),
    rank: index + 1,
    players,
    points,
    kills,
    average: points / players,
  }))
}

function awards(): TournamentAwardsView {
  const winner = (memberId: number, label: string, value: number, round: number | null = null) => ({ memberId, label, value, round })
  return {
    rounds: 5,
    telemetryRounds: 5,
    facts: [
      { key: 'kills', label: 'Kills au total', value: 364, format: 'count', unit: 'kills', detail: 'dont 78 à la tête' },
      { key: 'bloodiest_round', label: 'Manche la plus sanglante', value: 79, format: 'count', unit: 'kills', detail: 'Manche 2' },
      { key: 'damage', label: 'Dégâts infligés', value: 64909, format: 'damage', unit: 'dégâts', detail: null },
      { key: 'vehicle_distance', label: 'Parcourus en véhicule', value: 978259, format: 'distance', unit: 'm', detail: null },
    ],
    awards: [
      { key: 'best_round', label: 'Le carton', description: 'Plus de kills en une seule manche', unit: 'kills', format: 'count', winners: [winner(30, '[LMT] Wolfy', 10, 3), winner(1, '[DEMO] Joueur Alpha', 9, 1)] },
      { key: 'top_damage', label: 'La brute', description: 'Plus de dégâts infligés', unit: 'dégâts', format: 'damage', winners: [winner(1, '[DEMO] Joueur Alpha', 2677)] },
      { key: 'sniper', label: 'Le sniper', description: 'Kill le plus long du tournoi', unit: 'm', format: 'distance', winners: [winner(20, '[RATZ] Nova', 428, 3)] },
      { key: 'survivor', label: 'Le brouteur d’herbe', description: 'Plus long temps de survie cumulé', unit: '', format: 'duration', winners: [winner(30, '[LMT] Wolfy', 6305)] },
      { key: 'revives', label: 'L’ange gardien', description: 'Plus de coéquipiers relevés', unit: 'réanimations', format: 'count', winners: [winner(21, '[RATZ] Zed', 9)] },
    ],
  }
}

function weapons(): TournamentWeapon[] {
  const shooter = (memberId: number, label: string, kills: number) => ({ memberId, label, kills, damage: kills * 120 })
  return [
    { id: 'mp5k', name: 'MP5K', iconId: 'WeapMP5K_C', category: 'SMG', kills: 50, headshots: 9, damage: 6100, shooters: [shooter(30, '[LMT] Wolfy', 5), shooter(1, '[DEMO] Joueur Alpha', 5), shooter(20, '[RATZ] Nova', 4)] },
    { id: 'm24', name: 'M24', iconId: 'WeapM24_C', category: 'SR', kills: 34, headshots: 12, damage: 3900, shooters: [shooter(20, '[RATZ] Nova', 9)] },
    { id: 'frag grenade', name: 'Frag Grenade', iconId: 'ProjGrenade_C', category: 'THROWABLE', kills: 13, headshots: 0, damage: 1500, shooters: [shooter(21, '[RATZ] Zed', 2)] },
  ]
}

export function liveTournamentStandings(roundCount = MAPS.length) {
  return {
    tournament: {
      id: LIVE_TOURNAMENT_ID,
      title: 'Coupe d’automne',
      description: null,
      status: 'active',
      startDate: at(-3 * DAY),
      endDate: at(2 * DAY),
      gameMode: 'normal-squad',
      mapName: 'Baltic_Main',
      organizerClan: ORGANIZER,
      rules: RULES,
    },
    rules: RULES,
    modeStandings: LIVE_STANDINGS.map((row, index) => view(row, index + 1)),
    squadBreakdown: [
      view({ ...summary('team:1:2:3:4', { kind: 'team', memberIds: [1, 2, 3, 4], clanIds: [CLAN_ID] }, '[DEMO] Joueur Alpha, [DEMO] Joueur Bravo', 30, 11, 1, [CLAN_ID]), memberLabels: ['[DEMO] Joueur Alpha', '[DEMO] Joueur Bravo'] }, 1),
    ],
    // Place de l'escouade à chaque manche : la forme du détail par escouade.
    squadRounds: rounds(roundCount).map((round, index) => {
      const bestPlacement = index === 0 ? 1 : index + 2
      return {
        ...round,
        winnerLabel: bestPlacement === 1 ? '[DEMO] Joueur Alpha, [DEMO] Joueur Bravo' : null,
        scores: [
          {
            key: 'team:1:2:3:4',
            label: '[DEMO] Joueur Alpha, [DEMO] Joueur Bravo',
            memberLabels: ['[DEMO] Joueur Alpha', '[DEMO] Joueur Bravo'],
            points: 14,
            totalKills: 4,
            bestPlacement,
            placementScore: 10,
            killScore: 4,
            winBonus: 0,
          },
        ],
      }
    }),
    // 25 players : la pagination (20 par page) a deux pages.
    playerBreakdown: Array.from({ length: 25 }, (_, index) =>
      view(
        summary(
          `player:${index + 1}`,
          { kind: 'player', memberId: index + 1, clanId: CLAN_ID },
          index === 0 ? '[DEMO] Joueur Alpha' : `[DEMO] Joueur ${index + 1}`,
          60 - index,
          20 - Math.floor(index / 2),
          index < 4 ? 1 : 0,
          [CLAN_ID]
        ),
        index + 1
      )
    ),
    playerRounds: Array.from({ length: roundCount }, (_, index) => ({
      index: index + 1,
      scores: Array.from({ length: 25 }, (_, player) => ({ key: `player:${player + 1}`, bestPlacement: 2, totalKills: (player + index) % 5 })),
    })),
    // Clans participants et leurs noms : le filtre « Clan » des détails.
    participantClanIds: LIVE_STANDINGS.map((row) => (row.participant as { clanId: number }).clanId),
    clans: Object.fromEntries(
      LIVE_STANDINGS.map((row) => {
        const clanId = (row.participant as { clanId: number }).clanId
        return [clanId, { name: CLANS[clanId]?.name ?? `Clan ${clanId}`, tag: CLANS[clanId]?.tag ?? null }]
      })
    ),
    clanTrophy: [],
    rounds: rounds(roundCount),
    mvp: { memberId: 1, label: '[DEMO] Joueur Alpha', kills: 24, damage: 3380 },
    clanAverages: clanAverages(),
    leaders: leaders(),
    awards: awards(),
    weapons: weapons(),
    clanImages: {},
  }
}

/** Scrims internes qui commencent dans 5 h : aucune manche, classement vide. */
export function upcomingTournamentStandings() {
  const rules = { ...RULES, mode: 'intra_clan' as const }
  return {
    tournament: {
      id: UPCOMING_TOURNAMENT_ID,
      title: 'Scrims du jeudi',
      description: null,
      status: 'active',
      startDate: at(5 * 3_600_000),
      endDate: at(6 * 3_600_000),
      gameMode: 'normal-squad',
      mapName: 'Savage_Main',
      organizerClan: ORGANIZER,
      rules,
    },
    rules,
    modeStandings: [],
    squadBreakdown: [],
    clanTrophy: [],
    rounds: [],
    mvp: null,
  }
}

export function soloTournamentStandings() {
  const players = [
    summary('player:20', { kind: 'player', memberId: 20, clanId: 6 }, '[RATZ] Nova', 61, 30, 5, [6]),
    summary('player:1', { kind: 'player', memberId: 1, clanId: CLAN_ID }, '[DEMO] Joueur Alpha', 54, 26, 3, [CLAN_ID]),
    summary('player:30', { kind: 'player', memberId: 30, clanId: 9 }, '[LMT] Wolfy', 40, 18, 1, [9]),
  ]
  const rules = { ...RULES, mode: 'solo_ffa' as const }
  return {
    tournament: {
      id: SOLO_TOURNAMENT_ID,
      title: 'Solo Showdown',
      description: 'Chacun pour soi, sur Miramar.',
      status: 'finished',
      startDate: at(-20 * DAY),
      endDate: at(-14 * DAY),
      gameMode: 'normal-solo',
      mapName: 'Desert_Main',
      organizerClan: { id: 6, name: 'Les Ratz', tag: 'RATZ' },
      rules,
    },
    rules,
    modeStandings: players.map((row, index) => view(row, index + 1)),
    squadBreakdown: [],
    clanTrophy: [
      { clanId: 6, label: '[RATZ] Les Ratz', points: 61, kills: 30, players: 1 },
      { clanId: CLAN_ID, label: '[DEMO] Clan Démo', points: 54, kills: 26, players: 1 },
      { clanId: 9, label: '[LMT] La Meute', points: 40, kills: 18, players: 1 },
    ],
    rounds: [],
    mvp: { memberId: 20, label: '[RATZ] Nova', kills: 30, damage: 4100 },
  }
}

/** Membre 1 du clan démo, connecté : la page le repère (« Ton clan », « Toi »). */
export const SIGNED_IN_MEMBER_SESSION = {
  authenticated: true,
  user: { email: 'membre@example.com', isSuperUser: false },
  activeMemberId: 1,
  permissions: [],
  members: [{ memberId: 1, displayName: 'Joueur Alpha', clanId: CLAN_ID, clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' } }],
  isSuperUser: false,
}

export function mockTournaments(api: ApiMock) {
  api
    .on('GET', '/api/tournaments', { body: { tournaments: tournamentOverviews() } })
    .on('GET', `/api/tournaments/${LIVE_TOURNAMENT_ID}/standings`, { body: liveTournamentStandings() })
    .on('GET', `/api/tournaments/${SOLO_TOURNAMENT_ID}/standings`, { body: soloTournamentStandings() })
    .on('GET', `/api/tournaments/${UPCOMING_TOURNAMENT_ID}/standings`, { body: upcomingTournamentStandings() })
}

/** Owner du clan organisateur : joueur actif du clan démo, permissions `*`. */
export const ORGANIZER_OWNER_SESSION = { ...SIGNED_IN_MEMBER_SESSION, permissions: ['*'] }

/** SuperUser dont le seul joueur est aux Ratz : gère et synchronise le tournoi du clan démo (depuis le 2026-10-24). */
export const OUTSIDE_SUPERUSER_SESSION = {
  ...SIGNED_IN_MEMBER_SESSION,
  user: { email: 'admin@example.com', isSuperUser: true },
  isSuperUser: true,
  members: [{ memberId: 1, displayName: 'Admin', clanId: 6, clan: { id: 6, name: 'Les Ratz', tag: 'RATZ' } }],
}

/** Le lecteur est membre du clan démo (sans droit d'organisateur), sauf session fournie. */
export function signInAsMember(api: ApiMock, session: object = SIGNED_IN_MEMBER_SESSION) {
  api
    .on('GET', '/api/auth/mode', { body: { authDisabled: false } })
    .on('GET', '/api/members/1', { body: { avatarUrl: null } })
    .on('GET', '/api/auth/session', { body: session })
}
