'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { useSelectedClan } from '@/hooks/useSelectedClan'

interface Member {
  id: number
  displayName: string
  pubgPlayerName: string
  pubgAccountId: string | null
  platformShard: string
  createdAt: string
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function ClanMembersPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  useEffect(() => {
    if (!clanId) {
      return
    }

    let cancelled = false

    async function fetchMembers() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/members?clanId=${clanId}`)
        const data = (await response.json()) as Member[] | { error?: string }

        if (!response.ok) {
          throw new Error('error' in data ? data.error : 'Failed to load members')
        }

        if (!cancelled) {
          setMembers(data as Member[])
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load members')
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
  }, [clanId])

  if (!clanId) {
    return null
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Membres du clan #{clanId}</h1>
        <Link
          href="/clans"
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Changer de clan
        </Link>
      </div>

      {loading ? <p className="text-sm text-gray-600">Chargement des membres...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        members.length === 0 ? (
          <p className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
            Aucun membre actif pour ce clan.
          </p>
        ) : (
          <ul className="space-y-3">
            {members.map((member) => (
              <li
                key={member.id}
                className="rounded border border-gray-200 bg-white p-4 shadow-sm"
              >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{member.displayName}</p>
                      <p className="text-sm text-gray-600">{member.pubgPlayerName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/members/${member.id}/matches`}
                        className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        Voir les matchs
                      </Link>
                      <Link
                        href={`/members/${member.id}/notifications`}
                        className="rounded border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                      >
                        Notifications
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        )
      ) : null}
    </main>
  )
}
