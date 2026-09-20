'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRightLeft, History, Loader2, LogOut, RotateCcw, Users } from 'lucide-react'

/**
 * Historique public des mutations de clan — chantier 1 du cycle de vie de clan.
 *
 * Rend visible tout mouvement décidé automatiquement par le cron quotidien : la
 * contrepartie assumée d'appliquer les transferts sans validation humaine est qu'ils
 * ne soient jamais silencieux.
 */

type ClanRef = { id: number; tag: string | null; name: string | null; isSystem: boolean } | null

type Mutation = {
  id: string
  source: string
  status: string
  at: string
  member: { id: number; name: string } | null
  from: ClanRef
  to: ClanRef
}

const SOURCE_LABELS: Record<string, string> = {
  auto_demotion: 'Détecté — sorti de son clan',
  auto_transfer: 'Détecté — a changé de clan',
  ungrouped_promotion: 'Détecté — a rejoint un clan',
  manual_demotion: 'Sorti du clan par un responsable',
  manual_transfer: 'Transféré par un SuperUser',
  manual_revert: 'Mouvement annulé',
  player_sync: 'Écart constaté',
  player_refresh: 'Rafraîchissement',
}

const AUTOMATIC_SOURCES = new Set(['auto_demotion', 'auto_transfer', 'ungrouped_promotion'])

function ClanBadge({ clan }: { clan: ClanRef }) {
  if (!clan) {
    return <span className="text-slate-400 dark:text-slate-500">aucun clan</span>
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold ${
        clan.isSystem
          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
      }`}
      title={clan.isSystem ? 'Clan technique — joueurs sans clan, toujours suivis' : undefined}
    >
      [{clan.tag ?? '—'}] {clan.name ?? ''}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ClanMutationsPage() {
  const [mutations, setMutations] = useState<Mutation[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  // Patron de chargement du depot : la fonction async est declaree DANS l'effet et
  // le reessai passe par un jeton, plutot qu'un `useCallback` appele depuis
  // l'effet — ce dernier declenche des rendus en cascade (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function fetchMutations() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/clan-lifecycle/mutations?page=${page}`, {
          cache: 'no-store',
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error('Impossible de charger l’historique des mutations.')
        }

        const data = await res.json()

        if (!cancelled) {
          setMutations(data.mutations ?? [])
          setTotalPages(data.totalPages ?? 1)
          setTotal(data.total ?? 0)
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void fetchMutations()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, retryToken])

  function goToPage(next: number) {
    setPage(next)
  }

  function retry() {
    setRetryToken((token) => token + 1)
  }

  return (
    <main className="app-container app-main">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/clans"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour aux clans
        </Link>
      </div>

      <div className="app-panel rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
            <History className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-slate-900 dark:text-white">
              Mouvements de clan
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Chaque changement d’appartenance détecté ou décidé est listé ici. Les mouvements
              marqués <span className="font-semibold">Détecté</span> sont appliqués automatiquement
              par la synchronisation quotidienne, sans validation humaine — cette page existe pour
              qu’aucun d’eux ne soit silencieux.
            </p>
          </div>
        </div>
      </div>

      <div className="app-panel mt-4 rounded-2xl p-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Chargement…
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="app-btn app-btn--md app-btn--secondary mt-4"
            >
              Réessayer
            </button>
          </div>
        ) : mutations.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Aucun mouvement enregistré
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Les écarts détectés doivent être confirmés plusieurs jours d’affilée avant de
              provoquer un mouvement.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {total} mouvement{total > 1 ? 's' : ''}
            </p>
            <ul className="space-y-2">
              {mutations.map((mutation) => {
                const automatic = AUTOMATIC_SOURCES.has(mutation.source)
                const reverted = mutation.status === 'reverted'
                const Icon = reverted
                  ? RotateCcw
                  : mutation.to?.isSystem
                    ? LogOut
                    : ArrowRightLeft

                return (
                  <li
                    key={mutation.id}
                    className="app-panel-muted flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-3"
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${reverted ? 'text-slate-400' : 'text-amber-500'}`}
                      aria-hidden="true"
                    />
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {mutation.member?.name ?? 'Membre supprimé'}
                    </span>
                    <ClanBadge clan={mutation.from} />
                    <span className="text-slate-400">→</span>
                    <ClanBadge clan={mutation.to} />
                    <span className="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-semibold ${
                          automatic
                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {SOURCE_LABELS[mutation.source] ?? mutation.source}
                      </span>
                      {reverted ? <span className="italic">annulé</span> : null}
                      <time dateTime={mutation.at}>{formatDate(mutation.at)}</time>
                    </span>
                  </li>
                )
              })}
            </ul>

            {totalPages > 1 ? (
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => goToPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="app-btn app-btn--md app-btn--secondary disabled:opacity-40"
                >
                  Précédent
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Page {page} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="app-btn app-btn--md app-btn--secondary disabled:opacity-40"
                >
                  Suivant
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  )
}
