'use client'

import { ChevronLeft, ChevronRight, History, Undo2, X } from 'lucide-react'
import { useState } from 'react'

import { RESOURCE_HISTORY_WINDOW_DAYS, type ResourceHistoryEntry, type ResourceHistoryResponse } from '@/lib/resources/resource-api'
import { actorInitial, dateTimeLabel } from '@/lib/resources/resource-admin-view'

import { ButtonSpinner, EmptyState, ErrorState, InlineError, postJson, toneButtonProps, useAdminResource } from './ResourceAdminShared'

/**
 * Onglet « Historique » de la Carte des ressources (SuperUser) — docs/features/carte-ressources.md §5, maquette
 * « Carte des ressources - superuser » (§5 · Historique) : décisions des 30 derniers jours, toutes cartes, paginées
 * (‹ 1 / 3 ›) ; « Annuler » (confirmation légère dans la ligne) restaure l'état d'avant, l'entrée affiche alors
 * « Annulée ». Sur mobile, les colonnes Quand, Qui et Carte passent dans la cellule « Quoi » : aucun défilement de côté.
 *
 * Interface figée (la page l'importe) : aucune prop.
 */

const historyUrl = (page: number) => `/api/resources/admin/history?page=${page}`
const undoUrl = (id: string) => `/api/resources/admin/history/${encodeURIComponent(id)}/undo`

function Initial({ name }: { name: string }) {
  return (
    <span
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--theme-ui-surface-strong)] text-[11px] font-bold text-gray-700 shadow-[inset_0_0_0_1px_var(--theme-ui-border)]"
      aria-hidden="true"
    >
      {actorInitial(name)}
    </span>
  )
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Chargement de l’historique">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 last:border-b-0">
          <span className="h-3 w-20 animate-pulse rounded-[6px] bg-[var(--theme-ui-surface-strong)]" />
          <span className="h-6 w-6 shrink-0 animate-pulse rounded-full bg-[var(--theme-ui-surface-strong)]" />
          <span className="h-3 flex-1 animate-pulse rounded-[6px] bg-[var(--theme-ui-surface-strong)]" />
        </div>
      ))}
    </div>
  )
}

