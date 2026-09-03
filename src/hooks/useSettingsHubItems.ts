'use client'

import { useMemo } from 'react'
import { useNavPermissions } from './useNavPermissions'
import { useAuthSession } from './useAuthSession'
import { type NavSection, getItemRole, type NavRole } from '@/lib/nav-permissions-registry'

export type SettingsHubItem = {
  navKey: string
  label: string
  description: string
  href: string
  hrefTemplate: string
  requiresClan: boolean
  role: NavRole
}

const ROLE_TO_TARGET: Partial<Record<NavRole, NavSection>> = {
  admin: 'admin-menu',
  owner: 'owner-menu',
  superuser: 'superuser-menu',
}

export function useSettingsHubItems(
  section: NavSection,
  clanId: number | null | undefined
) {
  const navPerms = useNavPermissions()
  const { permissions, isSuperUser } = useAuthSession()

  return useMemo(() => {
    const permissionSet = new Set(permissions || [])
    const hasWildcard = permissionSet.has('*')

    const canManageMembers = hasWildcard || permissionSet.has('manage_members')
    const canManageRoles = hasWildcard || permissionSet.has('manage_roles')
    const canManageSettings = hasWildcard || permissionSet.has('manage_settings')

    const isOwner = hasWildcard
    const isAdmin = canManageMembers || canManageRoles || canManageSettings

    function canAccessRole(role: NavRole): boolean {
      if (role === 'hidden') return false
      if (role === 'superuser') return isSuperUser
      if (role === 'owner') return isOwner || isSuperUser
      if (role === 'admin') return isAdmin || isSuperUser
      return true
    }

    function resolveHref(template: string): string {
      return (
        template
          .replace(':clanId', clanId ? String(clanId) : '___')
          .replace(/\/:[^/]+/g, '') || '/'
      )
    }

    // 1. Items native to this section (whose role hasn't moved them elsewhere)
    const native = navPerms.items.filter((i) => {
      if (i.section !== section) return false
      const role = getItemRole(i.navKey, navPerms.roles)
      const target = ROLE_TO_TARGET[role]
      return !target || target === section
    })

    // Sort native items by defined positions
    const posOrder = navPerms.positions[section] as string[] | undefined
    const orderedNative = posOrder
      ? [...native].sort((a, b) => {
          const ai = posOrder.indexOf(a.navKey)
          const bi = posOrder.indexOf(b.navKey)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
      : native

    // 2. Items promoted to this section from other sections
    const promoted = navPerms.items.filter((i) => {
      if (i.section === section) return false
      const role = getItemRole(i.navKey, navPerms.roles)
      return ROLE_TO_TARGET[role] === section
    })

    // Sort promoted items
    const promotedOrder = navPerms.promotedPositions[section] as string[] | undefined
    const orderedPromoted = promotedOrder?.length
      ? [...promoted].sort((a, b) => {
          const ai = promotedOrder.indexOf(a.navKey)
          const bi = promotedOrder.indexOf(b.navKey)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
      : promoted

    const allCandidateItems = [...orderedNative, ...orderedPromoted]

    // 3. Filter by role access (hides 'hidden' and roles beyond user privileges)
    const visibleItems: SettingsHubItem[] = allCandidateItems
      .filter((i) => {
        const role = getItemRole(i.navKey, navPerms.roles)
        return canAccessRole(role)
      })
      .map((i) => {
        const role = getItemRole(i.navKey, navPerms.roles)
        const requiresClan = i.hrefTemplate.includes(':clanId')
        return {
          navKey: i.navKey,
          label: navPerms.labels[i.navKey] ?? i.label,
          description: i.description,
          href: resolveHref(i.hrefTemplate),
          hrefTemplate: i.hrefTemplate,
          requiresClan,
          role,
        }
      })

    // 4. Split into clan-specific items and global items
    const clanItems = visibleItems.filter((i) => i.requiresClan)
    const globalItems = visibleItems.filter((i) => !i.requiresClan)

    return {
      clanItems,
      globalItems,
      allItems: visibleItems,
    }
  }, [navPerms, permissions, isSuperUser, clanId, section])
}
