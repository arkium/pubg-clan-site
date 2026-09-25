'use client'

import Link from 'next/link'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Info, Search, Settings, Trophy, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import TournamentGuide from '@/components/tournaments/TournamentGuide'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'
import SegmentedControl from '@/components/ui/SegmentedControl'
import TeamModeBadge, { type TeamMode } from '@/components/ui/TeamModeBadge'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import {
  filterTournaments,
  hasActiveTournamentFilters,
  sortTournaments,
  splitTournamentsByPhase,
  type TournamentSortKey as SortKey,
  type TournamentStatusFilter as StatusFilter,
} from '@/lib/tournament-list-filters'
import type { TournamentOverview, TournamentPhase } from '@/lib/tournament-overview'

/** Replie les archives dès qu'il y a plus de tournois terminés que ça, pour garder le direct visible. */
const ARCHIVE_COLLAPSE_THRESHOLD = 3

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'live', label: '🔥 En direct' },
  { value: 'upcoming', label: '⏳ À venir' },
  { value: 'finished', label: '🏁 Terminés' },
]

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'recent', label: 'Date (plus récents)' },
  { value: 'oldest', label: 'Date (plus anciens)' },
  { value: 'title', label: 'Nom (A-Z)' },
]

/**
 * Tri des archives sur mobile. Sous `md`, le tableau est remplacé par des cartes :
 * les en-têtes cliquables disparaissent avec lui, donc le tri doit être proposé
 * ailleurs, sinon la fonctionnalité n'existe tout simplement plus sur téléphone.
 * `organizer` est repris ici pour garder la parité avec les colonnes du tableau.
 */
const ARCHIVE_SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'recent', label: 'Période (plus récents)' },
  { value: 'oldest', label: 'Période (plus anciens)' },
  { value: 'title', label: 'Tournoi (A-Z)' },
  { value: 'organizer', label: 'Organisateur (A-Z)' },
]

