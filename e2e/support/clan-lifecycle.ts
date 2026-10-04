import type { ApiMock } from './api'
import { mockMemberSession } from './session'

/**
 * Cycle de vie des clans (e2e/clan-lifecycle.spec.ts) : session SuperUser, vue d'ensemble, journal des mutations
 * (35 lignes : deux pages de 30), deux clans en attente, deux clans archivés, quatorze joueurs au parking dont trois
 * archivables, trois passages du cron. Données fictives ; chaque action modifie l'état simulé (compteurs recalculés)
 * et son corps est gardé pour vérifier ce que la page envoie — rien n'atteint la base.
 */

export { withSessionCookie } from './session'

type ClanRef = { id: number; tag: string; name: string; isSystem: boolean; isActive?: boolean } | null

type Mutation = {
  id: string
  source: string
  status: string
  detectedAt: string
  appliedAt: string | null
  acknowledgedAt: string | null
  runId: string | null
  previousPubgClanTag: string | null
  newPubgClanTag: string | null
  clanMember: { id: number; displayName: string; clanId: number } | null
  previousClan: ClanRef
  newClan: ClanRef
}

const DEMO: ClanRef = { id: 1, tag: 'DEMO', name: 'Clan Démo', isSystem: false, isActive: true }
const RATZ: ClanRef = { id: 5, tag: 'RATZ', name: 'Les Ratz', isSystem: false, isActive: true }
const PARKING: ClanRef = { id: 99, tag: 'UNG', name: 'Ungrouped', isSystem: true, isActive: true }

function mutation(id: string, member: string, memberId: number, status: string, source: string, from: ClanRef, to: ClanRef, at: string, extra: Partial<Mutation> = {}): Mutation {
  return {
    id,
    source,
    status,
    detectedAt: at,
    appliedAt: status === 'applied' ? at : null,
    acknowledgedAt: null,
    runId: 'run-1',
    previousPubgClanTag: from?.isSystem ? null : (from?.tag ?? null),
    newPubgClanTag: to?.isSystem ? null : (to?.tag ?? null),
    clanMember: { id: memberId, displayName: member, clanId: to?.id ?? from?.id ?? 1 },
    previousClan: from,
    newClan: to,
    ...extra,
  }
}

function initialMutations(): Mutation[] {
  const crafted = [
    mutation('chg-1', 'Joueur Bravo', 11, 'applied', 'auto_transfer', DEMO, RATZ, '2026-10-04T01:47:00.000Z'),
    mutation('chg-2', 'Joueur Charlie', 12, 'applied', 'auto_demotion', DEMO, PARKING, '2026-10-04T01:46:00.000Z'),
    mutation('chg-3', 'Joueur Delta', 13, 'applied', 'ungrouped_promotion', PARKING, DEMO, '2026-10-03T01:46:00.000Z', {
      acknowledgedAt: '2026-10-03T08:00:00.000Z',
    }),
    mutation('chg-4', 'Joueur Echo', 14, 'observed', 'player_sync', DEMO, null, '2026-10-03T01:45:00.000Z', { newPubgClanTag: 'BOFS' }),
    mutation('chg-5', 'Joueur Foxtrot', 15, 'reverted', 'auto_transfer', DEMO, RATZ, '2026-10-02T01:45:00.000Z'),
  ]
  // Écarts en cours de confirmation, plus anciens : le journal se remplit vite d'observations.
  const observed = Array.from({ length: 30 }, (_, index) =>
    mutation(
      `obs-${index + 1}`,
      `Joueur Observé ${String(index + 1).padStart(2, '0')}`,
      100 + index,
      'observed',
      'player_sync',
      DEMO,
      null,
      new Date(Date.UTC(2026, 8, 30 - Math.floor(index / 3), 1, 45)).toISOString(),
      { newPubgClanTag: index % 2 ? 'BOFS' : null }
    )
  )
  return [...crafted, ...observed]
}

type PendingClan = {
  id: number
  name: string
  tag: string
  platformShard: string
  createdAt: string
  origin: 'join_request' | 'auto_detected'
  requester: { memberId: number; playerName: string; contactEmail: string | null; joinStatus: string } | null
  pendingPromotions: number
}

const PENDING: PendingClan[] = [
  {
    id: 41,
    name: 'Smoke Squad',
    tag: 'SMK',
    platformShard: 'steam',
    createdAt: '2026-10-02T19:12:00.000Z',
    origin: 'join_request',
    requester: { memberId: 301, playerName: 'Smoke_Leader', contactEmail: 'chef@smoke-squad.example', joinStatus: 'pending' },
    pendingPromotions: 0,
  },
  {
    id: 42,
    name: 'Bof Team',
    tag: 'BOFS',
    platformShard: 'steam',
    createdAt: '2026-10-03T01:45:00.000Z',
    origin: 'auto_detected',
    requester: null,
    pendingPromotions: 3,
  },
]

