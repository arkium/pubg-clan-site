import type { NavItemDef } from '@/lib/nav-permissions-registry'

/**
 * Nettoyage des menus du lot 2 (docs/TODO/administration.md §6) — calcul pur, appliqué par
 * `scripts/cleanup-admin-nav.ts` (simulation par défaut, `--apply` pour écrire).
 */

export type NavItemRow = {
  navKey: string
  section: string
  label: string
  hrefTemplate: string
  defaultRole: string
  description: string
  sortOrder: number
  labelOverride: string | null
  roleOverride?: string | null
  sectionOverride?: string | null
}

/** Doublons et liens morts : deux entrées vers `/clans`, deux vers la navigation, pages supprimées. */
export const NAV_KEYS_TO_DELETE = [
  'owner.nav-permissions',
  'owner.switch-clan',
  'superuser.switch-clan',
  'admin.weapon-categories',
  'clan.reports',
  'clan.items',
] as const

/**
 * Entrées du registre absentes de la base : liens écrits en dur dans la barre latérale (pour pouvoir les masquer ou
 * les renommer) et pages Plateforme créées au lot 3a.
 */
export const NAV_KEYS_TO_CREATE = [
  'primary.mortar',
  'primary.resources',
  'primary.zone-reading',
  'superuser.players',
  'superuser.privacy-requests',
  'superuser.delegation',
  'owner.clan-data',
  // Lot 3c : journal des actions d'administration (Q10)
  'superuser.admin-journal',
] as const

/** Pages Plateforme déplacées au lot 3a : l'adresse en base suit le registre (l'ancienne reste redirigée). */
export const NAV_KEYS_HREF_FROM_REGISTRY = [
  'superuser.opponents',
  'superuser.clan-lifecycle',
  'superuser.database',
  'superuser.telemetry-recoveries',
  // Lot 3b : gestion des membres en onglets
  'clan.members-pending',
  'admin.add-player',
  // Lot 3b : outils de télémétrie sous « Données »
  'owner.telemetry-dashboard',
  'owner.telemetry-errors',
  'owner.telemetry-sync-batch',
  'owner.telemetry-recoveries',
  // Lot 3b : soirées de télémétrie (panneau d'exploitation) sous « Données »
  'owner.telemetry-matches',
] as const

/**
 * Entrées dont la place change (lot 3b, Q5) : section, adresse et rôle repris du registre, surcharges effacées.
 * « Adversaires rencontrés » quitte le menu Propriétaire pour les statistiques du clan, ouvertes à ses membres.
 */
export const NAV_KEYS_RESET_FROM_REGISTRY = ['owner.encountered-opponents'] as const

/** Libellés de base alignés sur le registre (libellés francisés, et « Stats armes » resté en base). */
export const NAV_KEYS_LABEL_FROM_REGISTRY = [
  'owner.telemetry-dashboard',
  'owner.telemetry-matches',
  'owner.telemetry-sync-batch',
  'owner.telemetry-recoveries',
  'owner.email-delivery',
  'owner.pubg-api',
  'superuser.cron',
  'superuser.telemetry-recoveries',
  'superuser.platform-settings',
  'superuser.opponents',
  'clan.stats-weapons',
] as const

export type NavCleanupPlan = {
  deletes: string[]
  creates: Array<NavItemDef & { sortOrder: number }>
  labelUpdates: Array<{ navKey: string; from: string; to: string; clearOverride: boolean }>
  hrefUpdates: Array<{ navKey: string; from: string; to: string }>
  resets: Array<{ navKey: string; section: string; hrefTemplate: string; defaultRole: string }>
}

export function planNavCleanup(rows: readonly NavItemRow[], registry: readonly NavItemDef[]): NavCleanupPlan {
  const byKey = new Map(rows.map((row) => [row.navKey, row]))
  const registryByKey = new Map(registry.map((item) => [item.navKey, item]))

  const deletes = NAV_KEYS_TO_DELETE.filter((navKey) => byKey.has(navKey))

  const creates: NavCleanupPlan['creates'] = []
  for (const navKey of NAV_KEYS_TO_CREATE) {
    const definition = registryByKey.get(navKey)
    if (!definition || byKey.has(navKey)) continue
    const inSection = rows.filter((row) => row.section === definition.section).map((row) => row.sortOrder)
    const createdInSection = creates.filter((item) => item.section === definition.section).map((item) => item.sortOrder)
    const nextOrder = Math.max(-1, ...inSection, ...createdInSection) + 1
    creates.push({ ...definition, sortOrder: nextOrder })
  }

  const labelUpdates: NavCleanupPlan['labelUpdates'] = []
  for (const navKey of NAV_KEYS_LABEL_FROM_REGISTRY) {
    const row = byKey.get(navKey)
    const definition = registryByKey.get(navKey)
    if (!row || !definition) continue
    const clearOverride = row.labelOverride === definition.label
    if (row.label === definition.label && !clearOverride) continue
    labelUpdates.push({ navKey, from: row.label, to: definition.label, clearOverride })
  }

  const hrefUpdates: NavCleanupPlan['hrefUpdates'] = []
  for (const navKey of NAV_KEYS_HREF_FROM_REGISTRY) {
    const row = byKey.get(navKey)
    const definition = registryByKey.get(navKey)
    if (!row || !definition || row.hrefTemplate === definition.hrefTemplate) continue
    hrefUpdates.push({ navKey, from: row.hrefTemplate, to: definition.hrefTemplate })
  }

  const resets: NavCleanupPlan['resets'] = []
  for (const navKey of NAV_KEYS_RESET_FROM_REGISTRY) {
    const row = byKey.get(navKey)
    const definition = registryByKey.get(navKey)
    if (!row || !definition) continue
    const aligned =
      row.section === definition.section &&
      row.hrefTemplate === definition.hrefTemplate &&
      row.defaultRole === definition.defaultRole &&
      !row.roleOverride &&
      !row.sectionOverride
    if (aligned) continue
    resets.push({
      navKey,
      section: definition.section,
      hrefTemplate: definition.hrefTemplate,
      defaultRole: definition.defaultRole,
    })
  }

  return {
    deletes,
    creates,
    labelUpdates,
    hrefUpdates: hrefUpdates.filter((update) => !resets.some((reset) => reset.navKey === update.navKey)),
    resets,
  }
}

export function isEmptyNavCleanupPlan(plan: NavCleanupPlan) {
  return (
    plan.deletes.length === 0 &&
    plan.creates.length === 0 &&
    plan.labelUpdates.length === 0 &&
    plan.hrefUpdates.length === 0 &&
    plan.resets.length === 0
  )
}
