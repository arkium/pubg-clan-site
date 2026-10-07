import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthSessionContext } from '@/lib/auth-session'

/**
 * Lot 1 de docs/TODO/administration.md : chaque route d'administration modifiée refuse l'appel anonyme (401),
 * l'Owner d'un autre clan (403) et, pour les routes Plateforme ou les outils de télémétrie verrouillés, l'Owner du
 * clan lui-même (403). Le SuperUser — y compris sans membre actif — est couvert par admin-guards.test.ts et
 * legacy-guards-superuser.test.ts.
 *
 * Prisma est ENTIÈREMENT simulé (la base de .env est la production) et le réseau coupé : si une garde laissait
 * passer, le handler tomberait sur ces simulations, jamais sur la base ni sur l'API PUBG.
 */

const state = vi.hoisted(() => ({ session: null as AuthSessionContext | null }))

// Membre 100 : Owner du clan 7 ; membre 200 : Owner du clan 8
const MEMBERS: Record<number, { id: number; clanId: number; isActive: boolean }> = {
  100: { id: 100, clanId: 7, isActive: true },
  200: { id: 200, clanId: 8, isActive: true },
}
const OWNER_MEMBER_IDS = new Set([100, 200])

vi.mock('@/lib/auth-session', () => ({
  getSessionFromRequest: async () => state.session,
  getSessionTokenFromRequest: () => null,
}))

vi.mock('@/lib/prisma', () => {
  const fallback = () => async () => null
  const model = (overrides: Record<string, unknown> = {}) =>
    new Proxy(overrides, { get: (target, key: string) => (key in target ? target[key] : fallback()) })
  const models: Record<string, unknown> = {
    userAccount: model({ findUnique: async () => ({ isSuperUser: state.session?.isSuperUser === true }) }),
    clanMember: model({
      findUnique: async ({ where }: { where: { id: number } }) => MEMBERS[where.id] ?? null,
    }),
    clanMemberRole: model({
      count: async ({ where }: { where: { memberId: number } }) => (OWNER_MEMBER_IDS.has(where.memberId) ? 1 : 0),
      findMany: async ({ where }: { where: { memberId: number } }) =>
        OWNER_MEMBER_IDS.has(where.memberId) ? [{ role: { permissions: { '*': true } } }] : [],
    }),
  }
  const prisma = new Proxy(models, { get: (target, key: string) => (key in target ? target[key] : model()) })
  return { prisma }
})

