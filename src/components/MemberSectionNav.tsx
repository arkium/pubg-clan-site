'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type MemberSectionNavProps = {
  memberId: number
}

type NavItem = {
  label: string
  href: string
}

export default function MemberSectionNav({ memberId }: MemberSectionNavProps) {
  const pathname = usePathname()

  const items: NavItem[] = [
    { label: 'Tableau de bord', href: `/members/${memberId}/dashboard` },
    { label: 'Stats globales', href: `/members/${memberId}/stats` },
    { label: 'Matchs', href: `/members/${memberId}/matches` },
    { label: 'Notifications', href: `/members/${memberId}/notifications` },
  ]

  return (
    <nav className="mb-6 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
      {items.map((item) => {
        const active = pathname === item.href

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-blue-600 text-white shadow-sm'
                : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}