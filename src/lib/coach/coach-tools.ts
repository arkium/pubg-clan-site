import { activityByDay, busiestSlot, slotLabel, type ActivityCell } from '@/lib/activity-heatmap'
import { locationForPercent } from '@/lib/city-insights'
import { LEAGUE_MATCH_TYPE_OPTIONS, leagueMatchTypeOption, parseLeagueMatchType } from '@/lib/clan-league'
import { getClanLeague, type LeagueEntry } from '@/lib/clan-league-service'
import { loadClanMapStats } from '@/lib/clan-map-stats-service'
import type { CoachToolCall, CoachToolDeclaration } from '@/lib/coach/coach-provider'
import { DEFAULT_MAP_LABELS, getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getMapLocations } from '@/lib/map-location-service'
import { sessionDateOf } from '@/lib/match-sessions'
import type { StandardPeriod } from '@/lib/period'
import { statsPeriodKeys } from '@/lib/player-dashboard'
import { prisma } from '@/lib/prisma'
import { formatClock, phaseStartTimes } from '@/lib/pubg-telemetry/debrief-view'
import { loadMatchDebriefPayload } from '@/lib/pubg-telemetry/match-debrief-payload'
import { getMapBounds } from '@/lib/pubg-telemetry/position-heatmap'
import { itemFamilyLabel, itemLabel } from '@/lib/clan-playstyle'
import { getItemUsePeriodBounds, loadItemUseStats } from '@/lib/item-use-stats'
import { getPeriodRange, getPeriodStart } from '@/lib/period'
import {
  myStanding,
  parsePlayersMode,
  PLAYER_CRITERIA,
  PLAYER_ROLES,
  PLAYERS_MODE_WHEN,
  previousRankOf,
  rankPlayers,
} from '@/lib/players-ranking'
import { getPlayersRanking } from '@/lib/players-ranking-service'
import { resolveItemName } from '@/lib/pubg-assets'
import { collectTournamentMemberIds, loadTournamentDirectories } from '@/lib/tournament-directories'
import { participantClanIds, resolveTournamentPhase, TOURNAMENT_MODE_DISPLAY, type TournamentPhase } from '@/lib/tournament-mode-display'
import { listTournamentOverviews, type TournamentOverview, type TournamentStandingSummary } from '@/lib/tournament-overview'
import { formatTournamentPeriod } from '@/lib/tournament-schedule'
import {
  computeTournamentModeStandings,
  getTournamentMatches,
  getTrackedTournamentClanIds,
  normalizeTournamentRules,
  type NormalizedTournamentRules,
} from '@/lib/tournament-service'
import { buildRoundViews, buildStandingViews, pickMvp, type TournamentStandingView } from '@/lib/tournament-standings-view'
import { getWeaponLabels, weaponDisplayName } from '@/lib/weapon-label-service'
import { aggregateMemberWeapons, throwableLabel, type MemberWeaponRow } from '@/lib/weapons/member-arsenal'

/**
 * Outils du Coach IA (docs/TODO/chatbot-ia.md §5). **Le modèle ne choisit jamais le clan ni le compte** : `clanId`,
 * le membre et ses droits sont liés ici, dans la fermeture de `createCoachTools` ; le modèle ne passe que des filtres
 * (carte, nombre de parties, arme, tag adverse, identifiant d'un match vérifié comme appartenant au clan).
 *
 * Chaque outil se borne (nombre de parties, période, taille des listes) et réutilise les services des pages : le Coach
 * ne contredit pas l'écran. Aucune donnée d'authentification ne sort d'un résultat.
 */

export type CoachToolScope = {
  clanId: number
  /** Membre actif de la session : « mes armes » par défaut. */
  memberId: number
  memberName: string
}