import { PUT as putNavPermissions } from '@/app/api/settings/nav-permissions/route'
import { GET as getMapLabels, PUT as putMapLabels } from '@/app/api/settings/map-labels/route'
import { GET as getWeaponLabels, PUT as putWeaponLabels } from '@/app/api/settings/weapon-labels/route'
import { GET as getPhaseLabels, PUT as putPhaseLabels } from '@/app/api/settings/phase-labels/route'
import { GET as getMapLocations, PUT as putMapLocations } from '@/app/api/settings/map-locations/route'
import {
  DELETE as deleteEmailDelivery,
  GET as getEmailDelivery,
  POST as postEmailDelivery,
} from '@/app/api/settings/email-delivery/route'
import { GET as getOpponentStatsCron } from '@/app/api/cron/opponent-stats/route'
import { GET as getMatch, POST as postMatch } from '@/app/api/matches/[matchId]/route'
import { POST as postMembers } from '@/app/api/members/route'
import {
  DELETE as deleteCronControl,
  GET as getCronControl,
  POST as postCronControl,
} from '@/app/api/clans/[clanId]/cron-control/route'
import { GET as getRuntimeStatus } from '@/app/api/clans/[clanId]/dev/runtime-status/route'
import { POST as postSyncStats } from '@/app/api/clans/[clanId]/sync-stats/route'
import { GET as getQueueCleanup, POST as postQueueCleanup } from '@/app/api/clans/[clanId]/telemetry/queue-cleanup/route'
import {
  GET as getRecalcBatch,
  POST as postRecalcBatch,
} from '@/app/api/clans/[clanId]/telemetry/recalc-aggregates-batch/route'
import { POST as postBackfillNullJson } from '@/app/api/clans/[clanId]/telemetry/backfill-null-json/route'
import { POST as postClearSelected } from '@/app/api/clans/[clanId]/telemetry/clear-selected/route'
import { GET as getDeadLetter, POST as postDeadLetter } from '@/app/api/clans/[clanId]/telemetry/dead-letter/route'
import { POST as postFetchFilesSelected } from '@/app/api/clans/[clanId]/telemetry/fetch-files-selected/route'
import { POST as postImportFile } from '@/app/api/clans/[clanId]/telemetry/import-file/route'
import { GET as getMetrics } from '@/app/api/clans/[clanId]/telemetry/metrics/route'
import { GET as getObservability } from '@/app/api/clans/[clanId]/telemetry/observability/route'
import { GET as getRecoveries, POST as postRecoveries } from '@/app/api/clans/[clanId]/telemetry/recoveries/route'
import { POST as postResyncFilesQueue } from '@/app/api/clans/[clanId]/telemetry/resync-files-queue/route'
import { POST as postResyncFilesSelected } from '@/app/api/clans/[clanId]/telemetry/resync-files-selected/route'
import {
  GET as getSyncBatchManual,
  POST as postSyncBatchManual,
} from '@/app/api/clans/[clanId]/telemetry/sync-batch-manual/route'
import { POST as postSyncSelected } from '@/app/api/clans/[clanId]/telemetry/sync-selected/route'
import {
  GET as getSyncSelectedEnqueue,
  POST as postSyncSelectedEnqueue,
} from '@/app/api/clans/[clanId]/telemetry/sync-selected-enqueue/route'
import { DELETE as deleteInvite, POST as postInvite } from '@/app/api/clans/[clanId]/members/[memberId]/invite/route'
import { POST as postApprove } from '@/app/api/clans/[clanId]/members/[memberId]/approve/route'
import { POST as postReject } from '@/app/api/clans/[clanId]/members/[memberId]/reject/route'
import { GET as getClanMembers } from '@/app/api/clans/[clanId]/members/route'
import { GET as getDiscordSettings, PUT as putDiscordSettings } from '@/app/api/clans/[clanId]/settings/discord/route'
import { POST as postDiscordTest } from '@/app/api/clans/[clanId]/settings/discord/test/route'
import { PUT as putLoginWelcome } from '@/app/api/clans/[clanId]/settings/login-welcome/route'
import { POST as postLoginWelcomeUpload } from '@/app/api/clans/[clanId]/settings/login-welcome/upload/route'
import { GET as getClanEmailStatus } from '@/app/api/clans/[clanId]/settings/email-delivery/route'
import { POST as postTournament } from '@/app/api/clans/[clanId]/tournaments/route'
import {
  DELETE as deleteTournament,
  PATCH as patchTournament,
} from '@/app/api/clans/[clanId]/tournaments/[tournamentId]/route'
import { POST as postTournamentDiscord } from '@/app/api/clans/[clanId]/tournaments/[tournamentId]/discord/route'
import { POST as postTournamentSync } from '@/app/api/clans/[clanId]/tournaments/[tournamentId]/sync/route'
import { GET as getEncounteredPlayers } from '@/app/api/clans/[clanId]/encountered-players/route'

type Handler = () => Promise<Response>

function req(path: string, method = 'GET', body: unknown = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  })
}

const clan = { params: Promise.resolve({ clanId: '7' }) }
const clanMember = { params: Promise.resolve({ clanId: '7', memberId: '5' }) }
const clanTournament = { params: Promise.resolve({ clanId: '7', tournamentId: 't1' }) }
const match = { params: Promise.resolve({ matchId: 'm1' }) }
const T = '/api/clans/7/telemetry'

