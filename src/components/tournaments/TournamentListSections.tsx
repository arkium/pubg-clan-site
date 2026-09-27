'use client'

import { ChevronDown, CircleHelp } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useState } from 'react'

import TournamentModeBadge, { TOURNAMENT_MODE_ICONS, tournamentModeClass } from '@/components/tournaments/TournamentModeBadge'
import RankCell from '@/components/ui/RankCell'
import { mapAssetUrl } from '@/lib/pubg-assets/map-asset'
import { tournamentGameModeLabel, tournamentMapLabel } from '@/lib/tournament-filters'
import { TOURNAMENT_MODE_DESCRIPTIONS, TOURNAMENT_QUICK_GUIDE } from '@/lib/tournament-guide'
import {
  TOURNAMENT_MODE_DISPLAY,
  countdownLabel,
  elapsedLabel,
  formatTournamentPoints,
  isViewerParticipant,
  viewerPosition,
  viewerSentence,
  type TournamentViewer,
} from '@/lib/tournament-mode-display'
import type { TournamentOverview, TournamentStandingSummary } from '@/lib/tournament-overview'
import type { TournamentMode } from '@/lib/tournament-service'

/** Blocs de la liste `/tournaments` (maquette « Tournois », 2026-09-27 — docs/features/tournois.md). */

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

/** « 22 sept. → 28 sept. », un seul jour s'il n'y en a qu'un. */
export function tournamentDates(tournament: Pick<TournamentOverview, 'startDate' | 'endDate'>) {
  const start = dayMonth.format(new Date(tournament.startDate))
  const end = dayMonth.format(new Date(tournament.endDate))
  return start === end ? start : `${start} → ${end}`
}

/**
 * « Squad (partie perso) · Erangel » : format PUBG et carte imposés. Sans format imposé : « Tous formats », pas
 * « Tous les modes » — sur ces pages, le **mode** est celui du tournoi (Inter-clans, Solo…).
 */
export function tournamentFormatLabel(tournament: Pick<TournamentOverview, 'gameMode' | 'mapName'>) {
  const format = tournament.gameMode ? tournamentGameModeLabel(tournament.gameMode) : 'Tous formats'
  return `${format} · ${tournamentMapLabel(tournament.mapName)}`
}

export function organizerLabel(tournament: Pick<TournamentOverview, 'organizerClan'>) {
  const clan = tournament.organizerClan
  if (!clan) return 'Organisateur inconnu'
  return `Organisé par ${clan.tag ? `[${clan.tag}] ` : ''}${clan.name}`
}

/** Image d'un tournoi : sa carte imposée, sinon l'image des matchs. */
function tournamentImage(mapName: string | null) {
  return mapAssetUrl(mapName) ?? '/matches.jpg'
}

// ── Cartes de mode : légende et filtre ──────────────────────────────────────────────────────────────

export function TournamentModeCards({
  counts,
  value,
  onChange,
}: {
  counts: Record<TournamentMode, number>
  value: TournamentMode | null
  onChange: (mode: TournamentMode | null) => void
}) {
  return (
    <section aria-label="Modes de tournoi" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {TOURNAMENT_MODE_DESCRIPTIONS.map(({ value: mode }) => {
        const display = TOURNAMENT_MODE_DISPLAY[mode]
        const Icon = TOURNAMENT_MODE_ICONS[mode]
        const active = value === mode
        return (
          <button
            key={mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : mode)}
            className={`${tournamentModeClass(mode)} flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
              active
                ? 'border-[var(--tmode)] bg-[var(--tmode-soft)] shadow-[0_0_0_3px_var(--tmode-soft)]'
                : 'app-panel hover:border-[var(--tmode-ring)]'
            }`}
          >
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[var(--tmode-soft)]">
              <Icon className="h-[18px] w-[18px] text-[var(--tmode)]" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col">
              <b className="text-[13px] text-gray-900">{display.label}</b>
              <span className="truncate text-[11px] text-gray-500">
                <span className="max-sm:hidden">{display.ranks}</span>
                <span className="sm:hidden">{display.ranks.replace(/^classe /, '')}</span>
              </span>
            </span>
            <span className="ml-auto text-xs font-extrabold tabular-nums text-gray-500">{counts[mode]}</span>
          </button>
        )
      })}
    </section>
  )
}

// ── En direct ───────────────────────────────────────────────────────────────────────────────────────

function leaderSubline(leader: TournamentStandingSummary) {
  return `${leader.totalKills} kills · ${leader.wins} Top 1`
}

