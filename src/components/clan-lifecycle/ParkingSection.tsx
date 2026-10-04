'use client'

import { Archive, SquareParking } from 'lucide-react'
import { useState } from 'react'

import {
  ButtonSpinner,
  EmptyState,
  ErrorState,
  LifecycleCard,
  ListSkeleton,
  Tag,
  formatDate,
  plural,
  useLifecycleResource,
  type Notify,
} from '@/components/clan-lifecycle/LifecycleShared'
import Pagination from '@/components/ui/Pagination'
import { paginate } from '@/lib/pagination'

/**
 * Onglet « Parking » (`?tab=ungrouped`) — joueurs garés dans le clan technique Ungrouped et leur archivage
 * (docs/features/cycle-de-vie-clan.md §6), selon la charte : résumé et action dans l'en-tête de la carte, joueurs en
 * lignes d'un panneau, pagination numérotée. Corps envoyé inchangé (`archive` des candidats).
 */

type UngroupedMember = {
  memberId: number
  displayName: string
  lastMatchAt: string | null
  inactiveDays: number | null
  eligibleAt: string | null
  isCandidate: boolean
}

const PAGE_SIZE = 10

export function ParkingSection({ onChanged, onToast }: { onChanged: () => void; onToast: Notify }) {
  const [token, setToken] = useState(0)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)
  const { data, loading, error } = useLifecycleResource<{ members?: UngroupedMember[]; thresholdDays?: number }>(
    '/api/settings/clan-lifecycle/ungrouped',
    token
  )
  const members = data?.members ?? []
  const thresholdDays = data?.thresholdDays ?? 90
  const candidates = members.filter((member) => member.isCandidate)
  const { current, pageCount, visible } = paginate(members, page, PAGE_SIZE)

  async function archiveAll() {
    setBusy(true)
    try {
      const res = await fetch('/api/settings/clan-lifecycle/ungrouped', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'archive', memberIds: candidates.map((candidate) => candidate.memberId) }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.error ?? 'Échec')
      onToast(payload.message, 'success')
      setToken((value) => value + 1)
      onChanged()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!data && loading) return <ListSkeleton />
  if (!data && error) return <ErrorState message={error} onRetry={() => setToken((value) => value + 1)} testId="lifecycle-parking-error" />

  return (
    <LifecycleCard
      id="lifecycle-parking-title"
      icon={SquareParking}
      title="Joueurs au parking"
      testId="lifecycle-parking"
      meta={
        <span className="t-num" data-testid="lifecycle-parking-summary">
          {plural(members.length, 'joueur')} au parking · <b className="text-gray-900">{plural(candidates.length, 'archivable', 'archivables')}</b> au-delà
          de {thresholdDays} jours d’inactivité
        </span>
      }
      aside={
        candidates.length > 0 ? (
          <button type="button" onClick={() => void archiveAll()} disabled={busy} className="app-btn app-btn--sm app-btn--primary gap-1.5">
            {busy ? <ButtonSpinner /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
            Archiver les {plural(candidates.length, 'candidat')}
          </button>
        ) : null
      }
    >
      {members.length === 0 ? (
        <EmptyState icon={SquareParking} title="Le parking est vide" text="Aucun joueur sans clan n’est suivi en ce moment." testId="lifecycle-parking-empty" />
      ) : (
        <div className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {error ? <p className="text-[13px] font-semibold text-[var(--theme-ui-negative)]">{error}</p> : null}
          <ul className="app-panel-muted overflow-hidden" aria-label="Joueurs au parking">
            {visible.map((member) => (
              <li
                key={member.memberId}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-gray-200 px-3.5 py-2.5 first:border-t-0"
                data-testid="lifecycle-parking-member"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-semibold text-gray-900">{member.displayName}</span>
                  <span className="t-meta t-num">
                    {member.inactiveDays === null ? 'aucun match connu' : `${member.inactiveDays} j d’inactivité`}
                  </span>
                </span>
                {member.isCandidate ? (
                  <Tag tone="warn">Archivable</Tag>
                ) : (
                  <span className="t-meta t-num">éligible le {formatDate(member.eligibleAt)}</span>
                )}
              </li>
            ))}
          </ul>
          <Pagination
            page={current}
            pageCount={pageCount}
            total={members.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            ariaLabel="Pages du parking"
            itemLabel="Joueurs"
          />
        </div>
      )}
    </LifecycleCard>
  )
}
