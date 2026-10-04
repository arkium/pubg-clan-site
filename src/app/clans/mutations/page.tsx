'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowRightLeft, History, Info, LogIn, LogOut, RotateCcw, Users, type LucideIcon } from 'lucide-react'

import { NavigationTrail } from '@/components/ui/NavigationTrail'
import Pagination from '@/components/ui/Pagination'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import {
  MUTATION_KIND_LABELS,
  groupMutationsByDay,
  isAutomaticMutation,
  mutationKind,
  mutationSourceLabel,
  mutationTime,
  type ClanMutation,
  type MutationClanRef,
  type MutationKind,
} from '@/lib/clan-mutations-view'

/**
 * Historique public des mutations de clan — chantier 1 du cycle de vie de clan.
 *
 * Rend visible tout mouvement décidé automatiquement par le cron quotidien : la
 * contrepartie assumée d'appliquer les transferts sans validation humaine est qu'ils
 * ne soient jamais silencieux.
 *
 * Charte UI (docs/ui/index.html, 04/10/2026) : bandeau photo à titre Teko, mouvements groupés par jour dans des
 * panneaux, nature du mouvement en tuile d'icône aux couleurs de jeu, pagination numérotée.
 */

const PAGE_SIZE = 25

type MutationsResponse = { mutations?: ClanMutation[]; total?: number; totalPages?: number; pageSize?: number }

/** Couleur de jeu et icône de chaque nature de mouvement (`.game-ui`) ; un mouvement annulé reste neutre. */
const KIND_STYLE: Record<MutationKind, { icon: LucideIcon; tone: string | null }> = {
  arrival: { icon: LogIn, tone: 'pos' },
  departure: { icon: LogOut, tone: 'neg' },
  transfer: { icon: ArrowRightLeft, tone: 'sky' },
  reverted: { icon: RotateCcw, tone: null },
}

function kindColors(kind: MutationKind) {
  const tone = KIND_STYLE[kind].tone
  return tone
    ? { color: `var(--game-${tone})`, backgroundColor: `var(--game-${tone}-soft)` }
    : { color: 'var(--theme-ui-text-muted)', backgroundColor: 'var(--theme-ui-surface-strong)' }
}

function ClanName({ clan }: { clan: MutationClanRef }) {
  if (!clan || clan.isSystem) {
    return (
      <span className="text-gray-500" title={clan ? 'Clan technique — joueurs sans clan, toujours suivis' : undefined}>
        sans clan
      </span>
    )
  }
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <span className="font-mono font-bold text-gray-900">[{clan.tag ?? '—'}]</span>
      <span className="truncate text-gray-700">{clan.name ?? ''}</span>
    </span>
  )
}

