'use client'

import Link from 'next/link'
import { Search, Settings, Trophy, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  LiveTournamentCard,
  TournamentModeCards,
  TournamentPalmares,
  TournamentQuickGuide,
  TournamentStatusMenu,
  UpcomingTournamentCard,
} from '@/components/tournaments/TournamentListSections'
import { TOURNAMENT_MODE_ICONS, tournamentModeClass } from '@/components/tournaments/TournamentModeBadge'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
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
 * Charte UI : docs/ui/index.html, section « Tournois » (04/10/2026).
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
  const ModeIcon = filters.mode ? TOURNAMENT_MODE_ICONS[filters.mode] : null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        {/* Invisible : inscrit la liste dans la pile du fil d'Ariane, pour que « Retour » y ramène depuis un tournoi. */}
        <NavigationTrail currentLabel="Tournois" currentHref="/tournaments" fallbackParent={null} hidden />

        {/* Hauteur du bandeau inchangée : seul son contenu suit la charte (titre Teko, photo `.app-on-photo`). */}
        <header
          className="app-on-photo bg-hero-fallback relative flex min-h-[11rem] flex-col justify-end overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[14rem]"
          style={{ backgroundImage: "url('/ClanLeaderboardTable.jpg')", backgroundPosition: 'center 35%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 to-slate-950/15 sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-slate-950/5" />
          <div className="relative z-10 flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
                <h1 className="t-banner-title text-white drop-shadow-md">Tournois</h1>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-white">
                {/* « En direct » à l'accent (charte §1.2) dès qu'un tournoi se joue ; sinon neutre comme les autres. */}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${
                    phaseCounts.live > 0 ? 'border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)]' : 'border-white/25 bg-white/15'
                  }`}
                >
                  {phaseCounts.live > 0 ? (
                    <span
                      className="h-[7px] w-[7px] rounded-full bg-[var(--theme-ui-accent)] shadow-[0_0_0_3px_var(--theme-ui-accent-soft)]"
                      aria-hidden="true"
                    />
                  ) : null}
                  {phaseCounts.live} en direct
                </span>
                <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5">{phaseCounts.upcoming} à venir</span>
                <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5">
                  {phaseCounts.finished} terminé{phaseCounts.finished > 1 ? 's' : ''}
                </span>
              </div>
            </div>
            {canManage && clanId ? (
              <Link href={`/clans/${clanId}/settings/tournaments`} className="app-btn app-btn--sm app-btn--secondary shrink-0">
                <Settings className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Gérer les tournois de mon clan
              </Link>
            ) : null}
          </div>
        </header>
      </div>

      {/*
        Pas de période, mais le bandeau docke aussi sur mobile : exception décidée le 2026-09-27 pour les tournois
        (docs/TODO/sticky.md §2) — la recherche et le statut restent à portée pendant la lecture du palmarès. Une seule
        hauteur par ligne (recherche `app-toolbar-search`, contrôles `self-stretch`) ; docké sur mobile, le statut passe
        en menu pour tenir sur une ligne avec la recherche.
      */}
      <DockingToolbar ariaLabel="Filtres des tournois">
        {({ isSticky, compact }) => (
          <div className={`flex w-full items-center gap-2 ${compact ? 'flex-nowrap' : 'flex-wrap'}`}>
            <label className={`app-toolbar-search flex-1 ${compact ? 'min-w-0' : 'min-w-[10rem]'}`}>
              <Search className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={filters.search}
                onChange={(event) => update({ search: event.target.value })}
                placeholder="Tournoi ou clan"
                aria-label="Rechercher un tournoi ou un clan"
              />
              {filters.search ? (
                <button
                  type="button"
                  onClick={() => update({ search: '' })}
                  aria-label="Effacer la recherche"
                  className="text-gray-500 hover:text-gray-900"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </label>
            {compact ? (
              <TournamentStatusMenu value={filters.status} onChange={(status) => update({ status })} />
            ) : (
              <div role="group" aria-label="Statut" className="flex self-stretch">
                <SegmentedControl
                  options={TOURNAMENT_STATUS_OPTIONS}
                  value={filters.status}
                  onChange={(status) => update({ status })}
                  wrap
                />
              </div>
            )}
            {filters.mode && ModeIcon ? (
              // Filtre de mode actif (posé par les cartes de mode) : état actif en accent, icône à la couleur du mode.
              <button
                type="button"
                onClick={() => update({ mode: null })}
                className={`${tournamentModeClass(filters.mode)} app-menu-trigger app-menu-trigger--active shrink-0 self-stretch`}
                aria-label={`Retirer le filtre de mode ${TOURNAMENT_MODE_DISPLAY[filters.mode].label}`}
              >
                <ModeIcon className="h-3.5 w-3.5 shrink-0 text-[var(--tmode)]" aria-hidden="true" />
                {compact ? null : <span>Mode : {TOURNAMENT_MODE_DISPLAY[filters.mode].label}</span>}
                <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </button>
            ) : null}
            {!isSticky && filtersActive ? (
              <span className="t-meta">
                {shown} tournoi{shown > 1 ? 's' : ''} sur {tournaments.length}
              </span>
            ) : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-4 pb-8 sm:gap-6">
        {loading ? <CardSkeleton /> : null}
        {error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}

        {!loading && !error ? (
          <>
            <TournamentModeCards counts={modeCounts} value={filters.mode} onChange={(mode) => update({ mode })} />

            {shown === 0 ? (
              <section className="app-panel p-6 text-center">
                <p className="t-body text-gray-600">
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
              <section aria-label="En direct" className="flex flex-col gap-3.5">
                {live.map((tournament) => (
                  <LiveTournamentCard key={tournament.id} tournament={tournament} viewer={viewer} now={now} />
                ))}
              </section>
            ) : null}

            {upcoming.length > 0 ? (
              <section aria-labelledby="tournaments-upcoming" className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2 id="tournaments-upcoming" className="t-section-title">À venir</h2>
                  <span className="t-meta">
                    {upcoming.length} tournoi{upcoming.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
                  {upcoming.map((tournament) => (
                    <UpcomingTournamentCard key={tournament.id} tournament={tournament} now={now} />
                  ))}
                </div>
              </section>
            ) : null}

            {finished.length > 0 ? (
              <section aria-labelledby="tournaments-palmares" className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h2 id="tournaments-palmares" className="t-section-title">Palmarès</h2>
                  <span className="t-meta">
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
