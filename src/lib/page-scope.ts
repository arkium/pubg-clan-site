import { LEAGUE_MATCH_TYPE_OPTIONS } from '@/lib/clan-league'
import type { ClanDataCoverage, CoverageSpan, MemberDataCoverage } from '@/lib/data-coverage-service'
import { GEO_PROTECTED_RETENTION_DAYS, GEO_RETENTION_DAYS } from '@/lib/geo-retention'
import { METHODOLOGY_PATH } from '@/lib/legal/legal-info'
import { SESSION_DAY_START_HOUR } from '@/lib/match-sessions'
import { getPeriodRange, PERIOD_LABELS, type Period } from '@/lib/period'
import { PAGE_SCOPE_ENTRIES } from '@/lib/page-scope-entries'
import type { ClanMatchTypeFilter } from '@/types/squad-matches'

/**
 * « D'où viennent ces chiffres ? » (docs/TODO/aide-des-pages.md) : ce que compte chaque page d'un joueur et d'un clan.
 * Une seule source, lue par la barre en bas des pages (`PageScopeNote`) **et** par la Méthodologie (section « Pages
 * d'un joueur, pages d'un clan ») : la page, sa barre et la Méthodologie ne peuvent pas diverger. Les entrées
 * (`page-scope-entries.ts`) citent chacune la route ou le service qui porte leur règle : à relire quand il change.
 * `page-scope.test.ts` échoue sur une page sans entrée, une entrée sans page ou une page sans sa barre.
 *
 * Module pur, importable côté client : les dates viennent de `GET /api/{members,clans}/…/data-coverage`
 * (src/lib/data-coverage-service.ts), jamais écrites ici ; tant qu'elles manquent, « — » (jamais de faux zéro).
 */

export type PageScopeArea = 'member' | 'clan'

/** Lignes « Depuis quand » : chaque famille de données a commencé à sa propre date. */
export type CoverageFamily =
  | 'onSite'
  | 'clanMatches'
  | 'pubgMatches'
  | 'telemetry'
  | 'drops'
  | 'kills'
  | 'positions'
  | 'closures'
  | 'items'
  | 'career'
  | 'geoRetention'
  | 'lastMatch'

/**
 * Parties comptées : `official` = normales seulement (règle fixe de la page) ; `all` = tous les types, chacun
 * étiqueté ; `filter` = le filtre « Type de partie » de la page ; `career` = carrière du compte PUBG, hors du site ;
 * `match` = une partie ; `none` = la page ne compte pas de parties ; `mixed` = la règle change d'une carte à l'autre,
 * `matchTypesNote` dit laquelle (tableau de bord, style de jeu : agrégats sans type de partie).
 */
export type MatchTypeRule = 'official' | 'all' | 'filter' | 'career' | 'match' | 'none' | 'mixed'

/** Période : `filter` = filtre de période de la page ; `session` = une soirée ; `match` = une partie ; `none` = aucune. */
export type PeriodRule = 'filter' | 'session' | 'match' | 'none'

export type PageScopeEntry = {
  area: PageScopeArea
  /** Chemin sous `/members/[id]/` ou `/clans/[clanId]/`, comme le dossier de la page (`stats/maps`). */
  slug: string
  /** Nom de la page dans le menu. */
  title: string
  /** D'où vient la donnée, en une phrase. */
  source: string
  /** Page tirée du déroulé des parties (télémétrie) : la barre donne la part de parties analysées. */
  telemetry: boolean
  matchTypes: MatchTypeRule
  /** Filtre « Type de partie » de la page : ses choix, celui par défaut, et ses libellés s'ils diffèrent de la Ligue. */
  matchTypeFilter?: { options: readonly ClanMatchTypeFilter[]; default: ClanMatchTypeFilter; labels?: Partial<Record<ClanMatchTypeFilter, string>> }
  matchTypesNote?: string
  period: PeriodRule
  /** Périodes proposées par le filtre, défaut en premier si `defaultPeriod` manque. */
  periods?: readonly Period[]
  defaultPeriod?: Period
  periodNote?: string
  since: readonly CoverageFamily[]
  /** Précisions propres à la page (seuils, membres comptés, biais). */
  notes?: readonly string[]
  /** Routes et services qui portent la règle : les relire avant de changer l'entrée. */
  code: readonly string[]
  /** Fichier qui pose la barre, quand ce n'est pas le `page.tsx` de la page (contrôlé par `page-scope.test.ts`). */
  view?: string
}

