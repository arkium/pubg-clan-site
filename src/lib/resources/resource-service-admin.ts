/**
 * Carte des ressources — serveur, vue SuperUser (docs/features/carte-ressources.md §5) : file de validation, décisions
 * par lot, revérification d'une carte, historique annulable. Contrat : `resource-api.ts`.
 *
 * Chaque décision écrit **une** `ResourceAction` dans la même transaction qu'elle : `before` / `after` = état complet
 * des lignes touchées (point, signalements, carte). Annuler restaure les champs que la décision avait changés, si
 * l'état actuel est encore celui d'après.
 */
import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

import {
  RESOURCE_HISTORY_PAGE_SIZE,
  RESOURCE_HISTORY_WINDOW_DAYS,
  type ResourceContributor,
  type ResourceDecisionsResponse,
  type ResourceHistoryEntry,
  type ResourceHistoryResponse,
  type ResourceMapSummary,
  type ResourceQueueItem,
  type ResourceQueueResponse,
} from './resource-api'
import {
  actionStateMatches,
  actionSummary,
  mapSnapshot,
  parseActionState,
  pointObject,
  pointSnapshot,
  pointsCountLabel,
  reportObject,
  reportSnapshot,
  reportsDetail,
  resourceActionVerb,
  shortDate,
  undoDetail,
  type ResourceActionLabel,
  type ResourceActionState,
  type ResourceActionType,
} from './resource-history'
import {
  RESOURCE_MAPS,
  gridLabel,
  parseResourcePointKind,
  parseResourceReportKind,
  resourceMap,
  type ResourceMapDefinition,
  type ResourcePointKind,
  type ResourceReportKind,
} from './resource-map'
import {
  ResourceError,
  UNKNOWN_PLAYER_NAME,
  countQueue,
  loadQueueRows,
  parsePosition,
  requireResourceMap,
  requireResourceSuperUser,
  resolveContributors,
  resolveUserNames,
  roundMeters,
  type Db,
  type QueueReportGroup,
  type ResourceViewer,
} from './resource-service'

/** Décisions envoyées au plus en un lot. */
export const RESOURCE_MAX_DECISIONS = 100

const isoOrNull = (value: Date | null | undefined) => (value ? value.toISOString() : null)
const dateOrNull = (value: string | null) => (value ? new Date(value) : null)

// --- File de validation ----------------------------------------------------------------------------------------------

type Requested = { x: number; y: number; kind: ResourcePointKind } | null

/**
 * Situation demandée par un groupe de signalements : « Mal placé » → moyenne des positions proposées ; « Mauvais
 * type » → type le plus demandé (à égalité, le premier demandé) ; « N'existe plus » → rien (`null`).
 */
export function requestedByGroup(point: { x: number; y: number; kind: string }, group: Pick<QueueReportGroup, 'kind' | 'reports'>): Requested {
  const current = parseResourcePointKind(point.kind)
  if (!current) return null
  if (group.kind === 'misplaced') {
    const positions = group.reports.flatMap((report) =>
      typeof report.proposedX === 'number' && typeof report.proposedY === 'number' && Number.isFinite(report.proposedX) && Number.isFinite(report.proposedY)
        ? [{ x: report.proposedX, y: report.proposedY }]
        : []
    )
    if (!positions.length) return null
    return {
      x: roundMeters(positions.reduce((sum, position) => sum + position.x, 0) / positions.length),
      y: roundMeters(positions.reduce((sum, position) => sum + position.y, 0) / positions.length),
      kind: current,
    }
  }
  if (group.kind === 'wrong_kind') {
    const tally = new Map<ResourcePointKind, number>()
    for (const report of group.reports) {
      const kind = parseResourcePointKind(report.proposedKind)
      if (kind) tally.set(kind, (tally.get(kind) ?? 0) + 1)
    }
    let best: ResourcePointKind | null = null
    for (const [kind, count] of tally) if (best === null || count > (tally.get(best) ?? 0)) best = kind
    return best ? { x: point.x, y: point.y, kind: best } : null
  }
  return null
}

const placed = (map: ResourceMapDefinition, x: number, y: number, kind: ResourcePointKind) => ({ x, y, kind, grid: gridLabel(map, x, y) })

