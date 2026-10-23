import { describe, expect, it } from 'vitest'

import { planNavCleanup, type NavCleanupPlan, type NavItemRow } from '@/lib/admin-nav-cleanup'
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
      row('superuser.cron', { label: 'Ops Cron' }),
      // En production : base « Stats armes », surcharge égale au libellé du registre
      row('clan.stats-weapons', { label: 'Stats armes', labelOverride: armory }),
    ]

    const plan = planNavCleanup(rows, NAV_REGISTRY)

    expect(plan.deletes.sort()).toEqual(['clan.reports', 'owner.switch-clan', 'superuser.switch-clan'])
    expect(plan.creates.map((item) => [item.navKey, item.sortOrder])).toEqual([
      ['primary.mortar', 5],
      ['primary.resources', 6],
      ['primary.zone-reading', 7],
      // Après `superuser.cron` (position 0 du menu Plateforme).
      ['superuser.players', 1],
      ['superuser.privacy-requests', 2],
      ['superuser.delegation', 3],
      ['superuser.clan-data', 4],
      ['superuser.admin-journal', 5],
    ])
    expect(plan.labelUpdates).toEqual([
      { navKey: 'superuser.cron', from: 'Ops Cron', to: 'Tâches planifiées', clearOverride: false },
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

  it('déplace « Adversaires rencontrés » dans les statistiques du clan, surcharges effacées (Q5)', () => {
    const plan = planNavCleanup(
      [
        row('owner.encountered-opponents', {
          section: 'owner-menu',
          hrefTemplate: '/clans/:clanId/telemetry/opponents',
          defaultRole: 'owner',
          roleOverride: 'superuser',
        }),
      ],
      NAV_REGISTRY
    )
    expect(plan.resets).toEqual([
      {
        navKey: 'owner.encountered-opponents',
        section: 'clan-section',
        hrefTemplate: '/clans/:clanId/stats/opponents',
        defaultRole: 'member',
      },
    ])
  })

  it('ouvre la page Cartes du clan aux visiteurs, à sa nouvelle adresse (2026-10-23)', () => {
    const rows = [
      row('clan.heatmap-kills', {
        label: 'Heatmap kills',
        hrefTemplate: '/clans/:clanId/stats/heatmap-kills',
        roleOverride: 'superuser',
      }),
    ]
    const plan = planNavCleanup(rows, NAV_REGISTRY)
    expect(plan.resets).toEqual([
      { navKey: 'clan.heatmap-kills', section: 'clan-section', hrefTemplate: '/clans/:clanId/stats/maps', defaultRole: 'none' },
    ])
    expect(plan.labelUpdates).toEqual([{ navKey: 'clan.heatmap-kills', from: 'Heatmap kills', to: 'Cartes', clearOverride: false }])
    expect(plan.hrefUpdates).toEqual([])
    expect(plan.deletes).toEqual([])

    const after = applyNavPlan(rows, plan)
    expect(after[0]).toMatchObject({ label: 'Cartes', hrefTemplate: '/clans/:clanId/stats/maps', roleOverride: null })
    expect(planNavCleanup(after, NAV_REGISTRY)).toEqual({ deletes: [], renames: [], creates: [], labelUpdates: [], hrefUpdates: [], resets: [] })
  })

  it('est idempotent : un second passage ne trouve rien', () => {
    const rows = [
      row('primary.mortar'),
      row('primary.resources'),
      row('primary.zone-reading'),
      row('superuser.players'),
      row('superuser.privacy-requests'),
      row('superuser.delegation'),
      row('superuser.clan-data'),
      row('superuser.admin-journal'),
      row('superuser.opponents'),
      row('superuser.pubg-api'),
    ]
    const plan = planNavCleanup(rows, NAV_REGISTRY)
    expect(plan).toEqual({ deletes: [], renames: [], creates: [], labelUpdates: [], hrefUpdates: [], resets: [] })
  })

  it('ne supprime jamais une clé qui protège des routes d’API', () => {
    const plan = planNavCleanup(NAV_GUARD_KEYS.map((navKey) => row(navKey)), NAV_REGISTRY)
    expect(plan.deletes).toEqual([])
  })
})