// Routes Plateforme : SuperUser seulement
const PLATFORM_ROUTES: Array<[string, Handler]> = [
  ['PUT settings/nav-permissions', () => putNavPermissions(req('/api/settings/nav-permissions', 'PUT', { action: 'delete', navKey: 'x' }))],
  ['GET settings/map-labels', () => getMapLabels(req('/api/settings/map-labels'))],
  ['PUT settings/map-labels', () => putMapLabels(req('/api/settings/map-labels', 'PUT'))],
  ['GET settings/weapon-labels', () => getWeaponLabels(req('/api/settings/weapon-labels'))],
  ['PUT settings/weapon-labels', () => putWeaponLabels(req('/api/settings/weapon-labels', 'PUT'))],
  ['GET settings/phase-labels', () => getPhaseLabels(req('/api/settings/phase-labels'))],
  ['PUT settings/phase-labels', () => putPhaseLabels(req('/api/settings/phase-labels', 'PUT'))],
  ['GET settings/map-locations', () => getMapLocations(req('/api/settings/map-locations'))],
  ['PUT settings/map-locations', () => putMapLocations(req('/api/settings/map-locations', 'PUT'))],
  ['GET settings/email-delivery', () => getEmailDelivery(req('/api/settings/email-delivery'))],
  ['POST settings/email-delivery', () => postEmailDelivery(req('/api/settings/email-delivery', 'POST', { to: 'a@b.fr' }))],
  ['DELETE settings/email-delivery', () => deleteEmailDelivery(req('/api/settings/email-delivery', 'DELETE'))],
  ['GET cron/opponent-stats', () => getOpponentStatsCron(req('/api/cron/opponent-stats?force=true'))],
  ['GET matches/[matchId]', () => getMatch(req('/api/matches/m1?shard=steam&playerId=p') as never, match)],
  ['POST matches/[matchId]', () => postMatch(req('/api/matches/m1', 'POST', { memberId: 1, shard: 'steam', playerId: 'p' }) as never, match)],
  ['GET cron-control', () => getCronControl(req('/api/clans/7/cron-control'), clan)],
  ['POST cron-control', () => postCronControl(req('/api/clans/7/cron-control', 'POST', { action: 'sync_matches' }), clan)],
  ['DELETE cron-control', () => deleteCronControl(req('/api/clans/7/cron-control', 'DELETE'), clan)],
  ['GET dev/runtime-status', () => getRuntimeStatus(req('/api/clans/7/dev/runtime-status'), clan)],
  ['POST sync-stats', () => postSyncStats(req('/api/clans/7/sync-stats', 'POST') as never, clan)],
  ['GET queue-cleanup', () => getQueueCleanup(req(`${T}/queue-cleanup`) as never, clan)],
  ['POST queue-cleanup', () => postQueueCleanup(req(`${T}/queue-cleanup`, 'POST', { action: 'reorder-priority' }) as never, clan)],
  ['GET recalc-aggregates-batch', () => getRecalcBatch(req(`${T}/recalc-aggregates-batch`) as never, clan)],
  ['POST recalc-aggregates-batch', () => postRecalcBatch(req(`${T}/recalc-aggregates-batch`, 'POST', { scope: 'all-clans' }) as never, clan)],
]

// Outils de télémétrie d'un clan : fonctionnalité verrouillée au SuperUser (clan-telemetry-tools)
const TELEMETRY_TOOL_ROUTES: Array<[string, Handler]> = [
  ['POST backfill-null-json', () => postBackfillNullJson(req(`${T}/backfill-null-json`, 'POST') as never, clan)],
  ['POST clear-selected', () => postClearSelected(req(`${T}/clear-selected`, 'POST', { squadMatchIds: ['s'] }) as never, clan)],
  ['GET dead-letter', () => getDeadLetter(req(`${T}/dead-letter`) as never, clan)],
  ['POST dead-letter', () => postDeadLetter(req(`${T}/dead-letter`, 'POST') as never, clan)],
  ['POST fetch-files-selected', () => postFetchFilesSelected(req(`${T}/fetch-files-selected`, 'POST', { squadMatchIds: ['s'] }) as never, clan)],
  ['POST import-file', () => postImportFile(req(`${T}/import-file`, 'POST') as never, clan)],
  ['GET metrics', () => getMetrics(req(`${T}/metrics`) as never, clan)],
  ['GET observability', () => getObservability(req(`${T}/observability`) as never, clan)],
  ['GET recoveries', () => getRecoveries(req(`${T}/recoveries`) as never, clan)],
  ['POST recoveries', () => postRecoveries(req(`${T}/recoveries`, 'POST', { action: 'enqueue_backlog' }) as never, clan)],
  ['POST resync-files-queue', () => postResyncFilesQueue(req(`${T}/resync-files-queue`, 'POST', { squadMatchIds: ['s'] }) as never, clan)],
  ['POST resync-files-selected', () => postResyncFilesSelected(req(`${T}/resync-files-selected`, 'POST', { squadMatchIds: ['s'], resetBeforeSync: true }) as never, clan)],
  ['GET sync-batch-manual', () => getSyncBatchManual(req(`${T}/sync-batch-manual`) as never, clan)],
  ['POST sync-batch-manual', () => postSyncBatchManual(req(`${T}/sync-batch-manual`, 'POST') as never, clan)],
  ['POST sync-selected', () => postSyncSelected(req(`${T}/sync-selected`, 'POST', { squadMatchIds: ['s'] }) as never, clan)],
  ['GET sync-selected-enqueue', () => getSyncSelectedEnqueue(req(`${T}/sync-selected-enqueue`) as never, clan)],
  ['POST sync-selected-enqueue', () => postSyncSelectedEnqueue(req(`${T}/sync-selected-enqueue`, 'POST', { squadMatchIds: ['s'] }) as never, clan)],
]