export function LiveTournamentCard({
  tournament,
  viewer,
  now,
}: {
  tournament: TournamentOverview
  viewer: TournamentViewer
  now: Date
}) {
  const unit = TOURNAMENT_MODE_DISPLAY[tournament.mode].unit
  const endsIn = countdownLabel(tournament.endDate, now)
  const position = viewerPosition(tournament.standings, viewer, tournament.mode)

  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      aria-label={`${tournament.title}, en direct : suivre le classement`}
      className="relative grid overflow-hidden rounded-[18px] border border-red-400/50 bg-slate-950 bg-cover bg-center text-white shadow-[0_0_0_4px_rgb(239_68_68/0.12)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
      style={{ backgroundImage: `url('${tournamentImage(tournament.mapName)}')` }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-950/55" />
      <div className="relative flex flex-col gap-3 p-[18px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-0.5 text-[11px] font-black tracking-[0.1em]">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-white" aria-hidden="true" />
            EN DIRECT
          </span>
          <TournamentModeBadge mode={tournament.mode} onImage />
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold">{tournamentFormatLabel(tournament)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <b className="text-[22px] font-black leading-tight tracking-[-0.02em] lg:text-[28px]">{tournament.title}</b>
          <span className="text-[13px] text-white/75">
            {organizerLabel(tournament)} · {tournamentDates(tournament)}
            {endsIn ? ` · se termine ${endsIn}` : ''}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-[18px] gap-y-1 tabular-nums">
          <span>
            <b className="text-[22px]">{tournament.roundCount}</b>{' '}
            <span className="text-xs text-white/70">manche{tournament.roundCount > 1 ? 's' : ''}</span>
          </span>
          <span>
            <b className="text-[22px]">{tournament.participantCount}</b>{' '}
            <span className="text-xs text-white/70">{tournament.participantCount > 1 ? unit.many : unit.one}</span>
          </span>
          {tournament.lastRoundAt ? (
            <span>
              <b className="text-[22px]">{elapsedLabel(tournament.lastRoundAt, now)}</b>{' '}
              <span className="text-xs text-white/70">dernière manche</span>
            </span>
          ) : null}
        </div>
        <span className="inline-flex h-[34px] items-center self-start rounded-[9px] bg-red-500 px-3.5 text-[13px] font-extrabold">
          Suivre le classement →
        </span>
      </div>

      <div className="relative flex flex-col justify-center gap-2 p-[18px] pt-0 lg:pt-[18px]">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/70">Classement en cours</span>
        {tournament.leaders.length === 0 ? (
          <span className="text-sm text-white/70">Aucune manche comptabilisée pour l’instant.</span>
        ) : (
          tournament.leaders.map((leader, index) => {
            const mine = isViewerParticipant(leader.participant, viewer)
            return (
              <div
                key={leader.key}
                className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border px-2.5 py-2 ${
                  mine ? 'border-indigo-300/70 bg-indigo-400/20' : 'border-white/10 bg-slate-950/55'
                }`}
              >
                <RankCell rank={index + 1} />
                <span className="flex min-w-0 flex-col">
                  <b className="truncate text-sm">{leader.label}</b>
                  <span className="text-[11px] text-white/65">{leaderSubline(leader)}</span>
                </span>
                <b className="text-lg tabular-nums">
                  {formatTournamentPoints(leader.totalPoints)}
                  <span className="text-[11px] font-semibold text-white/60"> pts</span>
                </b>
              </div>
            )
          })
        )}
        {position ? <span className="text-xs font-bold text-red-300">{viewerSentence(position)}</span> : null}
      </div>
    </Link>
  )
}

// ── À venir ─────────────────────────────────────────────────────────────────────────────────────────

export function UpcomingTournamentCard({ tournament, now }: { tournament: TournamentOverview; now: Date }) {
  const startsIn = tournament.phase === 'draft' ? 'Brouillon' : countdownLabel(tournament.startDate, now)
  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      className={`${tournamentModeClass(tournament.mode)} app-panel flex flex-col overflow-hidden p-0! text-gray-900 transition-colors hover:border-[var(--tmode)]`}
    >
      <div
        className="relative h-[78px] bg-slate-950 bg-cover bg-center"
        style={{ backgroundImage: `url('${tournamentImage(tournament.mapName)}')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 to-slate-950/20" />
        <TournamentModeBadge mode={tournament.mode} onImage className="absolute left-2.5 top-2.5" />
        {startsIn ? (
          <span className="absolute bottom-2 right-2.5 rounded-md bg-sky-500 px-2 py-0.5 text-xs font-black tabular-nums text-white">
            {startsIn}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 px-3.5 py-3">
        <b className="text-[15px]">{tournament.title}</b>
        <span className="text-xs text-gray-500">
          {tournamentFormatLabel(tournament)} · {tournamentDates(tournament)}
        </span>
        <span className="text-xs text-gray-700">{organizerLabel(tournament)}</span>
      </div>
    </Link>
  )
}

// ── Palmarès ────────────────────────────────────────────────────────────────────────────────────────

/** Sous-ligne du vainqueur, selon ce que le mode classe. */
export function winnerSubline(tournament: TournamentOverview, viewer: TournamentViewer) {
  const winner = tournament.winner
  if (!winner) return ''
  const mine = isViewerParticipant(winner.participant, viewer)
  switch (tournament.mode) {
    case 'inter_clan':
      return mine ? 'ton clan' : `${tournament.clanCount} clan${tournament.clanCount > 1 ? 's' : ''} en lice`
    case 'solo_ffa':
      return mine ? 'toi' : `${winner.totalKills} kills`
    case 'custom_teams':
      return winner.clanIds.length > 1 ? `équipe mixte de ${winner.clanIds.length} clans` : 'équipe d’un seul clan'
    case 'intra_clan':
      return tournament.organizerClan ? `escouade de ${tournament.organizerClan.name}` : 'escouade du clan'
  }
}

export function TournamentPalmares({ tournaments, viewer }: { tournaments: TournamentOverview[]; viewer: TournamentViewer }) {
  return (
    <div className="app-table-shell overflow-hidden">
      {tournaments.map((tournament) => {
        const Icon = TOURNAMENT_MODE_ICONS[tournament.mode]
        return (
          <Link
            key={tournament.id}
            href={`/tournaments/${tournament.id}`}
            className={`${tournamentModeClass(tournament.mode)} grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b border-gray-200 px-3.5 py-2.5 last:border-b-0 hover:bg-gray-50 md:grid-cols-[34px_minmax(0,1.2fr)_minmax(0,1.4fr)_80px]`}
          >
            <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-[var(--tmode-soft)]" title={TOURNAMENT_MODE_DISPLAY[tournament.mode].label}>
              <Icon className="h-4 w-4 text-[var(--tmode)]" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col">
              <b className="truncate text-sm text-gray-900">{tournament.title}</b>
              <span className="truncate text-[11px] text-gray-500">
                {TOURNAMENT_MODE_DISPLAY[tournament.mode].label} · {tournamentDates(tournament)} · {tournament.roundCount} manche
                {tournament.roundCount > 1 ? 's' : ''}
              </span>
            </span>
            {tournament.winner ? (
              <span className="flex min-w-0 items-center gap-2">
                <RankCell rank={1} size="sm" />
                <span className="flex min-w-0 flex-col">
                  <b className="truncate text-[13px] text-gray-900">{tournament.winner.label}</b>
                  <span className="truncate text-[11px] text-gray-500">{winnerSubline(tournament, viewer)}</span>
                </span>
              </span>
            ) : (
              <span className="text-xs text-gray-500">Classement indisponible</span>
            )}
            <b className="text-right text-sm tabular-nums text-gray-900 max-md:hidden">
              {tournament.winner ? `${formatTournamentPoints(tournament.winner.totalPoints)} pts` : '–'}
            </b>
          </Link>
        )
      })}
    </div>
  )
}

// ── Comment ça marche ? ─────────────────────────────────────────────────────────────────────────────

/** Rend les mots entre `**` en gras, sans autre balisage. */
function withBold(line: string) {
  return line.split('**').map((part, index) => (index % 2 === 1 ? <b key={index}>{part}</b> : <Fragment key={index}>{part}</Fragment>))
}

export function TournamentQuickGuide() {
  const [open, setOpen] = useState(false)
  return (
    <section className="app-panel flex flex-col gap-2.5 px-4 py-3.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-2 text-left"
      >
        <CircleHelp className="h-4 w-4 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
        <b className="text-[15px] text-gray-900">Comment ça marche ?</b>
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[var(--theme-ui-accent-text)]">
          {open ? 'Masquer' : 'Afficher'}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-gray-700">
          {TOURNAMENT_QUICK_GUIDE.map((line) => (
            <li key={line}>{withBold(line)}</li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