export type PageScopeKey = `${PageScopeArea}:${string}`

export const PAGE_SCOPES: Readonly<Record<PageScopeKey, PageScopeEntry>> = Object.fromEntries(
  PAGE_SCOPE_ENTRIES.map((entry) => [pageScopeKey(entry), entry])
)

export function pageScopeKey(entry: Pick<PageScopeEntry, 'area' | 'slug'>): PageScopeKey {
  return `${entry.area}:${entry.slug}`
}

/** PUBG efface la liste des parties d'un joueur au bout d'environ 14 jours (Méthodologie, « Données »). */
export const PUBG_HISTORY_DAYS = 14

export const PAGE_SCOPE_TITLE = 'D’où viennent ces chiffres ?'

/** Ancre de la page dans la section de la Méthodologie : `page-joueur-dashboard`, `page-clan-stats-maps`. */
export function pageScopeAnchor(entry: Pick<PageScopeEntry, 'area' | 'slug'>) {
  const slug = entry.slug.replace(/\[|\]/g, '').replace(/\//g, '-')
  return `page-${entry.area === 'member' ? 'joueur' : 'clan'}-${slug}`
}

export const PAGE_SCOPE_SECTION_ID = 'pages-joueur-clan'

export function pageScopeMethodologyHref(entry: Pick<PageScopeEntry, 'area' | 'slug'>) {
  return `${METHODOLOGY_PATH}#${pageScopeAnchor(entry)}`
}

// ── Textes ──────────────────────────────────────────────────────────────────────────────────────

// Dates de soirée (`AAAA-MM-JJ`, lues à midi UTC) : en UTC, jamais décalées d'un jour.
const SESSION_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const SESSION_WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
// Instants (dernière partie, carrière relue) : heure de Paris, comme le reste du site.
const PARIS_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
const PARIS_CLOCK = new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Paris' })
// Bornes d'une période : en heure locale, comme `getPeriodRange` qui les calcule (src/lib/period.ts).
const LOCAL_DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })
const LOCAL_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
const integer = new Intl.NumberFormat('fr-FR')

/** « 1er novembre », jamais « 1 novembre ». */
const firstOfMonth = (text: string) => text.replace(/^1 /, '1er ').replace(/ 1 /, ' 1er ')

/** Date de soirée `AAAA-MM-JJ` → « 12 mai 2026 ». */
export function formatSessionDate(date: string | null | undefined) {
  return date ? firstOfMonth(SESSION_DAY.format(new Date(`${date}T12:00:00Z`))) : '—'
}

function formatInstant(iso: string | null | undefined) {
  if (!iso) return '—'
  const at = new Date(iso)
  return `${firstOfMonth(PARIS_DAY.format(at))} à ${PARIS_CLOCK.format(at).replace(':', ' h ')}`
}

/** « d’octobre », « de septembre ». */
const ofMonth = (month: string) => (/^[aeiouy]/i.test(month) ? `d’${month}` : `de ${month}`)

/**
 * Période du filtre, en clair. Mêmes bornes que les routes (`getPeriodRange`, heure locale) et mêmes mots que la
 * Méthodologie (« du lundi 0 h au dimanche 23 h 59 », « le mois civil »).
 */