export default function ResourceHistoryTab() {
  const [page, setPage] = useState(1)
  const [token, setToken] = useState(0)
  const history = useAdminResource<ResourceHistoryResponse>(historyUrl(page), token)
  const data = history.data
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [undoingId, setUndoingId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Entrées annulées depuis cet écran, affichées « Annulée » sans attendre la relecture de la page.
  const [undone, setUndone] = useState<{ source: ResourceHistoryResponse | null; ids: ReadonlySet<string> }>({ source: null, ids: new Set() })

  const currentPage = data?.page ?? page
  const pageCount = Math.max(1, data?.pageCount ?? 1)
  const windowDays = data?.windowDays ?? RESOURCE_HISTORY_WINDOW_DAYS
  const refreshing = history.loading && data !== null

  function goTo(next: number) {
    setConfirmingId(null)
    setPage(Math.min(pageCount, Math.max(1, next)))
  }

  async function undo(entry: ResourceHistoryEntry) {
    const source = data
    setUndoingId(entry.id)
    setErrors((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== entry.id)))
    const result = await postJson<{ ok: true }>(undoUrl(entry.id))
    setUndoingId(null)
    setConfirmingId(null)
    if (!result.ok) {
      setErrors((current) => ({ ...current, [entry.id]: result.error }))
      return
    }
    setUndone((current) => ({ source, ids: new Set([...(current.source === source ? current.ids : []), entry.id]) }))
    setToken((value) => value + 1)
  }

  const undoneIds = undone.source === data ? undone.ids : new Set<string>()

  let body
  if (!data && history.loading) body = <HistorySkeleton />
  else if (!data) body = <ErrorState message={history.error || 'Chargement impossible.'} onRetry={() => setToken((value) => value + 1)} testId="resource-history-error" />
  else if (data.entries.length === 0)
    body = (
      <div className="p-4">
        <EmptyState icon={History} title="Aucune décision" text={`Les validations, refus et modifications des ${windowDays} derniers jours apparaîtront ici.`} testId="resource-history-empty" />
      </div>
    )
  else
    body = (
      <table className={`w-full border-collapse text-left transition-opacity duration-150 ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
        <thead className="app-table-head">
          <tr>
            <th scope="col" className="t-label hidden px-3 py-2 sm:table-cell sm:pl-4">
              Quand
            </th>
            <th scope="col" className="t-label hidden px-3 py-2 sm:table-cell">
              Qui
            </th>
            <th scope="col" className="t-label px-3 py-2 max-sm:pl-4">
              Quoi
            </th>
            <th scope="col" className="t-label hidden px-3 py-2 md:table-cell">
              Carte
            </th>
            <th scope="col" className="px-3 py-2 pr-4">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.entries.map((entry) => {
            const cancelled = Boolean(entry.undoneAt) || undoneIds.has(entry.id)
            const muted = cancelled ? 'opacity-60' : ''
            const confirming = confirmingId === entry.id && !cancelled
            const busy = undoingId === entry.id
            const negative = toneButtonProps('neg')
            return (
              <tr key={entry.id} className="app-table-row align-top last:border-b-0" data-testid="history-row" data-entry-id={entry.id} data-undone={cancelled ? 'true' : undefined}>
                <td className={`t-meta t-num hidden whitespace-nowrap px-3 py-2.5 sm:table-cell sm:pl-4 ${muted}`}>{dateTimeLabel(entry.at)}</td>
                <td className={`hidden px-3 py-2.5 sm:table-cell ${muted}`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <Initial name={entry.actor} />
                    <span className="truncate text-[13px] font-semibold text-gray-900">{entry.actor}</span>
                  </span>
                </td>
                <td className={`min-w-0 px-3 py-2.5 max-sm:pl-4 ${muted}`}>
                  <p className="t-body break-words text-gray-700">
                    <span className="font-semibold text-gray-900 sm:hidden">{entry.actor} </span>
                    {entry.verb} <b className="font-bold text-gray-900">{entry.object}</b>
                  </p>
                  {entry.detail ? <p className="t-meta break-words">{entry.detail}</p> : null}
                  <p className="t-meta t-num sm:hidden">
                    {dateTimeLabel(entry.at)} · {entry.mapLabel}
                  </p>
                  <p className="t-meta hidden sm:block md:hidden">{entry.mapLabel}</p>
                  {errors[entry.id] ? (
                    <div className="mt-1">
                      <InlineError testId="history-row-error">{errors[entry.id]}</InlineError>
                    </div>
                  ) : null}
                </td>
                <td className={`t-body hidden whitespace-nowrap px-3 py-2.5 text-gray-700 md:table-cell ${muted}`}>{entry.mapLabel}</td>
                <td className="px-3 py-2 pr-4 text-right">
                  {cancelled ? (
                    <span className="t-meta inline-flex h-8 items-center font-semibold" data-testid="history-row-undone">
                      Annulée
                    </span>
                  ) : !entry.undoable ? null : confirming ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => void undo(entry)}
                        disabled={busy}
                        aria-label={`Confirmer l’annulation : ${entry.verb} ${entry.object}`}
                        className={`app-btn app-btn--xs gap-1 ${negative.className}`}
                        style={negative.style}
                      >
                        {busy ? <ButtonSpinner /> : <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />}
                        Confirmer
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        disabled={busy}
                        aria-label="Garder la décision"
                        className="app-btn app-btn--xs app-btn--secondary px-2"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(entry.id)}
                      aria-label={`Annuler : ${entry.verb} ${entry.object}`}
                      className="app-btn app-btn--xs app-btn--secondary gap-1"
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Annuler
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )

  return (
    <section className="app-table-shell min-w-0 overflow-hidden" aria-labelledby="resource-history-title" data-testid="resource-history">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <h2 id="resource-history-title" className="t-card-title">
            Historique
          </h2>
          <p className="t-meta">Toutes les cartes · {windowDays} derniers jours</p>
        </div>
        {pageCount > 1 ? (
          <nav className="app-pagination" aria-label="Pages de l’historique">
            <button type="button" className="app-pagination-button" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} aria-label="Page précédente">
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="app-pagination-label t-num" aria-live="polite" data-testid="history-page">
              {currentPage} / {pageCount}
            </span>
            <button type="button" className="app-pagination-button" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= pageCount} aria-label="Page suivante">
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </header>
      {data && history.error ? (
        <div className="border-b border-gray-200 px-4 py-2">
          <InlineError>{history.error}</InlineError>
        </div>
      ) : null}
      {body}
    </section>
  )
}
