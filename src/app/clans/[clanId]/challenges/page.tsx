'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ChallengeCard from '@/components/ChallengeCard'
import ChallengeCreator from '@/components/ChallengeCreator'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { ChallengeDuration, ChallengeRewards } from '@/lib/challenge-service'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

type Participant = {
  memberId: number
  displayName: string
  progress: number
}

type Challenge = {
  id: string
  clanId: number
  title: string
  description: string | null
  type: string
  duration: string
  startDate: string
  endDate: string
  status: string
  target: number | null
  rewards: Record<string, number>
  participants: Participant[]
}

type Tab = 'active' | 'ended' | 'pending' | 'create'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const TAB_LABELS: Record<Tab, string> = {
  active: 'Actifs',
  ended: 'Terminés',
  pending: 'À venir',
  create: '+ Créer',
}

async function fetchChallengesData(clanId: number, status: Tab) {
  if (status === 'create') return []
  const url = `/api/clans/${clanId}/challenges?status=${status}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Erreur lors du chargement')
  const data = (await res.json()) as { challenges: Challenge[] }
  return data.challenges
}

export default function ChallengesPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [tab, setTab] = useState<Tab>('active')
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  useEffect(() => {
    if (!clanId || tab === 'create') return

    const currentClanId = clanId
    const currentTab = tab
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchChallengesData(currentClanId, currentTab)
        if (!cancelled) {
          setChallenges(data)
        }
      } catch {
        if (!cancelled) {
          setError('Impossible de charger les challenges.')
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
  }, [clanId, tab, refreshKey])

  async function handleCreate(data: {
    title: string
    description?: string
    type: string
    duration: ChallengeDuration
    target?: number
    rewards: ChallengeRewards
  }) {
    if (!clanId) return
    setCreating(true)
    try {
      const res = await fetch(`/api/clans/${clanId}/challenges`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'Erreur création')
      }
      setTab('pending')
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(challengeId: string) {
    if (!clanId) return
    try {
      const res = await fetch(`/api/clans/${clanId}/challenges/${challengeId}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'Erreur')
      }
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre le challenge.')
    }
  }

  if (!clanId) return null

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <NavigationTrail
        currentLabel="Défis"
        currentHref={`/clans/${clanId}/challenges`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Challenges du clan</h1>

      <div className="mb-6 flex gap-2 border-b border-gray-200">
        {(Object.entries(TAB_LABELS) as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'create' ? (
        <div className="rounded border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Créer un challenge</h2>
          <ChallengeCreator onSubmit={handleCreate} loading={creating} />
        </div>
      ) : null}

      {tab !== 'create' ? (
        <>
          {loading ? <p className="text-sm text-gray-500">Chargement...</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {!loading && !error && challenges.length === 0 ? (
            <p className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">
              Aucun challenge{' '}
              {tab === 'active' ? 'actif' : tab === 'ended' ? 'terminé' : 'à venir'}.
            </p>
          ) : null}
          <div className="space-y-4">
            {challenges.map((challenge) => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                onJoin={handleJoin}
              />
            ))}
          </div>
        </>
      ) : null}
    </main>
  )
}
