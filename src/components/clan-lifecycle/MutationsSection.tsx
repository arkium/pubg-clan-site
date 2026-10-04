'use client'

import { ArrowRight, ArrowRightLeft, CheckCircle2, Clock, History, LogIn, LogOut, RotateCcw, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

import {
  ButtonSpinner,
  ChoiceMenu,
  ClanLabel,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Tag,
  formatDate,
  toneStyle,
  useLifecycleResource,
  type Notify,
  type Tone,
} from '@/components/clan-lifecycle/LifecycleShared'
import Pagination from '@/components/ui/Pagination'
import { MUTATION_KIND_LABELS, mutationKind, mutationSourceLabel, type MutationKind } from '@/lib/clan-mutations-view'
import SegmentedControl from '@/components/ui/SegmentedControl'

/**
 * Onglet « Mutations » — journal SuperUser de tous les statuts (docs/features/cycle-de-vie-clan.md §7), selon la
 * charte : filtre de statut en tuiles (menu sur mobile), mouvements en lignes d'un panneau, nature du mouvement en
 * tuile d'icône aux couleurs de jeu, pagination numérotée. Actions « Annuler » et « Marquer comme vu » inchangées.
 */

type ClanRef = { id?: number; tag: string | null; name?: string | null; isSystem?: boolean; isActive?: boolean } | null

type LifecycleMutation = {
  id: string
  source: string
  status: string
  detectedAt: string
  acknowledgedAt: string | null
  previousPubgClanTag?: string | null
  newPubgClanTag?: string | null
  clanMember: { id: number; displayName: string } | null
  previousClan: ClanRef
  newClan: ClanRef
}

type MutationsPayload = { mutations?: LifecycleMutation[]; total?: number; totalPages?: number; pageSize?: number; page?: number }

type StatusFilter = 'all' | 'applied' | 'observed' | 'pending' | 'reverted'

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'applied', label: 'Appliqués' },
  { value: 'observed', label: 'En cours de confirmation' },
  { value: 'pending', label: 'En attente de clan' },
  { value: 'reverted', label: 'Annulés' },
]

/** Statut d'une ligne du journal : libellé et couleur (en attente = orange, jamais jaune). */
const STATUS_STYLE: Record<string, { label: string; tone: Tone }> = {
  applied: { label: 'Appliqué', tone: 'pos' },
  observed: { label: 'En cours de confirmation', tone: 'warn' },
  pending: { label: 'En attente de clan', tone: 'warn' },
  reverted: { label: 'Annulé', tone: 'neutral' },
  ignored: { label: 'Écarté', tone: 'neutral' },
}

/** Nature du mouvement, pour la tuile d'icône : arrivée, départ, transfert ; annulé ou en suspens reste neutre. */
const KIND_STYLE: Record<MutationKind, { icon: LucideIcon; tone: Tone }> = {
  arrival: { icon: LogIn, tone: 'pos' },
  departure: { icon: LogOut, tone: 'neg' },
  transfer: { icon: ArrowRightLeft, tone: 'sky' },
  reverted: { icon: RotateCcw, tone: 'neutral' },
}

/** Même nature que la page publique `/clans/mutations` (`mutationKind`) ; une ligne pas encore appliquée est « en suspens ». */
function movementStyle(mutation: LifecycleMutation): { icon: LucideIcon; tone: Tone; label: string } {
  if (mutation.status !== 'applied' && mutation.status !== 'reverted') return { icon: Clock, tone: 'warn', label: 'En suspens' }
  const kind = mutationKind({ status: mutation.status, from: mutation.previousClan, to: mutation.newClan })
  return { ...KIND_STYLE[kind], label: MUTATION_KIND_LABELS[kind] }
}

/** Clan d'un côté du mouvement : clan du site, parking (clan technique), ou à défaut le tag PUBG observé. */
function ClanSide({ clan, pubgTag }: { clan: ClanRef; pubgTag?: string | null }) {
  if (clan?.isSystem) {
    return (
      <span className="text-gray-500" title="Clan technique Ungrouped — joueurs sans clan, toujours suivis">
        Parking
      </span>
    )
  }
  if (clan) return <ClanLabel tag={clan.tag} name={clan.name} />
  if (pubgTag) return <ClanLabel tag={pubgTag} name="non suivi" />
  return <span className="text-gray-500">sans clan</span>
}

type MutationAction = 'revert' | 'acknowledge'