export type CoachTools = {
  declarations: CoachToolDeclaration[]
  run(call: CoachToolCall): Promise<unknown>
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
const RECENT_MATCHES_MAX = 10
const RECENT_MATCHES_DEFAULT = 5
const DEBRIEF_EVENTS_MAX = 60
const WEAPONS_MAX = 8
const OPPONENT_PLAYERS_MAX = 200
const DROP_ROWS_MAX = 2000
const DROP_DAYS = 90
const DROP_ZONES_MAX = 8
const LEADERBOARD_MAX = 15
const ITEMS_MAX = 10
const SCHEDULE_MATCHES_MAX = 3000
const SCHEDULE_SLOTS_MAX = 3
const TOURNAMENTS_MAX = 10
const TOURNAMENTS_DEFAULT = 5
const TOURNAMENT_STANDINGS_MAX = 20
const TOURNAMENT_ROUNDS_MAX = 15
const TOURNAMENT_ROUND_PODIUM = 3
const TOURNAMENT_DESCRIPTION_MAX = 300
const TOURNAMENT_PHASES = ['live', 'upcoming', 'finished'] as const
const TOURNAMENT_PHASE_LABELS: Record<TournamentPhase, string> = { draft: 'brouillon', upcoming: 'à venir', live: 'en cours', finished: 'terminé' }

const PERIOD_PARAMETER = {
  type: 'string',
  enum: ['week', 'month', 'all'],
  description: '« week » (cette semaine, défaut), « month » (ce mois) ou « all » (depuis toujours).',
}
const PERIOD_LABELS: Record<StandardPeriod, string> = { week: 'cette semaine', month: 'ce mois', all: 'depuis toujours' }
const LEADERBOARD_SORTS = ['kills', 'damage', 'winRate', 'kpm', 'matches'] as const
type LeaderboardSort = (typeof LEADERBOARD_SORTS)[number]

export const COACH_TOOL_DECLARATIONS: CoachToolDeclaration[] = [
  {
    name: 'getRecentMatches',
    description: 'Parties récentes du clan du joueur, de la plus récente à la plus ancienne, regroupées par soirée.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: `Nombre de parties, ${RECENT_MATCHES_MAX} au plus (${RECENT_MATCHES_DEFAULT} par défaut).` },
        mapName: { type: 'string', description: 'Carte (Erangel, Miramar, Sanhok, Taego, Vikendi, Deston, Rondo…), facultatif.' },
      },
    },
  },
  {
    name: 'getMatchDebrief',
    description: "Débriefing d'une partie du clan : phases, mises à terre, kills, morts, réanimations, distances, dégâts par membre.",
    parameters: {
      type: 'object',
      properties: { matchId: { type: 'string', description: "Identifiant de la partie (page consultée ou getRecentMatches)." } },
      required: ['matchId'],
    },
  },
  {
    name: 'getWeaponStats',
    description: "Statistiques d'armes d'un membre du clan (kills, précision, tirs à la tête, distances) ; le joueur lui-même par défaut.",
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan, facultatif.' },
        weaponCategory: { type: 'string', description: 'Catégorie : AR, DMR, SR, SMG, LMG, SG (fusils à pompe), PISTOL, THROWABLE, MELEE, SPECIAL — facultatif.' },
        period: { type: 'string', enum: ['all', 'month'], description: '« all » (défaut) ou « month » (mois en cours).' },
      },
    },
  },
  {
    name: 'getOpponentRecord',
    description: "Bilan du clan du joueur face à un clan adverse : kills échangés, joueurs adverses les plus dangereux, dernière rencontre.",
    parameters: {
      type: 'object',
      properties: { clanTag: { type: 'string', description: 'Tag du clan adverse, avec ou sans crochets.' } },
      required: ['clanTag'],
    },
  },
  {
    name: 'getDropZones',
    description: `Zones de largage du clan sur une carte (${DROP_DAYS} derniers jours) : villes, fréquence, pression à l'atterrissage, placements obtenus.`,
    parameters: {
      type: 'object',
      properties: { mapName: { type: 'string', description: 'Carte.' } },
      required: ['mapName'],
    },
  },
  {
    name: 'getClanLeaderboard',
    description:
      "Classement des membres du clan sur la période (parties officielles, agrégats recalculés chaque nuit) : parties, kills, dégâts, K/M, win rate, temps de jeu, jours actifs, badge. Pour comparer les membres, repérer qui porte l'escouade ou qui décroche, et situer le joueur.",
    parameters: {
      type: 'object',
      properties: {
        period: PERIOD_PARAMETER,
        sortBy: { type: 'string', enum: [...LEADERBOARD_SORTS], description: 'Critère de tri : kills (défaut), damage, winRate, kpm (kills par partie), matches.' },
      },
    },
  },
  {
    name: 'getLeagueStanding',
    description:
      "Position du clan dans la Ligue des clans (Power score, parties officielles) : rang, score, rang précédent, clans juste devant et juste derrière, moyennes de la ligue — ou les parties manquantes pour être classé.",
    parameters: {
      type: 'object',
      properties: { period: PERIOD_PARAMETER },
    },
  },
  {
    name: 'getTournaments',
    description:
      "Tournois du site (parties personnalisées organisées par un clan : inter-clans, équipes, solo ou scrims internes), du plus récent au plus ancien : identifiant, titre, mode, dates, organisateur, manches, vainqueur ou leader, podium, place du clan du joueur quand elle est connue. Pour « qui a gagné le tournoi ? », « quand est le prochain ? » ; puis getTournamentResults avec l'identifiant pour le détail.",
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: [...TOURNAMENT_PHASES], description: '« live » (en cours), « upcoming » (à venir) ou « finished » (terminés) ; sans filtre, tous.' },
        search: { type: 'string', description: 'Mots du titre du tournoi, pour le retrouver.' },
        limit: { type: 'integer', description: 'Nombre de tournois (défaut 5, 10 au plus).' },
      },
    },
  },
  {
    name: 'getTournamentResults',
    description:
      "Détail d'un tournoi : barème, classement complet selon le mode (points, kills, Top 1, place moyenne), place du clan du joueur, chaque manche (carte, vainqueur, MVP, podium de la manche, score du clan du joueur), MVP du tournoi. L'identifiant vient de getTournaments ou de la page consultée.",
    parameters: {
      type: 'object',
      properties: { tournamentId: { type: 'string', description: 'Identifiant du tournoi.' } },
      required: ['tournamentId'],
    },
  },
  {
    name: 'getItemUsage',
    description:
      "Ce que le joueur (ou un autre membre du clan) consomme et lance en partie — ce qu'il appelle son « loot », son sac ou ses consommables : soins, boosts, carburant, gadgets, objet par objet et par partie, comparé au clan ; grenades et autres lancers. Pour « et mon loot ? », « je me soigne assez ? », « combien de grenades je lance ? ». Le site ne connaît pas le contenu du sac ni les munitions, armures et accessoires ramassés.",
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan, facultatif.' },
        period: PERIOD_PARAMETER,
      },
    },
  },
  {
    name: 'getMapPerformance',
    description:
      "Performance du clan carte par carte (parties d'escouade, mêmes règles que la page « Cartes ») : parties, Top 1, win rate, Top 10, place moyenne, kills et dégâts par partie, écart à la moyenne des clans, tendance depuis la période précédente, joueur phare ; verdict (carte forte, carte à travailler, carte la plus jouée). Pour « notre pire carte ? », « pourquoi on perd sur Rondo ? », « on est meilleurs où ? ».",
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['week', 'month', 'all'], description: '« month » (ce mois, défaut), « week » (cette semaine) ou « all » (depuis toujours).' },
        matchType: {
          type: 'string',
          enum: LEAGUE_MATCH_TYPE_OPTIONS.map((option) => option.value),
          description: LEAGUE_MATCH_TYPE_OPTIONS.map((option) => `« ${option.value} » : ${option.hint}`).join(' ; ') + ' ; défaut official.',
        },
        mapName: { type: 'string', description: 'Une seule carte (Erangel, Miramar, Rondo…), facultatif.' },
      },
    },
  },
  {
    name: 'getPlaySchedule',
    description:
      "Quand le joueur (ou le clan) joue : parties par jour de la semaine et par heure (heure de Paris), créneaux favoris, plage horaire habituelle en semaine et le week-end, soirées actives, temps de jeu et parties par soirée. Pour « mon horaire de jeu ? », « quand est-ce qu'on joue le plus ? », « combien de soirées par semaine ? ».",
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan, facultatif.' },
        scope: { type: 'string', enum: ['player', 'clan'], description: '« player » (le joueur, défaut) ou « clan » (toutes les parties d’escouade du clan).' },
        period: { type: 'string', enum: ['week', 'month', 'all'], description: '« all » (depuis toujours, défaut), « month » (ce mois) ou « week » (cette semaine).' },
      },
    },
  },
  {
    name: 'getPlayerBenchmark',
    description:
      "Où le joueur se situe parmi les joueurs de tous les clans suivis (classement inter-clans « Joueurs », parties officielles de clan) : rang et part des joueurs dépassés pour chaque critère (dégâts, kills, knocks, réanimations, survie), scores de rôle sur 100 — Fragger, Medic, Ghost, Tireur à distance — qui sont des centiles entre clans, le joueur juste devant et l'écart, rang de la période précédente. Pour « où je me situe ? », « je suis bon ? », « quel est mon rôle ? ».",
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan, facultatif.' },
        period: { type: 'string', enum: ['week', 'month', 'all'], description: '« week » (cette semaine, défaut), « month » (ce mois) ou « all » (depuis toujours).' },
        mode: { type: 'string', enum: ['all', 'duo', 'squad'], description: '« all » (tous modes, défaut), « duo » ou « squad ».' },
      },
    },
  },
]

const PARIS_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short', hour: 'numeric', hour12: false })
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
const WEEKDAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

/** Jour (lundi = 0) et heure de Paris d'un instant. */
export function parisSlot(at: Date): { dayIndex: number; hour: number } {
  const parts = PARIS_PARTS.formatToParts(at)
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon'
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24
  return { dayIndex: WEEKDAY_INDEX[weekday] ?? 0, hour }
}

/** Plage habituelle d'un ensemble d'heures : du 20e au 80e centile ; les heures après minuit suivent la soirée. */
function hourWindow(hours: readonly number[]): string | null {
  if (hours.length < 3) return null
  const sorted = hours.map((hour) => (hour < 6 ? hour + 24 : hour)).sort((a, b) => a - b)
  const at = (quantile: number) => sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)]
  const label = (hour: number) => `${String(hour % 24).padStart(2, '0')}h`
  return `${label(at(0.2))}–${label(at(0.8) + 1)}`
}

export type SchedulePlay = { playedAt: Date; durationSeconds: number; placement: number }

