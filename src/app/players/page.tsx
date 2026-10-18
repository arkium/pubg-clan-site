'use client'

import { ArrowDownUp, BookOpen, GitCompareArrows, ListOrdered, Medal } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import PlayersComparator from '@/components/players/PlayersComparator'
import PlayersRanking, { pageOfPosition, type RankingView } from '@/components/players/PlayersRanking'
import PlayersScoringGuide, { SCORING_GUIDE_ID } from '@/components/players/PlayersScoringGuide'
import { ROLE_META } from '@/components/players/PlayersUi'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { useAuthSession } from '@/hooks/useAuthSession'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'
import {
  MAX_COMPARED,
  PLAYER_CRITERIA,
  PLAYERS_MODES,
  PLAYERS_MODE_LABELS,
  compareKeyId,
  myStanding,
  parseCompareKeys,
  playerCriterion,
  rankPlayers,
  type PlayerRoleId,
  type PlayersMode,
} from '@/lib/players-ranking'
import type { PlayersRankingPayload } from '@/lib/players-ranking-service'
import { elapsedLabel } from '@/lib/relative-time'

type PlayersTab = 'ranking' | 'compare'

const TABS: Array<{ value: PlayersTab; label: string; icon: typeof ListOrdered }> = [
  { value: 'ranking', label: 'Classement', icon: ListOrdered },
  { value: 'compare', label: 'Comparateur', icon: GitCompareArrows },
]

const MODE_OPTIONS = PLAYERS_MODES.map((value) => ({ value, label: PLAYERS_MODE_LABELS[value] }))

/** Icône d'un rôle dans la liste du tri : celle de sa tuile, à sa couleur de jeu. */
function RoleMenuIcon({ role }: { role: PlayerRoleId }) {
  const { Icon, color } = ROLE_META[role]
  return <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} aria-hidden="true" />
}
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

const pickRanking = (payload: unknown) => (payload as PlayersRankingPayload | null) ?? null

/** Onglet et sélection du comparateur dans l'URL, par `replaceState` (même mécanique que la période). */
function writeQuery(patch: { tab?: PlayersTab; ids?: string[] }) {
  const params = new URLSearchParams(window.location.search)
  if (patch.tab !== undefined) {
    if (patch.tab === 'compare') params.set('tab', 'compare')
    else params.delete('tab')
  }
  if (patch.ids !== undefined) {
    if (patch.ids.length > 0) params.set('ids', patch.ids.join(','))
    else params.delete('ids')
  }
  const query = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
}

