'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useNavPermissions } from '@/hooks/useNavPermissions'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { getItemRole, getRoleLinkClass, NAV_REGISTRY } from '@/lib/nav-permissions-registry'
import type { NavRole, NavSection } from '@/lib/nav-permissions-registry'

type Props = {
  section: 'admin-menu' | 'owner-menu'
}

const SECTION_NAV_LABELS: Record<string, string> = {
  'admin-menu': 'Navigation admin',
  'owner-menu': 'Navigation owner',
}

function renderSettingsNavIcon(label: string): ReactNode {
  const iconClass = 'h-4 w-4 shrink-0'

  if (label === 'Ajouter un joueur') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 3.3a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Zm0 8.2c-3 0-5.4 1.5-5.4 3.5 0 .6.4 1 1 1h9c.6 0 1-.4 1-1 0-2-2.4-3.5-5.4-3.5Zm.8 1.2h1.4v1.5h1.5v1.4h-1.5v1.5h-1.4v-1.5H9.3v-1.4h1.5v-1.5Z" />
      </svg>
    )
  }

  if (label === 'Joueurs et rôles') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M7 4.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm6 0a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6ZM3.9 14.7c0-1.8 1.9-3.2 4.1-3.2s4.1 1.4 4.1 3.2v.8h-8.2v-.8Zm9.5.8v-.8c0-.8-.3-1.6-.8-2.2 1.7.1 3.1 1.1 3.1 2.4v.6h-2.3Z" />
      </svg>
    )
  }

  if (label === 'Alias cartes PUBG') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M4.5 3.5A1.5 1.5 0 0 0 3 5v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15V5a1.5 1.5 0 0 0-1.5-1.5h-11ZM6 7h8v1.4H6V7Zm0 2.9h5.5v1.4H6V9.9Zm0 2.9h8v1.4H6v-1.4Z" />
      </svg>
    )
  }

  if (label === 'Alias armes PUBG') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M3 11.5 8.8 5.7a1.5 1.5 0 0 1 2.12 0l3.38 3.38a1.5 1.5 0 0 1 0 2.12L8.5 17H6v-2.5L3 11.5Zm10.8-7.3a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4l-1.2 1.2-2-2 1.2-1.2Z" />
      </svg>
    )
  }

  if (label === 'Alias catégories armes') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M3 5h4v4H3V5Zm0 6h4v4H3v-4Zm6-6h8v1.5H9V5Zm0 3h8v1.5H9V8Zm0 3h8v1.5H9v-1.5Zm0 3h8v1.5H9v-1.5Z" />
      </svg>
    )
  }

  if (label === 'Alias phases PUBG') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M4 4.5A1.5 1.5 0 0 1 5.5 3h9A1.5 1.5 0 0 1 16 4.5v2A1.5 1.5 0 0 1 14.5 8h-9A1.5 1.5 0 0 1 4 6.5v-2Zm0 6A1.5 1.5 0 0 1 5.5 9h5A1.5 1.5 0 0 1 12 10.5v2A1.5 1.5 0 0 1 10.5 14h-5A1.5 1.5 0 0 1 4 12.5v-2Z" />
      </svg>
    )
  }

  if (label === 'Accueil login') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 3.2 3.4 8.3v8.5h4.3v-5.1h4.6v5.1h4.3V8.3L10 3.2Z" />
      </svg>
    )
  }

  if (label === 'Dashboard télémétrie') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M3 3h6v6H3V3Zm0 8h6v6H3v-6Zm8-8h6v6h-6V3Zm0 8h6v6h-6v-6Z" />
      </svg>
    )
  }

  if (label === 'Erreurs télémétrie') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm-.75 3.25v5h1.5v-5h-1.5Zm0 6.5v1.5h1.5v-1.5h-1.5Z" />
      </svg>
    )
  }

  if (label === 'Sync batch manuel') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 3.2a6.8 6.8 0 1 0 6.8 6.8h-1.6A5.2 5.2 0 1 1 10 4.8V3.2Zm1.5 0v4.3l3.5-2-3.5-2.3Z" />
      </svg>
    )
  }

  if (label === 'Ouvrir Ops Cron') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 4.1a5.9 5.9 0 1 0 0 11.8 5.9 5.9 0 0 0 0-11.8Zm0 1.5a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Zm-.7 1.7v3.4c0 .2.1.4.3.6l2.3 1.8.9-1.1-2-1.5V7.3H9.3Z" />
      </svg>
    )
  }

  if (label === 'Recoveries telemetry') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 3.2a6.8 6.8 0 1 0 6.8 6.8h-1.6A5.2 5.2 0 1 1 10 4.8V3.2Zm.8 3H9.2v4.6l3.8 2.3.8-1.3-3-1.8V6.2Zm4.7-1 .9.9-2.1 2.1-.9-.9 2.1-2.1Z" />
      </svg>
    )
  }

  if (label === 'Télémétrie matchs') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 2.25a.75.75 0 0 0-.75.75v4.19l-2.72 2.72a.75.75 0 1 0 1.06 1.06l3-3A.75.75 0 0 0 10.75 11V6.5A.75.75 0 0 0 10 5.75Z" />
      </svg>
    )
  }

  if (label === 'Test email') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M4.5 4A1.5 1.5 0 0 0 3 5.5v9A1.5 1.5 0 0 0 4.5 16h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 15.5 4h-11Zm0 1.5h11v.4L10 9.8 4.5 5.9v-.4Zm0 2.2 5 3.5a1 1 0 0 0 1 0l5-3.5v6.8h-11V7.7Z" />
      </svg>
    )
  }

  if (label === 'Monitoring PUBG API') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M3.5 4.5h13v11h-13v-11Zm1.5 1.5V14h10V6h-10Zm1.5 5.5 1.8-2.2 1.8 1.4 2.5-3.1 1.2 1-3.4 4.2-2.1-1.6-1.2 1.5-.6-.6Z" />
      </svg>
    )
  }

  if (label === 'Permissions nav') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" />
      </svg>
    )
  }

  if (label === 'Changer de clan') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M6.2 3.8H4v12.4h2.2V3.8Zm9.8 0H7.8v5h8.2l-1.6-2.5L16 3.8Zm0 7.4H7.8v5H16l-1.6-2.5 1.6-2.5Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
      <path fill="currentColor" d="M10 3a7 7 0 1 0 0 14A7 7 0 0 0 10 3Zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Z" />
    </svg>
  )
}

