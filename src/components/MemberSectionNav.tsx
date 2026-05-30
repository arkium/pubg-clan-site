'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'

type MemberSectionNavProps = {
  memberId: number
  framed?: boolean
  showMemberIdentity?: boolean
}

type NavItem = {
  label: string
  href: string
}

function renderMemberNavIcon(label: string) {
  if (label === 'Tableau de bord') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path fill="currentColor" d="M3 11h6V3H3v8Zm8 6h6V9h-6v8ZM3 17h6v-4H3v4Zm8-10h6V3h-6v4Z" />
      </svg>
    )
  }

  if (label === 'Stats globales') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path fill="currentColor" d="M4 16h3V9H4v7Zm4 0h4V5H8v11Zm5 0h3v-3h-3v3Z" />
      </svg>
    )
  }

  if (label === 'Cartes') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path
          fill="currentColor"
          d="M10 2.25a7.75 7.75 0 1 0 0 15.5 7.75 7.75 0 0 0 0-15.5Zm5.97 7h-2.22a12.6 12.6 0 0 0-1.08-4.07 6.28 6.28 0 0 1 3.3 4.07ZM10 3.72c.65.78 1.78 2.48 2.2 5.53H7.8c.42-3.05 1.55-4.75 2.2-5.53Zm-2.67 1.46a12.6 12.6 0 0 0-1.08 4.07H4.03a6.28 6.28 0 0 1 3.3-4.07ZM3.74 10.75h2.48c.08 1.52.43 2.9.95 4.07a6.28 6.28 0 0 1-3.43-4.07Zm4.06 0h4.4c-.42 3.05-1.55 4.75-2.2 5.53-.65-.78-1.78-2.48-2.2-5.53Zm4.87 4.07c.52-1.17.87-2.55.95-4.07h2.48a6.28 6.28 0 0 1-3.43 4.07Z"
        />
      </svg>
    )
  }

  if (label === 'Calendrier') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path fill="currentColor" d="M6 2.5h1.5V4H12V2.5h1.5V4h2A1.5 1.5 0 0 1 17 5.5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-10A1.5 1.5 0 0 1 4.5 4h1.5V2.5Zm9.5 6h-11v7h11v-7Z" />
      </svg>
    )
  }

  if (label === 'Matchs') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path fill="currentColor" d="M4.5 3A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 15.5 3h-11Zm.5 3h10v2H5V6Zm0 4h4v4H5v-4Zm6 0h4v4h-4v-4Z" />
      </svg>
    )
  }

  if (label === 'Notifications') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path fill="currentColor" d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5V9c0 .8-.3 1.6-.8 2.2l-.7.8a1 1 0 0 0 .8 1.7h10.4a1 1 0 0 0 .8-1.7l-.7-.8A3.5 3.5 0 0 1 14.5 9V7A4.5 4.5 0 0 0 10 2.5Zm0 15a2.5 2.5 0 0 0 2.3-1.5H7.7A2.5 2.5 0 0 0 10 17.5Z" />
      </svg>
    )
  }

  return null
}

export default function MemberSectionNav({
  memberId,
  framed = true,
  showMemberIdentity = true,
}: MemberSectionNavProps) {
  const pathname = usePathname()
  const [memberName, setMemberName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [pubgName, setPubgName] = useState('')

  useEffect(() => {
    if (!showMemberIdentity) {
      setMemberName('')
      setAvatarUrl(null)
      setPubgName('')
      return
    }

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
  }, [memberId, showMemberIdentity])

  const items: NavItem[] = [
    { label: 'Tableau de bord', href: `/members/${memberId}/dashboard` },
    { label: 'Stats globales', href: `/members/${memberId}/stats` },
    { label: 'Cartes', href: `/members/${memberId}/map-stats` },
    { label: 'Calendrier', href: `/members/${memberId}/heatmap` },
    { label: 'Matchs', href: `/members/${memberId}/matches` },
    { label: 'Notifications', href: `/members/${memberId}/notifications` },
  ]
  const normalizedDisplayName = memberName.trim().toLowerCase()
  const normalizedPubgName = pubgName.trim().toLowerCase()
  const showPubgAlias = Boolean(pubgName.trim()) && normalizedPubgName !== normalizedDisplayName
  const activeItem = items.find((item) => pathname === item.href) ?? items[0]
  const mobileItems: MobileDropdownNavItem[] = items.map((item) => ({
    key: item.href,
    href: item.href,
    label: item.label,
    active: pathname === item.href,
    icon: renderMemberNavIcon(item.label),
  }))

  return (
    <div
      className={framed ? 'mb-6 rounded-xl border border-gray-200 bg-white p-3 shadow-sm' : 'border-t border-gray-100 pt-3'}
    >
      {showMemberIdentity ? (
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

          </div>
        </div>
      ) : null}

      <MobileDropdownNav
        id={`member-nav-${memberId}`}
        label="Navigation rapide"
        currentLabel={activeItem.label}
        items={mobileItems}
      />

      <nav className="member-section-nav hidden flex-wrap gap-2 md:flex">
        {items.map((item) => {
          const active = pathname === item.href
          const icon = renderMemberNavIcon(item.label)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`clan-section-nav-link inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                active ? 'clan-section-nav-link--active shadow-sm' : ''
              }`}
            >
              {icon ? <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span> : null}
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}