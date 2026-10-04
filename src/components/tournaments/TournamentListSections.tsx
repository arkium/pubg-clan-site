'use client'

import { ChevronDown, CircleHelp, Clock, PencilLine } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useEffect, useRef, useState } from 'react'

import TournamentModeBadge, { TOURNAMENT_MODE_ICONS, tournamentModeClass } from '@/components/tournaments/TournamentModeBadge'
import RankCell from '@/components/ui/RankCell'
import { mapAssetUrl } from '@/lib/pubg-assets/map-asset'
import { tournamentGameModeLabel, tournamentMapLabel } from '@/lib/tournament-filters'
import { TOURNAMENT_MODE_DESCRIPTIONS, TOURNAMENT_QUICK_GUIDE } from '@/lib/tournament-guide'
import { TOURNAMENT_STATUS_OPTIONS, type TournamentStatusFilter } from '@/lib/tournament-list-filters'
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

/**
 * Blocs de la liste `/tournaments` (maquette « Tournois », 2026-09-27 — docs/features/tournois.md), selon la charte UI
 * (docs/ui/index.html, 04/10/2026) : couleurs de mode par `tournamentModeClass` (jetons `--tmode`), « en direct » en
 * accent plein (charte §1.2), « à venir » en orange d'attente (`--game-warn`, §1.3), terminé neutre ; chiffres mis en
 * avant en Teko (`t-hero`), rangs par `RankCell`, ligne du lecteur `.tournament-row--viewer`.
 */

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

// ── Statut, bandeau docké sur mobile ────────────────────────────────────────────────────────────────

/**
 * Statut en menu (`app-menu-trigger`), pour le bandeau docké sur mobile : recherche et statut y tiennent sur une seule
 * ligne (charte §6 : pas de bandeau sur deux lignes). Au repos et sur ordinateur, le segmented reste affiché.
 */