function canAccess(role: NavRole, isOwner: boolean, isAdmin: boolean): boolean {
  if (role === 'hidden') return false
  if (role === 'owner') return isOwner
  if (role === 'admin') return isAdmin
  return true
}

export default function SettingsSectionNav({ section }: Props) {
  const pathname = usePathname()
  const navPerms = useNavPermissions()
  const { activeMemberId, permissions } = useAuthSession()
  const { clanId } = useSelectedClan()

  const hasWildcard = permissions.includes('*')
  const isOwner = hasWildcard
  const isAdmin = hasWildcard
    || permissions.includes('manage_members')
    || permissions.includes('manage_roles')
    || permissions.includes('manage_settings')

  function resolveHref(template: string): string {
    return (
      template
        .replace(':clanId', clanId ? String(clanId) : '')
        .replace(':memberId', activeMemberId ? String(activeMemberId) : '')
        .replace(/\/:[^/]+/g, '') || '/'
    )
  }

  const sectionItems = NAV_REGISTRY.filter(
    (i) => i.section === (section as NavSection) && i.navKey !== 'owner.switch-clan'
  )

  const posOrder = navPerms.positions[section] as string[] | undefined
  const ordered = posOrder
    ? [...sectionItems].sort((a, b) => {
        const ai = posOrder.indexOf(a.navKey)
        const bi = posOrder.indexOf(b.navKey)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    : sectionItems

  const visibleItems = ordered
    .filter((i) => canAccess(getItemRole(i.navKey, navPerms.roles), isOwner, isAdmin))
    .map((i) => ({
      navKey: i.navKey,
      label: i.label,
      displayLabel: navPerms.labels[i.navKey] ?? i.label,
      href: resolveHref(i.hrefTemplate),
    }))

  if (visibleItems.length === 0) return null

  const activeItem =
    visibleItems.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)) ??
    visibleItems[0]

  const mobileItems: MobileDropdownNavItem[] = visibleItems.map((i) => ({
    key: i.href,
    href: i.href,
    label: i.displayLabel,
    active: pathname === i.href || pathname.startsWith(`${i.href}/`),
    icon: renderSettingsNavIcon(i.label),
  }))

  return (
    <div className="mt-4">
      <MobileDropdownNav
        id={`settings-nav-${section}`}
        label={SECTION_NAV_LABELS[section] ?? 'Navigation'}
        currentLabel={activeItem.displayLabel}
        items={mobileItems}
        variant="compact"
        visibilityClass="block md:hidden"
        className="w-full max-w-xs"
      />

      <nav
        className="hidden flex-wrap items-center gap-2 md:flex"
        aria-label={SECTION_NAV_LABELS[section]}
      >
        {visibleItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          const role = getItemRole(item.navKey, navPerms.roles)
          const roleClass = getRoleLinkClass(role, active, 'section')

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={['clan-section-nav-link', roleClass, active ? 'shadow-sm' : '']
                .filter(Boolean)
                .join(' ')}
            >
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center"
                aria-hidden="true"
              >
                {renderSettingsNavIcon(item.label)}
              </span>
              {item.displayLabel}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
