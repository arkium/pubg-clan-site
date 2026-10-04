/**
 * Historique annulable de la Carte des ressources (docs/features/carte-ressources.md §5) — partie pure, sans Prisma :
 * instantanés des lignes touchées par une décision, comparaison avec l'état actuel, libellés français des entrées.
 *
 * Chaque `ResourceAction` garde `before` et `after` : `{ point?, reports?, map? }` (lignes touchées, état complet) ;
 * `after.label` porte en plus l'objet et la seconde ligne de l'entrée, figés au moment de la décision.
 */
import { RESOURCE_POINT_KIND_LABELS, RESOURCE_REPORT_KIND_LABELS, gridLabel, parseResourcePointKind, parseResourceReportKind, resourceMap } from './resource-map'

export type PointSnapshot = {
  id: string
  mapName: string
  kind: string
  x: number
  y: number
  status: string
  createdByUserId: number | null
  validatedByUserId: number | null
  validatedAt: string | null
  lastConfirmedAt: string | null
}

export type ReportSnapshot = {
  id: string
  pointId: string
  kind: string
  status: string
  userId: number
  resolvedByUserId: number | null
  resolvedAt: string | null
}

export type MapSnapshot = { mapName: string; verifiedAt: string | null; recheckSince: string | null }

/** Lignes touchées par une décision. */
export type ResourceActionState = { point?: PointSnapshot; reports?: ReportSnapshot[]; map?: MapSnapshot }

/** Objet et seconde ligne d'une entrée d'historique (« Station-service · F-L », « Proposée par Vexa »). */
export type ResourceActionLabel = { object: string; detail: string | null }

export type StoredActionAfter = ResourceActionState & { label?: ResourceActionLabel }

export const RESOURCE_ACTIONS = [
  'validate_point',
  'edit_point',
  'refuse_point',
  'remove_point',
  'move_point',
  'change_kind',
  'correct_point',
  'refuse_report',
  'recheck_map',
  'verify_map',
  'undo',
] as const
export type ResourceActionType = (typeof RESOURCE_ACTIONS)[number]

/** Verbe de l'entrée, après le nom du SuperUser (« Paulo a validé »). */
export const RESOURCE_ACTION_VERBS: Record<ResourceActionType, string> = {
  validate_point: 'a validé',
  edit_point: 'a corrigé et validé',
  refuse_point: 'a refusé',
  remove_point: 'a retiré',
  move_point: 'a déplacé',
  change_kind: 'a changé le type',
  correct_point: 'a corrigé',
  refuse_report: 'a refusé',
  recheck_map: 'a marqué à revérifier',
  verify_map: 'a vérifié la carte',
  undo: 'a annulé',
}

/** Nom de la décision, pour la seconde ligne d'une annulation (« Validation de Paulo du 3/10 »). */
const RESOURCE_ACTION_NOUNS: Record<ResourceActionType, string> = {
  validate_point: 'Validation',
  edit_point: 'Correction et validation',
  refuse_point: 'Refus',
  remove_point: 'Retrait',
  move_point: 'Déplacement',
  change_kind: 'Changement de type',
  correct_point: 'Correction',
  refuse_report: 'Refus',
  recheck_map: 'Demande de revérification',
  verify_map: 'Vérification',
  undo: 'Annulation',
}

export function resourceActionVerb(action: string) {
  return (RESOURCE_ACTION_VERBS as Record<string, string>)[action] ?? action
}

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null)

export function pointSnapshot(point: {
  id: string
  mapName: string
  kind: string
  x: number
  y: number
  status: string
  createdByUserId: number | null
  validatedByUserId: number | null
  validatedAt: Date | null
  lastConfirmedAt: Date | null
}): PointSnapshot {
  return {
    id: point.id,
    mapName: point.mapName,
    kind: point.kind,
    x: point.x,
    y: point.y,
    status: point.status,
    createdByUserId: point.createdByUserId,
    validatedByUserId: point.validatedByUserId,
    validatedAt: iso(point.validatedAt),
    lastConfirmedAt: iso(point.lastConfirmedAt),
  }
}

export function reportSnapshot(report: {
  id: string
  pointId: string
  kind: string
  status: string
  userId: number
  resolvedByUserId: number | null
  resolvedAt: Date | null
}): ReportSnapshot {
  return {
    id: report.id,
    pointId: report.pointId,
    kind: report.kind,
    status: report.status,
    userId: report.userId,
    resolvedByUserId: report.resolvedByUserId,
    resolvedAt: iso(report.resolvedAt),
  }
}

