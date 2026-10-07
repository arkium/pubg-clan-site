import { prisma } from '@/lib/prisma'
import { normalizeNavRole, type NavRole, type NavSection, type NavItemDef } from '@/lib/nav-permissions-registry'

const VALID_ROLES: NavRole[] = ['none', 'member', 'owner', 'superuser', 'hidden']

const ROLE_TO_DISPLAY_SECTION: Record<string, string> = {
  owner: 'owner-menu',
  superuser: 'superuser-menu',
}

function getDisplaySection(row: {
  section: string
  sectionOverride: string | null
  roleOverride: string | null
  defaultRole: string
}): string {
  const effectiveRole = normalizeNavRole(row.roleOverride ?? row.defaultRole)
  return ROLE_TO_DISPLAY_SECTION[effectiveRole] ?? (row.sectionOverride ?? row.section)
}

/**
 * Clés de menu qui servent aussi de garde d'API (`requireNavPermission('…')`). Supprimer l'une d'elles
 * rendrait ses routes publiques (ligne absente = rôle `none`) : la suppression est refusée.
 * Liste tenue à jour par `nav-permissions-service.test.ts`, qui la compare au code des routes.
 */
export const NAV_GUARD_KEYS = [
  'clan.challenges',
  'clan.drop-zones',
  'clan.heatmap-kills',
  'clan.leaderboard',
  'clan.matches',
  'clan.members',
  'clan.overview',
  'clan.positions',
  'clan.stats',
  'clan.stats-weapons',
  'clan.zone-closures',
] as const

/** Lien interne au site uniquement : `/chemin`, jamais `//domaine.tld` ni `/\domaine.tld`. */
export function isInternalHref(href: string) {
  return /^\/(?![/\\])/.test(href)
}

function isValidRole(value: unknown): value is NavRole {
  return typeof value === 'string' && (VALID_ROLES as string[]).includes(value)
}

function isValidSection(value: unknown): value is NavSection {
  const SECTIONS: NavSection[] = [
    'nav-primary',
    'clan-section',
    'member-section',
    'admin-menu',
    'owner-menu',
    'superuser-menu',
  ]
  return typeof value === 'string' && SECTIONS.includes(value as NavSection)
}

// ─── Read from DB ─────────────────────────────────────────────────────────────

export async function getAllNavItems(): Promise<NavItemDef[]> {
  const rows = await prisma.navItem.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  return rows.map((row) => ({
    navKey: row.navKey,
    section: (row.sectionOverride ?? row.section) as NavSection,
    label: row.labelOverride ?? row.label,
    hrefTemplate: row.hrefTemplate,
    defaultRole: normalizeNavRole(row.roleOverride ?? row.defaultRole),
    description: row.description,
  }))
}

export async function getNavPermissions(): Promise<Array<{ navKey: string; role: NavRole }>> {
  const rows = await prisma.navItem.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  return rows.map((row) => ({
    navKey: row.navKey,
    role: normalizeNavRole(row.roleOverride ?? row.defaultRole),
  }))
}

export async function getNavItemRole(navKey: string): Promise<NavRole> {
  const row = await prisma.navItem.findUnique({ where: { navKey } })
  if (!row) return 'none'
  return normalizeNavRole(row.roleOverride ?? row.defaultRole)
}

export async function getNavPositions(): Promise<Record<string, string[]>> {
  const rows = await prisma.navItem.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
  const result: Record<string, string[]> = {}
  for (const row of rows) {
    const section = getDisplaySection(row)
    if (!result[section]) result[section] = []
    result[section].push(row.navKey)
  }
  return result
}

export async function getNavPromotedPositions(): Promise<Record<string, string[]>> {
  const rows = await prisma.navItem.findMany({
    where: { isActive: true, sectionOverride: { not: null } },
    orderBy: { sortOrder: 'asc' },
  })
  const result: Record<string, string[]> = {}
  for (const row of rows) {
    if (!row.sectionOverride) continue
    if (!result[row.sectionOverride]) result[row.sectionOverride] = []
    result[row.sectionOverride].push(row.navKey)
  }
  return result
}

export async function getNavLabels(): Promise<Record<string, string>> {
  const rows = await prisma.navItem.findMany({
    where: { isActive: true, labelOverride: { not: null } },
  })
  const result: Record<string, string> = {}
  for (const row of rows) {
    if (row.labelOverride) result[row.navKey] = row.labelOverride
  }
  return result
}

// ─── Write operations ─────────────────────────────────────────────────────────

export async function setNavPermission(navKey: string, role: NavRole): Promise<void> {
  const row = await prisma.navItem.findUnique({ where: { navKey } })
  if (!row) throw new Error(`Unknown navKey: ${navKey}`)
  if (!isValidRole(role)) throw new Error(`Invalid role: ${role}`)

  const override = role === row.defaultRole ? null : role
  await prisma.navItem.update({ where: { navKey }, data: { roleOverride: override } })
}

