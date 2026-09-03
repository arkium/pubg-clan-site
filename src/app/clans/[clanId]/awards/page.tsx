'use client'

import { Trophy } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import SegmentedControl from '@/components/ui/SegmentedControl'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

type AwardPeriod = 'week' | 'month' | 'all'
type AwardScope = 'normal' | 'all'

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
  scope: AwardScope
  periodKey: string
  matchCount: number
  awards: ClanAward[]
}

const PERIOD_OPTIONS: Array<{ value: AwardPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'All Time' },
]

const SCOPE_OPTIONS: Array<{ value: AwardScope; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'all', label: 'Tout' },
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
  const [scope, setScope] = useState<AwardScope>('normal')
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
    async (currentClanId: number, currentPeriod: AwardPeriod, currentScope: AwardScope, force = false) => {
      try {
        const forceParam = force ? '&force=true' : ''
        const response = await fetch(
          `/api/clans/${currentClanId}/awards?period=${currentPeriod}&scope=${currentScope}${forceParam}`,
          {
            cache: 'no-store',
          }
        )

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
      await loadAwards(clanId, period, scope)
      if (!cancelled) {
        setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [clanId, period, scope, loadAwards])

  const handleRefresh = useCallback(async () => {
    if (!clanId) {
      return
    }

    setRefreshing(true)
    await loadAwards(clanId, period, scope, true)
    setRefreshing(false)
  }, [clanId, period, scope, loadAwards])

  if (!clanId) {
    return null
  }

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel="Awards"
        currentHref={`/clans/${clanId}/awards`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />
      <header
        className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-center bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/awards.jpg')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <button
          type="button"
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-black/50 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition-colors hover:bg-black/70 disabled:opacity-60 sm:right-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-sm"
          onClick={() => {
            void handleRefresh()
          }}
          disabled={refreshing || loading}
        >
          {refreshing ? 'Rafraichissement...' : 'Rafraichir'}
        </button>
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Trophy className="h-4 w-4 text-yellow-400 sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">Awards du clan</h1>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
            Distinctions fun calculées à la volée.
          </p>
        </div>
      </header>

      <section className="app-panel space-y-4 p-4">
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Periode</p>
            <SegmentedControl
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              size="sm"
              fullWidthOnMobile
              className="w-full sm:w-auto"
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Mode de calcul</p>
            <SegmentedControl
              options={SCOPE_OPTIONS}
              value={scope}
              onChange={setScope}
              size="sm"
              fullWidthOnMobile
              className="w-full sm:w-auto"
            />
          </div>
        </div>

        <div className="app-panel-muted flex flex-col gap-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {!loading && payload ? (
              <>
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2.5 py-0.5 font-semibold text-gray-900 shadow-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  {payload.matchCount} match{payload.matchCount !== 1 ? 's' : ''}
                </span>
                <span className="font-medium text-gray-600 dark:text-slate-300">pris en compte</span>
              </>
            ) : (
              <span className="text-gray-500 dark:text-slate-400">Comptage des matchs en cours...</span>
            )}
          </div>

          <div className="text-gray-600 dark:text-slate-300 sm:text-right">
            {scope === 'normal' ? (
              <span>
                <strong className="font-semibold text-gray-900 dark:text-white">Normal :</strong> Matchs officiels uniquement en duo, trio et squad (exclut casual/bots, customs et modes spéciaux).
              </span>
            ) : (
              <span>
                <strong className="font-semibold text-gray-900 dark:text-white">Tout :</strong> Tous les types de matchs en duo, trio et squad (inclut officiels, compétitifs, parties personnalisées et casual/bots).
              </span>
            )}
          </div>
        </div>
      </section>

      {loading ? (
        <section className="app-panel p-4 text-sm text-gray-600 dark:text-slate-300">Chargement des awards...</section>
      ) : null}

      {error ? <section className="app-panel p-4 text-sm text-rose-800 dark:text-rose-300">{error}</section> : null}

      {!loading && !error && payload ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {payload.awards.map((award) => {
            const emoji = AWARD_EMOJI_BY_KEY[award.key] ?? '🏅'

            return (
              <article key={award.key} className="app-panel p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">{award.key.replaceAll('_', ' ')}</p>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{award.label}</h2>
                  </div>
                  <span className="text-2xl" aria-hidden="true">
                    {emoji}
                  </span>
                </div>

                <p className="text-sm text-gray-600 dark:text-slate-300">{award.description}</p>

                {award.top3.length > 0 ? (
                  <ol className="mt-4 overflow-hidden rounded-lg app-panel-muted">
                    {award.top3.map((entry, index) => (
                      <li key={entry.memberId} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="text-xl" aria-hidden="true">{MEDAL_BY_RANK[index]}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{entry.memberName}</p>
                          <p className="text-sm font-medium text-blue-700 dark:text-blue-400">{formatAwardValue(award, entry.value)}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="app-panel-muted mt-4 p-3 text-sm text-gray-600 dark:text-slate-400">
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