function MutationRow({ mutation }: { mutation: ClanMutation }) {
  const kind = mutationKind(mutation)
  const Icon = KIND_STYLE[kind].icon
  const colors = kindColors(kind)
  return (
    <li className="flex items-start gap-3 border-t border-gray-200 px-3.5 py-3 first:border-t-0 sm:px-4" data-testid="clan-mutation" data-kind={kind}>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={colors} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-card-title truncate">{mutation.member?.name ?? 'Membre supprimé'}</span>
          <time className="t-meta shrink-0 tabular-nums" dateTime={mutation.at}>
            {mutationTime(mutation.at)}
          </time>
        </div>
        <div className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] ${kind === 'reverted' ? 'line-through decoration-gray-400' : ''}`}>
          <ClanName clan={mutation.from} />
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
          <span className="sr-only">vers</span>
          <ClanName clan={mutation.to} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide" style={colors}>
            {MUTATION_KIND_LABELS[kind]}
          </span>
          <span className="t-meta">
            {mutationSourceLabel(mutation.source)}
            {isAutomaticMutation(mutation) ? ' · synchronisation automatique' : ''}
          </span>
        </div>
      </div>
    </li>
  )
}

export default function ClanMutationsPage() {
  const [mutations, setMutations] = useState<ClanMutation[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [retryToken, setRetryToken] = useState(0)
  const listTop = useRef<HTMLDivElement>(null)

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

        // Réservé aux membres connectés (transparence interne) : une invitation, pas une erreur.
        if (res.status === 401) {
          if (!cancelled) setSignedOut(true)
          return
        }
        if (!res.ok) {
          throw new Error('Impossible de charger l’historique des mutations.')
        }

        const data = (await res.json()) as MutationsResponse

        if (!cancelled) {
          setMutations(data.mutations ?? [])
          setTotalPages(data.totalPages ?? 1)
          setTotal(data.total ?? 0)
          setPageSize(data.pageSize ?? PAGE_SIZE)
          setLoaded(true)
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
    // La page suivante se lit depuis son début, pas depuis la pagination en bas de liste.
    listTop.current?.scrollIntoView({ block: 'start' })
  }

  function retry() {
    setRetryToken((token) => token + 1)
  }

  const days = groupMutationsByDay(mutations)

  return (
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    // `.game-ui` : jetons --game-* (nature des mouvements).
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <NavigationTrail
        currentLabel="Mouvements de clan"
        currentHref="/clans/mutations"
        fallbackParent={{ href: '/clans', label: 'l’annuaire des clans' }}
      />

      <header
        className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/recall.jpg')`, backgroundPosition: 'center 40%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-3.5 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="t-banner-title text-white drop-shadow-md">Mouvements de clan</h1>
          </div>
          <p className="text-[13px] text-white/80 drop-shadow-md">Arrivées, départs et transferts entre clans suivis — aucun n’est silencieux.</p>
          {loaded ? (
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-white">
              <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5">
                <span className="t-num">{total}</span> mouvement{total > 1 ? 's' : ''}
              </span>
            </div>
          ) : null}
        </div>
      </header>

      <p className="app-panel-muted t-body flex items-start gap-2.5 px-3.5 py-3 text-gray-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
        <span>
          Chaque changement d’appartenance détecté ou décidé est listé ici. Les mouvements marqués{' '}
          <b className="text-gray-900">Détecté</b> sont appliqués automatiquement par la synchronisation quotidienne, sans
          validation humaine — cette page existe pour qu’aucun d’eux ne soit silencieux.
        </span>
      </p>

      <div ref={listTop} className="scroll-mt-24">
        {signedOut ? (
          <section className="app-panel flex flex-col items-center gap-3 p-8 text-center">
            <Users className="h-8 w-8 text-gray-500" aria-hidden="true" />
            <p className="t-card-title">Réservé aux membres connectés</p>
            <p className="t-meta max-w-md">L’historique des mouvements est une transparence interne au site : connecte-toi pour le consulter.</p>
            <Link href="/login?redirect=/clans/mutations" className="app-btn app-btn--primary app-btn--md">
              Se connecter
            </Link>
          </section>
        ) : loading && !loaded ? (
          <CardSkeleton />
        ) : error && !loaded ? (
          <section className="app-panel flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-[var(--theme-ui-negative)]">{error}</p>
            <button type="button" onClick={retry} className="app-btn app-btn--md app-btn--secondary">
              Réessayer
            </button>
          </section>
        ) : mutations.length === 0 ? (
          // État vide (charte §2) : bordure pointillée, rayon 14.
          <section className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-gray-200 p-8 text-center">
            <Users className="h-8 w-8 text-gray-500" aria-hidden="true" />
            <p className="t-card-title">Aucun mouvement enregistré</p>
            <p className="t-meta max-w-md">
              Les écarts détectés doivent être confirmés plusieurs jours d’affilée avant de provoquer un mouvement.
            </p>
          </section>
        ) : (
          // Changement de page : la page précédente reste affichée, estompée, jusqu'à l'arrivée de la suivante.
          <div aria-busy={loading} className={`flex flex-col gap-4 transition-opacity${loading ? ' opacity-60' : ''}`}>
            {error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}
            {days.map((day) => (
              <section key={day.day} aria-labelledby={`mutations-${day.day}`} className="flex flex-col gap-2">
                <h2 id={`mutations-${day.day}`} className="t-label">
                  {day.label}
                </h2>
                <ul className="app-panel overflow-hidden">
                  {day.mutations.map((mutation) => (
                    <MutationRow key={mutation.id} mutation={mutation} />
                  ))}
                </ul>
              </section>
            ))}
            <Pagination
              page={page}
              pageCount={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={goToPage}
              ariaLabel="Pages des mouvements"
              itemLabel="Mouvements"
            />
          </div>
        )}
      </div>
    </div>
  )
}
