/**
 * Vue SuperUser de la Carte des ressources (docs/features/carte-ressources.md §5) : libellés de la file de validation
 * et de l'historique, sélection multiple, cadrage des mini-cartes « Avant / Après » et de l'éditeur de position.
 *
 * Fichier pur, sans import `@/` : partagé par les composants de `src/components/resources/admin/` et les tests.
 * Dates affichées à l'heure de Paris, quel que soit le fuseau du navigateur.
 */
import type { ResourceContributor, ResourceDecision, ResourceQueueItem } from './resource-api'
import { RESOURCE_POINT_KIND_LABELS, RESOURCE_REPORT_KIND_LABELS, type ResourcePointKind } from './resource-map'

// --- Dates -----------------------------------------------------------------------------------------------------------

const PARIS = 'Europe/Paris'
const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: PARIS })
const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS })
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: '2-digit', timeZone: PARIS })

function validDate(iso: string | null | undefined) {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** « 3 oct. » */
export function shortDate(iso: string | null | undefined) {
  const date = validDate(iso)
  return date ? SHORT_DATE.format(date) : '—'
}

/** « 3 oct. · 21:42 » (colonne « Quand » de l'historique). */
export function dateTimeLabel(iso: string | null | undefined) {
  const date = validDate(iso)
  return date ? `${SHORT_DATE.format(date)} · ${TIME.format(date)}` : '—'
}

/** « 1/10 », « 28/09 » : jour sans zéro, mois sur deux chiffres (« À revérifier depuis le 1/10 »). */
export function dayMonth(iso: string | null | undefined) {
  const date = validDate(iso)
  if (!date) return '—'
  const parts = DAY_MONTH.formatToParts(date)
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '')
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  return `${day}/${month}`
}

// --- Libellés de la file ---------------------------------------------------------------------------------------------

export function kindLabel(kind: ResourcePointKind) {
  return RESOURCE_POINT_KIND_LABELS[kind]?.singular ?? kind
}

/** « 3 joueurs », « 1 joueur ». */
export function playersLabel(count: number) {
  return `${count} joueur${count > 1 ? 's' : ''}`
}

/** « 9 points saisis », « 1 point saisi », « Aucun point saisi ». */
export function savedPointsLabel(count: number) {
  if (count <= 0) return 'Aucun point saisi'
  return `${count} point${count > 1 ? 's' : ''} saisi${count > 1 ? 's' : ''}`
}

/** « 6 en attente · signalements identiques regroupés » (en-tête de la file). */
export function pendingSummary(count: number) {
  return count > 0 ? `${count} en attente · signalements identiques regroupés` : 'Aucun élément en attente'
}

/** Type affiché : « Station-service », ou « Garage → Station-service » quand le signalement change le type. */
export function queueItemKinds(item: Pick<ResourceQueueItem, 'kind' | 'before' | 'after'>): { from: ResourcePointKind | null; to: ResourcePointKind } {
  const before = item.before?.kind ?? null
  const after = item.after?.kind ?? null
  if (before && after && before !== after) return { from: before, to: after }
  return { from: null, to: after ?? before ?? item.kind }
}

export function queueItemTitle(item: Pick<ResourceQueueItem, 'kind' | 'before' | 'after'>) {
  const { from, to } = queueItemKinds(item)
  return from ? `${kindLabel(from)} → ${kindLabel(to)}` : kindLabel(to)
}

/** Repère de grille de la ligne : la position demandée, à défaut la position actuelle. */
export function queueItemGrid(item: Pick<ResourceQueueItem, 'before' | 'after'>) {
  return item.after?.grid ?? item.before?.grid ?? '—'
}

export type NatureTone = 'neutral' | 'neg' | 'warn'

/** Nature de la ligne : « Nouveau point » (neutre), « N'existe plus » (négatif), « Mal placé » / « Mauvais type » (orange). */
export function queueItemNature(item: Pick<ResourceQueueItem, 'type' | 'reportKind'>): { label: string; tone: NatureTone } {
  if (item.type === 'proposal' || !item.reportKind) return { label: 'Nouveau point', tone: 'neutral' }
  return { label: RESOURCE_REPORT_KIND_LABELS[item.reportKind], tone: item.reportKind === 'missing' ? 'neg' : 'warn' }
}

/** « Nyx », « Nyx et Vexa », « Nyx, Vexa et Lemon », « Nyx, Vexa, Lemon et 2 autres ». */
export function joinNames(names: string[], shown = 3) {
  const list = names.filter(Boolean)
  if (list.length === 0) return 'Joueur inconnu'
  if (list.length === 1) return list[0]
  if (list.length <= shown) return `${list.slice(0, -1).join(', ')} et ${list[list.length - 1]}`
  const rest = list.length - shown
  return `${list.slice(0, shown).join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}`
}

/** « 12 validés », « 1 validé », « aucun validé ». */
export function validatedLabel(count: number) {
  if (count <= 0) return 'aucun validé'
  return `${count} validé${count > 1 ? 's' : ''}`
}

/**
 * Ligne d'auteurs : un seul joueur avec son nombre de points validés (« Kr4ken · 12 validés · 3 oct. »), plusieurs
 * joueurs sans (« Nyx, Vexa et Lemon · 2 oct. »).
 */
export function authorsLine(authors: ResourceContributor[], createdAt: string) {
  const parts = authors.length === 1 ? [authors[0].name, validatedLabel(authors[0].validatedCount)] : [joinNames(authors.map((author) => author.name))]
  return [...parts, shortDate(createdAt)].join(' · ')
}

// --- Décisions -------------------------------------------------------------------------------------------------------

