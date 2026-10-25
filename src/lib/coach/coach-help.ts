import type { CoachSettings } from '@/lib/coach/coach-config'
import { COACH_MEMORY_MAX, COACH_MEMORY_RETENTION_DAYS, COACH_MEMORY_TOOL_NAME } from '@/lib/coach/coach-memory'

/**
 * Aide du Coach IA (demande du 2026-10-25) : ce qu'il sait faire — un domaine par groupe d'outils, avec des questions
 * d'exemple qu'un outil sait vraiment servir —, ses limites, et comment l'améliorer. Source unique de la carte de
 * `/account` et de la section « aide » de la page plein écran ; `coach-help.test.ts` vérifie que chaque outil déclaré
 * est couvert par un domaine et qu'aucun domaine ne cite un outil qui n'existe pas.
 */

export type CoachHelpDomain = {
  id: string
  title: string
  /** Outils de `coach-tools.ts` qui servent ce domaine. */
  tools: string[]
  /** Questions que ces outils savent servir, telles qu'un joueur les pose. */
  examples: string[]
}

export const COACH_HELP_DOMAINS: CoachHelpDomain[] = [
  {
    id: 'parties',
    title: 'Tes parties',
    tools: ['getRecentMatches', 'getMatchDebrief'],
    examples: ['Pourquoi on s’est fait sortir sur la dernière partie ?', 'Mes cinq dernières parties sur Erangel'],
  },
  {
    id: 'arsenal',
    title: 'Tes armes et tes objets',
    tools: ['getWeaponStats', 'getItemUsage'],
    examples: ['Mes stats au M416 ce mois-ci', 'Combien de soins et de grenades j’utilise par partie ?'],
  },
  {
    id: 'adversaires',
    title: 'Adversaires et largages',
    tools: ['getOpponentRecord', 'getDropZones'],
    examples: ['Notre bilan contre les [RATZ]', 'Où atterrir sur Miramar ?'],
  },
  {
    id: 'classements',
    title: 'Classement, Ligue et tournois',
    tools: ['getClanLeaderboard', 'getLeagueStanding', 'getTournaments', 'getTournamentResults'],
    examples: ['Qui est en tête du clan ce mois-ci ?', 'Notre place en Ligue des clans', 'Qui a gagné le dernier tournoi ?'],
  },
  {
    id: 'clan',
    title: 'Le clan : cartes, horaires, style de jeu',
    tools: ['getMapPerformance', 'getPlaySchedule', 'getClanPlaystyle'],
    examples: ['Sur quelle carte on gagne le plus ?', 'Quand est-ce que je joue le plus en semaine ?', 'Quel est le style de jeu du clan ?'],
  },
  {
    id: 'carriere',
    title: 'Ta carrière et ta place parmi les joueurs',
    tools: ['getCareerStats', 'getPlayerBenchmark'],
    examples: ['Mon K/D en ranked cette saison', 'Où je me situe parmi les joueurs du site ?'],
  },
]

/** Domaine ouvert avec la mémoire personnelle (lot 11) : affiché seulement quand l'administrateur l'a ouverte. */
export const COACH_HELP_MEMORY_DOMAIN: CoachHelpDomain = {
  id: 'memoire',
  title: 'Ce qu’il retient de toi',
  tools: [COACH_MEMORY_TOOL_NAME],
  examples: ['Retiens que mon objectif, c’est 30 % de headshots au Kar98k', 'Retiens que je préfère jouer le soir en squad'],
}

/** Limites chiffrées montrées dans l'aide (`GET /api/coach/limits`, public, cache 5 min) : réglages du SuperUser et bornes de la mémoire. */
export type CoachLimits = {
  hourlyLimit: number
  minIntervalSeconds: number
  maxInputChars: number
  budgetPerAccountEur: number
  historyMessages: number
  memoryEnabled: boolean
  memoryMax: number
  memoryRetentionDays: number
}

