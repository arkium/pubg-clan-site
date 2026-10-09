'use client'

import { ArrowRight, ChevronLeft, ChevronRight, Info, Trophy } from 'lucide-react'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'

import TournamentModeBadge from '@/components/tournaments/TournamentModeBadge'
import { organizerLabel, tournamentDates, tournamentFormatLabel } from '@/components/tournaments/TournamentListSections'
import RankCell from '@/components/ui/RankCell'
import {
  hasHomeTournaments,
  roundCountLabel,
  type HomeRankedTournament,
  type HomeTournament,
  type HomeTournamentsPayload,
} from '@/lib/home-tournaments'
import { paginate } from '@/lib/pagination'
import { mapAssetUrl } from '@/lib/pubg-assets/map-asset'
import { tournamentMapLabel } from '@/lib/tournament-filters'
import {
  TOURNAMENT_MODE_DISPLAY,
  countdownLabel,
  elapsedLabel,
  formatTournamentPoints,
  participantCountLabel,
} from '@/lib/tournament-mode-display'

/**
 * Tournois de la vitrine (`/`) — maquette Claude Design « Accueil - Tournois » (2026-10-08), docs/features/accueil.md.
 * Trois points d'accès : la pastille du lien « Tournois » (« En direct », sinon le nombre de tournois à venir), le
 * ticket du héros (bandeau sous le héros sur mobile et tablette) et la section « En ce moment et à venir », juste avant
 * les Chicken Dinners. Tout disparaît sans tournoi en direct, sans début dans les 14 jours ni fin depuis moins de
 * 3 jours (résultats). Direct et résultats sont sombres par construction (photo de la carte) ; les tournois à venir
 * suivent le thème, en cartes à partir de 768 px et en agenda en dessous : un tournoi prend toute la largeur, deux ou
 * trois se partagent la rangée, au-delà des pages de trois parcourues par chevrons (l'agenda suit les mêmes pages).
 */

const weekdayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const dayFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit' })
const monthFormat = new Intl.DateTimeFormat('fr-FR', { month: 'short' })

/** « JEU », « 08 », « OCT » : la date d'un tournoi à venir, en pavé. */
function dateParts(value: string) {
  const date = new Date(value)
  const clean = (text: string) => text.replace('.', '').toUpperCase()
  return { weekday: clean(weekdayFormat.format(date)), day: dayFormat.format(date), month: clean(monthFormat.format(date)) }
}

function tournamentImage(mapName: string | null) {
  return mapAssetUrl(mapName) ?? '/matches.jpg'
}

const tournamentHref = (tournament: Pick<HomeTournament, 'id'>) => `/tournaments/${tournament.id}`

/** Le tournoi mis en avant (ticket du héros, bandeau mobile) et celui qui le suit. */
function featuredTournaments(data: HomeTournamentsPayload) {
  const live = data.live[0] ?? null
  if (live) return { live, upcoming: null, next: data.upcoming[0] ?? null }
  const upcoming = data.upcoming[0] ?? null
  return { live: null, upcoming, next: data.upcoming[1] ?? null }
}

function nextLine(prefix: string, tournament: HomeTournament | null, now: Date) {
  if (!tournament) return null
  const startsIn = countdownLabel(tournament.startDate, now)
  return `${prefix} : ${tournament.title}${startsIn ? ` · ${startsIn}` : ''}`
}

function LiveDot() {
  return <span className="h-[7px] w-[7px] shrink-0 animate-pulse rounded-full bg-red-500 motion-reduce:animate-none" aria-hidden="true" />
}

// ── Pastille du lien « Tournois » ────────────────────────────────────────────────────────────────────

export function TournamentsNavBadge({ data }: { data: HomeTournamentsPayload | null }) {
  if (!data) return null
  if (data.live.length > 0) {
    return (
      <span className="ml-1.5 inline-flex items-center gap-1 rounded-full border border-red-400/45 bg-red-500/20 px-1.5 py-px text-[11px] font-bold text-red-100">
        <LiveDot />
        En direct
      </span>
    )
  }
  if (data.upcomingCount === 0) return null
  return (
    <span
      className="ml-1.5 inline-flex min-w-5 justify-center rounded-full bg-white/15 px-1.5 py-px text-[11px] font-bold tabular-nums text-white"
      aria-label={`${data.upcomingCount} tournoi${data.upcomingCount > 1 ? 's' : ''} à venir`}
    >
      {data.upcomingCount}
    </span>
  )
}