/** Libellé de la notification annulable : « Validé », « Refusé », « Modifié et validé », « 3 validés ». */
export function decisionToastLabel(decision: ResourceDecision, count = 1) {
  if (count > 1) {
    if (decision === 'refuse') return `${count} refusés`
    return `${count} validés`
  }
  if (decision === 'refuse') return 'Refusé'
  if (decision === 'edit') return 'Modifié et validé'
  return 'Validé'
}

// --- Sélection multiple ----------------------------------------------------------------------------------------------

export function toggleSelected(selected: ReadonlySet<string>, id: string) {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** État de la case « tout sélectionner » : coché, partiel (indéterminé) ou vide. */
export function selectionState(ids: readonly string[], selected: ReadonlySet<string>): 'all' | 'some' | 'none' {
  const count = ids.filter((id) => selected.has(id)).length
  if (count === 0) return 'none'
  return count === ids.length ? 'all' : 'some'
}

/** Clic sur « tout sélectionner » : tout cocher, sauf si tout l'était déjà. */
export function toggleAll(ids: readonly string[], selected: ReadonlySet<string>) {
  return selectionState(ids, selected) === 'all' ? new Set<string>() : new Set(ids)
}

/** Garde de la sélection les seules lignes encore présentes dans la file (après un rechargement). */
export function pruneSelection(selected: ReadonlySet<string>, ids: readonly string[]) {
  const present = new Set(ids)
  return new Set([...selected].filter((id) => present.has(id)))
}

// --- Mini-cartes -----------------------------------------------------------------------------------------------------

/** Côté (m) de l'extrait d'une mini-carte de la file (~46 px : l'image de la carte à peu près à l'échelle 1). */
export const MINI_MAP_WINDOW_METERS = 400
/** Côté (m) de l'extrait de l'éditeur, où l'on déplace le marqueur. */
export const EDITOR_WINDOW_METERS = 1000

export type MiniMapView = {
  /** Coin haut-gauche et côté de l'extrait, en mètres. */
  viewX: number
  viewY: number
  window: number
  /** Image de la carte entière en fond : taille et position, en pourcentages (indépendants de la taille de la case). */
  backgroundSize: string
  backgroundPosition: string
}

const round2 = (value: number) => Math.round(value * 100) / 100

/**
 * Extrait carré de la carte centré sur (x, y), décalé au bord pour que l'image couvre toujours la case. En CSS, une
 * position de fond à p % aligne le point p de l'image sur le point p de la case : pour montrer l'extrait qui commence
 * à `viewX`, p = viewX / (côté de la carte − côté de l'extrait).
 */
export function miniMapView({ sizeMeters, x, y, windowMeters }: { sizeMeters: number; x: number; y: number; windowMeters: number }): MiniMapView {
  const window = Math.min(windowMeters, sizeMeters)
  const span = sizeMeters - window
  const clamp = (value: number) => Math.min(span, Math.max(0, value - window / 2))
  const viewX = clamp(x)
  const viewY = clamp(y)
  const scale = round2((sizeMeters / window) * 100)
  const percent = (value: number) => (span > 0 ? round2((value / span) * 100) : 0)
  return {
    viewX,
    viewY,
    window,
    backgroundSize: `${scale}% ${scale}%`,
    backgroundPosition: `${percent(viewX)}% ${percent(viewY)}%`,
  }
}

/** Position d'un point dans l'extrait, en pourcentages de la case (peut sortir de 0–100 hors de l'extrait). */
export function markerPercent(view: Pick<MiniMapView, 'viewX' | 'viewY' | 'window'>, point: { x: number; y: number }) {
  return {
    left: round2(((point.x - view.viewX) / view.window) * 100),
    top: round2(((point.y - view.viewY) / view.window) * 100),
  }
}

export function insideView(view: Pick<MiniMapView, 'viewX' | 'viewY' | 'window'>, point: { x: number; y: number }) {
  return point.x >= view.viewX && point.x <= view.viewX + view.window && point.y >= view.viewY && point.y <= view.viewY + view.window
}

/** Garde un point dans l'extrait (le marqueur de l'éditeur ne le quitte pas), en mètres entiers. */
export function clampToView(view: Pick<MiniMapView, 'viewX' | 'viewY' | 'window'>, point: { x: number; y: number }) {
  const clamp = (value: number, start: number) => Math.round(Math.min(start + view.window, Math.max(start, value)))
  return { x: clamp(point.x, view.viewX), y: clamp(point.y, view.viewY) }
}

/** Point de la carte sous le pointeur : fraction (0–1) de la case → mètres, gardé dans l'extrait. */
export function pointFromFraction(view: Pick<MiniMapView, 'viewX' | 'viewY' | 'window'>, fx: number, fy: number) {
  return clampToView(view, { x: view.viewX + fx * view.window, y: view.viewY + fy * view.window })
}

/** Pas du clavier dans l'éditeur : 10 m, 50 m avec Maj. */
export const NUDGE_METERS = 10
export const NUDGE_METERS_FAST = 50

/** Flèche du clavier → nouveau point (gardé dans l'extrait), `null` pour une autre touche. */
export function nudgePoint(view: Pick<MiniMapView, 'viewX' | 'viewY' | 'window'>, point: { x: number; y: number }, key: string, fast = false) {
  const step = fast ? NUDGE_METERS_FAST : NUDGE_METERS
  const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const move = delta[key]
  if (!move) return null
  return clampToView(view, { x: point.x + move[0], y: point.y + move[1] })
}

// --- Historique ------------------------------------------------------------------------------------------------------

/** Pastille initiale d'un joueur (« K » pour Kr4ken). */
export function actorInitial(name: string) {
  const letter = [...name.trim()].find((char) => /[\p{L}\p{N}]/u.test(char))
  return (letter ?? '?').toLocaleUpperCase('fr-FR')
}