export function coachLimitsPayload(settings: CoachSettings): CoachLimits {
  return {
    hourlyLimit: settings.hourlyLimit,
    minIntervalSeconds: settings.minIntervalSeconds,
    maxInputChars: settings.maxInputChars,
    budgetPerAccountEur: settings.budgetPerAccountEur,
    historyMessages: settings.historyMessages,
    memoryEnabled: settings.memoryEnabled,
    memoryMax: COACH_MEMORY_MAX,
    memoryRetentionDays: COACH_MEMORY_RETENTION_DAYS,
  }
}

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const INT = new Intl.NumberFormat('fr-FR')

/** Limites, chiffrées quand les réglages sont connus (demande du 2026-10-25), génériques sinon. */
export function coachHelpLimits(limits: CoachLimits | null): string[] {
  const quota = limits
    ? `${INT.format(limits.hourlyLimit)} questions par heure et ${EUR.format(limits.budgetPerAccountEur)} de budget par mois pour ton compte (le panneau affiche le restant) ; au-delà, il te donne l’heure de retour.`
    : 'Un nombre de questions par heure et un budget par mois, affichés dans le panneau ; au-delà, il te donne l’heure de retour.'
  const question = limits
    ? `Une question fait au plus ${INT.format(limits.maxInputChars)} caractères${limits.minIntervalSeconds > 0 ? `, à ${INT.format(limits.minIntervalSeconds)} s d’écart au moins` : ''} ; il relit les ${INT.format(limits.historyMessages)} derniers messages du fil avec chaque question.`
    : 'Une question est bornée en longueur, et il ne relit que les derniers messages du fil.'
  const rows = [
    'Il ne lit que les données de ton clan sur le site, plus les tournois : rien sur un autre clan ni sur un joueur absent du site.',
    'Tout chiffre qu’il donne vient d’un outil ci-dessus. Ce qu’aucun outil ne mesure, il ne le sait pas : la cause exacte d’une mort, ce qui s’est dit en vocal, les parties jouées hors du clan.',
    'Une partie dont la télémétrie n’est pas encore analysée n’a rien à lui apprendre avant le lendemain matin.',
    'Hors PUBG (devoirs, code, vie privée), il refuse en une phrase.',
    'Ses réponses sont générées par un modèle d’IA : elles peuvent être inexactes. Les statistiques du site font foi.',
    quota,
    question,
  ]
  if (limits?.memoryEnabled) {
    rows.push(`Il retient au plus ${INT.format(limits.memoryMax)} lignes sur toi, ${INT.format(limits.memoryRetentionDays)} jours après leur dernière mise à jour — en tes mots seulement, jamais une déduction.`)
  }
  return rows
}

/** Limites génériques (sans réglages connus) : forme de repli de `coachHelpLimits`. */
export const COACH_HELP_LIMITS: string[] = coachHelpLimits(null)

export const COACH_HELP_IMPROVE: string[] = [
  'Vote « Utile » ou « Inexact » sous chaque réponse. Avec « Inexact », précise ce qui cloche (heure, chiffre, joueur) : c’est ce que l’administrateur relit pour corriger le Coach, sans voir ton compte.',
  'Reste dans ses domaines : une question hors de ses outils n’aura pas de réponse chiffrée.',
  'Ouvre-le depuis la page concernée (débriefing, tes armes, un tournoi) : il prend le contexte de la page.',
  'Nomme les choses comme sur le site : pseudo du membre, tag du clan adverse entre crochets, nom de la carte.',
  'Enchaîne tes questions dans le même fil : il garde la conversation.',
]

export const COACH_HELP_MEMORY_TIP =
  'Dis-lui « retiens que… » pour un objectif ou une préférence, en tes mots : il s’en servira quand c’est utile, et tu vois et effaces tout depuis « Ce que le Coach sait de toi ».'

/** Domaines à afficher : les six de base, plus la mémoire quand elle est ouverte. */
export function coachHelpDomains(memoryEnabled: boolean): CoachHelpDomain[] {
  return memoryEnabled ? [...COACH_HELP_DOMAINS, COACH_HELP_MEMORY_DOMAIN] : COACH_HELP_DOMAINS
}
