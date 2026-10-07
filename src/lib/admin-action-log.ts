import { Prisma } from '@prisma/client'

import { adminActorOf, type AdminActor } from '@/lib/auth/admin-actor'
import { prisma } from '@/lib/prisma'

/**
 * Journal des actions d'administration (docs/TODO/administration.md Q10, lot 3c).
 *
 * Chaque route d'écriture d'administration exporte son handler enveloppé : `export const POST =
 * withAdminActionLog('clans/[clanId]/telemetry/sync-selected', handlePost)`. Une ligne est écrite après la réponse,
 * réussie ou en erreur ; les refus (401, 403), les simulations (`validateOnly`, `dryRun`, `mode: 'preview'` dans la
 * réponse) et les requêtes sans acteur (appel interne du cron) ne sont pas notés.
 * L'écriture du journal ne bloque jamais l'action : une base indisponible ou une table absente (migration pas encore
 * appliquée) laisse passer la réponse, avec un avertissement dans les journaux du serveur.
 *
 * Conservation : 12 mois, purge par la maintenance nocturne (`purgeExpiredAdminActions`).
 */

export const ADMIN_ACTION_LOG_RETENTION_DAYS = 365

const MAX_RESULT_FIELDS = 12
const MAX_ERROR_LENGTH = 200

export type AdminActionOutcome = 'success' | 'error'

export type AdminActionSummary = {
  params?: Record<string, string>
  result?: Record<string, number | boolean>
  error?: string
}

export type AdminActionEntry = {
  userId: number
  memberId: number | null
  isSuperUser: boolean
  clanId: number | null
  action: string
  method: string
  status: number
  outcome: AdminActionOutcome
  summary: AdminActionSummary | null
}

type RouteContext = { params?: unknown } | undefined

/** Un refus n'est pas une action : il n'est pas journalisé (décision Q10 : écritures seulement). */
export function isJournaledStatus(status: number): boolean {
  return status !== 401 && status !== 403
}

/**
 * Une simulation n'écrit rien : la soirée de télémétrie interroge `resync-files-selected` en `validateOnly` à chaque
 * ouverture, l'ajout d'un joueur passe par un aperçu.
 */
export function isSimulationPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const record = payload as Record<string, unknown>
  return record.validateOnly === true || record.dryRun === true || record.mode === 'preview'
}

/** Résumé chiffré d'une réponse JSON : ses champs de premier niveau numériques ou booléens, et son erreur. */
export function summarizeResponsePayload(payload: unknown): Pick<AdminActionSummary, 'result' | 'error'> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
  const result: Record<string, number | boolean> = {}
  let error: string | undefined
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (key === 'error' && typeof value === 'string') {
      error = value.slice(0, MAX_ERROR_LENGTH)
      continue
    }
    if (Object.keys(result).length >= MAX_RESULT_FIELDS) continue
    if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean') result[key] = value
  }
  return {
    ...(Object.keys(result).length > 0 ? { result } : {}),
    ...(error ? { error } : {}),
  }
}

/** Paramètres d'adresse : `clanId` devient la colonne du clan, les autres vont au résumé. */
export function splitRouteParams(params: unknown): { clanId: number | null; params: Record<string, string> } {
  const rest: Record<string, string> = {}
  let clanId: number | null = null
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
      const text = Array.isArray(value) ? value.join('/') : typeof value === 'string' ? value : null
      if (text === null) continue
      if (key === 'clanId') {
        const parsed = Number(text)
        clanId = Number.isInteger(parsed) && parsed > 0 ? parsed : null
      } else {
        rest[key] = text.slice(0, 100)
      }
    }
  }
  return { clanId, params: rest }
}

export function buildAdminActionEntry(input: {
  actor: AdminActor
  action: string
  method: string
  status: number
  routeParams: unknown
  payload: unknown
}): AdminActionEntry {
  const { clanId, params } = splitRouteParams(input.routeParams)
  const summary: AdminActionSummary = {
    ...(Object.keys(params).length > 0 ? { params } : {}),
    ...summarizeResponsePayload(input.payload),
  }
  return {
    userId: input.actor.userId,
    memberId: input.actor.memberId,
    isSuperUser: input.actor.isSuperUser,
    clanId,
    action: input.action,
    method: input.method.toUpperCase(),
    status: input.status,
    outcome: input.status >= 400 ? 'error' : 'success',
    summary: Object.keys(summary).length > 0 ? summary : null,
  }
}

async function readRouteParams(context: RouteContext): Promise<unknown> {
  try {
    return (await context?.params) ?? null
  } catch {
    return null
  }
}

async function readJsonPayload(response: Response): Promise<unknown> {
  if (!(response.headers.get('content-type') ?? '').includes('application/json')) return null
  try {
    return await response.clone().json()
  } catch {
    return null
  }
}

export async function recordAdminAction(entry: AdminActionEntry): Promise<void> {
  try {
    await prisma.adminActionLog.create({
      data: { ...entry, summary: entry.summary ?? Prisma.JsonNull },
    })
  } catch (error) {
    console.warn('[admin-action-log] écriture du journal impossible', entry.action, error)
  }
}

/**
 * Enveloppe un handler de route d'écriture d'administration. `action` est le gabarit de la route sous `src/app/api/`
 * (vérifié par `src/lib/admin-action-log-routes.test.ts`).
 */
