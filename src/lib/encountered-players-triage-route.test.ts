import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrat de `GET /api/settings/encountered-players`, l'onglet Triage de `/settings/players` : la recherche par nom
 * échappe `_` et `%` comme l'annuaire (docs/TODO/players.md §3.E), et un `*` seul ne charge pas toute la table.
 *
 * Convention du dépôt : les tests vivent dans `src/lib/` et importent les handlers depuis `src/app/`.
 */

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  requireSuperUser: vi.fn(),
  encounteredPlayerFindMany: vi.fn(),
  encounteredPlayerCount: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    encounteredPlayer: { findMany: mocks.encounteredPlayerFindMany, count: mocks.encounteredPlayerCount },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireSuperUser: mocks.requireSuperUser,
}))

import { GET as getTriageRoute } from '@/app/api/settings/encountered-players/route'

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSuperUser.mockResolvedValue(null)
  mocks.encounteredPlayerFindMany.mockResolvedValue([])
  mocks.encounteredPlayerCount.mockResolvedValue(0)
})

function search(q: string) {
  return getTriageRoute(new Request(`http://localhost/api/settings/encountered-players?q=${encodeURIComponent(q)}`))
}

/** Clause de nom du premier `findMany` (la route ajoute aussi `resolveAttempts >= 0`, sans effet). */
function nameClauseOfFirstRead() {
  const where = mocks.encounteredPlayerFindMany.mock.calls[0][0].where
  return (where.AND ?? []).filter((clause: Record<string, unknown>) => 'pubgPlayerName' in clause)
}

describe('GET /api/settings/encountered-players — recherche par nom', () => {
  it('refuse sans droits, sans lecture en base', async () => {
    mocks.requireSuperUser.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))

    const result = await search('Lord')

    expect(result.status).toBe(403)
    expect(mocks.encounteredPlayerFindMany).not.toHaveBeenCalled()
  })

  it('échappe `_` dans un préfixe : Lord_Kromb ne trouve plus LordXKromb', async () => {
    const result = await search('Lord_Kromb')

    expect(result.status).toBe(200)
    expect(nameClauseOfFirstRead()).toEqual([{ pubgPlayerName: { startsWith: 'Lord\\_Kromb' } }])
  })

  it('`*` en tête demande une sous-chaîne, `%` et `\\` y restent littéraux', async () => {
    await search('*50%\\x')

    expect(nameClauseOfFirstRead()).toEqual([{ pubgPlayerName: { contains: '50\\%\\\\x' } }])
  })

  it('`%` en tête demande aussi une sous-chaîne', async () => {
    await search('%Kromb')

    expect(nameClauseOfFirstRead()).toEqual([{ pubgPlayerName: { contains: 'Kromb' } }])
  })

  it('un `*` seul ne filtre rien et reste paginé (pas de lecture de toute la table)', async () => {
    const result = await search('*')
    const body = await result.json()

    expect(result.status).toBe(200)
    expect(mocks.encounteredPlayerCount).toHaveBeenCalledTimes(1)
    expect(mocks.encounteredPlayerFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }))
    expect(nameClauseOfFirstRead()).toEqual([])
    expect(body.total).toBe(0)
  })
})
