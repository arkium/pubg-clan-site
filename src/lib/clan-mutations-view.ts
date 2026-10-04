/**
 * Mouvements de clan (`/clans/mutations`, docs/features/cycle-de-vie-clan.md) : nature d'un mouvement et regroupement
 * par jour, pour la page publique (membres connectés) qui rend visible chaque changement d'appartenance.
 */

export type MutationClanRef = { id: number; tag: string | null; name: string | null; isSystem: boolean } | null

export type ClanMutation = {
  id: string
  source: string
  status: string
  at: string
  member: { id: number; name: string } | null
  from: MutationClanRef
  to: MutationClanRef
}

/** Arrivée dans un clan, départ vers « sans clan », passage d'un clan à un autre, ou mouvement annulé depuis. */
export type MutationKind = 'arrival' | 'departure' | 'transfer' | 'reverted'

export const MUTATION_KIND_LABELS: Record<MutationKind, string> = {
  arrival: 'Arrivée',
  departure: 'Départ',
  transfer: 'Transfert',
  reverted: 'Annulé',
}

export const MUTATION_SOURCE_LABELS: Record<string, string> = {
  auto_demotion: 'Détecté — sorti de son clan',
  auto_transfer: 'Détecté — a changé de clan',
  ungrouped_promotion: 'Détecté — a rejoint un clan',
  manual_demotion: 'Sorti du clan par un responsable',
  manual_transfer: 'Transféré par un SuperUser',
  manual_revert: 'Mouvement annulé',
  player_sync: 'Écart constaté',
  player_refresh: 'Rafraîchissement',
}

/** Sources appliquées par la synchronisation quotidienne, sans validation humaine. */
const AUTOMATIC_SOURCES = new Set(['auto_demotion', 'auto_transfer', 'ungrouped_promotion'])

export function isAutomaticMutation(mutation: Pick<ClanMutation, 'source'>) {
  return AUTOMATIC_SOURCES.has(mutation.source)
}

export function mutationSourceLabel(source: string) {
  return MUTATION_SOURCE_LABELS[source] ?? source
}

/** Un côté du mouvement, tel que le livrent la route publique et le journal SuperUser. */
type MutationSide = { isSystem?: boolean } | null

/** Le clan technique (joueurs sans clan) compte comme « aucun clan ». */
const isClan = (clan: MutationSide) => Boolean(clan && !clan.isSystem)

export function mutationKind(mutation: { status: string; from: MutationSide; to: MutationSide }): MutationKind {
  if (mutation.status === 'reverted') return 'reverted'
  if (!isClan(mutation.to)) return 'departure'
  if (!isClan(mutation.from)) return 'arrival'
  return 'transfer'
}

const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const TIME_LABEL = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })

/** Heure de Paris d'un mouvement (« 01:45 »). */
export function mutationTime(iso: string) {
  return TIME_LABEL.format(new Date(iso))
}

export type MutationDay = { day: string; label: string; mutations: ClanMutation[] }

/**
 * Regroupe une page de mouvements (déjà triée du plus récent au plus ancien) par jour calendaire de Paris — la date
 * d'un mouvement, pas une soirée de jeu : la synchronisation tourne à 01:45 et doit tomber sur son propre jour.
 */
export function groupMutationsByDay(mutations: ClanMutation[]): MutationDay[] {
  const days: MutationDay[] = []
  for (const mutation of mutations) {
    const date = new Date(mutation.at)
    const day = DAY_KEY.format(date)
    const last = days.at(-1)
    if (last?.day === day) {
      last.mutations.push(mutation)
    } else {
      days.push({ day, label: DAY_LABEL.format(date), mutations: [mutation] })
    }
  }
  return days
}