// ── Ticket du héros (ordinateur) et bandeau sous le héros (mobile, tablette) ────────────────────────

function TicketKicker({ live }: { live: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] ${live ? 'text-red-300' : 'text-amber-300'}`}>
      {live ? <LiveDot /> : <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-amber-400" aria-hidden="true" />}
      {live ? 'Tournoi en direct' : 'Prochain tournoi'}
    </span>
  )
}

function TicketButton({ tournament, live, label }: { tournament: HomeTournament; live: boolean; label: string }) {
  return (
    <Link
      href={tournamentHref(tournament)}
      className={`inline-flex h-8 shrink-0 items-center rounded-lg px-3 text-[13px] font-bold ${
        live ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-amber-400 text-amber-950 hover:bg-amber-300'
      }`}
      aria-label={`${label} : ${tournament.title}`}
    >
      {label}
    </Link>
  )
}

function liveSubline(tournament: HomeRankedTournament) {
  const leader = tournament.leaders[0]
  return [TOURNAMENT_MODE_DISPLAY[tournament.mode].label, tournamentMapLabel(tournament.mapName), leader ? `1er ${leader.label}` : null]
    .filter(Boolean)
    .join(' · ')
}

/** Ticket en bas à droite du héros, à partir de 1 024 px. */
export function HeroTournamentTicket({ data, now }: { data: HomeTournamentsPayload | null; now: Date }) {
  if (!data) return null
  const { live, upcoming, next } = featuredTournaments(data)
  const tournament = live ?? upcoming
  if (!tournament) return null
  const startsIn = upcoming ? countdownLabel(upcoming.startDate, now) : null
  const footer = live ? nextLine('Ensuite', next, now) : nextLine('Puis', next, now)

  return (
    <div
      className={`absolute bottom-16 right-14 z-[2] hidden w-[300px] flex-col gap-1.5 rounded-[14px] border bg-slate-950/80 p-4 text-white shadow-[0_20px_40px_-18px_rgba(0,0,0,.7)] backdrop-blur-md lg:flex ${
        live ? 'border-red-400/40' : 'border-amber-400/40'
      }`}
      data-testid="home-tournament-ticket"
    >
      <TicketKicker live={Boolean(live)} />
      <span className="home-display truncate text-[28px] font-semibold uppercase leading-none">{tournament.title}</span>
      <span className="truncate text-[13px] text-white/75">
        {live ? liveSubline(live) : `${tournamentFormatLabel(tournament)} · ${tournamentDates(tournament)}`}
      </span>
      <span className="mt-1 flex items-center justify-between gap-3 border-t border-white/15 pt-2.5">
        <span className="home-display text-[22px] font-semibold leading-none">
          {live ? roundCountLabel(live.roundCount) : (startsIn ?? 'Bientôt')}
        </span>
        <TicketButton tournament={tournament} live={Boolean(live)} label={live ? 'Suivre' : 'Voir'} />
      </span>
      {footer ? <span className="truncate text-xs text-white/65">{footer}</span> : null}
    </div>
  )
}

/** Bandeau tactile juste sous le héros, avant le kill feed (sous 1 024 px). */
export function MobileTournamentBanner({ data, now }: { data: HomeTournamentsPayload | null; now: Date }) {
  if (!data) return null
  const { live, upcoming } = featuredTournaments(data)
  const tournament = live ?? upcoming
  if (!tournament) return null
  const lead = live ? roundCountLabel(live.roundCount) : (countdownLabel(tournament.startDate, now) ?? 'Bientôt')
  const rest = live ? liveSubline(live) : `${tournamentFormatLabel(tournament)} · ${tournamentDates(tournament)}`

  return (
    <section className="px-4 pt-4 md:px-8 lg:hidden" aria-label={live ? 'Tournoi en direct' : 'Prochain tournoi'}>
      <div
        className={`home-feed-card flex items-center gap-3 rounded-[14px] border px-3.5 py-3 text-white ${
          live ? 'border-red-400/45' : 'border-amber-400/45'
        }`}
        data-testid="home-tournament-banner"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <TicketKicker live={Boolean(live)} />
          <span className="home-display truncate text-[22px] font-semibold uppercase leading-none">{tournament.title}</span>
          <span className="truncate text-xs text-white/75">
            <b className="text-white">{lead}</b> · {rest}
          </span>
        </span>
        <TicketButton tournament={tournament} live={Boolean(live)} label={live ? 'Suivre' : 'Voir'} />
      </div>
    </section>
  )
}

// ── Section « En ce moment et à venir » ─────────────────────────────────────────────────────────────

function LiveTournamentBlock({ tournament, now }: { tournament: HomeRankedTournament; now: Date }) {
  const details = [
    tournamentFormatLabel(tournament),
    tournamentDates(tournament),
    tournament.participantCount > 0 ? `${participantCountLabel(tournament.mode, tournament.participantCount)} en lice` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="relative grid overflow-hidden rounded-[18px] border border-red-500/40 bg-cover bg-center text-white md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
      style={{ backgroundImage: `url('${tournamentImage(tournament.mapName)}')`, backgroundColor: '#0b1120' }}
      data-testid="home-tournament-live"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[rgb(20_6_8/0.96)] via-[rgb(20_6_8/0.85)] to-[rgb(20_6_8/0.72)]" aria-hidden="true" />
      <div className="relative flex flex-col gap-3 p-5 lg:p-7">
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-red-400/50 bg-red-500/20 px-2.5 py-0.5 text-xs font-bold text-red-100">
          <LiveDot />
          En direct
        </span>
        <h3 className="home-display m-0 text-[34px] font-semibold uppercase leading-[0.92] lg:text-[44px]">{tournament.title}</h3>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-white/80">
          <TournamentModeBadge mode={tournament.mode} onImage />
          {details}
        </span>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <b className="home-display text-[26px] font-semibold leading-none">{roundCountLabel(tournament.roundCount)}</b>
          {tournament.lastRoundAt ? (
            <span className="home-display text-lg leading-none text-white/70">dernière manche {elapsedLabel(tournament.lastRoundAt, now)}</span>
          ) : null}
        </span>
        <Link
          href={tournamentHref(tournament)}
          className="mt-1 inline-flex h-10 items-center gap-1.5 self-start rounded-[10px] bg-red-500 px-4 text-sm font-bold text-white hover:bg-red-400"
        >
          Suivre le classement
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <LeadersPanel title="Classement en cours" leaders={tournament.leaders} empty="Aucun point marqué pour l’instant." />
    </div>
  )
}

/** Trois premiers d'un classement, sur la photo d'un bloc sombre (direct ou résultats). */
function LeadersPanel({ title, leaders, empty }: { title: string; leaders: HomeRankedTournament['leaders']; empty: string }) {
  return (
    <div className="relative flex flex-col justify-center gap-2 p-5 pt-0 md:pt-5 lg:p-7">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">{title}</span>
      {leaders.length === 0 ? (
        <span className="text-sm text-white/70">{empty}</span>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {leaders.map((leader, index) => (
            <li
              key={leader.key}
              className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border px-3 py-2 ${
                index === 0 ? 'border-amber-400/50 bg-amber-400/10' : 'border-white/10 bg-slate-950/55'
              }`}
            >
              <RankCell rank={index + 1} />
              <b className="truncate text-sm">{leader.label}</b>
              <span className="whitespace-nowrap text-sm font-bold tabular-nums">
                {formatTournamentPoints(leader.points)} <span className="text-[11px] font-semibold text-white/60">pts</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Tournoi terminé depuis moins de `HOME_RESULTS_WINDOW_DAYS` jours : vainqueur et podium final, en or. */
