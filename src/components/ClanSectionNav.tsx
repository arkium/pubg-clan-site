'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'

type ClanSectionNavProps = {
  clanId: number
}

type NavItem = {
  label: string
  href: string
  icon: ReactNode
}

function renderClanSectionIcon(label: string) {
  const iconClass = 'h-4 w-4 shrink-0'

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

  return null
}

export default function ClanSectionNav({ clanId }: ClanSectionNavProps) {
  const pathname = usePathname()

  const items: NavItem[] = [
    { label: 'Membres', href: `/clans/${clanId}/members`, icon: renderClanSectionIcon('Membres') },
    { label: 'Matchs', href: `/clans/${clanId}/matches`, icon: renderClanSectionIcon('Matchs') },
    { label: 'Stats', href: `/clans/${clanId}/stats`, icon: renderClanSectionIcon('Stats') },
    { label: 'Classement', href: `/clans/${clanId}/leaderboard`, icon: renderClanSectionIcon('Classement') },
    { label: 'Rapports', href: `/clans/${clanId}/reports`, icon: renderClanSectionIcon('Rapports') },
  ]

  const activeItem = items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? items[0]
  const mobileItems: MobileDropdownNavItem[] = items.map((item) => ({
    key: item.href,
    href: item.href,
    label: item.label,
    active: pathname === item.href || pathname.startsWith(`${item.href}/`),
    icon: item.icon,
  }))

  return (
    <div className="mt-4">
      <MobileDropdownNav
        id={`clan-section-nav-${clanId}`}
        label="Navigation du clan"
        currentLabel={activeItem.label}
        items={mobileItems}
        variant="compact"
        visibilityClass="block md:hidden"
        className="w-full max-w-xs"
      />

      <nav className="hidden flex-wrap gap-2 md:flex" aria-label="Navigation du clan">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`clan-section-nav-link inline-flex min-h-10 items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition ${
                active ? 'clan-section-nav-link--active shadow-sm' : ''
              }`}
            >
              <span className="mr-2 inline-flex h-4 w-4 items-center justify-center" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}