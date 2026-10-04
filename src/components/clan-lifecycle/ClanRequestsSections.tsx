'use client'

import Link from 'next/link'
import { Archive, ArchiveRestore, Check, Hourglass, Mail, Swords, UserRound, Users, X } from 'lucide-react'
import { useState } from 'react'

import {
  ButtonSpinner,
  ClanLabel,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Tag,
  formatDate,
  plural,
  useLifecycleResource,
  type Notify,
} from '@/components/clan-lifecycle/LifecycleShared'

/**
 * Onglets « Clans en attente » et « Clans archivés » (docs/features/cycle-de-vie-clan.md §4 et §12), selon la charte :
 * une carte `app-panel-muted` par clan, origine et raison en pastilles, actions en boutons de la charte, confirmation
 * en modale (au lieu de `window.confirm`). Routes et corps envoyés inchangés.
 */

// ── Clans en attente ────────────────────────────────────────────────────────────────────────────

type PendingClan = {
  id: number
  name: string
  tag: string
  platformShard: string
  createdAt: string
  origin: 'join_request' | 'auto_detected'
  requester: { memberId: number; playerName: string; contactEmail: string | null } | null
  pendingPromotions: number
}

export function PendingClansSection({ onChanged, onToast }: { onChanged: () => void; onToast: Notify }) {
  const [token, setToken] = useState(0)
  const [busy, setBusy] = useState<{ id: number; decision: 'approve' | 'reject' } | null>(null)
  const [confirmReject, setConfirmReject] = useState<PendingClan | null>(null)
  const { data, loading, error } = useLifecycleResource<{ clans?: PendingClan[] }>('/api/settings/clan-lifecycle/pending-clans', token)
  const clans = data?.clans ?? []

  async function decide(clanId: number, decision: 'approve' | 'reject') {
    setBusy({ id: clanId, decision })
    try {
      const res = await fetch(`/api/clans/${clanId}/${decision}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.error ?? 'Échec')
      onToast(payload.message, 'success')
      setToken((current) => current + 1)
      onChanged()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusy(null)
      setConfirmReject(null)
    }
  }

  if (!data && loading) return <ListSkeleton />
  if (!data && error) return <ErrorState message={error} onRetry={() => setToken((current) => current + 1)} testId="lifecycle-pending-error" />
  if (clans.length === 0) {
    return (
      <EmptyState
        icon={Hourglass}
        title="Aucun clan en attente de validation"
        text="Un clan découvert par la synchronisation ou demandé par /join apparaît ici jusqu’à ce que vous le validiez ou le refusiez."
        testId="lifecycle-pending-empty"
      />
    )
  }

  return (
    <>
      <ul className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading} aria-label="Clans en attente">
        {clans.map((clan) => {
          const rowBusy = busy?.id === clan.id
          return (
            <li key={clan.id} className="app-panel-muted flex flex-col gap-2.5 p-3.5 sm:p-4" data-testid="lifecycle-pending-clan">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <ClanLabel tag={clan.tag} name={clan.name} className="t-card-title" />
                <span className="t-meta t-num">créé le {formatDate(clan.createdAt)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Tag tone={clan.origin === 'auto_detected' ? 'sky' : 'neutral'}>
                  {clan.origin === 'auto_detected' ? 'Découvert automatiquement' : 'Demande /join'}
                </Tag>
                <span className="t-meta">{clan.platformShard}</span>
                {clan.tag ? (
                  <Link
                    href={`/settings/opponents?opponentsQ=${encodeURIComponent(clan.tag)}`}
                    className="app-link inline-flex items-center gap-1 text-[13px] font-semibold"
                    title="Historique de confrontations de ce clan dans l’Observatoire, pour décider en connaissance de cause"
                  >
                    <Swords className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Confrontations
                  </Link>
                ) : null}
              </div>
              <div className="flex flex-col gap-1 text-[13px] text-gray-700">
                {clan.requester ? (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <UserRound className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
                    Demandeur : <b className="text-gray-900">{clan.requester.playerName}</b>
                    <span aria-hidden="true">·</span>
                    {clan.requester.contactEmail ? (
                      <span className="inline-flex min-w-0 items-center gap-1 break-all font-mono text-[12px]">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
                        {clan.requester.contactEmail}
                      </span>
                    ) : (
                      <span className="italic text-gray-500">aucun email de contact</span>
                    )}
                  </span>
                ) : (
                  <span className="italic text-gray-500">Aucun demandeur — ce clan a été découvert par la synchronisation, pas demandé.</span>
                )}
                {clan.pendingPromotions > 0 ? (
                  <span className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
                    <span>
                      <b className="t-num text-gray-900">{clan.pendingPromotions}</b> joueur(s) y seront rattachés à l’activation
                    </span>
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 pt-0.5">
                {/* Action de chaque carte d'une liste : le bouton principal est permis une fois par carte (charte). */}
                <button
                  type="button"
                  onClick={() => void decide(clan.id, 'approve')}
                  disabled={rowBusy}
                  className="app-btn app-btn--sm app-btn--primary gap-1.5"
                >
                  {rowBusy && busy?.decision === 'approve' ? <ButtonSpinner /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  Valider
                </button>
                <button type="button" onClick={() => setConfirmReject(clan)} disabled={rowBusy} className="app-btn app-btn--sm app-btn--secondary gap-1.5">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  Refuser
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {confirmReject ? (
        <ConfirmDialog
          icon={X}
          title="Refuser cette demande de clan ?"
          confirmLabel="Refuser"
          tone="danger"
          busy={busy?.id === confirmReject.id}
          onCancel={() => setConfirmReject(null)}
          onConfirm={() => void decide(confirmReject.id, 'reject')}
          testId="lifecycle-reject-confirm"
        >
          <p>
            <ClanLabel tag={confirmReject.tag} name={confirmReject.name} /> quitte la liste d’attente et passe dans les clans
            archivés. Une nouvelle demande /join le remettra en attente.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  )
}

// ── Clans archivés ──────────────────────────────────────────────────────────────────────────────

type ArchivedClan = {
  id: number
  name: string
  tag: string
  platformShard: string
  archivedAt: string | null
  archivedReason: string | null
  attachedMembers: number
}

const ARCHIVE_REASON_LABELS: Record<string, string> = {
  unfollowed: 'Suivi arrêté',
  rejected: 'Demande refusée',
}

/**
 * Clans qu'on ne suit plus, ou dont la demande a été refusée — docs/TODO/clan-archive.md §4.C.
 * Réactiver remet le clan en service sans réintégrer ses anciens membres.
 */
export function ArchivedClansSection({ onChanged, onToast }: { onChanged: () => void; onToast: Notify }) {
  const [token, setToken] = useState(0)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [confirmClan, setConfirmClan] = useState<ArchivedClan | null>(null)
  const { data, loading, error } = useLifecycleResource<{ clans?: ArchivedClan[] }>('/api/settings/clan-lifecycle/archived-clans', token)
  const clans = data?.clans ?? []

  async function reactivate(clan: ArchivedClan) {
    setBusyId(clan.id)
    try {
      const res = await fetch(`/api/settings/clans/${clan.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reactivate' }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.error ?? 'Échec')
      onToast(payload.message, 'success')
      setToken((current) => current + 1)
      onChanged()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusyId(null)
      setConfirmClan(null)
    }
  }

  if (!data && loading) return <ListSkeleton />
  if (!data && error) return <ErrorState message={error} onRetry={() => setToken((current) => current + 1)} testId="lifecycle-archived-error" />
  if (clans.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="Aucun clan archivé"
        text="Arrêter le suivi d’un clan se fait depuis l’Observatoire (« Vos clans suivis ») ou depuis les paramètres du clan."
        testId="lifecycle-archived-empty"
      />
    )
  }

  return (
    <>
      <ul className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading} aria-label="Clans archivés">
        {clans.map((clan) => (
          <li key={clan.id} className="app-panel-muted flex flex-col gap-2.5 p-3.5 sm:p-4" data-testid="lifecycle-archived-clan">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <ClanLabel tag={clan.tag} name={clan.name} className="t-card-title" />
              <span className="t-meta t-num">archivé le {formatDate(clan.archivedAt)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Tag tone={clan.archivedReason === 'rejected' ? 'warn' : 'neutral'}>
                {ARCHIVE_REASON_LABELS[clan.archivedReason ?? ''] ?? clan.archivedReason ?? 'Archivé'}
              </Tag>
              <span className="t-meta">{clan.platformShard}</span>
            </div>
            <p className="text-[13px] text-gray-700">
              {clan.attachedMembers > 0
                ? `${plural(clan.attachedMembers, 'fiche encore rattachée', 'fiches encore rattachées')} (membres désactivés ou demandeur).`
                : 'Aucune fiche rattachée.'}
            </p>
            <div className="pt-0.5">
              <button type="button" onClick={() => setConfirmClan(clan)} disabled={busyId === clan.id} className="app-btn app-btn--sm app-btn--secondary gap-1.5">
                {busyId === clan.id ? <ButtonSpinner /> : <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />}
                Réactiver le suivi
              </button>
            </div>
          </li>
        ))}
      </ul>

      {confirmClan ? (
        <ConfirmDialog
          icon={ArchiveRestore}
          title="Suivre de nouveau ce clan ?"
          confirmLabel="Réactiver le suivi"
          tone="primary"
          busy={busyId === confirmClan.id}
          onCancel={() => setConfirmClan(null)}
          onConfirm={() => void reactivate(confirmClan)}
          testId="lifecycle-reactivate-confirm"
        >
          <p>
            <ClanLabel tag={confirmClan.tag} name={confirmClan.name} /> reprend sa place parmi les clans suivis. Ses anciens
            membres ne seront pas réintégrés automatiquement.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  )
}
