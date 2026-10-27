import { Prisma } from '@prisma/client'

import { activityByDay, busiestSlot, slotLabel, type ActivityCell } from '@/lib/activity-heatmap'
import {
  aggregateCityCells,
  buildCityGrid,
  buildCityInsights,
  getCityPeriodBounds,
  loadCityMatchCoverage,
  loadCityMetricCells,
  rankCellsByCity,
  withClanComparison,
} from '@/lib/city-insights'
import { CAREER_GROUPS, careerHeadline, careerRefresh, computeCareerGroups, type CareerGroupId, type CareerLifetimeStats, type CareerMember, type CareerMetric } from '@/lib/clan-career'
import { CLAN_PLACEMENT_MEMBER_SELECT, clanPlacementMemberWhere, clanPlacementOf, playerTeamOf } from '@/lib/clan-placement'
import { DROP_PRESSURE_LEVELS, type DropPressureLevel } from '@/lib/drop-zone-pressure'
import { jumpProfile, levelOfAverage, locationForPoint, mapsByJumps, memberJumpSummaries, spotStats, type LandingPoint } from '@/lib/drop-zones-view'
import { LEAGUE_MATCH_TYPE_OPTIONS, leagueMatchTypeOption, leagueMatchTypeValues, parseLeagueMatchType } from '@/lib/clan-league'
import { getClanLeague, type LeagueEntry } from '@/lib/clan-league-service'
import { loadClanMapStats } from '@/lib/clan-map-stats-service'
import type { CoachToolCall, CoachToolDeclaration } from '@/lib/coach/coach-provider'
import { DEFAULT_MAP_LABELS, getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { getMapLocations } from '@/lib/map-location-service'
import { sessionBoundsOf, sessionDateOf, sessionDateParts, shiftSessionDate, teamModeOf, type TeamModeKey } from '@/lib/match-sessions'
import type { StandardPeriod } from '@/lib/period'
import { statsPeriodKeys } from '@/lib/player-dashboard'
import { prisma } from '@/lib/prisma'
import { formatClock, phaseStartTimes } from '@/lib/pubg-telemetry/debrief-view'
import { loadMatchDebriefPayload } from '@/lib/pubg-telemetry/match-debrief-payload'
import { clamp01, getMapBounds } from '@/lib/pubg-telemetry/position-heatmap'
import {
  cooperationSummary,
  cooperationTop,
  itemFamilyLabel,
  itemLabel,
  playstyleRoles,
  playstyleThemes,
  type ClanPlaystyleRow,
  type CooperationPair,
} from '@/lib/clan-playstyle'
import { CAREER_MODE_LABELS, careerMedals, clanMedalRanks, gamesOf, rankedTierLabel, seasonLabel, winRateOf, type CareerMode, type LifetimeStats } from '@/lib/player-career'
import { cooperationPartners, playerRoleComparison } from '@/lib/player-playstyle'
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
import { getPeriodKey } from '@/lib/pubg-telemetry/period-aggregates'
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
import { parseTacticalPhase, tacticalPhaseLabel, tacticalPhaseNumbers } from '@/lib/tactical-phase'
import { getWeaponLabels, weaponDisplayName } from '@/lib/weapon-label-service'
import { aggregateMemberWeapons, throwableLabel, type MemberWeaponRow } from '@/lib/weapons/member-arsenal'
import { getZoneClosurePeriodBounds, loadZoneClosureSummary, type ZoneClosureMemberStat, type ZoneClosurePeriod } from '@/lib/zone-closure-stats'
import { bandShares, memberZoneProfile, MIN_PLAYER_SAMPLE, rankZoneMembers, ratioPercent, zoneTitles, zoneVerdict } from '@/lib/zone-closure-view'
import type { CityEntry, CityInsightsPeriod } from '@/types/city-insights'
import type { ClanMatchTypeFilter } from '@/types/squad-matches'

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
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const RECENT_MATCHES_MAX = 10
const RECENT_MATCHES_DEFAULT = 5
/** Soirées : 31 au plus par lecture (~1 700 parties pour un clan très actif), 7 sans date ; 40 parties listées pour une soirée seule. */
const SESSION_RANGE_MAX_DAYS = 31
const SESSION_RANGE_DEFAULT_DAYS = 7
const SESSION_MATCHES_MAX = 3000
const SESSION_MATCH_LIST_MAX = 40
const SESSION_MATCH_TYPES = ['all', 'official', 'competitive', 'casual', 'custom'] as const
type SessionMatchType = (typeof SESSION_MATCH_TYPES)[number]
/** `SquadMatch.matchType` en clair pour le modèle (valeurs vues en base : official, competitive, casual, airoyale, custom, event). */
const MATCH_TYPE_LABELS: Record<string, string> = {
  official: 'normale',
  competitive: 'Ranked',
  casual: 'casual',
  airoyale: 'Air Royale (bots)',
  custom: 'personnalisée',
  event: 'événement',
  training: 'entraînement',
  trainingroom: 'salle d’entraînement',
}
const TEAM_MODE_LABELS: Record<TeamModeKey, string> = { duo: 'duo', trio: 'trio', squad: 'squad' }
const CAREER_GROUP_IDS = CAREER_GROUPS.map((group) => group.id)
const CITY_TOP = 5
const ZONE_MEMBERS_MAX = 15
/** Sous ce nombre d'observations, la page « Fin de zone » signale un échantillon fragile. */
const ZONE_LOW_SAMPLE = 20
const TACTICAL_PHASES = ['all', 'early', 'mid', 'late'] as const
const DEBRIEF_EVENTS_MAX = 60
const WEAPONS_MAX = 8
const OPPONENT_PLAYERS_MAX = 200
/**
 * Sauts lus au plus : une ligne par membre et par partie. L'ancienne borne (2 000) couvrait six semaines d'Erangel sur
 * un clan actif en se disant « 90 jours » (fil 9, 2026-10-25) ; 20 000 couvre « depuis toujours » sur les plus gros.
 */
const DROP_ROWS_MAX = 20000
const DROP_PERIODS = ['days-90', 'week', 'month', 'all'] as const
type DropPeriod = (typeof DROP_PERIODS)[number]
const DROP_DEFAULT_PERIOD: DropPeriod = 'days-90'
const DROP_PERIOD_LABELS: Record<DropPeriod, string> = { 'days-90': 'les 90 derniers jours', week: 'cette semaine', month: 'ce mois', all: 'depuis toujours' }
const DROP_ZONES_MAX = 8
const DROP_MAPS_MAX = 8
const DROP_MEMBERS_MAX = 10
/** Sous ce nombre de parties, les placements d'un spot ne disent pas grand-chose. */
const DROP_SPOT_LOW_SAMPLE = 10
const LEADERBOARD_MAX = 15
const ITEMS_MAX = 10
const SCHEDULE_MATCHES_MAX = 3000
const SCHEDULE_SLOTS_MAX = 3
const TOURNAMENTS_MAX = 10
const TOURNAMENTS_DEFAULT = 5
const TOURNAMENT_STANDINGS_MAX = 20
const TOURNAMENT_ROUNDS_MAX = 15
const TOURNAMENT_ROUND_PODIUM = 3
const TOURNAMENT_WEAPONS_MAX = 6
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
    description: `Les toutes dernières parties du clan du joueur (${RECENT_MATCHES_MAX} au plus, de la plus récente à la plus ancienne), chacune avec sa date de soirée, et un résumé calculé par le serveur sur ces seules parties. Pour « notre dernière partie », « les 5 dernières sur Erangel », retrouver un identifiant pour getMatchDebrief. Ce n'est PAS le bilan d'une soirée, d'un jour ou d'une période : la liste est coupée à ${RECENT_MATCHES_MAX} parties, sans rien dire des parties d'avant — pour un jour, une date ou une soirée, getSessions.`,
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: `Nombre de parties, ${RECENT_MATCHES_MAX} au plus (${RECENT_MATCHES_DEFAULT} par défaut).` },
        mapName: { type: 'string', description: 'Carte (Erangel, Miramar, Sanhok, Taego, Vikendi, Deston, Rondo…), facultatif.' },
      },
    },
  },
  {
    name: 'getSessions',
    description:
      "Bilan d'une ou plusieurs soirées du clan — ou du joueur seul avec scope « player » —, calculé par le serveur : l'outil de toute question qui nomme un jour ou une date : « combien de Top 1 samedi ? », « la place moyenne d'hier », « le bilan du 23 », « la semaine soirée par soirée », « on a joué mardi ? », « mes Top 1 hier » (player). Une soirée = la journée de jeu de 06:00 à 06:00, heure de Paris (une partie de 01:00 compte dans la soirée de la veille), désignée par la date du soir où elle commence. Par soirée : parties, Top 1, Top 10, place moyenne, meilleure et pire place, kills et dégâts par partie, heures de début et de fin, carte la plus jouée, meilleur joueur (et, en scope « player », ses kills et ses dégâts) ; totaux de la plage et soirées sans partie. Pour une seule date, le détail : cartes, modes d'équipe, types de partie, chaque membre présent, et la liste de ses parties avec leurs identifiants (getMatchDebrief). Sans date : les 7 dernières soirées, celle en cours comprise. Une plage fait 31 soirées au plus : sa première soirée n'est PAS la première date des données — pour « depuis quand », getDataCoverage.",
    parameters: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['clan', 'player'], description: '« clan » (toutes les parties du clan, défaut) ou « player » (les parties du joueur seul : « mes soirées », « j’ai fait »).' },
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan (implique scope « player »), facultatif.' },
        date: { type: 'string', description: 'Une soirée, AAAA-MM-JJ (le jour est d’abord traduit en date d’après la date d’aujourd’hui).' },
        from: { type: 'string', description: 'Première soirée d’une plage, AAAA-MM-JJ.' },
        to: { type: 'string', description: `Dernière soirée de la plage, AAAA-MM-JJ (défaut : la soirée en cours) ; ${SESSION_RANGE_MAX_DAYS} soirées au plus.` },
        matchType: {
          type: 'string',
          enum: [...SESSION_MATCH_TYPES],
          description: '« all » (défaut : toutes les parties, comme la page de la soirée — chaque soirée détaille ses types), « official » (matchmaking normal), « competitive » (Ranked), « casual » (casual et Air Royale), « custom » (parties personnalisées, tournois).',
        },
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
    description:
      "Largages du clan ou d'un joueur (page « Zones de drop ») : où ils atterrissent en parachute. Un saut = l'atterrissage d'un membre ; une partie compte autant de sauts que de membres du clan. Sans carte : chaque carte avec ses sauts, son spot favori et ses trois premiers spots — pour « nos drops favoris », « où je saute ? ». Avec une carte : profil de saut (pression = adversaires à moins de 250 m, part de hot drops), spots du plus fréquenté au moins fréquenté avec pression, roi du spot et placements des parties qui y ont atterri, sauts hors des villes à part (ce n'est pas un spot), et qui saute où. Pour « où atterrir sur Miramar ? », « nos hot drops valent le coup ? ». Pas les combats dans une ville (getCityInsights).",
    parameters: {
      type: 'object',
      properties: {
        mapName: { type: 'string', description: 'Carte (Erangel, Miramar, Rondo…), facultatif : sans carte, toutes les cartes.' },
        period: {
          type: 'string',
          enum: [...DROP_PERIODS],
          description: `« ${DROP_DEFAULT_PERIOD} » (les 90 derniers jours, défaut), « week » (cette semaine, depuis lundi), « month » (ce mois) ou « all » (depuis toujours).`,
        },
        scope: { type: 'string', enum: ['clan', 'player'], description: '« clan » (tout le clan, défaut) ou « player » (le joueur seul : « mes drops »).' },
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan (implique scope « player »), facultatif.' },
      },
    },
  },
  {
    name: 'getClanLeaderboard',
    description:
      "Classement des membres du clan sur une période calendaire — cette semaine (depuis lundi), ce mois ou depuis toujours — en parties officielles, agrégats recalculés chaque nuit : parties, kills, dégâts, K/M, win rate, temps de jeu, jours actifs, badge. Pour comparer les membres, repérer qui porte l'escouade ou qui décroche, et situer le joueur. Pas pour une soirée ou un jour précis (getSessions).",
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
      "Détail d'un tournoi : barème, classement complet selon le mode (points, kills, Top 1, place moyenne), place du clan du joueur, chaque manche (carte, vainqueur, MVP, podium de la manche, score du clan du joueur), MVP du tournoi ; et le joueur lui-même (« you ») — sa place en jeu, ses kills et ses dégâts manche par manche, les manches où il a été MVP, ses armes dans le tournoi — plus les armes de son clan. Pour « mon résultat dans ce tournoi », « mes armes du tournoi », « qui a gagné ? ». L'identifiant vient de getTournaments ou de la page consultée. Les armes de tout son historique, c'est getWeaponStats.",
    parameters: {
      type: 'object',
      properties: {
        tournamentId: { type: 'string', description: 'Identifiant du tournoi.' },
        playerName: { type: 'string', description: 'Membre du clan dont donner la ligne (« you ») ; le joueur par défaut.' },
      },
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
      "Performance du clan carte par carte sur une période calendaire (cette semaine depuis lundi, ce mois, depuis toujours ; parties d'escouade, mêmes règles que la page « Cartes ») : parties, Top 1, win rate, Top 10, place moyenne, kills et dégâts par partie, écart à la moyenne des clans, tendance depuis la période précédente, joueur phare ; verdict (carte forte, carte à travailler, carte la plus jouée). Pour « notre pire carte ? », « pourquoi on perd sur Rondo ? », « on est meilleurs où ? », « le bilan de la semaine par carte ». Pas pour une soirée ou un jour précis (getSessions).",
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
      "Les habitudes de jeu du joueur (ou du clan), parties officielles : parties par jour de la semaine et par heure (heure de Paris), créneaux favoris, plage horaire habituelle en semaine et le week-end, soirées actives, temps de jeu et parties par soirée. Pour « mon horaire de jeu ? », « quand est-ce qu'on joue le plus ? », « combien de soirées par semaine ? ». Ce sont des cumuls par jour de la semaine (tous les samedis ensemble), jamais le bilan d'un jour précis : pour « samedi dernier », getSessions.",
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
  {
    name: 'getCareerStats',
    description:
      "Carrière PUBG du joueur (ou d'un autre membre du clan), lue de l'API PUBG : toutes ses parties depuis toujours, pas seulement celles du clan — parties, Top 1, win rate, K/D, kills, headshots, knocks, dégâts, réanimations, soins, temps de jeu, jours joués, records (kill le plus long, série, survie), distances ; médailles au podium du clan ; saisons récentes (palier Ranked, points, parties normales). Pour « ma carrière », « mon K/D », « mon palier ranked », « mon record de kill ».",
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan, facultatif.' },
        mode: { type: 'string', enum: ['all', 'squad', 'duo', 'solo'], description: '« all » (tous modes, défaut), « squad », « duo » ou « solo ».' },
      },
    },
  },
  {
    name: 'getClanPlaystyle',
    description:
      "Style de jeu du clan sur la période (télémétrie des parties analysées) : rôles Fragger / Medic / Ghost — moyenne du clan et les trois joueurs qui les incarnent —, mobilité (km par partie, part à pied, vitesse max), gestion du cercle (temps dans la zone sûre, hors zone, coups de zone bleue, phase du premier contact), survie (soins, dégâts subis, couverture), coopération (indice de synergie, réanimations, co-kills, recalls, meilleurs binômes) ; et le joueur face au clan (score par rôle, écart, rang, ses binômes). Pour « qui est notre medic ? », « on joue trop dispersés ? », « avec qui je coopère le plus ? ». La position au moment où le cercle se ferme, c'est getZoneClosures.",
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan à situer face au clan, facultatif.' },
        period: PERIOD_PARAMETER,
      },
    },
  },
  {
    name: 'getDataCoverage',
    description:
      "Depuis quand — et jusqu'à quand — le site a des données sur le joueur (ou sur le clan avec scope « clan ») : arrivée sur le site, première et dernière partie avec le clan (et leur soirée), parties PUBG suivies par type, parties dont la télémétrie est analysée, date de départ de chaque famille de données (largages, kill feed, positions et villes, fins de zone, objets consommés) et date de la carrière PUBG. Pour « depuis quand tu as mes données ? », « ma toute première partie enregistrée ? », « tu as mes parties de juin ? », « pourquoi tu n'as rien sur mes objets avant septembre ? ». Aucune statistique de jeu : pour les chiffres, l'outil du sujet.",
    parameters: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['player', 'clan'], description: '« player » (le joueur, défaut) ou « clan » (tout le clan).' },
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan, facultatif.' },
      },
    },
  },
  {
    name: 'getClanCareer',
    description:
      "Carrière PUBG du clan entier, lue de l'API PUBG (toutes les parties des comptes depuis leur création, pas seulement celles jouées avec le clan ; aucune période) : les quatre totaux de la page (temps de jeu, kills et K/D moyen, victoires, distance), puis sept familles — Engagement, Combat, Victoires, Support, Véhicules, Déplacements, Autres — avec, pour chaque statistique, la valeur du clan (total, moyenne ou record), le podium des trois meilleurs membres et la place du joueur. Pour « combien de kills le clan a en carrière ? », « qui a le plus de victoires ? », « le kill le plus lointain du clan », « je suis où au K/D dans le clan ? ». La carrière d'un seul joueur, ses saisons et son palier Ranked : getCareerStats.",
    parameters: {
      type: 'object',
      properties: {
        group: { type: 'string', enum: [...CAREER_GROUP_IDS], description: 'Une seule famille, facultatif : engagement, combat, victory, support, vehicle, movement, other.' },
        playerName: { type: 'string', description: 'Membre du clan à situer dans chaque classement (le joueur par défaut).' },
      },
    },
  },
  {
    name: 'getCityInsights',
    description:
      "Villes et zones de combat du joueur (ou du clan) sur la période, d'après les positions des parties analysées rattachées aux villes de la carte : ville la plus fréquentée, zone de combat favorite (kills et dégâts), Top 5 des villes par présence, kills, dégâts, réanimations et morts, bilan des combats ville par ville (kills contre morts), part du temps hors des villes, et pour le joueur la part du clan sur la même ville. Pour « où je me bats le plus ? », « dans quelle ville je meurs ? », « où le clan traîne ? », « où je gagne mes duels ? ». Pas le largage en parachute (getDropZones) ni la position à la fermeture du cercle (getZoneClosures).",
    parameters: {
      type: 'object',
      properties: {
        playerName: { type: 'string', description: 'Pseudo d’un autre membre du clan, facultatif.' },
        scope: { type: 'string', enum: ['player', 'clan'], description: '« player » (le joueur, défaut) ou « clan » (tout le clan).' },
        period: { type: 'string', enum: ['week', 'month', 'all'], description: '« week » (cette semaine, défaut de la page), « month » (ce mois) ou « all » (depuis toujours).' },
        mapName: { type: 'string', description: 'Une seule carte (Erangel, Miramar, Rondo…), facultatif.' },
        matchType: {
          type: 'string',
          enum: [...SESSION_MATCH_TYPES],
          description: '« official » (matchmaking normal), « competitive » (Ranked), « casual » (casual et Air Royale), « custom » ou « all » ; défaut : official pour le clan (comme son tableau de bord), all pour un joueur (comme sa page).',
        },
      },
    },
  },
  {
    name: 'getZoneClosures',
    description:
      "Fin de zone du clan (page « Fin de zone ») : où se trouvent les membres encore en vie à l'instant où le cercle se referme — au centre (moins de la moitié du rayon), au bord intérieur, ou dehors —, sur une carte et une période : parts centre / bord / dehors, distance moyenne au centre en % du rayon, verdict du clan, trois titres (Roi du cercle, Increvable, Coureur de zone bleue), phase par phase, villes d'arrivée, chaque joueur avec son profil (court après la zone, joue le centre, longe le bord, équilibré) et la place du joueur. Pour « on gère bien le cercle ? », « qui court après la zone ? », « je suis souvent dehors à la fermeture ? ». Biais de survie : les phases tardives ne décrivent que les survivants.",
    parameters: {
      type: 'object',
      properties: {
        mapName: { type: 'string', description: 'Carte, facultatif : par défaut la carte où le clan a le plus de fermetures.' },
        period: { type: 'string', enum: ['week', 'month', 'all'], description: '« week » (cette semaine, défaut de la page), « month » (ce mois) ou « all » (depuis toujours).' },
        phase: { type: 'string', enum: [...TACTICAL_PHASES], description: '« all » (défaut), « early » (début de partie, phases 1–2), « mid » (phases 3–4) ou « late » (fin de partie, phases 5–8).' },
        playerName: { type: 'string', description: 'Membre du clan à situer (le joueur par défaut).' },
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
const round2 = (value: number) => Math.round(value * 100) / 100
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
const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
/** Une date `AAAA-MM-JJ` qui existe (le 30 février est refusé). */
const isSessionDate = (value: string) => ISO_DAY.test(value) && shiftSessionDate(value, 0) === value
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

/**
 * Bilan d'un lot de places finales, calculé ici pour que le modèle n'ait jamais à faire une moyenne lui-même (la
 * conversation du 2026-10-25 l'a vu rendre 10,9 pour 13,0 sur dix valeurs).
 */
export function placementSummary(placements: readonly number[]) {
  if (placements.length === 0) return null
  const wins = placements.filter((placement) => placement === 1).length
  const top10 = placements.filter((placement) => placement <= 10).length
  return {
    matches: placements.length,
    wins,
    top10,
    winRatePercent: Math.round((wins / placements.length) * 100),
    top10Percent: Math.round((top10 / placements.length) * 100),
    avgPlacement: round1(placements.reduce((sum, placement) => sum + placement, 0) / placements.length),
    bestPlacement: Math.min(...placements),
    worstPlacement: Math.max(...placements),
  }
}

const CLAN_SQUAD_MEMBER_SELECT = {
  memberId: true,
  kills: true,
  damage: true,
  knockouts: true,
  placement: true,
  member: { select: { displayName: true, ...CLAN_PLACEMENT_MEMBER_SELECT } },
} as const

type ClanSquadMember = {
  memberId: number
  kills: number
  damage: number
  knockouts: number
  placement: number
  member: { displayName: string; clanId: number | null; isActive: boolean; joinStatus: string }
}

type ClanSquadRow<T> = T & { placement: number; totalKills: number; totalDamage: number; members: ClanSquadMember[] }

/**
 * Une partie vue du clan, ou d'un de ses joueurs (`playerId`) : place, kills, dégâts et escouade de **ses** membres
 * (docs/TODO/place-partie-partagee.md). La ligne `SquadMatch` réunit tous les joueurs suivis du lobby et ses colonnes
 * `placement` / `totalKills` ne sont que celles du clan qui l'a créée. Clan : ses membres actifs et sa place
 * (`clanPlacementOf`) ; joueur : son équipe (`playerTeamOf`) et sa place à lui. Exportée pour les tests.
 */
export function clanSquadRow<T extends { members: ClanSquadMember[] }>(row: T, clanId: number, playerId: number | null = null): ClanSquadRow<T> {
  const members = playerId !== null ? playerTeamOf(row.members, playerId) : row.members
  const placement = (playerId !== null ? members.find((entry) => entry.memberId === playerId)?.placement : clanPlacementOf(row, clanId)) ?? 0
  return {
    ...row,
    members,
    placement,
    totalKills: members.reduce((sum, entry) => sum + entry.kills, 0),
    totalDamage: members.reduce((sum, entry) => sum + entry.damage, 0),
  }
}

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

    // Une ligne de plus que demandé : dit s'il existe des parties avant la liste, sans compter tout l'historique.
    // Place, kills et escouade : ceux des membres actifs du clan, jamais la ligne (partagée par tous les clans du lobby).
    const rows = await prisma.squadMatch.findMany({
      where: {
        members: { some: { member: clanPlacementMemberWhere(scope.clanId) } },
        ...(rawMaps.length > 0 ? { mapName: { in: rawMaps } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: {
        id: true,
        mapName: true,
        gameMode: true,
        matchType: true,
        createdAt: true,
        members: { where: { member: clanPlacementMemberWhere(scope.clanId) }, select: CLAN_SQUAD_MEMBER_SELECT },
        telemetry: { select: { status: true } },
      },
    })
    const truncated = rows.length > take
    const matches = (truncated ? rows.slice(0, take) : rows).map((row) => clanSquadRow(row, scope.clanId))
    const summary = placementSummary(matches.map((match) => match.placement))
    return {
      listed: matches.length,
      limit: RECENT_MATCHES_MAX,
      truncated,
      summary: summary ? { ...summary, sessions: [...new Set(matches.map((match) => sessionDateOf(match.createdAt)))] } : null,
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
      note: `Les ${matches.length} dernières parties seulement${truncated ? ', il y en a d’autres avant' : ''} ; « summary » ne porte que sur elles. Ce n’est pas le bilan d’une soirée ni d’un jour : pour cela, getSessions avec la date.`,
    }
  }

  type SessionRow = ClanSquadRow<{
    id: string
    mapName: string
    gameMode: string
    matchType: string
    createdAt: Date
    telemetry: { status: string } | null
  }>

  /**
   * Bilan d'une soirée (la page « Soirée » du clan, en chiffres). Compact par défaut (une plage de 31 soirées faisait
   * 20 000 tokens en détail) ; `detailed`, pour une date seule : cartes, modes, types, chaque membre et la liste des
   * parties. `playerId` (scope « player ») ajoute les kills et les dégâts du joueur lui-même.
   */
  function summarizeSessionRows(date: string, rows: SessionRow[], labels: Record<string, string>, detailed: boolean, playerId: number | null = null) {
    const maps = new Map<string, { matches: number; wins: number }>()
    const types = new Map<string, { matches: number; wins: number }>()
    const modes = new Map<TeamModeKey, number>()
    const players = new Map<string, { matches: number; kills: number; damage: number; knockouts: number }>()
    let kills = 0
    let damage = 0
    for (const row of rows) {
      const win = row.placement === 1 ? 1 : 0
      const map = maps.get(row.mapName) ?? { matches: 0, wins: 0 }
      map.matches += 1
      map.wins += win
      maps.set(row.mapName, map)
      const type = types.get(row.matchType) ?? { matches: 0, wins: 0 }
      type.matches += 1
      type.wins += win
      types.set(row.matchType, type)
      const mode = teamModeOf(row.members.length)
      modes.set(mode, (modes.get(mode) ?? 0) + 1)
      for (const entry of row.members) {
        const player = players.get(entry.member.displayName) ?? { matches: 0, kills: 0, damage: 0, knockouts: 0 }
        player.matches += 1
        player.kills += entry.kills
        player.damage += entry.damage
        player.knockouts += entry.knockouts
        players.set(entry.member.displayName, player)
      }
      kills += row.totalKills
      damage += row.totalDamage
    }
    const mapsRanked = [...maps.entries()].sort((a, b) => b[1].matches - a[1].matches).map(([mapName, stats]) => ({ map: mapDisplayName(mapName, labels), ...stats }))
    const typesRanked = [...types.entries()].sort((a, b) => b[1].matches - a[1].matches).map(([type, stats]) => ({ type: MATCH_TYPE_LABELS[type] ?? type, ...stats }))
    const playersRanked = [...players.entries()]
      .sort((a, b) => b[1].kills - a[1].kills || b[1].damage - a[1].damage)
      .map(([player, stats]) => ({ player, matches: stats.matches, kills: stats.kills, damage: Math.round(stats.damage), knockouts: stats.knockouts }))
    const base = {
      date,
      label: sessionDateParts(date).full,
      ...placementSummary(rows.map((row) => row.placement))!,
      squadKills: kills,
      killsPerMatch: round1(kills / rows.length),
      damagePerMatch: Math.round(damage / rows.length),
      firstMatchAt: PARIS_TIME.format(rows[0].createdAt),
      lastMatchAt: PARIS_TIME.format(rows[rows.length - 1].createdAt),
      ...(playerId !== null
        ? (() => {
            const own = rows.flatMap((row) => row.members.filter((entry) => entry.memberId === playerId))
            return { yourKills: own.reduce((sum, entry) => sum + entry.kills, 0), yourDamage: Math.round(own.reduce((sum, entry) => sum + entry.damage, 0)) }
          })()
        : {}),
    }
    if (!detailed) {
      return {
        ...base,
        mostPlayedMap: mapsRanked[0].map,
        topPlayer: { player: playersRanked[0].player, kills: playersRanked[0].kills },
        ...(typesRanked.length > 1 ? { matchTypes: typesRanked.map((entry) => `${entry.matches} ${entry.type}${entry.wins > 0 ? ` (${entry.wins} Top 1)` : ''}`).join(' · ') } : {}),
      }
    }
    const list = rows.slice(0, SESSION_MATCH_LIST_MAX)
    return {
      ...base,
      maps: mapsRanked,
      teamModes: (['squad', 'trio', 'duo'] as TeamModeKey[]).filter((mode) => modes.has(mode)).map((mode) => `${modes.get(mode)} ${TEAM_MODE_LABELS[mode]}`).join(' · '),
      matchTypes: typesRanked,
      players: playersRanked,
      matchList: list.map((row) => ({
        matchId: row.id,
        time: PARIS_TIME.format(row.createdAt),
        map: mapDisplayName(row.mapName, labels),
        matchType: MATCH_TYPE_LABELS[row.matchType] ?? row.matchType,
        placement: row.placement,
        squadKills: row.totalKills,
        squad: row.members.map((entry) => entry.member.displayName).join(', '),
        telemetryAnalyzed: row.telemetry?.status === 'success',
      })),
      matchListTruncated: rows.length > list.length,
    }
  }

  async function getSessions(args: ToolArgs) {
    const today = sessionDateOf(new Date())
    const single = text(args.date)
    const requestedFrom = text(args.from)
    const requestedTo = text(args.to)
    for (const value of [single, requestedFrom, requestedTo]) {
      if (value && !isSessionDate(value)) return { error: 'invalid_date', message: `Date attendue au format AAAA-MM-JJ : « ${value} ».` }
    }
    const requestedType = text(args.matchType) as SessionMatchType
    const matchType: SessionMatchType = SESSION_MATCH_TYPES.includes(requestedType) ? requestedType : 'all'
    const playerScope = text(args.scope) === 'player' || text(args.playerName) !== ''
    const resolved = playerScope ? await resolveMember(args.playerName) : null
    if (resolved && 'error' in resolved) return resolved
    const memberId = resolved && 'memberId' in resolved ? resolved.memberId : null

    let to = single || requestedTo || today
    let from = single || requestedFrom || shiftSessionDate(to, 1 - SESSION_RANGE_DEFAULT_DAYS)
    if (from > to) [from, to] = [to, from]
    const askedFrom = from
    const clamped = daysBetween(from, to) + 1 > SESSION_RANGE_MAX_DAYS
    if (clamped) from = shiftSessionDate(to, 1 - SESSION_RANGE_MAX_DAYS)
    const { start, end } = sessionBoundsOf(from, to)

    // Les plus récentes d'abord : si la borne coupe, ce sont les plus anciennes qui manquent.
    const [rows, labels] = await Promise.all([
      prisma.squadMatch.findMany({
        where: {
          createdAt: { gte: start, lt: end },
          ...(matchType === 'all' ? {} : { matchType: { in: leagueMatchTypeValues(matchType) } }),
          // Le joueur seul : ses parties avec le clan, qu'il soit encore actif ou non.
          members: { some: memberId ? { memberId } : { member: clanPlacementMemberWhere(scope.clanId) } },
        },
        orderBy: { createdAt: 'desc' },
        take: SESSION_MATCHES_MAX + 1,
        select: {
          id: true,
          mapName: true,
          gameMode: true,
          matchType: true,
          createdAt: true,
          // Membres actifs du clan (et le joueur demandé) : la ligne réunit tous les joueurs suivis du lobby.
          members: {
            where: memberId ? { OR: [{ memberId }, { member: clanPlacementMemberWhere(scope.clanId) }] } : { member: clanPlacementMemberWhere(scope.clanId) },
            select: CLAN_SQUAD_MEMBER_SELECT,
          },
          telemetry: { select: { status: true } },
        },
      }),
      getMapLabels(),
    ])
    const truncated = rows.length > SESSION_MATCHES_MAX
    const matches = (truncated ? rows.slice(0, SESSION_MATCHES_MAX) : rows).reverse().map((row) => clanSquadRow(row, scope.clanId, memberId))
    const byDate = new Map<string, SessionRow[]>()
    for (const row of matches) {
      const date = sessionDateOf(row.createdAt)
      const list = byDate.get(date) ?? []
      list.push(row)
      byDate.set(date, list)
    }
    const dates: string[] = []
    for (let date = from; date <= to; date = shiftSessionDate(date, 1)) dates.push(date)
    const sessions = dates.filter((date) => byDate.has(date)).map((date) => summarizeSessionRows(date, byDate.get(date)!, labels, from === to, memberId))
    const totals = placementSummary(matches.map((row) => row.placement))
    return {
      scope: resolved && 'memberName' in resolved ? resolved.memberName : 'le clan',
      from,
      to,
      days: dates.length,
      today,
      // Plage bornée : la première soirée lue n'est pas la première des données (fil 26 du 2026-10-27).
      ...(clamped ? { clamped: { requestedFrom: askedFrom, servedFrom: from, maxDays: SESSION_RANGE_MAX_DAYS } } : {}),
      matchType: matchType === 'all' ? 'toutes les parties' : leagueMatchTypeOption(matchType).label,
      totals: totals ? { sessionsPlayed: sessions.length, ...totals, squadKills: matches.reduce((sum, row) => sum + row.totalKills, 0) } : { sessionsPlayed: 0, matches: 0, wins: 0 },
      sessions,
      sessionsWithoutPlay: dates.filter((date) => !byDate.has(date)),
      truncated,
      note:
        `Une soirée va de 06:00 à 06:00, heure de Paris, et porte la date du soir où elle commence ; ${memberId ? 'parties du joueur avec le clan' : 'parties avec au moins un membre actif du clan'} ; chiffres calculés par le serveur, à reprendre tels quels.` +
        (clamped
          ? ` Plage ramenée aux ${SESSION_RANGE_MAX_DAYS} dernières soirées : rien n'a été lu avant le ${from}, la première soirée listée n'est donc pas la première des données (getDataCoverage).`
          : '') +
        (truncated ? ' Trop de parties sur la plage : les plus anciennes manquent, demander une plage plus courte.' : ''),
    }
  }

  async function getDataCoverage(args: ToolArgs) {
    const clanScope = text(args.scope) === 'clan' && text(args.playerName) === ''
    const resolved = clanScope ? null : await resolveMember(args.playerName)
    if (resolved && 'error' in resolved) return resolved
    const memberId = resolved && 'memberId' in resolved ? resolved.memberId : null
    // Une date de soirée (heure de Paris, journée de 06:00) : ce que le joueur appelle « le 12 mai ».
    const day = (value: Date | null | undefined) => (value ? sessionDateOf(value) : null)
    const span = (row: { _min: { [key: string]: Date | null }; _max: { [key: string]: Date | null } }, field: string) => ({ since: day(row._min[field]), until: day(row._max[field]) })
    const family = (label: string, range: { since: string | null; until: string | null }, count?: { value: number; unit: string }) =>
      range.since ? { data: label, ...range, ...(count ? { count: count.value, unit: count.unit } : {}) } : { data: label, since: null, message: 'aucune donnée' }

    // Parties et télémétrie en une lecture SQL : la même en Prisma (`members: { some }` + `telemetry`) prenait 5,4 s
    // pour un joueur, contre 0,3 s ici (mesuré sur le clan 25, 2026-10-27).
    type SquadRange = { firstAt: Date | null; lastAt: Date | null; matches: bigint | number; analyzed: bigint | number | string | null; analyzedFirst: Date | null; analyzedLast: Date | null }
    const squadSql = memberId
      ? Prisma.sql`FROM SquadMember sq JOIN SquadMatch sm ON sm.id = sq.squadMatchId LEFT JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id WHERE sq.memberId = ${memberId}`
      : Prisma.sql`FROM SquadMatch sm LEFT JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
          WHERE sm.id IN (SELECT sq.squadMatchId FROM SquadMember sq JOIN ClanMember cm ON cm.id = sq.memberId WHERE cm.clanId = ${scope.clanId})`
    // Le joueur : ses propres lignes, quel que soit le clan où il jouait (les lignes portent le clan du moment) ; le
    // clan : les lignes de ses membres actuels, comme les pages.
    const owner = memberId ? { memberId } : { member: { clanId: scope.clanId } }
    const [[squad], drops, closures, items] = await Promise.all([
      prisma.$queryRaw<SquadRange[]>(Prisma.sql`
        SELECT MIN(sm.createdAt) AS firstAt, MAX(sm.createdAt) AS lastAt, COUNT(*) AS matches,
               SUM(t.status = 'success') AS analyzed,
               MIN(CASE WHEN t.status = 'success' THEN sm.createdAt END) AS analyzedFirst,
               MAX(CASE WHEN t.status = 'success' THEN sm.createdAt END) AS analyzedLast
        ${squadSql}`),
      prisma.dropPressureStat.aggregate({ where: owner, _min: { matchDate: true }, _max: { matchDate: true }, _count: { _all: true } }),
      prisma.zoneClosurePosition.aggregate({ where: owner, _min: { matchDate: true }, _max: { matchDate: true }, _count: { _all: true } }),
      prisma.memberItemUseStat.aggregate({ where: owner, _min: { matchDate: true }, _max: { matchDate: true } }),
    ])
    const matchCount = Number(squad?.matches ?? 0)
    const analyzedCount = Number(squad?.analyzed ?? 0)
    const matchesLine = matchCount > 0 && squad?.firstAt
      ? { firstSession: day(squad.firstAt), firstMatchAt: new Date(squad.firstAt).toISOString(), lastSession: day(squad.lastAt), count: matchCount }
      : { count: 0 }
    const telemetry = analyzedCount > 0
      ? { since: day(squad?.analyzedFirst), until: day(squad?.analyzedLast), analyzed: analyzedCount, of: matchCount, percent: Math.round((analyzedCount / Math.max(1, matchCount)) * 100) }
      : { analyzed: 0, of: matchCount }
    const note =
      "Dates de soirée (heure de Paris, journée de 06:00 à 06:00). « clanMatches » : les parties avec le clan, la base de la plupart des outils ; « telemetry » : celles dont le déroulé est analysé, base des largages, du kill feed, des positions et des fins de zone. Chaque famille a commencé à sa propre date (fins de zone suivies depuis septembre 2026, objets consommés depuis le 18 septembre 2026) ; les positions brutes de plus de trois semaines sont purgées, leurs agrégats restent. La carrière PUBG couvre toutes les parties du compte depuis sa création, hors du site."

    if (!memberId) {
      const activeMembers = await prisma.clanMember.count({ where: { clanId: scope.clanId, isActive: true } })
      return {
        scope: 'le clan',
        activeMembers,
        clanMatches: matchesLine,
        telemetry,
        data: [
          family('Largages', span(drops, 'matchDate'), { value: drops._count._all, unit: 'sauts' }),
          family('Fins de zone', span(closures, 'matchDate'), { value: closures._count._all, unit: 'fermetures vécues' }),
          family('Objets consommés', span(items, 'matchDate')),
        ],
        note: `${note} Pour le clan, le kill feed et les positions suivent les dates de « telemetry ».`,
      }
    }
    const [kills, cells, member, pubg, pubgTypes, career] = await Promise.all([
      prisma.killEvent.aggregate({ where: { OR: [{ killerMemberId: memberId }, { victimMemberId: memberId }] }, _min: { matchDate: true }, _max: { matchDate: true }, _count: { _all: true } }),
      prisma.positionMetricCell.aggregate({ where: { memberId }, _min: { matchDate: true }, _max: { matchDate: true } }),
      prisma.clanMember.findUnique({ where: { id: memberId }, select: { createdAt: true } }),
      prisma.match.aggregate({ where: { memberId }, _min: { pubgCreatedAt: true }, _max: { pubgCreatedAt: true }, _count: { _all: true } }),
      prisma.match.groupBy({ by: ['matchType'], where: { memberId }, _count: { _all: true } }),
      prisma.memberLifetimeStats.findUnique({ where: { memberId }, select: { lastRefreshedAt: true } }),
    ])
    return {
      scope: resolved && 'memberName' in resolved ? resolved.memberName : 'le joueur',
      onSiteSince: day(member?.createdAt),
      clanMatches: matchesLine,
      pubgMatches: pubg._count._all > 0
        ? {
            since: day(pubg._min.pubgCreatedAt),
            until: day(pubg._max.pubgCreatedAt),
            count: pubg._count._all,
            byType: [...pubgTypes].sort((a, b) => b._count._all - a._count._all).map((row) => `${row._count._all} ${MATCH_TYPE_LABELS[row.matchType] ?? row.matchType}`).join(' · '),
          }
        : { count: 0 },
      telemetry,
      data: [
        family('Largages', span(drops, 'matchDate'), { value: drops._count._all, unit: 'sauts' }),
        family('Kill feed (armes, adversaires)', span(kills, 'matchDate'), { value: kills._count._all, unit: 'kills et morts du joueur' }),
        family('Positions et villes', span(cells, 'matchDate')),
        family('Fins de zone', span(closures, 'matchDate'), { value: closures._count._all, unit: 'fermetures vécues' }),
        family('Objets consommés', span(items, 'matchDate')),
      ],
      careerSyncedAt: career?.lastRefreshedAt.toISOString() ?? null,
      note: `${note} « pubgMatches » : ses parties PUBG suivies par le site, même sans coéquipier du clan (base de son calendrier d'activité) ; elles peuvent commencer après ses premières parties avec le clan, récupérées depuis les coéquipiers.`,
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
    const requestedPeriod = text(args.period) as DropPeriod
    const period: DropPeriod = DROP_PERIODS.includes(requestedPeriod) ? requestedPeriod : DROP_DEFAULT_PERIOD
    const playerScope = text(args.scope) === 'player' || text(args.playerName) !== ''
    const resolved = playerScope ? await resolveMember(args.playerName) : null
    if (resolved && 'error' in resolved) return resolved
    const memberId = resolved && 'memberId' in resolved ? resolved.memberId : null
    const labels = await getMapLabels()
    const requestedMap = text(args.mapName)
    const rawMaps = requestedMap ? resolveMapNames(requestedMap, labels) : []
    if (requestedMap && rawMaps.length === 0) return { error: 'map_not_found', message: `Carte inconnue : ${requestedMap}.` }
    const range = period === 'all' ? null : getPeriodRange(period)

    // Les plus récents d'abord ; à égalité de date, par partie, pour qu'une coupe tombe entre deux parties.
    const [rows, locations] = await Promise.all([
      prisma.dropPressureStat.findMany({
        where: {
          member: { clanId: scope.clanId },
          ...(memberId ? { memberId } : {}),
          ...(rawMaps.length > 0 ? { mapName: { in: rawMaps } } : {}),
          ...(range ? { matchDate: { gte: range.start, lt: range.end } } : {}),
        },
        orderBy: [{ matchDate: 'desc' }, { squadMatchId: 'asc' }],
        take: DROP_ROWS_MAX + 1,
        select: {
          squadMatchId: true,
          memberId: true,
          mapName: true,
          x: true,
          y: true,
          matchDate: true,
          nearbyPlayerCount250m: true,
          nearbyOpponentCount250m: true,
          pressureLevel: true,
          member: { select: { displayName: true } },
        },
      }),
      getMapLocations(),
    ])
    let kept = rows
    const truncated = rows.length > DROP_ROWS_MAX
    if (truncated) {
      // La partie coupée en deux est retirée entière : ses sauts ne comptent ni à moitié ni deux fois.
      const cut = rows[DROP_ROWS_MAX].squadMatchId
      kept = rows.slice(0, DROP_ROWS_MAX).filter((row) => row.squadMatchId !== cut)
    }
    // Place de chaque partie : celle du clan (ses membres actifs) ou du joueur, jamais `SquadMatch.placement` (place du
    // clan qui a créé la ligne d'une partie partagée). Une lecture pour toutes les parties gardées.
    const keptMatchIds = [...new Set(kept.map((row) => row.squadMatchId))]
    const placementRows = keptMatchIds.length
      ? await prisma.squadMember.findMany({
          where: { squadMatchId: { in: keptMatchIds }, ...(memberId ? { memberId } : { member: clanPlacementMemberWhere(scope.clanId) }) },
          select: { squadMatchId: true, placement: true, member: { select: CLAN_PLACEMENT_MEMBER_SELECT } },
        })
      : []
    const membersByMatch = new Map<string, typeof placementRows>()
    for (const row of placementRows) membersByMatch.set(row.squadMatchId, [...(membersByMatch.get(row.squadMatchId) ?? []), row])
    const placementOf = new Map(
      keptMatchIds.map((id) => {
        const members = membersByMatch.get(id) ?? []
        return [id, (memberId ? members[0]?.placement : clanPlacementOf({ members }, scope.clanId)) ?? 0]
      })
    )
    const points: LandingPoint[] = kept.map((row) => {
      const bounds = getMapBounds(row.mapName)
      return {
        memberId: row.memberId,
        memberName: row.member.displayName,
        matchId: row.squadMatchId,
        mapName: row.mapName,
        x: row.x,
        y: row.y,
        xPct: clamp01(row.x / bounds.width) * 100,
        yPct: clamp01(row.y / bounds.height) * 100,
        nearbyPlayerCount250m: row.nearbyPlayerCount250m,
        nearbyOpponentCount250m: row.nearbyOpponentCount250m,
        pressureLevel: (DROP_PRESSURE_LEVELS[row.pressureLevel as DropPressureLevel] ? row.pressureLevel : 'calm') as DropPressureLevel,
      }
    })
    /** Placements des parties (pas des sauts : une partie à quatre ne compte qu'une fois). */
    const placementsOf = (subset: readonly LandingPoint[]) => {
      const placements = [...new Set(subset.map((point) => point.matchId))].map((id) => placementOf.get(id) ?? 0).filter((placement) => placement > 0)
      const summary = placementSummary(placements)
      return summary
        ? { avgPlacement: summary.avgPlacement, top10Percent: summary.top10Percent, winPercent: summary.winRatePercent, ...(summary.matches < DROP_SPOT_LOW_SAMPLE ? { lowSample: true } : {}) }
        : {}
    }
    const level = (average: number) => DROP_PRESSURE_LEVELS[levelOfAverage(average)].label
    const base = {
      scope: resolved && 'memberName' in resolved ? resolved.memberName : 'le clan',
      period: DROP_PERIOD_LABELS[period],
      since: kept.length > 0 ? kept[kept.length - 1].matchDate.toISOString() : null,
      truncated,
    }
    const note =
      "Un saut = l'atterrissage d'un membre (une partie compte autant de sauts que de membres du clan) ; pression = adversaires à moins de 250 m à l'atterrissage, coéquipiers exclus ; « sharePercent » = part des sauts de la carte ; placements calculés par partie, « lowSample » sous " +
      `${DROP_SPOT_LOW_SAMPLE} parties. Les sauts hors des villes configurées ne sont pas un spot.` +
      (truncated ? ' Trop de sauts : les plus anciens manquent, « since » dit d’où part la lecture.' : '')

    if (points.length === 0) {
      return { ...base, map: rawMaps.length > 0 ? mapDisplayName(rawMaps[0], labels) : 'toutes les cartes', jumps: 0, message: 'Aucun saut enregistré sur la période.' }
    }

    if (rawMaps.length === 0) {
      // Toutes les cartes : la question « nos drops favoris » n'en nomme aucune.
      const maps = mapsByJumps(points)
      return {
        ...base,
        map: 'toutes les cartes',
        jumps: points.length,
        matches: placementOf.size,
        maps: maps.slice(0, DROP_MAPS_MAX).map((mapName) => {
          const mapPoints = points.filter((point) => point.mapName === mapName)
          const spots = spotStats(mapPoints, locations[mapName] ?? [])
          const inCities = spots.reduce((sum, spot) => sum + spot.count, 0)
          return {
            map: mapDisplayName(mapName, labels),
            jumps: mapPoints.length,
            sharePercent: Math.round((mapPoints.length / points.length) * 100),
            matches: new Set(mapPoints.map((point) => point.matchId)).size,
            favoriteSpot: spots[0] ? { spot: spots[0].location.name, jumps: spots[0].count, sharePercent: Math.round(spots[0].share), level: level(spots[0].average) } : null,
            topSpots: spots.slice(0, 3).map((spot) => `${spot.location.name} ${spot.count} (${Math.round(spot.share)} %)`).join(' · '),
            outsideCitiesPercent: Math.round(((mapPoints.length - inCities) / mapPoints.length) * 100),
            hotDropPercent: Math.round(jumpProfile(mapPoints).hotDropShare),
          }
        }),
        mapsTruncated: maps.length > DROP_MAPS_MAX,
        note,
      }
    }

    const profile = jumpProfile(points)
    const spots = spotStats(points, locations[rawMaps[0]] ?? [])
    const inCities = new Set<LandingPoint>()
    const enabled = (locations[rawMaps[0]] ?? []).filter((location) => location.enabled)
    for (const point of points) if (locationForPoint(point, enabled)) inCities.add(point)
    const outside = points.filter((point) => !inCities.has(point))
    const members = memberJumpSummaries(points, locations[rawMaps[0]] ?? [])
    const memberLine = (member: (typeof members)[number]) => ({
      player: member.name,
      jumps: member.jumps,
      favoriteSpot: member.favorite ? `${member.favorite.name} (${member.favorite.count})` : 'hors des villes',
      avgOpponents250m: round1(member.average),
      level: DROP_PRESSURE_LEVELS[member.level].label,
    })
    const you = members.find((member) => member.memberId === scope.memberId)
    return {
      ...base,
      map: mapDisplayName(rawMaps[0], labels),
      profile: {
        jumps: profile.jumps,
        matches: profile.matches,
        avgOpponents250m: round1(profile.average),
        maxOpponents250m: profile.maximum,
        hotDropPercent: Math.round(profile.hotDropShare),
        distribution: profile.distribution.map((entry) => `${entry.label} ${Math.round(entry.share)} %`).join(' · '),
      },
      favoriteSpot: spots[0] ? { spot: spots[0].location.name, jumps: spots[0].count, sharePercent: Math.round(spots[0].share), level: level(spots[0].average), king: spots[0].king ? `${spots[0].king.name} (${spots[0].king.count})` : null } : null,
      spots: spots.slice(0, DROP_ZONES_MAX).map((spot) => ({
        spot: spot.location.name,
        jumps: spot.count,
        sharePercent: Math.round(spot.share),
        matches: spot.matches,
        avgOpponents250m: round1(spot.average),
        hotDropPercent: Math.round(spot.hotDropShare),
        level: level(spot.average),
        king: spot.king ? `${spot.king.name} (${spot.king.count})` : null,
        ...placementsOf(points.filter((point) => locationForPoint(point, enabled)?.id === spot.location.id)),
      })),
      spotsTruncated: spots.length > DROP_ZONES_MAX,
      outsideCities: outside.length > 0 ? { jumps: outside.length, sharePercent: Math.round((outside.length / points.length) * 100), ...placementsOf(outside) } : null,
      ...(memberId
        ? {}
        : {
            members: members.slice(0, DROP_MEMBERS_MAX).map(memberLine),
            membersTruncated: members.length > DROP_MEMBERS_MAX,
            you: you ? memberLine(you) : null,
          }),
      note,
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
      note: 'Parties officielles ; agrégats recalculés chaque nuit, la soirée en cours peut manquer. « Cette semaine » commence le lundi à minuit (pas à 06:00) ; pour une soirée précise, getSessions.',
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
    const base = {
      period: PERIOD_LABELS[period],
      clansRanked: league.standings.length,
      minMatches: league.scoring.minMatches,
      note: 'Parties officielles sur une période calendaire : « cette semaine » commence le lundi à minuit.',
    }
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
        itemsTruncated: own.items.length > ITEMS_MAX,
      },
      clan: {
        perMatch: perMatch(clan.totalCount, clanMemberMatches),
        membersCounted: clan.members.length,
        rankByVolume: rank === -1 ? null : rank + 1,
        topConsumer: clan.members[0] ? { player: clan.members[0].displayName, perMatch: round1(clan.members[0].perMatch) } : null,
      },
      thrown: { total: thrown.reduce((sum, row) => sum + row.count, 0), items: thrown.slice(0, ITEMS_MAX), itemsTruncated: thrown.length > ITEMS_MAX },
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
      note: `Une partie = une partie d'escouade du clan ; « vsClans » = écart à la moyenne des ${payload.comparedClans} clans suivis (Top 10 en points, place et kills dans leur unité) ; sous ${payload.minSample} parties sur une carte, ni écart, ni tendance, ni joueur phare. Période calendaire : « cette semaine » commence le lundi à minuit, pas à 06:00 — pour une soirée précise, getSessions.`,
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
          members: { some: { member: clanPlacementMemberWhere(scope.clanId) } },
        },
        orderBy: { createdAt: 'desc' },
        take: SCHEDULE_MATCHES_MAX,
        // La place du clan (ses membres actifs), jamais celle de la ligne : la partie peut être partagée.
        select: {
          createdAt: true,
          members: {
            where: { member: clanPlacementMemberWhere(scope.clanId) },
            select: { timeSurvived: true, placement: true, member: { select: CLAN_PLACEMENT_MEMBER_SELECT } },
          },
        },
      })
      const plays = rows.map((row) => ({
        playedAt: row.createdAt,
        durationSeconds: Math.max(0, ...row.members.map((member) => member.timeSurvived)),
        placement: clanPlacementOf(row, scope.clanId) ?? 0,
      }))
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

  const toLifetime = (row: { combat: unknown; victory: unknown; support: unknown; vehicle: unknown; movement: unknown; other: unknown }): LifetimeStats => ({
    combat: row.combat as LifetimeStats['combat'],
    victory: row.victory as LifetimeStats['victory'],
    support: row.support as LifetimeStats['support'],
    vehicle: row.vehicle as LifetimeStats['vehicle'],
    movement: row.movement as LifetimeStats['movement'],
    other: row.other as LifetimeStats['other'],
  })

  async function getCareerStats(args: ToolArgs) {
    const resolved = await resolveMember(args.playerName)
    if ('error' in resolved) return resolved
    const { memberId, memberName } = resolved
    const requestedMode = text(args.mode)
    const mode: CareerMode = requestedMode === 'squad' || requestedMode === 'duo' || requestedMode === 'solo' ? requestedMode : 'all'
    // Jamais d'appel à l'API PUBG ici (débit limité) : le cache de la page Carrière, synchronisé chaque nuit.
    const [cached, seasons, clanRows] = await Promise.all([
      prisma.memberLifetimeStats.findUnique({ where: { memberId } }),
      prisma.memberSeasonStats.findMany({ where: { memberId }, orderBy: { seasonId: 'desc' }, take: 3 }),
      prisma.memberLifetimeStats.findMany({
        where: { member: { clanId: scope.clanId, isActive: true } },
        select: { memberId: true, combat: true, victory: true, support: true, vehicle: true, movement: true, other: true },
      }),
    ])
    if (!cached) {
      return { error: 'career_not_synced', message: `La carrière PUBG de ${memberName} n'est pas encore synchronisée (synchro de nuit, ou bouton Rafraîchir de sa page Carrière).` }
    }
    const allModes = toLifetime(cached)
    const byMode: Record<Exclude<CareerMode, 'all'>, LifetimeStats | null> = {
      squad: cached.statsSquad as LifetimeStats | null,
      duo: cached.statsDuo as LifetimeStats | null,
      solo: cached.statsSolo as LifetimeStats | null,
    }
    const stats = mode === 'all' ? allModes : byMode[mode]
    if (!stats) return { error: 'mode_not_available', message: `Aucune partie en ${CAREER_MODE_LABELS[mode]} dans la carrière de ${memberName}.` }
    const games = gamesOf(stats)
    const medals = careerMedals(clanMedalRanks(clanRows.map((row) => ({ memberId: row.memberId, stats: toLifetime(row) })), memberId), allModes)
    return {
      player: memberName,
      mode: CAREER_MODE_LABELS[mode],
      syncedAt: cached.lastRefreshedAt.toISOString(),
      career: {
        games,
        wins: stats.victory.wins,
        winRatePercent: round1(winRateOf(stats)),
        kd: round2(stats.combat.kdRatio),
        kills: stats.combat.kills,
        headshotKills: stats.combat.headshots,
        knocks: stats.combat.knockouts,
        assists: stats.combat.assists,
        damage: Math.round(stats.other.damageGiven),
        damagePerGame: games > 0 ? Math.round(stats.other.damageGiven / games) : null,
        revives: stats.support.teammatesRevived,
        healsUsed: stats.support.healed,
        boostsUsed: stats.support.boostsUsed,
        timePlayedHours: stats.other.timeSurvived ? round1(stats.other.timeSurvived / 3600) : null,
        daysPlayed: stats.other.daysPlayed ?? null,
        longestKillM: Math.round(stats.combat.longestKill),
        bestKillStreak: stats.combat.highestKillstreak,
        longestSurvivalMin: Math.round(stats.victory.longestTimeAlive / 60),
        roadkills: stats.vehicle.roadkills,
        vehiclesDestroyed: stats.vehicle.vehiclesDestroyed,
        walkedKm: round1(stats.movement.walkedDistance / 1000),
        drivenKm: round1(stats.movement.drivenDistance / 1000),
        swamKm: round1(stats.movement.swamDistance / 1000),
      },
      clanMedals: medals.map((medal) => ({ stat: medal.label, medal: medal.rank === 1 ? 'or' : medal.rank === 2 ? 'argent' : 'bronze', value: medal.value })),
      seasons: seasons.map((row) => ({
        season: seasonLabel(row.seasonId),
        ranked:
          row.rankedMatches > 0
            ? {
                tier: rankedTierLabel(row.rankedTier, row.rankedSubTier),
                points: Math.round(row.rankedPoints),
                bestTier: rankedTierLabel(row.rankedBestTier, row.rankedBestSubTier),
                matches: row.rankedMatches,
                wins: row.rankedWins,
                kills: row.rankedKills,
              }
            : null,
        normal: {
          matches: row.normalMatches,
          wins: row.normalWins,
          kills: row.normalKills,
          kd: round2(row.normalKills / Math.max(1, row.normalLosses)),
          damagePerMatch: row.normalMatches > 0 ? Math.round(row.normalDamage / row.normalMatches) : null,
        },
      })),
      note: 'Carrière complète du compte PUBG (toutes ses parties, pas seulement celles du clan), synchronisée chaque nuit ; K/D PUBG = kills ÷ défaites ; médailles = podium des membres actifs du clan, tous modes. Les chiffres par période des parties du clan sont dans getClanLeaderboard et getPlayerBenchmark.',
    }
  }

  async function getClanPlaystyle(args: ToolArgs) {
    const resolved = await resolveMember(args.playerName)
    if ('error' in resolved) return resolved
    const period = parsePeriod(args.period)
    const periodKey = getPeriodKey(period, new Date())
    const [rows, pairRows] = await Promise.all([
      prisma.memberTelemetryStats.findMany({
        where: { period: periodKey, member: { clanId: scope.clanId, isActive: true } },
        select: {
          memberId: true,
          aggressionScore: true,
          supportScore: true,
          zoneDisciplineScore: true,
          avgBlueZoneHits: true,
          avgFirstContactPhase: true,
          avgCircleDelaySeconds: true,
          avgCircleDelayPercent: true,
          avgSafeZonePresencePercent: true,
          avgOnFootDistanceMeters: true,
          avgVehicleDistanceMeters: true,
          avgDamageTaken: true,
          avgHealsUsed: true,
          avgHealAmount: true,
          avgBoostsUsed: true,
          maxVehicleSpeedKph: true,
          avgPositionEvents: true,
          matchesPlayed: true,
          member: { select: { displayName: true } },
        },
      }),
      prisma.clanSynergyTelemetryStats.findMany({
        where: { clanId: scope.clanId, period: periodKey, matchType: 'official', mode: 'all' },
        select: {
          memberAId: true,
          memberBId: true,
          reviveCount: true,
          recallCount: true,
          coKillCount: true,
          sharedDamageEvents: true,
          memberA: { select: { displayName: true } },
          memberB: { select: { displayName: true } },
        },
      }),
    ])
    const clanRows: ClanPlaystyleRow[] = rows.map(({ member, ...row }) => ({ ...row, displayName: member.displayName }))
    const pairs: CooperationPair[] = pairRows.map((row) => ({
      memberAId: row.memberAId,
      memberAName: row.memberA.displayName,
      memberBId: row.memberBId,
      memberBName: row.memberB.displayName,
      reviveCount: row.reviveCount,
      recallCount: row.recallCount,
      coKillCount: row.coKillCount,
      sharedDamageEvents: row.sharedDamageEvents,
    }))
    if (clanRows.length === 0) return { period: PERIOD_LABELS[period], members: 0, message: 'Aucune partie analysée par la télémétrie sur la période.' }
    const themes = playstyleThemes(clanRows)
    const summary = cooperationSummary(pairs)
    const top = (id: 'revives' | 'coKills' | 'recalls') => cooperationTop(pairs, id, 3).map((entry) => ({ players: entry.names, value: entry.value }))
    const you = clanRows.find((row) => row.memberId === resolved.memberId) ?? null
    return {
      period: PERIOD_LABELS[period],
      members: clanRows.length,
      roles: playstyleRoles(clanRows).map((role) => ({
        role: role.role,
        measures: role.hint,
        clanAverage: Math.round(role.average),
        top: role.top.map((entry) => ({ player: entry.displayName, score: Math.round(entry.score) })),
      })),
      themes: {
        mobility: {
          kmPerMatch: themes.mobility.distance === null ? null : round1(themes.mobility.distance),
          onFootPercent: Math.round(themes.mobility.footShare),
          maxSpeedKph: Math.round(themes.mobility.maxSpeed),
        },
        circle: {
          inSafeZonePercent: Math.round(themes.circle.safe),
          outsideZonePercent: themes.circle.outside === null ? null : Math.round(themes.circle.outside),
          blueZoneHitsPerMatch: round1(themes.circle.blueZoneHits),
          firstContactPhase: round1(themes.circle.firstContactPhase),
          circleDelaySeconds: themes.circle.delaySeconds === null ? null : Math.round(themes.circle.delaySeconds),
        },
        survival: {
          healedPerMatch: Math.round(themes.survival.healed),
          damageTakenPerMatch: Math.round(themes.survival.damageTaken),
          healCoveragePercent: Math.round(themes.survival.coverage),
          healsPerMatch: round1(themes.survival.heals),
          boostsPerMatch: round1(themes.survival.boosts),
        },
      },
      cooperation: {
        synergyIndex: Math.round(summary.index),
        pairs: summary.pairs,
        revives: summary.revives,
        coKills: summary.coKills,
        recalls: summary.recalls,
        topRevives: top('revives'),
        topCoKills: top('coKills'),
        topRecalls: top('recalls'),
      },
      you: {
        player: resolved.memberName,
        matchesAnalyzed: you ? Math.round(you.matchesPlayed) : 0,
        roles: you
          ? playerRoleComparison(you, clanRows).map((role) => ({ role: role.role, score: role.score, clanAverage: role.clanAverage, delta: role.delta, rank: role.rank, of: role.ranked }))
          : [],
        partners: cooperationPartners(pairs, resolved.memberId)
          .slice(0, 3)
          .map((partner) => ({ player: partner.displayName, revives: partner.revives, coKills: partner.coKills, recalls: partner.recalls })),
      },
      note: 'Parties analysées par la télémétrie ; un score de rôle est relatif au meilleur du clan sur la période (différent des centiles entre clans de getPlayerBenchmark). Indice de synergie : réanimations ×3, co-kills ×2, dégâts partagés ×1, rapporté au meilleur binôme.',
    }
  }

  async function getClanCareer(args: ToolArgs) {
    const resolved = await resolveMember(args.playerName)
    if ('error' in resolved) return resolved
    const requestedGroup = text(args.group) as CareerGroupId
    const groupIds: CareerGroupId[] = CAREER_GROUP_IDS.includes(requestedGroup) ? [requestedGroup] : CAREER_GROUP_IDS
    // Mêmes lectures que `GET /api/clans/[clanId]/lifetime-stats` : le cache de la carrière, jamais l'API PUBG.
    const [rows, activeMembers] = await Promise.all([
      prisma.memberLifetimeStats.findMany({
        where: { member: { clanId: scope.clanId, isActive: true } },
        select: { lastRefreshedAt: true, combat: true, victory: true, support: true, vehicle: true, movement: true, other: true, member: { select: { id: true, displayName: true } } },
      }),
      prisma.clanMember.count({ where: { clanId: scope.clanId, isActive: true } }),
    ])
    if (rows.length === 0) return { error: 'career_not_synced', message: 'Aucune carrière PUBG synchronisée pour les membres du clan (synchro de nuit).' }
    const members: CareerMember[] = rows.map((row) => ({
      memberId: row.member.id,
      displayName: row.member.displayName,
      lastRefreshedAt: row.lastRefreshedAt.toISOString(),
      stats: {
        combat: row.combat as CareerLifetimeStats['combat'],
        victory: row.victory as CareerLifetimeStats['victory'],
        support: row.support as CareerLifetimeStats['support'],
        vehicle: row.vehicle as CareerLifetimeStats['vehicle'],
        movement: row.movement as CareerLifetimeStats['movement'],
        other: row.other as CareerLifetimeStats['other'],
      },
    }))
    /** Place du joueur parmi les membres qui ont la donnée, dans l'ordre du classement de la statistique. */
    const standing = (metric: CareerMetric) => {
      const known = members
        .map((member) => ({ memberId: member.memberId, value: metric.value(member.stats) }))
        .filter((entry): entry is { memberId: number; value: number } => entry.value !== null)
        .sort((a, b) => (metric.order === 'lower' ? a.value - b.value : b.value - a.value))
      const index = known.findIndex((entry) => entry.memberId === resolved.memberId)
      return index === -1 ? null : { value: metric.format(known[index].value), rank: index + 1, of: known.length }
    }
    return {
      player: resolved.memberName,
      membersSynced: members.length,
      activeMembers,
      unsynced: Math.max(0, activeMembers - members.length),
      syncedAt: careerRefresh(members),
      headline: careerHeadline(members).map(({ label, value, detail }) => ({ label, value, detail })),
      groups: computeCareerGroups(members)
        .filter((group) => groupIds.includes(group.id))
        .map((group) => ({
          group: group.title,
          metrics: group.results.map((result) => ({
            metric: result.metric.label,
            kind: result.tag,
            clan: result.value === null ? null : result.metric.format(result.value),
            // Podium en une ligne : 27 statistiques, le détail en objets pesait 1 800 tokens.
            top: result.top.map((entry) => `${entry.displayName} ${result.metric.format(entry.value)}`).join(' · '),
            you: standing(result.metric),
            ...(result.metric.note ? { note: result.metric.note } : {}),
            ...(result.missing > 0 ? { membersWithoutData: result.missing } : {}),
          })),
        })),
      note: "Carrière PUBG complète des comptes (toutes leurs parties, pas seulement celles du clan), synchronisée chaque nuit ; aucune période. « Total » = somme des membres actifs, « Moyenne » = moyenne des joueurs, « Record » = meilleur joueur ; « Moins = mieux » et « Mur de la honte » classent à l'envers (le premier est le plus mauvais). Valeurs écrites à la française.",
    }
  }

  async function getCityInsights(args: ToolArgs) {
    const scopeKind = text(args.scope) === 'clan' ? 'clan' : 'player'
    const requestedPeriod = text(args.period)
    const period: CityInsightsPeriod = requestedPeriod === 'month' || requestedPeriod === 'all' ? requestedPeriod : 'week'
    const requestedType = text(args.matchType) as SessionMatchType
    // Défaut de chaque page : le tableau de bord du clan filtre sur les parties officielles, la page du joueur ne filtre pas.
    const matchType: ClanMatchTypeFilter = SESSION_MATCH_TYPES.includes(requestedType) ? requestedType : scopeKind === 'clan' ? 'official' : 'all'
    const resolved = scopeKind === 'player' ? await resolveMember(args.playerName) : null
    if (resolved && 'error' in resolved) return resolved
    const memberId = resolved && 'memberId' in resolved ? resolved.memberId : undefined
    const [labels, locations] = await Promise.all([getMapLabels(), getMapLocations()])
    const requestedMap = text(args.mapName)
    const rawMaps = requestedMap ? resolveMapNames(requestedMap, labels) : []
    if (requestedMap && rawMaps.length === 0) return { error: 'map_not_found', message: `Carte inconnue : ${requestedMap}.` }

    const base = { clanId: scope.clanId, bounds: getCityPeriodBounds(period), matchType: matchType === 'all' ? null : leagueMatchTypeValues(matchType), mapNames: rawMaps.length > 0 ? rawMaps : null }
    const [cells, deathCells, coverage, clanCells] = await Promise.all([
      loadCityMetricCells({ ...base, memberId }),
      loadCityMetricCells({ ...base, memberId, sources: ['death'] }),
      loadCityMatchCoverage({ ...base, memberId }),
      // Référence de comparaison du joueur : tout le clan sur les mêmes filtres.
      memberId ? loadCityMetricCells(base) : Promise.resolve(null),
    ])
    const grid = buildCityGrid(locations)
    const mapLabel = (mapName: string) => mapDisplayName(mapName, labels)
    const aggregation = aggregateCityCells({ rows: cells, grid, mapLabel })
    const built = buildCityInsights({ period, aggregation, timeline: [], matchCount: coverage.matchCount, dataStart: coverage.dataStart, mapLabel })
    const insights = clanCells ? withClanComparison(built, aggregateCityCells({ rows: clanCells, grid, mapLabel })) : built
    const deaths = rankCellsByCity(deathCells, grid, mapLabel)

    const cityLine = (city: CityEntry) => ({
      city: city.name,
      map: city.mapLabel,
      events: city.events,
      sharePercent: Math.round(city.share),
      ...(city.clanShare !== null ? { clanSharePercent: Math.round(city.clanShare) } : {}),
    })
    // Bilan des combats : kills et morts rattachés à la même ville, les villes les plus disputées d'abord.
    const fights = new Map<string, { city: string; map: string; kills: number; deaths: number }>()
    for (const city of aggregation.cities) fights.set(`${city.mapName}|${city.locationId}`, { city: city.name, map: city.mapLabel, kills: city.byMetric.kill, deaths: 0 })
    for (const city of deaths.cities) {
      const key = `${city.mapName}|${city.locationId}`
      const entry = fights.get(key) ?? { city: city.name, map: city.mapLabel, kills: 0, deaths: 0 }
      entry.deaths = city.events
      fights.set(key, entry)
    }
    const { presence } = insights.metricTotals
    return {
      scope: resolved && 'memberName' in resolved ? resolved.memberName : 'le clan',
      period: PERIOD_LABELS[period],
      matchType: matchType === 'all' ? 'toutes les parties' : leagueMatchTypeOption(matchType).label,
      map: rawMaps.length > 0 ? mapDisplayName(rawMaps[0], labels) : 'toutes les cartes',
      matches: coverage.matchCount,
      since: coverage.dataStart?.toISOString() ?? null,
      mainMap: insights.mainMapLabel,
      favoriteCity: insights.favoriteCity ? cityLine(insights.favoriteCity) : null,
      favoriteCombatCity: insights.favoriteCombatCity ? { city: insights.favoriteCombatCity.name, map: insights.favoriteCombatCity.mapLabel, combatEvents: insights.favoriteCombatCity.events } : null,
      outsideCitiesPercent: presence > 0 ? Math.round((1 - insights.cityTotals.presence / presence) * 100) : null,
      top: {
        presence: insights.top.presence.map(cityLine),
        kills: insights.top.kill.map(cityLine),
        damage: insights.top.damage.map(cityLine),
        revives: insights.top.revive.map(cityLine),
        deaths: deaths.cities.slice(0, CITY_TOP).map((city) => ({ city: city.name, map: city.mapLabel, events: city.events, sharePercent: Math.round(city.share) })),
      },
      fights: [...fights.values()]
        .filter((entry) => entry.kills + entry.deaths > 0)
        .sort((a, b) => b.kills + b.deaths - (a.kills + a.deaths))
        .slice(0, CITY_TOP)
        .map((entry) => ({ ...entry, killsPerDeath: entry.deaths > 0 ? round2(entry.kills / entry.deaths) : null })),
      note: "Positions des parties analysées, rattachées aux villes configurées sur chaque carte ; ce qui se passe hors de toute ville compte dans les totaux (« outsideCitiesPercent »), jamais dans une ville. « sharePercent » = part parmi les événements en ville ; « clanSharePercent » = part du clan sur la même ville, donnée seulement avec assez d'événements des deux côtés. Les positions brutes de plus de trois semaines sont purgées : « since » dit depuis quand les données existent. Période calendaire (semaine depuis lundi).",
    }
  }

  async function getZoneClosures(args: ToolArgs) {
    const resolved = await resolveMember(args.playerName)
    if ('error' in resolved) return resolved
    const requestedPeriod = text(args.period)
    const period: ZoneClosurePeriod = requestedPeriod === 'month' || requestedPeriod === 'all' ? requestedPeriod : 'week'
    const phase = parseTacticalPhase(text(args.phase) || null)
    const [labels, locations] = await Promise.all([getMapLabels(), getMapLocations()])
    const requestedMap = text(args.mapName)
    const rawMaps = requestedMap ? resolveMapNames(requestedMap, labels) : []
    if (requestedMap && rawMaps.length === 0) return { error: 'map_not_found', message: `Carte inconnue : ${requestedMap}.` }

    const load = (mapName: string | null) =>
      loadZoneClosureSummary({ clanId: scope.clanId, period, bounds: getZoneClosurePeriodBounds(period), mapName, phases: tacticalPhaseNumbers(phase), locations })
    // Sans carte, la page prend la plus jouée ; une carte demandée n'est relue que si elle a des fermetures.
    let summary = await load(null)
    const mapLines = (except: string | null) =>
      summary.maps.filter((entry) => entry.mapName !== except).map((entry) => ({ map: mapDisplayName(entry.mapName, labels), closures: entry.positions, matches: entry.matches }))
    if (rawMaps.length > 0) {
      const available = summary.maps.find((entry) => rawMaps.includes(entry.mapName))
      if (!available) {
        return { map: mapDisplayName(rawMaps[0], labels), period: PERIOD_LABELS[period], message: 'Aucune fin de zone enregistrée sur cette carte pour la période.', otherMaps: mapLines(null) }
      }
      if (available.mapName !== summary.selectedMap) summary = await load(available.mapName)
    }
    if (!summary.selectedMap || summary.counts.positions === 0) {
      return { period: PERIOD_LABELS[period], phase: tacticalPhaseLabel(phase), message: 'Aucune fin de zone enregistrée sur la période.' }
    }

    const memberLine = (member: ZoneClosureMemberStat) => {
      const shares = bandShares(member.bands)
      return {
        player: member.displayName,
        closures: member.positions,
        avgDistancePercentOfRadius: ratioPercent(member.averageRatio),
        centerPercent: Math.round(shares.center),
        edgePercent: Math.round(shares.edge),
        outsidePercent: Math.round(shares.outside),
        profile: memberZoneProfile(member)?.label ?? `trop peu de fermetures (moins de ${MIN_PLAYER_SAMPLE})`,
      }
    }
    const shares = bandShares(summary.bands)
    const verdict = zoneVerdict(summary.bands)
    const ranked = rankZoneMembers(summary.members)
    const you = summary.members.find((member) => member.memberId === resolved.memberId)
    return {
      map: mapDisplayName(summary.selectedMap, labels),
      period: PERIOD_LABELS[period],
      phase: tacticalPhaseLabel(phase),
      otherMaps: mapLines(summary.selectedMap),
      counts: { ...summary.counts, averageSurvivors: round1(summary.counts.averageSurvivors) },
      lowSample: summary.counts.positions < ZONE_LOW_SAMPLE,
      since: summary.dataStart,
      bands: { centerPercent: Math.round(shares.center), edgePercent: Math.round(shares.edge), outsidePercent: Math.round(shares.outside) },
      avgDistancePercentOfRadius: ratioPercent(summary.averageRatio),
      verdict: verdict ? { title: verdict.title, sentence: verdict.sentence } : null,
      titles: zoneTitles(summary.members).map((title) => ({ title: title.title, meaning: title.description, player: title.displayName, value: title.value })),
      byPhase: summary.byPhase.map((entry) => {
        const phaseShares = bandShares(entry.bands)
        return {
          phase: entry.phase,
          positions: entry.positions,
          centerPercent: Math.round(phaseShares.center),
          edgePercent: Math.round(phaseShares.edge),
          outsidePercent: Math.round(phaseShares.outside),
          avgDistancePercentOfRadius: ratioPercent(entry.averageRatio),
        }
      }),
      arrivalCities: summary.topCities.map((city) => ({ city: city.name, positions: city.positions, sharePercent: Math.round(city.share) })),
      members: ranked.slice(0, ZONE_MEMBERS_MAX).map(memberLine),
      membersTruncated: ranked.length > ZONE_MEMBERS_MAX,
      you: you ? memberLine(you) : { player: resolved.memberName, closures: 0 },
      note: `Une fin de zone = l'instant où le cercle se referme ; position de chaque membre encore en vie : centre (moins de 50 % du rayon), bord intérieur (jusqu'à 100 %), dehors (au-delà). Biais de survie : une escouade éliminée tôt ne pèse que sur les premières fermetures, les phases tardives ne décrivent que les survivants ; sous ${ZONE_LOW_SAMPLE} observations l'échantillon est fragile, et un joueur sous ${MIN_PLAYER_SAMPLE} fermetures n'a ni profil ni titre. Les membres sont classés du plus central au plus excentré. Période calendaire (semaine depuis lundi).`,
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
      truncated: overviews.length > take,
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

    // « Mon résultat » : la ligne du joueur (ou d'un autre membre du clan) manche par manche, et ses armes — la page du
    // tournoi classe des clans ou des équipes, pas le joueur (fil 10 du 2026-10-25).
    const resolved = await resolveMember(args.playerName)
    if ('error' in resolved) return resolved
    const matchIds = matches.map((match) => match.id)
    const killRows = matchIds.length > 0
      ? await prisma.killEvent.findMany({
          where: { squadMatchId: { in: matchIds }, killerMemberId: { not: null }, killerMember: { clanId: scope.clanId } },
          select: { killerMemberId: true, weaponName: true, headshot: true, distance: true },
        })
      : []
    const weaponLabels = killRows.length > 0 ? await getWeaponLabels() : {}
    const weaponsOf = (rows: typeof killRows) => {
      const byWeapon = new Map<string, { kills: number; headshots: number; distanceSum: number; distanceCount: number }>()
      for (const row of rows) {
        const name = row.weaponName ? weaponDisplayName(row.weaponName, weaponLabels) : 'Arme inconnue'
        const entry = byWeapon.get(name) ?? { kills: 0, headshots: 0, distanceSum: 0, distanceCount: 0 }
        entry.kills += 1
        if (row.headshot) entry.headshots += 1
        // Distance du kill feed en centimètres, comme les statistiques d'armes.
        if (typeof row.distance === 'number' && row.distance > 0) {
          entry.distanceSum += row.distance / 100
          entry.distanceCount += 1
        }
        byWeapon.set(name, entry)
      }
      return [...byWeapon.entries()]
        .sort((a, b) => b[1].kills - a[1].kills || a[0].localeCompare(b[0], 'fr'))
        .slice(0, TOURNAMENT_WEAPONS_MAX)
        .map(([weapon, stats]) => ({ weapon, kills: stats.kills, headshots: stats.headshots, ...(stats.distanceCount > 0 ? { avgDistanceM: Math.round(stats.distanceSum / stats.distanceCount) } : {}) }))
    }
    const ownRounds = rounds.flatMap((round) => {
      const line = matches.find((match) => match.id === round.matchId)?.members.find((row) => row.memberId === resolved.memberId)
      if (!line) return []
      return [{
        round: round.index,
        map: round.mapName ? mapDisplayName(round.mapName, labels) : null,
        gamePlacement: line.placement,
        kills: line.kills,
        damage: Math.round(line.damage),
        ...(round.mvp?.memberId === resolved.memberId ? { mvpOfRound: true } : {}),
      }]
    })
    const ownKills = killRows.filter((row) => row.killerMemberId === resolved.memberId)
    const ownPlacements = placementSummary(ownRounds.map((line) => line.gamePlacement))

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
      standingsTruncated: standings.length > TOURNAMENT_STANDINGS_MAX,
      roundsTruncated: rounds.length > TOURNAMENT_ROUNDS_MAX,
      rounds: rounds.slice(-TOURNAMENT_ROUNDS_MAX).map((round) => ({
        round: round.index,
        playedAt: round.createdAt,
        map: round.mapName ? mapDisplayName(round.mapName, labels) : null,
        winner: round.winnerLabel,
        mvp: round.mvp ? { label: round.mvp.label, kills: round.mvp.kills } : null,
        podium: round.scores.slice(0, TOURNAMENT_ROUND_PODIUM).map((score, index) => ({ roundRank: index + 1, label: score.label, points: round1(score.points), kills: score.totalKills, gamePlacement: score.bestPlacement })),
        yourClan: round.scores.filter((score) => mineKeys.has(score.key)).map((score) => ({ roundRank: round.scores.indexOf(score) + 1, label: score.label, points: round1(score.points), kills: score.totalKills, gamePlacement: score.bestPlacement })),
      })),
      you: {
        player: resolved.memberName,
        roundsPlayed: ownRounds.length,
        ...(ownPlacements
          ? {
              kills: ownRounds.reduce((sum, line) => sum + line.kills, 0),
              damage: ownRounds.reduce((sum, line) => sum + line.damage, 0),
              avgGamePlacement: ownPlacements.avgPlacement,
              bestGamePlacement: ownPlacements.bestPlacement,
              mvpRounds: ownRounds.filter((line) => line.mvpOfRound).map((line) => line.round),
            }
          : {}),
        rounds: ownRounds,
        weapons: weaponsOf(ownKills),
        weaponKills: ownKills.length,
      },
      clanWeapons: weaponsOf(killRows),
      clanWeaponKills: killRows.length,
      note:
        "Même calcul que la page du tournoi ; les pseudos des autres clans sont ceux des joueurs suivis par le site. « rank » et « roundRank » : classement aux points du barème (général ou de la manche) ; « placement », « gamePlacement » et leurs moyennes : place en jeu de la partie (Top 1 = 1) — ne pas confondre. « you » : le joueur lui-même, manche par manche ; « yourClan » : son clan. Armes : kills de la télémétrie, qui peuvent être moins nombreux que ceux du tableau de score (« weaponKills », « clanWeaponKills » contre « kills ») : dis-le si l'écart est visible.",
    }
  }

  const handlers: Record<string, (args: ToolArgs) => Promise<unknown>> = {
    getRecentMatches,
    getSessions,
    getDataCoverage,
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
    getCareerStats,
    getClanPlaystyle,
    getClanCareer,
    getCityInsights,
    getZoneClosures,
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