/** Calendrier d'activité d'un ensemble de parties (la page « Calendrier d'activité », en heure de Paris). Pur. */
export function buildPlaySchedule(plays: readonly SchedulePlay[]) {
  const cells = new Map<string, ActivityCell>()
  const byDay = Array.from({ length: 7 }, () => ({ matches: 0, wins: 0 }))
  const weekdayHours: number[] = []
  const weekendHours: number[] = []
  const sessions = new Set<string>()
  let playtimeSeconds = 0
  for (const play of plays) {
    const { dayIndex, hour } = parisSlot(play.playedAt)
    const key = `${dayIndex}-${hour}`
    const cell = cells.get(key) ?? { dayIndex, hour, count: 0 }
    cell.count += 1
    cells.set(key, cell)
    byDay[dayIndex].matches += 1
    if (play.placement === 1) byDay[dayIndex].wins += 1
    // La nuit du vendredi (01:00 samedi) est une soirée de semaine : la journée de jeu commence à 06:00.
    const sessionDay = parisSlot(new Date(play.playedAt.getTime() - 6 * 60 * 60 * 1000)).dayIndex
    ;(sessionDay <= 4 ? weekdayHours : weekendHours).push(hour)
    sessions.add(sessionDateOf(play.playedAt))
    playtimeSeconds += Math.max(0, play.durationSeconds)
  }
  const all = [...cells.values()]
  const total = plays.length
  const activeDays = sessions.size
  const favorites: Array<{ slot: string; matches: number }> = []
  const remaining = [...all]
  while (favorites.length < SCHEDULE_SLOTS_MAX) {
    const best = busiestSlot(remaining)
    if (!best) break
    favorites.push({ slot: slotLabel(best), matches: best.count })
    remaining.splice(remaining.indexOf(best), 1)
  }
  const dayTotals = activityByDay(all)
  return {
    matches: total,
    activeDays,
    playtimeHours: round1(playtimeSeconds / 3600),
    perActiveDay: activeDays > 0 ? { matches: round1(total / activeDays), hours: round1(playtimeSeconds / 3600 / activeDays) } : null,
    byWeekday: WEEKDAY_NAMES.map((day, index) => ({
      day,
      matches: dayTotals[index],
      sharePercent: total > 0 ? Math.round((dayTotals[index] / total) * 100) : 0,
      wins: byDay[index].wins,
    })),
    favoriteSlots: favorites,
    usualHours: { weekdays: hourWindow(weekdayHours), weekend: hourWindow(weekendHours) },
    weekSplit: {
      weekdaysPercent: total > 0 ? Math.round((weekdayHours.length / total) * 100) : 0,
      weekendPercent: total > 0 ? Math.round((weekendHours.length / total) * 100) : 0,
    },
  }
}

type ToolArgs = Record<string, unknown>

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Math.floor(Number(value))
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}
const round1 = (value: number) => Math.round(value * 10) / 10
const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** « Erangel (Remastered) » → « erangel » : le joueur dit le nom de la carte, pas son suffixe. */
const mapKeyword = (label: string) => normalizeText(label.replace(/\s*\(.*\)\s*$/, ''))

/** Noms bruts de carte dont l'étiquette (ou le nom brut) correspond au nom demandé. */
function resolveMapNames(requested: string, labels: Record<string, string>): string[] {
  const wanted = mapKeyword(requested)
  if (!wanted) return []
  const rawNames = new Set([...Object.keys(DEFAULT_MAP_LABELS), ...Object.keys(labels)])
  return [...rawNames].filter((raw) => mapKeyword(mapDisplayName(raw, labels)) === wanted || normalizeText(raw) === wanted)
}

const parsePeriod = (value: unknown): StandardPeriod => (value === 'month' || value === 'all' ? value : 'week')

/**
 * La Ligue se recalcule pour tous les clans à chaque lecture (~1,4 s mesuré) et ne change qu'à l'import des parties :
 * cinq minutes de cache par période, partagées par toutes les questions.
 */
const LEAGUE_CACHE_TTL_MS = 5 * 60_000
const leagueCache = new Map<StandardPeriod, { at: number; payload: Awaited<ReturnType<typeof getClanLeague>> }>()

async function cachedLeague(period: StandardPeriod, now = Date.now()) {
  const cached = leagueCache.get(period)
  if (cached && now - cached.at < LEAGUE_CACHE_TTL_MS) return cached.payload
  const payload = await getClanLeague(period, 'official')
  leagueCache.set(period, { at: now, payload })
  return payload
}

/** Les aperçus de tournois recalculent le classement de chaque tournoi (quelques dizaines) : mêmes 5 minutes. */
let tournamentOverviewsCache: { at: number; payload: TournamentOverview[] } | null = null

async function cachedTournamentOverviews(now = Date.now()) {
  if (tournamentOverviewsCache && now - tournamentOverviewsCache.at < LEAGUE_CACHE_TTL_MS) return tournamentOverviewsCache.payload
  const payload = await listTournamentOverviews(new Date(now))
  tournamentOverviewsCache = { at: now, payload }
  return payload
}

/** Tests : repart des caches vides (Ligue et aperçus de tournois). */
export function resetCoachLeagueCache() {
  leagueCache.clear()
  tournamentOverviewsCache = null
}

