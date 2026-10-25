import { COACH_MEMORY_TOOL_NAME } from '@/lib/coach/coach-memory'

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

export const COACH_HELP_LIMITS: string[] = [
  'Il ne lit que les données de ton clan sur le site, plus les tournois : rien sur un autre clan ni sur un joueur absent du site.',
  'Tout chiffre qu’il donne vient d’un outil ci-dessus. Ce qu’aucun outil ne mesure, il ne le sait pas : la cause exacte d’une mort, ce qui s’est dit en vocal, les parties jouées hors du clan.',
  'Une partie dont la télémétrie n’est pas encore analysée n’a rien à lui apprendre avant le lendemain matin.',
  'Hors PUBG (devoirs, code, vie privée), il refuse en une phrase.',
  'Ses réponses sont générées par un modèle d’IA : elles peuvent être inexactes. Les statistiques du site font foi.',
  'Un nombre de questions par heure et un budget par mois, affichés dans le panneau ; au-delà, il te donne l’heure de retour.',
]

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
