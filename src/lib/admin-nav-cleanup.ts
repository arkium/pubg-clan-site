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

/** Entrées du registre écrites en dur dans la barre latérale, à créer en base pour pouvoir les masquer ou renommer. */
export const NAV_KEYS_TO_CREATE = ['primary.mortar', 'primary.resources', 'primary.zone-reading'] as const

/** Libellés de base alignés sur le registre (libellés francisés, et « Stats armes » resté en base). */
export const NAV_KEYS_LABEL_FROM_REGISTRY = [
  'owner.telemetry-dashboard',
  'owner.telemetry-sync-batch',
  'owner.telemetry-recoveries',
  'owner.email-delivery',
  'owner.pubg-api',
  'superuser.cron',
  'superuser.telemetry-recoveries',
  'superuser.platform-settings',
  'clan.stats-weapons',
] as const

export type NavCleanupPlan = {
  deletes: string[]
  creates: Array<NavItemDef & { sortOrder: number }>
  labelUpdates: Array<{ navKey: string; from: string; to: string; clearOverride: boolean }>
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
    const nextOrder = Math.max(-1, ...inSection, ...creates.map((item) => item.sortOrder)) + 1
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

  return { deletes, creates, labelUpdates }
}

export function isEmptyNavCleanupPlan(plan: NavCleanupPlan) {
  return plan.deletes.length === 0 && plan.creates.length === 0 && plan.labelUpdates.length === 0
}
