'use client'

import Link from 'next/link'
import { GitCompareArrows, Hourglass, Search, X } from 'lucide-react'

import { ClanFilterMenu, PlayerAvatar, PlayerName, RoleTile } from '@/components/players/PlayersUi'
import ClanTag from '@/components/ui/ClanTag'
import Pagination from '@/components/ui/Pagination'
import PodiumSteps, { PodiumPlate, PodiumStats, PodiumTitle } from '@/components/ui/PodiumSteps'
import RankCell from '@/components/ui/RankCell'
import RankMovement from '@/components/ui/RankMovement'
import RosterRoleBadge from '@/components/ui/RosterRoleBadge'
import { PERIOD_WHEN_LABELS, type StandardPeriod } from '@/lib/period'
import {
  MAX_COMPARED,
  PLAYERS_PAGE_SIZE,
  bestByRole,
  criterionSummary,
  filterPlayers,
  formatDecimal,
  formatDuration,
  formatInteger,
  formatMeters,
  formatRate,
  plateValue,
  playerCriterion,
  playerRole,
  previousRankOf,
  type MyStanding,
  type PlayerCriterion,
  type PlayerRankingEntry,
  type PlayerRoleId,
  type PlayersMode,
  type RankedPlayer,
} from '@/lib/players-ranking'
import type { PlayersRankingPayload } from '@/lib/players-ranking-service'

/**
 * Onglet « Classement » de la page Joueurs (maquette Claude Design « Joueurs », états 1 à 6 ; docs/features/joueurs.md).
 * Codes repris de la Ligue : podium en marches (`PodiumSteps`, plaque de score des tournois depuis le 2026-10-18), rangs
 * `RankCell`, flèches `RankMovement`. Liste
 * paginée par 10 (demande du 2026-10-12) au lieu de « Afficher 25 de plus », recherche et filtre de clan sur tous les
 * classés ; cases à cocher (3 au plus) pour le comparateur.
 */

const MINE_ROW = 'bg-[var(--theme-ui-accent-soft)] shadow-[inset_3px_0_0_var(--theme-ui-accent-text)]'
const MINE_BADGE = 'shrink-0 rounded-[5px] bg-[var(--theme-ui-accent-soft)] px-1.5 py-px text-[11px] font-extrabold text-[var(--theme-ui-accent-text)]'

/** Ligne d'appui de chaque rôle (cartes « Les meilleurs par rôle »). */
function roleDetail(role: PlayerRoleId, entry: PlayerRankingEntry) {
  switch (role) {
    case 'fragger':
      return `${formatInteger(entry.avgDamage)} dégâts · ${formatDecimal(entry.avgKills)} kills`
    case 'medic':
      return `${formatDecimal(entry.avgRevives)} réa · ${formatDuration(entry.avgSurvivalSeconds)} de survie`
    case 'ghost':
      return entry.zoneInsideRate !== null ? `${formatRate(entry.zoneInsideRate)} des fermetures dans le cercle` : 'fermetures de zone non mesurées'
    case 'sniper':
      return [entry.avgKillDistance !== null ? formatMeters(entry.avgKillDistance) : null, entry.headshotRate !== null ? `${formatRate(entry.headshotRate)} headshots` : null]
        .filter(Boolean)
        .join(' · ')
  }
}

export type RankingView = { criterion: PlayerCriterion; search: string; clanId: number | null; page: number }

/** Page de la liste où se trouve un rang, sans recherche ni filtre (la liste commence au 4e) ; 0 : sur le podium. */
export function pageOfPosition(position: number) {
  return position <= 3 ? 0 : Math.ceil((position - 3) / PLAYERS_PAGE_SIZE)
}

