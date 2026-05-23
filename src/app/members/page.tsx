'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

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
  const { permissions } = useAuthSession()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canManageMembers = useMemo(
    () => permissions.includes('*') || permissions.includes('manage_members'),
    [permissions]
  )

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
    const timeoutId = window.setTimeout(() => {
      void fetchMembers()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">Clan Members</h1>

          {canManageMembers ? (
            <div className="flex items-center gap-2">
              <Link
                href="/members/add"
                className="rounded-lg border border-indigo-200 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                Ajouter un joueur
              </Link>
              <Link
                href="/members/manage"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Gérer les joueurs
              </Link>
            </div>
          ) : null}
        </div>

        <div className="bg-white rounded shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Members ({members.length})
          </h2>
          {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
          {loading ? <p className="text-sm text-gray-500">Chargement des membres...</p> : null}
          {!loading && members.length === 0 ? (
            <p className="text-gray-500">No members yet</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col h-full border rounded-lg bg-gray-50 p-4 shadow-sm"
                >
                  <div className="flex items-center gap-4 mb-3">
                    {/* Avatar (avatarUrl si dispo, sinon fallback SVG) */}
                    <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border">
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.displayName + ' avatar'}
                          className="w-14 h-14 object-cover rounded-full"
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
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{member.displayName}</p>
                      <p className="text-sm text-gray-600 truncate">{member.pubgPlayerName}</p>
                      <p className="text-xs text-gray-500 truncate">ID: {member.pubgAccountId}</p>
                      {member.clan ? (
                        <p className="text-xs text-gray-500 truncate">
                          Clan: {member.clan.name} [{member.clan.tag}]
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 truncate">Clan: no PUBG clan detected</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    <span className="inline-block text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium">
                      {member.platformShard}
                    </span>
                    <Link
                      href={`/members/${member.id}/dashboard`}
                      className="flex-1 min-w-[120px] rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 text-center"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href={`/members/${member.id}/matches`}
                      className="flex-1 min-w-[120px] rounded border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 text-center"
                    >
                      View matches
                    </Link>
                    <Link
                      href={`/members/${member.id}/notifications`}
                      className="flex-1 min-w-[120px] rounded border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 text-center"
                    >
                      Notifications
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
