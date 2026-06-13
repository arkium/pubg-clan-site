import { prisma } from '@/lib/prisma'
import type { NavRole, NavSection } from '@/lib/nav-permissions-registry'
import { NAV_REGISTRY } from '@/lib/nav-permissions-registry'

const CONFIG_KEY = 'nav_permissions'
const POSITIONS_KEY = 'nav_positions'

const VALID_ROLES: NavRole[] = ['none', 'member', 'admin', 'owner']

function isValidRole(value: unknown): value is NavRole {
  return typeof value === 'string' && (VALID_ROLES as string[]).includes(value)
}

function parseOverrides(raw: string | null): Record<string, NavRole> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Record<string, NavRole> = {}
    for (const [key, val] of Object.entries(parsed)) {
      if (isValidRole(val)) result[key] = val
    }
    return result
  } catch {
    return {}
  }
}

export async function getNavPermissionOverrides(): Promise<Record<string, NavRole>> {
  const config = await prisma.appConfig.findUnique({ where: { key: CONFIG_KEY } })
  return parseOverrides(config?.value ?? null)
}

export async function getNavPermissions(): Promise<Array<{ navKey: string; role: NavRole }>> {
  const overrides = await getNavPermissionOverrides()
  return NAV_REGISTRY.map((item) => ({
    navKey: item.navKey,
    role: item.navKey in overrides ? overrides[item.navKey] : item.defaultRole,
  }))
}

// ─── Positions ────────────────────────────────────────────────────────────────

function parsePositions(raw: string | null): Record<string, string[]> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const result: Record<string, string[]> = {}
    for (const [section, keys] of Object.entries(parsed)) {
      if (Array.isArray(keys) && keys.every((k) => typeof k === 'string')) {
        result[section] = keys as string[]
      }
    }
    return result
  } catch {
    return {}
  }
}

export async function getNavPositions(): Promise<Record<string, string[]>> {
  const config = await prisma.appConfig.findUnique({ where: { key: POSITIONS_KEY } })
  return parsePositions(config?.value ?? null)
}

export async function setNavSectionOrder(section: NavSection, orderedKeys: string[]): Promise<void> {
  const sectionKeys = NAV_REGISTRY.filter((item) => item.section === section).map((item) => item.navKey)
  const isValid = orderedKeys.every((k) => sectionKeys.includes(k)) && orderedKeys.length === sectionKeys.length
  if (!isValid) throw new Error(`Invalid orderedKeys for section: ${section}`)

  const current = await getNavPositions()
  const defaultOrder = sectionKeys
  const isDefault = orderedKeys.every((k, i) => k === defaultOrder[i])

  if (isDefault) {
    const rest: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(current)) {
      if (k !== section) rest[k] = v
    }
    await prisma.appConfig.upsert({
      where: { key: POSITIONS_KEY },
      create: { key: POSITIONS_KEY, value: JSON.stringify(rest) },
      update: { value: JSON.stringify(rest) },
    })
  } else {
    const updated = { ...current, [section]: orderedKeys }
    await prisma.appConfig.upsert({
      where: { key: POSITIONS_KEY },
      create: { key: POSITIONS_KEY, value: JSON.stringify(updated) },
      update: { value: JSON.stringify(updated) },
    })
  }
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function setNavPermission(navKey: string, role: NavRole): Promise<void> {
  const isKnownKey = NAV_REGISTRY.some((item) => item.navKey === navKey)
  if (!isKnownKey) throw new Error(`Unknown navKey: ${navKey}`)
  if (!isValidRole(role)) throw new Error(`Invalid role: ${role}`)

  const current = await getNavPermissionOverrides()
  const defaultRole = NAV_REGISTRY.find((item) => item.navKey === navKey)?.defaultRole ?? 'none'

  if (role === defaultRole) {
    // Back to default — remove the override to keep storage lean
    const rest: Record<string, NavRole> = {}
    for (const [k, v] of Object.entries(current)) {
      if (k !== navKey) rest[k] = v
    }
    await prisma.appConfig.upsert({
      where: { key: CONFIG_KEY },
      create: { key: CONFIG_KEY, value: JSON.stringify(rest) },
      update: { value: JSON.stringify(rest) },
    })
  } else {
    const updated = { ...current, [navKey]: role }
    await prisma.appConfig.upsert({
      where: { key: CONFIG_KEY },
      create: { key: CONFIG_KEY, value: JSON.stringify(updated) },
      update: { value: JSON.stringify(updated) },
    })
  }
}
