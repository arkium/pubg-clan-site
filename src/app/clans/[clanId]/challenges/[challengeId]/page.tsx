'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ChallengeLeaderboard from '@/components/ChallengeLeaderboard'
import { CHALLENGE_TYPES } from '@/lib/challenge-types'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

type LeaderboardEntry = {
  rank: number
  memberId: number
  displayName: string
  avatarUrl?: string | null
  progress: number
  reward: number
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
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseChallengeId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  return value
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getChallengeTypeMeta(type: string) {
  return (
    Object.values(CHALLENGE_TYPES).find((t) => t.key === type) ?? {
      name: type,
      icon: '🎯',
      description: '',
      metric: type,
    }
  )
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'À venir',
  active: 'Actif',
  ended: 'Terminé',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  ended: 'bg-gray-100 text-gray-700',
}

async function fetchChallengeData(clanId: number, challengeId: string) {
  const res = await fetch(`/api/clans/${clanId}/challenges/${challengeId}/leaderboard`)
  if (!res.ok) throw new Error('Challenge introuvable')
  return res.json() as Promise<{ challenge: Challenge; leaderboard: LeaderboardEntry[] }>
}

export default function ChallengePage() {
  const params = useParams()
  const router = useRouter()

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const challengeId = useMemo(() => parseChallengeId(params.challengeId), [params.challengeId])

  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!clanId || !challengeId) {
      router.replace('/clans')
    }
  }, [clanId, challengeId, router])

  useEffect(() => {
    if (!clanId || !challengeId) return

    const currentClanId = clanId
    const currentChallengeId = challengeId
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchChallengeData(currentClanId, currentChallengeId)
        if (!cancelled) {
          setChallenge(data.challenge)
          setLeaderboard(data.leaderboard)
        }
      } catch {
        if (!cancelled) {
          setError('Impossible de charger le challenge.')
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
  }, [clanId, challengeId, refreshKey])

  async function handleJoin() {
    if (!clanId || !challengeId) return
    setJoining(true)
    try {
      const res = await fetch(`/api/clans/${clanId}/challenges/${challengeId}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? 'Erreur')
      }
      setJoined(true)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de rejoindre.')
    } finally {
      setJoining(false)
    }
  }

  if (!clanId || !challengeId) return null

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
      <NavigationTrail
        currentLabel="Détail du défi"
        currentHref={`/clans/${clanId}/challenges/${challengeId}`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />
        <p className="text-sm text-gray-500">Chargement...</p>
      </main>
    )
  }

  if (error || !challenge) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-red-600">{error ?? 'Challenge introuvable.'}</p>
        <Link
          href={`/clans/${clanId}/challenges`}
          className="mt-2 inline-block text-sm text-blue-600 hover:underline"
        >
          ← Retour aux challenges
        </Link>
      </main>
    )
  }

  const meta = getChallengeTypeMeta(challenge.type)
  const rewards = challenge.rewards as Record<string, number>

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/clans/${clanId}/challenges`}
        className="mb-4 inline-block text-sm text-blue-600 hover:underline"
      >
        ← Retour aux challenges
      </Link>

      {/* Header */}
      <div className="mb-6 rounded border border-gray-200 bg-white p-6">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>
              {meta.icon}
            </span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{challenge.title}</h1>
              <p className="text-sm text-gray-500">{meta.name}</p>
            </div>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[challenge.status] ?? 'bg-gray-100 text-gray-700'}`}
          >
            {STATUS_LABELS[challenge.status] ?? challenge.status}
          </span>
        </div>

        {challenge.description ? (
          <p className="mb-3 text-sm text-gray-600">{challenge.description}</p>
        ) : null}

        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
          <span>Début: {formatDate(challenge.startDate)}</span>
          <span>Fin: {formatDate(challenge.endDate)}</span>
          {challenge.target ? <span>Objectif: {challenge.target}</span> : null}
        </div>
      </div>

      {/* Rewards */}
      <div className="mb-6 rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Récompenses</h2>
        <div className="flex flex-wrap gap-4">
          {(['1st', '2nd', '3rd'] as const).map((pos, i) => {
            const pts = rewards[pos]
            if (!pts) return null
            return (
              <div key={pos} className="text-center">
                <p className="text-xl">{['🥇', '🥈', '🥉'][i]}</p>
                <p className="text-sm font-medium text-yellow-600">+{pts} pts</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Join button */}
      {challenge.status === 'active' && !joined ? (
        <div className="mb-6">
          <button
            type="button"
            onClick={handleJoin}
            disabled={joining}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {joining ? 'Inscription...' : 'Rejoindre ce challenge'}
          </button>
        </div>
      ) : null}

      {joined ? (
        <p className="mb-6 text-sm font-medium text-green-600">✓ Vous êtes inscrit à ce challenge !</p>
      ) : null}

      {/* Leaderboard */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Classement</h2>
        <ChallengeLeaderboard leaderboard={leaderboard} metric={meta.metric} />
      </div>
    </main>
  )
}
