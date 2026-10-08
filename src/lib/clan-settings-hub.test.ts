import { isValidElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Accueil « Paramètres du clan » (/clans/[clanId]/settings) : deux sections, « Gestion du clan » (Owner, selon la
// délégation) et « Réservé au SuperUser » (télémétrie, sous-domaine et suivi), invisible des Owners.
const mocks = vi.hoisted(() => ({
  session: null as null | { userId: number; activeMemberId: number | null; isSuperUser: boolean },
  closed: new Set<string>(),
}))

vi.mock('@/lib/auth-session', () => ({ getServerComponentSession: async () => mocks.session }))
vi.mock('@/lib/auth/admin-guards', () => ({
  decideClanFeature: async (session: { isSuperUser: boolean } | null, _clanId: number, feature: string) => ({
    allowed: Boolean(session) && (session!.isSuperUser || !mocks.closed.has(feature)),
  }),
  decidePlatformAdmin: (session: { isSuperUser: boolean } | null) => ({ allowed: Boolean(session?.isSuperUser) }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { clan: { findUnique: async () => ({ name: 'Clan Démo' }) } } }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

import ClanSettingsHub from '@/app/clans/[clanId]/settings/page'

type Tile = { href: string; superUser?: boolean }

function walk(node: ReactNode, visit: (props: Record<string, unknown>) => void) {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit))
  if (!isValidElement(node)) return
  const props = node.props as Record<string, unknown>
  visit(props)
  walk(props.children as ReactNode, visit)
}

async function render() {
  const tree = await ClanSettingsHub({ params: Promise.resolve({ clanId: '7' }) })
  const tiles: Tile[] = []
  const headings: string[] = []
  const links: string[] = []
  walk(tree, (props) => {
    if (props.tile) tiles.push(props.tile as Tile)
    if (typeof props.id === 'string' && props.id.startsWith('clan-settings-')) headings.push(props.id)
    if (typeof props.href === 'string') links.push(props.href)
  })
  return { tiles, headings, links }
}

describe('accueil « Paramètres du clan »', () => {
  beforeEach(() => {
    mocks.session = null
    mocks.closed = new Set()
  })

  it('Owner : la gestion du clan seulement, aucune trace de la section SuperUser', async () => {
    mocks.session = { userId: 3, activeMemberId: 42, isSuperUser: false }
    const { tiles, headings } = await render()

    expect(headings).toEqual(['clan-settings-owner'])
    expect(tiles.map((tile) => tile.href)).toEqual([
      '/clans/7/settings/members',
      '/clans/7/settings/login-welcome',
      '/clans/7/settings/discord',
      '/clans/7/settings/tournaments',
    ])
    expect(tiles.some((tile) => tile.superUser)).toBe(false)
  })

  it('Owner : une fonctionnalité fermée par la délégation disparaît', async () => {
    mocks.session = { userId: 3, activeMemberId: 42, isSuperUser: false }
    mocks.closed = new Set(['clan-competition'])
    const { tiles } = await render()
    expect(tiles.map((tile) => tile.href)).not.toContain('/clans/7/settings/tournaments')
  })

  it('SuperUser : les deux sections, Données et sous-domaine marqués SuperUser', async () => {
    mocks.session = { userId: 1, activeMemberId: null, isSuperUser: true }
    const { tiles, headings } = await render()

    expect(headings).toEqual(['clan-settings-owner', 'clan-settings-superuser'])
    expect(tiles.filter((tile) => tile.superUser).map((tile) => tile.href)).toEqual([
      '/clans/7/settings/data',
      '/settings/clans/7',
    ])
  })

  it('sans session : invitation à se connecter, aucun outil', async () => {
    const { tiles, headings, links } = await render()
    expect(tiles).toEqual([])
    expect(headings).toEqual([])
    expect(links).toContain(`/login?redirect=${encodeURIComponent('/clans/7/settings')}`)
  })
})
