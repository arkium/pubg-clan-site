/**
 * Contexte de page du Coach IA (docs/TODO/chatbot-ia.md §7.2) : le tiroir envoie le chemin de la page
 * (`contextPath`), reconnu ici par motif — **pur**, aucune confiance : la vérification serveur (`resolveCoachContext`,
 * `coach-context-service.ts`) contrôle ensuite que le match ou le joueur appartient bien au clan de la session.
 */

export type CoachPageContext =
  | { kind: 'match'; clanId: number; matchId: string }
  | { kind: 'tournament'; tournamentId: string }
  | { kind: 'tournament-match'; tournamentId: string; matchId: string }
  | { kind: 'session'; clanId: number; date: string }
  | { kind: 'clan'; clanId: number; page: 'matches' | 'weapons' | 'opponents' | 'drop-zones' | 'maps' | 'other' }
  | { kind: 'member'; memberId: number; page: 'weapons' | 'nemesis' | 'drop-zones' | 'items' | 'heatmap' | 'other' }
  | { kind: 'players' }
  | { kind: 'none' }

const POSITIVE_INT = /^[1-9]\d*$/
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

function segments(path: string | null | undefined): string[] {
  if (typeof path !== 'string' || path.length > 512) return []
  const pathname = path.split(/[?#]/, 1)[0]
  return pathname.split('/').filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
  })
}

export function parseCoachContextPath(path: string | null | undefined): CoachPageContext {
  const parts = segments(path)
  const [root, id, ...rest] = parts

  if (root === 'clans' && id && POSITIVE_INT.test(id)) {
    const clanId = Number(id)
    if (rest[0] === 'telemetry' && rest[1] === 'matches' && rest[2] && SAFE_ID.test(rest[2]) && rest[3] === 'debrief') {
      return { kind: 'match', clanId, matchId: rest[2] }
    }
    if (rest[0] === 'matches' && rest[1] === 'session' && rest[2] && ISO_DAY.test(rest[2])) {
      return { kind: 'session', clanId, date: rest[2] }
    }
    if (rest[0] === 'matches') return { kind: 'clan', clanId, page: 'matches' }
    if (rest[0] === 'stats' && rest[1] === 'weapons') return { kind: 'clan', clanId, page: 'weapons' }
    if (rest[0] === 'stats' && rest[1] === 'maps') return { kind: 'clan', clanId, page: 'maps' }
    if (rest[0] === 'stats' && rest[1] === 'opponents') return { kind: 'clan', clanId, page: 'opponents' }
    if (rest[0] === 'drop-zones') return { kind: 'clan', clanId, page: 'drop-zones' }
    return { kind: 'clan', clanId, page: 'other' }
  }

  if (root === 'tournaments' && id && SAFE_ID.test(id)) {
    if (rest[0] === 'matches' && rest[1] && SAFE_ID.test(rest[1])) return { kind: 'tournament-match', tournamentId: id, matchId: rest[1] }
    // La page du tournoi et sa liste de manches : même contexte.
    if (rest.length === 0 || (rest[0] === 'matches' && rest.length === 1)) return { kind: 'tournament', tournamentId: id }
  }

  if (root === 'members' && id && POSITIVE_INT.test(id)) {
    const memberId = Number(id)
    if (rest[0] === 'weapons') return { kind: 'member', memberId, page: 'weapons' }
    if (rest[0] === 'nemesis') return { kind: 'member', memberId, page: 'nemesis' }
    if (rest[0] === 'drop-zones') return { kind: 'member', memberId, page: 'drop-zones' }
    if (rest[0] === 'items') return { kind: 'member', memberId, page: 'items' }
    if (rest[0] === 'heatmap') return { kind: 'member', memberId, page: 'heatmap' }
    return { kind: 'member', memberId, page: 'other' }
  }

  if (root === 'players' && !id) return { kind: 'players' }

  return { kind: 'none' }
}

/** Contexte vérifié par le serveur : ce que le prompt et le tiroir peuvent utiliser. */
export type CoachResolvedContext =
  | {
      kind: 'match'
      matchId: string
      mapName: string
      mapLabel: string
      createdAt: Date
      placement: number
      squadKills: number
      telemetryAnalyzed: boolean
    }
  | { kind: 'session'; date: string }
  | { kind: 'weapons'; memberId: number; memberName: string }
  | { kind: 'items'; memberId: number; memberName: string }
  | { kind: 'schedule'; memberId: number; memberName: string }
  | { kind: 'players' }
  | { kind: 'opponents' }
  | { kind: 'drop-zones' }
  | { kind: 'maps' }
  | { kind: 'tournament'; tournamentId: string; title: string; phase: 'upcoming' | 'live' | 'finished' }
  | { kind: 'none' }

/** Titre d'un tournoi dans le bandeau : coupé pour tenir dans `contextLabel` (120 caractères). */
const TOURNAMENT_TITLE_MAX = 60
const TOURNAMENT_PHASE_LABELS = { upcoming: 'à venir', live: 'en cours', finished: 'terminé' } as const

function shortTitle(title: string): string {
  const trimmed = title.trim()
  return trimmed.length > TOURNAMENT_TITLE_MAX ? `${trimmed.slice(0, TOURNAMENT_TITLE_MAX - 1).trimEnd()}…` : trimmed
}

const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })
const HOUR_MINUTE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

/** « Top 3 » jusqu'à la dixième place, « 17e » ensuite. */
export function placementLabel(placement: number): string {
  return placement <= 10 ? `Top ${placement}` : `${placement}e`
}

