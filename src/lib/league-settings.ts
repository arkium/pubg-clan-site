import {
  DEFAULT_LEAGUE_SETTINGS,
  LEAGUE_MATCH_TYPE_OPTIONS,
  leagueTableBetween,
  scoreShares,
  type LeagueAverage,
  type LeagueClan,
  type LeagueMatchRow,
  type LeagueMatchType,
  type LeagueSettings,
  type LeagueTable,
} from '@/lib/clan-league'
import { STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'

/**
 * Réglages de la Ligue Inter-Clans (page SuperUser /settings/league, docs/features/ligue-clans.md §5) : bornes,
 * validation stricte d'un envoi, lecture tolérante d'une valeur enregistrée, liste lisible des changements. Module pur,
 * testé par `league-settings.test.ts`.
 */

type Bound = { min: number; max: number; integer: boolean }

export const LEAGUE_SETTINGS_BOUNDS = {
  /** Nombre de places au barème (au-delà, 0 point). */
  places: { min: 1, max: 16, integer: true },
  placementPoint: { min: 0, max: 100, integer: true },
  placementWeight: { min: 0, max: 2000, integer: false },
  damageWeight: { min: 0, max: 10, integer: false },
  killWeight: { min: 0, max: 500, integer: false },
  knockWeight: { min: 0, max: 500, integer: false },
  priorMatches: { min: 0, max: 200, integer: true },
  minMatches: { min: 1, max: 500, integer: true },
  titleMinMatches: { min: 1, max: 100, integer: true },
  zoneEnd: { min: 4, max: 30, integer: true },
} satisfies Record<string, Bound>

export type LeagueSettingsError = { field: string; message: string }

const PERIOD_LABELS: Record<StandardPeriod, string> = { week: 'semaine', month: 'mois', all: 'tous' }

function inBounds(value: unknown, bound: Bound): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= bound.min && value <= bound.max && (!bound.integer || Number.isInteger(value))
}

function boundMessage(bound: Bound) {
  return `${bound.integer ? 'entier' : 'nombre'} entre ${bound.min} et ${bound.max}`
}

type ScalarField = 'placementWeight' | 'damageWeight' | 'killWeight' | 'knockWeight' | 'priorMatches' | 'titleMinMatches' | 'zoneEnd'
const SCALAR_FIELDS: ScalarField[] = ['placementWeight', 'damageWeight', 'killWeight', 'knockWeight', 'priorMatches', 'titleMinMatches', 'zoneEnd']

function placementPointsErrors(value: unknown): LeagueSettingsError[] {
  const { places, placementPoint } = LEAGUE_SETTINGS_BOUNDS
  if (!Array.isArray(value) || value.length < places.min || value.length > places.max) {
    return [{ field: 'placementPoints', message: `de ${places.min} à ${places.max} places au barème` }]
  }
  const errors: LeagueSettingsError[] = []
  value.forEach((points, index) => {
    if (!inBounds(points, placementPoint)) {
      errors.push({ field: `placementPoints.${index}`, message: `${index + 1}${index === 0 ? 're' : 'e'} place : ${boundMessage(placementPoint)}` })
    } else if (index > 0 && typeof value[index - 1] === 'number' && points > value[index - 1]) {
      errors.push({ field: `placementPoints.${index}`, message: `${index + 1}e place : pas plus de points que la place précédente` })
    }
  })
  if (errors.length === 0 && value[0] === 0) errors.push({ field: 'placementPoints.0', message: 'la 1re place doit rapporter des points' })
  return errors
}

function minMatchesErrors(value: unknown): LeagueSettingsError[] {
  const errors: LeagueSettingsError[] = []
  const table = (value ?? {}) as Record<string, Record<string, unknown> | undefined>
  for (const option of LEAGUE_MATCH_TYPE_OPTIONS) {
    for (const period of STANDARD_PERIODS) {
      if (!inBounds(table[option.value]?.[period], LEAGUE_SETTINGS_BOUNDS.minMatches)) {
        errors.push({
          field: `minMatches.${option.value}.${period}`,
          message: `seuil ${option.label} / ${PERIOD_LABELS[period]} : ${boundMessage(LEAGUE_SETTINGS_BOUNDS.minMatches)}`,
        })
      }
    }
  }
  return errors
}