const PHASE_BADGES: Record<TournamentPhase, { label: string; className: string; pulse?: boolean }> = {
  live: { label: 'EN DIRECT', className: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', pulse: true },
  upcoming: { label: 'À VENIR', className: 'border-sky-400/40 bg-sky-500/15 text-sky-600 dark:text-sky-300' },
  finished: { label: 'TERMINÉ', className: 'border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  draft: { label: 'BROUILLON', className: 'border-amber-400/40 bg-amber-500/15 text-amber-700 dark:text-amber-300' },
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const formatDate = (value: string) => dateFormat.format(new Date(value))

/** Mode PUBG du tournoi (`squad-fpp`, `duo`, `solo`…) ramené au badge d'équipe du design system. */
function teamModeFromGameMode(gameMode: string | null): TeamMode | null {
  if (!gameMode) return null
  const normalized = gameMode.toLowerCase()
  if (normalized.startsWith('solo')) return 'solo'
  if (normalized.startsWith('duo')) return 'duo'
  if (normalized.startsWith('squad')) return 'squad'
  return null
}

function gameModeLabel(gameMode: string | null) {
  if (!gameMode) return 'Tous formats'
  return gameMode.toLowerCase().includes('fpp') ? `${gameMode.split('-')[0]} FPP` : gameMode
}

/** Temps restant lisible, sans bibliothèque : « dans 3 jours », « dans 5 h », « aujourd'hui ». */
function remainingLabel(target: string, now: Date) {
  const diffMs = new Date(target).getTime() - now.getTime()
  if (diffMs <= 0) return null
  const hours = Math.round(diffMs / 3_600_000)
  if (hours < 1) return 'dans moins d’une heure'
  if (hours < 24) return `dans ${hours} h`
  const days = Math.round(hours / 24)
  return `dans ${days} jour${days > 1 ? 's' : ''}`
}

/** Flèche de tri d'une colonne des archives : la colonne « Période » bascule récent ↔ ancien. */
function ArchiveSortIcon({ column, current }: { column: SortKey; current: SortKey }) {
  if (column === 'recent') {
    if (current === 'recent') return <ArrowDown className="h-3.5 w-3.5" aria-hidden />
    if (current === 'oldest') return <ArrowUp className="h-3.5 w-3.5" aria-hidden />
    return <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
  }
  return current === column ? (
    <ArrowDown className="h-3.5 w-3.5" aria-hidden />
  ) : (
    <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
  )
}

function PhaseBadge({ phase }: { phase: TournamentPhase }) {
  const badge = PHASE_BADGES[phase]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide ${badge.className}`}>
      {badge.pulse ? <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> : null}
      {badge.label}
    </span>
  )
}

function ContextBadges({ tournament }: { tournament: TournamentOverview }) {
  const teamMode = teamModeFromGameMode(tournament.gameMode)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {teamMode ? (
        <TeamModeBadge mode={teamMode} size="xs" label={gameModeLabel(tournament.gameMode)} />
      ) : (
        <span className="app-panel-muted rounded-full px-2 py-0.5 text-[11px] text-gray-600">Tous formats</span>
      )}
      <span className="app-panel-muted rounded-full px-2 py-0.5 text-[11px] text-gray-600">
        {tournament.mapLabel ?? 'Toutes les cartes'}
      </span>
      {tournament.roundCount > 0 ? (
        <span className="app-panel-muted rounded-full px-2 py-0.5 text-[11px] text-gray-600">
          {tournament.roundCount} manche{tournament.roundCount > 1 ? 's' : ''}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Une archive en carte, pour les écrans sous `md`.
 *
 * Le tableau des archives compte 6 colonnes : à 390 px il ne tient pas et
 * `overflow-x-auto` le rendait scrollable horizontalement, ce qui masquait
 * « Vainqueur » et « Classement » et écrasait les badges de format sur trois
 * lignes. La carte reprend les mêmes informations, empilées — même pattern que
 * `/clans/[id]/stats/weapons` et `/members/[id]/drop-zones`.
 */
function ArchiveCard({ tournament }: { tournament: TournamentOverview }) {
  return (
    <article className="app-panel flex flex-col gap-3 p-4">
      <div className="min-w-0">
        <Link
          href={`/tournaments/${tournament.id}`}
          className="block break-words text-base font-semibold text-gray-900 hover:underline"
        >
          {tournament.title}
        </Link>
        {tournament.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{tournament.description}</p>
        ) : null}
      </div>

      <ContextBadges tournament={tournament} />

      <dl className="grid gap-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-xs uppercase text-slate-500">Organisateur</dt>
          <dd className="min-w-0 break-words text-right text-gray-700">
            {tournament.organizerClan ? (
              <Link href={`/clans/${tournament.organizerClan.id}/overview`} className="hover:underline">
                {tournament.organizerClan.tag ? `[${tournament.organizerClan.tag}] ` : ''}
                {tournament.organizerClan.name}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-xs uppercase text-slate-500">Période</dt>
          <dd className="min-w-0 text-right text-gray-700">
            {formatDate(tournament.startDate)} → {formatDate(tournament.endDate)}
          </dd>
        </div>
      </dl>

      {tournament.winner ? (
        <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 self-start rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            {tournament.winner.tag ? `[${tournament.winner.tag}] ` : ''}
            {tournament.winner.name}
          </span>
          <span className="font-normal text-amber-700/80 dark:text-amber-300/80">
            {tournament.winner.totalPoints} pts
          </span>
        </span>
      ) : (
        <span className="text-xs text-gray-500">Classement indisponible</span>
      )}

      <Link href={`/tournaments/${tournament.id}`} className="app-btn app-btn--sm app-btn--secondary w-full">
        Voir le rapport
      </Link>
    </article>
  )
}

export default function TournamentsPage() {
  const { clanId } = useSelectedClan()
  const [tournaments, setTournaments] = useState<TournamentOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [gameMode, setGameMode] = useState('all')
  const [mapName, setMapName] = useState('all')
  const [sort, setSort] = useState<SortKey>('recent')
  const [archiveSort, setArchiveSort] = useState<SortKey>('recent')
  const [archivesOpen, setArchivesOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  // Fige l'instant de rendu : les compteurs « dans 3 jours » ne doivent pas bouger d'une ligne à l'autre.
  const now = useMemo(() => new Date(), [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/tournaments', { cache: 'no-store' })
        if (!response.ok) throw new Error('Impossible de charger les tournois.')
        const payload = (await response.json()) as { tournaments?: TournamentOverview[] }
        if (!cancelled) setTournaments(payload.tournaments ?? [])
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Impossible de charger les tournois.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const gameModeOptions = useMemo(() => {
    const modes = new Set(tournaments.map((tournament) => tournament.gameMode).filter((mode): mode is string => Boolean(mode)))
    return [...modes].sort()
  }, [tournaments])

  const mapOptions = useMemo(() => {
    const maps = new Map<string, string>()
    for (const tournament of tournaments) {
      if (tournament.mapName) maps.set(tournament.mapName, tournament.mapLabel ?? tournament.mapName)
    }
    return [...maps.entries()].sort((left, right) => left[1].localeCompare(right[1]))
  }, [tournaments])

  const filters = useMemo(() => ({ search, status, gameMode, mapName }), [search, status, gameMode, mapName])
  const filtered = useMemo(() => filterTournaments(tournaments, filters), [tournaments, filters])
  const { current, archived } = useMemo(() => splitTournamentsByPhase(filtered), [filtered])

  const liveAndUpcoming = useMemo(() => sortTournaments(current, sort), [current, sort])
  const archives = useMemo(() => sortTournaments(archived, archiveSort), [archived, archiveSort])

  const liveCount = tournaments.filter((tournament) => tournament.phase === 'live').length
  const archivedCount = tournaments.filter((tournament) => tournament.phase === 'finished').length
  const filtersActive = hasActiveTournamentFilters(filters)

  function resetFilters() {
    setSearch('')
    setStatus('all')
    setGameMode('all')
    setMapName('all')
  }

  function toggleArchiveSort(key: SortKey) {
    setArchivesOpen(true)
    setArchiveSort((current) => {
      if (key === 'recent') return current === 'recent' ? 'oldest' : 'recent'
      return current === key ? 'recent' : key
    })
  }

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter space-y-5">
        {/* Invisible : inscrit la liste dans la pile du fil d'Ariane, pour que « Retour » y ramène depuis un tournoi. */}
        <NavigationTrail currentLabel="Tournois" currentHref="/tournaments" fallbackParent={null} hidden />

        {/*
          `min-h` + `justify-end` plutôt que `absolute bottom-0` : le contenu reste collé
          en bas comme sur les autres bannières du site, mais la hauteur s'adapte quand il
          déborde. Ici il déborde vraiment sur téléphone — c'est la seule bannière qui porte
          un bouton en plus du titre, du chapô et des compteurs, et `overflow-hidden`
          rognait alors le haut du titre.
        */}
        <header
          className="relative flex min-h-[11rem] flex-col justify-end overflow-hidden rounded-2xl bg-cover bg-center sm:min-h-[14rem]"
          style={{ backgroundImage: "url('/ClanLeaderboardTable.jpg')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
          <div className="relative z-10 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400 sm:h-6 sm:w-6" aria-hidden />
                <h1 className="text-lg font-bold tracking-tight text-white drop-shadow sm:text-2xl">
                  Tournois &amp; Compétitions
                </h1>
              </div>
              <p className="mt-1 max-w-2xl text-xs text-gray-200 drop-shadow sm:text-sm">
                La scène compétitive des clans suivis : manches personnalisées, classements par points et archives des
                éditions passées.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-1 text-emerald-200">
                  🔥 {liveCount} tournoi{liveCount > 1 ? 's' : ''} en cours
                </span>
                <span className="rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-gray-200">
                  🏆 {archivedCount} tournoi{archivedCount > 1 ? 's' : ''} archivé{archivedCount > 1 ? 's' : ''}
                </span>
              </div>
            </div>
            {clanId ? (
              <Link
                href={`/clans/${clanId}/settings/tournaments`}
                className="app-btn app-btn--sm app-btn--secondary shrink-0"
              >
                <Settings className="mr-1.5 h-4 w-4" aria-hidden />
                Gérer les tournois de mon clan
              </Link>
            ) : null}
          </div>
        </header>
      </div>

      {/* Pas de période : le bandeau ne docke pas sur mobile (docs/TODO/sticky.md §2). */}
      <DockingToolbar ariaLabel="Filtres des tournois" dockOnMobile={false}>
        {({ isSticky }) => (
          <div className="flex w-full flex-col gap-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un tournoi, une description, un clan…"
                  aria-label="Rechercher un tournoi"
                  className="app-input w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Effacer la recherche"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
              <SegmentedControl options={STATUS_OPTIONS} value={status} onChange={setStatus} wrap fullWidthOnMobile />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-gray-600">
                Format
                <select
                  value={gameMode}
                  onChange={(event) => setGameMode(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900"
                >
                  <option value="all">Tous</option>
                  {gameModeOptions.map((mode) => (
                    <option key={mode} value={mode}>
                      {gameModeLabel(mode)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-gray-600">
                Carte
                <select
                  value={mapName}
                  onChange={(event) => setMapName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900"
                >
                  <option value="all">Toutes</option>
                  {mapOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-gray-600">
                Tri
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end justify-between gap-2">
                {!isSticky ? (
                  <span className="app-panel-muted rounded-full px-3 py-1.5 text-xs text-gray-600">
                    {filtered.length} tournoi{filtered.length > 1 ? 's' : ''} sur {tournaments.length}
                  </span>
                ) : null}
                {filtersActive ? (
                  <button type="button" onClick={resetFilters} className="app-btn app-btn--xs app-btn--secondary ml-auto">
                    Réinitialiser
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter space-y-5">
        {loading ? <p className="text-sm text-gray-500">Chargement des tournois…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && !error && filtered.length === 0 ? (
          <section className="app-panel p-6 text-center">
            <p className="text-sm text-gray-600">Aucun tournoi ne correspond à ces filtres.</p>
            {filtersActive ? (
              <button type="button" onClick={resetFilters} className="app-btn app-btn--sm app-btn--secondary mt-3">
                Réinitialiser les filtres
              </button>
            ) : null}
          </section>
        ) : null}

        {liveAndUpcoming.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Tournois en direct &amp; à venir</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {liveAndUpcoming.map((tournament) => {
                const countdown =
                  tournament.phase === 'live'
                    ? remainingLabel(tournament.endDate, now)
                    : remainingLabel(tournament.startDate, now)
                return (
                  <article key={tournament.id} className="app-panel flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <PhaseBadge phase={tournament.phase} />
                      {countdown ? (
                        <span className="text-xs text-gray-500">
                          {tournament.phase === 'live' ? 'Se termine' : 'Démarre'} {countdown}
                        </span>
                      ) : null}
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{tournament.title}</h3>
                      {tournament.description ? (
                        <p className="mt-1 line-clamp-2 text-sm text-gray-600">{tournament.description}</p>
                      ) : null}
                    </div>

                    <ContextBadges tournament={tournament} />

                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase text-slate-500">Organisateur</dt>
                        <dd className="mt-0.5">
                          {tournament.organizerClan ? (
                            <Link href={`/clans/${tournament.organizerClan.id}/overview`} className="font-medium text-gray-900 hover:underline">
                              {tournament.organizerClan.tag ? `[${tournament.organizerClan.tag}] ` : ''}
                              {tournament.organizerClan.name}
                            </Link>
                          ) : (
                            <span className="text-gray-500">Inconnu</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase text-slate-500">Période</dt>
                        <dd className="mt-0.5 text-gray-700">
                          {formatDate(tournament.startDate)} → {formatDate(tournament.endDate)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-auto flex items-center justify-between gap-3">
                      <span className="text-xs text-gray-500">
                        {tournament.participantCount > 0
                          ? `${tournament.participantCount} clan${tournament.participantCount > 1 ? 's' : ''} engagé${tournament.participantCount > 1 ? 's' : ''}`
                          : 'Aucune manche comptabilisée'}
                      </span>
                      <Link href={`/tournaments/${tournament.id}`} className="app-btn app-btn--sm app-btn--primary">
                        👁️ Suivre le direct
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ) : null}

        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setGuideOpen((open) => !open)}
            aria-expanded={guideOpen}
            className="app-panel flex w-full items-center justify-between gap-3 p-4 text-left"
          >
            <span className="flex items-center gap-2">
              <Info className="h-5 w-5 text-sky-500" aria-hidden />
              <h2 className="text-base font-semibold text-gray-900">Comment fonctionne un tournoi ?</h2>
            </span>
            <ChevronDown
              className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${guideOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {guideOpen ? <TournamentGuide showHeader={false} /> : null}
        </section>

        {archives.length > 0 ? (
          <section className="space-y-3">
            <button
              type="button"
              onClick={() => setArchivesOpen((open) => !open)}
              aria-expanded={archivesOpen || archives.length <= ARCHIVE_COLLAPSE_THRESHOLD}
              className="app-panel flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <span className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">Archives des tournois terminés</h2>
                <span className="app-panel-muted rounded-full px-2 py-0.5 text-xs text-gray-600">
                  {archives.length} tournoi{archives.length > 1 ? 's' : ''}
                </span>
              </span>
              <ChevronDown
                className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${
                  archivesOpen || archives.length <= ARCHIVE_COLLAPSE_THRESHOLD ? 'rotate-180' : ''
                }`}
                aria-hidden
              />
            </button>

            {archivesOpen || archives.length <= ARCHIVE_COLLAPSE_THRESHOLD ? (
              <>
                {/* Mobile (< md) : cartes empilées + tri déporté, le tableau ne tient pas. */}
                <div className="space-y-3 md:hidden">
                  <MobileDropdownNav
                    id="archive-sort-dropdown"
                    label="Trier les archives"
                    variant="compact"
                    currentLabel={
                      ARCHIVE_SORT_OPTIONS.find((option) => option.value === archiveSort)?.label ??
                      'Période (plus récents)'
                    }
                    items={ARCHIVE_SORT_OPTIONS.map((option) => ({
                      key: option.value,
                      label: option.label,
                      active: option.value === archiveSort,
                      onSelect: () => setArchiveSort(option.value),
                    }))}
                  />
                  {archives.map((tournament) => (
                    <ArchiveCard key={tournament.id} tournament={tournament} />
                  ))}
                </div>

                {/* Desktop (>= md) : le tableau triable d'origine. */}
                <div className="app-table-shell hidden overflow-x-auto md:block">
                  <table className="min-w-full text-sm">
                    <thead className="app-table-head">
                      <tr>
                        <th className="px-3 py-2 text-left">
                          <button type="button" onClick={() => toggleArchiveSort('title')} className="inline-flex items-center gap-1.5">
                            Tournoi <ArchiveSortIcon column="title" current={archiveSort} />
                          </button>
                        </th>
                        <th className="px-3 py-2 text-left">
                          <button type="button" onClick={() => toggleArchiveSort('organizer')} className="inline-flex items-center gap-1.5">
                            Organisateur <ArchiveSortIcon column="organizer" current={archiveSort} />
                          </button>
                        </th>
                        <th className="px-3 py-2 text-left">Format &amp; carte</th>
                        <th className="px-3 py-2 text-left">
                          <button type="button" onClick={() => toggleArchiveSort('recent')} className="inline-flex items-center gap-1.5">
                            Période <ArchiveSortIcon column="recent" current={archiveSort} />
                          </button>
                        </th>
                        <th className="px-3 py-2 text-left">Vainqueur</th>
                        <th className="px-3 py-2 text-right">Classement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archives.map((tournament) => (
                        <tr key={tournament.id} className="app-table-row">
                          <td className="px-3 py-3">
                            <Link href={`/tournaments/${tournament.id}`} className="font-medium text-gray-900 hover:underline">
                              {tournament.title}
                            </Link>
                            {tournament.description ? (
                              <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{tournament.description}</p>
                            ) : null}
                          </td>
                          <td className="px-3 py-3 text-gray-700">
                            {tournament.organizerClan ? (
                              <Link href={`/clans/${tournament.organizerClan.id}/overview`} className="hover:underline">
                                {tournament.organizerClan.tag ? `[${tournament.organizerClan.tag}] ` : ''}
                                {tournament.organizerClan.name}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <ContextBadges tournament={tournament} />
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-gray-700">
                            {formatDate(tournament.startDate)} → {formatDate(tournament.endDate)}
                          </td>
                          <td className="px-3 py-3">
                            {tournament.winner ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                <Trophy className="h-3.5 w-3.5" aria-hidden />
                                {tournament.winner.tag ? `[${tournament.winner.tag}] ` : ''}
                                {tournament.winner.name}
                                <span className="font-normal text-amber-700/80 dark:text-amber-300/80">
                                  {tournament.winner.totalPoints} pts
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500">Classement indisponible</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Link href={`/tournaments/${tournament.id}`} className="app-btn app-btn--xs app-btn--secondary">
                              Voir le rapport
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}
