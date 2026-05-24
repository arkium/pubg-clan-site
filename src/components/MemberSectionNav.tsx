'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

type MemberSectionNavProps = {
  memberId: number
}

type NavItem = {
  label: string
  href: string
}

export default function MemberSectionNav({ memberId }: MemberSectionNavProps) {
  const pathname = usePathname()
  const [memberName, setMemberName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [pubgName, setPubgName] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadMemberContext() {
      try {
        const response = await fetch(`/api/members/${memberId}`)
        const payload = (await response.json()) as {
          displayName?: string
          avatarUrl?: string | null
          pubgPlayerName?: string
          error?: string
        }

        if (!response.ok || cancelled) {
          return
        }

        setMemberName(payload.displayName ?? '')
        setAvatarUrl(payload.avatarUrl ?? null)
        setPubgName(payload.pubgPlayerName ?? '')
      } catch {
        if (!cancelled) {
          setMemberName('')
          setAvatarUrl(null)
          setPubgName('')
        }
      }
    }

    void loadMemberContext()

    return () => {
      cancelled = true
    }
  }, [memberId])

  const items: NavItem[] = [
    { label: 'Tableau de bord', href: `/members/${memberId}/dashboard` },
    { label: 'Stats globales', href: `/members/${memberId}/stats` },
    { label: 'Stats par carte', href: `/members/${memberId}/map-stats` },
    { label: 'Calendrier activite', href: `/members/${memberId}/heatmap` },
    { label: 'Matchs', href: `/members/${memberId}/matches` },
    { label: 'Notifications', href: `/members/${memberId}/notifications` },
  ]

  const currentItem = items.find((item) => pathname === item.href)
  const currentSectionLabel = currentItem?.label ?? 'Section'

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-blue-600 text-sm font-bold text-white">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={(memberName || `Joueur #${memberId}`) + ' avatar'}
                className="h-10 w-10 rounded-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <span>{(memberName || '?').charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Joueur consulte</p>
            <p className="truncate text-sm font-semibold text-gray-900">{memberName || `Joueur #${memberId}`}</p>
            <p className="truncate text-xs text-gray-500">{pubgName || 'Nom PUBG indisponible'}</p>
          </div>
        </div>

        <div className="text-xs text-gray-500">
          <Link href="/members" className="font-medium text-gray-600 hover:text-blue-700 hover:underline">
            Membres
          </Link>{' '}
          / <span className="font-medium text-gray-700">{memberName || `Joueur #${memberId}`}</span> /{' '}
          <span className="font-semibold text-gray-800">{currentSectionLabel}</span>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2">
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
    </div>
  )
}