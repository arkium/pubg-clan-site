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

type MemberSeasonStatsRow = {
  seasonId: string
  rankedTier: string | null
  rankedSubTier: string | null
  rankedBestTier: string | null
  rankedBestSubTier: string | null
}

type MemberSeasonStatsResponse = {
  seasons: MemberSeasonStatsRow[]
}

const RANKED_TIER_CLASS: Record<string, string> = {
  Bronze: 'border-amber-700/40 bg-amber-50 text-amber-800',
  Silver: 'border-slate-400/40 bg-slate-50 text-slate-700',
  Gold: 'border-yellow-500/40 bg-yellow-50 text-yellow-800',
  Platinum: 'border-cyan-500/40 bg-cyan-50 text-cyan-800',
  Diamond: 'border-blue-500/40 bg-blue-50 text-blue-800',
  Master: 'border-fuchsia-500/40 bg-fuchsia-50 text-fuchsia-800',
}

function formatTier(tier: string | null, subTier: string | null) {
  if (!tier) {
    return 'Non classe'
  }

  if (!subTier) {
    return tier
  }

  return `${tier} ${subTier}`
}

function formatSeasonShort(seasonId: string | null | undefined) {
  if (!seasonId) {
    return null
  }

  const segments = seasonId.split('.')
  const shortId = segments[segments.length - 1] ?? seasonId
  return `Saison ${shortId}`
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

  if (label === 'Drop zones') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path fill="currentColor" d="M10 2.5a5.5 5.5 0 0 0-5.5 5.5c0 3.95 4.5 8.77 5.5 9.78 1-.99 5.5-5.83 5.5-9.78A5.5 5.5 0 0 0 10 2.5Zm0 7.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z" />
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

  if (label === 'Armes') {
    return (
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
        <path
          fill="currentColor"
          d="M3 11.5 8.8 5.7a1.5 1.5 0 0 1 2.12 0l3.38 3.38a1.5 1.5 0 0 1 0 2.12L8.5 17H6v-2.5L3 11.5Zm10.8-7.3a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4l-1.2 1.2-2-2 1.2-1.2Z"
        />
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
  const [seasonBadge, setSeasonBadge] = useState<MemberSeasonStatsRow | null>(null)

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

  useEffect(() => {
    if (!showMemberIdentity) {
      setSeasonBadge(null)
      return
    }

    let cancelled = false

    async function loadSeasonBadge() {
      try {
        const response = await fetch(`/api/members/${memberId}/season-stats`, { cache: 'no-store' })
        const payload = (await response.json()) as MemberSeasonStatsResponse | { error?: string }

        if (!response.ok || cancelled || !('seasons' in payload) || !Array.isArray(payload.seasons)) {
          return
        }

        setSeasonBadge(payload.seasons[0] ?? null)
      } catch {
        if (!cancelled) {
          setSeasonBadge(null)
        }
      }
    }

    void loadSeasonBadge()

    return () => {
      cancelled = true
    }
  }, [memberId, showMemberIdentity])

  const items: NavItem[] = [
    { label: 'Tableau de bord', href: `/members/${memberId}/dashboard` },
    { label: 'Stats globales', href: `/members/${memberId}/stats` },
    { label: 'Armes', href: `/members/${memberId}/weapons` },
    { label: 'Cartes', href: `/members/${memberId}/map-stats` },
    { label: 'Drop zones', href: `/members/${memberId}/drop-zones` },
    { label: 'Calendrier', href: `/members/${memberId}/heatmap` },
    { label: 'Matchs', href: `/members/${memberId}/matches` },
    { label: 'Notifications', href: `/members/${memberId}/notifications` },
  ]
  const normalizedDisplayName = memberName.trim().toLowerCase()
  const normalizedPubgName = pubgName.trim().toLowerCase()
  const showPubgAlias = Boolean(pubgName.trim()) && normalizedPubgName !== normalizedDisplayName
  const currentTier = formatTier(seasonBadge?.rankedTier ?? null, seasonBadge?.rankedSubTier ?? null)
  const bestTier = formatTier(seasonBadge?.rankedBestTier ?? null, seasonBadge?.rankedBestSubTier ?? null)
  const seasonLabel = formatSeasonShort(seasonBadge?.seasonId)
  const tierClass = seasonBadge?.rankedTier
    ? RANKED_TIER_CLASS[seasonBadge.rankedTier] ?? 'border-gray-300 bg-gray-50 text-gray-700'
    : 'border-gray-300 bg-gray-50 text-gray-700'
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
                {seasonBadge ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tierClass}`}>
                      Ranked: {currentTier}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700">
                      Best: {bestTier}
                    </span>
                    {seasonLabel ? (
                      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                        {seasonLabel}
                      </span>
                    ) : null}
                  </div>
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
              className={`clan-section-nav-link ${
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