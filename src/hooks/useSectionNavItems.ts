import { useMemo } from 'react'
import { useNavPermissions } from './useNavPermissions'
import { useAuthSession } from './useAuthSession'
import { type NavSection, getItemRole, type NavRole } from '@/lib/nav-permissions-registry'

export type SectionNavItem = {
  navKey: string
  label: string
  href: string
}

export function useSectionNavItems(
  section: NavSection,
  clanId: number | null | undefined,
  memberId: number | null | undefined
): SectionNavItem[] {
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
          .replace(':memberId', memberId ? String(memberId) : '___')
          .replace(/\/:[^/]+/g, '') || '/'
      )
    }

    function isValidHref(href: string): boolean {
      return !href.includes('___') && href !== '/'
    }

    // Role target logic for filtering
    const ROLE_TO_TARGET: Partial<Record<NavRole, NavSection>> = {
      admin: 'admin-menu',
      owner: 'owner-menu',
      superuser: 'superuser-menu',
    }

    // Get items native to this section
    const native = navPerms.items.filter((i) => {
      if (i.section !== section) return false
      const role = getItemRole(i.navKey, navPerms.roles)
      const target = ROLE_TO_TARGET[role]
      return !target || target === section
    })

    // Sort native items
    const posOrder = navPerms.positions[section] as string[] | undefined
    const orderedNative = posOrder
      ? [...native].sort((a, b) => {
          const ai = posOrder.indexOf(a.navKey)
          const bi = posOrder.indexOf(b.navKey)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
      : native

    // Get items promoted to this section
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

    const allItems = [...orderedNative, ...orderedPromoted]

    return allItems
      .filter((i) => canAccessRole(getItemRole(i.navKey, navPerms.roles)))
      .map((i) => ({
        navKey: i.navKey,
        label: navPerms.labels[i.navKey] ?? i.label,
        href: resolveHref(i.hrefTemplate),
      }))
      .filter((i) => isValidHref(i.href))

  }, [navPerms, permissions, isSuperUser, clanId, memberId, section])
}
