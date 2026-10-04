/**
 * Carte des ressources — serveur, vue joueur (docs/features/carte-ressources.md §4) : lecture d'une carte, zones de
 * drop du clan, propositions, annulation, « Toujours là », signalements. Contrat : `resource-api.ts`.
 *
 * Les points saisis sont communs à tout le site. Un nom de contributeur n'est jamais l'e-mail : pseudo du compte, sinon
 * celui d'un membre lié, sinon « Joueur ».
 */
import type { Prisma } from '@prisma/client'

import type { AuthSessionContext } from '@/lib/auth-session'
import { locationForPoint } from '@/lib/drop-zones-view'
import { getMapLocations } from '@/lib/map-location-service'
import { prisma } from '@/lib/prisma'
import { clamp01, getMapBounds } from '@/lib/pubg-telemetry/position-heatmap'

import type {
  ObservedSpotView,
  ResourceContributor,
  ResourceDropZoneCenter,
  ResourceDropZonesResponse,
  ResourceMapResponse,
  ResourcePointView,
  ResourceProposalResponse,
  ResourceReportResponse,
} from './resource-api'
import {
  DROP_ZONE_RADIUS_METERS,
  OBSERVATION_WINDOW_DAYS,
  OBSERVED_FAMILIES,
  RESOURCE_COMMENT_MAX,
  RESOURCE_POINT_KINDS,
  gridLabel,
  insideResourceMap,
  isSpotShown,
  topMatchesByFamily,
  parseResourcePointKind,
  parseResourceReportKind,
  resourceMap,
  resourcePointState,
  spotShare,
  type ObservedFamily,
  type ResourceMapDefinition,
  type ResourcePointKind,
  type ResourcePointStatus,
} from './resource-map'

// --- Règles ----------------------------------------------------------------------------------------------------------

/** Doublon flagrant : un point du même type, validé ou en attente, à moins de 25 m. */
export const RESOURCE_DUPLICATE_METERS = 25
/** Propositions en attente au plus, par joueur. */
export const RESOURCE_MAX_PENDING_PER_USER = 20
/** « Mal placé » : la nouvelle position doit être à plus de 15 m de l'actuelle. */
export const RESOURCE_MISPLACED_MIN_METERS = 15
/** Zones de drop du filtre « Autour de nos drop zones » : atterrissages du clan des 90 derniers jours. */
export const RESOURCE_DROP_ZONE_WINDOW_DAYS = 90
export const RESOURCE_DROP_ZONE_COUNT = 3

export const UNKNOWN_PLAYER_NAME = 'Joueur'

export type ResourceViewer = Pick<AuthSessionContext, 'userId' | 'isSuperUser'> | null

export type ResourceErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_body'
  | 'unknown_map'
  | 'invalid_kind'
  | 'outside_map'
  | 'comment_too_long'
  | 'duplicate'
  | 'too_many_pending'
  | 'not_found'
  | 'not_pending'
  | 'not_validated'
  | 'invalid_report'
  | 'already_reported'
  | 'already_decided'
  | 'nothing_to_apply'
  | 'invalid_action'
  | 'modified'
  | 'already_undone'
  | 'not_undoable'

/** Refus métier ; `status` est le code HTTP que la route renvoie tel quel, avec `{ error, code }`. */
export class ResourceError extends Error {
  constructor(
    readonly code: ResourceErrorCode,
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ResourceError'
  }
}

/** Réponse d'erreur d'une route : refus métier tel quel, sinon 500 journalisé. */
export function resourceErrorResponse(error: unknown, context: string) {
  if (error instanceof ResourceError) return Response.json({ error: error.message, code: error.code }, { status: error.status })
  console.error(`[resources/${context}]`, error)
  return Response.json({ error: 'Erreur interne du serveur.', code: 'internal' }, { status: 500 })
}

export function requireResourceUser(viewer: ResourceViewer): NonNullable<ResourceViewer> {
  if (!viewer) throw new ResourceError('unauthorized', 401, 'Connecte-toi pour contribuer à la carte.')
  return viewer
}

