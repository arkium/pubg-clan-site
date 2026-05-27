'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type ClanSectionNavProps = {
  clanId: number
}

type NavItem = {
  label: string
  href: string
}

export default function ClanSectionNav({ clanId }: ClanSectionNavProps) {
  const pathname = usePathname()

  const items: NavItem[] = [
    { label: 'Membres', href: `/clans/${clanId}/members` },
    { label: 'Matchs', href: `/clans/${clanId}/matches` },
    { label: 'Stats', href: `/clans/${clanId}/stats` },
    { label: 'Classement', href: `/clans/${clanId}/leaderboard` },
    { label: 'Rapports', href: `/clans/${clanId}/reports` },
  ]

  return (
    <nav className="mt-4 flex flex-wrap gap-2" aria-label="Navigation du clan">
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
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}