 'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
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
  const { loading: authLoading, authenticated, authDisabled, permissions, isSuperUser } = useAuthSession()
  const isAdmin = isSuperUser || permissions.includes('manage_members')

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const [clanName, setClanName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortOrder, setSortOrder] = useState<'az' | 'za'>('az')

  const sortedMembers = useMemo(() => {
    return [...members].sort((left, right) => {
      const comparison = left.displayName.localeCompare(right.displayName, 'fr', {
        sensitivity: 'base',
      })

      return sortOrder === 'az' ? comparison : comparison * -1
    })
  }, [members, sortOrder])

  const sortItems: MobileDropdownNavItem[] = [
    {
      key: 'az',
      label: 'Nom A-Z',
      active: sortOrder === 'az',
      onSelect: () => setSortOrder('az'),
    },
    {
      key: 'za',
      label: 'Nom Z-A',
      active: sortOrder === 'za',
      onSelect: () => setSortOrder('za'),
    },
  ]

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  useEffect(() => {
    if (authLoading || (!authenticated && !authDisabled) || !clanId) {
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
  }, [authDisabled, authLoading, authenticated, clanId])

  if (authLoading) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10">
        <p className="text-sm text-gray-600">Verification de la session...</p>
      </main>
    )
  }

  if ((!authenticated && !authDisabled) || !clanId) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10">
        <p className="text-sm text-gray-600">Redirection...</p>
      </main>
    )
  }

  return (
    <div className="members-page app-page-surface min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <NavigationTrail
          currentLabel="Membres"
          currentHref={`/clans/${clanId}/members`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />

        <header
          className="relative mb-8 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/members.jpg')`, backgroundPosition: 'center 20%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Users className="h-4 w-4 text-cyan-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">Membres du clan</h1>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
              {clanName ? `${clanName} ·` : ''} Consulte les joueurs et ouvre leurs sections principales.
            </p>
          </div>
        </header>

        <div className="members-panel rounded bg-white p-4 shadow sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold">Joueurs ({members.length})</h2>
              {isAdmin && (
                <Link
                  href={`/clans/${clanId}/members/pending`}
                  className="text-sm font-medium text-cyan-600 hover:text-cyan-700 hover:underline"
                >
                  Demandes en attente
                </Link>
              )}
            </div>
            <MobileDropdownNav
              id={`members-sort-${clanId}`}
              label="Trier les joueurs"
              currentLabel={sortOrder === 'az' ? 'Nom A-Z' : 'Nom Z-A'}
              items={sortItems}
              variant="compact"
              visibilityClass="block"
              className="w-full max-w-xs sm:w-auto"
              leftIcon={(
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="M6 4.5h8M6 10h5.5M6 15.5h3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            />
          </div>
          {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
          {loading ? <TableSkeleton /> : null}
          {!loading && members.length === 0 ? (
            <p className="text-gray-500">No members yet</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:gap-6">
              {sortedMembers.map((member) => (
                <Link
                  key={member.id}
                  href={`/members/${member.id}/dashboard`}
                  className="members-card app-panel flex min-w-0 flex-col gap-3 p-3 transition hover:border-cyan-400/40 hover:shadow-md sm:p-4"
                >
                  <div className="flex min-w-0 items-center gap-3 sm:gap-4">
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
                      <p className="truncate text-base font-semibold sm:text-lg">{member.displayName}</p>
                      {member.pubgPlayerName && member.pubgPlayerName !== member.displayName ? (
                        <p className="truncate text-sm text-gray-600">{member.pubgPlayerName}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="members-medals mt-auto flex items-center justify-center gap-6 border-t border-gray-200 pt-3 text-xs text-gray-600">
                    <span className="members-medal inline-flex items-center gap-1.5">
                      <img src="/icons/medal-gold.svg" alt="Medaille or" className="h-5 w-5" />
                      <strong className="text-base text-gray-900">{member.medalCounts?.gold ?? 0}</strong>
                    </span>
                    <span className="members-medal inline-flex items-center gap-1.5">
                      <img src="/icons/medal-silver.svg" alt="Medaille argent" className="h-5 w-5" />
                      <strong className="text-base text-gray-900">{member.medalCounts?.silver ?? 0}</strong>
                    </span>
                    <span className="members-medal inline-flex items-center gap-1.5">
                      <img src="/icons/medal-bronze.svg" alt="Medaille bronze" className="h-5 w-5" />
                      <strong className="text-base text-gray-900">{member.medalCounts?.bronze ?? 0}</strong>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}