/** `GET /api/resources/admin/queue` — toutes cartes confondues, du plus ancien au plus récent. */
export async function getResourceQueue(viewer: ResourceViewer): Promise<ResourceQueueResponse> {
  requireResourceSuperUser(viewer)
  const [rows, validatedByMap, mapStates] = await Promise.all([
    loadQueueRows(),
    prisma.resourcePoint.groupBy({ by: ['mapName'], where: { status: 'validated' }, _count: { _all: true } }),
    prisma.resourceMapState.findMany(),
  ])

  const userIds = new Set<number>()
  for (const point of rows.proposals) if (point.createdByUserId !== null) userIds.add(point.createdByUserId)
  for (const group of rows.groups) for (const report of group.reports) userIds.add(report.userId)
  const people = await resolveContributors(userIds)
  const person = (id: number): ResourceContributor => people.get(id) ?? { name: UNKNOWN_PLAYER_NAME, validatedCount: 0 }

  const items: ResourceQueueItem[] = []
  for (const point of rows.proposals) {
    const map = resourceMap(point.mapName)
    const kind = parseResourcePointKind(point.kind)
    if (!map || !kind) continue
    items.push({
      id: `point:${point.id}`,
      type: 'proposal',
      map: map.key,
      mapLabel: map.label,
      pointId: point.id,
      kind,
      reportKind: null,
      before: null,
      after: placed(map, point.x, point.y, kind),
      authors: point.createdByUserId === null ? [] : [person(point.createdByUserId)],
      comments: point.comment?.trim() ? [point.comment.trim()] : [],
      createdAt: point.createdAt.toISOString(),
      reportIds: [point.id],
    })
  }
  for (const group of rows.groups) {
    const point = rows.pointsById.get(group.pointId)
    const map = point ? resourceMap(point.mapName) : null
    const kind = point ? parseResourcePointKind(point.kind) : null
    const reportKind = parseResourceReportKind(group.kind)
    if (!point || !map || !kind || !reportKind) continue
    const requested = requestedByGroup(point, group)
    items.push({
      id: `report:${point.id}:${reportKind}`,
      type: 'report',
      map: map.key,
      mapLabel: map.label,
      pointId: point.id,
      kind,
      reportKind,
      before: placed(map, point.x, point.y, kind),
      after: requested ? placed(map, requested.x, requested.y, requested.kind) : null,
      authors: [...new Set(group.reports.map((report) => report.userId))].map(person),
      comments: group.reports.flatMap((report) => (report.comment?.trim() ? [report.comment.trim()] : [])),
      createdAt: group.reports[0].createdAt.toISOString(),
      reportIds: group.reports.map((report) => report.id),
    })
  }
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

  const validatedCounts = new Map(validatedByMap.map((row) => [row.mapName, row._count._all]))
  const states = new Map(mapStates.map((state) => [state.mapName, state]))
  const maps: ResourceMapSummary[] = RESOURCE_MAPS.map((map) => ({
    key: map.key,
    label: map.label,
    validatedPoints: validatedCounts.get(map.key) ?? 0,
    verifiedAt: isoOrNull(states.get(map.key)?.verifiedAt),
    recheckSince: isoOrNull(states.get(map.key)?.recheckSince),
  }))

  return { items, maps, pendingCount: items.length }
}

// --- Décisions -------------------------------------------------------------------------------------------------------

type DecisionTarget = { type: 'proposal'; pointId: string } | { type: 'report'; pointId: string; reportKind: ResourceReportKind }

export function parseQueueItemId(value: unknown): DecisionTarget | null {
  if (typeof value !== 'string' || value.length > 120) return null
  const proposal = /^point:([^:\s]+)$/.exec(value)
  if (proposal) return { type: 'proposal', pointId: proposal[1] }
  const report = /^report:([^:\s]+):([a-z_]+)$/.exec(value)
  const reportKind = report ? parseResourceReportKind(report[2]) : null
  return report && reportKind ? { type: 'report', pointId: report[1], reportKind } : null
}

/** `edit` : type et/ou position corrigés, chacun facultatif mais contrôlé. */
function parseEdit(map: ResourceMapDefinition, input: Record<string, unknown>) {
  let kind: ResourcePointKind | null = null
  if (input.kind !== undefined && input.kind !== null) {
    kind = parseResourcePointKind(input.kind)
    if (!kind) throw new ResourceError('invalid_kind', 400, 'Type corrigé inconnu.')
  }
  const hasX = input.x !== undefined && input.x !== null
  const hasY = input.y !== undefined && input.y !== null
  if (hasX !== hasY) throw new ResourceError('invalid_body', 400, 'Position corrigée incomplète : x et y sont requis ensemble.')
  return { kind, position: hasX ? parsePosition(map, input.x, input.y) : null }
}