function ResultsTournamentBlock({ tournament }: { tournament: HomeRankedTournament }) {
  const winner = tournament.leaders[0]
  const details = [tournamentFormatLabel(tournament), tournamentDates(tournament), roundCountLabel(tournament.roundCount)].join(' · ')

  return (
    <div
      className="relative grid overflow-hidden rounded-[18px] border border-amber-400/45 bg-cover bg-center text-white md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
      style={{ backgroundImage: `url('${tournamentImage(tournament.mapName)}')`, backgroundColor: '#0b1120' }}
      data-testid="home-tournament-results"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-[rgb(20_13_5/0.96)] via-[rgb(20_13_5/0.86)] to-[rgb(20_13_5/0.72)]" aria-hidden="true" />
      <div className="relative flex flex-col gap-3 p-5 lg:p-7">
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-amber-400/50 bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-200">
          <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
          Terminé · résultats
        </span>
        <h3 className="home-display m-0 text-[34px] font-semibold uppercase leading-[0.92] lg:text-[44px]">{tournament.title}</h3>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px] text-white/80">
          <TournamentModeBadge mode={tournament.mode} onImage />
          {details}
        </span>
        {winner ? (
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="home-display text-lg leading-none text-white/70">Vainqueur</span>
            <b className="home-display text-[26px] font-semibold leading-none text-amber-400">{winner.label}</b>
          </span>
        ) : null}
        <Link
          href={tournamentHref(tournament)}
          className="mt-1 inline-flex h-10 items-center gap-1.5 self-start rounded-[10px] bg-amber-400 px-4 text-sm font-bold text-amber-950 hover:bg-amber-300"
        >
          Voir le classement final
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <LeadersPanel title="Classement final" leaders={tournament.leaders} empty="Aucun point marqué." />
    </div>
  )
}

