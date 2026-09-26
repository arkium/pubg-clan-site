import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Route interne du proxy, attribution et route SuperUser — docs/TODO/chickendinnerfr.md §4 et §6. */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  update: vi.fn(),
  requireSuperUser: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
      update: mocks.update,
    },
  },
}))
vi.mock('@/middleware/auth-permission', () => ({ requireSuperUser: mocks.requireSuperUser }))

import { GET as getInternalTargets } from '../app/api/internal/clan-subdomains/route'
import { PUT as putSubdomain } from '../app/api/settings/clans/[id]/subdomain/route'
import { ensureClanSubdomain } from './clan-subdomain-service'

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSuperUser.mockResolvedValue(null)
})

describe('GET /api/internal/clan-subdomains', () => {
  it('ne renvoie que la table sous-domaine → clan des clans actifs non système', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 1, subdomain: 'smk' },
      { id: 2, subdomain: 'kilslms' },
    ])
    const response = await getInternalTargets()
    expect(await response.json()).toEqual({ targets: { smk: 1, kilslms: 2 } })
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, isSystem: false, subdomain: { not: null } },
        select: { id: true, subdomain: true },
      })
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

describe('ensureClanSubdomain', () => {
  const clan = { id: 180, tag: 'KMS', name: 'KeepMoveSurvive', isActive: true, isSystem: false, subdomain: null }

  it('attribue le nom quand un autre clan actif porte le même tag', async () => {
    mocks.findUnique.mockResolvedValue(clan)
    mocks.findMany.mockResolvedValue([{ tag: 'kms', subdomain: 'kilslms', isActive: true, isSystem: false }])
    mocks.updateMany.mockResolvedValue({ count: 1 })
    expect(await ensureClanSubdomain(180)).toBe('keepmovesurvive')
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: 180, subdomain: null }, data: { subdomain: 'keepmovesurvive' } })
  })

  it('attribue le tag quand il est libre et unique', async () => {
    mocks.findUnique.mockResolvedValue({ ...clan, id: 1, tag: 'SMK', name: 'Smoky' })
    mocks.findMany.mockResolvedValue([])
    mocks.updateMany.mockResolvedValue({ count: 1 })
    expect(await ensureClanSubdomain(1)).toBe('smk')
  })

  it('ne touche ni un clan qui a déjà un sous-domaine, ni un clan inactif, ni le clan système', async () => {
    for (const state of [{ subdomain: 'ancien' }, { isActive: false }, { isSystem: true }]) {
      mocks.findUnique.mockResolvedValue({ ...clan, ...state })
      await ensureClanSubdomain(180)
    }
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('recalcule quand le même sous-domaine vient d’être pris par un autre clan', async () => {
    mocks.findUnique.mockResolvedValue(clan)
    mocks.findMany
      .mockResolvedValueOnce([{ tag: 'kms', subdomain: null, isActive: true, isSystem: false }])
      .mockResolvedValueOnce([{ tag: 'kms', subdomain: 'keepmovesurvive', isActive: true, isSystem: false }])
    mocks.updateMany.mockRejectedValueOnce(uniqueViolation()).mockResolvedValueOnce({ count: 1 })
    expect(await ensureClanSubdomain(180)).toBe('keepmovesurvive-2')
  })
})

describe('PUT /api/settings/clans/[id]/subdomain', () => {
  const call = (subdomain: string, id = '1') =>
    putSubdomain(new Request('http://localhost/api/settings/clans/1/subdomain', {
      method: 'PUT',
      body: JSON.stringify({ subdomain }),
    }), { params: Promise.resolve({ id }) })

  it('est réservé au SuperUser', async () => {
    mocks.requireSuperUser.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await call('smk')).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('refuse un sous-domaine réservé ou mal formé, sans écrire', async () => {
    mocks.findUnique.mockResolvedValue({ id: 1, isSystem: false })
    expect((await call('www')).status).toBe(400)
    expect((await call('-smk')).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('refuse un sous-domaine déjà attribué', async () => {
    mocks.findUnique.mockResolvedValue({ id: 1, isSystem: false })
    mocks.update.mockRejectedValue(uniqueViolation())
    const response = await call('kilslms')
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('taken')
  })

  it('refuse le clan système', async () => {
    mocks.findUnique.mockResolvedValue({ id: 1, isSystem: true })
    expect((await call('ung')).status).toBe(409)
  })

  it('enregistre un sous-domaine valide, normalisé en minuscules', async () => {
    mocks.findUnique.mockResolvedValue({ id: 1, isSystem: false })
    mocks.update.mockResolvedValue({})
    const response = await call(' SMK ')
    expect(await response.json()).toEqual({ subdomain: 'smk' })
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { subdomain: 'smk' } })
  })
})
