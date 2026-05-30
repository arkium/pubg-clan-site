 'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import ClanSectionNav from '@/components/ClanSectionNav'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

interface Member {
  id: number
  displayName: string
  pubgPlayerName: string
  pubgAccountId: string | null
  platformShard: string
  createdAt: string
  avatarUrl?: string | null
  medalCounts?: {
    gold: number
    silver: number
    bronze: number
  }
  clan: {
    id: number
    name: string
    tag: string
    pubgClanId: string | null
  } | null
}

export const dynamic = 'force-dynamic'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function getAvatarInitials(name: string) {
  const initials = name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .flatMap((part) => part.match(/[\p{L}\p{N}]/gu) ?? [])
    .filter((character) => /[\p{L}]/u.test(character))
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return initials || name.trim().slice(0, 2).toUpperCase() || '??'
}

export default function ClanMembersPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const { loading: authLoading, authenticated } = useAuthSession()

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const [clanName, setClanName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortOrder, setSortOrder] = useState<'az' | 'za'>('az')
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null)

  const sortedMembers = useMemo(() => {
    return [...members].sort((left, right) => {
      const comparison = left.displayName.localeCompare(right.displayName, 'fr', {
        sensitivity: 'base',
      })

      return sortOrder === 'az' ? comparison : comparison * -1
    })
  }, [members, sortOrder])

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  useEffect(() => {
    if (authLoading || !authenticated || !clanId) {
      return
    }

    let cancelled = false

    async function fetchMembers() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/members?clanId=${clanId}`, { cache: 'no-store' })
        const data = (await response.json()) as Member[] | { error?: string }

        if (!response.ok) {
          throw new Error('error' in data ? data.error : 'Failed to fetch members')
        }

        if (!cancelled) {
          const nextMembers = data as Member[]
          setMembers(nextMembers)
          setClanName(nextMembers[0]?.clan?.name ?? `Clan #${clanId}`)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unknown error')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchMembers()

    return () => {
      cancelled = true
    }
  }, [authLoading, authenticated, clanId])

  if (authLoading) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10">
        <p className="text-sm text-gray-600">Verification de la session...</p>
      </main>
    )
  }

  if (!authenticated || !clanId) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10">
        <p className="text-sm text-gray-600">Redirection...</p>
      </main>
    )
  }

  function toggleMemberCard(memberId: number) {
    setExpandedMemberId((current) => (current === memberId ? null : memberId))
  }

  function renderChevron(expanded: boolean) {
    return (
      <span
        className={`members-card-chevron mt-3 inline-flex h-9 w-9 items-center justify-center self-center rounded-full border border-slate-200 bg-white text-slate-500 transition ${expanded ? 'rotate-180' : ''}`}
        aria-hidden="true"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M3.5 6L8 10.5L12.5 6"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    )
  }

  return (
    <div className="members-page app-page-surface min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <header className="members-header mb-8 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Membres du clan</h1>
            <p className="text-sm text-gray-600">
              {clanName ? `${clanName} ·` : ''} Consulte les joueurs et ouvre leurs sections principales.
            </p>
            <ClanSectionNav clanId={clanId} />
          </div>

        </header>

        <div className="members-panel rounded bg-white p-4 shadow sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-xl font-semibold">Joueurs ({members.length})</h2>
            <label className="flex w-full max-w-xs flex-col gap-1 text-sm font-medium text-slate-700 sm:w-auto">
              Trier les joueurs
              <select
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as 'az' | 'za')}
                className="min-h-10 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm sm:min-h-11 sm:rounded-lg"
              >
                <option value="az">Nom A-Z</option>
                <option value="za">Nom Z-A</option>
              </select>
            </label>
          </div>
          {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
          {loading ? <p className="text-sm text-gray-500">Chargement des membres...</p> : null}
          {!loading && members.length === 0 ? (
            <p className="text-gray-500">No members yet</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
              {sortedMembers.map((member) => {
                const isExpanded = expandedMemberId === member.id

                return (
                <div
                  key={member.id}
                  className={`members-card mx-auto flex h-full w-full max-w-[19rem] flex-col rounded-lg border bg-gray-50 p-3 shadow-sm transition sm:max-w-none sm:p-4 ${isExpanded ? 'border-slate-300 shadow-md' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleMemberCard(member.id)}
                    className="mb-3 flex w-full flex-col text-left"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="members-avatar app-avatar flex h-12 w-12 shrink-0 sm:h-14 sm:w-14">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.displayName + ' avatar'}
                            className="h-full w-full object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <span className="text-base font-black tracking-wide text-white">
                            {getAvatarInitials(member.displayName)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-base font-semibold sm:text-lg">{member.displayName}</p>
                          <Link
                            href={`/members/${member.id}/dashboard`}
                            onClick={(event) => event.stopPropagation()}
                            className="members-card-dashboard inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
                            title="Tableau de bord"
                            aria-label="Ouvrir le tableau de bord"
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                              <path d="M2 2.75C2 2.33579 2.33579 2 2.75 2H6.25C6.66421 2 7 2.33579 7 2.75V6.25C7 6.66421 6.66421 7 6.25 7H2.75C2.33579 7 2 6.66421 2 6.25V2.75Z" fill="currentColor" />
                              <path d="M9 2.75C9 2.33579 9.33579 2 9.75 2H13.25C13.6642 2 14 2.33579 14 2.75V4.75C14 5.16421 13.6642 5.5 13.25 5.5H9.75C9.33579 5.5 9 5.16421 9 4.75V2.75Z" fill="currentColor" />
                              <path d="M9 8.75C9 8.33579 9.33579 8 9.75 8H13.25C13.6642 8 14 8.33579 14 8.75V13.25C14 13.6642 13.6642 14 13.25 14H9.75C9.33579 14 9 13.6642 9 13.25V8.75Z" fill="currentColor" />
                              <path d="M2 10.75C2 10.3358 2.33579 10 2.75 10H6.25C6.66421 10 7 10.3358 7 10.75V13.25C7 13.6642 6.66421 14 6.25 14H2.75C2.33579 14 2 13.6642 2 13.25V10.75Z" fill="currentColor" />
                            </svg>
                          </Link>
                        </div>
                        <p className="truncate text-sm text-gray-600">{member.pubgPlayerName}</p>
                        <p className="truncate text-xs text-gray-500">ID: {member.pubgAccountId}</p>
                        {member.clan ? (
                          <p className="truncate text-xs text-gray-500">
                            Clan: {member.clan.name} [{member.clan.tag}]
                          </p>
                        ) : (
                          <p className="truncate text-xs text-gray-400">Clan: no PUBG clan detected</p>
                        )}
                        <div className="members-medals mt-2 flex items-center gap-3 text-xs text-gray-600">
                          <span className="members-medal inline-flex items-center gap-1">
                            <img src="/icons/medal-gold.svg" alt="Medaille or" className="h-4 w-4" />
                            <strong className="text-sm text-gray-900">{member.medalCounts?.gold ?? 0}</strong>
                          </span>
                          <span className="members-medal inline-flex items-center gap-1">
                            <img src="/icons/medal-silver.svg" alt="Medaille argent" className="h-4 w-4" />
                            <strong className="text-sm text-gray-900">{member.medalCounts?.silver ?? 0}</strong>
                          </span>
                          <span className="members-medal inline-flex items-center gap-1">
                            <img src="/icons/medal-bronze.svg" alt="Medaille bronze" className="h-4 w-4" />
                            <strong className="text-sm text-gray-900">{member.medalCounts?.bronze ?? 0}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                    {renderChevron(isExpanded)}
                    <span className="sr-only">
                      {isExpanded ? 'Masquer les actions' : 'Afficher les actions'}
                    </span>
                  </button>
                  <div className={`${isExpanded ? 'flex' : 'hidden'} mt-auto flex-col gap-2`}>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/members/${member.id}/matches`}
                        className="members-card-action inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Matchs
                      </Link>
                      <Link
                        href={`/members/${member.id}/notifications`}
                        className="members-card-action inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Notifications
                      </Link>
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}