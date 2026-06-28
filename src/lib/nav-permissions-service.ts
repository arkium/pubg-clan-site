import { prisma } from '@/lib/prisma'
import type { NavRole, NavSection, NavItemDef } from '@/lib/nav-permissions-registry'

const VALID_ROLES: NavRole[] = ['none', 'member', 'admin', 'owner', 'superuser', 'hidden']

const ROLE_TO_DISPLAY_SECTION: Record<string, string> = {
  admin: 'admin-menu',
  owner: 'owner-menu',
  superuser: 'superuser-menu',
}

function getDisplaySection(row: {
  section: string
  sectionOverride: string | null
  roleOverride: string | null
  defaultRole: string
}): string {
  const effectiveRole = row.roleOverride ?? row.defaultRole
  return ROLE_TO_DISPLAY_SECTION[effectiveRole] ?? (row.sectionOverride ?? row.section)
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
    defaultRole: (row.roleOverride ?? row.defaultRole) as NavRole,
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
    role: (row.roleOverride ?? row.defaultRole) as NavRole,
  }))
}

export async function getNavItemRole(navKey: string): Promise<NavRole> {
  const row = await prisma.navItem.findUnique({ where: { navKey } })
  if (!row) return 'none'
  return (row.roleOverride ?? row.defaultRole) as NavRole
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
  if (!data.hrefTemplate.startsWith('/')) throw new Error('hrefTemplate doit commencer par /')

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

export async function updateNavItem(
  navKey: string,
  patch: Partial<Pick<NavItemDef, 'label' | 'hrefTemplate' | 'description'>> & { defaultRole?: NavRole }
): Promise<void> {
  const row = await prisma.navItem.findUnique({ where: { navKey } })
  if (!row) throw new Error(`Unknown navKey: ${navKey}`)

  const data: Record<string, unknown> = {}
  if (patch.label !== undefined) data.label = patch.label
  if (patch.hrefTemplate !== undefined) {
    if (!patch.hrefTemplate.startsWith('/')) throw new Error('hrefTemplate doit commencer par /')
    data.hrefTemplate = patch.hrefTemplate
  }
  if (patch.description !== undefined) data.description = patch.description
  if (patch.defaultRole !== undefined) {
    if (!isValidRole(patch.defaultRole)) throw new Error(`Rôle invalide: ${patch.defaultRole}`)
    data.defaultRole = patch.defaultRole
  }

  await prisma.navItem.update({ where: { navKey }, data })
}

export async function deleteNavItem(navKey: string): Promise<void> {
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
    if (row.roleOverride && isValidRole(row.roleOverride)) {
      result[row.navKey] = row.roleOverride as NavRole
    }
  }
  return result
}