function PlayersContent() {
  const searchParams = useSearchParams()
  const tab: PlayersTab = searchParams.get('tab') === 'compare' ? 'compare' : 'ranking'
  const compareKeys = useMemo(() => parseCompareKeys(searchParams.get('ids')).map(compareKeyId), [searchParams])

  // Période de la page : URL, puis mémoire de la visite, puis la semaine (demande du 2026-10-18). En début de semaine,
  // l'état « pas encore assez de parties » propose le classement du mois.
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [mode, setMode] = useState<PlayersMode>('all')
  const [view, setView] = useState<RankingView>({ criterion: 'damage', search: '', clanId: null, page: 1 })
  const [selection, setSelection] = useState<number[]>([])
  const [now] = useState(() => new Date())
  // Guide de calcul replié : les liens « Comment c'est calculé » et « le guide de calcul » l'ouvrent avant d'y descendre.
  const [guideOpen, setGuideOpen] = useState(false)
  const openGuide = useCallback(() => setGuideOpen(true), [])
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([])

  const { authenticated, authDisabled, isSuperUser, members, activeMemberId } = useAuthSession()
  const myMemberId = authenticated ? activeMemberId : null
  const mySession = authenticated ? (members.find((member) => member.memberId === activeMemberId) ?? null) : null
  const myClan = mySession?.clan ? { clanId: mySession.clan.id, name: mySession.clan.name, tag: mySession.clan.tag } : null
  // Ouverture d'une page joueur : même règle que la Ligue (SuperUser ou visiteur : tous ; membre : son clan).
  const canOpen = useCallback((clanId: number) => isSuperUser || authDisabled || clanId === myClan?.clanId, [authDisabled, isSuperUser, myClan?.clanId])

  const { data, loading, error } = usePageData(ready ? `/api/players/ranking?period=${period}&mode=${mode}` : null, pickRanking)
  const ranked = useMemo(() => (data ? rankPlayers(data.ranked, view.criterion) : []), [data, view.criterion])
  const standing = useMemo(() => (data ? myStanding(ranked, data.qualifying, myMemberId, view.criterion, data.minMatches) : null), [data, myMemberId, ranked, view.criterion])
  const candidates = useMemo(() => (data ? [...data.ranked, ...data.qualifying].sort((a, b) => a.name.localeCompare(b.name, 'fr')) : []), [data])

  const updateView = useCallback((patch: Partial<RankingView>) => setView((current) => ({ ...current, ...patch })), [])

  const setTab = useCallback((next: PlayersTab) => writeQuery({ tab: next }), [])
  function handleTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
    setTab(TABS[nextIndex].value)
    tabButtons.current[nextIndex]?.focus()
  }

  function toggleSelect(memberId: number) {
    setSelection((current) => (current.includes(memberId) ? current.filter((id) => id !== memberId) : current.length >= MAX_COMPARED ? current : [...current, memberId]))
  }

  function compareSelection() {
    writeQuery({ tab: 'compare', ids: selection.map(String) })
    setSelection([])
  }

  /** « Mon rang » : sans recherche ni filtre, à la page de ma ligne (ou au podium), puis défilement jusqu'à elle. */
  function goToMine() {
    if (myMemberId === null || standing?.kind !== 'ranked') return
    const page = pageOfPosition(standing.position)
    setView((current) => ({ ...current, search: '', clanId: null, page: Math.max(1, page) }))
    if (tab !== 'ranking') setTab('ranking')
    requestAnimationFrame(() => {
      const target = page === 0 ? `player-${myMemberId}` : window.matchMedia('(min-width: 768px)').matches ? `player-row-${myMemberId}` : `player-card-${myMemberId}`
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const currentHref = tab === 'compare' ? `/players?tab=compare${compareKeys.length > 0 ? `&ids=${compareKeys.join(',')}` : ''}` : '/players'
  const mineLabel = standing?.kind === 'ranked' ? `#${standing.position}` : standing?.kind === 'qualifying' ? `${standing.matches}/${standing.required}` : null
  // Critère du classement : liste déroulante du bandeau (`MobileDropdownNav` compact, demande du 2026-10-18).
  const criterionItems = PLAYER_CRITERIA.map((entry) => {
    const icon = entry.kind === 'role' ? <RoleMenuIcon role={entry.key as PlayerRoleId} /> : undefined
    return {
      key: entry.key,
      label: icon ? (
        <span className="inline-flex items-center gap-2">
          {icon}
          {entry.label}
        </span>
      ) : (
        entry.label
      ),
      icon,
      active: entry.key === view.criterion,
      onSelect: () => updateView({ criterion: entry.key, page: 1 }),
    }
  })

  return (
    <>
      {/* Invisible : inscrit la page dans la pile du fil d'Ariane ; l'onglet et la sélection reviennent avec le retour. */}
      <NavigationTrail currentLabel="Joueurs" currentHref={currentHref} fallbackParent={null} hidden />
      {/*
        Bandeau : période, mode, tri (liste déroulante) et pastille « Mon rang » sur une ligne à partir de 640 px. Sur
        mobile, au repos : période et tri, puis mode et pastille en seconde ligne (ordre CSS, chaque contrôle rendu une
        fois) ; docké : période et tri sur une ligne — exception à sticky.md §2 déclarée dans ui-conformance.test.ts, comme
        le critère de la Ligue : on change de tri en lisant la liste.
      */}
      <DockingToolbar ariaLabel="Filtres des joueurs">
        {({ compact }) => (
          <div className="flex w-full flex-wrap items-center gap-2 sm:flex-nowrap">
            <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} size="xs" className="map-toolbar-period" />
            {!compact ? (
              <div role="group" aria-label="Mode" className="order-3 shrink-0 sm:order-none">
                <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} size="xs" />
              </div>
            ) : null}
            {/* Intitulé « Classer par » à partir de 640 px ; le nom accessible le garde (« Classer par : Dégâts »). */}
            <MobileDropdownNav
              id="players-criterion"
              label="Classer par"
              variant="compact"
              currentLabel={playerCriterion(view.criterion).label}
              leftIcon={<ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />}
              items={criterionItems}
              visibilityClass="block"
              className="min-w-0 flex-1 sm:flex-none [&_.member-section-nav-mobile-label]:hidden sm:[&_.member-section-nav-mobile-label]:block"
            />
            {!compact ? <span aria-hidden="true" className="order-2 h-0 basis-full sm:hidden" /> : null}
            {!compact && mineLabel ? (
              <button
                type="button"
                onClick={goToMine}
                disabled={standing?.kind !== 'ranked'}
                className="app-toolbar-btn order-4 ml-auto shrink-0 self-stretch disabled:cursor-default sm:order-none"
                aria-label={standing?.kind === 'ranked' ? `Mon rang : ${standing.position}e, aller à ma ligne` : `Mon rang : en qualification (${mineLabel} parties)`}
                data-testid="mine-chip"
              >
                <span className="hidden sm:inline">{standing?.kind === 'ranked' ? 'Mon rang ·' : 'En qualification ·'}</span>
                <span className="t-num font-bold text-gray-900">{mineLabel}</span>
              </button>
            ) : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-4 pb-8 sm:gap-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Joueurs" className="app-segmented-control inline-flex w-full border border-gray-200 sm:w-fit">
            {TABS.map((entry, index) => {
              const active = entry.value === tab
              const Icon = entry.icon
              return (
                <button
                  key={entry.value}
                  ref={(node) => {
                    tabButtons.current[index] = node
                  }}
                  type="button"
                  role="tab"
                  id={`players-tab-${entry.value}`}
                  aria-selected={active}
                  aria-controls={`players-panel-${entry.value}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(entry.value)}
                  onKeyDown={(event) => handleTabKey(event, index)}
                  className={`app-segmented-control__item app-segmented-control__item--sm inline-flex flex-1 items-center justify-center gap-1.5 font-medium transition-colors sm:flex-none ${
                    active ? 'app-segmented-control__item--active' : ''
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {entry.label}
                  {entry.value === 'compare' && compareKeys.length > 0 ? <span className="t-num text-[11px] opacity-75">({compareKeys.length})</span> : null}
                </button>
              )
            })}
          </div>
          <div className="flex flex-col items-start gap-0.5 sm:items-end">
            {data ? (
              <p className="t-meta sm:text-right" data-testid="players-freshness">
                {integer.format(data.ranked.length)} classé{data.ranked.length > 1 ? 's' : ''} {PERIOD_WHEN_LABELS[period]} · {integer.format(data.totals.players)} joueurs de{' '}
                {data.totals.clans} clans suivis
                {data.lastMatchAt ? ` · dernière partie ${elapsedLabel(data.lastMatchAt, now)}` : ''}
              </p>
            ) : null}
            {/* Renvoi au guide de calcul du bas de page (demande du 2026-10-18). */}
            <a href={`#${SCORING_GUIDE_ID}`} onClick={openGuide} className="app-link inline-flex items-center gap-1 text-[13px] font-semibold">
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Comment c’est calculé
            </a>
          </div>
        </div>

        {error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}
        {!data && loading ? <CardSkeleton /> : null}

        {data ? (
          // Pendant un rechargement (période, mode), les résultats précédents restent affichés, estompés.
          <div className={`transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div role="tabpanel" id="players-panel-ranking" aria-labelledby="players-tab-ranking" hidden={tab !== 'ranking'}>
              <PlayersRanking
                data={data}
                ranked={ranked}
                view={view}
                onView={updateView}
                period={period}
                mode={mode}
                myMemberId={myMemberId}
                myStanding={standing}
                canOpen={canOpen}
                selection={selection}
                onToggleSelect={toggleSelect}
                onClearSelection={() => setSelection([])}
                onCompareSelection={compareSelection}
                onPeriod={setPeriod}
                onOpenGuide={openGuide}
              />
            </div>
            <div role="tabpanel" id="players-panel-compare" aria-labelledby="players-tab-compare" hidden={tab !== 'compare'}>
              {tab === 'compare' ? (
                <PlayersComparator
                  candidates={candidates}
                  clans={data.clans}
                  keys={compareKeys}
                  onKeys={(ids) => writeQuery({ ids })}
                  period={period}
                  mode={mode}
                  myMemberId={myMemberId}
                  myClan={myClan}
                  canOpen={canOpen}
                  onPickInRanking={() => setTab('ranking')}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        <PlayersScoringGuide open={guideOpen} onToggle={() => setGuideOpen((value) => !value)} />
      </div>
    </>
  )
}

/**
 * Joueurs — classement inter-clans et comparateur (maquette Claude Design « Joueurs », 2026-10-12 ;
 * docs/features/joueurs.md). Page globale comme la Ligue : les joueurs actifs des clans suivis, classés entre eux sur
 * leurs parties officielles de clan (podium, rôles, tendances), et un comparateur de deux ou trois joueurs ou moyennes
 * de clan. Charte UI : docs/ui/index.html.
 */
export default function PlayersPage() {
  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) ; `.charte` + `.game-ui` : charte UI et jetons de jeu.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        {/* Hauteur standard des bandeaux d'image (docs/ui/index.html#en-tetes) : le râtelier de la maquette. */}
        <header
          className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/banner-weapons.jpg')`, backgroundPosition: 'center 45%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
            <div className="flex items-center gap-2">
              <Medal className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">Joueurs</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md">Les joueurs des clans suivis, classés entre eux — et face à face.</p>
          </div>
        </header>
      </div>

      {/* `usePagePeriod` et l'onglet lisent l'URL : une route statique exige cette frontière (CLAUDE.md, piège n° 5). */}
      <Suspense fallback={<div className="app-container app-gutter"><CardSkeleton /></div>}>
        <PlayersContent />
      </Suspense>
    </div>
  )
}
