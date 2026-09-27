'use client'

import { ChevronLeft, ChevronRight, Crown } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import PodiumCards from '@/components/ui/PodiumCards'
import RankCell from '@/components/ui/RankCell'
import SortableTh from '@/components/ui/SortableTh'
import { matchTournamentDebriefPath } from '@/lib/match-links'
import { mapAssetUrl } from '@/lib/pubg-assets/map-asset'
import { tournamentMapLabel } from '@/lib/tournament-filters'
import {
  TOURNAMENT_MODE_DISPLAY,
  formatTournamentPoints,
  isViewerParticipant,
  participantForm,
  placementScale,
  tournamentRuleLines,
  type TournamentViewer,
} from '@/lib/tournament-mode-display'
import type { MixedSquadRule, TournamentMode } from '@/lib/tournament-service'
import type { TournamentRoundView, TournamentStandingView } from '@/lib/tournament-standings-view'

/** Blocs de la page d'un tournoi (maquette « Tournois », 2026-09-27 — docs/features/tournois.md). */

export type TournamentRules = {
  mode: TournamentMode
  mixedSquadRule: MixedSquadRule
  placementPoints: Record<string, number>
  killPoints: number
  winBonus: number
  bestOfRounds: number | null
}

const numberFormat = new Intl.NumberFormat('fr-FR')
const roundDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// ── Podium et MVP ───────────────────────────────────────────────────────────────────────────────────

export function TournamentPodium({
  standings,
  mvp,
}: {
  standings: TournamentStandingView[]
  mvp: { label: string; kills: number; damage: number } | null
}) {
  if (standings.length === 0 && !mvp) return null
  return (
    <section aria-label="Podium" className="flex flex-col gap-3">
      <PodiumCards
        metricLabel="Points"
        entries={standings.slice(0, 3).map((standing) => ({
          key: standing.key,
          name: standing.label,
          subline: `${standing.totalKills} kills · ${standing.wins} Top 1`,
          value: formatTournamentPoints(standing.totalPoints),
        }))}
      />
      {mvp ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-[var(--game-gold-ring)] bg-[var(--game-gold-soft)] px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--game-gold)]">
            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
            MVP du tournoi
          </span>
          <b className="text-lg font-black text-gray-900">{mvp.label}</b>
          <div className="flex gap-3.5 tabular-nums text-gray-900">
            <span>
              <b className="text-xl">{mvp.kills}</b> <span className="text-[11px] text-gray-500">kills</span>
            </span>
            <span>
              <b className="text-xl">{numberFormat.format(mvp.damage)}</b> <span className="text-[11px] text-gray-500">dégâts</span>
            </span>
          </div>
          <span className="text-[11px] text-gray-500 sm:ml-auto">Le plus de kills, départagé par les dégâts</span>
        </div>
      ) : null}
    </section>
  )
}

// ── Classement ──────────────────────────────────────────────────────────────────────────────────────

function PlaceChip({ round, placement }: { round: number; placement: number | null }) {
  if (placement === null) {
    return (
      <span className="tournament-place tournament-place--absent" title={`Manche ${round} : absent`}>
        –
      </span>
    )
  }
  const tone = placement === 1 ? 'tournament-place--win' : placement <= 10 ? 'tournament-place--top10' : ''
  return (
    <span className={`tournament-place ${tone}`} title={`Manche ${round} : ${placement === 1 ? '1re' : `${placement}e`} place`}>
      {placement === 1 ? '#1' : placement}
    </span>
  )
}

