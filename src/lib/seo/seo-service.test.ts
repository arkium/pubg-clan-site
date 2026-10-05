import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma simulé : rien n'est lu ni écrit dans la base de DATABASE_URL.
const mocks = vi.hoisted(() => ({
  clanFindUnique: vi.fn(),
  clanFindMany: vi.fn(),
  tournamentFindUnique: vi.fn(),
  tournamentFindMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clan: { findUnique: mocks.clanFindUnique, findMany: mocks.clanFindMany },
    tournament: { findUnique: mocks.tournamentFindUnique, findMany: mocks.tournamentFindMany },
  },
}))

import { loadSitemapData, resolvePageSeo } from './seo-service'

const ACTIVE_CLAN = { id: 7, name: 'D32', tag: 'SMK', isActive: true, isSystem: false, archivedAt: null }

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
})

describe('resolvePageSeo', () => {
  it('indexe une page de clan suivi, avec son nom', async () => {
    mocks.clanFindUnique.mockResolvedValue(ACTIVE_CLAN)
    await expect(resolvePageSeo('/clans/7/leaderboard')).resolves.toMatchObject({ title: 'D32 [SMK] — Classement', index: true })
    expect(mocks.clanFindUnique.mock.calls[0][0].where).toEqual({ id: 7 })
  })

  it('n’indexe pas un clan archivé, en attente ou système', async () => {
    for (const clan of [
      { ...ACTIVE_CLAN, archivedAt: new Date() },
      { ...ACTIVE_CLAN, isActive: false },
      { ...ACTIVE_CLAN, isSystem: true },
    ]) {
      mocks.clanFindUnique.mockResolvedValueOnce(clan)
      await expect(resolvePageSeo(`/clans/${clan.id}/overview`)).resolves.toMatchObject({ index: false })
    }
  })

  it('n’indexe qu’un tournoi lancé', async () => {
    mocks.tournamentFindUnique.mockResolvedValueOnce({ id: 't1', title: 'Coupe FR', status: 'finished' })
    await expect(resolvePageSeo('/tournaments/t1')).resolves.toMatchObject({ title: 'Coupe FR — tournoi PUBG', index: true })
    mocks.tournamentFindUnique.mockResolvedValueOnce({ id: 't2', title: 'Brouillon', status: 'draft' })
    await expect(resolvePageSeo('/tournaments/t2')).resolves.toMatchObject({ index: false })
  })

  it('n’interroge pas la base pour une page fixe, et reste prudent si la base tombe', async () => {
    await expect(resolvePageSeo('/mortier')).resolves.toMatchObject({ index: true })
    expect(mocks.clanFindUnique).not.toHaveBeenCalled()

    mocks.clanFindUnique.mockRejectedValue(new Error('base indisponible'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(resolvePageSeo('/clans/8/overview')).resolves.toMatchObject({ index: false })
  })
})

describe('loadSitemapData', () => {
  it('ne prend que les clans suivis et les tournois lancés', async () => {
    mocks.clanFindMany.mockResolvedValue([{ id: 7, lastMatchAt: null }])
    mocks.tournamentFindMany.mockResolvedValue([])
    await expect(loadSitemapData()).resolves.toEqual({ clans: [{ id: 7, lastMatchAt: null }], tournaments: [] })
    expect(mocks.clanFindMany.mock.calls[0][0].where).toEqual({ isActive: true, isSystem: false, archivedAt: null })
    expect(mocks.tournamentFindMany.mock.calls[0][0].where).toEqual({ status: { in: ['active', 'finished'] } })
  })
})

describe('proxy — chemin transmis au layout racine', () => {
  const previousAuthDisabled = process.env.DISABLE_AUTH_PERMISSIONS

  beforeEach(() => {
    vi.resetModules()
    process.env.DISABLE_AUTH_PERMISSIONS = 'true'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        if (String(input).endsWith('/api/setup/status')) return Response.json({ setupState: 'completed' })
        throw new Error(`appel imprévu : ${input}`)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (previousAuthDisabled === undefined) delete process.env.DISABLE_AUTH_PERMISSIONS
    else process.env.DISABLE_AUTH_PERMISSIONS = previousAuthDisabled
  })

  it('pose x-pathname sur la requête, en écrasant une valeur envoyée par le navigateur', async () => {
    const { proxy } = await import('../../proxy')
    const response = await proxy(
      new NextRequest('https://chickendinner.fr/clans/7/leaderboard?period=month', { headers: { 'x-pathname': '/faux' } })
    )
    expect(response.headers.get('x-middleware-request-x-pathname')).toBe('/clans/7/leaderboard')
  })
})
