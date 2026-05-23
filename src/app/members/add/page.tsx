'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'

const PLATFORM_OPTIONS = [
  { value: 'steam', label: 'Steam' },
  { value: 'console', label: 'Console' },
  { value: 'kakao', label: 'Kakao' },
]

export default function AddMemberPage() {
  const { loading: authLoading, permissions } = useAuthSession()
  const [submitting, setSubmitting] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [pubgPlayerName, setPubgPlayerName] = useState('')
  const [platformShard, setPlatformShard] = useState('steam')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canManageMembers = useMemo(
    () => permissions.includes('*') || permissions.includes('manage_members'),
    [permissions]
  )

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      const response = await fetch('/api/members', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          displayName,
          pubgPlayerName,
          platformShard,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to add member')
      }

      setSuccess('Member added successfully.')
      setDisplayName('')
      setPubgPlayerName('')
      setPlatformShard('steam')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <p className="text-sm text-gray-600">Verification des permissions...</p>
      </main>
    )
  }

  if (!canManageMembers) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h1 className="text-xl font-semibold text-amber-900">Acces reserve</h1>
          <p className="mt-2 text-sm text-amber-800">
            Seuls les admins et owners peuvent ajouter des joueurs.
          </p>
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
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Ajouter un joueur</h1>
        <Link
          href="/members"
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Voir la liste
        </Link>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleAddMember} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nom affiche</label>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="ex: John"
              className="w-full rounded border border-gray-300 px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Pseudo PUBG</label>
            <input
              type="text"
              value={pubgPlayerName}
              onChange={(event) => setPubgPlayerName(event.target.value)}
              placeholder="ex: ProGamer123"
              className="w-full rounded border border-gray-300 px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Plateforme</label>
            <select
              value={platformShard}
              onChange={(event) => setPlatformShard(event.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2"
            >
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Ajout en cours...' : 'Ajouter le joueur'}
          </button>
        </form>
      </section>
    </main>
  )
}