export function TournamentStandingsTable({
  mode,
  standings,
  rounds,
  viewer,
  showForm,
  prorata,
}: {
  mode: TournamentMode
  standings: TournamentStandingView[]
  rounds: TournamentRoundView[]
  viewer: TournamentViewer
  /** Faux en détail par escouade : la forme se lit par participant du mode, pas par escouade. */
  showForm: boolean
  prorata: boolean
}) {
  const display = TOURNAMENT_MODE_DISPLAY[mode]
  const top = Math.max(1, standings[0]?.totalPoints ?? 1)
  const showChips = mode === 'custom_teams'
  return (
    <div className="app-table-shell overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full table-auto text-[13px]">
          <thead className="app-table-head">
            <tr>
              <SortableTh align="left" className="w-12 pl-3">Rang</SortableTh>
              <SortableTh align="left">{display.column}</SortableTh>
              <SortableTh align="left" className="max-md:text-right" title={prorata ? 'Points de placement partagés au prorata de l’effectif : totaux décimaux possibles.' : undefined}>
                Points
              </SortableTh>
              <SortableTh className="max-md:hidden">Kills</SortableTh>
              <SortableTh className="max-md:hidden">Top 1</SortableTh>
              {showForm ? (
                <SortableTh align="left" className="pr-3 max-md:hidden" title="Place à chaque manche">
                  Forme · {rounds.length} manche{rounds.length > 1 ? 's' : ''}
                </SortableTh>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {standings.map((standing) => {
              const mine = isViewerParticipant(standing.participant, viewer)
              return (
                <tr key={standing.key} className={`app-table-row${mine ? ' tournament-row--viewer' : ''}`} aria-current={mine ? 'true' : undefined}>
                  <td className="py-2 pl-3 pr-[9px]">
                    <RankCell rank={standing.rank} />
                  </td>
                  <td className="min-w-0 px-[9px] py-2">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <b className="truncate text-sm text-gray-900">{standing.label}</b>
                        {mine ? (
                          <span className="shrink-0 rounded bg-[var(--theme-ui-accent)] px-1.5 py-px text-[10px] font-black uppercase text-white">
                            {display.viewer}
                          </span>
                        ) : null}
                      </span>
                      {showChips && standing.memberLabels.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {standing.memberLabels.map((label) => (
                            <span key={label} className="app-panel-muted rounded px-1.5 py-px text-[10px] font-semibold text-gray-700">
                              {label}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      <span className="text-[11px] text-gray-500 md:hidden">
                        {standing.totalKills} kills · {standing.wins} Top 1
                      </span>
                    </span>
                  </td>
                  <td className="px-[9px] py-2 max-md:text-right">
                    <span className="flex items-center gap-2 max-md:justify-end">
                      <span className="h-2 min-w-[5rem] flex-1 overflow-hidden rounded bg-[var(--theme-ui-surface-strong)] max-md:hidden" aria-hidden="true">
                        <span
                          className="block h-full rounded bg-[var(--tmode)]"
                          style={{ width: `${Math.max(0, Math.round((standing.totalPoints / top) * 100))}%` }}
                        />
                      </span>
                      <b className="min-w-[2.5rem] text-right text-base tabular-nums text-gray-900">
                        {formatTournamentPoints(standing.totalPoints)}
                      </b>
                    </span>
                  </td>
                  <td className="px-[9px] py-2 text-right tabular-nums text-gray-700 max-md:hidden">{standing.totalKills}</td>
                  <td
                    className={`px-[9px] py-2 text-right font-extrabold tabular-nums max-md:hidden ${
                      standing.wins > 0 ? 'text-[var(--game-gold)]' : 'text-gray-500'
                    }`}
                  >
                    {standing.wins}
                  </td>
                  {showForm ? (
                    <td className="py-2 pl-[9px] pr-3 max-md:hidden">
                      <span className="flex gap-[3px]">
                        {participantForm(standing.key, rounds).map((entry) => (
                          <PlaceChip key={entry.round} round={entry.round} placement={entry.placement} />
                        ))}
                      </span>
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Trophée des clans (solo) ────────────────────────────────────────────────────────────────────────

export function TournamentClanTrophy({ entries }: { entries: Array<{ clanId: number; label: string; points: number; players: number }> }) {
  if (entries.length === 0) return null
  const top = Math.max(1, entries[0].points)
  return (
    <section aria-labelledby="tournament-trophy" className="app-panel flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="tournament-trophy" className="text-base font-extrabold text-gray-900">Trophée des clans</h2>
        <span className="text-xs text-gray-500">somme des points de leurs joueurs</span>
      </div>
      {entries.map((entry) => (
        <div key={entry.clanId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_64px] items-center gap-2.5 text-[13px]">
          <b className="truncate text-gray-900" title={`${entry.players} joueur${entry.players > 1 ? 's' : ''} classé${entry.players > 1 ? 's' : ''}`}>
            {entry.label}
          </b>
          <span className="h-2 overflow-hidden rounded bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
            <span className="block h-full rounded bg-[var(--tmode)]" style={{ width: `${Math.round((entry.points / top) * 100)}%` }} />
          </span>
          <b className="text-right tabular-nums text-gray-900">{formatTournamentPoints(entry.points)} pts</b>
        </div>
      ))}
    </section>
  )
}

// ── Manches, une par une ────────────────────────────────────────────────────────────────────────────

export function TournamentRounds({
  tournamentId,
  mode,
  rounds,
  standings,
  viewer,
}: {
  tournamentId: string
  mode: TournamentMode
  rounds: TournamentRoundView[]
  standings: TournamentStandingView[]
  viewer: TournamentViewer
}) {
  // La dernière manche jouée d'abord : c'est celle qu'on vient voir pendant un tournoi.
  const [selected, setSelected] = useState(rounds.length - 1)
  if (rounds.length === 0) return null
  const index = Math.min(Math.max(0, selected), rounds.length - 1)
  const round = rounds[index]
  const image = mapAssetUrl(round.mapName) ?? '/matches.jpg'
  const viewerKeys = new Set(standings.filter((standing) => isViewerParticipant(standing.participant, viewer)).map((standing) => standing.key))

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-extrabold text-gray-900">Manches</h2>
        <div className="ml-auto flex min-w-0 max-w-full items-center gap-1" role="group" aria-label="Choisir une manche">
          <button
            type="button"
            onClick={() => setSelected(index - 1)}
            disabled={index === 0}
            aria-label="Manche précédente"
            className="app-pager-button"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:thin]">
            {rounds.map((entry, entryIndex) => (
              <button
                key={entry.matchId}
                type="button"
                onClick={() => setSelected(entryIndex)}
                aria-pressed={entryIndex === index}
                className={`app-pager-button shrink-0 ${entryIndex === index ? 'app-pager-button--active' : ''}`}
              >
                M{entry.index}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSelected(index + 1)}
            disabled={index === rounds.length - 1}
            aria-label="Manche suivante"
            className="app-pager-button"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <article
        aria-label={`Manche ${round.index}`}
        className="app-table-shell grid overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]"
      >
        <div className="relative min-h-[240px] bg-slate-950 bg-cover bg-center text-white" style={{ backgroundImage: `url('${image}')` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 from-35% to-slate-950/30" />
          <div className="absolute inset-x-3.5 bottom-3.5 flex flex-col gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-white/70">
              Manche {round.index} · {tournamentMapLabel(round.mapName)}
            </span>
            <span className="text-xs text-white/80">{roundDate.format(new Date(round.createdAt))}</span>
            <div className="flex flex-col gap-0.5 rounded-[10px] border border-amber-400/60 bg-amber-400/20 p-2.5">
              <span className="text-[10px] font-black tracking-[0.1em] text-amber-300">CHICKEN DINNER · TOP 1</span>
              <b className="text-sm">{round.winnerLabel ?? 'Hors des participants suivis'}</b>
            </div>
            {round.mvp ? (
              <span className="text-xs text-white/85">
                <b>MVP</b> {round.mvp.label} · {round.mvp.kills} kills
              </span>
            ) : null}
            <Link href={matchTournamentDebriefPath(tournamentId, round.matchId)} className="text-xs font-bold text-indigo-300 hover:underline">
              Débrief 2D de la manche →
            </Link>
          </div>
        </div>
        <table className="w-full self-start text-[13px]">
          <thead className="app-table-head">
            <tr>
              <SortableTh align="left" className="w-14 pl-3.5">Place</SortableTh>
              <SortableTh align="left">{TOURNAMENT_MODE_DISPLAY[mode].column}</SortableTh>
              <SortableTh>Kills</SortableTh>
              <SortableTh className="pr-3.5">Pts</SortableTh>
            </tr>
          </thead>
          <tbody>
            {round.scores.map((score) => (
              <tr key={score.key} className={`app-table-row${viewerKeys.has(score.key) ? ' tournament-row--viewer' : ''}`}>
                <td className="py-2 pl-3.5 pr-[9px]">
                  <PlaceChip round={round.index} placement={score.bestPlacement} />
                </td>
                <td className="max-w-0 truncate px-[9px] py-2 font-semibold text-gray-900">{score.label}</td>
                <td className="px-[9px] py-2 text-right tabular-nums text-gray-700">{score.totalKills}</td>
                <td className="py-2 pl-[9px] pr-3.5 text-right font-bold tabular-nums text-gray-900">{formatTournamentPoints(score.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  )
}

// ── Barème ──────────────────────────────────────────────────────────────────────────────────────────

export function TournamentRulesPanel({ rules }: { rules: TournamentRules }) {
  const scale = placementScale(rules.placementPoints)
  return (
    <div className="app-panel grid gap-3 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-2.5">
        <h2 className="text-base font-extrabold text-gray-900">Barème</h2>
        <div className="flex h-[90px] items-end gap-1" role="list" aria-label="Points de placement">
          {scale.map((entry) => (
            <div key={entry.placement} role="listitem" className="flex h-full flex-1 flex-col items-center justify-end gap-1" aria-label={`Top ${entry.placement} : ${entry.points} points`}>
              <b className="text-[11px] tabular-nums text-gray-900">{formatTournamentPoints(entry.points)}</b>
              <span
                className={`w-full rounded-t ${entry.placement === 1 ? 'bg-amber-400' : 'bg-[var(--tmode)]'}`}
                style={{ height: `${Math.max(2, Math.round(entry.ratio * 60))}px` }}
              />
              <span className="text-[10px] text-gray-500">T{entry.placement}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 text-[13px]">
        {tournamentRuleLines(rules).map((line) => (
          <div key={line.label} className="app-panel-muted flex justify-between gap-2.5 rounded-[10px] px-2.5 py-2">
            <span className="text-gray-700">{line.label}</span>
            <b className="text-right text-gray-900">{line.value}</b>
          </div>
        ))}
      </div>
    </div>
  )
}
