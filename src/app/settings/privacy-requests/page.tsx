'use client'

import { useCallback, useEffect, useState } from 'react'
import { Info, ShieldCheck } from 'lucide-react'

import AdminPageBanner from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, FormFeedback } from '@/components/settings/AdminPageStates'
import { Callout, EmptyState, ListSkeleton, Tag, type Tone } from '@/components/ui/CharteKit'
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
 * cette page en tient la liste, l'échéance (un mois, RGPD art. 12) et le statut. Selon la charte UI
 * (docs/ui/index.html) : bandeau photo, statut en pastille, échéance dépassée au jeton négatif.
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

const STATUS_TONE: Record<PrivacyRequestStatus, Tone> = {
  pending: 'warn',
  done: 'pos',
  rejected: 'neutral',
}

export default function PrivacyRequestsPage() {
  const [filter, setFilter] = useState<Filter>('pending')
  const [requests, setRequests] = useState<PrivacyRequestRow[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  // Lu une fois au montage : un rendu ne doit pas dépendre de l'heure (échéance « dépassée »).
  const [now] = useState(() => Date.now())

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

  const pendingCount = counts.pending ?? 0

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Demandes de confidentialité"
        subtitle="Demandes « Retirer mes données » reçues par le formulaire du site, à traiter sous un mois."
        icon={ShieldCheck}
        image="/account.jpg"
        currentHref="/settings/privacy-requests"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          <>
            <span className="t-num">{pendingCount}</span> en attente
          </>,
          'Réservé au SuperUser',
        ]}
      />

      <Callout tone="sky" icon={Info} title="Traitement manuel">
        Vérifier que le compte appartient au demandeur, appliquer la demande à la main, répondre par e-mail sous un mois, puis la
        clore ici.
      </Callout>

      <SegmentedControl<Filter>
        size="sm"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'pending', label: `En attente (${pendingCount})` },
          { value: 'all', label: 'Toutes' },
        ]}
      />

      <FormFeedback error={error} />

      {requests === null ? (
        error ? null : <ListSkeleton rows={3} />
      ) : requests.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={filter === 'pending' ? 'Aucune demande en attente' : 'Aucune demande reçue'} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {requests.map((request) => {
            const overdue = request.status === 'pending' && new Date(request.deadline).getTime() < now
            return (
              <li key={request.id} className="app-panel flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="m-0 flex flex-wrap items-baseline gap-x-2">
                    <span className="t-card-title">{request.pubgName}</span>
                    <span className="t-meta">{PRIVACY_REQUEST_KIND_LABELS[request.kind] ?? request.kind}</span>
                  </p>
                  <p className="t-meta m-0">
                    Reçue le {formatDate(request.createdAt)} ·{' '}
                    <span className={overdue ? 't-neg font-semibold' : ''}>
                      échéance {formatDate(request.deadline)}
                      {overdue ? ' (dépassée)' : ''}
                    </span>
                    {request.handledAt ? ` · close le ${formatDate(request.handledAt)}` : ''}
                  </p>
                  <a href={`mailto:${request.email}`} className="app-link self-start break-all text-xs font-semibold">
                    {request.email}
                  </a>
                  {request.reason ? <p className="t-body m-0 whitespace-pre-line text-gray-700">{request.reason}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Tag tone={STATUS_TONE[request.status]}>{PRIVACY_REQUEST_STATUS_LABELS[request.status] ?? request.status}</Tag>
                  {request.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        className="app-btn app-btn--sm app-btn--secondary"
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
