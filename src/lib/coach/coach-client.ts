import { parseCoachContextPath } from '@/lib/coach/coach-context'

/**
 * Constantes et aides du Coach IA **côté navigateur** (docs/TODO/chatbot-ia.md §8) : rien ici n'importe Prisma ni la
 * configuration serveur. Les vraies limites viennent de la route ; celles-ci servent à l'affichage.
 */

/** Longueur affichée par le compteur ; la route refuse au-delà de sa propre limite (400 par défaut). */
export const COACH_INPUT_MAX_CHARS = 400

export const COACH_LEGAL_LINE = 'Coach IA expérimental · Données de l’API PUBG'

/** Contexte provisoire, avant la vérification serveur : étiquette courte et suggestions selon la page. */
export function coachProvisionalContext(path: string | null | undefined): { label: string | null; suggestions: string[] } {
  const parsed = parseCoachContextPath(path)
  switch (parsed.kind) {
    case 'match':
    case 'tournament-match':
      return { label: 'Ce match', suggestions: ['Pourquoi on s’est fait sortir ?', 'Qui a fait les ouvertures ?', 'Quelles armes nous ont fait mal ?'] }
    case 'tournament':
      return { label: 'Ce tournoi', suggestions: ['Qui a gagné le tournoi ?', 'Comment s’est classé notre clan ?', 'Détaille mon résultat dans ce tournoi'] }
    case 'session':
      return { label: `Soirée du ${parsed.date.slice(8, 10)}/${parsed.date.slice(5, 7)}`, suggestions: ['Comment s’est passée cette soirée ?', 'Quelle partie a été la meilleure ?', 'Qui a porté l’escouade ?'] }
    case 'clan':
      if (parsed.page === 'weapons') return { label: 'Armes', suggestions: ['Quelle est ma meilleure arme ?', 'Beryl ou M416 ?', 'Je suis plus précis à quelle distance ?'] }
      if (parsed.page === 'opponents') return { label: 'Adversaires', suggestions: ['Quel clan nous bat le plus ?', 'Qui est notre pire adversaire ?', 'Comment battre ce clan ?'] }
      if (parsed.page === 'drop-zones') return { label: 'Largages', suggestions: ['Où atterrir sur Erangel ?', 'Nos hot drops valent-ils le coup ?', 'Quelle zone nous réussit le mieux ?'] }
      if (parsed.page === 'maps') return { label: 'Cartes', suggestions: ['Quelle est notre pire carte ?', 'Où est-on les plus forts ?', 'Qui porte l’escouade sur Erangel ?'] }
      if (parsed.page === 'playstyle') return { label: 'Style de jeu', suggestions: ['Qui est notre medic ?', 'On joue trop dispersés ?', 'Quels binômes marchent le mieux ?'] }
      if (parsed.page === 'career') return { label: 'Carrière du clan', suggestions: ['Combien de kills le clan a en carrière ?', 'Qui a le plus de victoires ?', 'Je suis où au K/D dans le clan ?'] }
      if (parsed.page === 'zone-closures') return { label: 'Fin de zone', suggestions: ['On gère bien le cercle ?', 'Qui court après la zone ?', 'Je suis souvent dehors à la fermeture ?'] }
      if (parsed.page === 'positions') return { label: 'Positions', suggestions: ['Où le clan se bat le plus ?', 'Dans quelle ville je meurs ?', 'Où je gagne mes duels ?'] }
      break
    case 'member':
      if (parsed.page === 'weapons') return { label: 'Armes', suggestions: ['Quelle est ma meilleure arme ?', 'Beryl ou M416 ?', 'Je suis plus précis à quelle distance ?'] }
      if (parsed.page === 'nemesis') return { label: 'Adversaires', suggestions: ['Quel clan nous bat le plus ?', 'Qui est notre pire adversaire ?', 'Comment battre ce clan ?'] }
      if (parsed.page === 'drop-zones') return { label: 'Largages', suggestions: ['Où je saute le plus ?', 'Mes hot drops valent-ils le coup ?', 'Quel spot me réussit le mieux ?'] }
      if (parsed.page === 'items') return { label: 'Objets', suggestions: ['Je me soigne assez ?', 'Quels boosts je consomme le plus ?', 'Combien de grenades je lance par partie ?'] }
      if (parsed.page === 'heatmap') return { label: 'Activité', suggestions: ['Quand est-ce que je joue le plus ?', 'Mon horaire de jeu en semaine ?', 'Combien de soirées par semaine ?'] }
      if (parsed.page === 'career') return { label: 'Carrière', suggestions: ['Résume ma carrière PUBG', 'Mon K/D est-il bon ?', 'Où en est mon palier Ranked ?'] }
      if (parsed.page === 'playstyle') return { label: 'Style de jeu', suggestions: ['Quel est mon rôle dans le clan ?', 'Avec qui je coopère le plus ?', 'Je gère bien le cercle ?'] }
      break
    case 'players':
      return { label: 'Joueurs', suggestions: ['Où je me situe ?', 'Quel est mon rôle ?', 'Qui est juste devant moi ?'] }
    default:
      break
  }
  return { label: null, suggestions: ['Comment s’est passée notre dernière soirée ?', 'Quelle est ma meilleure arme ?', 'Où atterrir sur Miramar ?'] }
}

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })
const LONG_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'Europe/Paris' })
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Paris' })

/** « 22:14 » pour un instant ISO ; `null` si illisible. */
export function coachClock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : TIME.format(date)
}

/** « 1er novembre » : retour du budget. */
export function coachLongDay(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return LONG_DAY.format(date).replace(/^1 /, '1er ')
}

export type CoachThreadGroup = 'Aujourd’hui' | 'Cette semaine' | 'Plus ancien'

/** Groupe et heure courte d'un fil dans la liste : heure le jour même, jour de la semaine sous 7 jours, date au-delà. */
export function coachThreadWhen(updatedAt: string, now: Date = new Date()): { group: CoachThreadGroup; when: string } {
  const date = new Date(updatedAt)
  if (Number.isNaN(date.getTime())) return { group: 'Plus ancien', when: '' }
  if (DAY_KEY.format(date) === DAY_KEY.format(now)) return { group: 'Aujourd’hui', when: TIME.format(date) }
  if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) return { group: 'Cette semaine', when: WEEKDAY.format(date) }
  return { group: 'Plus ancien', when: DAY_MONTH.format(date) }
}

/** Message d'un refus de quota, pour la zone de saisie. */
export function coachRefusalText(reason: string | null, retryAt: string | null, periodEnd: string | null): string | null {
  switch (reason) {
    case 'coach_paused':
      return 'Le Coach IA est en pause.'
    case 'hourly_limit': {
      const clock = coachClock(retryAt)
      return clock ? `Limite de l’heure atteinte. Prochaine question à ${clock}.` : 'Limite de l’heure atteinte.'
    }
    case 'too_fast': {
      const clock = coachClock(retryAt)
      return clock ? `Doucement : prochaine question à ${clock}.` : 'Doucement : une question toutes les quelques secondes.'
    }
    case 'monthly_budget': {
      const day = coachLongDay(retryAt ?? periodEnd)
      return day ? `Ton budget de questions revient le ${day}.` : 'Ton budget de questions du mois est épuisé.'
    }
    case 'global_budget': {
      const day = coachLongDay(retryAt ?? periodEnd)
      return day ? `Le Coach IA a atteint son plafond du mois ; il revient le ${day}.` : 'Le Coach IA a atteint son plafond du mois.'
    }
    default:
      return null
  }
}
