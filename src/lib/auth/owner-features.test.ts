import { beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma entièrement simulé : la base de .env est la production.
const mocks = vi.hoisted(() => ({
  appConfigFindUnique: vi.fn(),
  appConfigUpsert: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    appConfig: { findUnique: mocks.appConfigFindUnique, upsert: mocks.appConfigUpsert },
  },
}))

import {
  isNavKeyClosedToOwners,
  ownerFeatureOfNavKey,
} from '@/lib/auth/owner-feature-catalog'
import {
  getOwnerFeatureAccess,
  getOwnerFeatureAccessMap,
  OWNER_FEATURE_ACCESS_CONFIG_KEY,
  OWNER_FEATURE_KEYS,
  parseOwnerFeatureAccess,
  resetOwnerFeatureAccessCache,
  setOwnerFeatureAccess,
} from '@/lib/auth/owner-features'

describe('parseOwnerFeatureAccess', () => {
  it('applique les valeurs par défaut du catalogue quand rien n’est enregistré', () => {
    expect(parseOwnerFeatureAccess(null)).toEqual({
      'clan-members': 'owner',
      'clan-announcements': 'owner',
      'clan-competition': 'owner',
      'clan-data-health': 'owner',
      'clan-telemetry-tools': 'superuser',
    })
  })

  it('lit les réglages enregistrés et ignore les clés et valeurs inconnues', () => {
    const parsed = parseOwnerFeatureAccess(
      JSON.stringify({ 'clan-members': 'superuser', 'clan-competition': 'none', 'inconnue': 'owner' })
    )
    expect(parsed['clan-members']).toBe('superuser')
    expect(parsed['clan-competition']).toBe('owner')
    expect(Object.keys(parsed).sort()).toEqual([...OWNER_FEATURE_KEYS].sort())
  })

  it('garde une fonctionnalité verrouillée réservée au SuperUser même si la base dit owner', () => {
    expect(parseOwnerFeatureAccess(JSON.stringify({ 'clan-telemetry-tools': 'owner' }))['clan-telemetry-tools']).toBe(
      'superuser'
    )
  })

  it('retombe sur les valeurs par défaut quand le JSON est invalide', () => {
    expect(parseOwnerFeatureAccess('{pas du json')['clan-members']).toBe('owner')
    expect(parseOwnerFeatureAccess('["owner"]')['clan-members']).toBe('owner')
  })
})

describe('lecture et écriture du réglage', () => {
  beforeEach(() => {
    resetOwnerFeatureAccessCache()
    mocks.appConfigFindUnique.mockReset()
    mocks.appConfigUpsert.mockReset()
  })

  it('ferme tout aux Owners quand la base ne répond pas', async () => {
    mocks.appConfigFindUnique.mockRejectedValue(new Error('base indisponible'))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const map = await getOwnerFeatureAccessMap()
    expect(Object.values(map).every((access) => access === 'superuser')).toBe(true)
  })

  it('lit la clé AppConfig dédiée', async () => {
    mocks.appConfigFindUnique.mockResolvedValue({ value: JSON.stringify({ 'clan-members': 'superuser' }) })

    expect(await getOwnerFeatureAccess('clan-members')).toBe('superuser')
    expect(mocks.appConfigFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: OWNER_FEATURE_ACCESS_CONFIG_KEY } })
    )
  })

  it('refuse d’ouvrir aux Owners une fonctionnalité verrouillée', async () => {
    await expect(setOwnerFeatureAccess('clan-telemetry-tools', 'owner')).rejects.toThrow(/locked/)
    expect(mocks.appConfigUpsert).not.toHaveBeenCalled()
  })

  it('enregistre un réglage en conservant les autres', async () => {
    mocks.appConfigFindUnique.mockResolvedValue({ value: JSON.stringify({ 'clan-competition': 'superuser' }) })
    mocks.appConfigUpsert.mockResolvedValue({})

    const next = await setOwnerFeatureAccess('clan-members', 'superuser')

    expect(next['clan-members']).toBe('superuser')
    expect(next['clan-competition']).toBe('superuser')
    const written = JSON.parse(mocks.appConfigUpsert.mock.calls[0][0].update.value)
    expect(written['clan-members']).toBe('superuser')
    expect(await getOwnerFeatureAccess('clan-members')).toBe('superuser')
  })
})

describe('menus et fonctionnalités', () => {
  it('rattache chaque entrée de menu d’administration de clan à sa fonctionnalité', () => {
    expect(ownerFeatureOfNavKey('admin.discord-notifications')).toBe('clan-announcements')
    expect(ownerFeatureOfNavKey('owner.telemetry-errors')).toBe('clan-telemetry-tools')
    expect(ownerFeatureOfNavKey('clan.overview')).toBeNull()
  })

  it('masque aux Owners une entrée dont la fonctionnalité leur est fermée', () => {
    expect(isNavKeyClosedToOwners('owner.telemetry-dashboard', null)).toBe(true)
    expect(isNavKeyClosedToOwners('clan.tournaments', null)).toBe(false)
    expect(isNavKeyClosedToOwners('clan.tournaments', { 'clan-competition': 'superuser' })).toBe(true)
    expect(isNavKeyClosedToOwners('clan.overview', { 'clan-competition': 'superuser' })).toBe(false)
  })
})
