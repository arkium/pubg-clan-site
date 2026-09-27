'use client'

import Link from 'next/link'
import { Search, Settings, Trophy, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  LiveTournamentCard,
  TournamentModeCards,
  TournamentPalmares,
  TournamentQuickGuide,
  UpcomingTournamentCard,
} from '@/components/tournaments/TournamentListSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import {
  EMPTY_TOURNAMENT_FILTERS,
  TOURNAMENT_STATUS_OPTIONS,
  countTournamentsByMode,
  countTournamentsByPhase,
  filterBySearchAndStatus,
  filterTournaments,
  hasActiveTournamentFilters,
  splitTournamentsByPhase,
  type TournamentListFilters,
} from '@/lib/tournament-list-filters'
import { TOURNAMENT_MODE_DISPLAY, type TournamentViewer } from '@/lib/tournament-mode-display'
import type { TournamentOverview } from '@/lib/tournament-overview'

/**
 * Tournois — docs/features/tournois.md, « Pages joueurs » (maquette « Tournois », 2026-09-27). Le mode d'abord : les
 * quatre cartes de mode servent de légende et de filtre, le direct s'affiche en grand avec le classement en cours, puis
 * les tournois à venir et le palmarès, dont le vainqueur suit le mode (clan, équipe, joueur ou escouade).
 */