/** Lignes après application d'un plan, comme les écrit scripts/cleanup-admin-nav.ts. */
function applyNavPlan(rows: NavItemRow[], plan: NavCleanupPlan): NavItemRow[] {
  const next = rows
    .filter((item) => !plan.deletes.includes(item.navKey))
    .map((item) => {
      const rename = plan.renames.find((candidate) => candidate.from === item.navKey)
      if (!rename) return item
      return {
        ...item,
        navKey: rename.to,
        section: rename.section,
        defaultRole: rename.defaultRole,
        sectionOverride: rename.clearSectionOverride ? null : item.sectionOverride,
        roleOverride: rename.clearRoleOverride ? null : item.roleOverride,
      }
    })
  for (const created of plan.creates) next.push(row(created.navKey, { section: created.section, sortOrder: created.sortOrder }))
  return next.map((item) => {
    const label = plan.labelUpdates.find((update) => update.navKey === item.navKey)
    const href = plan.hrefUpdates.find((update) => update.navKey === item.navKey)
    const reset = plan.resets.find((candidate) => candidate.navKey === item.navKey)
    return {
      ...item,
      ...(label ? { label: label.to, ...(label.clearOverride ? { labelOverride: null } : {}) } : {}),
      ...(href ? { hrefTemplate: href.to } : {}),
      ...(reset
        ? { section: reset.section, hrefTemplate: reset.hrefTemplate, defaultRole: reset.defaultRole, roleOverride: null, sectionOverride: null }
        : {}),
    }
  })
}

/**
 * Lignes `NavItem` des menus Propriétaire et Plateforme en production, lues le 2026-10-11 (lecture seule,
 * docs/TODO/administration.md §8.5) : le script des lots 2 et 3 n'avait pas encore été appliqué.
 */
function productionRows(): NavItemRow[] {
  const toPlatform = { sectionOverride: 'superuser-menu', roleOverride: 'superuser' }
  return [
    row('admin.map-labels', { section: 'admin-menu', defaultRole: 'admin', ...toPlatform, sortOrder: 36 }),
    row('admin.weapon-categories', { section: 'admin-menu', defaultRole: 'admin', hrefTemplate: '/settings/weapon-categories', ...toPlatform, sortOrder: 38 }),
    row('owner.telemetry-dashboard', { section: 'owner-menu', defaultRole: 'owner', label: 'Dashboard télémétrie', hrefTemplate: '/clans/:clanId/telemetry/dashboard', ...toPlatform, sortOrder: 42 }),
    row('owner.telemetry-errors', { section: 'owner-menu', defaultRole: 'owner', label: 'Erreurs télémétrie', hrefTemplate: '/clans/:clanId/telemetry/errors', ...toPlatform, sortOrder: 43 }),
    row('owner.telemetry-sync-batch', { section: 'owner-menu', defaultRole: 'owner', label: 'Sync batch manuel', hrefTemplate: '/clans/:clanId/telemetry/sync-batch-manual', ...toPlatform, sortOrder: 44 }),
    row('owner.telemetry-recoveries', { section: 'owner-menu', defaultRole: 'owner', label: 'Recoveries telemetry', hrefTemplate: '/clans/:clanId/telemetry/recoveries', ...toPlatform, sortOrder: 45 }),
    row('owner.telemetry-matches', { section: 'owner-menu', defaultRole: 'owner', label: 'Télémétrie matchs', hrefTemplate: '/clans/:clanId/telemetry/matches', roleOverride: 'superuser', sortOrder: 46 }),
    row('owner.encountered-opponents', { section: 'owner-menu', defaultRole: 'owner', hrefTemplate: '/clans/:clanId/telemetry/opponents', roleOverride: 'superuser', sortOrder: 47 }),
    row('owner.email-delivery', { section: 'owner-menu', defaultRole: 'owner', label: 'Test email', hrefTemplate: '/settings/email-delivery', ...toPlatform, sortOrder: 48 }),
    row('owner.pubg-api', { section: 'owner-menu', defaultRole: 'owner', label: 'Monitoring PUBG API', hrefTemplate: '/settings/pubg-api', ...toPlatform, sortOrder: 49 }),
    row('owner.nav-permissions', { section: 'owner-menu', defaultRole: 'owner', hrefTemplate: '/settings/nav-permissions', roleOverride: 'superuser', sortOrder: 50 }),
    row('owner.switch-clan', { section: 'owner-menu', defaultRole: 'owner', hrefTemplate: '/clans', ...toPlatform, sortOrder: 51 }),
    row('superuser.cron', { label: 'Ops Cron', sortOrder: 52 }),
    row('superuser.switch-clan', { section: 'superuser-menu', defaultRole: 'superuser', hrefTemplate: '/clans', sortOrder: 53 }),
    row('superuser.telemetry-recoveries', { label: 'Telemetrie cross-clans', hrefTemplate: '/settings/telemetry-recoveries', sortOrder: 55 }),
    row('superuser.database', { hrefTemplate: '/settings/superuser/database', sortOrder: 59 }),
    row('superuser.site-config', { sortOrder: 61 }),
  ]
}