function CountdownPill({ label, first, onImage = false }: { label: string; first: boolean; onImage?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
        first ? 'bg-amber-400 text-amber-950' : onImage ? 'bg-slate-950/70 text-white' : 'app-panel-muted text-gray-700'
      }`}
    >
      {label}
    </span>
  )
}

/** Carte d'un tournoi à venir ; `wide` : seul tournoi de la rangée, photo à gauche et texte à droite, sur toute la largeur. */
function UpcomingCard({ tournament, first, now, wide = false }: { tournament: HomeTournament; first: boolean; now: Date; wide?: boolean }) {
  const date = dateParts(tournament.startDate)
  const startsIn = countdownLabel(tournament.startDate, now)
  return (
    <article
      className={`app-panel flex flex-col overflow-hidden p-0 ${wide ? 'md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : ''}`}
      data-testid="home-tournament-card"
    >
      <div
        className={`relative bg-cover bg-center text-white ${wide ? 'h-[104px] md:h-auto md:min-h-[168px]' : 'h-[104px]'}`}
        style={{ backgroundImage: `url('${tournamentImage(tournament.mapName)}')`, backgroundColor: '#0b1120' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 to-slate-950/15" aria-hidden="true" />
        <TournamentModeBadge mode={tournament.mode} onImage className="absolute left-3 top-3" />
        {startsIn ? (
          <span className="absolute right-3 top-3">
            <CountdownPill label={startsIn} first={first} onImage />
          </span>
        ) : null}
        <span className={`home-display absolute flex items-baseline gap-1.5 leading-none ${wide ? 'bottom-2 left-3 md:bottom-3 md:left-4' : 'bottom-2 left-3'}`}>
          <span className="text-sm text-white/80">{date.weekday}</span>
          <span className={`font-semibold ${wide ? 'text-[34px] md:text-[48px]' : 'text-[34px]'}`}>{date.day}</span>
          <span className="text-sm text-white/80">{date.month}</span>
        </span>
      </div>
      <div className={`flex flex-1 flex-col gap-1 p-4 ${wide ? 'md:justify-center md:gap-1.5 md:px-6 md:py-5' : ''}`}>
        <h3 className={`home-display m-0 font-semibold uppercase leading-none ${wide ? 'text-[26px] md:text-[34px]' : 'text-[26px]'}`}>
          {tournament.title}
        </h3>
        <span className="text-[13px] text-gray-700">
          {tournamentFormatLabel(tournament)} · {tournamentDates(tournament)}
        </span>
        <span className="text-xs text-gray-500">{organizerLabel(tournament)}</span>
        <Link href={tournamentHref(tournament)} className={`home-link self-start pt-2 text-sm font-semibold ${wide ? '' : 'mt-auto'}`}>
          Voir le tournoi →
        </Link>
      </div>
    </article>
  )
}

function UpcomingAgendaRow({ tournament, first, now }: { tournament: HomeTournament; first: boolean; now: Date }) {
  const date = dateParts(tournament.startDate)
  const startsIn = countdownLabel(tournament.startDate, now)
  return (
    <li>
      <Link
        href={tournamentHref(tournament)}
        className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-gray-50"
        data-testid="home-tournament-row"
      >
        <span className="app-panel-muted flex w-12 shrink-0 flex-col items-center py-1 leading-none">
          <span className="text-[11px] font-semibold text-gray-500">{date.weekday}</span>
          <span className="home-display text-[26px] font-semibold">{date.day}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-bold text-gray-900">{tournament.title}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            <TournamentModeBadge mode={tournament.mode} className="shrink-0" />
            <span className="truncate text-xs text-gray-500">
              {tournamentFormatLabel(tournament)} · {tournamentDates(tournament)}
            </span>
          </span>
        </span>
        {startsIn ? <CountdownPill label={startsIn} first={first} /> : null}
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
      </Link>
    </li>
  )
}

/** Trois tournois à venir par page : au-delà, chevrons et « 1 / 2 » comme le carrousel des Chicken Dinners. */
const UPCOMING_PAGE_SIZE = 3
const UPCOMING_COLUMNS: Record<number, string> = { 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3' }

/**
 * Tournois à venir : la rangée de cartes s'adapte à leur nombre (une carte en largeur, deux ou trois colonnes), puis
 * garde trois colonnes d'une page à l'autre pour que les cartes ne changent pas de taille. `footer` (rappel « pas
 * d'inscription ») partage la ligne des chevrons.
 */
function UpcomingTournaments({ tournaments, now, footer }: { tournaments: HomeTournament[]; now: Date; footer: ReactNode }) {
  const [page, setPage] = useState(1)
  const { current, pageCount, start, visible } = paginate(tournaments, page, UPCOMING_PAGE_SIZE)
  const columns = Math.min(tournaments.length, UPCOMING_PAGE_SIZE)

  return (
    <>
      <div className={`hidden gap-3.5 md:grid ${UPCOMING_COLUMNS[columns]}`} data-testid="home-tournament-cards">
        {visible.map((tournament, index) => (
          <UpcomingCard key={tournament.id} tournament={tournament} first={start + index === 0} now={now} wide={columns === 1} />
        ))}
      </div>
      <ul className="app-panel m-0 list-none divide-y divide-gray-200 overflow-hidden p-0 md:hidden">
        {visible.map((tournament, index) => (
          <UpcomingAgendaRow key={tournament.id} tournament={tournament} first={start + index === 0} now={now} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {footer}
        {pageCount > 1 ? (
          <nav aria-label="Pages des prochains tournois" className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(current - 1)}
              disabled={current === 1}
              aria-label="Tournois précédents"
              className="home-carousel-btn disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="home-display min-w-[54px] text-center text-[22px] text-gray-500" aria-live="polite">
              {current} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage(current + 1)}
              disabled={current === pageCount}
              aria-label="Tournois suivants"
              className="home-carousel-btn disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </div>
    </>
  )
}

function NoSignUpNote() {
  return (
    <p className="m-0 flex items-start gap-2 text-[13px] text-gray-500">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      Pas d’inscription : joue tes parties personnalisées pendant les dates, elles sont comptées automatiquement.
    </p>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1.5">
        <span className="home-gold text-xs font-bold uppercase tracking-[0.14em]">Tournois · Zéro inscription</span>
        <h2 id="home-tournaments-title" className="home-display m-0 text-[38px] font-semibold uppercase leading-[0.95] lg:text-[56px]">
          {title}
        </h2>
      </div>
      <Link href="/tournaments" className="app-panel inline-flex h-10 items-center gap-1.5 px-3.5 text-sm font-semibold text-gray-900 hover:bg-gray-50">
        Tous les tournois
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  )
}

export function HomeTournamentsSection({ data, now }: { data: HomeTournamentsPayload | null; now: Date }) {
  // Fenêtres de la vitrine (home-tournaments.ts) : direct, début dans 14 jours, fin depuis moins de 3 jours. Rien sinon.
  if (!data || !hasHomeTournaments(data)) return null

  const upcoming = data.upcoming
  const hasLive = data.live.length > 0
  const hasResults = data.results.length > 0
  const title = hasLive
    ? 'En ce moment et à venir'
    : upcoming.length > 0
      ? hasResults
        ? 'Résultats et prochains tournois'
        : 'Prochains tournois'
      : 'Derniers résultats'

  return (
    <section className="px-4 pt-10 md:px-8 md:pt-16 lg:px-14 lg:pt-20" aria-labelledby="home-tournaments-title" data-testid="home-tournaments">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
        <SectionHeader title={title} />

        {/* Plusieurs directs à la fois : le plus animé d'abord, les autres dans la même forme. */}
        {data.live.map((tournament) => (
          <LiveTournamentBlock key={tournament.id} tournament={tournament} now={now} />
        ))}

        {data.results.map((tournament) => (
          <ResultsTournamentBlock key={tournament.id} tournament={tournament} />
        ))}

        {upcoming.length > 0 ? (
          <UpcomingTournaments tournaments={upcoming} now={now} footer={<NoSignUpNote />} />
        ) : hasLive ? (
          <NoSignUpNote />
        ) : null}
      </div>
    </section>
  )
}