export function requireResourceSuperUser(viewer: ResourceViewer): NonNullable<ResourceViewer> {
  if (!viewer) throw new ResourceError('unauthorized', 401, 'Connecte-toi avec un compte SuperUser.')
  if (!viewer.isSuperUser) throw new ResourceError('forbidden', 403, 'Réservé aux SuperUsers.')
  return viewer
}

export function requireResourceMap(key: unknown): ResourceMapDefinition {
  const map = typeof key === 'string' ? resourceMap(key) : null
  if (!map) throw new ResourceError('unknown_map', 400, 'Carte inconnue.')
  return map
}

/** Corps JSON d'une requête : objet attendu, `400` sinon. */
export async function readResourceBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ResourceError('invalid_body', 400, 'Requête invalide : objet JSON attendu.')
  return body as Record<string, unknown>
}

/** Identifiant de point ou d'action reçu dans l'URL (cuid) : `404` s'il ne peut correspondre à rien. */
export function requireResourceId(value: string | undefined, what: string) {
  if (!value || value.length > 64) throw new ResourceError('not_found', 404, `${what} introuvable.`)
  return value
}

/** Mètres au dixième : assez précis pour la carte, sans flottants bruités en base. */
export const roundMeters = (value: number) => Math.round(value * 10) / 10

/** Position dans la carte, `400` sinon. */
export function parsePosition(map: ResourceMapDefinition, x: unknown, y: unknown) {
  if (typeof x !== 'number' || typeof y !== 'number' || !insideResourceMap(map, x, y)) {
    throw new ResourceError('outside_map', 400, `Position hors de la carte (0 à ${map.sizeMeters} m).`)
  }
  return { x: roundMeters(x), y: roundMeters(y) }
}

/** Commentaire facultatif : texte nettoyé, vide = `null`, au plus `RESOURCE_COMMENT_MAX` caractères. */
export function parseComment(value: unknown) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new ResourceError('invalid_body', 400, 'Commentaire invalide.')
  const comment = value.trim()
  if (comment.length > RESOURCE_COMMENT_MAX) {
    throw new ResourceError('comment_too_long', 400, `Commentaire trop long (${RESOURCE_COMMENT_MAX} caractères au plus).`)
  }
  return comment || null
}

// --- Contributeurs ---------------------------------------------------------------------------------------------------

export type Db = Prisma.TransactionClient

const cleanName = (value: string | null | undefined) => value?.trim() || null

/** Noms affichés : pseudo du compte, sinon membre lié (identité principale d'abord), sinon « Joueur ». Jamais l'e-mail. */
export async function resolveUserNames(userIds: Iterable<number>, db: Db = prisma): Promise<Map<number, string>> {
  const ids = [...new Set(userIds)]
  const names = new Map<number, string>()
  if (!ids.length) return names

  const users = await db.userAccount.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })
  for (const user of users) {
    const name = cleanName(user.displayName)
    if (name) names.set(user.id, name)
  }

  const missing = ids.filter((id) => !names.has(id))
  if (missing.length) {
    const identities = await db.memberIdentity.findMany({
      where: { userId: { in: missing } },
      select: { userId: true, member: { select: { displayName: true } } },
      orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
    })
    for (const identity of identities) {
      const name = cleanName(identity.member.displayName)
      if (name && !names.has(identity.userId)) names.set(identity.userId, name)
    }
  }

  for (const id of ids) if (!names.has(id)) names.set(id, UNKNOWN_PLAYER_NAME)
  return names
}

/** « 12 points validés » : propositions validées + signalements acceptés, par joueur. */
export async function countValidatedContributions(userIds: Iterable<number>, db: Db = prisma): Promise<Map<number, number>> {
  const ids = [...new Set(userIds)]
  const counts = new Map<number, number>(ids.map((id) => [id, 0]))
  if (!ids.length) return counts

  const [points, reports] = await Promise.all([
    db.resourcePoint.groupBy({ by: ['createdByUserId'], where: { createdByUserId: { in: ids }, status: 'validated' }, _count: { _all: true } }),
    db.resourceReport.groupBy({ by: ['userId'], where: { userId: { in: ids }, status: 'accepted' }, _count: { _all: true } }),
  ])
  for (const row of points) {
    if (row.createdByUserId !== null) counts.set(row.createdByUserId, (counts.get(row.createdByUserId) ?? 0) + row._count._all)
  }
  for (const row of reports) counts.set(row.userId, (counts.get(row.userId) ?? 0) + row._count._all)
  return counts
}