export default function TournamentsPage() {
  const { clanId } = useSelectedClan()
  const { members, permissions, isSuperUser } = useAuthSession()
  const [tournaments, setTournaments] = useState<TournamentOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<TournamentListFilters>(EMPTY_TOURNAMENT_FILTERS)

  // Fige l'instant de rendu : les comptes à rebours ne doivent pas bouger d'une carte à l'autre.
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

  const viewer: TournamentViewer = useMemo(
    () => ({
      memberIds: members.map((member) => member.memberId),
      clanIds: members.map((member) => member.clanId).filter((id): id is number => id !== null),
    }),
    [members]
  )
  // Le lien de gestion ne s'affiche qu'à qui peut ouvrir la page de gestion de son clan.
  const canManage = Boolean(clanId) && (isSuperUser || permissions.includes('*') || permissions.includes('manage_settings'))

  const phaseCounts = useMemo(() => countTournamentsByPhase(tournaments), [tournaments])
  const modeCounts = useMemo(() => countTournamentsByMode(filterBySearchAndStatus(tournaments, filters)), [tournaments, filters])
  const { live, upcoming, finished } = useMemo(
    () => splitTournamentsByPhase(filterTournaments(tournaments, filters)),
    [tournaments, filters]
  )
  const shown = live.length + upcoming.length + finished.length
  const filtersActive = hasActiveTournamentFilters(filters)
  const update = (patch: Partial<TournamentListFilters>) => setFilters((current) => ({ ...current, ...patch }))

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter">
        {/* Invisible : inscrit la liste dans la pile du fil d'Ariane, pour que « Retour » y ramène depuis un tournoi. */}
        <NavigationTrail currentLabel="Tournois" currentHref="/tournaments" fallbackParent={null} hidden />

        <header
          className="relative flex min-h-[11rem] flex-col justify-end overflow-hidden rounded-2xl bg-cover bg-[center_35%] sm:min-h-[14rem]"
          style={{ backgroundImage: "url('/ClanLeaderboardTable.jpg')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 to-slate-950/15 sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-slate-950/5" />
          <div className="relative z-10 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5">
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-400 sm:h-6 sm:w-6" aria-hidden />
                <h1 className="text-lg font-black tracking-tight text-white drop-shadow sm:text-2xl">Tournois</h1>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs font-bold text-white">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/70 bg-red-500/30 px-2.5 py-0.5">
                  <span className="h-[7px] w-[7px] rounded-full bg-red-400 shadow-[0_0_0_3px_rgb(248_113_113/0.35)]" aria-hidden="true" />
                  {phaseCounts.live} en direct
                </span>
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5">{phaseCounts.upcoming} à venir</span>
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5">
                  {phaseCounts.finished} terminé{phaseCounts.finished > 1 ? 's' : ''}
                </span>
              </div>
            </div>
            {canManage && clanId ? (
              <Link href={`/clans/${clanId}/settings/tournaments`} className="app-btn app-btn--sm app-btn--secondary shrink-0">
                <Settings className="mr-1.5 h-4 w-4" aria-hidden />
                Gérer les tournois de mon clan
              </Link>
            ) : null}
          </div>
        </header>
      </div>

      {/*
        Pas de période, mais le bandeau docke aussi sur mobile : exception décidée le 2026-09-27 pour les tournois
        (docs/TODO/sticky.md §2) — la recherche et le statut restent à portée pendant la lecture du palmarès.
      */}
      <DockingToolbar ariaLabel="Filtres des tournois">
        {({ isSticky }) => (
          <div className="flex w-full flex-wrap items-center gap-2">
            <div className="relative min-w-[10rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
              <input
                type="search"
                value={filters.search}
                onChange={(event) => update({ search: event.target.value })}
                placeholder="Tournoi ou clan"
                aria-label="Rechercher un tournoi ou un clan"
                className="app-input w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900"
              />
              {filters.search ? (
                <button
                  type="button"
                  onClick={() => update({ search: '' })}
                  aria-label="Effacer la recherche"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <SegmentedControl
              options={TOURNAMENT_STATUS_OPTIONS}
              value={filters.status}
              onChange={(status) => update({ status })}
              wrap
            />
            {filters.mode ? (
              <button
                type="button"
                onClick={() => update({ mode: null })}
                className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900"
                aria-label={`Retirer le filtre de mode ${TOURNAMENT_MODE_DISPLAY[filters.mode].label}`}
              >
                Mode : {TOURNAMENT_MODE_DISPLAY[filters.mode].label}
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
            {!isSticky && filtersActive ? (
              <span className="text-xs text-gray-500">
                {shown} tournoi{shown > 1 ? 's' : ''} sur {tournaments.length}
              </span>
            ) : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-[18px]">
        {loading ? <p className="text-sm text-gray-500">Chargement des tournois…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {!loading && !error ? (
          <>
            <TournamentModeCards counts={modeCounts} value={filters.mode} onChange={(mode) => update({ mode })} />

            {shown === 0 ? (
              <section className="app-panel p-6 text-center">
                <p className="text-sm text-gray-600">
                  {tournaments.length === 0 ? 'Aucun tournoi pour l’instant.' : 'Aucun tournoi ne correspond à ces filtres.'}
                </p>
                {filtersActive ? (
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_TOURNAMENT_FILTERS)}
                    className="app-btn app-btn--sm app-btn--secondary mt-3"
                  >
                    Réinitialiser les filtres
                  </button>
                ) : null}
              </section>
            ) : null}

            {live.length > 0 ? (
              <section aria-label="En direct" className="flex flex-col gap-3">
                {live.map((tournament) => (
                  <LiveTournamentCard key={tournament.id} tournament={tournament} viewer={viewer} now={now} />
                ))}
              </section>
            ) : null}

            {upcoming.length > 0 ? (
              <section aria-labelledby="tournaments-upcoming" className="flex flex-col gap-2.5">
                <div className="flex items-baseline gap-2">
                  <h2 id="tournaments-upcoming" className="text-[17px] font-extrabold text-gray-900">À venir</h2>
                  <span className="text-[13px] text-gray-500">
                    {upcoming.length} tournoi{upcoming.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map((tournament) => (
                    <UpcomingTournamentCard key={tournament.id} tournament={tournament} now={now} />
                  ))}
                </div>
              </section>
            ) : null}

            {finished.length > 0 ? (
              <section aria-labelledby="tournaments-palmares" className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h2 id="tournaments-palmares" className="text-[17px] font-extrabold text-gray-900">Palmarès</h2>
                  <span className="text-[13px] text-gray-500">
                    {finished.length} tournoi{finished.length > 1 ? 's' : ''} terminé{finished.length > 1 ? 's' : ''} · le
                    vainqueur suit le mode du tournoi
                  </span>
                </div>
                <TournamentPalmares tournaments={finished} viewer={viewer} />
              </section>
            ) : null}

            <TournamentQuickGuide />
          </>
        ) : null}
      </div>
    </div>
  )
}