export async function setNavLabel(navKey: string, label: string): Promise<void> {
  const row = await prisma.navItem.findUnique({ where: { navKey } })
  if (!row) throw new Error(`Unknown navKey: ${navKey}`)

  const trimmed = label.trim()
  const override = !trimmed || trimmed === row.label ? null : trimmed
  await prisma.navItem.update({ where: { navKey }, data: { labelOverride: override } })
}

export async function setNavSectionOrder(section: NavSection, orderedKeys: string[]): Promise<void> {
  const rows = await prisma.navItem.findMany({ where: { isActive: true } })
  const inSection = rows.filter((r) => getDisplaySection(r) === section)
  const knownKeys = new Set(inSection.map((r) => r.navKey))

  const isValid = orderedKeys.length === knownKeys.size && orderedKeys.every((k) => knownKeys.has(k))
  if (!isValid) throw new Error(`Invalid orderedKeys for section: ${section}`)

  await prisma.$transaction(
    orderedKeys.map((key, i) => prisma.navItem.update({ where: { navKey: key }, data: { sortOrder: i } }))
  )
}

export async function setNavPromotedOrder(section: NavSection, orderedKeys: string[]): Promise<void> {
  const rows = await prisma.navItem.findMany({ where: { navKey: { in: orderedKeys } }, select: { navKey: true } })
  const knownKeys = new Set(rows.map((r) => r.navKey))
  const isValid = orderedKeys.every((k) => knownKeys.has(k))
  if (!isValid) throw new Error(`Invalid navKey in promoted order for section: ${section}`)

  await prisma.$transaction(
    orderedKeys.map((key, i) => prisma.navItem.update({ where: { navKey: key }, data: { sortOrder: i } }))
  )
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function createNavItem(data: {
  navKey: string
  section: NavSection
  label: string
  hrefTemplate: string
  defaultRole: NavRole
  description?: string
}): Promise<void> {
  if (!data.navKey.trim()) throw new Error('navKey requis')
  if (!isValidSection(data.section)) throw new Error(`Section invalide: ${data.section}`)
  if (!isValidRole(data.defaultRole)) throw new Error(`Rôle invalide: ${data.defaultRole}`)
  if (!isInternalHref(data.hrefTemplate)) throw new Error('hrefTemplate doit être un lien interne (/chemin)')

  const maxOrder = await prisma.navItem.aggregate({
    where: { section: data.section },
    _max: { sortOrder: true },
  })
  const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1

  await prisma.navItem.create({
    data: {
      navKey: data.navKey,
      section: data.section,
      label: data.label,
      hrefTemplate: data.hrefTemplate,
      defaultRole: data.defaultRole,
      description: data.description ?? '',
      sortOrder,
      isActive: true,
    },
  })
}

/**
 * `defaultRole` n'est pas modifiable ici : il vient du registre, le rôle se change par `setNavPermission`
 * (surcharge). Les champs inconnus du corps de requête sont ignorés.
 */
export async function updateNavItem(
  navKey: string,
  patch: Partial<Pick<NavItemDef, 'label' | 'hrefTemplate' | 'description'>>
): Promise<void> {
  const row = await prisma.navItem.findUnique({ where: { navKey } })
  if (!row) throw new Error(`Unknown navKey: ${navKey}`)

  const data: Record<string, unknown> = {}
  if (typeof patch.label === 'string') data.label = patch.label
  if (typeof patch.hrefTemplate === 'string') {
    if (!isInternalHref(patch.hrefTemplate)) throw new Error('hrefTemplate doit être un lien interne (/chemin)')
    data.hrefTemplate = patch.hrefTemplate
  }
  if (typeof patch.description === 'string') data.description = patch.description

  await prisma.navItem.update({ where: { navKey }, data })
}

export async function deleteNavItem(navKey: string): Promise<void> {
  if ((NAV_GUARD_KEYS as readonly string[]).includes(navKey)) {
    throw new Error(`${navKey} protège des routes d'API : la supprimer les rendrait publiques`)
  }
  const row = await prisma.navItem.findUnique({ where: { navKey } })
  if (!row) throw new Error(`Unknown navKey: ${navKey}`)
  await prisma.navItem.delete({ where: { navKey } })
}

export async function moveToSection(navKey: string, targetSection: NavSection): Promise<void> {
  if (!isValidSection(targetSection)) throw new Error(`Section invalide: ${targetSection}`)
  const row = await prisma.navItem.findUnique({ where: { navKey } })
  if (!row) throw new Error(`Unknown navKey: ${navKey}`)

  const override = targetSection === row.section ? null : targetSection
  await prisma.navItem.update({ where: { navKey }, data: { sectionOverride: override } })
}

// ─── Legacy compat (used by getItemRole in registry) ─────────────────────────

export async function getNavPermissionOverrides(): Promise<Record<string, NavRole>> {
  const rows = await prisma.navItem.findMany({
    where: { isActive: true, roleOverride: { not: null } },
  })
  const result: Record<string, NavRole> = {}
  for (const row of rows) {
    if (row.roleOverride) {
      result[row.navKey] = normalizeNavRole(row.roleOverride)
    }
  }
  return result
}