/** Étiquette du bandeau de contexte : « Erangel · 22 oct. 21:47 · Top 3 ». Jamais de numéro de match. */
export function coachContextLabel(context: CoachResolvedContext): string | null {
  switch (context.kind) {
    case 'match':
      return `${context.mapLabel} · ${DAY_MONTH.format(context.createdAt)} ${HOUR_MINUTE.format(context.createdAt)} · ${placementLabel(context.placement)}`
    case 'session':
      return `Soirée du ${context.date.slice(8, 10)}/${context.date.slice(5, 7)}`
    case 'weapons':
      return `Armes de ${context.memberName}`
    case 'items':
      return `Objets de ${context.memberName}`
    case 'schedule':
      return `Activité de ${context.memberName}`
    case 'players':
      return 'Classement des joueurs'
    case 'opponents':
      return 'Adversaires du clan'
    case 'drop-zones':
      return 'Zones de largage'
    case 'maps':
      return 'Cartes du clan'
    case 'tournament':
      return `Tournoi · ${shortTitle(context.title)}`
    case 'none':
      return null
  }
}

/** Trois suggestions cliquables, selon la page. */
export function coachSuggestions(context: CoachResolvedContext): string[] {
  switch (context.kind) {
    case 'match':
      return context.telemetryAnalyzed
        ? ['Pourquoi on s’est fait sortir ?', 'Qui a fait les ouvertures ?', 'Quelles armes nous ont fait mal ?']
        : ['Comment s’est passée notre dernière soirée ?', 'Quelle est ma meilleure arme ?', 'Où atterrir sur cette carte ?']
    case 'session':
      return ['Comment s’est passée cette soirée ?', 'Quelle partie a été la meilleure ?', 'Qui a porté l’escouade ?']
    case 'weapons':
      return ['Quelle est ma meilleure arme ?', 'Beryl ou M416 ?', 'Je suis plus précis à quelle distance ?']
    case 'items':
      return ['Je me soigne assez ?', 'Quels boosts je consomme le plus ?', 'Combien de grenades je lance par partie ?']
    case 'schedule':
      return ['Quand est-ce que je joue le plus ?', 'Mon horaire de jeu en semaine ?', 'Combien de soirées par semaine ?']
    case 'players':
      return ['Où je me situe ?', 'Quel est mon rôle ?', 'Qui est juste devant moi ?']
    case 'opponents':
      return ['Quel clan nous bat le plus ?', 'Qui est notre pire adversaire ?', 'Comment battre ce clan ?']
    case 'drop-zones':
      return ['Où atterrir sur Erangel ?', 'Nos hot drops valent-ils le coup ?', 'Quelle zone nous réussit le mieux ?']
    case 'maps':
      return ['Quelle est notre pire carte ?', 'Où est-on les plus forts ?', 'Qui porte l’escouade sur Erangel ?']
    case 'tournament':
      if (context.phase === 'finished') return ['Qui a gagné le tournoi ?', 'Comment s’est classé notre clan ?', 'Quelle manche a fait la différence ?']
      if (context.phase === 'live') return ['Qui est en tête ?', 'Où en est notre clan ?', 'Qui est le MVP pour l’instant ?']
      return ['Quand commence le tournoi ?', 'Quel est le barème ?', 'Qui l’organise ?']
    case 'none':
      return ['Comment s’est passée notre dernière soirée ?', 'Quelle est ma meilleure arme ?', 'Où atterrir sur Miramar ?']
  }
}

/** Bloc de contexte du prompt système : dit au modèle quoi regarder et par quel outil. */
export function coachContextPromptBlock(context: CoachResolvedContext): string {
  switch (context.kind) {
    case 'match': {
      const label = coachContextLabel(context)
      return context.telemetryAnalyzed
        ? `Page consultée : débriefing du match « ${label} » (identifiant ${context.matchId}, ${context.squadKills} kills d'escouade). Pour toute question sur ce match, appelle getMatchDebrief avec matchId « ${context.matchId} ».`
        : `Page consultée : match « ${label} » (identifiant ${context.matchId}) dont la télémétrie n'est pas encore analysée : dis-le si on te demande son déroulé, et propose de revenir demain matin.`
    }
    case 'session':
      return `Page consultée : soirée du ${context.date} du clan. Appelle getRecentMatches pour ses parties.`
    case 'weapons':
      return `Page consultée : armes de ${context.memberName}. Appelle getWeaponStats pour ses chiffres.`
    case 'items':
      return `Page consultée : objets consommés de ${context.memberName} (soins, boosts, carburant, gadgets, lancers). Appelle getItemUsage pour ses chiffres.`
    case 'schedule':
      return `Page consultée : calendrier d'activité de ${context.memberName} (jours, heures, soirées). Appelle getPlaySchedule pour ses chiffres.`
    case 'players':
      return 'Page consultée : classement inter-clans des joueurs. Appelle getPlayerBenchmark pour situer le joueur.'
    case 'opponents':
      return 'Page consultée : adversaires du clan. Appelle getOpponentRecord avec le tag du clan adverse demandé.'
    case 'drop-zones':
      return 'Page consultée : zones de largage du clan. Appelle getDropZones avec la carte demandée.'
    case 'maps':
      return 'Page consultée : cartes du clan (performance carte par carte). Appelle getMapPerformance, avec mapName si la question vise une carte.'
    case 'tournament':
      return `Page consultée : tournoi « ${shortTitle(context.title)} » (identifiant ${context.tournamentId}, ${TOURNAMENT_PHASE_LABELS[context.phase]}). Pour toute question sur ce tournoi (vainqueur, classement, manches, barème, place du clan), appelle getTournamentResults avec tournamentId « ${context.tournamentId} ».`
    case 'none':
      return 'Page consultée : sans contexte particulier. Choisis l’outil selon la question.'
  }
}
