import { beforeEach, describe, expect, it, vi } from 'vitest'

// Journal des actions d'administration (docs/TODO/administration.md Q10). Prisma est simulé : rien n'est écrit.
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { adminActionLog: { create: mocks.create, deleteMany: mocks.deleteMany } },
}))

import {
  ADMIN_ACTION_LOG_RETENTION_DAYS,
  buildAdminActionEntry,
  isSimulationPayload,
  parseAdminActionFilters,
  purgeExpiredAdminActions,
  summarizeResponsePayload,
  withAdminActionLog,
} from '@/lib/admin-action-log'
import { rememberAdminActor } from '@/lib/auth/admin-actor'

const ACTOR = { userId: 3, memberId: 42, isSuperUser: false }
const context = (params: Record<string, string>) => ({ params: Promise.resolve(params) })
const post = () => new Request('http://localhost/api/clans/7/telemetry/sync-selected', { method: 'POST' })

describe('résumé d’une réponse', () => {
  it('garde les nombres et booléens de premier niveau, et l’erreur', () => {
    expect(
      summarizeResponsePayload({ ok: true, queuedCount: 12, squadMatchIds: ['a'], clan: { id: 1 }, error: 'x'.repeat(300) })
    ).toEqual({ result: { ok: true, queuedCount: 12 }, error: 'x'.repeat(200) })
    expect(summarizeResponsePayload(['a'])).toEqual({})
    expect(summarizeResponsePayload(null)).toEqual({})
  })

  it('reconnaît une simulation', () => {
    expect(isSimulationPayload({ validateOnly: true })).toBe(true)
    expect(isSimulationPayload({ dryRun: true })).toBe(true)
    expect(isSimulationPayload({ mode: 'preview' })).toBe(true)
    expect(isSimulationPayload({ validateOnly: false, mode: 'create' })).toBe(false)
  })

  it('sépare le clan de l’adresse des autres paramètres', () => {
    const entry = buildAdminActionEntry({
      actor: ACTOR,
      action: 'clans/[clanId]/members/[memberId]/invite',
      method: 'delete',
      status: 404,
      routeParams: { clanId: '7', memberId: '15' },
      payload: { error: 'Membre introuvable' },
    })
    expect(entry).toEqual({
      userId: 3,
      memberId: 42,
      isSuperUser: false,
      clanId: 7,
      action: 'clans/[clanId]/members/[memberId]/invite',
      method: 'DELETE',
      status: 404,
      outcome: 'error',
      summary: { params: { memberId: '15' }, error: 'Membre introuvable' },
    })
  })
})

describe('withAdminActionLog', () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue({})
    mocks.deleteMany.mockReset()
  })

  it('note une écriture réussie avec son acteur, son clan et son résumé', async () => {
    const handler = withAdminActionLog('clans/[clanId]/telemetry/sync-selected', async (request: Request) => {
      rememberAdminActor(request, ACTOR)
      return Response.json({ ok: true, queuedCount: 4 })
    })

    const response = await handler(post(), context({ clanId: '7' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, queuedCount: 4 })
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 3,
        clanId: 7,
        action: 'clans/[clanId]/telemetry/sync-selected',
        method: 'POST',
        status: 200,
        outcome: 'success',
        summary: { result: { ok: true, queuedCount: 4 } },
      }),
    })
  })

  it('ne note ni les refus, ni les requêtes sans acteur, ni les simulations', async () => {
    const refused = withAdminActionLog('settings/nav-permissions', async (request: Request) => {
      rememberAdminActor(request, ACTOR)
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    })
    const internal = withAdminActionLog('clans/[clanId]/sync-stats', async () => Response.json({ ok: true }))
    const simulated = withAdminActionLog('clans/[clanId]/telemetry/resync-files-selected', async (request: Request) => {
      rememberAdminActor(request, ACTOR)
      return Response.json({ ok: true, validateOnly: true })
    })

    await refused(post(), undefined)
    await internal(post(), context({ clanId: '7' }))
    await simulated(post(), context({ clanId: '7' }))

    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('rend la réponse même quand le journal ne peut pas être écrit', async () => {
    mocks.create.mockRejectedValue(new Error('Table AdminActionLog absente'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handler = withAdminActionLog('settings/owner-features', async (request: Request) => {
      rememberAdminActor(request, { ...ACTOR, isSuperUser: true })
      return Response.json({ ok: true })
    })

    const response = await handler(new Request('http://localhost/api/settings/owner-features', { method: 'PUT' }), undefined)

    expect(response.status).toBe(200)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('note l’erreur d’un handler qui lève, puis la relance', async () => {
    const handler = withAdminActionLog('clans/[clanId]/telemetry/recoveries', async (request: Request) => {
      rememberAdminActor(request, ACTOR)
      throw new Error('PUBG indisponible')
    })

    await expect(handler(post(), context({ clanId: '7' }))).rejects.toThrow('PUBG indisponible')
    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 500, outcome: 'error', summary: { error: 'PUBG indisponible' } }),
    })
  })
})

describe('filtres de la page du journal', () => {
  it('ne garde que des identifiants valides et un résultat connu', () => {
    expect(parseAdminActionFilters(new URLSearchParams('clanId=7&userId=abc&outcome=error&page=3'))).toEqual({
      clanId: 7,
      userId: null,
      outcome: 'error',
      page: 3,
    })
    expect(parseAdminActionFilters(new URLSearchParams('outcome=refused&page=-1'))).toEqual({
      clanId: null,
      userId: null,
      outcome: null,
      page: 1,
    })
  })
})

describe('purge du journal', () => {
  it('supprime les lignes de plus de 12 mois', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 5 })
    const now = new Date('2026-10-07T01:15:00Z')

    expect(await purgeExpiredAdminActions(now)).toBe(5)
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(now.getTime() - ADMIN_ACTION_LOG_RETENTION_DAYS * 86_400_000) } },
    })
  })
})