describe('planNavCleanup — Données du clan (§8)', () => {
  it('supprime les cinq cartes de télémétrie au lieu de les masquer', () => {
    const plan = planNavCleanup(productionRows(), NAV_REGISTRY)
    expect(plan.deletes).toEqual(
      expect.arrayContaining([
        'owner.telemetry-dashboard',
        'owner.telemetry-errors',
        'owner.telemetry-sync-batch',
        'owner.telemetry-recoveries',
        'owner.telemetry-matches',
      ])
    )
    // Plus aucune mise à jour pour des lignes supprimées.
    const touched = [...plan.labelUpdates, ...plan.hrefUpdates].map((update) => update.navKey)
    expect(touched.filter((navKey) => navKey.startsWith('owner.telemetry-'))).toEqual([])
  })

  it('renomme les clés owner.* réservées au SuperUser et efface les surcharges devenues identiques', () => {
    const plan = planNavCleanup(productionRows(), NAV_REGISTRY)
    expect(plan.renames).toEqual([
      {
        from: 'owner.email-delivery',
        to: 'superuser.email-delivery',
        section: 'superuser-menu',
        defaultRole: 'superuser',
        clearSectionOverride: true,
        clearRoleOverride: true,
      },
      {
        from: 'owner.pubg-api',
        to: 'superuser.pubg-api',
        section: 'superuser-menu',
        defaultRole: 'superuser',
        clearSectionOverride: true,
        clearRoleOverride: true,
      },
    ])
    // Les libellés francisés visent les nouvelles clés, appliqués après le renommage.
    expect(plan.labelUpdates).toEqual(
      expect.arrayContaining([
        { navKey: 'superuser.email-delivery', from: 'Test email', to: 'Email d’envoi', clearOverride: false },
        { navKey: 'superuser.pubg-api', from: 'Monitoring PUBG API', to: 'API PUBG', clearOverride: false },
      ])
    )
    expect(plan.creates.map((item) => item.navKey)).toContain('superuser.clan-data')
    expect(plan.creates.map((item) => item.navKey)).not.toContain('owner.clan-data')
  })

  it('garde une surcharge qui dit autre chose que la nouvelle base (libellé, entrée masquée)', () => {
    const rows = [row('owner.pubg-api', { section: 'owner-menu', defaultRole: 'owner', roleOverride: 'hidden', labelOverride: 'Quota PUBG' })]
    const plan = planNavCleanup(rows, NAV_REGISTRY)
    expect(plan.renames).toEqual([
      expect.objectContaining({ from: 'owner.pubg-api', to: 'superuser.pubg-api', clearSectionOverride: false, clearRoleOverride: false }),
    ])
    const [after] = applyNavPlan(rows, plan)
    expect(after).toMatchObject({ navKey: 'superuser.pubg-api', roleOverride: 'hidden', labelOverride: 'Quota PUBG' })
  })

  it('renomme `owner.clan-data` si un passage précédent l’a créée', () => {
    const plan = planNavCleanup([row('owner.clan-data', { section: 'owner-menu', defaultRole: 'superuser' })], NAV_REGISTRY)
    expect(plan.renames.map((rename) => [rename.from, rename.to])).toEqual([['owner.clan-data', 'superuser.clan-data']])
    expect(plan.creates.map((item) => item.navKey)).not.toContain('superuser.clan-data')
  })

  it('supprime l’ancienne clé quand la nouvelle existe déjà', () => {
    const plan = planNavCleanup([row('owner.pubg-api'), row('superuser.pubg-api')], NAV_REGISTRY)
    expect(plan.renames).toEqual([])
    expect(plan.deletes).toContain('owner.pubg-api')
  })

  it('appliqué sur la production, un second passage ne trouve plus rien', () => {
    const rows = productionRows()
    const after = applyNavPlan(rows, planNavCleanup(rows, NAV_REGISTRY))
    expect(planNavCleanup(after, NAV_REGISTRY)).toEqual({ deletes: [], renames: [], creates: [], labelUpdates: [], hrefUpdates: [], resets: [] })
    expect(after.map((item) => item.navKey).filter((navKey) => navKey.startsWith('owner.') && navKey !== 'owner.encountered-opponents')).toEqual([])
    expect(after.find((item) => item.navKey === 'superuser.clan-data')).toMatchObject({ section: 'superuser-menu', hrefTemplate: '/clans/:clanId/settings/data' })
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