type ArchivedClan = { id: number; name: string; tag: string; platformShard: string; archivedAt: string | null; archivedReason: string | null; createdAt: string; attachedMembers: number }

const ARCHIVED: ArchivedClan[] = [
  { id: 51, name: 'Vieux Clan', tag: 'OLD', platformShard: 'steam', archivedAt: '2026-09-28T10:00:00.000Z', archivedReason: 'unfollowed', createdAt: '2026-03-01T10:00:00.000Z', attachedMembers: 4 },
  { id: 52, name: 'Demande Refusée', tag: 'NOPE', platformShard: 'kakao', archivedAt: '2026-09-30T10:00:00.000Z', archivedReason: 'rejected', createdAt: '2026-09-29T10:00:00.000Z', attachedMembers: 1 },
]

type UngroupedMember = { memberId: number; displayName: string; lastMatchAt: string | null; inactiveDays: number | null; eligibleAt: string | null; isCandidate: boolean }

function initialParking(): UngroupedMember[] {
  return Array.from({ length: 14 }, (_, index) => {
    const memberId = 201 + index
    const displayName = `Sans Clan ${String(index + 1).padStart(2, '0')}`
    if (index === 0) return { memberId, displayName, lastMatchAt: '2026-05-27T20:00:00.000Z', inactiveDays: 130, eligibleAt: '2026-08-25T20:00:00.000Z', isCandidate: true }
    if (index === 1) return { memberId, displayName, lastMatchAt: null, inactiveDays: null, eligibleAt: null, isCandidate: true }
    if (index === 2) return { memberId, displayName, lastMatchAt: '2026-06-30T20:00:00.000Z', inactiveDays: 96, eligibleAt: '2026-09-28T20:00:00.000Z', isCandidate: true }
    return {
      memberId,
      displayName,
      lastMatchAt: '2026-09-20T20:00:00.000Z',
      inactiveDays: 14 + index,
      eligibleAt: new Date(Date.UTC(2026, 11, 19 - index, 20)).toISOString(),
      isCandidate: false,
    }
  })
}

const RUNS = [
  {
    id: 'run-1',
    status: 'success',
    mode: 'observe',
    startedAt: '2026-10-04T01:45:00.000Z',
    durationMs: 255_000,
    membersScanned: 346,
    apiCalls: 35,
    statesUnknown: 2,
    discrepanciesFound: 4,
    awaitingConfirmation: 3,
    movementsPlanned: 1,
    movementsApplied: 1,
    circuitBreakerTripped: false,
    movesRatioPercent: 0.3,
  },
  {
    id: 'run-2',
    status: 'aborted',
    mode: 'observe',
    startedAt: '2026-10-03T01:45:00.000Z',
    durationMs: 248_000,
    membersScanned: 344,
    apiCalls: 35,
    statesUnknown: 9,
    discrepanciesFound: 41,
    awaitingConfirmation: 0,
    movementsPlanned: 41,
    movementsApplied: 0,
    circuitBreakerTripped: true,
    movesRatioPercent: 11.9,
  },
  {
    id: 'run-3',
    status: 'failed',
    mode: 'observe',
    startedAt: '2026-10-02T01:45:00.000Z',
    durationMs: 12_000,
    membersScanned: 0,
    apiCalls: 1,
    statesUnknown: 0,
    discrepanciesFound: 0,
    awaitingConfirmation: 0,
    movementsPlanned: 0,
    movementsApplied: 0,
    circuitBreakerTripped: false,
    movesRatioPercent: null,
  },
]

export type LifecycleCalls = {
  settingsPatches: Array<Record<string, unknown>>
  mutationActions: Array<{ action: string; changeId: string }>
  decisions: Array<{ clanId: number; decision: 'approve' | 'reject'; body: unknown }>
  reactivations: Array<{ clanId: number; body: unknown }>
  archives: Array<{ action: string; memberIds: number[] }>
}

export type LifecycleMockOptions = {
  superUser?: boolean
  /** Lecture des clans en attente en erreur 500 tant que `control.failPending` reste vrai. */
  failPending?: boolean
}

/** Bascules du test en cours (le mode strict du dev double les premières lectures : on ne compte pas les appels). */
export type LifecycleControl = { failPending: boolean }

