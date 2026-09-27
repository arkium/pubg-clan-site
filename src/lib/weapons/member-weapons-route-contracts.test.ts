import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Routes lues par la page Armes d'un joueur (docs/features/armes-joueur.md) : lancers sur la période de la page,
 * libellés du site sur la maîtrise PUBG. Prisma simulé : aucun accès à la base.
 */

const mocks = vi.hoisted(() => ({
  throwGroupBy: vi.fn(),
  masteryFindMany: vi.fn(),
  requireSameClanAsMember: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    memberThrowableStat: { groupBy: mocks.throwGroupBy },
    memberWeaponMastery: { findMany: mocks.masteryFindMany },
  },
}))

vi.mock('@/middleware/auth-permission', () => ({ requireSameClanAsMember: mocks.requireSameClanAsMember }))

vi.mock('@/lib/pubg', () => ({ fetchWeaponMastery: vi.fn(), searchPlayerByName: vi.fn() }))

vi.mock('@/lib/weapon-label-service', () => ({
  getWeaponLabels: async () => ({ WeapHK416_C: 'M416 (réglage)' }),
  weaponDisplayName: (name: string, labels: Record<string, string>) => labels[name] ?? name.replace(/^Weap/, '').replace(/_C$/, ''),
}))

import { GET as getThrowables } from '../../app/api/members/[id]/throwables/route'
import { GET as getMastery } from '../../app/api/members/[id]/weapon-mastery/route'

const memberParams = (id = '7') => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSameClanAsMember.mockResolvedValue(null)
})

describe('GET /api/members/[id]/throwables', () => {
  beforeEach(() => {
    mocks.throwGroupBy.mockResolvedValue([
      { itemId: 'Item_Weapon_SmokeBomb_C', _sum: { count: 4 } },
      { itemId: 'Item_Weapon_Grenade_C', _sum: { count: 9 } },
    ])
  })

  it('sans période : tous les lancers, triés du plus lancé au moins lancé', async () => {
    const response = await getThrowables(new Request('http://localhost/api/members/7/throwables'), memberParams())
    expect(mocks.throwGroupBy.mock.calls[0][0].where).toEqual({ memberId: 7 })
    expect((await response.json()).data).toEqual({
      period: 'all',
      totalThrows: 13,
      items: [
        { itemId: 'Item_Weapon_Grenade_C', count: 9 },
        { itemId: 'Item_Weapon_SmokeBomb_C', count: 4 },
      ],
    })
  })

  it('avec une période : seulement les parties de la semaine calendaire', async () => {
    const response = await getThrowables(new Request('http://localhost/api/members/7/throwables?period=week'), memberParams())
    const { matchDate } = mocks.throwGroupBy.mock.calls[0][0].where
    expect(matchDate.gte).toBeInstanceOf(Date)
    expect(matchDate.gte.getDay()).toBe(1)
    expect(matchDate.lt.getTime() - matchDate.gte.getTime()).toBeGreaterThanOrEqual(6.9 * 86_400_000)
    expect((await response.json()).data.period).toBe('week')
  })

  it('une période inconnue retombe sur tout l’historique', async () => {
    await getThrowables(new Request('http://localhost/api/members/7/throwables?period=year'), memberParams())
    expect(mocks.throwGroupBy.mock.calls[0][0].where).toEqual({ memberId: 7 })
  })
})

describe('GET /api/members/[id]/weapon-mastery', () => {
  it('ajoute le libellé du site, lu par l’identifiant télémétrie', async () => {
    mocks.masteryFindMany.mockResolvedValue([
      { weaponId: 'Item_Weapon_HK416_C', weaponName: 'HK416', kills: 10, tier: 2 },
      { weaponId: 'Item_Weapon_FNFal_C', weaponName: 'FNFal', kills: 3, tier: 0 },
    ])
    const response = await getMastery(new Request('http://localhost/api/members/7/weapon-mastery'), memberParams())
    const body = await response.json()
    expect(body.weapons.map((weapon: { weaponLabel: string }) => weapon.weaponLabel)).toEqual(['M416 (réglage)', 'FNFal'])
    expect(body.weapons[0]).toMatchObject({ weaponName: 'HK416', tier: 2 })
  })

  it('refuse un identifiant invalide sans lire la base', async () => {
    const response = await getMastery(new Request('http://localhost/api/members/abc/weapon-mastery'), memberParams('abc'))
    expect(response.status).toBe(400)
    expect(mocks.masteryFindMany).not.toHaveBeenCalled()
  })
})
