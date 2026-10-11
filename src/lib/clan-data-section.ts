import { sessionDateOf } from '@/lib/match-sessions'
import { getPeriodRange, MATCH_PERIODS } from '@/lib/period'

/**
 * « Données » d'un clan (docs/TODO/administration.md §8) : onglets et liens internes de la section, réservée au
 * SuperUser. Module sans dépendance serveur : lu par les pages client et par les tests.
 */

export type DataSectionTab = { href: string; label: string }

/** Ancres des blocs de « Récupérations » visées par les liens et par les redirections de next.config.ts. */
export const DATA_ANCHORS = { coverage: 'couverture', failures: 'echecs' } as const

export function clanDataBase(clanId: string | number) {
  return `/clans/${clanId}/settings/data`
}

/** Trois onglets : la santé (diagnostic et files), les soirées (actions partie par partie), les récupérations. */
export function dataSectionTabs(clanId: string | number): DataSectionTab[] {
  const base = clanDataBase(clanId)
  return [
    { href: base, label: 'Santé des données' },
    { href: `${base}/sessions`, label: 'Soirées' },
    { href: `${base}/recoveries`, label: 'Récupérations' },
  ]
}

export function dataFailuresHref(clanId: string | number) {
  return `${clanDataBase(clanId)}/recoveries#${DATA_ANCHORS.failures}`
}

export function dataCoverageHref(clanId: string | number) {
  return `${clanDataBase(clanId)}/recoveries#${DATA_ANCHORS.coverage}`
}

/**
 * Soirée des Données qui contient une partie, là où l'on agit sur elle (mise en file, retraitement, effacement). La
 * page de la soirée charge les parties d'une période calendaire : on prend la première de `MATCH_PERIODS` qui contient
 * la partie. `null` au-delà du mois d'avant-dernier, que la page ne propose pas.
 */
export function dataSessionHref(clanId: string | number, matchCreatedAt: string, now: Date, squadMatchId?: string) {
  const createdAt = new Date(matchCreatedAt)
  if (Number.isNaN(createdAt.getTime())) return null
  const period = MATCH_PERIODS.find((candidate) => {
    const range = getPeriodRange(candidate, now)
    return range !== null && createdAt >= range.start && createdAt < range.end
  })
  if (!period) return null
  const anchor = squadMatchId ? `#match-${squadMatchId}` : ''
  return `${clanDataBase(clanId)}/sessions/${sessionDateOf(createdAt)}?period=${period}${anchor}`
}
