'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useNavPermissions } from '@/hooks/useNavPermissions'
import { getItemRole, getRoleLinkClass, type NavRole } from '@/lib/nav-permissions-registry'

type ClanSectionNavProps = {
  clanId: number
}

type NavItem = {
  navKey: string
  label: string
  href: string
  icon: ReactNode
}

function renderClanSectionIcon(label: string) {
  const iconClass = 'h-4 w-4 shrink-0'

  if (label === 'Vue d\'ensemble') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M3 3h6v6H3V3Zm0 8h6v6H3v-6Zm8-8h6v6h-6V3Zm0 8h6v6h-6v-6Z" />
      </svg>
    )
  }

  if (label === 'Stats armes') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M3 10.5a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 3 10.5Zm0 3a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 3 13.5Zm0-6a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 3 7.5Zm6-2.25A.75.75 0 0 1 9.75 4.5h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 9 5.25Zm.75 3.75a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 4a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5Z" />
      </svg>
    )
  }

  if (label === 'Heatmap kills' || label === 'Positions') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12A6 6 0 0 1 10 4Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
      </svg>
    )
  }

  if (label === 'Drop zones') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 2.5a5.5 5.5 0 0 0-5.5 5.5c0 3.95 4.5 8.77 5.5 9.78 1-.99 5.5-5.83 5.5-9.78A5.5 5.5 0 0 0 10 2.5Zm0 7.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
      </svg>
    )
  }

  if (label === 'Membres') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM4 16a6 6 0 1 1 12 0H4Z" />
      </svg>
    )
  }

  if (label === 'Matchs') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M4.5 3A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 15.5 3h-11Zm.5 3h10v2H5V6Zm0 4h4v4H5v-4Zm6 0h4v4h-4v-4Z" />
      </svg>
    )
  }

  if (label === 'Stats') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M4 16h3V9H4v7Zm4 0h4V5H8v11Zm5 0h3v-3h-3v3Z" />
      </svg>
    )
  }

  if (label === 'Classement') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M5 3.5h3v10H5v-10Zm4.5 3h3v7h-3v-7ZM14 2.5h3v11h-3v-11ZM3.5 15.5h13V17h-13v-1.5Z" />
      </svg>
    )
  }

  if (label === 'Rapports') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M5 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10V7.8L12.2 5H5Zm7 1.7L14.3 7H12V4.7ZM6 10h8v1.5H6V10Zm0 3h8v1.5H6V13Z" />
      </svg>
    )
  }

  if (label === 'Challenges') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 2a4.5 4.5 0 0 0-4.5 4.5c0 1.68.92 3.14 2.28 3.92l-.3 1.58H6a.75.75 0 0 0 0 1.5h.97l-.22 1.25a.75.75 0 0 0 .74.88h5.02a.75.75 0 0 0 .74-.88L13.03 13.5H14a.75.75 0 0 0 0-1.5h-1.48l-.3-1.58A4.5 4.5 0 0 0 10 2Zm0 1.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />
      </svg>
    )
  }

  if (label === 'Catégories armes') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M3 5h4v4H3V5Zm0 6h4v4H3v-4Zm6-6h8v1.5H9V5Zm0 3h8v1.5H9V8Zm0 3h8v1.5H9v-1.5Zm0 3h8v1.5H9v-1.5Z" />
      </svg>
    )
  }

  if (label === 'Awards') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M5 3.5A1.5 1.5 0 0 0 3.5 5v2A3.5 3.5 0 0 0 7 10.5h.3A2.75 2.75 0 0 0 9.25 12v1.76l-1.9.63a.75.75 0 0 0 .24 1.46h4.82a.75.75 0 0 0 .24-1.46l-1.9-.63V12a2.75 2.75 0 0 0 1.95-1.5H13A3.5 3.5 0 0 0 16.5 7V5A1.5 1.5 0 0 0 15 3.5H5Zm0 1.5H7v4H7A2 2 0 0 1 5 7V5Zm8 0h2v2a2 2 0 0 1-2 2h-.01V5Z" />
      </svg>
    )
  }

  return null
}

function canAccess(role: NavRole, isOwner: boolean, isAdmin: boolean): boolean {
  if (role === 'hidden') return false
  if (role === 'none' || role === 'member') return true
  if (role === 'admin') return isAdmin
  if (role === 'owner') return isOwner
  return true
}