const SCALAR_LABELS: Record<ScalarField, string> = {
  placementWeight: 'coefficient du placement',
  damageWeight: 'coefficient des dégâts',
  killWeight: 'coefficient des kills',
  knockWeight: 'coefficient des knocks',
  priorMatches: 'parties fictives (M)',
  titleMinMatches: 'minimum de parties pour un titre',
  zoneEnd: 'dernier rang « Dans la zone »',
}

function copyMinMatches(table: LeagueSettings['minMatches']): LeagueSettings['minMatches'] {
  return Object.fromEntries(LEAGUE_MATCH_TYPE_OPTIONS.map((option) => [option.value, { ...table[option.value] }])) as LeagueSettings['minMatches']
}

/** Validation stricte d'un envoi (route PUT et aperçu) : toutes les erreurs, champ par champ. */
export function validateLeagueSettings(input: unknown): { ok: true; settings: LeagueSettings } | { ok: false; errors: LeagueSettingsError[] } {
  if (!input || typeof input !== 'object') return { ok: false, errors: [{ field: 'settings', message: 'réglages manquants' }] }
  const candidate = input as Record<string, unknown>
  const errors: LeagueSettingsError[] = [...placementPointsErrors(candidate.placementPoints), ...minMatchesErrors(candidate.minMatches)]
  for (const field of SCALAR_FIELDS) {
    if (!inBounds(candidate[field], LEAGUE_SETTINGS_BOUNDS[field])) {
      errors.push({ field, message: `${SCALAR_LABELS[field]} : ${boundMessage(LEAGUE_SETTINGS_BOUNDS[field])}` })
    }
  }
  if (errors.length === 0 && [candidate.placementWeight, candidate.damageWeight, candidate.killWeight, candidate.knockWeight].every((weight) => weight === 0)) {
    errors.push({ field: 'placementWeight', message: 'au moins un coefficient du score brut doit être positif' })
  }
  if (errors.length > 0) return { ok: false, errors }
  const minMatches = candidate.minMatches as LeagueSettings['minMatches']
  return {
    ok: true,
    settings: {
      placementPoints: [...(candidate.placementPoints as number[])],
      placementWeight: candidate.placementWeight as number,
      damageWeight: candidate.damageWeight as number,
      killWeight: candidate.killWeight as number,
      knockWeight: candidate.knockWeight as number,
      priorMatches: candidate.priorMatches as number,
      minMatches: copyMinMatches(minMatches),
      titleMinMatches: candidate.titleMinMatches as number,
      zoneEnd: candidate.zoneEnd as number,
    },
  }
}

/**
 * Lecture tolérante d'une valeur enregistrée (`AppConfig`) : chaque champ invalide ou absent reprend sa valeur par
 * défaut — un réglage abîmé ne casse jamais la ligue publique.
 */
export function mergeStoredLeagueSettings(stored: unknown): LeagueSettings {
  const candidate = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  const defaults = DEFAULT_LEAGUE_SETTINGS
  const scalar = <F extends ScalarField>(field: F): number => (inBounds(candidate[field], LEAGUE_SETTINGS_BOUNDS[field]) ? (candidate[field] as number) : defaults[field])
  const table = (candidate.minMatches ?? {}) as Record<string, Record<string, unknown> | undefined>
  const minMatches = Object.fromEntries(
    LEAGUE_MATCH_TYPE_OPTIONS.map((option) => [
      option.value,
      Object.fromEntries(
        STANDARD_PERIODS.map((period) => {
          const value = table[option.value]?.[period]
          return [period, inBounds(value, LEAGUE_SETTINGS_BOUNDS.minMatches) ? value : defaults.minMatches[option.value][period]]
        })
      ),
    ])
  ) as LeagueSettings['minMatches']
  const merged: LeagueSettings = {
    placementPoints: placementPointsErrors(candidate.placementPoints).length === 0 ? [...(candidate.placementPoints as number[])] : [...defaults.placementPoints],
    placementWeight: scalar('placementWeight'),
    damageWeight: scalar('damageWeight'),
    killWeight: scalar('killWeight'),
    knockWeight: scalar('knockWeight'),
    priorMatches: scalar('priorMatches'),
    minMatches,
    titleMinMatches: scalar('titleMinMatches'),
    zoneEnd: scalar('zoneEnd'),
  }
  return validateLeagueSettings(merged).ok ? merged : { ...defaults, placementPoints: [...defaults.placementPoints], minMatches: copyMinMatches(defaults.minMatches) }
}