async function recordAction(
  tx: Db,
  input: { actorUserId: number; action: ResourceActionType; mapName: string; pointId: string | null; before: ResourceActionState; after: ResourceActionState; label: ResourceActionLabel; now: Date }
) {
  const row = await tx.resourceAction.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      mapName: input.mapName,
      pointId: input.pointId,
      summary: actionSummary(input.action, input.label),
      before: input.before as Prisma.InputJsonObject,
      after: { ...input.after, label: input.label } as Prisma.InputJsonObject,
      createdAt: input.now,
    },
    select: { id: true },
  })
  return row.id
}

const alreadyDecided = (message = 'Déjà traité par un autre SuperUser.') => new ResourceError('already_decided', 409, message)

async function decideProposal(tx: Db, actorUserId: number, pointId: string, decision: string, input: Record<string, unknown>, now: Date) {
  const point = await tx.resourcePoint.findUnique({ where: { id: pointId } })
  if (!point) throw new ResourceError('not_found', 404, 'Proposition introuvable.')
  if (point.status !== 'pending') throw alreadyDecided('Proposition déjà traitée.')
  const map = requireResourceMap(point.mapName)

  let action: ResourceActionType
  let data: Prisma.ResourcePointUncheckedUpdateManyInput
  if (decision === 'refuse') {
    action = 'refuse_point'
    data = { status: 'rejected' }
  } else {
    const edit = decision === 'edit' ? parseEdit(map, input) : { kind: null, position: null }
    action = decision === 'edit' ? 'edit_point' : 'validate_point'
    data = { status: 'validated', validatedByUserId: actorUserId, validatedAt: now, lastConfirmedAt: now, ...(edit.kind ? { kind: edit.kind } : {}), ...(edit.position ?? {}) }
  }

  const updated = await tx.resourcePoint.updateMany({ where: { id: pointId, status: 'pending' }, data })
  if (updated.count !== 1) throw alreadyDecided('Proposition déjà traitée.')
  const next = await tx.resourcePoint.findUnique({ where: { id: pointId } })
  if (!next) throw alreadyDecided('Proposition déjà traitée.')

  const before = pointSnapshot(point)
  const after = pointSnapshot(next)
  const author = point.createdByUserId === null ? null : (await resolveUserNames([point.createdByUserId], tx)).get(point.createdByUserId)
  const label = { object: pointObject(before, after), detail: author ? `Proposée par ${author}` : null }
  return recordAction(tx, { actorUserId, action, mapName: point.mapName, pointId, before: { point: before }, after: { point: after }, label, now })
}