export async function resolveContributors(userIds: Iterable<number>, db: Db = prisma): Promise<Map<number, ResourceContributor>> {
  const ids = [...new Set(userIds)]
  const [names, counts] = await Promise.all([resolveUserNames(ids, db), countValidatedContributions(ids, db)])
  return new Map(ids.map((id) => [id, { name: names.get(id) ?? UNKNOWN_PLAYER_NAME, validatedCount: counts.get(id) ?? 0 }]))
}

// --- Vue d'un point --------------------------------------------------------------------------------------------------

type PointRow = {
  id: string
  mapName: string
  kind: string
  x: number
  y: number
  status: string
  comment: string | null
  createdByUserId: number | null
  validatedByUserId: number | null
  validatedAt: Date | null
  lastConfirmedAt: Date | null
  confirmationCount: number
  createdAt: Date
}

type PointViewContext = {
  map: ResourceMapDefinition
  recheckSince: Date | null
  viewer: ResourceViewer
  people: Map<number, ResourceContributor>
  reportedIds: Set<string>
  confirmedIds: Set<string>
}

const isoOrNull = (value: Date | null) => (value ? value.toISOString() : null)

/** Vue d'un point pour un lecteur ; `null` pour un point jamais montré (refusé, retiré, type inconnu). */
export function toPointView(point: PointRow, context: PointViewContext): ResourcePointView | null {
  const kind = parseResourcePointKind(point.kind)
  const state = resourcePointState({ status: point.status as ResourcePointStatus, lastConfirmedAt: point.lastConfirmedAt, validatedAt: point.validatedAt }, context.recheckSince)
  if (!kind || !state) return null
  const mine = context.viewer !== null && point.createdByUserId === context.viewer.userId
  return {
    id: point.id,
    kind,
    x: point.x,
    y: point.y,
    grid: gridLabel(context.map, point.x, point.y),
    state,
    mine,
    createdBy: point.createdByUserId === null ? null : (context.people.get(point.createdByUserId) ?? { name: UNKNOWN_PLAYER_NAME, validatedCount: 0 }),
    validatedBy: point.validatedByUserId === null ? null : (context.people.get(point.validatedByUserId)?.name ?? UNKNOWN_PLAYER_NAME),
    validatedAt: isoOrNull(point.validatedAt),
    lastConfirmedAt: isoOrNull(point.lastConfirmedAt),
    confirmations: point.confirmationCount,
    createdAt: point.createdAt.toISOString(),
    comment: mine || context.viewer?.isSuperUser ? point.comment : null,
    reportedByMe: context.reportedIds.has(point.id),
    confirmedByMe: context.confirmedIds.has(point.id),
  }
}

function peopleOf(points: PointRow[], viewer: ResourceViewer) {
  const ids = new Set<number>()
  for (const point of points) {
    if (point.createdByUserId !== null) ids.add(point.createdByUserId)
    if (point.validatedByUserId !== null) ids.add(point.validatedByUserId)
  }
  if (viewer) ids.add(viewer.userId)
  return ids
}

/** Confirmation « Toujours là » qui compte encore : postérieure à la demande de revérification, s'il y en a une. */
const confirmationWindow = (recheckSince: Date | null) => (recheckSince ? { createdAt: { gte: recheckSince } } : {})