export function periodText(period: Period, now: Date = new Date()): string {
  const range = getPeriodRange(period, now)
  if (!range) return 'Tout l’historique suivi par le site (voir « Depuis quand »).'
  // Le dernier jour : `end` est le début de la période suivante.
  const last = new Date(range.end.getFullYear(), range.end.getMonth(), range.end.getDate() - 1, 12)
  switch (period) {
    case 'week':
      return `Semaine du ${firstOfMonth(LOCAL_DAY_MONTH.format(range.start))} au ${firstOfMonth(LOCAL_DAY_MONTH.format(last))} : du lundi 0 h au dimanche 23 h 59.`
    case 'month':
    case 'month-1':
    case 'month-2':
      return `Mois ${ofMonth(LOCAL_MONTH_YEAR.format(range.start))} : le mois civil, du 1er au ${last.getDate()}.`
    case 'days-30':
    case 'days-90':
      return `${period === 'days-30' ? '30' : '90'} derniers jours : du ${firstOfMonth(LOCAL_DAY_MONTH.format(range.start))} au ${firstOfMonth(LOCAL_DAY_MONTH.format(last))}, aujourd’hui compris.`
    default:
      return PERIOD_LABELS[period]
  }
}

const periodChoices = (entry: PageScopeEntry) => (entry.periods ?? []).map((period) => `« ${PERIOD_LABELS[period]} »`).join(', ')

function periodRow(entry: PageScopeEntry, context: PageScopeContext | null): string {
  const note = entry.periodNote ? ` ${entry.periodNote}` : ''
  switch (entry.period) {
    case 'filter': {
      if (!context) {
        const fallback = entry.defaultPeriod ?? entry.periods?.[0]
        return `Filtre de la page : ${periodChoices(entry)}${fallback ? ` (« ${PERIOD_LABELS[fallback]} » par défaut)` : ''} ; semaine du lundi 0 h au dimanche 23 h 59, mois civil.${note}`
      }
      return `${context.period ? periodText(context.period, context.now) : '—'}${note}`
    }
    case 'session':
      return `${context?.sessionDate ? `Soirée du ${SESSION_WEEKDAY.format(new Date(`${context.sessionDate}T12:00:00Z`))}` : 'Une soirée'} : de ${SESSION_DAY_START_HOUR} h à ${SESSION_DAY_START_HOUR} h le lendemain, heure de Paris (une partie de 1 h 30 compte dans la soirée de la veille).${note}`
    case 'match':
      return `Une seule partie : celle de la page.${note}`
    case 'none':
      return `Aucune période.${note}`
  }
}

const TYPES_EXCLUDED = 'Ranked, Casual, parties perso et tournois ne comptent pas'

/** Libellé d'un type comme le filtre de la page l'écrit : celui de la Ligue, sauf libellé propre à la page. */
export function matchTypeLabel(type: ClanMatchTypeFilter, labels?: Partial<Record<ClanMatchTypeFilter, string>>) {
  return labels?.[type] ?? (type === 'all' ? 'Tous' : (LEAGUE_MATCH_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type))
}

function matchTypesRow(entry: PageScopeEntry, context: PageScopeContext | null): string {
  const note = entry.matchTypesNote ? ` ${entry.matchTypesNote}` : ''
  switch (entry.matchTypes) {
    case 'official':
      return `Parties normales seulement (matchmaking normal) : ${TYPES_EXCLUDED}.${note}`
    case 'all':
      return `Tous les types de partie : normales, Ranked, Casual, parties perso et tournois.${note}`
    case 'mixed':
      return entry.matchTypesNote ?? ''
    case 'filter': {
      const filter = entry.matchTypeFilter ?? { options: LEAGUE_MATCH_TYPE_OPTIONS.map((option) => option.value), default: 'official' as const }
      const label = (type: ClanMatchTypeFilter) => matchTypeLabel(type, filter.labels)
      if (!context) {
        return `Filtre « Type de partie » : ${filter.options.map((type) => `« ${label(type)} »`).join(', ')} (« ${label(filter.default)} » par défaut).${note}`
      }
      const type = context.matchType ?? filter.default
      if (type === 'all') return `Tous les types de partie (filtre « ${label('all')} ») : normales, Ranked, Casual, parties perso et tournois.${note}`
      const option = LEAGUE_MATCH_TYPE_OPTIONS.find((candidate) => candidate.value === type) ?? LEAGUE_MATCH_TYPE_OPTIONS[0]
      return `Type « ${label(type)} » : ${option.hint} ; les autres types se choisissent dans le filtre de la page.${note}`
    }
    case 'career':
      return `La carrière du compte PUBG (parties de matchmaking ; les parties perso n’y sont pas), y compris hors du site et avant l’arrivée de son clan.${note}`
    case 'match':
      return `Cette partie seulement.${note}`
    case 'none':
      return `Aucune partie comptée.${note}`
  }
}