function monthPeriodKey(now = new Date()) {
  return `month-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

type CombatEventLike = {
  type: string
  timestamp: number
  phaseNumber: number
  actorName?: string
  actorClanTag?: string | null
  targetName?: string
  targetClanTag?: string | null
  weaponName?: string
  distanceMeters?: number | null
  isSquadActor?: boolean
  isSquadTarget?: boolean
}

export function createCoachTools(scope: CoachToolScope): CoachTools {
  /** Le joueur de la session, ou un autre membre **du clan** par son pseudo — jamais un identifiant venu du modèle. */
  async function resolveMember(playerName: unknown): Promise<{ memberId: number; memberName: string } | { error: string; message: string }> {
    const name = text(playerName)
    if (!name || normalizeText(name) === normalizeText(scope.memberName)) return { memberId: scope.memberId, memberName: scope.memberName }
    const member = await prisma.clanMember.findFirst({
      where: { clanId: scope.clanId, isActive: true, OR: [{ displayName: name }, { pubgPlayerName: name }] },
      select: { id: true, displayName: true },
    })
    if (!member) return { error: 'player_not_found', message: `Aucun membre du clan ne s'appelle ${name}.` }
    return { memberId: member.id, memberName: member.displayName }
  }

  async function getRecentMatches(args: ToolArgs) {
    const take = clampInt(args.limit, 1, RECENT_MATCHES_MAX, RECENT_MATCHES_DEFAULT)
    const labels = await getMapLabels()
    const requestedMap = text(args.mapName)
    const rawMaps = requestedMap ? resolveMapNames(requestedMap, labels) : []
    if (requestedMap && rawMaps.length === 0) return { error: 'map_not_found', message: `Carte inconnue : ${requestedMap}.` }

    const matches = await prisma.squadMatch.findMany({
      where: {
        members: { some: { member: { clanId: scope.clanId } } },
        ...(rawMaps.length > 0 ? { mapName: { in: rawMaps } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        mapName: true,
        gameMode: true,
        matchType: true,
        placement: true,
        createdAt: true,
        totalKills: true,
        totalDamage: true,
        members: { select: { member: { select: { displayName: true } } } },
        telemetry: { select: { status: true } },
      },
    })
    return {
      matches: matches.map((match) => ({
        matchId: match.id,
        map: mapDisplayName(match.mapName, labels),
        session: sessionDateOf(match.createdAt),
        startedAt: match.createdAt.toISOString(),
        gameMode: match.gameMode,
        matchType: match.matchType,
        placement: match.placement,
        squadKills: match.totalKills,
        squadDamage: Math.round(match.totalDamage),
        squad: match.members.map((entry) => entry.member.displayName),
        telemetryAnalyzed: match.telemetry?.status === 'success',
      })),
    }
  }

  async function getMatchDebrief(args: ToolArgs) {
    const matchId = text(args.matchId)
    if (!SAFE_ID.test(matchId)) return { error: 'match_not_found', message: 'Identifiant de partie invalide.' }
    const payload = await loadMatchDebriefPayload({ matchId, accessClanId: scope.clanId, clanId: scope.clanId })
    if (!payload) return { error: 'match_not_found', message: 'Aucune partie du clan avec cet identifiant.' }

    const labels = await getMapLabels()
    const header = {
      matchId: payload.match.id,
      map: mapDisplayName(payload.match.mapName, labels),
      startedAt: payload.match.createdAt,
      session: sessionDateOf(payload.match.createdAt),
      gameMode: payload.match.gameMode,
      matchType: payload.match.matchType,
      placement: payload.match.placement,
      durationSeconds: payload.match.durationSeconds,
      squadKills: payload.match.totalKills,
      squadDamage: Math.round(payload.match.totalDamage),
    }
    if (payload.telemetry.status !== 'success') {
      return { ...header, telemetryAnalyzed: false, message: 'Télémétrie pas encore analysée : pas de déroulé disponible.' }
    }

    const weaponLabels = payload.weaponLabels ?? {}
    const squadEvents = ((payload.combatEvents ?? []) as CombatEventLike[]).filter((event) => event.isSquadActor || event.isSquadTarget)
    const opponentClans = new Set<string>()
    for (const event of squadEvents) {
      if (!event.isSquadActor && event.actorClanTag) opponentClans.add(event.actorClanTag)
      if (!event.isSquadTarget && event.targetClanTag) opponentClans.add(event.targetClanTag)
    }
    return {
      ...header,
      telemetryAnalyzed: true,
      phases: phaseStartTimes(payload.telemetry.phaseSnapshots).map((entry) => ({ phase: entry.phase, start: formatClock(entry.t) })),
      squad: payload.squadMates.map((mate) => ({
        name: mate.name,
        clanTag: mate.clanTag,
        kills: mate.kills,
        damage: Math.round(mate.damage),
        knockouts: mate.knockouts,
        revives: mate.revives,
        deaths: mate.deaths,
        damageTaken: Math.round(mate.damageTaken),
      })),
      events: squadEvents.slice(0, DEBRIEF_EVENTS_MAX).map((event) => ({
        time: formatClock(event.timestamp),
        phase: event.phaseNumber,
        type: event.type,
        actor: event.actorName ?? null,
        actorClan: event.actorClanTag ?? null,
        target: event.targetName ?? null,
        targetClan: event.targetClanTag ?? null,
        weapon: event.weaponName ? weaponDisplayName(event.weaponName, weaponLabels) : null,
        distanceM: typeof event.distanceMeters === 'number' ? Math.round(event.distanceMeters) : null,
        bySquad: Boolean(event.isSquadActor),
        onSquad: Boolean(event.isSquadTarget),
      })),
      eventsTruncated: squadEvents.length > DEBRIEF_EVENTS_MAX,
      opponentClans: [...opponentClans],
    }
  }

  async function getWeaponStats(args: ToolArgs) {
    const resolved = await resolveMember(args.playerName)
    if ('error' in resolved) return resolved
    const { memberId, memberName } = resolved
    const period = text(args.period) === 'month' ? 'month' : 'all'
    const periodKey = period === 'month' ? monthPeriodKey() : 'all-time'
    const [rows, weaponLabels] = await Promise.all([
      prisma.memberWeaponStats.findMany({
        where: { memberId, period: periodKey },
        orderBy: { kills: 'desc' },
        select: { weaponName: true, kills: true, headshots: true, shotsFired: true, hitsLanded: true, avgDistance: true, maxDistance: true, matchCount: true },
      }),
      getWeaponLabels(),
    ])
    const memberRows: MemberWeaponRow[] = rows.map((row) => ({
      weaponName: row.weaponName,
      weaponLabel: weaponDisplayName(row.weaponName, weaponLabels),
      kills: row.kills,
      headshots: row.headshots,
      shotsFired: row.shotsFired,
      hitsLanded: row.hitsLanded,
      avgDistance: row.avgDistance / 100,
      maxDistance: row.maxDistance > 0 ? row.maxDistance / 100 : null,
      matchCount: row.matchCount,
    }))
    const category = text(args.weaponCategory).toUpperCase()
    const weapons = aggregateMemberWeapons(memberRows).filter((weapon) => !category || weapon.category === category)
    return {
      player: memberName,
      period: period === 'month' ? 'mois en cours' : 'depuis toujours',
      weapons: weapons.slice(0, WEAPONS_MAX).map((weapon) => ({
        weapon: weapon.name,
        category: weapon.category,
        matches: weapon.matchCount,
        kills: weapon.kills,
        killsPerMatch: weapon.matchCount > 0 ? Math.round((weapon.kills / weapon.matchCount) * 100) / 100 : null,
        headshotRatePercent: weapon.headshotRate !== null ? Math.round(weapon.headshotRate) : null,
        accuracyPercent: weapon.accuracy !== null ? Math.round(weapon.accuracy) : null,
        avgDistanceM: weapon.avgDistance !== null ? Math.round(weapon.avgDistance) : null,
        maxDistanceM: weapon.maxDistance !== null ? Math.round(weapon.maxDistance) : null,
      })),
      weaponsTruncated: weapons.length > WEAPONS_MAX,
    }
  }

  async function getOpponentRecord(args: ToolArgs) {
    const clanTag = text(args.clanTag).replace(/^\[|\]$/g, '').trim()
    if (!clanTag || clanTag.length > 16) return { error: 'clan_not_found', message: 'Tag de clan invalide.' }
    const opponent = await prisma.opponentClan.findFirst({
      where: { tag: clanTag },
      select: { tag: true, name: true, players: { select: { id: true, pubgAccountId: true, pubgPlayerName: true }, take: OPPONENT_PLAYERS_MAX } },
    })
    if (!opponent || opponent.players.length === 0) return { error: 'clan_not_found', message: `Aucun clan adverse connu avec le tag ${clanTag}.` }

    const accountIds = opponent.players.map((player) => player.pubgAccountId)
    const nameOf = new Map(opponent.players.map((player) => [player.pubgAccountId, player.pubgPlayerName]))
    const theirKills = { clanId: scope.clanId, victimMemberId: { not: null }, killerAccountId: { in: accountIds } }
    const ourKills = { clanId: scope.clanId, killerMemberId: { not: null }, victimAccountId: { in: accountIds } }
    const [killsOnThem, deathsToThem, killers, weapons, matches, encounters] = await Promise.all([
      prisma.killEvent.count({ where: ourKills }),
      prisma.killEvent.count({ where: theirKills }),
      prisma.killEvent.groupBy({ by: ['killerAccountId'], where: theirKills, _count: { _all: true }, orderBy: { _count: { killerAccountId: 'desc' } }, take: 3 }),
      prisma.killEvent.groupBy({ by: ['weaponName'], where: theirKills, _count: { _all: true }, orderBy: { _count: { weaponName: 'desc' } }, take: 3 }),
      prisma.killEvent.findMany({ where: { OR: [ourKills, theirKills] }, select: { squadMatchId: true }, distinct: ['squadMatchId'] }),
      prisma.clanEncounter.aggregate({ _max: { lastSeenAt: true }, where: { clanId: scope.clanId, playerId: { in: opponent.players.map((player) => player.id) } } }),
    ])
    const weaponLabels = await getWeaponLabels()
    return {
      clan: { tag: opponent.tag, name: opponent.name },
      playersKnown: opponent.players.length,
      matchesWithFights: matches.length,
      killsOnThem,
      deathsToThem,
      topKillers: killers.map((row) => ({ player: (row.killerAccountId && nameOf.get(row.killerAccountId)) ?? 'Joueur inconnu', kills: row._count._all })),
      theirWeapons: weapons.map((row) => ({ weapon: row.weaponName ? weaponDisplayName(row.weaponName, weaponLabels) : 'Arme inconnue', kills: row._count._all })),
      lastEncounter: encounters._max.lastSeenAt?.toISOString() ?? null,
    }
  }

  async function getDropZones(args: ToolArgs) {
    const requested = text(args.mapName)
    const labels = await getMapLabels()
    const rawMaps = resolveMapNames(requested, labels)
    if (rawMaps.length === 0) return { error: 'map_not_found', message: `Carte inconnue : ${requested || '(vide)'}.` }
    const since = new Date(Date.now() - DROP_DAYS * 24 * 60 * 60 * 1000)
    const [rows, locations] = await Promise.all([
      prisma.dropPressureStat.findMany({
        where: { member: { clanId: scope.clanId }, mapName: { in: rawMaps }, matchDate: { gte: since } },
        orderBy: { matchDate: 'desc' },
        take: DROP_ROWS_MAX,
        select: { squadMatchId: true, mapName: true, x: true, y: true, nearbyPlayerCount250m: true, pressureLevel: true, squadMatch: { select: { placement: true } } },
      }),
      getMapLocations(),
    ])

    // Une escouade atterrit ensemble : une ligne par partie suffit (la première rencontrée, la plus récente).
    const byMatch = new Map<string, (typeof rows)[number]>()
    for (const row of rows) if (!byMatch.has(row.squadMatchId)) byMatch.set(row.squadMatchId, row)

    type Zone = { landings: number; nearby: number; hot: number; placements: number[] }
    const zones = new Map<string, Zone>()
    for (const row of byMatch.values()) {
      const bounds = getMapBounds(row.mapName)
      const city = locationForPercent((row.x / bounds.width) * 100, (row.y / bounds.height) * 100, locations[row.mapName] ?? [])
      const key = city?.name ?? 'Hors ville'
      const zone = zones.get(key) ?? { landings: 0, nearby: 0, hot: 0, placements: [] }
      zone.landings += 1
      zone.nearby += row.nearbyPlayerCount250m
      if (row.pressureLevel === 'hot' || row.pressureLevel === 'very_hot') zone.hot += 1
      zone.placements.push(row.squadMatch.placement)
      zones.set(key, zone)
    }
    const ranked = [...zones.entries()]
      .sort((a, b) => b[1].landings - a[1].landings)
      .map(([zone, stats]) => ({
        zone,
        landings: stats.landings,
        avgNearbyPlayers250m: Math.round((stats.nearby / stats.landings) * 10) / 10,
        hotDropPercent: Math.round((stats.hot / stats.landings) * 100),
        avgPlacement: Math.round((stats.placements.reduce((sum, value) => sum + value, 0) / stats.placements.length) * 10) / 10,
        top10Percent: Math.round((stats.placements.filter((placement) => placement <= 10).length / stats.placements.length) * 100),
        winPercent: Math.round((stats.placements.filter((placement) => placement === 1).length / stats.placements.length) * 100),
      }))
    return {
      map: mapDisplayName(rawMaps[0], labels),
      days: DROP_DAYS,
      matches: byMatch.size,
      zones: ranked.slice(0, DROP_ZONES_MAX),
      zonesTruncated: ranked.length > DROP_ZONES_MAX,
    }
  }

  async function getClanLeaderboard(args: ToolArgs) {
    const period = parsePeriod(args.period)
    const requestedSort = text(args.sortBy) as LeaderboardSort
    const sortBy: LeaderboardSort = LEADERBOARD_SORTS.includes(requestedSort) ? requestedSort : 'kills'
    const { current } = statsPeriodKeys(period, new Date())
    const rows = await prisma.playerStats.findMany({
      where: { period: current, member: { clanId: scope.clanId, isActive: true } },
      select: {
        memberId: true,
        totalKills: true,
        totalKnockouts: true,
        totalDamage: true,
        totalAssists: true,
        totalRevives: true,
        matchesPlayed: true,
        matchesWon: true,
        avgKillsPerGame: true,
        avgDamagePerGame: true,
        timePlayedSeconds: true,
        activeDays: true,
        badgeType: true,
        updatedAt: true,
        member: { select: { displayName: true } },
      },
    })
    const entries = rows
      .filter((row) => row.matchesPlayed > 0)
      .map((row) => ({
        memberId: row.memberId,
        player: row.member.displayName,
        matches: row.matchesPlayed,
        wins: row.matchesWon,
        winRatePercent: Math.round((row.matchesWon / row.matchesPlayed) * 100),
        kills: row.totalKills,
        knockouts: row.totalKnockouts,
        assists: row.totalAssists,
        revives: row.totalRevives,
        damage: Math.round(row.totalDamage),
        killsPerMatch: Math.round(row.avgKillsPerGame * 100) / 100,
        damagePerMatch: Math.round(row.avgDamagePerGame),
        timePlayedHours: Math.round((row.timePlayedSeconds / 3600) * 10) / 10,
        activeDays: row.activeDays,
        badge: row.badgeType,
      }))
    const value = (entry: (typeof entries)[number]) =>
      sortBy === 'damage' ? entry.damage : sortBy === 'winRate' ? entry.winRatePercent : sortBy === 'kpm' ? entry.killsPerMatch : sortBy === 'matches' ? entry.matches : entry.kills
    entries.sort((a, b) => value(b) - value(a) || b.matches - a.matches)
    const ranked = entries.map((entry, index) => ({ rank: index + 1, ...entry }))
    const you = ranked.find((entry) => entry.memberId === scope.memberId) ?? null
    // L'identifiant interne sert à retrouver le joueur, pas au modèle.
    const strip = (entry: (typeof ranked)[number]) => {
      const { memberId, ...rest } = entry
      void memberId
      return rest
    }
    const updatedAt = rows.reduce<Date | null>((latest, row) => (!latest || row.updatedAt > latest ? row.updatedAt : latest), null)
    return {
      period: PERIOD_LABELS[period],
      sortBy,
      membersRanked: ranked.length,
      members: ranked.slice(0, LEADERBOARD_MAX).map(strip),
      membersTruncated: ranked.length > LEADERBOARD_MAX,
      you: you ? strip(you) : null,
      updatedAt: updatedAt?.toISOString() ?? null,
      note: 'Parties officielles ; agrégats recalculés chaque nuit, la soirée en cours peut manquer.',
    }
  }

  async function getLeagueStanding(args: ToolArgs) {
    const period = parsePeriod(args.period)
    const league = await cachedLeague(period)
    const summarize = (entry: LeagueEntry) => ({
      rank: entry.rank,
      tag: entry.tag,
      name: entry.name,
      powerScore: Math.round(entry.powerScore * 10) / 10,
      matches: entry.matches,
      wins: entry.wins,
      winRatePercent: entry.matches > 0 ? Math.round((entry.wins / entry.matches) * 100) : 0,
      avgPlacementPoints: Math.round(entry.avgPlacementPoints * 10) / 10,
      avgDamage: Math.round(entry.avgDamage),
      avgKills: Math.round(entry.avgKills * 100) / 100,
      avgKnocks: Math.round(entry.avgKnocks * 100) / 100,
    })
    const index = league.standings.findIndex((entry) => entry.clanId === scope.clanId)
    const base = { period: PERIOD_LABELS[period], clansRanked: league.standings.length, minMatches: league.scoring.minMatches }
    if (index === -1) {
      const qualifying = league.qualifying.find((entry) => entry.clanId === scope.clanId)
      if (qualifying) {
        return { ...base, ranked: false, matches: qualifying.matches, required: qualifying.required, message: `Encore ${qualifying.required - qualifying.matches} partie(s) officielle(s) pour être classé.` }
      }
      return { ...base, ranked: false, matches: 0, message: 'Aucune partie officielle du clan sur la période.' }
    }
    const own = league.standings[index]
    return {
      ...base,
      ranked: true,
      clan: { ...summarize(own), previousRank: own.previousRank, activeMembers: own.activeMembers },
      above: index > 0 ? summarize(league.standings[index - 1]) : null,
      below: index < league.standings.length - 1 ? summarize(league.standings[index + 1]) : null,
      leagueAverage: {
        avgPlacementPoints: Math.round(league.scoring.league.avgPlacementPoints * 10) / 10,
        avgDamage: Math.round(league.scoring.league.avgDamage),
        avgKills: Math.round(league.scoring.league.avgKills * 100) / 100,
        avgKnocks: Math.round(league.scoring.league.avgKnocks * 100) / 100,
      },
    }
  }

  async function getItemUsage(args: ToolArgs) {
    const resolved = await resolveMember(args.playerName)
    if ('error' in resolved) return resolved
    const { memberId, memberName } = resolved
    const requested = text(args.period)
    const period: StandardPeriod = requested === 'week' || requested === 'month' ? requested : 'all'
    const bounds = getItemUsePeriodBounds(period)
    const range = period === 'all' ? null : getPeriodRange(period)
    // Mêmes lectures que la page « Objets consommés » du joueur (sans la famille `None` : puce bleue, clés, badge).
    const [own, clan, throwRows] = await Promise.all([
      loadItemUseStats({ memberId, period, bounds, excludeSubCategories: ['None'] }),
      loadItemUseStats({ clanId: scope.clanId, period, bounds, excludeSubCategories: ['None'] }),
      prisma.memberThrowableStat.groupBy({
        by: ['itemId'],
        where: { memberId, ...(range ? { matchDate: { gte: range.start, lt: range.end } } : {}) },
        _sum: { count: true },
      }),
    ])
    const perMatch = (count: number, matches: number) => (matches > 0 ? round1(count / matches) : 0)
    // Moyenne du clan par joueur et par partie : chaque membre apporte ses parties, pas une partie par escouade.
    const clanMemberMatches = clan.members.reduce((sum, member) => sum + (member.perMatch > 0 ? member.count / member.perMatch : 0), 0)
    const rank = clan.members.findIndex((member) => member.memberId === memberId)
    const thrown = throwRows
      .map((row) => ({ item: throwableLabel(row.itemId), count: row._sum.count ?? 0 }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
    return {
      player: memberName,
      period: PERIOD_LABELS[period],
      consumed: {
        matches: own.matchCount,
        total: own.totalCount,
        perMatch: perMatch(own.totalCount, own.matchCount),
        since: own.dataStart,
        families: own.families.map((family) => ({
          family: itemFamilyLabel(family.subCategory),
          count: family.count,
          sharePercent: Math.round(family.share),
          perMatch: perMatch(family.count, own.matchCount),
        })),
        items: own.items.slice(0, ITEMS_MAX).map((item) => ({
          item: itemLabel(item.itemId, resolveItemName),
          family: itemFamilyLabel(item.subCategory),
          count: item.count,
          perMatch: perMatch(item.count, own.matchCount),
        })),
      },
      clan: {
        perMatch: perMatch(clan.totalCount, clanMemberMatches),
        membersCounted: clan.members.length,
        rankByVolume: rank === -1 ? null : rank + 1,
        topConsumer: clan.members[0] ? { player: clan.members[0].displayName, perMatch: round1(clan.members[0].perMatch) } : null,
      },
      thrown: { total: thrown.reduce((sum, row) => sum + row.count, 0), items: thrown.slice(0, ITEMS_MAX) },
      note: 'Le site compte ce qui est consommé (soins, boosts, carburant, gadgets) et lancé (grenades) dans les parties analysées, pas le contenu du sac ni les munitions, armures et accessoires ramassés. Détail par objet seulement pour les parties analysées depuis le 18 septembre 2026.',
    }
  }

  async function getMapPerformance(args: ToolArgs) {
    const requested = text(args.period)
    const period: StandardPeriod = requested === 'week' || requested === 'all' ? requested : 'month'
    const matchType = parseLeagueMatchType(text(args.matchType) || null)
    const requestedMap = text(args.mapName)
    const [payload, labels] = await Promise.all([loadClanMapStats({ clanId: scope.clanId, period, matchType }), getMapLabels()])
    if (!payload) return { error: 'clan_not_found', message: 'Clan introuvable.' }
    const rawMaps = requestedMap ? resolveMapNames(requestedMap, labels) : []
    if (requestedMap && rawMaps.length === 0) return { error: 'map_not_found', message: `Carte inconnue : ${requestedMap}.` }

    const pct = (rate: number) => Math.round(rate * 100)
    const nullable = (value: number | null) => (value === null ? null : round1(value))
    const maps = payload.maps
      .filter((row) => rawMaps.length === 0 || rawMaps.includes(row.mapName))
      .sort((a, b) => b.matches - a.matches)
      .map((row) => ({
        map: row.mapLabel,
        matches: row.matches,
        wins: row.wins,
        winRatePercent: pct(row.winRate),
        top10Percent: pct(row.top10Rate),
        avgPlacement: round1(row.avgPlacement),
        killsPerMatch: round1(row.killsPerMatch),
        damagePerMatch: Math.round(row.damagePerMatch),
        lowSample: row.lowSample,
        vsClans: row.lowSample
          ? null
          : { top10Pts: nullable(row.vsClans.top10Pts), avgPlacement: nullable(row.vsClans.avgPlacement), killsPerMatch: nullable(row.vsClans.killsPerMatch) },
        top10TrendPts: nullable(row.top10TrendPts),
        starPlayer: row.starPlayer ? { player: row.starPlayer.displayName, killsPerMatch: round1(row.starPlayer.killsPerMatch), matches: row.starPlayer.matches } : null,
      }))
    const { verdict } = payload
    return {
      period: PERIOD_LABELS[period],
      matchType: leagueMatchTypeOption(matchType).label,
      comparedClans: payload.comparedClans,
      minSample: payload.minSample,
      totals: payload.totals,
      verdict: {
        strongest: verdict.strongest ? { map: verdict.strongest.mapLabel, top10Percent: pct(verdict.strongest.top10Rate), vsClansPts: round1(verdict.strongest.vsClansPts) } : null,
        weakest: verdict.weakest
          ? { map: verdict.weakest.mapLabel, top10Percent: pct(verdict.weakest.top10Rate), vsClansPts: round1(verdict.weakest.vsClansPts), trendPts: nullable(verdict.weakest.trendPts) }
          : null,
        mostPlayed: verdict.mostPlayed ? { map: verdict.mostPlayed.mapLabel, matches: verdict.mostPlayed.matches, sharePercent: pct(verdict.mostPlayed.share) } : null,
      },
      maps,
      note: `Une partie = une partie d'escouade du clan ; « vsClans » = écart à la moyenne des ${payload.comparedClans} clans suivis (Top 10 en points, place et kills dans leur unité) ; sous ${payload.minSample} parties sur une carte, ni écart, ni tendance, ni joueur phare.`,
    }
  }

  async function getPlaySchedule(args: ToolArgs) {
    const scopeKind = text(args.scope) === 'clan' ? 'clan' : 'player'
    const requested = text(args.period)
    const period: StandardPeriod = requested === 'week' || requested === 'month' ? requested : 'all'
    const periodStart = getPeriodStart(period)
    if (scopeKind === 'clan') {
      const rows = await prisma.squadMatch.findMany({
        where: {
          matchType: 'official',
          ...(periodStart ? { createdAt: { gte: periodStart } } : {}),
          members: { some: { member: { clanId: scope.clanId, isActive: true } } },
        },
        orderBy: { createdAt: 'desc' },
        take: SCHEDULE_MATCHES_MAX,
        select: { createdAt: true, placement: true, members: { select: { timeSurvived: true } } },
      })
      const plays = rows.map((row) => ({ playedAt: row.createdAt, durationSeconds: Math.max(0, ...row.members.map((member) => member.timeSurvived)), placement: row.placement }))
      return { scope: 'le clan', period: PERIOD_LABELS[period], ...buildPlaySchedule(plays), note: 'Parties officielles d’escouade du clan, heure de Paris ; une soirée commence à 06:00.' }
    }
    const resolved = await resolveMember(args.playerName)
    if ('error' in resolved) return resolved
    const rows = await prisma.match.findMany({
      where: { memberId: resolved.memberId, matchType: 'official', ...(periodStart ? { pubgCreatedAt: { gte: periodStart } } : {}) },
      orderBy: { pubgCreatedAt: 'desc' },
      take: SCHEDULE_MATCHES_MAX,
      select: { pubgCreatedAt: true, duration: true, placement: true },
    })
    const plays = rows.map((row) => ({ playedAt: row.pubgCreatedAt, durationSeconds: row.duration, placement: row.placement }))
    return { scope: resolved.memberName, period: PERIOD_LABELS[period], ...buildPlaySchedule(plays), note: 'Toutes ses parties officielles (même sans coéquipier du clan), heure de Paris ; une soirée commence à 06:00.' }
  }

  async function getPlayerBenchmark(args: ToolArgs) {
    const resolved = await resolveMember(args.playerName)
    if ('error' in resolved) return resolved
    const { memberId, memberName } = resolved
    const requested = text(args.period)
    const period: StandardPeriod = requested === 'month' || requested === 'all' ? requested : 'week'
    const mode = parsePlayersMode(text(args.mode) || null)
    const ranking = await getPlayersRanking(period, mode)
    const base = {
      player: memberName,
      period: PERIOD_LABELS[period],
      mode: PLAYERS_MODE_WHEN[mode],
      playersRanked: ranking.ranked.length,
      clansCompared: ranking.clans.length,
      minMatches: ranking.minMatches,
    }
    const entry = ranking.ranked.find((candidate) => candidate.memberId === memberId)
    if (!entry) {
      const pending = ranking.qualifying.find((candidate) => candidate.memberId === memberId)
      const matches = pending?.matches ?? 0
      return { ...base, ranked: false, matches, required: ranking.minMatches, message: `Encore ${Math.max(0, ranking.minMatches - matches)} partie(s) officielle(s) de clan pour être classé.` }
    }
    const criteria = PLAYER_CRITERIA.flatMap((criterion) => {
      const standing = myStanding(rankPlayers(ranking.ranked, criterion.key), ranking.qualifying, memberId, criterion.key, ranking.minMatches)
      if (!standing || standing.kind !== 'ranked' || standing.value === null) return []
      return [
        {
          criterion: criterion.label,
          kind: criterion.kind === 'role' ? 'score sur 100 (centile entre clans)' : 'moyenne par partie',
          value: criterion.format(standing.value),
          position: standing.position,
          of: standing.total,
          aheadSharePercent: standing.aheadShare,
          previousPosition: previousRankOf(entry, criterion.key),
          justAhead: standing.ahead ? { player: standing.ahead.name, clanTag: standing.ahead.clanTag, gap: standing.ahead.gap } : null,
        },
      ]
    })
    return {
      ...base,
      ranked: true,
      matches: entry.matches,
      wins: entry.wins,
      style: entry.style,
      roles: PLAYER_ROLES.map((role) => ({ role: role.label, score: entry.roles[role.id], measures: role.hint })),
      averages: {
        damage: Math.round(entry.avgDamage),
        kills: entry.avgKills,
        knocks: entry.avgKnocks,
        revives: entry.avgRevives,
        assists: entry.avgAssists,
        survivalMinutes: round1(entry.avgSurvivalSeconds / 60),
        headshotRatePercent: entry.headshotRate === null ? null : Math.round(entry.headshotRate * 100),
        avgKillDistanceM: entry.avgKillDistance === null ? null : Math.round(entry.avgKillDistance),
        zoneInsidePercent: entry.zoneInsideRate === null ? null : Math.round(entry.zoneInsideRate * 100),
      },
      criteria,
      note: 'Classement « Joueurs » du site : parties officielles de clan de tous les clans suivis. Un score de rôle sur 100 est la part des joueurs classés dépassés (centile entre clans), pas le style de jeu relatif au clan.',
    }
  }

  // Tournois : pages publiques, quel que soit le clan organisateur. Le clan du joueur sert seulement à le situer.
  const isMine = (participant: TournamentStandingSummary['participant']) => participantClanIds(participant).includes(scope.clanId)
  const podiumLine = (entry: TournamentStandingSummary, rank: number) => ({ rank, label: entry.label, points: round1(entry.totalPoints), kills: entry.totalKills, wins: entry.wins })

  function summarizeTournament(overview: TournamentOverview) {
    const display = TOURNAMENT_MODE_DISPLAY[overview.mode]
    const scored = overview.leaders.filter((entry) => entry.totalPoints > 0)
    const ranked = overview.standings.length > 0 ? overview.standings : overview.leaders
    const mineIndex = ranked.findIndex((entry) => isMine(entry.participant))
    return {
      tournamentId: overview.id,
      title: overview.title,
      mode: display.label,
      ranks: display.ranks,
      phase: TOURNAMENT_PHASE_LABELS[overview.phase],
      period: formatTournamentPeriod(overview.startDate, overview.endDate),
      organizer: overview.organizerClan ? { tag: overview.organizerClan.tag, name: overview.organizerClan.name } : null,
      rounds: overview.roundCount,
      clans: overview.clanCount,
      participants: overview.participantCount,
      winner: overview.phase === 'finished' && overview.winner ? podiumLine(overview.winner, 1) : null,
      leader: overview.phase === 'live' && scored[0] ? podiumLine(scored[0], 1) : null,
      podium: scored.slice(0, 3).map((entry, index) => podiumLine(entry, index + 1)),
      yourClan: mineIndex === -1 ? null : podiumLine(ranked[mineIndex], mineIndex + 1),
    }
  }

  async function getTournaments(args: ToolArgs) {
    const status = text(args.status)
    if (status && !(TOURNAMENT_PHASES as readonly string[]).includes(status)) {
      return { error: 'invalid_status', message: 'status : live, upcoming ou finished.' }
    }
    const search = normalizeText(text(args.search))
    const take = clampInt(args.limit, 1, TOURNAMENTS_MAX, TOURNAMENTS_DEFAULT)
    const overviews = (await cachedTournamentOverviews())
      .filter((overview) => overview.phase !== 'draft')
      .filter((overview) => !status || overview.phase === status)
      .filter((overview) => !search || normalizeText(overview.title).includes(search))
    return {
      total: overviews.length,
      tournaments: overviews.slice(0, take).map(summarizeTournament),
      note: 'Seules les parties personnalisées jouées pendant les dates du tournoi, avec un membre du clan organisateur, comptent. Place du clan du joueur connue en direct ou sur le podium ; sinon, getTournamentResults.',
    }
  }

  function rulesSummary(rules: NormalizedTournamentRules) {
    const display = TOURNAMENT_MODE_DISPLAY[rules.mode]
    return {
      mode: display.label,
      ranks: display.ranks,
      placementPoints: Object.fromEntries(Object.entries(rules.placementPoints).map(([place, points]) => [`top${place}`, points])),
      killPoints: rules.killPoints,
      winBonus: rules.winBonus,
      bestOfRounds: rules.bestOfRounds,
      mixedSquadRule: rules.mode === 'inter_clan' ? (rules.mixedSquadRule === 'prorata' ? 'prorata de l’effectif' : 'partage intégral') : null,
    }
  }

  async function getTournamentResults(args: ToolArgs) {
    const tournamentId = text(args.tournamentId)
    if (!SAFE_ID.test(tournamentId)) return { error: 'invalid_tournament', message: 'tournamentId attendu (voir getTournaments).' }
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { organizerClan: { select: { id: true, name: true, tag: true } } },
    })
    if (!tournament || tournament.status === 'draft') return { error: 'tournament_not_found', message: 'Tournoi inconnu ou pas encore publié.' }

    const rules = normalizeTournamentRules(tournament.rules as Record<string, unknown>)
    const phase = resolveTournamentPhase(tournament)
    const [matches, labels] = await Promise.all([getTournamentMatches(tournament.id), getMapLabels()])
    const trackedClanIds = getTrackedTournamentClanIds(matches)
    const { clans, members } = await loadTournamentDirectories([...trackedClanIds, tournament.organizerClanId], collectTournamentMemberIds(matches))
    const standings = buildStandingViews(computeTournamentModeStandings(matches, trackedClanIds, rules, tournament.organizerClanId), clans, members)
    const rounds = buildRoundViews(matches, trackedClanIds, rules, clans, members, tournament.organizerClanId)
    const mineKeys = new Set(standings.filter((row) => isMine(row.participant)).map((row) => row.key))

    const standingLine = (row: TournamentStandingView) => ({
      rank: row.rank,
      label: row.label,
      clanTags: row.clanTags,
      points: round1(row.totalPoints),
      kills: row.totalKills,
      wins: row.wins,
      roundsPlayed: row.matchesPlayed,
      bestPlacement: row.bestPlacement,
      averagePlacement: round1(row.averagePlacement),
      yours: mineKeys.has(row.key),
    })
    const shown = standings.slice(0, TOURNAMENT_STANDINGS_MAX)
    const mineBeyond = standings.slice(TOURNAMENT_STANDINGS_MAX).filter((row) => mineKeys.has(row.key))
    const mvp = pickMvp(matches, members, clans)

    return {
      tournamentId: tournament.id,
      title: tournament.title,
      description: tournament.description ? tournament.description.slice(0, TOURNAMENT_DESCRIPTION_MAX) : null,
      phase: TOURNAMENT_PHASE_LABELS[phase],
      period: formatTournamentPeriod(tournament.startDate, tournament.endDate),
      organizer: { tag: tournament.organizerClan.tag, name: tournament.organizerClan.name },
      rules: rulesSummary(rules),
      roundsCounted: matches.length,
      participantsRanked: standings.length,
      standings: [...shown, ...mineBeyond].map(standingLine),
      yourClan: standings.filter((row) => mineKeys.has(row.key)).map(standingLine),
      mvp: mvp ? { label: mvp.label, kills: mvp.kills, damage: Math.round(mvp.damage) } : null,
      rounds: rounds.slice(-TOURNAMENT_ROUNDS_MAX).map((round) => ({
        round: round.index,
        playedAt: round.createdAt,
        map: round.mapName ? mapDisplayName(round.mapName, labels) : null,
        winner: round.winnerLabel,
        mvp: round.mvp ? { label: round.mvp.label, kills: round.mvp.kills } : null,
        podium: round.scores.slice(0, TOURNAMENT_ROUND_PODIUM).map((score, index) => ({ rank: index + 1, label: score.label, points: round1(score.points), kills: score.totalKills, placement: score.bestPlacement })),
        yourClan: round.scores.filter((score) => mineKeys.has(score.key)).map((score) => ({ rank: round.scores.indexOf(score) + 1, label: score.label, points: round1(score.points), kills: score.totalKills, placement: score.bestPlacement })),
      })),
      note: 'Même calcul que la page du tournoi ; les pseudos des autres clans sont ceux des joueurs suivis par le site.',
    }
  }

  const handlers: Record<string, (args: ToolArgs) => Promise<unknown>> = {
    getRecentMatches,
    getMatchDebrief,
    getWeaponStats,
    getOpponentRecord,
    getDropZones,
    getClanLeaderboard,
    getLeagueStanding,
    getTournaments,
    getTournamentResults,
    getItemUsage,
    getMapPerformance,
    getPlaySchedule,
    getPlayerBenchmark,
  }

  return {
    declarations: COACH_TOOL_DECLARATIONS,
    async run(call) {
      const handler = handlers[call.name]
      if (!handler) return { error: 'unknown_tool', message: `Outil inconnu : ${call.name}.` }
      return handler(call.args ?? {})
    },
  }
}