// Fonctionnalités ouvertes aux Owners par défaut (ou réservées à l'Owner) : clan de l'adresse uniquement
const CLAN_OWNER_ROUTES: Array<[string, Handler]> = [
  ['POST invite', () => postInvite(req('/api/clans/7/members/5/invite', 'POST', { sendEmail: false }), clanMember)],
  ['DELETE invite', () => deleteInvite(req('/api/clans/7/members/5/invite', 'DELETE'), clanMember)],
  ['POST approve', () => postApprove(req('/api/clans/7/members/5/approve', 'POST'), clanMember)],
  ['POST reject', () => postReject(req('/api/clans/7/members/5/reject', 'POST'), clanMember)],
  ['GET clans/[id]/members', () => getClanMembers(req('/api/clans/7/members?status=pending'), clan)],
  ['GET settings/discord', () => getDiscordSettings(req('/api/clans/7/settings/discord'), clan)],
  ['PUT settings/discord', () => putDiscordSettings(req('/api/clans/7/settings/discord', 'PUT'), clan)],
  ['POST settings/discord/test', () => postDiscordTest(req('/api/clans/7/settings/discord/test', 'POST'), clan)],
  ['PUT settings/login-welcome', () => putLoginWelcome(req('/api/clans/7/settings/login-welcome', 'PUT'), clan)],
  ['POST settings/login-welcome/upload', () => postLoginWelcomeUpload(req('/api/clans/7/settings/login-welcome/upload', 'POST'), clan)],
  ['GET settings/email-delivery (statut)', () => getClanEmailStatus(req('/api/clans/7/settings/email-delivery'), clan)],
  ['POST tournaments', () => postTournament(req('/api/clans/7/tournaments', 'POST') as never, clan)],
  ['PATCH tournaments/[id]', () => patchTournament(req('/api/clans/7/tournaments/t1', 'PATCH') as never, clanTournament)],
  ['DELETE tournaments/[id]', () => deleteTournament(req('/api/clans/7/tournaments/t1', 'DELETE') as never, clanTournament)],
  ['POST tournaments/[id]/discord', () => postTournamentDiscord(req('/api/clans/7/tournaments/t1/discord', 'POST'), clanTournament)],
  ['POST tournaments/[id]/sync', () => postTournamentSync(req('/api/clans/7/tournaments/t1/sync', 'POST'), clanTournament)],
  ['GET encountered-players', () => getEncounteredPlayers(req('/api/clans/7/encountered-players'), clan)],
  ['POST /api/members (clan 7)', () => postMembers(req('/api/members', 'POST', { pubgPlayerName: 'Joueur', clanId: 7 }))],
]

function memberSession(memberId: number): AuthSessionContext {
  return { sessionId: `s${memberId}`, userId: memberId, email: `${memberId}@example.com`, activeMemberId: memberId, isSuperUser: false }
}

async function statusOf(handler: Handler) {
  return (await handler()).status
}

describe('gardes des routes d’administration (lot 1)', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Réseau coupé dans les tests de gardes')
    }))
    delete process.env.DISABLE_AUTH_PERMISSIONS
  })

  beforeEach(() => {
    state.session = null
  })

  const ALL_ROUTES = [...PLATFORM_ROUTES, ...TELEMETRY_TOOL_ROUTES, ...CLAN_OWNER_ROUTES]

  it.each(ALL_ROUTES)('%s : 401 sans session', async (_name, handler) => {
    expect(await statusOf(handler)).toBe(401)
  })

  it.each(ALL_ROUTES)('%s : 403 pour l’Owner d’un autre clan', async (_name, handler) => {
    state.session = memberSession(200)
    expect(await statusOf(handler)).toBe(403)
  })

  it.each([...PLATFORM_ROUTES, ...TELEMETRY_TOOL_ROUTES])('%s : 403 même pour l’Owner du clan', async (_name, handler) => {
    state.session = memberSession(100)
    expect(await statusOf(handler)).toBe(403)
  })

  it('mode visiteur : les routes d’administration restent fermées', async () => {
    process.env.DISABLE_AUTH_PERMISSIONS = 'true'
    try {
      for (const [name, handler] of ALL_ROUTES) {
        expect([name, await statusOf(handler)]).toEqual([name, 401])
      }
    } finally {
      delete process.env.DISABLE_AUTH_PERMISSIONS
    }
  })
})
