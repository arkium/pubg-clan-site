'use client'

import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import SegmentedControl from '@/components/ui/SegmentedControl'
import { useSelectedClan } from '@/hooks/useSelectedClan'

type AwardPeriod = 'week' | 'month' | 'all'

type AwardWinner = {
  memberId: number
  memberName: string
  value: number
}

type ClanAward = {
  key: string
  label: string
  description: string
  unit: string
  top3: AwardWinner[]
}

type ClanAwardsResponse = {
  clanId: number
  period: AwardPeriod
  periodKey: string
  matchCount: number
  awards: ClanAward[]
}

const PERIOD_OPTIONS: Array<{ value: AwardPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'All Time' },
]

const MEDAL_BY_RANK = ['🥇', '🥈', '🥉'] as const

const AWARD_EMOJI_BY_KEY: Record<string, string> = {
  top_killer: '💀',
  top_damage: '💥',
  jacky_tuning: '🚗',
  le_rodeur: '🥾',
  brouteur_herbe: '🌿',
  alcoolique_dimanche: '🍺',
  fou_hopital: '🩹',
  destructeur: '💣',
  le_sniper: '🎯',
  collectionneur: '🎒',
  brute_metal: '🚙',
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${remainingSeconds}s`
}

function formatAwardValue(award: ClanAward, value: number) {
  if (award.key === 'brouteur_herbe') {
    return formatDuration(value)
  }

  if (award.unit === 'm') {
    if (value >= 1000) {
      return `${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km`
    }

    return `${Math.round(value).toLocaleString('fr-FR')} m`
  }

  if (award.key === 'top_damage') {
    return `${Math.round(value).toLocaleString('fr-FR')} ${award.unit}`
  }

  return `${Math.round(value).toLocaleString('fr-FR')} ${award.unit}`
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  if ('error' in payload && typeof (payload as { error?: unknown }).error === 'string') {
    return (payload as { error: string }).error
  }

  return fallback
}

export default function ClanAwardsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [period, setPeriod] = useState<AwardPeriod>('week')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<ClanAwardsResponse | null>(null)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  const loadAwards = useCallback(
    async (currentClanId: number, currentPeriod: AwardPeriod) => {
      try {
        const response = await fetch(`/api/clans/${currentClanId}/awards?period=${currentPeriod}`, {
          cache: 'no-store',
        })

        const data = (await response.json().catch(() => null)) as
          | ClanAwardsResponse
          | { error?: string }
          | null

        if (!response.ok || !data || !('awards' in data)) {
          if (response.status === 401 || response.status === 403) {
            router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/awards`)}`)
            return
          }

          setPayload(null)
          setError(getErrorMessage(data, 'Chargement des awards impossible'))
          return
        }

        setPayload(data)
        setError(null)
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Chargement des awards impossible'
        setPayload(null)
        setError(message)
      }
    },
    [router]
  )

  useEffect(() => {
    if (!clanId) {
      return
    }

    let cancelled = false

    const run = async () => {
      setLoading(true)
      await loadAwards(clanId, period)
      if (!cancelled) {
        setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [clanId, period, loadAwards])

  const handleRefresh = useCallback(async () => {
    if (!clanId) {
      return
    }

    setRefreshing(true)
    await loadAwards(clanId, period)
    setRefreshing(false)
  }, [clanId, period, loadAwards])

  if (!clanId) {
    return null
  }

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <header className="app-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Awards du clan</h1>
            <p className="text-sm text-gray-600">
              Les distinctions fun sont calculees a la volee pour la periode selectionnee.
            </p>
          </div>

          <button
            type="button"
            className="app-btn app-btn--md app-btn--secondary"
            onClick={() => {
              void handleRefresh()
            }}
            disabled={refreshing || loading}
          >
            {refreshing ? 'Rafraichissement...' : 'Rafraichir'}
          </button>
        </div>

      </header>

      <section className="app-panel p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Periode</p>
        <SegmentedControl
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
          size="sm"
          fullWidthOnMobile
          className="w-full sm:w-auto"
        />
        {!loading && payload ? (
          <p className="mt-2 text-xs text-gray-500">
            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
              {payload.matchCount} match{payload.matchCount !== 1 ? 's' : ''}
            </span>
            {' '}pris en compte
          </p>
        ) : null}
      </section>

      {loading ? (
        <section className="app-panel p-4 text-sm text-gray-600">Chargement des awards...</section>
      ) : null}

      {error ? <section className="app-panel p-4 text-sm text-rose-800">{error}</section> : null}

      {!loading && !error && payload ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {payload.awards.map((award) => {
            const emoji = AWARD_EMOJI_BY_KEY[award.key] ?? '🏅'

            return (
              <article key={award.key} className="app-panel p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{award.key.replaceAll('_', ' ')}</p>
                    <h2 className="text-lg font-semibold text-gray-900">{award.label}</h2>
                  </div>
                  <span className="text-2xl" aria-hidden="true">
                    {emoji}
                  </span>
                </div>

                <p className="text-sm text-gray-600">{award.description}</p>

                {award.top3.length > 0 ? (
                  <ol className="mt-4 overflow-hidden rounded-lg app-panel-muted">
                    {award.top3.map((entry, index) => (
                      <li key={entry.memberId} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="text-xl" aria-hidden="true">{MEDAL_BY_RANK[index]}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">{entry.memberName}</p>
                          <p className="text-sm font-medium text-blue-700">{formatAwardValue(award, entry.value)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="app-panel-muted mt-4 p-3 text-sm text-gray-600">
                    Pas de donnees sur cette periode.
                  </div>
                )}
              </article>
            )
          })}
        </section>
      ) : null}
    </main>
  )
}