async function decideReports(tx: Db, actorUserId: number, pointId: string, reportKind: ResourceReportKind, decision: string, input: Record<string, unknown>, now: Date) {
  const reports = await tx.resourceReport.findMany({ where: { pointId, kind: reportKind, status: 'pending' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  if (!reports.length) throw new ResourceError('not_found', 404, 'Signalements introuvables ou déjà traités.')
  const point = await tx.resourcePoint.findUnique({ where: { id: pointId } })
  if (!point || point.status !== 'validated') throw alreadyDecided('Le point n’est plus sur la carte.')
  const map = requireResourceMap(point.mapName)
  const ids = reports.map((report) => report.id)
  const firstAuthor = (await resolveUserNames([reports[0].userId], tx)).get(reports[0].userId) ?? null
  const detail = reportsDetail(reports.length, firstAuthor)
  const resolved = { resolvedByUserId: actorUserId, resolvedAt: now }

  if (decision === 'refuse') {
    const refused = await tx.resourceReport.updateMany({ where: { id: { in: ids }, status: 'pending' }, data: { status: 'refused', ...resolved } })
    if (refused.count !== ids.length) throw alreadyDecided()
    const after = await tx.resourceReport.findMany({ where: { id: { in: ids } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    return recordAction(tx, {
      actorUserId,
      action: 'refuse_report',
      mapName: point.mapName,
      pointId,
      before: { reports: reports.map(reportSnapshot) },
      after: { reports: after.map(reportSnapshot) },
      label: { object: reportObject(reportKind, point), detail },
      now,
    })
  }

  let change: { status?: 'removed'; kind?: ResourcePointKind; x?: number; y?: number }
  if (decision === 'edit') {
    const edit = parseEdit(map, input)
    if (!edit.kind && !edit.position) throw new ResourceError('invalid_body', 400, 'Correction vide : indique un type ou une position.')
    change = { ...(edit.kind ? { kind: edit.kind } : {}), ...(edit.position ?? {}) }
  } else if (reportKind === 'missing') {
    change = { status: 'removed' }
  } else {
    const requested = requestedByGroup(point, { kind: reportKind, reports })
    if (!requested) throw new ResourceError('nothing_to_apply', 409, 'Demande illisible : utilise « Modifier » pour corriger le point.')
    change = reportKind === 'misplaced' ? { x: requested.x, y: requested.y } : { kind: requested.kind }
  }

  const removed = change.status === 'removed'
  const moved = change.x !== undefined && (change.x !== point.x || change.y !== point.y)
  const retyped = change.kind !== undefined && change.kind !== point.kind
  if (!removed && !moved && !retyped) throw new ResourceError('nothing_to_apply', 409, 'Rien à changer : le point est déjà ainsi.')
  const action: ResourceActionType = removed ? 'remove_point' : moved && retyped ? 'correct_point' : moved ? 'move_point' : 'change_kind'

  // Point retiré : les autres signalements en attente sur lui n'ont plus d'objet (annulés, restaurés par « Annuler »).
  const others = removed ? await tx.resourceReport.findMany({ where: { pointId, status: 'pending', id: { notIn: ids } } }) : []
  const otherIds = others.map((report) => report.id)

  const pointUpdate = await tx.resourcePoint.updateMany({ where: { id: pointId, status: 'validated' }, data: change })
  if (pointUpdate.count !== 1) throw alreadyDecided('Le point n’est plus sur la carte.')
  const accepted = await tx.resourceReport.updateMany({ where: { id: { in: ids }, status: 'pending' }, data: { status: 'accepted', ...resolved } })
  if (accepted.count !== ids.length) throw alreadyDecided()
  if (otherIds.length) {
    const cancelled = await tx.resourceReport.updateMany({ where: { id: { in: otherIds }, status: 'pending' }, data: { status: 'cancelled', ...resolved } })
    if (cancelled.count !== otherIds.length) throw alreadyDecided()
  }

  const next = await tx.resourcePoint.findUnique({ where: { id: pointId } })
  const touched = await tx.resourceReport.findMany({ where: { id: { in: [...ids, ...otherIds] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  if (!next) throw alreadyDecided('Le point n’est plus sur la carte.')
  const before = pointSnapshot(point)
  const after = pointSnapshot(next)
  return recordAction(tx, {
    actorUserId,
    action,
    mapName: point.mapName,
    pointId,
    before: { point: before, reports: [...reports, ...others].map(reportSnapshot) },
    after: { point: after, reports: touched.map(reportSnapshot) },
    label: { object: pointObject(before, after), detail },
    now,
  })
}

async function applyDecision(actorUserId: number, raw: unknown, now: Date) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ResourceError('invalid_body', 400, 'Décision illisible.')
  const input = raw as Record<string, unknown>
  const target = parseQueueItemId(input.itemId)
  if (!target) throw new ResourceError('not_found', 404, 'Ligne de la file inconnue.')
  const decision = input.decision
  if (decision !== 'validate' && decision !== 'refuse' && decision !== 'edit') {
    throw new ResourceError('invalid_body', 400, 'Décision inconnue (validate, refuse ou edit).')
  }
  return prisma.$transaction((tx) =>
    target.type === 'proposal'
      ? decideProposal(tx, actorUserId, target.pointId, decision, input, now)
      : decideReports(tx, actorUserId, target.pointId, target.reportKind, decision, input, now)
  )
}

/**
 * `POST /api/resources/admin/decisions` — chaque ligne dans sa propre transaction : une ligne inconnue, déjà traitée
 * ou invalide donne `ok: false` sans arrêter le lot.
 */
export async function applyResourceDecisions(viewer: ResourceViewer, body: Record<string, unknown>, now: Date = new Date()): Promise<ResourceDecisionsResponse> {
  const user = requireResourceSuperUser(viewer)
  const decisions = body.decisions
  if (!Array.isArray(decisions) || decisions.length === 0) throw new ResourceError('invalid_body', 400, 'Aucune décision envoyée.')
  if (decisions.length > RESOURCE_MAX_DECISIONS) throw new ResourceError('invalid_body', 400, `${RESOURCE_MAX_DECISIONS} décisions au plus par envoi.`)

  const results: ResourceDecisionsResponse['results'] = []
  for (const raw of decisions) {
    const itemId = raw && typeof raw === 'object' && typeof (raw as { itemId?: unknown }).itemId === 'string' ? (raw as { itemId: string }).itemId : ''
    try {
      const actionId = await applyDecision(user.userId, raw, now)
      results.push({ itemId, ok: true, actionId, error: null })
    } catch (error) {
      if (!(error instanceof ResourceError)) console.error('[resources/admin/decisions] Décision non enregistrée :', itemId, error)
      results.push({ itemId, ok: false, actionId: null, error: error instanceof ResourceError ? error.message : 'Erreur interne : décision non enregistrée.' })
    }
  }
  return { results, pendingCount: await countQueue() }
}

// --- Cartes ----------------------------------------------------------------------------------------------------------

/**
 * `POST /api/resources/admin/maps/:map` — `recheck` : la carte passe « à revérifier » (`recheckSince = now`, ses points
 * validés deviennent « à confirmer ») ; `verify` : vérifiée (`verifiedAt = now`, `recheckSince = null`).
 */
export async function updateResourceMapState(viewer: ResourceViewer, mapKey: unknown, body: Record<string, unknown>, now: Date = new Date()): Promise<{ map: ResourceMapSummary }> {
  const user = requireResourceSuperUser(viewer)
  const map = requireResourceMap(mapKey)
  const kind = body.action
  if (kind !== 'recheck' && kind !== 'verify') throw new ResourceError('invalid_action', 400, 'Action inconnue (recheck ou verify).')

  const summary = await prisma.$transaction(async (tx) => {
    const current = await tx.resourceMapState.findUnique({ where: { mapName: map.key } })
    const data = kind === 'recheck' ? { recheckSince: now } : { verifiedAt: now, recheckSince: null }
    const next = await tx.resourceMapState.upsert({
      where: { mapName: map.key },
      create: { mapName: map.key, ...data, updatedByUserId: user.userId },
      update: { ...data, updatedByUserId: user.userId },
    })
    const validatedPoints = await tx.resourcePoint.count({ where: { mapName: map.key, status: 'validated' } })
    const label: ResourceActionLabel =
      kind === 'recheck'
        ? { object: pointsCountLabel(validatedPoints), detail: `Mise à jour PUBG du ${shortDate(now)}` }
        : { object: map.label, detail: 'Tous les points confirmés' }
    await recordAction(tx, {
      actorUserId: user.userId,
      action: kind === 'recheck' ? 'recheck_map' : 'verify_map',
      mapName: map.key,
      pointId: null,
      before: { map: mapSnapshot(map.key, current) },
      after: { map: mapSnapshot(map.key, next) },
      label,
      now,
    })
    return { key: map.key, label: map.label, validatedPoints, verifiedAt: isoOrNull(next.verifiedAt), recheckSince: isoOrNull(next.recheckSince) }
  })
  return { map: summary }
}

// --- Historique ------------------------------------------------------------------------------------------------------

/** État actuel des lignes citées par des `after` (une requête par table). */
async function loadCurrentStates(db: Db, states: ResourceActionState[]) {
  const pointIds = [...new Set(states.flatMap((state) => (state.point ? [state.point.id] : [])))]
  const reportIds = [...new Set(states.flatMap((state) => state.reports?.map((report) => report.id) ?? []))]
  const mapNames = [...new Set(states.flatMap((state) => (state.map ? [state.map.mapName] : [])))]
  const [points, reports, maps] = await Promise.all([
    pointIds.length ? db.resourcePoint.findMany({ where: { id: { in: pointIds } } }) : Promise.resolve([]),
    reportIds.length ? db.resourceReport.findMany({ where: { id: { in: reportIds } } }) : Promise.resolve([]),
    mapNames.length ? db.resourceMapState.findMany({ where: { mapName: { in: mapNames } } }) : Promise.resolve([]),
  ])
  const pointsById = new Map(points.map((point) => [point.id, point]))
  const reportsById = new Map(reports.map((report) => [report.id, report]))
  const mapsByName = new Map(maps.map((state) => [state.mapName, state]))

  return (expected: ResourceActionState): ResourceActionState => {
    const point = expected.point ? pointsById.get(expected.point.id) : undefined
    return {
      ...(point ? { point: pointSnapshot(point) } : {}),
      ...(expected.reports ? { reports: expected.reports.flatMap((report) => (reportsById.has(report.id) ? [reportSnapshot(reportsById.get(report.id)!)] : [])) } : {}),
      ...(expected.map ? { map: mapSnapshot(expected.map.mapName, mapsByName.get(expected.map.mapName) ?? null) } : {}),
    }
  }
}

type ActionRow = { id: string; action: string; after: Prisma.JsonValue | null; undoneAt: Date | null }

const canBeUndone = (row: ActionRow) => row.undoneAt === null && row.action !== 'undo'

/** Actions encore annulables : non annulées, et lignes touchées encore dans leur état d'après. */
async function undoableIds(db: Db, rows: ActionRow[]) {
  const candidates = rows.filter(canBeUndone).map((row) => ({ id: row.id, after: parseActionState(row.after) }))
  if (!candidates.length) return new Set<string>()
  const currentOf = await loadCurrentStates(db, candidates.map((candidate) => candidate.after))
  return new Set(candidates.filter((candidate) => actionStateMatches(candidate.after, currentOf(candidate.after))).map((candidate) => candidate.id))
}

/** `GET /api/resources/admin/history?page=` — 30 derniers jours, plus récentes d'abord, pages de 7. */
export async function getResourceHistory(viewer: ResourceViewer, pageParam: string | null, now: Date = new Date()): Promise<ResourceHistoryResponse> {
  requireResourceSuperUser(viewer)
  const where = { createdAt: { gte: new Date(now.getTime() - RESOURCE_HISTORY_WINDOW_DAYS * 86_400_000) } }
  const total = await prisma.resourceAction.count({ where })
  const pageCount = Math.max(1, Math.ceil(total / RESOURCE_HISTORY_PAGE_SIZE))
  const requested = Number(pageParam)
  const page = Math.min(pageCount, Number.isInteger(requested) && requested >= 1 ? requested : 1)

  const rows = await prisma.resourceAction.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: (page - 1) * RESOURCE_HISTORY_PAGE_SIZE,
    take: RESOURCE_HISTORY_PAGE_SIZE,
  })
  const [names, undoable] = await Promise.all([
    resolveUserNames(rows.flatMap((row) => (row.actorUserId === null ? [] : [row.actorUserId]))),
    undoableIds(prisma, rows),
  ])

  const entries: ResourceHistoryEntry[] = rows.map((row) => {
    const label = parseActionState(row.after).label
    return {
      id: row.id,
      at: row.createdAt.toISOString(),
      actor: row.actorUserId === null ? 'Un SuperUser' : (names.get(row.actorUserId) ?? UNKNOWN_PLAYER_NAME),
      verb: resourceActionVerb(row.action),
      object: label?.object ?? row.summary,
      detail: label?.detail ?? null,
      mapLabel: resourceMap(row.mapName)?.label ?? row.mapName,
      undoable: undoable.has(row.id),
      undoneAt: isoOrNull(row.undoneAt),
    }
  })
  return { entries, page, pageCount, total, windowDays: RESOURCE_HISTORY_WINDOW_DAYS }
}

// --- Annulation ------------------------------------------------------------------------------------------------------

const modified = () => new ResourceError('modified', 409, 'Impossible d’annuler : modifié depuis cette décision.')

/**
 * Restaure les champs que la décision avait changés (`before` ≠ `after`), à condition que la ligne soit encore dans son
 * état d'après — un « Toujours là » postérieur est gardé.
 */
async function restoreState(tx: Db, before: ResourceActionState, after: ResourceActionState, actorUserId: number) {
  if (before.point && after.point) {
    const from = after.point
    const to = before.point
    const data: Prisma.ResourcePointUncheckedUpdateManyInput = {}
    if (to.kind !== from.kind) data.kind = to.kind
    if (to.x !== from.x) data.x = to.x
    if (to.y !== from.y) data.y = to.y
    if (to.status !== from.status) data.status = to.status
    if (to.validatedByUserId !== from.validatedByUserId) data.validatedByUserId = to.validatedByUserId
    if (to.validatedAt !== from.validatedAt) data.validatedAt = dateOrNull(to.validatedAt)
    if (to.lastConfirmedAt !== from.lastConfirmedAt) data.lastConfirmedAt = dateOrNull(to.lastConfirmedAt)
    if (Object.keys(data).length) {
      const updated = await tx.resourcePoint.updateMany({ where: { id: from.id, status: from.status, kind: from.kind }, data })
      if (updated.count !== 1) throw modified()
    }
  }

  const afterReports = new Map((after.reports ?? []).map((report) => [report.id, report]))
  for (const to of before.reports ?? []) {
    const from = afterReports.get(to.id)
    if (!from || from.status === to.status) continue
    const updated = await tx.resourceReport.updateMany({
      where: { id: to.id, status: from.status },
      data: { status: to.status, resolvedByUserId: to.resolvedByUserId, resolvedAt: dateOrNull(to.resolvedAt) },
    })
    if (updated.count !== 1) throw modified()
  }

  if (before.map && after.map) {
    const data: Prisma.ResourceMapStateUpdateInput = {}
    if (before.map.verifiedAt !== after.map.verifiedAt) data.verifiedAt = dateOrNull(before.map.verifiedAt)
    if (before.map.recheckSince !== after.map.recheckSince) data.recheckSince = dateOrNull(before.map.recheckSince)
    if (Object.keys(data).length) {
      await tx.resourceMapState.upsert({
        where: { mapName: before.map.mapName },
        create: { mapName: before.map.mapName, verifiedAt: dateOrNull(before.map.verifiedAt), recheckSince: dateOrNull(before.map.recheckSince), updatedByUserId: actorUserId },
        update: { ...data, updatedByUserId: actorUserId },
      })
    }
  }
}

const withoutLabel = ({ point, reports, map }: ResourceActionState): ResourceActionState => ({
  ...(point ? { point } : {}),
  ...(reports ? { reports } : {}),
  ...(map ? { map } : {}),
})

/**
 * `POST /api/resources/admin/history/:id/undo` — restaure l'état d'avant si rien n'a changé depuis (`409` sinon), marque
 * l'action annulée et écrit une entrée « a annulé », le tout dans une transaction. Une annulation ne s'annule pas.
 */
export async function undoResourceAction(viewer: ResourceViewer, actionId: string, now: Date = new Date()) {
  const user = requireResourceSuperUser(viewer)
  await prisma.$transaction(async (tx) => {
    const action = await tx.resourceAction.findUnique({ where: { id: actionId } })
    if (!action) throw new ResourceError('not_found', 404, 'Action introuvable.')
    if (action.action === 'undo') throw new ResourceError('not_undoable', 409, 'Une annulation ne s’annule pas.')
    if (action.undoneAt) throw new ResourceError('already_undone', 409, 'Cette action a déjà été annulée.')

    const before = withoutLabel(parseActionState(action.before))
    const stored = parseActionState(action.after)
    const after = withoutLabel(stored)
    const current = (await loadCurrentStates(tx, [after]))(after)
    if (!actionStateMatches(after, current)) throw modified()

    await restoreState(tx, before, after, user.userId)
    const marked = await tx.resourceAction.updateMany({ where: { id: action.id, undoneAt: null }, data: { undoneAt: now, undoneByUserId: user.userId } })
    if (marked.count !== 1) throw new ResourceError('already_undone', 409, 'Cette action a déjà été annulée.')

    const restoredOf = await loadCurrentStates(tx, [before])
    const actor = action.actorUserId === null ? 'Un SuperUser' : ((await resolveUserNames([action.actorUserId], tx)).get(action.actorUserId) ?? UNKNOWN_PLAYER_NAME)
    await recordAction(tx, {
      actorUserId: user.userId,
      action: 'undo',
      mapName: action.mapName,
      pointId: action.pointId,
      before: current,
      after: restoredOf(before),
      label: { object: stored.label?.object ?? action.summary, detail: undoDetail(action.action, actor, action.createdAt) },
      now,
    })
  })
  return { ok: true as const }
}
