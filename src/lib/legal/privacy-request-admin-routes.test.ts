import { beforeEach, describe, expect, it, vi } from 'vitest'

// Traitement des demandes « Retirer mes données » par le SuperUser (docs/TODO/administration.md, lot 3a). La garde
// est simulée ici (ses refus sont couverts par src/lib/auth/admin-route-guards.test.ts) ; Prisma aussi : rien n'est écrit.
const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  findMany: vi.fn(),
  groupBy: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/lib/auth/admin-guards', () => ({ requirePlatformAdmin: mocks.requirePlatformAdmin }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    privacyRequest: {
      findMany: mocks.findMany,
      groupBy: mocks.groupBy,
      findUnique: mocks.findUnique,
      update: mocks.update,
    },
  },
}))

import { GET } from '@/app/api/settings/privacy-requests/route'
import { PATCH } from '@/app/api/settings/privacy-requests/[id]/route'

const ROW = {
  id: 3,
  pubgName: 'Arkium_FR',
  kind: 'purge',
  reason: null,
  email: 'joueur@exemple.fr',
  status: 'pending',
  createdAt: new Date('2026-01-31T10:00:00Z'),
  handledAt: null,
}

function patch(id: string, body: unknown) {
  return PATCH(
    new Request(`http://localhost:3000/api/settings/privacy-requests/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  )
}

describe('routes d’administration des demandes de confidentialité', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.requirePlatformAdmin.mockResolvedValue(null)
    mocks.findMany.mockResolvedValue([ROW])
    mocks.groupBy.mockResolvedValue([{ status: 'pending', _count: { _all: 1 } }, { status: 'done', _count: { _all: 4 } }])
    mocks.findUnique.mockResolvedValue({ id: 3 })
    mocks.update.mockImplementation(async ({ data }: { data: object }) => ({ ...ROW, ...data }))
  })

  it('liste les demandes en attente par défaut, avec leur échéance et les compteurs', async () => {
    const response = await GET(new Request('http://localhost:3000/api/settings/privacy-requests'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'pending' } }))
    // Un mois après le 31 janvier : le dernier jour de février
    expect(payload.requests[0].deadline).toBe('2026-02-28T10:00:00.000Z')
    expect(payload.counts).toEqual({ pending: 1, done: 4 })
  })

  it('`?status=all` lève le filtre', async () => {
    await GET(new Request('http://localhost:3000/api/settings/privacy-requests?status=all'))
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }))
  })

  it('propage le refus de la garde', async () => {
    mocks.requirePlatformAdmin.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await GET(new Request('http://localhost:3000/api/settings/privacy-requests'))).status).toBe(403)
    expect((await patch('3', { status: 'done' })).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('clôt une demande en posant handledAt, la rouvre en l’effaçant', async () => {
    const closed = await (await patch('3', { status: 'done' })).json()
    expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: 3 }, data: { status: 'done', handledAt: expect.any(Date) } })
    expect(closed.request.status).toBe('done')

    await patch('3', { status: 'pending' })
    expect(mocks.update).toHaveBeenLastCalledWith({ where: { id: 3 }, data: { status: 'pending', handledAt: null } })
  })

  it('refuse un statut inconnu, un identifiant invalide, une demande absente', async () => {
    expect((await patch('3', { status: 'archived' })).status).toBe(400)
    expect((await patch('abc', { status: 'done' })).status).toBe(400)
    mocks.findUnique.mockResolvedValue(null)
    expect((await patch('99', { status: 'done' })).status).toBe(404)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
