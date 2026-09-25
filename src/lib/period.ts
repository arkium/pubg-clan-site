/**
 * Période d'analyse des pages joueurs — docs/TODO/sticky.md §4.C.
 *
 * Une seule source pour les valeurs, les libellés et le sens des périodes. Semaine et mois
 * sont **calendaires** : semaine ISO du lundi 00:00 au dimanche 23:59, mois civil — comme
 * les agrégats (classements, awards, comparateur, statistiques de télémétrie, cache des
 * matchs). Heure locale du serveur, comme eux.
 *
 * Module sans dépendance : importable côté client comme côté serveur.
 */

export const PERIODS = ['week', 'month', 'all', 'month-1', 'month-2'] as const
export type Period = (typeof PERIODS)[number]

/** Semaine, mois, tout l'historique : l'ensemble proposé par la plupart des pages. */
export const STANDARD_PERIODS = ['week', 'month', 'all'] as const
export type StandardPeriod = (typeof STANDARD_PERIODS)[number]

/** Pages de matchs : semaine, mois et les deux mois civils précédents. */
export const MATCH_PERIODS = ['week', 'month', 'month-1', 'month-2'] as const
export type MatchPeriod = (typeof MATCH_PERIODS)[number]

export const PERIOD_LABELS: Record<Period, string> = {
  week: 'Semaine',
  month: 'Mois',
  all: 'Tous',
  'month-1': 'Mois dernier',
  'month-2': 'Il y a 2 mois',
}

/** Paramètre d'URL qui porte la période d'une page (§4.E). */
export const PERIOD_QUERY_PARAM = 'period'
/** Mémoire de la visite (`sessionStorage`) : dernière période choisie explicitement. */
export const PERIOD_STORAGE_KEY = 'pubg-clan-site:period'

export function isPeriod(value: unknown): value is Period {
  return typeof value === 'string' && (PERIODS as readonly string[]).includes(value)
}

export function periodOptions<P extends Period>(periods: readonly P[]): Array<{ value: P; label: string }> {
  return periods.map((value) => ({ value, label: PERIOD_LABELS[value] }))
}

/** Une valeur absente, inconnue ou non proposée par la page retombe sur `fallback`. */
export function parsePeriod<P extends Period>(value: string | null | undefined, allowed: readonly P[], fallback: P): P {
  return value !== null && value !== undefined && (allowed as readonly string[]).includes(value) ? (value as P) : fallback
}

export type PeriodRange = { start: Date; end: Date }

function startOfDay(year: number, month: number, day: number) {
  return new Date(year, month, day, 0, 0, 0, 0)
}

/**
 * Bornes calendaires `[start, end)` d'une période ; `null` pour « Tous ».
 * La semaine commence le lundi (ISO) ; `end` est le début de la période suivante.
 */
export function getPeriodRange(period: Period, reference: Date = new Date()): PeriodRange | null {
  const year = reference.getFullYear()
  const month = reference.getMonth()

  switch (period) {
    case 'week': {
      const mondayOffset = (reference.getDay() + 6) % 7
      const start = startOfDay(year, month, reference.getDate() - mondayOffset)
      return { start, end: startOfDay(start.getFullYear(), start.getMonth(), start.getDate() + 7) }
    }
    case 'month':
      return { start: startOfDay(year, month, 1), end: startOfDay(year, month + 1, 1) }
    case 'month-1':
      return { start: startOfDay(year, month - 1, 1), end: startOfDay(year, month, 1) }
    case 'month-2':
      return { start: startOfDay(year, month - 2, 1), end: startOfDay(year, month - 1, 1) }
    case 'all':
      return null
  }
}

/** Début de la période ; `null` pour « Tous ». Suffit pour la période en cours, qui n'a pas de futur. */
export function getPeriodStart(period: Period, reference: Date = new Date()): Date | null {
  return getPeriodRange(period, reference)?.start ?? null
}

export type ResolvedPagePeriod<P extends Period> = { period: P; source: 'url' | 'memory' | 'default' }

/**
 * Période affichée par une page (§4.E) : l'URL fait foi, puis la mémoire de la visite, puis le
 * défaut de la page. Une valeur que la page ne propose pas est ignorée.
 */
export function resolvePagePeriod<P extends Period>(input: {
  urlValue: string | null
  rememberedValue: string | null
  allowed: readonly P[]
  fallback: P
}): ResolvedPagePeriod<P> {
  const { urlValue, rememberedValue, allowed, fallback } = input
  const isAllowed = (value: string | null): value is P =>
    value !== null && (allowed as readonly string[]).includes(value)

  if (isAllowed(urlValue)) return { period: urlValue, source: 'url' }
  if (isAllowed(rememberedValue)) return { period: rememberedValue, source: 'memory' }
  return { period: fallback, source: 'default' }
}