export function mapSnapshot(mapName: string, state: { verifiedAt: Date | null; recheckSince: Date | null } | null): MapSnapshot {
  return { mapName, verifiedAt: iso(state?.verifiedAt), recheckSince: iso(state?.recheckSince) }
}

/** Relecture défensive d'une colonne JSON `before` / `after`. */
export function parseActionState(value: unknown): StoredActionAfter {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as StoredActionAfter
}

/**
 * L'état actuel correspond-il encore à `expected` (l'`after` d'une action) ? Champs comparés : type, position et
 * statut d'un point, statut des signalements, dates de vérification d'une carte. Un « Toujours là » postérieur
 * (date de confirmation) ne compte pas : il n'empêche pas l'annulation.
 */
export function actionStateMatches(expected: ResourceActionState, current: ResourceActionState) {
  if (expected.point) {
    const point = current.point
    if (!point || point.kind !== expected.point.kind || point.x !== expected.point.x || point.y !== expected.point.y || point.status !== expected.point.status) {
      return false
    }
  }
  if (expected.reports?.length) {
    const byId = new Map((current.reports ?? []).map((report) => [report.id, report]))
    if (!expected.reports.every((report) => byId.get(report.id)?.status === report.status)) return false
  }
  if (expected.map) {
    const map = current.map
    if (!map || map.verifiedAt !== expected.map.verifiedAt || map.recheckSince !== expected.map.recheckSince) return false
  }
  return true
}

// --- Libellés --------------------------------------------------------------------------------------------------------

const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Paris' })

/** « 1/10 » (heure de Paris), comme la maquette (« Mise à jour PUBG du 1/10 »). */
export function shortDate(date: Date) {
  const parts = DAY_MONTH.formatToParts(date)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  return `${day}/${month}`
}

export function kindLabel(kind: string) {
  const parsed = parseResourcePointKind(kind)
  return parsed ? RESOURCE_POINT_KIND_LABELS[parsed].singular : kind
}

export function pointGrid(mapName: string, x: number, y: number) {
  const map = resourceMap(mapName)
  return map ? gridLabel(map, x, y) : '?'
}

/** « Station-service · F-L » ; « Garage → Station-service · D-M » ; « Ponton · B-O → B-P ». */
export function pointObject(before: Pick<PointSnapshot, 'mapName' | 'kind' | 'x' | 'y'>, after: Pick<PointSnapshot, 'mapName' | 'kind' | 'x' | 'y'> = before) {
  const kinds = before.kind === after.kind ? kindLabel(after.kind) : `${kindLabel(before.kind)} → ${kindLabel(after.kind)}`
  const from = pointGrid(before.mapName, before.x, before.y)
  const to = pointGrid(after.mapName, after.x, after.y)
  return `${kinds} · ${from === to ? to : `${from} → ${to}`}`
}

/** « Signalement « N’existe plus » · Garage E-K ». */
export function reportObject(reportKind: string, point: Pick<PointSnapshot, 'mapName' | 'kind' | 'x' | 'y'>) {
  const parsed = parseResourceReportKind(reportKind)
  const label = parsed ? RESOURCE_REPORT_KIND_LABELS[parsed] : reportKind
  return `Signalement « ${label} » · ${kindLabel(point.kind)} ${pointGrid(point.mapName, point.x, point.y)}`
}

/** « Signalé par Lemon » ; « 2 signalements regroupés ». */
export function reportsDetail(count: number, firstAuthor: string | null) {
  if (count > 1) return `${count} signalements regroupés`
  return firstAuthor ? `Signalé par ${firstAuthor}` : null
}

/** « 9 points saisis ». */
export function pointsCountLabel(count: number) {
  return `${count} point${count > 1 ? 's' : ''} saisi${count > 1 ? 's' : ''}`
}

/** Seconde ligne d'une annulation : « Validation de Paulo du 3/10 ». */
export function undoDetail(action: string, actor: string, at: Date) {
  const noun = (RESOURCE_ACTION_NOUNS as Record<string, string>)[action] ?? 'Décision'
  return `${noun} de ${actor} du ${shortDate(at)}`
}

/** Colonne `summary` (255 caractères) : phrase lisible sans le nom du SuperUser. */
export function actionSummary(action: string, label: ResourceActionLabel) {
  return `${resourceActionVerb(action)} ${label.object}${label.detail ? ` — ${label.detail}` : ''}`.slice(0, 255)
}