type Coverage = MemberDataCoverage | ClanDataCoverage

export type PageScopeData = { coverage: Coverage; pendingAnalyses: number } | null

export type PageScopeContext = {
  period?: Period | null
  matchType?: ClanMatchTypeFilter | null
  /** Page d'une soirée : sa date `AAAA-MM-JJ`. */
  sessionDate?: string | null
  now?: Date
}

const plural = (count: number, word: string) => `${integer.format(count)} ${word}${count > 1 ? 's' : ''}`

function sourceRow(entry: PageScopeEntry, data: PageScopeData | undefined): string {
  if (!entry.telemetry || data === undefined) return entry.source
  const telemetry = data?.coverage.telemetry
  const analyzed = telemetry ? `${integer.format(telemetry.analyzed)} sur ${integer.format(telemetry.of)} (${telemetry.percent} %)` : '—'
  const pending = data && data.pendingAnalyses > 0 ? ` ${plural(data.pendingAnalyses, 'analyse')} en attente.` : ''
  return `${entry.source} Parties analysées : ${analyzed}.${pending}`
}

/** PUBG n'ayant que ses ~14 derniers jours, l'historique commence au plus tôt ~14 jours avant l'arrivée sur le site. */
const PUBG_HISTORY = `PUBG ne garde les parties qu’environ ${PUBG_HISTORY_DAYS} jours : l’historique commence au plus tôt ${PUBG_HISTORY_DAYS} jours avant l’arrivée sur le site`

const STATIC_SINCE: Record<CoverageFamily, string> = {
  onSite: `Depuis l’arrivée du joueur sur le site ; ${PUBG_HISTORY}.`,
  clanMatches: `Depuis la première partie enregistrée ; ${PUBG_HISTORY}.`,
  pubgMatches: 'Depuis sa première partie PUBG suivie par le site, avec ou sans le clan.',
  telemetry: 'Depuis la première partie analysée (déroulé lu dans la télémétrie).',
  drops: 'Largages : depuis le premier enregistré.',
  kills: 'Kill feed : depuis le premier kill ou la première mort enregistrés.',
  positions: 'Positions et villes : depuis les premières enregistrées.',
  closures: 'Fins de zone : suivies depuis septembre 2026.',
  items: 'Objets consommés : détail par objet suivi depuis septembre 2026.',
  career: 'Carrière PUBG : depuis la création du compte, relue chaque nuit.',
  geoRetention: `Positions détaillées (replay 2D, tracés) : ${GEO_RETENTION_DAYS} jours, ${GEO_PROTECTED_RETENTION_DAYS} pour un Top 1 ou une partie custom, puis effacées ; les agrégats restent.`,
  lastMatch: 'Dernière partie enregistrée : les parties arrivent chaque nuit, et à la demande quand un clan arrive.',
}

const FAMILY_LABELS: Partial<Record<CoverageFamily, string>> = {
  drops: 'Largages',
  kills: 'Kill feed',
  positions: 'Positions et villes',
  closures: 'Fins de zone',
  items: 'Objets consommés',
}