/** « Les meilleurs par rôle » : en colonne à côté du podium, ou en grille 2 × 2 sous le podium et la carte « Mon rang ». */
function BestByRole({
  best,
  criterion,
  periodWhen,
  onView,
  layout,
}: {
  best: ReturnType<typeof bestByRole<PlayerRankingEntry>>
  criterion: PlayerCriterion
  periodWhen: string
  onView: (patch: Partial<RankingView>) => void
  layout: 'column' | 'grid'
}) {
  return (
    <section aria-labelledby="players-roles-title" className="flex min-w-0 flex-col gap-2.5">
      <h2 id="players-roles-title" className="t-section-title">
        Les meilleurs par rôle <span className="t-meta font-normal">{periodWhen}</span>
      </h2>
      {/* En colonne à côté du podium à partir de 1 024 px ; en dessous, 2 colonnes sous le podium. */}
      <div className={layout === 'grid' ? 'grid gap-2.5 sm:grid-cols-2' : 'grid flex-1 gap-2.5 sm:grid-cols-2 lg:flex lg:flex-col'}>
        {best.map(({ role, entry, score }) => {
          const active = criterion === role
          return (
            <button
              key={role}
              type="button"
              aria-pressed={active}
              aria-label={`${playerRole(role).label} : ${entry.name}, ${score} sur 100 — classer par ce rôle`}
              onClick={() => onView({ criterion: role, page: 1 })}
              className={`app-panel flex min-w-0 flex-1 items-center gap-3 p-3 text-left transition hover:bg-gray-50 ${active ? 'shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]' : ''}`}
            >
              <RoleTile role={role} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="t-label">{playerRole(role).label}</span>
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <b className="truncate text-sm text-gray-900">{entry.name}</b>
                  <ClanTag tag={entry.clanTag} />
                </span>
                <span className="truncate text-xs text-gray-500">{roleDetail(role, entry)}</span>
              </span>
              <span className="t-num flex shrink-0 items-baseline gap-0.5 text-gray-900">
                <b className="text-lg font-extrabold">{score}</b>
                <span className="text-[11px] text-gray-500">/ 100</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MyRankCard({ standing, entry, periodWhen, criterion }: { standing: MyStanding; entry: PlayerRankingEntry; periodWhen: string; criterion: PlayerCriterion }) {
  const meta = playerCriterion(criterion)
  return (
    <section aria-label="Mon rang" data-testid="my-rank" className="app-panel flex flex-col gap-3 p-4 shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)] sm:p-5">
      <span className="t-label t-accent">Mon rang</span>
      <div className="flex items-center gap-2.5">
        <PlayerAvatar name={entry.name} size={36} />
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <b className="truncate text-[15px] text-gray-900">{entry.name}</b>
            <ClanTag tag={entry.clanTag} />
            {entry.style ? <RosterRoleBadge role={entry.style} /> : null}
          </span>
          <span className="t-meta">
            {entry.matches} partie{entry.matches > 1 ? 's' : ''} {periodWhen}
          </span>
        </span>
      </div>
      {standing.kind === 'ranked' ? (
        <>
          <div className="flex items-baseline gap-2">
            <span className="t-hero t-hero--md t-accent">#{standing.position}</span>
            <span className="text-sm text-gray-600">sur {standing.total} classés</span>
            <span className="t-num ml-auto text-xl font-extrabold text-gray-900">{standing.value !== null ? meta.format(standing.value) : '—'}</span>
          </div>
          <span className="h-[6px] overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
            <span className="block h-full rounded-full bg-[var(--theme-ui-accent)]" style={{ width: `${Math.max(2, standing.aheadShare)}%` }} />
          </span>
          <p className="text-sm font-bold text-gray-900">Devant {standing.aheadShare} % des joueurs classés</p>
          <p className="text-xs text-gray-600">
            {standing.ahead
              ? `À ${standing.ahead.gap} de ${standing.ahead.name} [${standing.ahead.clanTag}], juste devant (#${standing.ahead.position}).`
              : standing.position === 1
                ? `Tu mènes le classement ${meta.long.toLowerCase()}.`
                : ''}
          </p>
        </>
      ) : standing.kind === 'qualifying' ? (
        <>
          <p className="text-[15px] font-extrabold text-gray-900">
            En qualification : {standing.matches} / {standing.required} parties
          </p>
          <span className="h-[6px] overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
            <span className="block h-full rounded-full bg-[var(--theme-ui-text-muted)]" style={{ width: `${Math.round((standing.matches / standing.required) * 100)}%` }} />
          </span>
          <p className="text-xs text-gray-600">
            Encore {standing.missing} partie{standing.missing > 1 ? 's' : ''} de clan {periodWhen} pour être classé.
          </p>
        </>
      ) : null}
    </section>
  )
}

export default function PlayersRanking({
  data,
  ranked,
  view,
  onView,
  period,
  mode,
  myMemberId,
  myStanding,
  canOpen,
  selection,
  onToggleSelect,
  onClearSelection,
  onCompareSelection,
  onPeriod,
  onOpenGuide,
}: {
  data: PlayersRankingPayload
  /** Classés, rangés selon le critère de la vue. */
  ranked: Array<RankedPlayer>
  view: RankingView
  onView: (patch: Partial<RankingView>) => void
  period: StandardPeriod
  mode: PlayersMode
  myMemberId: number | null
  myStanding: MyStanding | null
  canOpen: (clanId: number) => boolean
  selection: number[]
  onToggleSelect: (memberId: number) => void
  onClearSelection: () => void
  onCompareSelection: () => void
  onPeriod: (period: StandardPeriod) => void
  /** Ouvre le guide de calcul replié du bas de page avant d'y descendre. */
  onOpenGuide: () => void
}) {
  const periodWhen = PERIOD_WHEN_LABELS[period]
  const meta = playerCriterion(view.criterion)
  const showMovement = period !== 'all'
  const filtering = view.search.trim() !== '' || view.clanId !== null
  const myEntry = myMemberId !== null ? ([...data.ranked, ...data.qualifying].find((entry) => entry.memberId === myMemberId) ?? null) : null
  const enough = data.ranked.length >= data.minRanked
  const filtered = filtering ? filterPlayers(ranked, view.search, view.clanId) : ranked
  // Sans recherche ni filtre, le podium montre les trois premiers et la liste commence au 4e (comme la Ligue).
  const rows = filtering ? filtered : ranked.slice(3)
  const pageCount = Math.max(1, Math.ceil(rows.length / PLAYERS_PAGE_SIZE))
  const page = Math.min(Math.max(1, view.page), pageCount)
  const visible = rows.slice((page - 1) * PLAYERS_PAGE_SIZE, page * PLAYERS_PAGE_SIZE)
  const best = bestByRole(data.ranked)
  const mine = myStanding && myEntry ? { standing: myStanding, entry: myEntry } : null
  const selectionFull = selection.length >= MAX_COMPARED

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Le critère se choisit dans le bandeau collant (liste déroulante, 2026-10-18) ; ici, recherche, clan et rappels. */}
      <section aria-label="Recherche et filtre" className="app-panel flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-stretch gap-2">
          <label className="app-toolbar-search min-w-[12rem] flex-1">
            <Search className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
            <input type="search" value={view.search} onChange={(event) => onView({ search: event.target.value, page: 1 })} placeholder="Rechercher un pseudo" aria-label="Rechercher un pseudo" />
            {view.search ? (
              <button type="button" onClick={() => onView({ search: '', page: 1 })} aria-label="Effacer la recherche" className="text-gray-500 hover:text-gray-900">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <ClanFilterMenu clans={data.clans} value={view.clanId} onChange={(clanId) => onView({ clanId, page: 1 })} />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="t-meta" data-testid="criterion-summary">
            {criterionSummary(view.criterion, periodWhen, mode)}
          </p>
          <p className="t-meta" data-testid="ranking-rule">
            Classés : les joueurs avec au moins {data.minMatches} parties de clan sur la période. Rôles : score sur 100 entre tous les clans —{' '}
            <a href="#guide-calcul" onClick={onOpenGuide} className="app-link">
              le guide de calcul
            </a>
            .
          </p>
        </div>
      </section>

      {!enough ? (
        <section data-testid="players-not-enough" className="flex flex-col gap-3 rounded-[14px] border border-dashed border-gray-200 p-4 sm:flex-row sm:items-start sm:p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--theme-ui-surface-strong)] text-gray-600" aria-hidden="true">
            <Hourglass className="h-5 w-5" />
          </span>
          <div className="flex flex-col gap-2">
            <h2 className="t-card-title">Pas encore assez de parties {periodWhen}</h2>
            <p className="text-sm text-gray-600">
              {data.ranked.length} joueur{data.ranked.length > 1 ? 's ont' : ' a'} au moins {data.minMatches} parties de clan {periodWhen}. Le classement
              s’affiche dès {data.minRanked} joueurs classés : il se remplit au fil des soirées.
            </p>
            {period !== 'all' ? (
              <button type="button" onClick={() => onPeriod(period === 'week' ? 'month' : 'all')} className="app-toolbar-btn w-fit">
                {period === 'week' ? 'Voir le classement du mois' : 'Voir le classement depuis le début'}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {enough || myStanding ? (
        // Podium à gauche ; à droite, la carte « Mon rang » (membre connecté) ou, sinon, les meilleurs par rôle en colonne.
        <div className={`grid items-stretch gap-4 ${enough && (mine || best.length > 0) ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]' : ''}`}>
          {enough ? (
            <PodiumSteps
              ariaLabel={`Podium · ${meta.long}`}
              // Titre mis en évidence (demande du 2026-10-18) : coupe en or, « Podium » en blanc, critère en or de jeu.
              title={<PodiumTitle label={meta.long} />}
              // Pas de tampon « Winner winner chicken dinner » ici (demande du 2026-10-18) ; la Ligue et les tournois le gardent.
              stamp={null}
              // Plaque de score biseautée au métal de la marche, comme la page d'un tournoi (demande du 2026-10-18).
              emphasis
              entries={ranked.slice(0, 3).map((entry) => ({
                key: String(entry.memberId),
                position: entry.position,
                id: `player-${entry.memberId}`,
                testId: `player-podium-${entry.position}`,
                identity: (
                  <span className="flex min-w-0 max-w-full flex-col items-center gap-1">
                    <PlayerAvatar name={entry.name} size={44} tone="dark" />
                    {canOpen(entry.clanId) ? (
                      <Link href={`/members/${entry.memberId}/dashboard`} className="max-w-full truncate text-sm font-extrabold tracking-tight hover:underline sm:text-lg">
                        {entry.name}
                      </Link>
                    ) : (
                      <b className="max-w-full truncate text-sm font-extrabold tracking-tight sm:text-lg">{entry.name}</b>
                    )}
                  </span>
                ),
                caption: <ClanTag tag={entry.clanTag} tone="photo" size="md" />,
                value: (() => {
                  const value = meta.value(entry)
                  return <PodiumPlate value={value !== null ? plateValue(view.criterion, value) : '—'} unit={meta.unit} />
                })(),
                detail: <PodiumStats count={entry.matches} label="parties" wins={entry.wins} />,
              }))}
            />
          ) : null}
          {mine ? <MyRankCard standing={mine.standing} entry={mine.entry} periodWhen={periodWhen} criterion={view.criterion} /> : null}
          {!mine && enough && best.length > 0 ? <BestByRole best={best} criterion={view.criterion} periodWhen={periodWhen} onView={onView} layout="column" /> : null}
        </div>
      ) : null}

      {mine && enough && best.length > 0 ? <BestByRole best={best} criterion={view.criterion} periodWhen={periodWhen} onView={onView} layout="grid" /> : null}

      {enough ? (
        <section aria-labelledby="players-list-title" className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="players-list-title" className="t-section-title">
              {filtering ? 'Résultats' : `Classement · 4 à ${ranked.length}`}{' '}
              <span className="t-meta font-normal">
                {filtering ? `${filtered.length} joueur${filtered.length > 1 ? 's' : ''} sur ${ranked.length} classés` : `${ranked.length} joueurs classés`}
              </span>
            </h2>
            {selection.length > 0 ? (
              <span className="flex items-center gap-2" data-testid="selection-bar">
                <span className="t-meta t-num">
                  {selection.length} / {MAX_COMPARED} sélectionné{selection.length > 1 ? 's' : ''}
                </span>
                <button type="button" onClick={onClearSelection} className="text-xs font-semibold text-gray-500 hover:text-gray-900">
                  Effacer
                </button>
                <button type="button" onClick={onCompareSelection} disabled={selection.length < 2} className="app-toolbar-btn app-menu-trigger--active disabled:cursor-not-allowed disabled:opacity-45">
                  <GitCompareArrows className="h-3.5 w-3.5" aria-hidden="true" />
                  Comparer la sélection
                </button>
              </span>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <p className="rounded-[14px] border border-dashed border-gray-200 p-4 text-sm text-gray-600" data-testid="players-no-result">
              Aucun joueur classé ne correspond{view.search ? ` à « ${view.search.trim()} »` : ''}.
            </p>
          ) : (
            <>
              {/* Ordinateur et tablette : tableau ; mobile : cartes (pas de défilement horizontal). */}
              <div className="app-table-shell hidden overflow-hidden md:block">
                <table className="w-full table-auto text-[13px]" aria-label={`Classement · ${meta.long}`}>
                  <thead className="app-table-head">
                    <tr>
                      {/* Case, rang et flèche à la largeur de leur contenu (`w-px`) : le joueur prend la place restante. */}
                      <th className="w-px py-2 pl-3 pr-1 text-left font-semibold">
                        <span className="sr-only">Comparer</span>
                      </th>
                      <th className="w-px whitespace-nowrap px-1.5 py-2 text-right font-semibold">Rang</th>
                      {showMovement ? (
                        <th className="w-px px-1.5 py-2 text-left font-semibold">
                          <span className="sr-only">Évolution</span>
                        </th>
                      ) : null}
                      <th className="px-[9px] py-2 text-left font-semibold">Joueur</th>
                      <th className="w-px px-[9px] py-2 text-right font-semibold">Parties</th>
                      <th className="w-px whitespace-nowrap py-2 pl-[9px] pr-3 text-right font-semibold">{meta.kind === 'role' ? 'Score' : meta.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((entry) => {
                      const mine = entry.memberId === myMemberId
                      const checked = selection.includes(entry.memberId)
                      const value = meta.value(entry)
                      return (
                        <tr key={entry.memberId} id={`player-row-${entry.memberId}`} className={`app-table-row scroll-mt-[160px] ${mine ? MINE_ROW : ''}`}>
                          <td className="py-2 pl-3 pr-1">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!checked && selectionFull}
                              onChange={() => onToggleSelect(entry.memberId)}
                              aria-label={`Comparer ${entry.name}`}
                              className="h-4 w-4 cursor-pointer accent-[var(--theme-ui-accent)] disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-1.5 py-2">
                            <span className="flex min-w-[26px] justify-end">
                              <RankCell rank={entry.position} size="xs" />
                            </span>
                          </td>
                          {showMovement ? (
                            <td className="min-w-[38px] whitespace-nowrap px-1.5 py-2">
                              <RankMovement rank={entry.position} previousRank={previousRankOf(entry, view.criterion)} />
                            </td>
                          ) : null}
                          <td className="px-[9px] py-2">
                            <span className="flex min-w-0 items-center gap-2">
                              <PlayerAvatar name={entry.name} size={26} />
                              <PlayerName name={entry.name} memberId={entry.memberId} canOpen={canOpen(entry.clanId)} />
                              <ClanTag tag={entry.clanTag} />
                              {entry.style ? <RosterRoleBadge role={entry.style} /> : null}
                              {mine ? <span className={MINE_BADGE}>MOI</span> : null}
                            </span>
                          </td>
                          <td className="t-num px-[9px] py-2 text-right text-gray-500">{entry.matches}</td>
                          <td className="t-num whitespace-nowrap py-2 pl-[9px] pr-3 text-right text-[15px] font-extrabold text-gray-900">
                            <span data-testid="player-value">{value !== null ? meta.format(value) : '—'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="app-table-shell overflow-hidden md:hidden" aria-label={`Classement · ${meta.long}`}>
                {visible.map((entry) => {
                  const mine = entry.memberId === myMemberId
                  const checked = selection.includes(entry.memberId)
                  const value = meta.value(entry)
                  return (
                    <li key={entry.memberId} id={`player-card-${entry.memberId}`} className={`flex min-h-14 items-center gap-2 border-b border-gray-200 px-3 py-2.5 last:border-b-0 ${mine ? MINE_ROW : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && selectionFull}
                        onChange={() => onToggleSelect(entry.memberId)}
                        aria-label={`Comparer ${entry.name}`}
                        className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--theme-ui-accent)] disabled:cursor-not-allowed"
                      />
                      <span className="flex w-[26px] shrink-0 justify-center">
                        <RankCell rank={entry.position} size="xs" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <PlayerName name={entry.name} memberId={entry.memberId} canOpen={canOpen(entry.clanId)} className="min-w-0" />
                          <ClanTag tag={entry.clanTag} />
                          {mine ? <span className={MINE_BADGE}>MOI</span> : null}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-500">
                          {entry.style ? <RosterRoleBadge role={entry.style} /> : null}
                          <span className="truncate">{entry.matches} parties</span>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="t-num whitespace-nowrap text-[15px] font-extrabold text-gray-900" data-testid="player-value">{value !== null ? meta.format(value) : '—'}</span>
                        {showMovement ? <RankMovement rank={entry.position} previousRank={previousRankOf(entry, view.criterion)} /> : null}
                      </span>
                    </li>
                  )
                })}
              </ul>

              <Pagination
                page={page}
                pageCount={pageCount}
                total={rows.length}
                pageSize={PLAYERS_PAGE_SIZE}
                onPageChange={(next) => onView({ page: next })}
                ariaLabel="Pages du classement"
                itemLabel="Joueurs"
              />
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}