async function viewerFlags(viewer: ResourceViewer, mapName: string, recheckSince: Date | null, pointIds?: string[]) {
  if (!viewer) return { reportedIds: new Set<string>(), confirmedIds: new Set<string>() }
  const scope = pointIds ? { pointId: { in: pointIds } } : { point: { mapName } }
  const [reports, confirmations] = await Promise.all([
    prisma.resourceReport.findMany({ where: { userId: viewer.userId, status: 'pending', ...scope }, select: { pointId: true } }),
    prisma.resourceConfirmation.findMany({ where: { userId: viewer.userId, ...scope, ...confirmationWindow(recheckSince) }, select: { pointId: true } }),
  ])
  return { reportedIds: new Set(reports.map((row) => row.pointId)), confirmedIds: new Set(confirmations.map((row) => row.pointId)) }
}

async function singlePointView(point: PointRow, viewer: ResourceViewer) {
  const map = requireResourceMap(point.mapName)
  const state = await prisma.resourceMapState.findUnique({ where: { mapName: point.mapName }, select: { recheckSince: true } })
  const recheckSince = state?.recheckSince ?? null
  const [people, flags] = await Promise.all([resolveContributors(peopleOf([point], viewer)), viewerFlags(viewer, point.mapName, recheckSince, [point.id])])
  const view = toPointView(point, { map, recheckSince, viewer, people, ...flags })
  if (!view) throw new ResourceError('not_found', 404, 'Point introuvable.')
  return { view, viewerCount: viewer ? (people.get(viewer.userId)?.validatedCount ?? 0) : 0 }
}

// --- File de validation (compte) -------------------------------------------------------------------------------------

export type QueueReportGroup = {
  pointId: string
  kind: string
  reports: Array<{ id: string; userId: number; kind: string; proposedX: number | null; proposedY: number | null; proposedKind: string | null; comment: string | null; createdAt: Date }>
}

/**
 * Lignes brutes de la file : propositions en attente, et signalements en attente regroupés par point et motif — sur un
 * point encore validé seulement (un signalement sur un point retiré ou revenu en attente n'a plus d'objet).
 */
