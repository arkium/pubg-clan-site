import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrats de l'armurerie côté serveur (docs/features/weapons.md §7) : la route clan classe par la liste unique
 * `weapon-categories.ts`, et l'ancienne URL « Catégories armes » redirige vers l'armurerie (`next.config.ts`). Tests placés dans
 * `src/lib/` : Vitest ne ramasse rien ailleurs (CLAUDE.md, piège n° 9).
 */

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  squadMatchTelemetryFindMany: vi.fn(),
  requireNavPermission: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    squadMatchTelemetry: { findMany: mocks.squadMatchTelemetryFindMany },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({
  requireNavPermission: mocks.requireNavPermission,
}))

vi.mock('@/lib/weapon-label-service', () => ({
  getWeaponLabels: vi.fn(async () => ({ WeapG18_C: 'P18C', WeapHK416_C: 'M416' })),
  weaponDisplayName: (weaponName: string, labels: Record<string, string>) => labels[weaponName] ?? weaponName,
}))

import { GET as getClanWeapons } from '@/app/api/clans/[clanId]/telemetry/weapons/route'
import nextConfig from '../../../next.config'

function statsRow(weaponName: string, kills: number) {
  return {
    memberId: 7,
    displayName: 'Joueur Alpha',
    pubgPlayerName: 'alpha',
    weaponName,
    kills,
    headshots: 1,
    shotsFired: 100,
    hitsLanded: 25,
    avgDistance: 4500,
    maxDistance: 21000,
    totalDamage: 900,
    matchCount: 3,
  }
}

describe('GET /api/clans/[clanId]/telemetry/weapons', () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset()
    mocks.squadMatchTelemetryFindMany.mockReset().mockResolvedValue([])
    mocks.requireNavPermission.mockReset().mockReturnValue(async () => null)
  })

  it('porte sur chaque ligne le code et la clé de weapon-categories.ts', async () => {
    mocks.queryRaw.mockResolvedValue([
      statsRow('WeapG18_C', 4),
      statsRow('WeapJuliesKar98k_C', 2),
      statsRow('Dacia_A_03_v2_C', 1),
    ])

    const response = await getClanWeapons(new Request('http://localhost:3000/api/clans/3/telemetry/weapons?period=month'), {
      params: Promise.resolve({ clanId: '3' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.requireNavPermission).toHaveBeenCalledWith('clan.stats-weapons')
    expect(body.matchCount).toBe(0)
    expect(
      body.rows.map((row: Record<string, unknown>) => [row.weaponName, row.weaponKey, row.weaponCategoryCode, row.weaponCategoryLabel])
    ).toEqual([
      // Le P18C n'est plus rangé dans « Autre » (ancienne liste à 7 codes du service d'administration).
      ['WeapG18_C', 'p18c', 'PISTOL', 'Pistolets'],
      ['WeapJuliesKar98k_C', 'kar98k', 'SR', 'Snipers'],
      ['Dacia_A_03_v2_C', null, 'OTHER', 'Autre'],
    ])
    expect(body.rows[0]).toMatchObject({ weaponLabel: 'P18C', avgDistance: 45, maxDistance: 210, accuracy: 25 })
  })

  it('refuse un identifiant de clan invalide', async () => {
    const response = await getClanWeapons(new Request('http://localhost:3000/api/clans/abc/telemetry/weapons'), {
      params: Promise.resolve({ clanId: 'abc' }),
    })
    expect(response.status).toBe(400)
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })
})

describe('Anciennes adresses des armes → redirections (next.config.ts)', () => {
  it('redirige avant tout rendu : avec ?cat= la requête passe telle quelle, sans elle la première catégorie', async () => {
    const rules = await nextConfig.redirects!()
    const legacy = rules.filter((rule) => rule.source === '/clans/:clanId/stats/weapons/categories')
    expect(legacy).toEqual([
      expect.objectContaining({ has: [{ type: 'query', key: 'cat' }], destination: '/clans/:clanId/stats/weapons', permanent: false }),
      expect.objectContaining({ missing: [{ type: 'query', key: 'cat' }], destination: '/clans/:clanId/stats/weapons?cat=AR', permanent: false }),
    ])
  })

  it('l’ancien écran d’administration des catégories mène aux labels des armes', async () => {
    const rules = await nextConfig.redirects!()
    expect(rules).toContainEqual(
      expect.objectContaining({ source: '/settings/weapon-categories', destination: '/settings/weapon-labels', permanent: false })
    )
  })
})
