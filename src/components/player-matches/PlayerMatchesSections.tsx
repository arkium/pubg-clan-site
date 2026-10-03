'use client'

import { ChevronDown, ChevronLeft, ChevronRight, Crown } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { PlaceCell } from '@/components/matches/MatchesUi'
import MatchTypeBadge from '@/components/ui/MatchTypeBadge'
import PlacementBadge from '@/components/ui/PlacementBadge'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import { matchDebriefPath, matchTelemetryAuditPath } from '@/lib/match-links'
import { formatPlayTime, sessionDateOf, sessionDateParts } from '@/lib/match-sessions'
import type { StandardPeriod } from '@/lib/period'
import {
  PLAYER_MODE_LABELS,
  modeOf,
  telemetryBadge,
  type ChronologyStep,
  type ModeShare,
  type PlayerMode,
  type PlayerSession,
  type TelemetryBadge,
} from '@/lib/player-matches'
import { mapAssetUrl } from '@/lib/pubg-assets'
import type { DashboardMatch } from '@/types/dashboard'

/** Blocs du carnet de vol d'un joueur (maquette « Matchs joueur », 26a–26e ; docs/features/matchs-joueur.md). */

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
const count = new Intl.NumberFormat('fr-FR')

export const MODE_COLORS: Record<PlayerMode, string> = {
  duo: 'var(--game-sky)',
  trio: 'var(--game-violet)',
  squad: 'var(--game-pos)',
  solo: 'var(--theme-ui-text-muted)',
}

const TONE_COLORS: Record<TelemetryBadge['tone'], string> = {
  pos: 'var(--game-pos)',
  warn: 'var(--game-warn)',
  neg: 'var(--game-neg)',
  muted: 'var(--theme-ui-text-muted)',
}

function ModeBadge({ mode }: { mode: PlayerMode }) {
  return <TeamModeBadge mode={mode} size="xs" label={mode === 'solo' ? PLAYER_MODE_LABELS.solo : undefined} />
}

function Pager({ label, page, pageCount, onPage, previousLabel, nextLabel }: { label: string; page: number; pageCount: number; onPage: (page: number) => void; previousLabel: string; nextLabel: string }) {
  if (pageCount <= 1) return null
  return (
    <nav className="ml-auto flex items-center gap-0.5" aria-label={`Pages · ${label}`}>
      <button type="button" className="app-pager-button" onClick={() => onPage(page - 1)} disabled={page === 1} aria-label={previousLabel}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <span className="t-num min-w-[48px] text-center text-[13px] font-bold text-gray-600">
        {page} / {pageCount}
      </span>
      <button type="button" className="app-pager-button" onClick={() => onPage(page + 1)} disabled={page === pageCount} aria-label={nextLabel}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  )
}

// ── Bandeau : menu des modes ─────────────────────────────────────────────────────────────────────

