import { describe, expect, it } from 'vitest'

import { planNavCleanup, type NavItemRow } from '@/lib/admin-nav-cleanup'
import { planAdminRoleCleanup } from '@/lib/admin-roles-cleanup'
import { NAV_REGISTRY } from '@/lib/nav-permissions-registry'
import { NAV_GUARD_KEYS } from '@/lib/nav-permissions-service'

// Plans des scripts du lot 2 (scripts/cleanup-admin-nav.ts, scripts/remove-admin-moderator-roles.ts) : calcul pur,
// aucune base touchée.

function row(navKey: string, overrides: Partial<NavItemRow> = {}): NavItemRow {
  const definition = NAV_REGISTRY.find((item) => item.navKey === navKey)
  return {
    navKey,
    section: definition?.section ?? 'clan-section',
    label: definition?.label ?? navKey,
    hrefTemplate: definition?.hrefTemplate ?? '/',
    defaultRole: definition?.defaultRole ?? 'none',
    description: '',
    sortOrder: 0,
    labelOverride: null,
    ...overrides,
  }
}

describe('planNavCleanup', () => {
  it('supprime les doublons présents, crée les entrées manquantes, aligne les libellés', () => {
    const armory = NAV_REGISTRY.find((item) => item.navKey === 'clan.stats-weapons')!.label
    const rows = [
      row('primary.home', { section: 'nav-primary', sortOrder: 4 }),
      row('owner.switch-clan'),
      row('superuser.switch-clan'),
      row('clan.reports'),
      row('owner.telemetry-dashboard', { label: 'Dashboard télémétrie' }),
      // En production : base « Stats armes », surcharge égale au libellé du registre
      row('clan.stats-weapons', { label: 'Stats armes', labelOverride: armory }),
    ]

    const plan = planNavCleanup(rows, NAV_REGISTRY)

    expect(plan.deletes.sort()).toEqual(['clan.reports', 'owner.switch-clan', 'superuser.switch-clan'])
    expect(plan.creates.map((item) => [item.navKey, item.sortOrder])).toEqual([
      ['primary.mortar', 5],
      ['primary.resources', 6],
      ['primary.zone-reading', 7],
      ['superuser.players', 0],
      ['superuser.privacy-requests', 1],
    ])
    expect(plan.labelUpdates).toEqual([
      { navKey: 'owner.telemetry-dashboard', from: 'Dashboard télémétrie', to: 'État de la télémétrie', clearOverride: false },
      { navKey: 'clan.stats-weapons', from: 'Stats armes', to: armory, clearOverride: true },
    ])
  })

  it('suit les nouvelles adresses des pages Plateforme', () => {
    const plan = planNavCleanup(
      [
        row('superuser.opponents', { label: 'Clans', hrefTemplate: '/settings/opponents' }),
        row('superuser.database', { hrefTemplate: '/settings/superuser/database' }),
      ],
      NAV_REGISTRY
    )
    expect(plan.hrefUpdates).toEqual([
      { navKey: 'superuser.opponents', from: '/settings/opponents', to: '/settings/clans' },
      { navKey: 'superuser.database', from: '/settings/superuser/database', to: '/settings/database' },
    ])
  })

  it('est idempotent : un second passage ne trouve rien', () => {
    const rows = [
      row('primary.mortar'),
      row('primary.resources'),
      row('primary.zone-reading'),
      row('superuser.players'),
      row('superuser.privacy-requests'),
      row('superuser.opponents'),
      row('owner.pubg-api'),
    ]
    const plan = planNavCleanup(rows, NAV_REGISTRY)
    expect(plan).toEqual({ deletes: [], creates: [], labelUpdates: [], hrefUpdates: [] })
  })

  it('ne supprime jamais une clé qui protège des routes d’API', () => {
    const plan = planNavCleanup(NAV_GUARD_KEYS.map((navKey) => row(navKey)), NAV_REGISTRY)
    expect(plan.deletes).toEqual([])
  })
})

describe('planAdminRoleCleanup', () => {
  it('bloque tant qu’un rôle Admin ou Moderator est attribué', () => {
    const plan = planAdminRoleCleanup(
      [
        { id: 1, clanId: 7, name: 'Admin', assignmentCount: 0 },
        { id: 2, clanId: 7, name: 'Moderator', assignmentCount: 1 },
      ],
      []
    )
    expect(plan.blockers.map((role) => role.id)).toEqual([2])
    expect(plan.roleIdsToDelete).toEqual([1, 2])
  })

  it('passe les menus admin à owner et efface une surcharge devenue identique', () => {
    const plan = planAdminRoleCleanup([], [
      { navKey: 'admin.discord-notifications', defaultRole: 'admin', roleOverride: null },
      { navKey: 'admin.players-roles', defaultRole: 'admin', roleOverride: 'owner' },
      { navKey: 'admin.map-labels', defaultRole: 'admin', roleOverride: 'superuser' },
      { navKey: 'clan.members-pending', defaultRole: 'owner', roleOverride: 'admin' },
      { navKey: 'clan.overview', defaultRole: 'none', roleOverride: null },
    ])
    expect(plan.navRoleFixes).toEqual([
      { navKey: 'admin.discord-notifications', defaultRole: 'owner', roleOverride: null },
      { navKey: 'admin.players-roles', defaultRole: 'owner', roleOverride: null },
      { navKey: 'admin.map-labels', defaultRole: 'owner', roleOverride: 'superuser' },
      { navKey: 'clan.members-pending', defaultRole: 'owner', roleOverride: null },
    ])
    expect(plan.blockers).toEqual([])
  })
})
