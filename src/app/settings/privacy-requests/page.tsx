'use client'

import { useCallback, useEffect, useState } from 'react'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SegmentedControl from '@/components/ui/SegmentedControl'
import {
  PRIVACY_REQUEST_KIND_LABELS,
  PRIVACY_REQUEST_STATUS_LABELS,
  type PrivacyRequestKind,
  type PrivacyRequestStatus,
} from '@/lib/legal/privacy-request'

/**
 * Demandes « Retirer mes données » (/confidentialite/demande) — traitement par le SuperUser
 * (docs/features/pages-legales.md, docs/TODO/administration.md lot 3a). L'application de la demande reste manuelle ;
 * cette page en tient la liste, l'échéance (un mois, RGPD art. 12) et le statut.
 */

type PrivacyRequestRow = {
  id: number
  pubgName: string
  kind: PrivacyRequestKind
  reason: string | null
  email: string
  status: PrivacyRequestStatus
  createdAt: string
  handledAt: string | null
  deadline: string
}

type Filter = 'pending' | 'all'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

function formatDate(value: string) {
  return dateFormat.format(new Date(value))
}

const STATUS_CLASS: Record<PrivacyRequestStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  rejected: 'border-slate-200 bg-slate-100 text-slate-600',
}

export default function PrivacyRequestsPage() {
  const [filter, setFilter] = useState<Filter>('pending')
  const [requests, setRequests] = useState<PrivacyRequestRow[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async (nextFilter: Filter) => {
    try {
      const response = await fetch(`/api/settings/privacy-requests?status=${nextFilter}`, { cache: 'no-store' })
      const payload = (await response.json().catch(() => null)) as
        | { requests?: PrivacyRequestRow[]; counts?: Record<string, number>; error?: string }
        | null
      if (!response.ok) throw new Error(payload?.error ?? `HTTP ${response.status}`)
      setRequests(payload?.requests ?? [])
      setCounts(payload?.counts ?? {})
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Chargement impossible.')
    }
  }, [])

  useEffect(() => {
    void load(filter)
  }, [filter, load])

  async function changeStatus(id: number, status: PrivacyRequestStatus) {
    setBusyId(id)
    try {
      const response = await fetch(`/api/settings/privacy-requests/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? `HTTP ${response.status}`)
      }
      await load(filter)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Enregistrement impossible.')
    } finally {
      setBusyId(null)
    }
  }

  const now = Date.now()

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <NavigationTrail
        currentLabel="Demandes de confidentialité"
        currentHref="/settings/privacy-requests"
        fallbackParent={{ href: '/settings', label: 'Plateforme' }}
      />
      <section className="app-panel p-4 sm:p-6">
        <SettingsPageHeader
          title="Demandes de confidentialité"
          subtitle="Demandes « Retirer mes données ». Vérifier que le compte appartient au demandeur, appliquer la demande à la main, répondre par e-mail sous un mois, puis la clore ici."
          actions={
            <SegmentedControl<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'pending', label: `En attente (${counts.pending ?? 0})` },
                { value: 'all', label: 'Toutes' },
              ]}
            />
          }
        />
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {requests === null ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : requests.length === 0 ? (
        <section className="app-panel-muted p-6 text-center text-sm text-gray-500">
          {filter === 'pending' ? 'Aucune demande en attente.' : 'Aucune demande reçue.'}
        </section>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => {
            const overdue = request.status === 'pending' && new Date(request.deadline).getTime() < now
            return (
              <li key={request.id} className="app-panel p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-gray-900">
                      {request.pubgName}
                      <span className="ml-2 font-normal text-gray-500">· {PRIVACY_REQUEST_KIND_LABELS[request.kind] ?? request.kind}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Reçue le {formatDate(request.createdAt)} ·{' '}
                      <span className={overdue ? 'font-semibold text-red-600' : ''}>
                        échéance {formatDate(request.deadline)}
                        {overdue ? ' (dépassée)' : ''}
                      </span>
                      {request.handledAt ? ` · close le ${formatDate(request.handledAt)}` : ''}
                    </p>
                    <p className="text-xs text-gray-700">
                      <a href={`mailto:${request.email}`} className="underline">
                        {request.email}
                      </a>
                    </p>
                    {request.reason ? <p className="whitespace-pre-line text-sm text-gray-700">{request.reason}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLASS[request.status]}`}>
                      {PRIVACY_REQUEST_STATUS_LABELS[request.status] ?? request.status}
                    </span>
                    {request.status === 'pending' ? (
                      <>
                        <button
                          type="button"
                          className="app-btn app-btn--sm app-btn--primary"
                          disabled={busyId === request.id}
                          onClick={() => void changeStatus(request.id, 'done')}
                        >
                          Traitée
                        </button>
                        <button
                          type="button"
                          className="app-btn app-btn--sm app-btn--secondary"
                          disabled={busyId === request.id}
                          onClick={() => void changeStatus(request.id, 'rejected')}
                        >
                          Refusée
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="app-btn app-btn--sm app-btn--secondary"
                        disabled={busyId === request.id}
                        onClick={() => void changeStatus(request.id, 'pending')}
                      >
                        Rouvrir
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
