import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma entièrement simulé : la base de .env est la production.
const mocks = vi.hoisted(() => ({
  navItemFindUnique: vi.fn(),
  navItemUpdate: vi.fn(),
  navItemDelete: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    navItem: { findUnique: mocks.navItemFindUnique, update: mocks.navItemUpdate, delete: mocks.navItemDelete },
  },
}))

import { deleteNavItem, isInternalHref, NAV_GUARD_KEYS, updateNavItem } from '@/lib/nav-permissions-service'

const API_ROOT = path.join(process.cwd(), 'src', 'app', 'api')

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const absolute = path.join(dir, entry)
    if (statSync(absolute).isDirectory()) return listRouteFiles(absolute)
    return entry === 'route.ts' ? [absolute] : []
  })
}

describe('nav-permissions-service', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.navItemFindUnique.mockResolvedValue({ navKey: 'clan.custom', label: 'Custom', defaultRole: 'member' })
  })

  it('NAV_GUARD_KEYS liste exactement les clés passées à requireNavPermission par les routes', () => {
    const used = new Set<string>()
    for (const file of listRouteFiles(API_ROOT)) {
      for (const match of readFileSync(file, 'utf8').matchAll(/requireNavPermission\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        used.add(match[1])
      }
    }
    expect([...used].sort()).toEqual([...NAV_GUARD_KEYS].sort())
  })

  it('refuse de supprimer une clé qui sert de garde d’API (elle rendrait ses routes publiques)', async () => {
    await expect(deleteNavItem('clan.overview')).rejects.toThrow(/rendrait publiques/)
    expect(mocks.navItemDelete).not.toHaveBeenCalled()

    await deleteNavItem('clan.custom')
    expect(mocks.navItemDelete).toHaveBeenCalledWith({ where: { navKey: 'clan.custom' } })
  })

  it('n’accepte que des liens internes', async () => {
    expect(isInternalHref('/clans/:clanId/stats')).toBe(true)
    expect(isInternalHref('//evil.example')).toBe(false)
    expect(isInternalHref('/\\evil.example')).toBe(false)
    expect(isInternalHref('https://evil.example')).toBe(false)

    await expect(updateNavItem('clan.custom', { hrefTemplate: '//evil.example' })).rejects.toThrow(/lien interne/)
    expect(mocks.navItemUpdate).not.toHaveBeenCalled()
  })

  it('ignore un defaultRole glissé dans la modification d’une entrée', async () => {
    await updateNavItem('clan.custom', { label: 'Nouveau', defaultRole: 'none' } as never)
    expect(mocks.navItemUpdate).toHaveBeenCalledWith({ where: { navKey: 'clan.custom' }, data: { label: 'Nouveau' } })
  })
})