function spanLine(label: string, span: CoverageSpan | undefined) {
  if (!span) return `${label} depuis le —`
  return span.since ? `${label} depuis le ${formatSessionDate(span.since)}` : `${label} : aucune donnée pour l’instant`
}

function sinceLine(family: CoverageFamily, entry: PageScopeEntry, data: PageScopeData | undefined): string {
  if (data === undefined || family === 'geoRetention') return STATIC_SINCE[family]
  const coverage = data?.coverage
  const member = coverage?.scope === 'member' ? coverage : null
  switch (family) {
    case 'onSite':
      return `Sur le site depuis le ${formatSessionDate(member?.onSiteSince)} ; ${PUBG_HISTORY}.`
    case 'clanMatches': {
      if (!coverage) return 'Parties enregistrées depuis le —.'
      if (coverage.clanMatches.count === 0) return 'Aucune partie enregistrée pour l’instant.'
      const who = entry.area === 'clan' ? 'des membres actifs ensemble' : 'avec le clan'
      return `Parties ${who} depuis le ${formatSessionDate(coverage.clanMatches.firstSession)} (${plural(coverage.clanMatches.count, 'partie')}).`
    }
    case 'pubgMatches':
      if (!member) return 'Parties PUBG suivies depuis le —.'
      return member.pubgMatches.since
        ? `Parties PUBG suivies depuis le ${formatSessionDate(member.pubgMatches.since)} (${plural(member.pubgMatches.count ?? 0, 'partie')}, tous types).`
        : 'Aucune partie PUBG suivie pour l’instant.'
    case 'telemetry':
      if (!coverage) return 'Parties analysées depuis le —.'
      return coverage.telemetry.since ? `Parties analysées depuis le ${formatSessionDate(coverage.telemetry.since)}.` : 'Aucune partie analysée pour l’instant.'
    case 'drops':
    case 'closures':
    case 'items':
      return `${spanLine(FAMILY_LABELS[family]!, coverage?.[family])}.`
    case 'kills':
    case 'positions':
      // Le clan n'a pas de date propre : ses kills et positions suivent les parties analysées.
      return member ? `${spanLine(FAMILY_LABELS[family]!, member[family])}.` : `${FAMILY_LABELS[family]} : depuis la première partie analysée.`
    case 'career':
      return member?.careerSyncedAt ? `Carrière PUBG : depuis la création du compte, relue le ${formatInstant(member.careerSyncedAt)}.` : STATIC_SINCE.career
    case 'lastMatch':
      return `Dernière partie enregistrée : ${formatInstant(coverage?.clanMatches.lastMatchAt)}.`
  }
}

export type PageScopeRow = { id: 'period' | 'matches' | 'source' | 'since' | 'notes'; label: string; text?: string; items?: string[] }

/**
 * Les lignes de la barre. Sans `context` ni `data` : la description générale de la Méthodologie ; avec `context` :
 * les filtres de la page ; avec `data` (`null` pendant le chargement) : les dates réelles.
 */
export function pageScopeRows(entry: PageScopeEntry, context: PageScopeContext | null = null, data?: PageScopeData): PageScopeRow[] {
  const rows: PageScopeRow[] = [
    { id: 'period', label: 'Période', text: periodRow(entry, context) },
    { id: 'matches', label: 'Parties comptées', text: matchTypesRow(entry, context) },
    { id: 'source', label: 'Source', text: sourceRow(entry, data) },
  ]
  if (entry.since.length > 0) rows.push({ id: 'since', label: 'Depuis quand', items: entry.since.map((family) => sinceLine(family, entry, data)) })
  if (entry.notes?.length) rows.push({ id: 'notes', label: 'À savoir', items: [...entry.notes] })
  return rows
}

export function pageScopeEntriesOf(area: PageScopeArea) {
  return PAGE_SCOPE_ENTRIES.filter((entry) => entry.area === area)
}
