'use client'

import { Clock, Flag, PencilLine, Trophy, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import TournamentModeBadge, { tournamentModeClass } from '@/components/tournaments/TournamentModeBadge'
import { tournamentFormatLabel } from '@/components/tournaments/TournamentListSections'
import { TOURNAMENT_MODE_DISPLAY, countdownLabel, type TournamentPhase } from '@/lib/tournament-mode-display'
import type { TournamentMode } from '@/lib/tournament-service'

/**
 * En-tête d'un tournoi sur la carte jouée (docs/features/tournois.md, « Page d'un tournoi »), selon la charte UI
 * (docs/ui/index.html, section « Tournois », 04/10/2026) : photo `.app-on-photo`, titre Teko (`t-banner-title`), état
 * « en direct » en accent plein à encre sombre (charte §1.2, comme la carte « en direct » de la liste), les autres états
 * en puce neutre sur la photo ; chiffres en Teko (`t-hero`). Le mode garde sa couleur (`TournamentModeBadge`).
 */

export type TournamentHeaderInfo = {
  title: string
  description: string | null
  startDate: string
  endDate: string
  gameMode: string | null
  mapName: string | null
  organizerClan: { id: number; name: string; tag: string | null } | null
}

/** Puce d'état sur la photo : seul « en direct » est rempli (accent) ; à venir, terminé et brouillon restent neutres. */
const PHASE_BADGES: Record<TournamentPhase, { label: string; icon: LucideIcon | null; className: string }> = {
  live: { label: 'EN DIRECT', icon: null, className: 'border-transparent bg-[var(--theme-ui-accent)] text-slate-950' },
  upcoming: { label: 'À VENIR', icon: Clock, className: 'border-white/25 bg-white/15 text-white' },
  finished: { label: 'TERMINÉ', icon: Flag, className: 'border-white/25 bg-white/15 text-white' },
  draft: { label: 'BROUILLON', icon: PencilLine, className: 'border-white/25 bg-white/15 text-white' },
}

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const hourMinute = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })

export function TournamentPhaseBadge({ phase }: { phase: TournamentPhase }) {
  const badge = PHASE_BADGES[phase]
  const Icon = badge.icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[11px] font-black tracking-[0.1em] ${badge.className}`}
      data-testid="tournament-phase"
      data-phase={phase}
    >
      {phase === 'live' ? (
        <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-slate-950 motion-reduce:animate-none" aria-hidden="true" />
      ) : null}
      {Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
      {badge.label}
    </span>
  )
}

export default function TournamentDetailHeader({
  tournament,
  mode,
  phase,
  now,
  roundCount,
  participantCount,
  lastRoundAt,
  heroImage,
  actions,
}: {
  tournament: TournamentHeaderInfo
  mode: TournamentMode
  phase: TournamentPhase
  now: Date
  roundCount: number
  participantCount: number
  lastRoundAt: string | null
  heroImage: string
  /** Actions d'organisateur, seulement pour qui peut les exécuter. */
  actions?: ReactNode
}) {
  const display = TOURNAMENT_MODE_DISPLAY[mode]
  const endsIn = phase === 'live' ? countdownLabel(tournament.endDate, now) : null
  const startsIn = phase === 'upcoming' ? countdownLabel(tournament.startDate, now) : null
  const organizer = tournament.organizerClan
  const stats = [
    { value: String(roundCount), label: roundCount > 1 ? 'manches' : 'manche' },
    { value: String(participantCount), label: participantCount > 1 ? display.unit.many : display.unit.one },
    {
      value: lastRoundAt ? hourMinute.format(new Date(lastRoundAt)) : '–',
      label: lastRoundAt ? `dernière manche · ${shortDate.format(new Date(lastRoundAt))}` : 'dernière manche',
    },
  ]

  return (
    // Photo toujours sombre (`.app-on-photo` : jetons de jeu lisibles dans les deux thèmes), rayon de carte 14.
    <header
      className="app-on-photo bg-hero-fallback relative overflow-hidden rounded-[14px] bg-cover bg-center text-white"
      style={{ backgroundImage: `url('${heroImage}')` }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 from-40% to-slate-950/55 md:bg-gradient-to-r md:from-slate-950/95 md:via-slate-950/75 md:to-slate-950/45" />
      <div className="relative grid items-end gap-4 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:p-6">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TournamentPhaseBadge phase={phase} />
            <TournamentModeBadge mode={mode} onImage />
            <span className="rounded-md border border-white/25 bg-white/15 px-2 py-0.5 text-[11px] font-bold">
              {tournamentFormatLabel(tournament)}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Trophy className="h-5 w-5 shrink-0 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="t-banner-title min-w-0 text-white drop-shadow-md [overflow-wrap:anywhere]">{tournament.title}</h1>
          </div>
          <span className="text-[13px] text-white/80">
            {organizer ? (
              <>
                Organisé par{' '}
                {/* Lien sur la photo : blanc souligné d'accent, accent au survol (charte §1.2, comme `app-link`). */}
                <Link
                  href={`/clans/${organizer.id}/overview`}
                  className="font-semibold text-white underline decoration-[var(--theme-ui-accent-ring)] underline-offset-[3px] transition-colors hover:text-[var(--theme-ui-accent)] hover:decoration-current"
                >
                  {organizer.tag ? `[${organizer.tag}] ` : ''}
                  {organizer.name}
                </Link>{' '}
                ·{' '}
              </>
            ) : null}
            {dayMonth.format(new Date(tournament.startDate))} → {dayMonth.format(new Date(tournament.endDate))}
            {endsIn ? ` · se termine ${endsIn}` : ''}
            {startsIn ? ` · commence ${startsIn}` : ''}
          </span>
          <span className={`text-[13px] text-white/90 [text-wrap:pretty] ${tournamentModeClass(mode, true)}`}>
            <b className="text-[var(--tmode-text)]">{display.label} :</b> {display.help}
          </span>
          {tournament.description ? <p className="text-[13px] text-white/75">{tournament.description}</p> : null}
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex min-w-0 flex-col items-center gap-1 rounded-[10px] border border-white/15 bg-slate-950/55 px-2 py-2.5 text-center"
            >
              <b className="t-hero t-hero--md">{stat.value}</b>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-white/70">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </header>
  )
}
