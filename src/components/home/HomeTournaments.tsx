'use client'

import { ArrowRight, CalendarClock, ChevronRight, Info } from 'lucide-react'
import Link from 'next/link'

import TournamentModeBadge from '@/components/tournaments/TournamentModeBadge'
import { organizerLabel, tournamentDates, tournamentFormatLabel } from '@/components/tournaments/TournamentListSections'
import RankCell from '@/components/ui/RankCell'
import {
  roundCountLabel,
  type HomeLiveTournament,
  type HomeTournament,
  type HomeTournamentsPayload,
} from '@/lib/home-tournaments'
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
 * les Chicken Dinners. Le direct est sombre par construction (photo de la carte) ; les tournois à venir suivent le
 * thème, en cartes à partir de 768 px et en agenda en dessous.
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

function liveSubline(tournament: HomeLiveTournament) {
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

function LiveTournamentBlock({ tournament, now }: { tournament: HomeLiveTournament; now: Date }) {
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

      <div className="relative flex flex-col justify-center gap-2 p-5 pt-0 md:pt-5 lg:p-7">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">Classement en cours</span>
        {tournament.leaders.length === 0 ? (
          <span className="text-sm text-white/70">Aucun point marqué pour l’instant.</span>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {tournament.leaders.map((leader, index) => (
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

function UpcomingCard({ tournament, first, now }: { tournament: HomeTournament; first: boolean; now: Date }) {
  const date = dateParts(tournament.startDate)
  const startsIn = countdownLabel(tournament.startDate, now)
  return (
    <article className="app-panel flex flex-col overflow-hidden p-0" data-testid="home-tournament-card">
      <div
        className="relative h-[104px] bg-cover bg-center text-white"
        style={{ backgroundImage: `url('${tournamentImage(tournament.mapName)}')`, backgroundColor: '#0b1120' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 to-slate-950/15" aria-hidden="true" />
        <TournamentModeBadge mode={tournament.mode} onImage className="absolute left-3 top-3" />
        {startsIn ? (
          <span className="absolute right-3 top-3">
            <CountdownPill label={startsIn} first={first} onImage />
          </span>
        ) : null}
        <span className="home-display absolute bottom-2 left-3 flex items-baseline gap-1.5 leading-none">
          <span className="text-sm text-white/80">{date.weekday}</span>
          <span className="text-[34px] font-semibold">{date.day}</span>
          <span className="text-sm text-white/80">{date.month}</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="home-display m-0 text-[26px] font-semibold uppercase leading-none">{tournament.title}</h3>
        <span className="text-[13px] text-gray-700">
          {tournamentFormatLabel(tournament)} · {tournamentDates(tournament)}
        </span>
        <span className="text-xs text-gray-500">{organizerLabel(tournament)}</span>
        <Link href={tournamentHref(tournament)} className="home-link mt-auto self-start pt-2 text-sm font-semibold">
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

export function HomeTournamentsSection({
  data,
  loading,
  now,
}: {
  data: HomeTournamentsPayload | null
  loading: boolean
  now: Date
}) {
  if (!data) {
    if (!loading) return null
    // Réserve la place pendant la lecture : la section arrive avant les Chicken Dinners, sans faire sauter la page.
    return (
      <section className="px-4 pt-10 md:px-8 md:pt-16 lg:px-14 lg:pt-20" aria-label="Tournois" aria-busy="true">
        <div className="app-panel mx-auto min-h-[260px] max-w-[1200px] animate-pulse motion-reduce:animate-none" />
      </section>
    )
  }

  const [live, ...otherLive] = data.live
  const upcoming = data.upcoming.slice(0, 3)
  const hasAny = data.live.length > 0 || upcoming.length > 0
  const title = live ? 'En ce moment et à venir' : upcoming.length > 0 ? 'Prochains tournois' : 'Tournois'

  return (
    <section className="px-4 pt-10 md:px-8 md:pt-16 lg:px-14 lg:pt-20" aria-labelledby="home-tournaments-title" data-testid="home-tournaments">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
        <SectionHeader title={title} />

        {live ? <LiveTournamentBlock tournament={live} now={now} /> : null}
        {/* Plusieurs directs à la fois : le plus animé en grand, les autres dans la même forme, plus petite. */}
        {otherLive.map((tournament) => (
          <LiveTournamentBlock key={tournament.id} tournament={tournament} now={now} />
        ))}

        {upcoming.length > 0 ? (
          <>
            <div className="hidden gap-3.5 md:grid md:grid-cols-3">
              {upcoming.map((tournament, index) => (
                <UpcomingCard key={tournament.id} tournament={tournament} first={index === 0} now={now} />
              ))}
            </div>
            <ul className="app-panel m-0 list-none divide-y divide-gray-200 overflow-hidden p-0 md:hidden">
              {upcoming.map((tournament, index) => (
                <UpcomingAgendaRow key={tournament.id} tournament={tournament} first={index === 0} now={now} />
              ))}
            </ul>
          </>
        ) : null}

        {!hasAny ? (
          <div className="app-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between lg:p-5" data-testid="home-tournaments-empty">
            <div className="flex items-start gap-3">
              <span className="app-panel-muted grid h-10 w-10 shrink-0 place-items-center" aria-hidden="true">
                <CalendarClock className="h-5 w-5 text-gray-500" />
              </span>
              <div className="flex flex-col gap-0.5">
                <p className="m-0 text-[15px] font-bold text-gray-900">Aucun tournoi prévu pour l’instant.</p>
                <p className="m-0 text-sm text-gray-500">
                  {data.lastWinner ? (
                    <>
                      Dernier vainqueur : <b className="text-gray-900">{data.lastWinner.label}</b>, {data.lastWinner.title}.{' '}
                    </>
                  ) : null}
                  Les prochains tournois s’afficheront ici dès leur création.
                </p>
              </div>
            </div>
            <Link href="/tournaments" className="home-link shrink-0 text-sm font-semibold">
              Voir les tournois terminés →
            </Link>
          </div>
        ) : (
          <p className="m-0 flex items-start gap-2 text-[13px] text-gray-500">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Pas d’inscription : joue tes parties personnalisées pendant les dates, elles sont comptées automatiquement.
          </p>
        )}
      </div>
    </section>
  )
}
