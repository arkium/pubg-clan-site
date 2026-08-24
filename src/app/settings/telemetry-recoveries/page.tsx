'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

type TelemetryWindow = '24h' | '7d' | '30d' | 'all'

type ClanStat = {
  clanId: number
  clanName: string
  clanTag: string
  total: number
  success: number
  failed: number
  expired: number
  pending: number
  withParsedPayload: number
  successRate: number | null
}

type OverviewPayload = {
  ok: boolean
  data?: { clans?: ClanStat[] }
  clans?: ClanStat[]
  error?: { message?: string }
}

const WINDOW_OPTIONS: Array<{ value: TelemetryWindow; label: string }> = [
  { value: '24h', label: '24 heures' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: 'all', label: 'Tout' },
]

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return '-'
  }

  return `${value.toFixed(1)} %`
}

export default function TelemetryRecoveriesOverviewPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser } = useAuthSession()

  const [window, setWindow] = useState<TelemetryWindow>('7d')
  const [clans, setClans] = useState<ClanStat[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/telemetry-recoveries')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading || !authenticated || !isSuperUser) {
      return
    }

    let cancelled = false

    async function load() {
      try {
        setLoadingData(true)
        setError('')

        const response = await fetch(`/api/settings/telemetry-recoveries?window=${window}`, {
          cache: 'no-store',
        })

        const payload = (await response.json().catch(() => null)) as OverviewPayload | null

        if (!response.ok || !payload || !payload.ok) {
          if (response.status === 401 || response.status === 403) {
            router.replace('/login?redirect=/settings/telemetry-recoveries')
            return
          }

          if (!cancelled) {
            setClans([])
            setError(payload?.error?.message ?? 'Chargement impossible')
          }
          return
        }

        if (!cancelled) {
          setClans(payload.data?.clans ?? payload.clans ?? [])
        }
      } catch {
        if (!cancelled) {
          setClans([])
          setError('Chargement impossible')
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false)
          setRefreshing(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [authenticated, isSuperUser, loading, reloadToken, router, window])

  if (loading || loadingData) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm text-slate-600">Chargement de la vue telemetrie...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!isSuperUser) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Recoveries Télémétrie Cross-clans"
        currentHref="/settings/telemetry-recoveries"
        fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
      />
        <section className="app-panel p-6">
          <h1 className="text-xl font-bold text-amber-900">Acces restreint</h1>
          <p className="mt-2 text-sm text-amber-800">Cette page est reservee au SuperUser.</p>
          <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">
            Retour a l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Recoveries Télémétrie Cross-clans"
        currentHref="/settings/telemetry-recoveries"
        fallbackParent={{ href: '/settings/superuser', label: 'SuperUser' }}
      />
      <section className="app-panel mb-4 p-4">
        <SettingsPageHeader
          title="Telemetrie — vue cross-clans"
          subtitle="Compare la sante du pipeline de recuperation telemetrie entre tous les clans suivis."
        />
      </section>

      <section className="app-panel p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            size="sm"
            value={window}
            onChange={(value) => setWindow(value)}
            options={WINDOW_OPTIONS}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  setRecalculating(true)
                  await fetch('/api/clans/1/telemetry/recalc-aggregates-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scope: 'all-clans' }),
                  })
                  setReloadToken((current) => current + 1)
                } catch {
                  setError('Erreur lors du recalcul des agrégats')
                } finally {
                  setRecalculating(false)
                }
              }}
              disabled={recalculating}
              className="app-btn app-btn--sm app-btn--secondary gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${recalculating ? 'animate-spin' : ''}`} aria-hidden />
              {recalculating ? 'Recalcul en cours...' : 'Recalculer Agrégats'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRefreshing(true)
                setReloadToken((current) => current + 1)
              }}
              disabled={refreshing || recalculating}
              className="app-btn app-btn--sm app-btn--secondary gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
              {refreshing ? 'Rafraîchissement...' : 'Rafraîchir'}
            </button>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-800">{error}</p> : null}

        <div className="mt-6 space-y-2">
          {clans.length === 0 ? (
            <p className="app-panel-muted p-4 text-sm text-slate-600">
              Aucune recuperation telemetrie sur cette periode.
            </p>
          ) : (
            clans.map((clan) => {
              const successPct = clan.total > 0 ? (clan.success / clan.total) * 100 : 0
              const failedPct = clan.total > 0 ? (clan.failed / clan.total) * 100 : 0
              const expiredPct = clan.total > 0 ? (clan.expired / clan.total) * 100 : 0
              const pendingPct = clan.total > 0 ? (clan.pending / clan.total) * 100 : 0
              const failureRatio = clan.total > 0 ? clan.failed / clan.total : 0
              const isProblematic = failureRatio > 0.1

              return (
                <div
                  key={clan.clanId}
                  className={`app-panel-muted p-4 text-sm ${isProblematic ? 'border border-rose-300' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                      {isProblematic ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                      ) : null}
                      {clan.clanName} <span className="text-slate-500">[{clan.clanTag}]</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {clan.failed > 0 ? (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-800">
                          {clan.failed} echec(s)
                        </span>
                      ) : null}
                      {clan.expired > 0 ? (
                        <span className="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 font-semibold text-gray-700">
                          {clan.expired} expire(s)
                        </span>
                      ) : null}
                      {clan.pending > 0 ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                          {clan.pending} en attente
                        </span>
                      ) : null}
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                        {clan.success} succes
                      </span>
                      <Link
                        href={`/clans/${clan.clanId}/telemetry/recoveries`}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-gray-100"
                      >
                        Detail
                        <ArrowRight className="h-3 w-3" aria-hidden />
                      </Link>
                    </div>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    {clan.total} recuperation(s) • taux de succes {formatPercent(clan.successRate)} •{' '}
                    {clan.withParsedPayload} avec parser JSON
                  </p>

                  <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full bg-emerald-400" style={{ width: `${successPct}%` }} />
                    <div className="h-full bg-rose-500" style={{ width: `${failedPct}%` }} />
                    <div className="h-full bg-gray-400" style={{ width: `${expiredPct}%` }} />
                    <div className="h-full bg-amber-400" style={{ width: `${pendingPct}%` }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>
    </main>
  )
}