export async function loadQueueRows(db: Db = prisma) {
  const [proposals, reports] = await Promise.all([
    db.resourcePoint.findMany({ where: { status: 'pending' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    db.resourceReport.findMany({
      where: { status: 'pending' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, pointId: true, userId: true, kind: true, proposedX: true, proposedY: true, proposedKind: true, comment: true, createdAt: true },
    }),
  ])
  const pointIds = [...new Set(reports.map((report) => report.pointId))]
  const reportedPoints = pointIds.length ? await db.resourcePoint.findMany({ where: { id: { in: pointIds }, status: 'validated' } }) : []
  const pointsById = new Map(reportedPoints.map((point) => [point.id, point]))

  const groups = new Map<string, QueueReportGroup>()
  for (const report of reports) {
    if (!pointsById.has(report.pointId) || !parseResourceReportKind(report.kind)) continue
    const key = `${report.pointId}:${report.kind}`
    const group = groups.get(key) ?? { pointId: report.pointId, kind: report.kind, reports: [] }
    group.reports.push(report)
    groups.set(key, group)
  }
  return {
    proposals: proposals.filter((point) => resourceMap(point.mapName) && parseResourcePointKind(point.kind)),
    groups: [...groups.values()],
    pointsById,
  }
}

export async function countQueue(db: Db = prisma) {
  const rows = await loadQueueRows(db)
  return rows.proposals.length + rows.groups.length
}

// --- Lecture d'une carte ---------------------------------------------------------------------------------------------

const zeroCounts = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>

/** `GET /api/resources?map=` — public ; le lecteur connecté voit en plus ses propositions, un SuperUser toutes. */
export async function getResourceMapView(viewer: ResourceViewer, mapKey: unknown): Promise<ResourceMapResponse> {
  const map = requireResourceMap(mapKey)
  const visible: Prisma.ResourcePointWhereInput = viewer?.isSuperUser
    ? { status: { in: ['validated', 'pending'] } }
    : viewer
      ? { OR: [{ status: 'validated' }, { status: 'pending', createdByUserId: viewer.userId }] }
      : { status: 'validated' }

  const [mapState, points, spots, stat] = await Promise.all([
    prisma.resourceMapState.findUnique({ where: { mapName: map.key } }),
    prisma.resourcePoint.findMany({ where: { mapName: map.key, ...visible }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
    prisma.resourceVehicleSpot.findMany({ where: { mapName: map.key }, orderBy: [{ matches: 'desc' }, { id: 'asc' }] }),
    prisma.resourceVehicleMapStat.findUnique({ where: { mapName: map.key } }),
  ])
  const recheckSince = mapState?.recheckSince ?? null

  const [people, flags, queueCount] = await Promise.all([
    resolveContributors(peopleOf(points, viewer)),
    viewerFlags(viewer, map.key, recheckSince),
    viewer?.isSuperUser ? countQueue() : Promise.resolve(null),
  ])

  const views = points.flatMap((point) => toPointView(point, { map, recheckSince, viewer, people, ...flags }) ?? [])
  const pointCounts = zeroCounts<ResourcePointKind>(RESOURCE_POINT_KINDS)
  for (const view of views) if (view.state !== 'pending') pointCounts[view.kind] += 1

  const analysedMatches = stat?.analysedMatches ?? 0
  const observedCounts = zeroCounts<ObservedFamily>(OBSERVED_FAMILIES)
  const observed: ObservedSpotView[] = []
  const familyTop = topMatchesByFamily(spots)
  for (const spot of spots) {
    const family = (OBSERVED_FAMILIES as readonly string[]).includes(spot.family) ? (spot.family as ObservedFamily) : null
    if (!family || !isSpotShown(spot, analysedMatches, familyTop.get(family) ?? 0)) continue
    observedCounts[family] += 1
    observed.push({
      family,
      x: spot.x,
      y: spot.y,
      grid: gridLabel(map, spot.x, spot.y),
      share: spotShare(spot, analysedMatches),
      observations: spot.observations,
      matches: spot.matches,
    })
  }

  return {
    map: { key: map.key, label: map.label, sizeMeters: map.sizeMeters },
    state: {
      verifiedAt: isoOrNull(mapState?.verifiedAt ?? null),
      recheckSince: isoOrNull(recheckSince),
      toConfirm: views.filter((view) => view.state === 'to_confirm').length,
    },
    points: views,
    observed: {
      analysedMatches,
      windowDays: stat?.windowDays ?? OBSERVATION_WINDOW_DAYS,
      computedAt: isoOrNull(stat?.computedAt ?? null),
      spots: observed,
    },
    counts: { observed: observedCounts, points: pointCounts },
    viewer: {
      signedIn: viewer !== null,
      isSuperUser: viewer?.isSuperUser === true,
      validatedCount: viewer ? (people.get(viewer.userId)?.validatedCount ?? 0) : 0,
      queueCount,
    },
  }
}

// --- Zones de drop du clan -------------------------------------------------------------------------------------------

/**
 * `GET /api/resources/drop-zones?clanId=&map=` — les trois villes où le clan atterrit le plus sur cette carte, d'après
 * `DropPressureStat` (un atterrissage par membre et par partie, déjà calculé pour la page « Zones de drop ») et les
 * lieux nommés (`getMapLocations`). Centre = moyenne des atterrissages du clan dans la ville, en mètres.
 */
export async function getResourceDropZones(clanId: number, mapKey: unknown, now: Date = new Date()): Promise<ResourceDropZonesResponse> {
  const map = requireResourceMap(mapKey)
  const since = new Date(now.getTime() - RESOURCE_DROP_ZONE_WINDOW_DAYS * 86_400_000)
  const [landings, locations] = await Promise.all([
    prisma.dropPressureStat.findMany({ where: { mapName: map.key, matchDate: { gte: since }, member: { clanId } }, select: { x: true, y: true } }),
    getMapLocations(),
  ])
  const enabled = (locations[map.key] ?? []).filter((location) => location.enabled)
  const bounds = getMapBounds(map.key)

  const byLocation = new Map<string, { name: string; sumX: number; sumY: number; landings: number }>()
  for (const landing of landings) {
    const xRatio = clamp01(landing.x / bounds.width)
    const yRatio = clamp01(landing.y / bounds.height)
    const location = locationForPoint({ xPct: xRatio * 100, yPct: yRatio * 100 }, enabled)
    if (!location) continue
    const entry = byLocation.get(location.id) ?? { name: location.name, sumX: 0, sumY: 0, landings: 0 }
    entry.sumX += xRatio * map.sizeMeters
    entry.sumY += yRatio * map.sizeMeters
    entry.landings += 1
    byLocation.set(location.id, entry)
  }

  const centers: ResourceDropZoneCenter[] = [...byLocation.values()]
    .sort((a, b) => b.landings - a.landings || a.name.localeCompare(b.name, 'fr'))
    .slice(0, RESOURCE_DROP_ZONE_COUNT)
    .map((entry) => ({ name: entry.name, x: Math.round(entry.sumX / entry.landings), y: Math.round(entry.sumY / entry.landings), landings: entry.landings }))

  return { clanId, map: map.key, centers, radiusMeters: DROP_ZONE_RADIUS_METERS }
}

// --- Contributions ---------------------------------------------------------------------------------------------------

/** `POST /api/resources/points` — proposition `pending`, visible de son auteur et des SuperUsers. */
export async function proposeResourcePoint(viewer: ResourceViewer, body: Record<string, unknown>, now: Date = new Date()): Promise<ResourceProposalResponse> {
  const user = requireResourceUser(viewer)
  const map = requireResourceMap(body.map)
  const kind = parseResourcePointKind(body.kind)
  if (!kind) throw new ResourceError('invalid_kind', 400, 'Type de point inconnu (station-service, garage, ponton ou salle secrète).')
  const { x, y } = parsePosition(map, body.x, body.y)
  const comment = parseComment(body.comment)

  const pending = await prisma.resourcePoint.count({ where: { createdByUserId: user.userId, status: 'pending' } })
  if (pending >= RESOURCE_MAX_PENDING_PER_USER) {
    throw new ResourceError('too_many_pending', 429, `Tu as déjà ${RESOURCE_MAX_PENDING_PER_USER} propositions en attente : attends qu'elles soient validées.`)
  }

  const near = await prisma.resourcePoint.findMany({
    where: {
      mapName: map.key,
      kind,
      status: { in: ['validated', 'pending'] },
      x: { gte: x - RESOURCE_DUPLICATE_METERS, lte: x + RESOURCE_DUPLICATE_METERS },
      y: { gte: y - RESOURCE_DUPLICATE_METERS, lte: y + RESOURCE_DUPLICATE_METERS },
    },
    select: { x: true, y: true },
  })
  if (near.some((point) => Math.hypot(point.x - x, point.y - y) < RESOURCE_DUPLICATE_METERS)) {
    throw new ResourceError('duplicate', 409, `Ce point est déjà sur la carte (ou en attente de validation) à moins de ${RESOURCE_DUPLICATE_METERS} m.`)
  }

  const point = await prisma.resourcePoint.create({
    data: { mapName: map.key, kind, x, y, status: 'pending', comment, createdByUserId: user.userId, createdAt: now },
  })
  const { view, viewerCount } = await singlePointView(point, user)
  return { point: view, validatedCount: viewerCount }
}

/**
 * `POST /api/resources/points/:id/cancel` — l'auteur retire sa proposition encore en attente. La ligne est
 * **supprimée** : rien n'a été validé, il n'y a rien à garder (un refus de SuperUser, lui, passe en `rejected`).
 */
export async function cancelResourcePoint(viewer: ResourceViewer, pointId: string) {
  const user = requireResourceUser(viewer)
  const deleted = await prisma.resourcePoint.deleteMany({ where: { id: pointId, createdByUserId: user.userId, status: 'pending' } })
  if (deleted.count === 1) return { ok: true as const }

  const point = await prisma.resourcePoint.findUnique({ where: { id: pointId }, select: { createdByUserId: true, status: true } })
  if (!point) throw new ResourceError('not_found', 404, 'Proposition introuvable.')
  if (point.createdByUserId !== user.userId) throw new ResourceError('forbidden', 403, 'Seul l’auteur peut annuler sa proposition.')
  throw new ResourceError('not_pending', 409, 'Cette proposition a déjà été traitée par un SuperUser.')
}

async function findValidatedPoint(pointId: string) {
  const point = await prisma.resourcePoint.findUnique({ where: { id: pointId } })
  if (!point || (point.status !== 'validated' && point.status !== 'pending')) throw new ResourceError('not_found', 404, 'Point introuvable.')
  if (point.status !== 'validated') throw new ResourceError('not_validated', 409, 'Ce point attend encore sa validation.')
  return point
}

/**
 * `POST /api/resources/points/:id/confirm` — « Toujours là ». Une confirmation par joueur et par période de
 * revérification : un second clic renvoie le point sans rien écrire.
 */
export async function confirmResourcePoint(viewer: ResourceViewer, pointId: string, now: Date = new Date()): Promise<{ point: ResourcePointView }> {
  const user = requireResourceUser(viewer)
  const point = await findValidatedPoint(pointId)
  const state = await prisma.resourceMapState.findUnique({ where: { mapName: point.mapName }, select: { recheckSince: true } })
  const already = await prisma.resourceConfirmation.findFirst({
    where: { pointId, userId: user.userId, ...confirmationWindow(state?.recheckSince ?? null) },
    select: { id: true },
  })
  if (already) return { point: (await singlePointView(point, user)).view }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.resourceConfirmation.create({ data: { pointId, userId: user.userId, createdAt: now } })
    return tx.resourcePoint.update({ where: { id: pointId }, data: { lastConfirmedAt: now, confirmationCount: { increment: 1 } } })
  })
  return { point: (await singlePointView(updated, user)).view }
}

/**
 * `POST /api/resources/points/:id/reports` — « N'existe plus » (rien d'autre : position et type envoyés sont ignorés),
 * « Mal placé » (nouvelle position à plus de 15 m), « Mauvais type » (autre type). Un seul signalement en attente par
 * joueur et par point.
 */
export async function reportResourcePoint(viewer: ResourceViewer, pointId: string, body: Record<string, unknown>, now: Date = new Date()): Promise<ResourceReportResponse> {
  const user = requireResourceUser(viewer)
  const kind = parseResourceReportKind(body.kind)
  if (!kind) throw new ResourceError('invalid_report', 400, 'Motif inconnu (missing, misplaced ou wrong_kind).')
  const comment = parseComment(body.comment)
  const point = await findValidatedPoint(pointId)
  const map = requireResourceMap(point.mapName)

  let proposedX: number | null = null
  let proposedY: number | null = null
  let proposedKind: ResourcePointKind | null = null
  if (kind === 'misplaced') {
    const position = parsePosition(map, body.x, body.y)
    if (Math.hypot(position.x - point.x, position.y - point.y) <= RESOURCE_MISPLACED_MIN_METERS) {
      throw new ResourceError('invalid_report', 400, `La nouvelle position est à moins de ${RESOURCE_MISPLACED_MIN_METERS} m de l’actuelle.`)
    }
    proposedX = position.x
    proposedY = position.y
  } else if (kind === 'wrong_kind') {
    proposedKind = parseResourcePointKind(body.proposedKind)
    if (!proposedKind) throw new ResourceError('invalid_kind', 400, 'Type proposé inconnu.')
    if (proposedKind === point.kind) throw new ResourceError('invalid_report', 400, 'Le type proposé est déjà celui du point.')
  }

  const existing = await prisma.resourceReport.findFirst({ where: { pointId, userId: user.userId, status: 'pending' }, select: { id: true } })
  if (existing) throw new ResourceError('already_reported', 409, 'Tu as déjà un signalement en attente sur ce point.')

  await prisma.resourceReport.create({ data: { pointId, kind, proposedX, proposedY, proposedKind, comment, status: 'pending', userId: user.userId, createdAt: now } })
  const counts = await countValidatedContributions([user.userId])
  return { ok: true, validatedCount: counts.get(user.userId) ?? 0 }
}