export function ModeMenu({ counts, total, value, onChange }: { counts: Array<{ mode: PlayerMode; count: number }>; total: number; value: PlayerMode | null; onChange: (mode: PlayerMode | null) => void }) {
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

  const choose = (mode: PlayerMode | null) => {
    onChange(mode)
    setOpen(false)
  }
  const item = (mode: PlayerMode | null, label: string, games: number, color: string) => (
    <button
      key={mode ?? 'all'}
      type="button"
      role="menuitemradio"
      aria-checked={value === mode}
      onClick={() => choose(mode)}
      className={`app-menu__item ${value === mode ? 'app-menu__item--active' : ''}`}
    >
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-2 rounded-sm" style={{ background: color }} aria-hidden="true" />
        {label}
      </span>
      <span className="t-num text-xs opacity-75">{games}</span>
    </button>
  )
  return (
    // Étiré à la hauteur de la ligne du bandeau : même hauteur que le segmented voisin.
    <div ref={rootRef} className="relative ml-auto flex shrink-0 self-stretch">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mode : ${value ? PLAYER_MODE_LABELS[value] : 'tous les modes'}`}
        data-testid="mode-chip"
        className={`app-menu-trigger shrink-0 ${value ? 'app-menu-trigger--active' : ''}`}
      >
        {value ? (
          PLAYER_MODE_LABELS[value]
        ) : (
          <>
            <span className="sm:hidden">Modes</span>
            <span className="hidden sm:inline">Tous les modes</span>
          </>
        )}
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Mode" className="app-menu absolute right-0 top-full z-50 mt-1.5 w-[210px]">
          {item(null, 'Tous les modes', total, 'var(--theme-ui-text-muted)')}
          {counts.map(({ mode, count: games }) => item(mode, PLAYER_MODE_LABELS[mode], games, MODE_COLORS[mode]))}
        </div>
      ) : null}
    </div>
  )
}

// ── Chronologie ──────────────────────────────────────────────────────────────────────────────────

export function Chronology({
  steps,
  page,
  pageCount,
  from,
  to,
  total,
  perPage,
  onPage,
  selectedId,
  onSelect,
  mapLabels,
  footer,
}: {
  steps: ChronologyStep<DashboardMatch>[]
  page: number
  pageCount: number
  from: number
  to: number
  total: number
  perPage: number
  onPage: (page: number) => void
  selectedId: string | null
  onSelect: (match: DashboardMatch) => void
  mapLabels: Record<string, string>
  footer: ReactNode
}) {
  return (
    <section aria-labelledby="chronology-title" className="app-panel flex flex-col gap-3 px-4 pb-4 pt-3.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 id="chronology-title" className="t-card-title">Chronologie</h2>
        {total > 0 ? (
          <span className="t-meta t-num">
            parties {from} à {to} sur {total} · de la plus ancienne à la plus récente
          </span>
        ) : null}
        <Pager label="Chronologie" page={page} pageCount={pageCount} onPage={onPage} previousLabel="Parties plus anciennes" nextLabel="Parties plus récentes" />
      </div>
      {steps.length > 0 ? (
        <ol className="relative grid gap-0.5" style={{ gridTemplateColumns: `repeat(${perPage}, minmax(0, 1fr))` }} aria-label="Parties">
          <span
            className="absolute top-[53px] border-t-2 border-dashed sm:top-[58px]"
            // Du centre de la première étape au centre de la dernière (une page incomplète s'arrête à sa dernière partie).
            style={{ left: `${50 / perPage}%`, right: `${100 - ((steps.length - 0.5) * 100) / perPage}%`, borderColor: 'var(--game-track-strong)' }}
            aria-hidden="true"
          />
          {steps.map(({ match, session, firstOfSession }, index) => {
            const selected = match.id === selectedId
            const image = mapAssetUrl(match.mapName)
            const win = match.placement === 1
            const mapLabel = mapLabels[match.mapName] ?? match.mapName
            const day = dayFormat.format(new Date(`${session}T12:00:00Z`)).replace('.', '')
            return (
              <li key={match.id} className="relative flex min-w-0 justify-center">
                {firstOfSession && index > 0 ? <span className="absolute inset-y-0 -left-px border-l border-gray-200" aria-hidden="true" /> : null}
                <button
                  type="button"
                  onClick={() => onSelect(match)}
                  aria-pressed={selected}
                  aria-label={`${day} · ${timeFormat.format(new Date(match.pubgCreatedAt))} · ${mapLabel} · place ${match.placement} · ${match.kills} kills`}
                  className="flex min-w-0 max-w-full flex-col items-center gap-[5px] rounded-[10px] px-0.5 pb-1 pt-0.5"
                >
                  <span className="h-[15px] whitespace-nowrap text-[11px] font-extrabold leading-[15px] text-gray-500">{firstOfSession ? day : ''}</span>
                  <span className="t-num text-[11px] text-gray-500">{timeFormat.format(new Date(match.pubgCreatedAt))}</span>
                  <span
                    className="bg-photo-fallback relative block h-[34px] w-[34px] rounded-full bg-cover bg-center sm:h-11 sm:w-11"
                    style={{
                      backgroundImage: image ? `url('${image}')` : undefined,
                      boxShadow: `0 0 0 3px ${selected ? 'var(--theme-ui-accent)' : win ? 'var(--game-gold)' : 'var(--theme-ui-surface)'}${selected ? ', 0 0 0 7px var(--theme-ui-accent-soft)' : ''}`,
                    }}
                  >
                    {win ? <Crown className="absolute -top-[10px] left-1/2 -ml-2 h-4 w-4" style={{ color: 'var(--game-gold)' }} aria-hidden="true" /> : null}
                  </span>
                  <PlacementBadge placement={match.placement} />
                  <span className="t-num whitespace-nowrap text-[11px] text-gray-700">{match.kills} K</span>
                </button>
              </li>
            )
          })}
        </ol>
      ) : null}
      {footer}
    </section>
  )
}

export function ModeBar({ shares, playSeconds }: { shares: ModeShare[]; playSeconds: number }) {
  if (shares.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {shares.map((share) => (
          <span key={share.mode} style={{ flex: share.games, background: MODE_COLORS[share.mode] }} />
        ))}
      </div>
      <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-gray-700" aria-label="Parties par mode">
        {shares.map((share) => (
          <li key={share.mode} className="inline-flex items-center gap-1.5">
            <ModeBadge mode={share.mode} />
            <b className="text-gray-900">{share.games}</b>
            <span className="text-gray-500">
              · {share.kills} K · {share.wins > 0 ? `${share.wins} top 1` : 'pas de top 1'}
            </span>
          </li>
        ))}
        <li className="ml-auto text-gray-500">{formatPlayTime(playSeconds)} de jeu</li>
      </ul>
    </div>
  )
}

// ── Soirées ──────────────────────────────────────────────────────────────────────────────────────

function PlayerMatchCard({ match, mapLabel, selected, period }: { match: DashboardMatch; mapLabel: string; selected: boolean; period: StandardPeriod }) {
  const image = mapAssetUrl(match.mapName)
  const win = match.placement === 1
  const badge = telemetryBadge(match.telemetryStatus)
  const minutes = Math.round(match.duration / 60)
  const placeClass = win ? 'app-photo-place--win' : match.placement <= 5 ? 'app-photo-place--top5' : ''
  const context = { period, fromDate: sessionDateOf(match.pubgCreatedAt) }
  const canLink = match.clanId && match.squadMatchId
  return (
    <article
      id={`match-${match.id}`}
      aria-label={`${timeFormat.format(new Date(match.pubgCreatedAt))} · ${mapLabel} · place ${match.placement}`}
      className="app-panel flex scroll-mt-32 flex-col overflow-hidden p-0"
      style={selected ? { borderColor: 'var(--theme-ui-accent-ring)', boxShadow: '0 0 0 3px var(--theme-ui-accent-soft)' } : win ? { borderColor: 'var(--game-gold-ring)' } : undefined}
      data-selected={selected ? 'true' : 'false'}
    >
      <div className="bg-photo-fallback relative h-[84px] bg-cover bg-center sm:h-[92px]" style={{ backgroundImage: image ? `url('${image}')` : undefined }}>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 to-slate-950/15" aria-hidden="true" />
        {win ? (
          <span className="app-stamp absolute left-2.5 top-2">Chicken dinner</span>
        ) : null}
        <span className="absolute right-2.5 top-2 flex items-center gap-1">
          <MatchTypeBadge matchType={match.matchType ?? null} />
          <ModeBadge mode={modeOf(match)} />
        </span>
        <div className="absolute inset-x-2.5 bottom-2 flex items-end justify-between gap-2 text-white">
          <span className="flex min-w-0 flex-col">
            <span className="t-num text-[11px] text-white/75">
              {timeFormat.format(new Date(match.pubgCreatedAt))}
              {minutes > 0 ? ` · ${minutes} min` : ''}
            </span>
            <b className="truncate text-base font-extrabold">{mapLabel}</b>
          </span>
          <b className={`app-photo-place t-hero t-hero--md shrink-0 ${placeClass}`}>
            #{match.placement}
            {match.teamCount ? <span className="text-xs font-semibold text-white/65">/{match.teamCount}</span> : null}
          </b>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2.5">
        <dl className="t-num grid grid-cols-4 gap-1.5">
          {[
            ['Kills', count.format(match.kills)],
            ['Dégâts', count.format(Math.round(match.damageDealt))],
            ['Assist.', count.format(match.assists)],
            ['Réa.', count.format(match.revives)],
          ].map(([label, value]) => (
            <div key={label} className="app-panel-muted flex min-w-0 flex-col-reverse px-1.5 py-1">
              <dt className="truncate text-[11px] font-bold text-gray-500">{label}</dt>
              <dd className="text-[15px] font-extrabold text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>
        <span className="t-meta truncate">{match.squad.length > 0 ? `avec ${match.squad.join(', ')}` : 'Sans coéquipier du clan'}</span>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-gray-500" title={badge.title}>
            <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: TONE_COLORS[badge.tone] }} aria-hidden="true" />
            <span className="truncate">{badge.label}</span>
          </span>
          {canLink && match.telemetryStatus === 'success' ? (
            <Link
              href={matchDebriefPath(match.clanId!, match.squadMatchId!, context)}
              className="app-btn app-btn--xs app-btn--primary shrink-0"
            >
              Débriefing
            </Link>
          ) : canLink && match.telemetryStatus ? (
            <Link
              href={matchTelemetryAuditPath(match.clanId!, match.squadMatchId!, context)}
              className="app-btn app-btn--xs app-btn--secondary shrink-0"
            >
              État
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  )
}

export function SessionList({
  sessions,
  page,
  pageCount,
  onPage,
  openDate,
  onToggle,
  selectedId,
  mapLabels,
  today,
  small,
  period,
  emptyText,
}: {
  sessions: PlayerSession<DashboardMatch>[]
  page: number
  pageCount: number
  onPage: (page: number) => void
  openDate: string | null
  onToggle: (date: string) => void
  selectedId: string | null
  mapLabels: Record<string, string>
  today: string
  small: boolean
  period: StandardPeriod
  emptyText: string
}) {
  return (
    <section aria-labelledby="sessions-title" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 id="sessions-title" className="t-section-title">Soirées</h2>
        <span className="t-meta">{sessions.length > 0 ? 'la plus récente en haut' : ''}</span>
        <Pager label="Soirées" page={page} pageCount={pageCount} onPage={onPage} previousLabel="Soirées plus récentes" nextLabel="Soirées plus anciennes" />
      </div>
      {sessions.length === 0 ? <p className="app-panel t-body p-6 text-center text-gray-500">{emptyText}</p> : null}
      <ul className="flex flex-col gap-2.5" aria-label="Soirées">
        {sessions.map((session) => {
          const open = session.date === openDate
          const parts = sessionDateParts(session.date)
          const pillLimit = small ? 6 : 12
          const title = session.date === today ? 'Ce soir' : parts.full
          return (
            <li key={session.date} className="app-panel overflow-hidden p-0" style={open ? { borderColor: 'var(--theme-ui-accent-ring)' } : undefined}>
              <button
                type="button"
                onClick={() => onToggle(session.date)}
                aria-expanded={open}
                aria-controls={`session-${session.date}`}
                className="flex w-full flex-wrap items-center gap-3 px-3.5 py-3 text-left"
              >
                <span className="app-panel-muted flex h-11 w-11 shrink-0 flex-col items-center justify-center">
                  <b className="t-hero t-hero--sm text-gray-900">{parts.day}</b>
                  <span className="t-label">{parts.weekday}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <b className="t-card-title">{title}</b>
                    {session.wins > 0 ? (
                      <span className="app-stamp app-stamp--sm">
                        {session.wins > 1 ? `${session.wins} chicken dinners` : 'Chicken dinner'}
                      </span>
                    ) : null}
                  </span>
                  <span className="t-meta t-num">
                    {session.matches.length} partie{session.matches.length > 1 ? 's' : ''} · {timeFormat.format(new Date(session.start))} → {timeFormat.format(new Date(session.end))} ·{' '}
                    {session.kills} kills · meilleure place #{session.bestPlace}
                  </span>
                </span>
                <span className="order-last flex w-full flex-wrap justify-start gap-1 sm:order-none sm:w-auto sm:max-w-[46%] sm:justify-end" aria-label="Places de la soirée">
                  {session.matches.slice(0, pillLimit).map((match) => (
                    <PlaceCell key={match.id} place={match.placement} title={`${timeFormat.format(new Date(match.pubgCreatedAt))} · ${mapLabels[match.mapName] ?? match.mapName}`} />
                  ))}
                  {session.matches.length > pillLimit ? <span className="self-center text-[11px] font-bold text-gray-500">+{session.matches.length - pillLimit}</span> : null}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {open ? (
                <div id={`session-${session.date}`} className="grid gap-2.5 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-3">
                  {session.matches.map((match) => (
                    <PlayerMatchCard key={match.id} match={match} mapLabel={mapLabels[match.mapName] ?? match.mapName} selected={match.id === selectedId} period={period} />
                  ))}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