export default function ClanSectionNav({ clanId }: ClanSectionNavProps) {
  const pathname = usePathname()
  const navRoles = useNavPermissions()
  const { permissions } = useAuthSession()
  const statsRootHref = `/clans/${clanId}/stats`

  const hasWildcard = permissions.includes('*')
  const isOwner = hasWildcard
  const isAdmin = hasWildcard
    || permissions.includes('manage_members')
    || permissions.includes('manage_roles')
    || permissions.includes('manage_settings')

  const rawItems: NavItem[] = [
    { navKey: 'clan.challenges', label: 'Challenges', href: `/clans/${clanId}/challenges`, icon: renderClanSectionIcon('Challenges') },
    { navKey: 'clan.stats-weapons-categories', label: 'Catégories armes', href: `${statsRootHref}/weapons/categories`, icon: renderClanSectionIcon('Catégories armes') },
    { navKey: 'clan.overview', label: "Vue d'ensemble", href: `/clans/${clanId}/overview`, icon: renderClanSectionIcon("Vue d'ensemble") },
    { navKey: 'clan.members', label: 'Membres', href: `/clans/${clanId}/members`, icon: renderClanSectionIcon('Membres') },
    { navKey: 'clan.matches', label: 'Matchs', href: `/clans/${clanId}/matches`, icon: renderClanSectionIcon('Matchs') },
    { navKey: 'clan.stats', label: 'Stats', href: statsRootHref, icon: renderClanSectionIcon('Stats') },
    { navKey: 'clan.stats-weapons', label: 'Stats armes', href: `${statsRootHref}/weapons`, icon: renderClanSectionIcon('Stats armes') },
    { navKey: 'clan.heatmap-kills', label: 'Heatmap kills', href: `${statsRootHref}/heatmap-kills`, icon: renderClanSectionIcon('Heatmap kills') },
    { navKey: 'clan.positions', label: 'Positions', href: `${statsRootHref}/positions`, icon: renderClanSectionIcon('Positions') },
    { navKey: 'clan.drop-zones', label: 'Drop zones', href: `/clans/${clanId}/drop-zones`, icon: renderClanSectionIcon('Drop zones') },
    { navKey: 'clan.awards', label: 'Awards', href: `/clans/${clanId}/awards`, icon: renderClanSectionIcon('Awards') },
    { navKey: 'clan.leaderboard', label: 'Classement', href: `/clans/${clanId}/leaderboard`, icon: renderClanSectionIcon('Classement') },
    { navKey: 'clan.reports', label: 'Rapports', href: `/clans/${clanId}/reports`, icon: renderClanSectionIcon('Rapports') },
  ]

  const sectionOrder = navRoles.positions['clan-section']
  const orderedRaw = sectionOrder
    ? [...rawItems].sort((a, b) => {
        const ai = sectionOrder.indexOf(a.navKey)
        const bi = sectionOrder.indexOf(b.navKey)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    : rawItems

  const visibleItems = orderedRaw.filter((item) =>
    canAccess(getItemRole(item.navKey, navRoles.roles), isOwner, isAdmin)
  )

  const activeItem = visibleItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? visibleItems[0]
  const mobileItems: MobileDropdownNavItem[] = visibleItems.map((item) => {
    const role = getItemRole(item.navKey, navRoles.roles)
    return {
      key: item.href,
      href: item.href,
      label: navRoles.labels[item.navKey] ?? item.label,
      active: item.navKey === 'clan.stats' ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`),
      icon: item.icon,
      role: role === 'admin' || role === 'owner' ? role : undefined,
    }
  })

  return (
    <div className="mt-4">
      <MobileDropdownNav
        id={`clan-section-nav-${clanId}`}
        label="Navigation du clan"
        currentLabel={activeItem ? (navRoles.labels[activeItem.navKey] ?? activeItem.label) : ''}
        items={mobileItems}
        variant="compact"
        visibilityClass="block md:hidden"
        className="w-full max-w-xs"
      />

      <nav className="hidden flex-wrap items-center gap-2 md:flex" aria-label="Navigation du clan">
        {visibleItems.map((item) => {
          const active = item.navKey === 'clan.stats'
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`)
          const role = getItemRole(item.navKey, navRoles.roles)
          const roleClass = getRoleLinkClass(role, active, 'section')

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={['clan-section-nav-link', roleClass, active ? 'shadow-sm' : ''].filter(Boolean).join(' ')}
            >
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
                {item.icon}
              </span>
              {navRoles.labels[item.navKey] ?? item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}