export function withAdminActionLog<R extends Request, C>(
  action: string,
  handler: (request: R, context: C) => Promise<Response>
): (request: R, context: C) => Promise<Response> {
  return async function journaledHandler(request: R, context: C): Promise<Response> {
    let response: Response
    try {
      response = await handler(request, context)
    } catch (error) {
      const actor = adminActorOf(request)
      if (actor) {
        await recordAdminAction(
          buildAdminActionEntry({
            actor,
            action,
            method: request.method,
            status: 500,
            routeParams: await readRouteParams(context as RouteContext),
            payload: { error: error instanceof Error ? error.message : String(error) },
          })
        )
      }
      throw error
    }

    const actor = adminActorOf(request)
    if (!actor || !isJournaledStatus(response.status)) return response
    const payload = await readJsonPayload(response)
    if (isSimulationPayload(payload)) return response
    await recordAdminAction(
      buildAdminActionEntry({
        actor,
        action,
        method: request.method,
        status: response.status,
        routeParams: await readRouteParams(context as RouteContext),
        payload,
      })
    )
    return response
  }
}

/** Purge des lignes de plus de 12 mois (maintenance nocturne). Renvoie le nombre de lignes supprimées. */
export async function purgeExpiredAdminActions(now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - ADMIN_ACTION_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const result = await prisma.adminActionLog.deleteMany({ where: { createdAt: { lt: before } } })
  return result.count
}

// ── Lecture (page Plateforme › Site › Journal d'administration, SuperUser) ─────────────────────────────────────────

export const ADMIN_ACTION_PAGE_SIZE = 50

export type AdminActionFilters = {
  clanId: number | null
  userId: number | null
  outcome: AdminActionOutcome | null
  page: number
}

function positiveInt(value: string | null): number | null {
  const parsed = Number(value)
  return value && Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function parseAdminActionFilters(searchParams: URLSearchParams): AdminActionFilters {
  const outcome = searchParams.get('outcome')
  return {
    clanId: positiveInt(searchParams.get('clanId')),
    userId: positiveInt(searchParams.get('userId')),
    outcome: outcome === 'success' || outcome === 'error' ? outcome : null,
    page: positiveInt(searchParams.get('page')) ?? 1,
  }
}

export type AdminActionRow = {
  id: number
  createdAt: string
  action: string
  method: string
  status: number
  outcome: string
  isSuperUser: boolean
  clanId: number | null
  clanName: string | null
  userId: number | null
  userLabel: string | null
  memberId: number | null
  memberName: string | null
  summary: AdminActionSummary | null
}

export type AdminActionPage = {
  rows: AdminActionRow[]
  total: number
  page: number
  pageSize: number
  clans: Array<{ id: number; name: string }>
  users: Array<{ id: number; label: string }>
}

function userLabelOf(user: { email: string; displayName: string | null }) {
  return user.displayName ? `${user.displayName} (${user.email})` : user.email
}

export async function listAdminActions(filters: AdminActionFilters): Promise<AdminActionPage> {
  const where = {
    ...(filters.clanId ? { clanId: filters.clanId } : {}),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.outcome ? { outcome: filters.outcome } : {}),
  }
  const [total, rows, clanGroups, userGroups] = await Promise.all([
    prisma.adminActionLog.count({ where }),
    prisma.adminActionLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (filters.page - 1) * ADMIN_ACTION_PAGE_SIZE,
      take: ADMIN_ACTION_PAGE_SIZE,
    }),
    prisma.adminActionLog.groupBy({ by: ['clanId'], where: { clanId: { not: null } } }),
    prisma.adminActionLog.groupBy({ by: ['userId'], where: { userId: { not: null } } }),
  ])

  const clanIds = clanGroups.map((group) => group.clanId).filter((id): id is number => id !== null)
  const userIds = userGroups.map((group) => group.userId).filter((id): id is number => id !== null)
  const memberIds = [...new Set(rows.map((row) => row.memberId).filter((id): id is number => id !== null))]
  const [clans, users, members] = await Promise.all([
    prisma.clan.findMany({ where: { id: { in: clanIds } }, select: { id: true, name: true } }),
    prisma.userAccount.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, displayName: true } }),
    prisma.clanMember.findMany({ where: { id: { in: memberIds } }, select: { id: true, displayName: true } }),
  ])
  const clanName = new Map(clans.map((clan) => [clan.id, clan.name]))
  const userLabel = new Map(users.map((user) => [user.id, userLabelOf(user)]))
  const memberName = new Map(members.map((member) => [member.id, member.displayName]))

  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      method: row.method,
      status: row.status,
      outcome: row.outcome,
      isSuperUser: row.isSuperUser,
      clanId: row.clanId,
      clanName: row.clanId ? (clanName.get(row.clanId) ?? null) : null,
      userId: row.userId,
      userLabel: row.userId ? (userLabel.get(row.userId) ?? null) : null,
      memberId: row.memberId,
      memberName: row.memberId ? (memberName.get(row.memberId) ?? null) : null,
      summary: (row.summary as AdminActionSummary | null) ?? null,
    })),
    total,
    page: filters.page,
    pageSize: ADMIN_ACTION_PAGE_SIZE,
    clans: [...clanName].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    users: [...userLabel].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'fr')),
  }
}

/** Table absente : la migration `20261007200000_add_admin_action_log` n'est pas encore appliquée. */
export function isMissingAdminActionTable(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2021'
}
