'use client'

/* eslint-disable @next/next/no-img-element */

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
  const normalizedDisplayName = memberName.trim().toLowerCase()
  const normalizedPubgName = pubgName.trim().toLowerCase()
  const showPubgAlias = Boolean(pubgName.trim()) && normalizedPubgName !== normalizedDisplayName

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-3 px-1 py-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-slate-200 bg-blue-600 text-base font-bold text-white shadow-sm">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={(memberName || `Joueur #${memberId}`) + ' avatar'}
                className="h-12 w-12 rounded-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <span>{(memberName || '?').charAt(0).toUpperCase()}</span>
            )}
            </div>

            <div className="min-w-0">
              <p className="truncate text-base font-bold text-gray-900">{memberName || `Joueur #${memberId}`}</p>
              {showPubgAlias ? (
                <p className="truncate text-xs text-gray-500">@{pubgName}</p>
              ) : null}
            </div>
          </div>

          <Link
            href="/members"
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Liste membres
          </Link>
        </div>
      </div>

      <nav className="member-section-nav flex flex-wrap gap-2">
        {items.map((item) => {
          const active = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`member-section-nav-item inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'member-section-nav-item-active bg-blue-600 text-white shadow-sm'
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