function MutationRow({ mutation, busy, onAct }: { mutation: LifecycleMutation; busy: MutationAction | null; onAct: (action: MutationAction) => void }) {
  const movement = movementStyle(mutation)
  const Icon = movement.icon
  const status = STATUS_STYLE[mutation.status] ?? { label: mutation.status, tone: 'neutral' as Tone }
  const canRevert = mutation.status === 'applied'
  const canAcknowledge = mutation.status === 'applied' && mutation.acknowledgedAt === null

  return (
    <li className="flex items-start gap-3 border-t border-gray-200 px-3.5 py-3 first:border-t-0 sm:px-4" data-testid="lifecycle-mutation" data-status={mutation.status}>
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px]" style={toneStyle(movement.tone)} title={movement.label} aria-hidden="true">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="t-card-title truncate">{mutation.clanMember?.displayName ?? 'Membre supprimé'}</span>
          <time className="t-meta t-num shrink-0" dateTime={mutation.detectedAt}>
            {formatDate(mutation.detectedAt)}
          </time>
        </div>
        <div className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] ${mutation.status === 'reverted' ? 'line-through decoration-gray-400' : ''}`}>
          <ClanSide clan={mutation.previousClan} pubgTag={mutation.previousPubgClanTag} />
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
          <span className="sr-only">vers</span>
          <ClanSide clan={mutation.newClan} pubgTag={mutation.newPubgClanTag} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Tag tone={status.tone}>{status.label}</Tag>
          <span className="t-meta" title={mutation.source}>
            {mutationSourceLabel(mutation.source)}
          </span>
          {mutation.status === 'applied' && mutation.acknowledgedAt ? (
            <span className="t-meta inline-flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              vu
            </span>
          ) : null}
        </div>
        {canRevert || canAcknowledge ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {canRevert ? (
              <button
                type="button"
                onClick={() => onAct('revert')}
                disabled={busy !== null}
                title="Replacer le membre dans son clan précédent"
                className="app-btn app-btn--xs app-btn--secondary gap-1.5"
              >
                {busy === 'revert' ? <ButtonSpinner /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
                Annuler
              </button>
            ) : null}
            {canAcknowledge ? (
              <button
                type="button"
                onClick={() => onAct('acknowledge')}
                disabled={busy !== null}
                title="Sort ce mouvement de la file de relecture. Ne modifie rien."
                className="app-btn app-btn--xs app-btn--secondary gap-1.5"
              >
                {busy === 'acknowledge' ? <ButtonSpinner /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                Marquer comme vu
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}

export function MutationsSection({ onChanged, onToast }: { onChanged: () => void; onToast: Notify }) {
  const [status, setStatus] = useState<StatusFilter>('all')
  const [page, setPage] = useState(1)
  const [token, setToken] = useState(0)
  const [busy, setBusy] = useState<{ id: string; action: MutationAction } | null>(null)

  // Première page : même adresse qu'avant la charte ; les suivantes ajoutent `page` (la route pagine par 30).
  const params = new URLSearchParams()
  if (status !== 'all') params.set('status', status)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  const { data, loading, error } = useLifecycleResource<MutationsPayload>(`/api/settings/clan-lifecycle/mutations${query ? `?${query}` : ''}`, token)

  const mutations = data?.mutations ?? []
  const total = data?.total ?? mutations.length
  const pageSize = data?.pageSize ?? 30
  const pageCount = data?.totalPages ?? 1

  function changeStatus(next: StatusFilter) {
    setStatus(next)
    setPage(1)
  }

  async function act(changeId: string, action: MutationAction) {
    setBusy({ id: changeId, action })
    try {
      const res = await fetch('/api/settings/clan-lifecycle/mutations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, changeId }),
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
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Les deux actions se ressemblent mais n'ont rien à voir : l'une modifie les données, l'autre pas. La
          confusion a été constatée à l'usage — la légende reste en tête de l'onglet. */}
      <section className="app-panel-muted flex flex-col gap-2 px-3.5 py-3" aria-labelledby="lifecycle-actions-title" data-testid="lifecycle-actions-legend">
        <h2 id="lifecycle-actions-title" className="t-label">
          Les deux actions
        </h2>
        <ul className="flex flex-col gap-1.5 text-[13px] text-gray-700">
          <li className="flex items-start gap-2">
            <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
            <span>
              <b className="text-gray-900">Annuler</b> — replace réellement le joueur dans son clan précédent et écrit une
              ligne inverse. Modifie les données.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="t-pos mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              <b className="text-gray-900">Marquer comme vu</b> — indique que vous avez relu ce mouvement et qu’il est
              normal. Le sort de la file de relecture, <b className="text-gray-900">sans rien modifier</b>.
            </span>
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="lifecycle-journal-title">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="lifecycle-journal-title" className="t-section-title">
            Journal des mouvements
          </h2>
          {data ? (
            <span className="t-meta t-num" data-testid="lifecycle-mutations-total">
              {total} ligne{total > 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
        {/* Filtre propre à l'onglet (il reste dans sa section) : tuiles à partir de 640 px, menu en dessous. */}
        <div className="flex w-full sm:hidden">
          <ChoiceMenu label="Statut" options={STATUS_FILTERS} value={status} onChange={changeStatus} testId="lifecycle-status-menu" />
        </div>
        <div className="hidden sm:block" data-testid="lifecycle-status-filter">
          <SegmentedControl options={STATUS_FILTERS} value={status} onChange={changeStatus} size="xs" />
        </div>

        {!data && loading ? (
          <ListSkeleton />
        ) : !data && error ? (
          <ErrorState message={error} onRetry={() => setToken((current) => current + 1)} testId="lifecycle-mutations-error" />
        ) : mutations.length === 0 ? (
          <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <EmptyState icon={History} title="Aucun événement pour ce filtre" testId="lifecycle-mutations-empty" />
          </div>
        ) : (
          // Rechargement (filtre, page, action) : la liste précédente reste affichée, estompée.
          <div className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            {error ? <p className="text-[13px] font-semibold text-[var(--theme-ui-negative)]">{error}</p> : null}
            <ul className="app-panel overflow-hidden" aria-label="Mouvements">
              {mutations.map((mutation) => (
                <MutationRow key={mutation.id} mutation={mutation} busy={busy?.id === mutation.id ? busy.action : null} onAct={(action) => void act(mutation.id, action)} />
              ))}
            </ul>
            <Pagination
              page={Math.min(page, pageCount)}
              pageCount={pageCount}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              ariaLabel="Pages du journal des mouvements"
              itemLabel="Mouvements"
            />
          </div>
        )}
      </section>
    </div>
  )
}
