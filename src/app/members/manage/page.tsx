'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'

type Member = {
  id: number
  displayName: string
  pubgPlayerName: string
  pubgAccountId: string | null
  platformShard: string
  avatarUrl?: string | null
  clan: {
    id: number
    name: string
    tag: string
  } | null
}

export default function ManageMembersPage() {
  const { loading: authLoading, permissions } = useAuthSession()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingMemberId, setDeletingMemberId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canManageMembers = useMemo(
    () => permissions.includes('*') || permissions.includes('manage_members'),
    [permissions]
  )

  async function fetchMembers() {
    setLoading(true)
    try {
      const response = await fetch('/api/members')
      const payload = (await response.json()) as Member[] | { error?: string }

      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : 'Failed to fetch members')
      }

      setMembers(payload as Member[])
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchMembers()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [])

  async function handleDeleteMember(member: Member) {
    const confirmed = window.confirm(`Stop tracking ${member.displayName} (${member.pubgPlayerName})?`)
    if (!confirmed) {
      return
    }

    setError('')
    setSuccess('')
    setDeletingMemberId(member.id)

    try {
      const response = await fetch(`/api/members/${member.id}`, {
        method: 'DELETE',
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to delete member')
      }

      setSuccess('Joueur retiré du suivi.')
      await fetchMembers()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unknown error')
    } finally {
      setDeletingMemberId(null)
    }
  }

  if (authLoading) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <p className="text-sm text-gray-600">Verification des permissions...</p>
      </main>
    )
  }

  if (!canManageMembers) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h1 className="text-xl font-semibold text-amber-900">Acces reserve</h1>
          <p className="mt-2 text-sm text-amber-800">Cette page est reservee aux admins et owners.</p>
          <Link
            href="/members"
            className="mt-4 inline-flex rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
          >
            Retour a la liste des joueurs
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des joueurs suivis</h1>
          <p className="text-sm text-gray-600">Suppression et maintenance des comptes suivis</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/members/add"
            className="rounded border border-indigo-200 bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Ajouter un joueur
          </Link>
          <Link
            href="/members"
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Voir la liste
          </Link>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mb-3 text-sm text-emerald-700">{success}</p> : null}
      {loading ? <p className="text-sm text-gray-600">Chargement des membres...</p> : null}

      {!loading && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Joueur</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Clan</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Plateforme</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{member.displayName}</p>
                      <p className="text-xs text-gray-600">{member.pubgPlayerName}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {member.clan ? `${member.clan.name} [${member.clan.tag}]` : 'Sans clan detecte'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{member.platformShard}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/members/${member.id}/dashboard`}
                          className="rounded border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Dashboard
                        </Link>
                        <Link
                          href={`/members/${member.id}/matches`}
                          className="rounded border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Matchs
                        </Link>
                        <Link
                          href={`/members/${member.id}/notifications`}
                          className="rounded border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Notifications
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDeleteMember(member)}
                          disabled={deletingMemberId === member.id}
                          className="rounded border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingMemberId === member.id ? 'Suppression...' : 'Stop tracking'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!members.length ? (
            <p className="border-t border-gray-100 p-4 text-sm text-gray-600">Aucun joueur a gerer.</p>
          ) : null}
        </section>
      )}
    </main>
  )
}