export function mockClanLifecycle(api: ApiMock, options: LifecycleMockOptions = {}): LifecycleCalls & { control: LifecycleControl } {
  const superUser = options.superUser ?? true
  const control: LifecycleControl = { failPending: options.failPending ?? false }
  const calls: LifecycleCalls = { settingsPatches: [], mutationActions: [], decisions: [], reactivations: [], archives: [] }
  const forbidden = { status: 403, body: { error: 'Forbidden' } }

  let settings = {
    mode: 'observe',
    confirmationsRequired: 3,
    maxMovesRatioPercent: 10,
    archiveAfterDays: 90,
    autoArchive: false,
    autoPromote: true,
    webhookUrl: 'https://discord.com/api/webhooks/123456789/••••' as string | null,
  }
  const mutations = initialMutations()
  let pending = [...PENDING]
  let archived = [...ARCHIVED]
  let parking = initialParking()

  const counters = () => ({
    unacknowledged: mutations.filter((row) => row.status === 'applied' && row.acknowledgedAt === null).length,
    observed: mutations.filter((row) => row.status === 'observed').length,
    pending: mutations.filter((row) => row.status === 'pending').length,
    pendingClans: pending.length,
    archivedClans: archived.length,
    ungroupedMembers: parking.length,
    archiveCandidates: parking.filter((member) => member.isCandidate).length,
  })

  mockMemberSession(api, { superUser })

  api
    .on('GET', '/api/settings/clan-lifecycle', () =>
      superUser
        ? { body: { settings, health: { lastRun: RUNS[0], recentRuns: RUNS, ungroupedDailyApiCalls: parking.length }, counters: counters() } }
        : forbidden
    )
    .on('PATCH', '/api/settings/clan-lifecycle', (_url, request) => {
      const body = request.postDataJSON() as Record<string, unknown>
      calls.settingsPatches.push(body)
      const { webhookUrl, ...rest } = body
      settings = { ...settings, ...rest }
      if (typeof webhookUrl === 'string') settings.webhookUrl = webhookUrl ? 'https://discord.com/api/webhooks/987654321/••••' : null
      return { body: { success: true, settings } }
    })
    .on('GET', '/api/settings/clan-lifecycle/mutations', (url) => {
      if (!superUser) return forbidden
      const status = url.searchParams.get('status')
      const page = Number(url.searchParams.get('page') ?? '1')
      const rows = status ? mutations.filter((row) => row.status === status) : mutations
      return {
        body: {
          mutations: rows.slice((page - 1) * 30, page * 30),
          page,
          pageSize: 30,
          total: rows.length,
          totalPages: Math.max(1, Math.ceil(rows.length / 30)),
        },
      }
    })
    .on('POST', '/api/settings/clan-lifecycle/mutations', (_url, request) => {
      const body = request.postDataJSON() as { action: string; changeId: string }
      calls.mutationActions.push(body)
      const row = mutations.find((entry) => entry.id === body.changeId)
      if (!row) return { status: 409, body: { error: 'Mouvement introuvable.' } }
      if (body.action === 'acknowledge') {
        row.acknowledgedAt = '2026-10-04T18:30:00.000Z'
        return { body: { success: true, message: 'Mouvement marqué comme vu.' } }
      }
      row.status = 'reverted'
      return { body: { success: true, message: `${row.clanMember?.displayName} a été replacé dans son clan précédent.`, restoredClanId: row.previousClan?.id } }
    })
    .on('GET', '/api/settings/clan-lifecycle/pending-clans', () => {
      if (!superUser) return forbidden
      if (control.failPending) return { status: 500, body: { error: 'Internal Server Error' } }
      return { body: { clans: pending } }
    })
    .on('GET', '/api/settings/clan-lifecycle/archived-clans', () => (superUser ? { body: { clans: archived } } : forbidden))
    .on('GET', '/api/settings/clan-lifecycle/ungrouped', () =>
      superUser
        ? { body: { thresholdDays: settings.archiveAfterDays, members: parking, candidateCount: counters().archiveCandidates, archived: [] } }
        : forbidden
    )
    .on('POST', '/api/settings/clan-lifecycle/ungrouped', (_url, request) => {
      const body = request.postDataJSON() as { action: string; memberIds: number[] }
      calls.archives.push(body)
      parking = parking.filter((member) => !body.memberIds.includes(member.memberId))
      return { body: { success: true, archived: body.memberIds.length, message: `${body.memberIds.length} membre(s) archivé(s). Leur synchronisation PUBG est arrêtée.` } }
    })

  for (const clan of PENDING) {
    for (const decision of ['approve', 'reject'] as const) {
      api.on('POST', `/api/clans/${clan.id}/${decision}`, (_url, request) => {
        calls.decisions.push({ clanId: clan.id, decision, body: request.postDataJSON() })
        pending = pending.filter((entry) => entry.id !== clan.id)
        if (decision === 'reject') {
          archived = [{ ...clan, archivedAt: '2026-10-04T18:30:00.000Z', archivedReason: 'rejected', attachedMembers: clan.requester ? 1 : 0 }, ...archived]
          return { body: { success: true, message: `Demande du clan [${clan.tag}] refusée.` } }
        }
        return { body: { success: true, message: `Clan [${clan.tag}] ${clan.name} validé.` } }
      })
    }
  }

  for (const clan of ARCHIVED) {
    api.on('PATCH', `/api/settings/clans/${clan.id}`, (_url, request) => {
      calls.reactivations.push({ clanId: clan.id, body: request.postDataJSON() })
      archived = archived.filter((entry) => entry.id !== clan.id)
      return { body: { success: true, message: `Le suivi de [${clan.tag}] ${clan.name} reprend.` } }
    })
  }

  return { ...calls, control }
}