export function TournamentStatusMenu({
  value,
  onChange,
}: {
  value: TournamentStatusFilter
  onChange: (value: TournamentStatusFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const current = TOURNAMENT_STATUS_OPTIONS.find((option) => option.value === value) ?? TOURNAMENT_STATUS_OPTIONS[0]
  return (
    // Étiré à la hauteur de la ligne du bandeau : même hauteur que le champ de recherche voisin.
    <div ref={rootRef} className="relative flex shrink-0 self-stretch">
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Statut : ${current.label}`}
        className={`app-menu-trigger ${value !== 'all' ? 'app-menu-trigger--active' : ''}`}
      >
        {current.label}
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Statut" className="app-menu absolute right-0 top-full z-50 mt-1.5 w-[11rem]">
          {TOURNAMENT_STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className={`app-menu__item ${option.value === value ? 'app-menu__item--active' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ── Cartes de mode : légende et filtre ──────────────────────────────────────────────────────────────

/**
 * Une carte par mode, à la couleur du mode (`--tmode`, identité documentée — docs/ui/index.html#tournois) : choisie,
 * elle prend le liseré et le fond doux de son mode. Inactive, c'est un `.app-panel` ; `!` sur le survol, sans quoi la
 * bordure de la classe globale l'emporte sur l'utilitaire.
 */
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
                : 'app-panel hover:border-[var(--tmode-ring)]!'
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
            <span className={`t-num ml-auto text-xs font-extrabold ${active ? 'text-[var(--tmode-text)]' : 'text-gray-500'}`}>{counts[mode]}</span>
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
      // Carte illustrée, toujours sombre (`.app-on-photo`, blancs permis) ; « en direct » = accent (charte §1.2) : liseré,
      // halo et pastille pleine. Rayon de carte 14.
      className="app-on-photo bg-photo-fallback group relative grid overflow-hidden rounded-[14px] border border-[var(--theme-ui-accent-ring)] bg-cover bg-center text-white shadow-[0_0_0_4px_var(--theme-ui-accent-soft)] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
      style={{ backgroundImage: `url('${tournamentImage(tournament.mapName)}')` }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-950/55" />
      <div className="relative flex flex-col gap-3.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Accent plein, encre sombre (jamais de blanc sur le jaune) : la seule pastille pleine de la carte. */}
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--theme-ui-accent)] px-2.5 py-0.5 text-[11px] font-black tracking-[0.1em] text-slate-950">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-slate-950 motion-reduce:animate-none" aria-hidden="true" />
            EN DIRECT
          </span>
          <TournamentModeBadge mode={tournament.mode} onImage />
          <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold">{tournamentFormatLabel(tournament)}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {/* Titre posé sur la photo : Teko, comme le titre d'une bannière. */}
          <b className="t-banner-title drop-shadow-md">{tournament.title}</b>
          <span className="text-[13px] text-white/75">
            {organizerLabel(tournament)} · {tournamentDates(tournament)}
            {endsIn ? ` · se termine ${endsIn}` : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="flex items-baseline gap-1.5">
            <b className="t-hero t-hero--sm">{tournament.roundCount}</b>
            <span className="text-xs text-white/70">manche{tournament.roundCount > 1 ? 's' : ''}</span>
          </span>
          <span className="flex items-baseline gap-1.5">
            <b className="t-hero t-hero--sm">{tournament.participantCount}</b>
            <span className="text-xs text-white/70">{tournament.participantCount > 1 ? unit.many : unit.one}</span>
          </span>
          {tournament.lastRoundAt ? (
            <span className="flex items-baseline gap-1.5">
              <b className="t-hero t-hero--sm">{elapsedLabel(tournament.lastRoundAt, now)}</b>
              <span className="text-xs text-white/70">dernière manche</span>
            </span>
          ) : null}
        </div>
        {/* Toute la carte est le lien : bouton fantôme sur la photo, la pastille « en direct » garde l'accent plein. */}
        <span className="inline-flex min-h-[34px] items-center self-start rounded-lg border border-white/25 bg-white/10 px-3.5 text-[13px] font-extrabold transition-colors group-hover:bg-white/20">
          Suivre le classement →
        </span>
      </div>

      <div className="relative flex flex-col justify-center gap-2 p-4 pt-0 lg:pt-4">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-white/70">Classement en cours</span>
        {tournament.leaders.length === 0 ? (
          <span className="text-sm text-white/70">Aucune manche comptabilisée pour l’instant.</span>
        ) : (
          tournament.leaders.map((leader, index) => {
            const mine = isViewerParticipant(leader.participant, viewer)
            return (
              <div
                key={leader.key}
                // Ligne du lecteur : `.tournament-row--viewer` (fond accent doux + liseré 3 px), plus d'indigo.
                className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[10px] border px-2.5 py-2 ${
                  mine ? 'tournament-row--viewer border-[var(--theme-ui-accent-ring)]' : 'border-white/10 bg-slate-950/55'
                }`}
              >
                <RankCell rank={index + 1} />
                <span className="flex min-w-0 flex-col">
                  <b className="truncate text-sm">{leader.label}</b>
                  <span className="text-[11px] text-white/65">{leaderSubline(leader)}</span>
                </span>
                <span className="flex items-baseline gap-1 whitespace-nowrap">
                  <b className="t-hero t-hero--sm">{formatTournamentPoints(leader.totalPoints)}</b>
                  <span className="text-[11px] font-semibold text-white/60">pts</span>
                </span>
              </div>
            )
          })
        )}
        {position ? <span className="text-xs font-bold text-[var(--theme-ui-accent)]">{viewerSentence(position)}</span> : null}
      </div>
    </Link>
  )
}

// ── À venir ─────────────────────────────────────────────────────────────────────────────────────────

export function UpcomingTournamentCard({ tournament, now }: { tournament: TournamentOverview; now: Date }) {
  const draft = tournament.phase === 'draft'
  const startsIn = draft ? 'Brouillon' : countdownLabel(tournament.startDate, now)
  return (
    <Link
      href={`/tournaments/${tournament.id}`}
      // `!` sur le survol : la bordure de `.app-panel` (classe globale) l'emporte sinon sur l'utilitaire.
      className={`${tournamentModeClass(tournament.mode)} app-panel flex flex-col overflow-hidden p-0! text-gray-900 transition-colors hover:border-[var(--tmode)]!`}
    >
      <div
        className="app-on-photo bg-photo-fallback relative h-[78px] bg-cover bg-center"
        style={{ backgroundImage: `url('${tournamentImage(tournament.mapName)}')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 to-slate-950/20" />
        <TournamentModeBadge mode={tournament.mode} onImage className="absolute left-2.5 top-2.5" />
      </div>
      <div className="flex flex-col gap-1 px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <b className="t-card-title min-w-0">{tournament.title}</b>
          {/* Compte à rebours sur la surface du thème : « à venir » en orange d'attente (charte §1.3), brouillon neutre. */}
          {startsIn ? (
            <span
              className={`t-num inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-extrabold ${
                draft ? 'bg-gray-100 text-gray-700' : 'bg-[var(--game-warn-soft)] text-[var(--game-warn)]'
              }`}
            >
              {draft ? <PencilLine className="h-3 w-3" aria-hidden="true" /> : <Clock className="h-3 w-3" aria-hidden="true" />}
              {startsIn}
            </span>
          ) : null}
        </div>
        <span className="t-meta">
          {tournamentFormatLabel(tournament)} · {tournamentDates(tournament)}
        </span>
        <span className="t-meta text-gray-700">{organizerLabel(tournament)}</span>
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
    // Coque de tableau, une ligne par tournoi (`app-table-row` : séparateur et survol du thème) ; points du vainqueur en
    // colonne secondaire, masquée sous 768 px plutôt qu'un défilement horizontal.
    <div className="app-table-shell overflow-hidden">
      {tournaments.map((tournament) => {
        const Icon = TOURNAMENT_MODE_ICONS[tournament.mode]
        return (
          <Link
            key={tournament.id}
            href={`/tournaments/${tournament.id}`}
            className={`${tournamentModeClass(tournament.mode)} app-table-row grid grid-cols-[34px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 px-3.5 py-2.5 last:border-b-0! md:grid-cols-[34px_minmax(0,1.2fr)_minmax(0,1.4fr)_80px]`}
          >
            <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-[var(--tmode-soft)]" title={TOURNAMENT_MODE_DISPLAY[tournament.mode].label}>
              <Icon className="h-4 w-4 text-[var(--tmode)]" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col">
              <b className="truncate text-sm text-gray-900">{tournament.title}</b>
              <span className="t-meta truncate">
                {TOURNAMENT_MODE_DISPLAY[tournament.mode].label} · {tournamentDates(tournament)} · {tournament.roundCount} manche
                {tournament.roundCount > 1 ? 's' : ''}
              </span>
            </span>
            {tournament.winner ? (
              <span className="flex min-w-0 items-center gap-2">
                <RankCell rank={1} size="sm" />
                <span className="flex min-w-0 flex-col">
                  <b className="truncate text-[13px] text-gray-900">{tournament.winner.label}</b>
                  <span className="t-meta truncate">{winnerSubline(tournament, viewer)}</span>
                </span>
              </span>
            ) : (
              <span className="t-meta">Classement indisponible</span>
            )}
            <b className="t-num text-right text-sm text-gray-900 max-md:hidden">
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
  return line.split('**').map((part, index) =>
    index % 2 === 1 ? (
      <b key={index} className="text-gray-900">
        {part}
      </b>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  )
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
        <b className="t-card-title">Comment ça marche ?</b>
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[var(--theme-ui-accent-text)]">
          {open ? 'Masquer' : 'Afficher'}
          <ChevronDown className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>
      {open ? (
        <ol className="t-body flex list-decimal flex-col gap-1.5 pl-5 text-gray-700">
          {TOURNAMENT_QUICK_GUIDE.map((line) => (
            <li key={line}>{withBold(line)}</li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}

