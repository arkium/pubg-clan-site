'use client'

import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

/**
 * Santé des données d'un clan (docs/TODO/administration.md Q17, lot 3b) : état de la télémétrie en lecture seule et
 * demande de resynchronisation plafonnée (50 parties par 24 h et par clan, à basse priorité dans la file commune).
 */

type DataHealth = {
  windowDays: number
  totalMatches: number
  withTelemetry: number
  expired: number
  missing: number
  lastTelemetryAt: string | null
  queuedJobs: number
  failedJobsLast7Days: number
  resync: { used: number; limit: number; remaining: number; resetsAt: string | null }
}

const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function fetchDataHealth(clanId: number): Promise<DataHealth> {
  const response = await fetch(`/api/clans/${clanId}/settings/data-health`, { cache: 'no-store' })
  const payload = (await response.json().catch(() => null)) as (DataHealth & { error?: string }) | null
  if (!response.ok || !payload) throw new Error(payload?.error ?? `HTTP ${response.status}`)
  return payload
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="app-panel-muted p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  )
}

export default function ClanDataHealthPage() {
  const params = useParams()
  const clanId = parseClanId(params.clanId)
  const [health, setHealth] = useState<DataHealth | null>(null)
  const [error, setError] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    if (!clanId) return
    try {
      setHealth(await fetchDataHealth(clanId))
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
    }
  }, [clanId])

  useEffect(() => {
    if (!clanId) return
    let cancelled = false
    fetchDataHealth(clanId).then(
      (payload) => {
        if (cancelled) return
        setHealth(payload)
        setError('')
      },
      (caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
      }
    )
    return () => {
      cancelled = true
    }
  }, [clanId])

  async function requestResync() {
    if (!clanId) return
    setRequesting(true)
    setMessage('')
    try {
      const response = await fetch(`/api/clans/${clanId}/settings/data-health/resync`, { method: 'POST' })
      const payload = (await response.json().catch(() => null)) as
        | { queuedCount?: number; reason?: string | null; error?: string }
        | null
      if (!response.ok && response.status !== 429) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      if (response.status === 429) {
        setMessage('Le quota de 24 h est atteint : la demande pourra être relancée plus tard.')
      } else if (payload?.reason === 'nothing-to-sync') {
        setMessage('Aucune partie récente à resynchroniser.')
      } else {
        setMessage(`${payload?.queuedCount ?? 0} partie(s) mise(s) en file. Elles passent après les autres traitements en cours.`)
      }
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Demande impossible.')
    } finally {
      setRequesting(false)
    }
  }

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Données"
        currentHref={clanId ? `/clans/${clanId}/settings/data` : '/clans'}
        fallbackParent={{ href: clanId ? `/clans/${clanId}/settings` : '/clans', label: 'Paramètres' }}
      />
      <section className="app-panel p-4 sm:p-6">
        <SettingsPageHeader
          title="Santé des données"
          subtitle="État de la télémétrie des parties du clan. La télémétrie alimente les cartes, le débriefing et les statistiques de combat."
        />
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {health === null ? (
        error ? null : <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={`Parties (${health.windowDays} j)`} value={String(health.totalMatches)} />
            <Stat
              label="Avec télémétrie"
              value={String(health.withTelemetry)}
              hint={health.totalMatches > 0 ? `${Math.round((health.withTelemetry / health.totalMatches) * 100)} %` : undefined}
            />
            <Stat label="Sans télémétrie" value={String(health.missing)} hint={health.expired > 0 ? `${health.expired} expirée(s) chez PUBG` : undefined} />
            <Stat
              label="Dernière télémétrie"
              value={health.lastTelemetryAt ? dateTimeFormat.format(new Date(health.lastTelemetryAt)) : '—'}
            />
          </section>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat label="En file d’attente" value={String(health.queuedJobs)} />
            <Stat label="Échecs (7 j)" value={String(health.failedJobsLast7Days)} />
          </section>

          <section className="app-panel p-4 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900">Demander une resynchronisation</h2>
            <p className="mt-1 text-sm text-gray-600">
              Met en file les parties des 14 derniers jours sans télémétrie, au plus {health.resync.limit} par 24 h pour le
              clan. Elles passent après les traitements des autres clans. Restant :{' '}
              <strong>{health.resync.remaining}</strong>
              {health.resync.resetsAt && health.resync.remaining < health.resync.limit
                ? ` (quota renouvelé à partir du ${dateTimeFormat.format(new Date(health.resync.resetsAt))})`
                : ''}
              .
            </p>
            <button
              type="button"
              className="mt-4 app-btn app-btn--md app-btn--primary"
              disabled={requesting || health.resync.remaining === 0 || health.missing === 0}
              onClick={() => void requestResync()}
            >
              {requesting ? 'Demande en cours…' : 'Demander une resynchronisation'}
            </button>
            {message ? <p className="mt-3 text-sm text-gray-700">{message}</p> : null}
          </section>
        </>
      )}
    </main>
  )
}
