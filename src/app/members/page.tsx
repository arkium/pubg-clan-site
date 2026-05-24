'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useAuthSession } from '@/hooks/useAuthSession'

interface Member {
  id: number
  displayName: string
  pubgPlayerName: string
  pubgAccountId: string | null
  platformShard: string
  createdAt: string
  avatarUrl?: string | null
  clan: {
    id: number
    name: string
    tag: string
    pubgClanId: string | null
  } | null
}

export default function MembersPage() {
  const router = useRouter()
  const { loading: authLoading, authenticated, permissions } = useAuthSession()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortOrder, setSortOrder] = useState<'az' | 'za'>('az')
  const [expandedMemberId, setExpandedMemberId] = useState<number | null>(null)
  const canManageMembers = useMemo(
    () => permissions.includes('*') || permissions.includes('manage_members'),
    [permissions]
  )
  const sortedMembers = useMemo(() => {
    return [...members].sort((left, right) => {
      const comparison = left.displayName.localeCompare(right.displayName, 'fr', {
        sensitivity: 'base',
      })

      return sortOrder === 'az' ? comparison : comparison * -1
    })
  }, [members, sortOrder])

  // Récupérer la liste des membres
  async function fetchMembers() {
    setLoading(true)
    try {
      const res = await fetch('/api/members')
      const data = (await res.json()) as Member[] | { error?: string }

      if (!res.ok) {
        throw new Error('error' in data ? data.error : 'Failed to fetch members')
      }

      setMembers(data as Member[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  // Charger les membres au démarrage
  useEffect(() => {
    if (authLoading) {
      return
    }

    if (!authenticated) {
      router.replace('/login')
      return
    }

    const timeoutId = window.setTimeout(() => {
      void fetchMembers()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [authLoading, authenticated, router])

  if (authLoading) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10">
        <p className="text-sm text-gray-600">Verification de la session...</p>
      </main>
    )
  }

  if (!authenticated) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10">
        <p className="text-sm text-gray-600">Redirection vers la connexion...</p>
      </main>
    )
  }

  function toggleMemberCard(memberId: number) {
    setExpandedMemberId((current) => (current === memberId ? null : memberId))
  }

  function renderChevron(expanded: boolean) {
    return (
      <span
        className={`mt-3 inline-flex h-9 w-9 items-center justify-center self-center rounded-full border border-slate-200 bg-white text-slate-500 transition ${expanded ? 'rotate-180' : ''}`}
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
    <div className="min-h-screen bg-gray-100 px-3 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Membres du clan</h1>

          {canManageMembers ? (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:items-center">
              <Link
                href="/members/add"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-indigo-200 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 sm:min-h-11 sm:rounded-lg sm:px-4"
              >
                Ajouter un joueur
              </Link>
              <Link
                href="/members/manage"
                className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:min-h-11 sm:rounded-lg sm:px-4"
              >
                Gérer les joueurs
              </Link>
            </div>
          ) : null}
        </div>

        <div className="rounded bg-white p-4 shadow sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-xl font-semibold">
              Joueurs ({members.length})
            </h2>
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
                  className={`mx-auto flex h-full w-full max-w-[19rem] flex-col rounded-lg border bg-gray-50 p-3 shadow-sm transition sm:max-w-none sm:p-4 ${isExpanded ? 'border-slate-300 shadow-md' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleMemberCard(member.id)}
                    className="mb-3 flex w-full flex-col text-left"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-gray-200 sm:h-14 sm:w-14">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.displayName + ' avatar'}
                            className="h-12 w-12 rounded-full object-cover sm:h-14 sm:w-14"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                          />
                        ) : (
                          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="20" cy="20" r="20" fill="#CBD5E1" />
                            <text x="50%" y="55%" textAnchor="middle" fill="#64748B" fontSize="18" fontFamily="Arial" dy=".3em">
                              {member.displayName.charAt(0).toUpperCase()}
                            </text>
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold sm:text-lg">{member.displayName}</p>
                        <p className="truncate text-sm text-gray-600">{member.pubgPlayerName}</p>
                        <p className="truncate text-xs text-gray-500">ID: {member.pubgAccountId}</p>
                        {member.clan ? (
                          <p className="truncate text-xs text-gray-500">
                            Clan: {member.clan.name} [{member.clan.tag}]
                          </p>
                        ) : (
                          <p className="truncate text-xs text-gray-400">Clan: no PUBG clan detected</p>
                        )}
                      </div>
                    </div>
                    {renderChevron(isExpanded)}
                    <span className="sr-only">
                      {isExpanded ? 'Masquer les actions' : 'Afficher les actions'}
                    </span>
                  </button>
                  <div className={`${isExpanded ? 'flex' : 'hidden'} mt-auto flex-col gap-2`}>
                    <span className="inline-block rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                      {member.platformShard}
                    </span>
                    <Link
                      href={`/members/${member.id}/dashboard`}
                      className="w-full rounded bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700 sm:min-w-[120px] sm:flex-1"
                    >
                      Tableau de bord
                    </Link>
                    <Link
                      href={`/members/${member.id}/matches`}
                      className="w-full rounded border border-blue-200 px-3 py-2 text-center text-sm font-medium text-blue-700 hover:bg-blue-50 sm:min-w-[120px] sm:flex-1"
                    >
                      Voir les matchs
                    </Link>
                    <Link
                      href={`/members/${member.id}/notifications`}
                      className="w-full rounded border border-blue-200 px-3 py-2 text-center text-sm font-medium text-blue-700 hover:bg-blue-50 sm:min-w-[120px] sm:flex-1"
                    >
                      Notifications
                    </Link>
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
