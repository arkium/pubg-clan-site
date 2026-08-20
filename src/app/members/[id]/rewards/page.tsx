'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

type PlayerRewards = {
  totalPoints: number
  badges: string[]
}

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function fetchRewardsData(memberId: number) {
  const res = await fetch(`/api/members/${memberId}/rewards`)
  if (!res.ok) throw new Error('Introuvable')
  return res.json() as Promise<{ rewards: PlayerRewards | null; displayName: string }>
}

export default function MemberRewardsPage() {
  const params = useParams()
  const router = useRouter()

  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [rewards, setRewards] = useState<PlayerRewards | null>(null)
  const [memberName, setMemberName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!memberId) {
      router.replace('/clans')
    }
  }, [memberId, router])

  useEffect(() => {
    if (!memberId) return

    const currentMemberId = memberId
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchRewardsData(currentMemberId)
        if (!cancelled) {
          setRewards(data.rewards)
          setMemberName(data.displayName)
        }
      } catch {
        if (!cancelled) {
          setError('Impossible de charger les récompenses.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [memberId])

  if (!memberId) return null

  return (
    <main className="app-container app-main space-y-4">
      <NavigationTrail
        currentLabel="Récompenses"
        currentHref={`/members/${memberId}/rewards`}
        fallbackParent={{ href: `/members/${memberId}/dashboard`, label: 'Dashboard', altHref: '/members' }}
      />
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Récompenses{memberName ? ` de ${memberName}` : ''}
      </h1>

      {loading ? <p className="text-sm text-gray-500">Chargement...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !error && rewards ? (
        <div className="space-y-6">
          <div className="rounded border border-gray-200 bg-white p-6 text-center">
            <p className="text-4xl font-bold text-yellow-600">
              {rewards.totalPoints.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-gray-500">points totaux</p>
          </div>

          <div className="rounded border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Badges</h2>
            {rewards.badges.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun badge pour l&apos;instant.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {rewards.badges.map((badge, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800"
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {!loading && !error && !rewards ? (
        <div className="rounded border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-500">Aucune récompense pour ce joueur.</p>
          <p className="mt-2 text-4xl">🏆</p>
          <p className="mt-2 text-sm text-gray-400">Participez aux challenges pour gagner des points !</p>
        </div>
      ) : null}
    </main>
  )
}