export const sameLeagueSettings = (left: LeagueSettings, right: LeagueSettings) => JSON.stringify(left) === JSON.stringify(right)

const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const scaleText = (scale: readonly number[]) => scale.join(' · ')

/** Changements lisibles entre deux réglages (« coefficient du placement : 250 → 170 »), pour confirmer l'enregistrement. */
export function leagueSettingsChanges(before: LeagueSettings, after: LeagueSettings): string[] {
  const changes: string[] = []
  if (scaleText(before.placementPoints) !== scaleText(after.placementPoints)) {
    changes.push(`barème de placement : ${scaleText(before.placementPoints)} → ${scaleText(after.placementPoints)}`)
  }
  for (const field of SCALAR_FIELDS) {
    if (before[field] !== after[field]) changes.push(`${SCALAR_LABELS[field]} : ${number.format(before[field])} → ${number.format(after[field])}`)
  }
  for (const option of LEAGUE_MATCH_TYPE_OPTIONS) {
    for (const period of STANDARD_PERIODS) {
      const from = before.minMatches[option.value][period]
      const to = after.minMatches[option.value][period]
      if (from !== to) changes.push(`seuil ${option.label} / ${PERIOD_LABELS[period]} : ${from} → ${to} parties`)
    }
  }
  return changes
}

/** Seuil de qualification d'une période et d'un type. */
export const leagueMinMatches = (settings: LeagueSettings, matchType: LeagueMatchType, period: StandardPeriod) => settings.minMatches[matchType][period]

// ── Aperçu ────────────────────────────────────────────────────────────────────────────────────────

type PreviewSide = { rank: number | null; powerScore: number | null; qualifying: boolean }

export type LeaguePreviewRow = LeagueClan & { matches: number; current: PreviewSide; draft: PreviewSide }

export type LeaguePreview = {
  rows: LeaguePreviewRow[]
  current: { minMatches: number; ranked: number; qualifying: number; league: LeagueAverage; shares: ReturnType<typeof scoreShares> }
  draft: { minMatches: number; ranked: number; qualifying: number; league: LeagueAverage; shares: ReturnType<typeof scoreShares> }
}

/**
 * Le même classement avec les réglages en vigueur et avec le brouillon, côte à côte : rang, Power score, qualification
 * et part de chaque terme dans le score moyen. Trié par le brouillon (classés, puis en qualification).
 */
export function leaguePreview(
  rows: readonly LeagueMatchRow[],
  clans: readonly LeagueClan[],
  from: Date | null,
  matchType: LeagueMatchType,
  period: StandardPeriod,
  current: LeagueSettings,
  draft: LeagueSettings
): LeaguePreview {
  const side = (settings: LeagueSettings) => {
    const minMatches = leagueMinMatches(settings, matchType, period)
    const table = leagueTableBetween(rows, clans, from, null, minMatches, settings)
    return { minMatches, table, shares: scoreShares(table.league, settings) }
  }
  const before = side(current)
  const after = side(draft)
  const sideOf = (table: LeagueTable, clanId: number): PreviewSide => {
    const standing = table.standings.find((entry) => entry.clanId === clanId)
    if (standing) return { rank: standing.rank, powerScore: standing.powerScore, qualifying: false }
    return { rank: null, powerScore: null, qualifying: table.qualifying.some((entry) => entry.clanId === clanId) }
  }
  const played = new Map<number, number>()
  for (const entry of [...after.table.standings, ...after.table.qualifying]) played.set(entry.clanId, entry.matches)
  const previewRows = clans
    .filter((clan) => played.has(clan.clanId))
    .map((clan) => ({ ...clan, matches: played.get(clan.clanId) ?? 0, current: sideOf(before.table, clan.clanId), draft: sideOf(after.table, clan.clanId) }))
    .sort((a, b) => (a.draft.rank ?? Number.MAX_SAFE_INTEGER) - (b.draft.rank ?? Number.MAX_SAFE_INTEGER) || b.matches - a.matches || a.name.localeCompare(b.name, 'fr'))
  const summary = (entry: typeof before) => ({
    minMatches: entry.minMatches,
    ranked: entry.table.standings.length,
    qualifying: entry.table.qualifying.length,
    league: entry.table.league,
    shares: entry.shares,
  })
  return { rows: previewRows, current: summary(before), draft: summary(after) }
}
