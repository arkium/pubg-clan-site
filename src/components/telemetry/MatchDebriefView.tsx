'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Crown,
  Flame,
  HeartHandshake,
  ListVideo,
  LocateFixed,
  PlayCircle,
  RefreshCw,
  ScanEye,
  Skull,
  Swords,
  Target,
  Trophy,
  Users,
} from 'lucide-react'

import MatchTypeBadge from '@/components/ui/MatchTypeBadge'
import PlacementBadge from '@/components/ui/PlacementBadge'
import RankCell from '@/components/ui/RankCell'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { mapAssetUrl, resolveGameMode, resolveMapName } from '@/lib/pubg-assets'
import { matchDebriefPath, matchTelemetryAuditPath, matchTournamentDebriefPath } from '@/lib/match-links'
import { formatMatchDuration, teamCountFromPhaseSnapshots } from '@/lib/home-showcase'
import {
  DEBRIEF_TAB_PARAM,
  accuracyOf,
  clampPage,
  formatClock,
  formatDistance,
  pageOfIndex,
  parseDebriefTab,
  phaseStartTimes,
  survivalPercent,
  throwableSummary,
  weaponDisplayName,
  zoneBars,
  type DebriefTab,
  type MemberStatsRow,
} from '@/lib/pubg-telemetry/debrief-view'

import { DamageBodySvg, type BodyZoneKey } from '@/components/telemetry/DamageBodySvg'
import { MatchCombatTimeline, type CombatEvent } from '@/components/telemetry/MatchCombatTimeline'
import { MatchReplay2D, type MatchReplayData } from '@/components/telemetry/MatchReplay2D'
import type { BodyZone, BodyZoneBreakdown } from '@/lib/pubg-telemetry/body-zones'
import type { SquadMateStats } from '@/lib/pubg-telemetry/squad-mates'

/**
 * Débriefing tactique d'un match : vue clan (`/clans/[clanId]/telemetry/matches/[matchId]/debrief`) et vue
 * tournoi (`/tournaments/[tournamentId]/matches/[matchId]`, ouverte à tout utilisateur connecté). Tout le
 * contenu suit l'escouade choisie dans la bande des équipes. Refonte du 2026-09-26 — maquette Claude Design
 * « Débrief télémétrie » (écrans 8a à 8h), docs/features/debriefing.md : jetons de thème partout (clair et
 * sombre), onglets accessibles portés par `?tab=`, chronologie en liste, replay à panneau latéral, cartes de
 * joueur, duels avec score et barres par zone.
 */

type SquadMateApi = SquadMateStats & {
  /** Fiche ClanMember dans un autre clan du site : le joueur est suivi, simplement pas par ce clan. */
  trackedClan?: { id: number; tag: string | null; name: string | null } | null
  /** Dernière résolution du clan PUBG (tag potentiellement périmé). */
  pubgClanCheckedAt?: string | null
}

type TelemetryStatus = 'success' | 'failed' | 'pending'

type MatchMember = {
  memberId: number
  displayName: string
  kills: number
  damage: number
  assists: number
  revives: number
  placement: number
  /** Mètres, API PUBG (absents des anciens payloads). */
  walkDistance?: number
  rideDistance?: number
}

type KillEventApi = {
  id: string
  killerName: string
  victimName: string
  damageCauser: string
  distance: number
  headshot?: boolean
  /** Secondes epoch (kill-feed) : converties en temps de match par rapport à `match.createdAt`. */
  timestampSeconds?: number | null
  killerClanTag: string | null
  victimClanTag: string | null
  isClanKill: boolean
  isClanVictim: boolean
  /** Escouade = clan consulté + coéquipiers. Absent des anciens payloads. */
  isSquadKill?: boolean
  isSquadVictim?: boolean
  source?: 'sync' | 'telemetry'
}

type ThrowableStatApi = { memberId: number; itemId: string; count: number }

type MatchTeamApi = {
  teamId: number
  placement: number | null
  /** Classement déduit de l'ordre des éliminations (matchs analysés avant le 2026-09-16). */
  placementEstimated?: boolean
  kills: number
  /** Secondes depuis le début du match ; `null` : en vie à la fin (ou partie quittée). */
  eliminatedAt?: number | null
  tag: string | null
  clanName: string | null
  trackedClanId: number | null
  players: string[]
}

type MatchFocusApi = { teamId: number | null; clanId: number | null; tag: string; clanName: string | null }

type TournamentRoundApi = {
  id: string
  title: string
  status: string
  roundNumber: number
  totalRounds: number
  scores: Array<{
    clanId: number
    tag: string | null
    name: string | null
    bestPlacement: number
    totalKills: number
    placementScore: number
    killScore: number
    winBonus: number
    points: number
  }>
}

type SquadBodyZones = { available: boolean; dealt: BodyZoneBreakdown[]; taken: BodyZoneBreakdown[] }

type MatchTelemetryResponse = {
  ok: boolean
  data?: {
    match?: {
      id: string
      pubgMatchId: string
      gameMode: string
      matchType?: string
      mapName: string
      durationSeconds?: number | null
      placement: number
      createdAt: string
      members: MatchMember[]
      /** Tag de l'équipe mise en avant (clan suivi, clan PUBG, ou « Équipe N »). */
      clanTag?: string
      otherTrackedClans?: string[]
      /** Équipes du lobby par classement final — bande des équipes. */
      teams?: MatchTeamApi[]
      focus?: MatchFocusApi
    }
    telemetry?: {
      status: TelemetryStatus
      weaponStats: unknown
      memberStats: unknown
      phaseSnapshots: unknown
      squadBodyZones?: SquadBodyZones
      combatEvents?: CombatEvent[]
    }
    combatEvents?: CombatEvent[]
    killEvents?: KillEventApi[]
    throwableStats?: ThrowableStatApi[]
    /** Coéquipiers hors clan, statistiques issues de la télémétrie (`memberStats`). */
    squadMates?: SquadMateApi[]
    /** Le kill-feed complet est enregistré pour ce match (analysé après le 2026-09-14). */
    killFeedAvailable?: boolean
    weaponLabels?: Record<string, string>
    memberIdentityMap?: Record<string, { name: string; clanTag?: string; clanId?: number }>
    /** Vue tournoi uniquement : manche et points de chaque clan. */
    tournament?: TournamentRoundApi
  }
  error?: { message?: string; code?: string }
}

export type MatchDebriefContext = { kind: 'clan'; clanId: string } | { kind: 'tournament'; tournamentId: string }

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const numberFormat = new Intl.NumberFormat('fr-FR')

function formatMatchDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormat.format(date).replace(' ', ' · ').replace(/,/, '')
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

const SILHOUETTE_ZONES: BodyZone[] = ['head', 'torso', 'pelvis', 'arms', 'legs']

function toZoneRecord(breakdown: BodyZoneBreakdown[] | undefined, field: 'damage' | 'hits'): Record<BodyZoneKey, number> {
  const record: Record<BodyZoneKey, number> = { head: 0, torso: 0, pelvis: 0, arms: 0, legs: 0 }
  for (const row of breakdown ?? []) {
    if (SILHOUETTE_ZONES.includes(row.zone)) record[row.zone as BodyZoneKey] = row[field]
  }
  return record
}

// ── Petits éléments ──────────────────────────────────────────────────────────────────────────────

function MateBadge({ mate }: { mate: Pick<SquadMateApi, 'clanTag' | 'trackedClan' | 'pubgClanCheckedAt'> }) {
  if (mate.trackedClan) {
    return (
      <span
        className="text-[10px] font-bold uppercase tracking-[0.04em]"
        style={{ color: 'var(--theme-ui-accent-text)' }}
        title={`Coéquipier suivi dans le clan ${mate.trackedClan.name ?? mate.trackedClan.tag ?? ''} du site, qui n'a pas encore synchronisé ce match : statistiques issues de la télémétrie.`}
      >
        {mate.trackedClan.tag ? `[${mate.trackedClan.tag}] ` : ''}suivi
      </span>
    )
  }
  const checkedOn = mate.pubgClanCheckedAt ? new Date(mate.pubgClanCheckedAt).toLocaleDateString('fr-FR') : null
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-[0.04em]"
      style={{ color: 'var(--debrief-mate)' }}
      title={`Coéquipier sans fiche membre sur le site : statistiques issues de la télémétrie.${
        mate.clanTag ? ` Tag [${mate.clanTag}] = clan PUBG${checkedOn ? ` relevé le ${checkedOn}` : ''}, il peut avoir changé depuis.` : ''
      }`}
    >
      {mate.clanTag ? `[${mate.clanTag}] ` : ''}non suivi
    </span>
  )
}

function TelemetryChip() {
  return (
    <span
      className="rounded border px-1 text-[10px] font-bold"
      style={{ borderColor: 'var(--debrief-mate)', color: 'var(--debrief-mate)' }}
      title="Frag retrouvé dans le kill-feed de la télémétrie : le clan du joueur n'avait pas synchronisé ce match."
    >
      télémétrie
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">{children}</span>
}

// ── Bande des équipes ────────────────────────────────────────────────────────────────────────────

function teamLabel(team: MatchTeamApi) {
  if (team.tag) return team.clanName ? `[${team.tag}] ${team.clanName}` : `[${team.tag}]`
  return team.players.slice(0, 2).join(', ') || `Équipe ${team.teamId}`
}

/** Bande des équipes : choisir l'escouade analysée par tout le débriefing (pages de 4, ou 2 sur mobile). */
function TeamStrip({
  teams,
  focusTeamId,
  busy,
  durationSeconds,
  phaseTicks,
  onSelect,
}: {
  teams: MatchTeamApi[]
  focusTeamId: number | null
  busy: boolean
  durationSeconds: number | null
  phaseTicks: number[]
  onSelect: (teamId: number) => void
}) {
  const wide = useMediaQuery('(min-width: 640px)')
  const perPage = wide ? 4 : 2
  const focusIndex = teams.findIndex((team) => team.teamId === focusTeamId)
  const [page, setPage] = useState<number | null>(null)
  const currentPage = clampPage(page ?? pageOfIndex(focusIndex, perPage), teams.length, perPage)
  const pageCount = Math.max(1, Math.ceil(teams.length / perPage))
  const visible = teams.slice(currentPage * perPage, currentPage * perPage + perPage)

  // Plusieurs escouades d'un même clan (manche interne) : on les distingue par leur premier joueur.
  const labelCounts = new Map<string, number>()
  for (const team of teams) labelCounts.set(teamLabel(team), (labelCounts.get(teamLabel(team)) ?? 0) + 1)
  const displayLabel = (team: MatchTeamApi) => {
    const label = teamLabel(team)
    return (labelCounts.get(label) ?? 0) > 1 && team.players[0] ? `${label} · ${team.players[0]}` : label
  }

  const prev = (
    <button type="button" className="debrief-icon-btn h-7 w-8 sm:h-auto sm:w-9" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Équipes précédentes">
      <ChevronLeft className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  )
  const next = (
    <button type="button" className="debrief-icon-btn h-7 w-8 sm:h-auto sm:w-9" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Équipes suivantes">
      <ChevronRight className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Escouade analysée</SectionLabel>
        <span className="text-xs text-gray-500" aria-live="polite">
          {busy ? 'Chargement de l’escouade…' : ''}
        </span>
      </div>
      <div className="flex items-stretch gap-2">
        <span className="hidden sm:flex">{prev}</span>
        <div className="grid min-w-0 flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${perPage}, minmax(0, 1fr))` }}>
          {visible.map((team) => {
            const selected = team.teamId === focusTeamId
            const winner = team.placement === 1 && !team.placementEstimated
            const placement = team.placement !== null ? `${team.placementEstimated ? '~' : ''}#${team.placement}` : '#?'
            const eliminated = team.eliminatedAt !== null && team.eliminatedAt !== undefined
            // Classée mais sans heure de fin (un joueur sans mort enregistrée) : éliminée, durée inconnue.
            const survival = winner ? 100 : eliminated ? survivalPercent(team.eliminatedAt, durationSeconds) : 0
            const status = winner
              ? wide
                ? 'Chicken dinner'
                : 'Top 1'
              : eliminated
                ? `${wide ? 'Out à ' : ''}${formatClock(team.eliminatedAt)}`
                : team.placement === null
                  ? 'Non classée'
                  : 'Éliminée'
            return (
              <button
                key={team.teamId}
                type="button"
                aria-pressed={selected}
                disabled={busy}
                onClick={() => onSelect(team.teamId)}
                title={`${displayLabel(team)} · ${team.players.join(', ')}${team.placementEstimated ? ' — classement estimé d’après l’ordre des éliminations' : ''}`}
                className={`relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-xl border px-3 pb-3 pt-2.5 text-left transition-colors disabled:cursor-wait ${
                  selected ? '' : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
                style={
                  selected
                    ? {
                        borderColor: 'var(--theme-ui-accent-ring)',
                        background: 'var(--theme-ui-accent-soft)',
                        boxShadow: '0 0 0 3px var(--theme-ui-accent-soft)',
                      }
                    : undefined
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md border border-gray-200 px-1.5 text-xs font-extrabold tabular-nums">
                    {winner && <Crown className="h-3 w-3" style={{ color: 'var(--debrief-warn)' }} aria-label="Vainqueur" />}
                    {team.placement !== null && team.placement <= 3 && !team.placementEstimated && !winner && (
                      <RankCell rank={team.placement} size="xs" />
                    )}
                    {placement}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13px] font-bold"
                    style={{ color: selected ? 'var(--theme-ui-accent-text)' : 'var(--theme-ui-text)' }}
                  >
                    {displayLabel(team)}
                  </span>
                  {selected && <ScanEye className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--theme-ui-accent)' }} aria-label="Escouade analysée" />}
                </span>
                <span className="flex items-center gap-2.5 whitespace-nowrap text-xs tabular-nums text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Crosshair className="h-3 w-3" style={{ color: 'var(--debrief-neg)' }} aria-hidden="true" />
                    <b className="text-gray-900">{team.kills}</b> kills
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1 overflow-hidden">
                    {winner ? (
                      <Trophy className="h-3 w-3 shrink-0" style={{ color: 'var(--debrief-warn)' }} aria-hidden="true" />
                    ) : (
                      <Skull className="h-3 w-3 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{status}</span>
                  </span>
                </span>
                <span
                  className="relative block h-1 rounded-full"
                  style={{ background: 'var(--debrief-track-strong)' }}
                  title={durationSeconds ? `Survie : ${survival} % de la partie` : undefined}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${durationSeconds ? survival : 0}%`,
                      background: selected ? 'var(--theme-ui-accent)' : winner ? 'var(--debrief-warn)' : 'var(--theme-ui-text-muted)',
                    }}
                  />
                  {durationSeconds
                    ? phaseTicks.map((t) => (
                        <span
                          key={t}
                          className="absolute -top-0.5 h-2 w-px"
                          style={{ left: `${Math.min(100, (t / durationSeconds) * 100)}%`, background: 'var(--theme-ui-surface)' }}
                          aria-hidden="true"
                        />
                      ))
                    : null}
                </span>
              </button>
            )
          })}
        </div>
        <span className="hidden sm:flex">{next}</span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          <span className="flex gap-1.5 sm:hidden">
            {prev}
            {next}
          </span>
          <span className="whitespace-nowrap text-xs tabular-nums text-gray-500">
            Équipes{' '}
            <b className="text-gray-900">
              {currentPage * perPage + 1}–{Math.min(teams.length, currentPage * perPage + perPage)}
            </b>{' '}
            sur {teams.length}
          </span>
          <span className="hidden gap-1 sm:flex" aria-hidden="true">
            {Array.from({ length: pageCount }, (_, index) => (
              <span
                key={index}
                className="h-1.5 rounded-full"
                style={{
                  width: index === currentPage ? 20 : 6,
                  background: index === currentPage ? 'var(--theme-ui-accent)' : 'var(--debrief-track-strong)',
                }}
              />
            ))}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setPage(pageOfIndex(focusIndex, perPage))}
          className="debrief-icon-btn h-7 gap-1.5 px-2.5 text-xs font-semibold"
          style={{ color: 'var(--theme-ui-accent-text)' }}
          aria-label="Revenir à l’escouade analysée"
        >
          <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Escouade analysée</span>
        </button>
      </div>
    </div>
  )
}

/** Vue tournoi : manche, points de chaque clan selon le barème, retour au classement général. */
function TournamentRoundBanner({ tournament, focusClanId }: { tournament: TournamentRoundApi; focusClanId: number | null }) {
  return (
    <section className="app-panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Trophy className="h-5 w-5 shrink-0" style={{ color: 'var(--debrief-warn)' }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--debrief-warn)' }}>
              Manche {tournament.roundNumber} / {tournament.totalRounds}
            </p>
            <p className="truncate text-base font-extrabold">{tournament.title}</p>
          </div>
        </div>
        <Link href={`/tournaments/${tournament.id}`} className="debrief-icon-btn h-8 gap-1.5 px-3 text-xs font-semibold">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Classement général du tournoi
        </Link>
      </div>
      {tournament.scores.length > 0 && (
        <div className="app-table-shell overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="text-gray-500">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold">Clan</th>
                <th className="px-2 py-1.5 text-center font-semibold">Place</th>
                <th className="px-2 py-1.5 text-center font-semibold">Kills</th>
                <th className="px-2 py-1.5 text-right font-semibold">Points de la manche</th>
              </tr>
            </thead>
            <tbody>
              {tournament.scores.map((score, index) => (
                <tr
                  key={score.clanId}
                  className="border-t border-gray-200"
                  style={score.clanId === focusClanId ? { background: 'var(--theme-ui-accent-tint)' } : undefined}
                >
                  <td className="px-2 py-1.5 font-semibold">
                    <span className="flex items-center gap-1.5">
                      <RankCell rank={index + 1} size="xs" />
                      {score.tag ? `[${score.tag}] ` : ''}
                      {score.name ?? `Clan #${score.clanId}`}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">#{score.bestPlacement}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{score.totalKills}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    <b>{score.points} pts</b>
                    <span className="ml-1.5 text-gray-500">
                      ({score.placementScore} placement + {score.killScore} kills
                      {score.winBonus ? ` + ${score.winBonus} victoire` : ''})
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const TABS: Array<{ value: DebriefTab; label: string; short: string; icon: typeof ListVideo }> = [
  { value: 'combat', label: 'Chronologie', short: 'Chrono', icon: ListVideo },
  { value: 'replay', label: 'Replay', short: 'Replay', icon: PlayCircle },
  { value: 'squad', label: 'Escouade', short: 'Escouade', icon: Users },
  { value: 'duels', label: 'Duels', short: 'Duels', icon: Swords },
]

// ── Vue ──────────────────────────────────────────────────────────────────────────────────────────

export function MatchDebriefView({
  context,
  matchId,
  period = 'week',
  fromDate = null,
}: {
  context: MatchDebriefContext
  matchId: string
  /** Vue clan : contexte de la liste d'origine, repris par le lien vers l'audit technique. */
  period?: 'week' | 'month'
  fromDate?: string | null
}) {
  const clanId = context.kind === 'clan' ? context.clanId : null
  const tournamentId = context.kind === 'tournament' ? context.tournamentId : null
  const apiBase = clanId ? `/api/clans/${clanId}/matches/${matchId}` : `/api/tournaments/${tournamentId}/matches/${matchId}`
  const pageHref = clanId ? matchDebriefPath(clanId, matchId) : matchTournamentDebriefPath(tournamentId ?? '', matchId)
  const fallbackParent = useMemo(
    () =>
      clanId
        ? { href: `/clans/${clanId}/matches`, label: 'Matchs', altHref: '/clans' }
        : { href: `/tournaments/${tournamentId}`, label: 'Tournoi', altHref: '/tournaments' },
    [clanId, tournamentId]
  )

  // Onglet porté par l'URL (`?tab=`) : lien partagé et retour arrière rouvrent le même onglet.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const activeTab = parseDebriefTab(searchParams.get(DEBRIEF_TAB_PARAM))
  const setActiveTab = useCallback(
    (tab: DebriefTab) => {
      const params = new URLSearchParams(searchParams.toString())
      if (tab === 'combat') params.delete(DEBRIEF_TAB_PARAM)
      else params.set(DEBRIEF_TAB_PARAM, tab)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<MatchTelemetryResponse['data'] | null>(null)
  // Escouade choisie dans la bande ; `null` = choix du serveur (équipe du clan, ou équipe championne en tournoi).
  const [teamId, setTeamId] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const hasPayloadRef = useRef(false)

  // Replay 2D — chargé uniquement à l'ouverture de l'onglet (payload dédié).
  const [replayData, setReplayData] = useState<MatchReplayData | null>(null)
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayError, setReplayError] = useState('')
  const [replayRetryToken, setReplayRetryToken] = useState(0)
  const [replayStart, setReplayStart] = useState<{ seconds: number; key: number } | null>(null)
  const replayRequestIdRef = useRef(0)
  const replayLoadedRef = useRef(false)

  useEffect(() => {
    if (!matchId) return

    let cancelled = false
    async function loadData() {
      // Premier chargement : squelette ; changement d'escouade : le contenu reste affiché pendant la requête.
      const isRefresh = hasPayloadRef.current
      try {
        if (isRefresh) setRefreshing(true)
        else setLoading(true)
        setError('')
        setRefreshError('')
        const res = await fetch(`${apiBase}/telemetry${teamId ? `?teamId=${teamId}` : ''}`, { cache: 'no-store' })
        const data = (await res.json().catch(() => null)) as MatchTelemetryResponse | null
        if (!res.ok || !data?.ok || !data.data?.match) {
          // Les liens des listes, du tableau de bord et de Discord mènent ici : les erreurs attendues
          // s'expliquent en français plutôt qu'avec le message technique de l'API.
          if (res.status === 401) throw new Error('Connectez-vous pour consulter ce débriefing.')
          if (data?.error?.code === 'TOURNAMENT_ROUND_NOT_FOUND') throw new Error("Ce match n'est pas une manche de ce tournoi.")
          if (data?.error?.code === 'TELEMETRY_NOT_FOUND') {
            throw new Error(
              "La télémétrie de ce match n'est pas disponible : elle n'a pas encore été traitée, ou PUBG ne la conserve plus (environ 14 jours)."
            )
          }
          throw new Error(data?.error?.message ?? 'Impossible de charger le débriefing du match')
        }
        if (!cancelled) {
          hasPayloadRef.current = true
          setPayload(data.data)
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Erreur lors du chargement.'
          if (isRefresh) setRefreshError(message)
          else setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [apiBase, matchId, teamId])

  useEffect(() => {
    if (activeTab !== 'replay' || !matchId || replayLoadedRef.current) return

    // Garde de fraîcheur plutôt qu'un drapeau d'annulation : sous StrictMode l'effet
    // est joué deux fois, et un nettoyage annulerait la seule requête réellement lancée.
    const requestId = replayRequestIdRef.current + 1
    replayRequestIdRef.current = requestId
    const isCurrent = () => replayRequestIdRef.current === requestId

    async function loadReplay() {
      try {
        setReplayLoading(true)
        setReplayError('')
        const res = await fetch(`${apiBase}/replay`)
        const data = (await res.json().catch(() => null)) as { ok?: boolean; data?: MatchReplayData; error?: { message?: string } } | null
        if (!res.ok || !data?.ok || !data.data) {
          throw new Error(data?.error?.message ?? `Replay indisponible pour ce match (HTTP ${res.status})`)
        }
        if (isCurrent()) {
          replayLoadedRef.current = true
          setReplayData(data.data)
        }
      } catch (err) {
        if (isCurrent()) setReplayError(err instanceof Error ? err.message : 'Erreur lors du chargement du replay.')
      } finally {
        if (isCurrent()) setReplayLoading(false)
      }
    }

    loadReplay()
  }, [activeTab, apiBase, matchId, replayRetryToken])

  const match = payload?.match
  const telemetry = payload?.telemetry
  const tournament = payload?.tournament ?? null
  const teams = useMemo(() => match?.teams ?? [], [match?.teams])
  const focusTeamId = match?.focus?.teamId ?? null
  const selectTeam = (nextTeamId: number) => {
    if (nextTeamId !== focusTeamId) setTeamId(nextTeamId)
  }
  const killEvents = useMemo(() => payload?.killEvents ?? [], [payload?.killEvents])
  const throwableStats = useMemo(() => payload?.throwableStats ?? [], [payload?.throwableStats])
  const memberIdentityMap = useMemo(() => payload?.memberIdentityMap ?? {}, [payload?.memberIdentityMap])
  const weaponLabels = useMemo(() => payload?.weaponLabels ?? {}, [payload?.weaponLabels])
  const clanTag = match?.clanTag || 'Clan'
  const otherTrackedClanTags = match?.otherTrackedClans ?? []
  const matchStartEpoch = match ? new Date(match.createdAt).getTime() / 1000 : 0
  const durationSeconds = match?.durationSeconds ?? null
  const phaseTicks = useMemo(() => phaseStartTimes(telemetry?.phaseSnapshots).map(({ t }) => t), [telemetry?.phaseSnapshots])
  const lobbyTeams = useMemo(
    () => teamCountFromPhaseSnapshots(parseJson(telemetry?.phaseSnapshots, null)),
    [telemetry?.phaseSnapshots]
  )

  const memberStats = useMemo(() => parseJson<Array<MemberStatsRow & { memberKey?: string }>>(telemetry?.memberStats, []), [telemetry?.memberStats])
  const weaponStats = useMemo(
    () => parseJson<Array<{ weaponName?: string; kills?: number; damageDealt?: number; shotsFired?: number; hitsLanded?: number }>>(telemetry?.weaponStats, []),
    [telemetry?.weaponStats]
  )
  const timelineEvents = useMemo<CombatEvent[]>(() => {
    const raw = payload?.combatEvents ?? telemetry?.combatEvents ?? []
    return Array.isArray(raw) ? raw : []
  }, [payload?.combatEvents, telemetry?.combatEvents])

  // Membres suivis de l'escouade mise en avant. Pas `SquadMatch.total*` : une manche de tournoi réunit
  // plusieurs équipes suivies sur la même ligne, ses totaux les additionnent toutes.
  const focusMembers = useMemo(() => match?.members ?? [], [match?.members])
  const squadMates = useMemo(() => payload?.squadMates ?? [], [payload?.squadMates])
  const clanTotals = focusMembers.reduce(
    (totals, member) => ({
      kills: totals.kills + member.kills,
      damage: totals.damage + member.damage,
      assists: totals.assists + member.assists,
      revives: totals.revives + member.revives,
    }),
    { kills: 0, damage: 0, assists: 0, revives: 0 }
  )
  const mateTotals = squadMates.reduce(
    (totals, mate) => ({ kills: totals.kills + mate.kills, damage: totals.damage + mate.damage, revives: totals.revives + mate.revives }),
    { kills: 0, damage: 0, revives: 0 }
  )

  const killFeedAvailable = payload?.killFeedAvailable === true
  const squadKills = useMemo(() => killEvents.filter((kill) => kill.isSquadKill ?? kill.isClanKill), [killEvents])
  const squadDeaths = useMemo(() => killEvents.filter((kill) => kill.isSquadVictim ?? kill.isClanVictim), [killEvents])
  // Kills de l'escouade selon les statistiques du match sans frag détaillé : typiquement un clan non synchronisé.
  const unlistedSquadKills = Math.max(0, clanTotals.kills + mateTotals.kills - squadKills.length)

  const squadCards = useMemo(
    () => [
      ...focusMembers.map((member) => {
        const stats = memberStats.find(
          (row) =>
            row.memberKey?.toLowerCase().includes(member.displayName.toLowerCase()) ||
            (row.memberKey ? memberIdentityMap[row.memberKey]?.name === member.displayName : false)
        )
        return {
          key: `member-${member.memberId}`,
          name: member.displayName,
          mate: null as SquadMateApi | null,
          kills: member.kills,
          damage: Math.round(member.damage),
          sub: `Assist. ${member.assists} · Réa. ${member.revives}`,
          stats,
          walk: member.walkDistance ?? null,
          ride: member.rideDistance ?? 0,
          throws: throwableSummary(throwableStats.filter((row) => row.memberId === member.memberId)),
        }
      }),
      ...squadMates.map((mate) => ({
        key: `mate-${mate.accountId}`,
        name: mate.name,
        mate: mate as SquadMateApi | null,
        kills: mate.kills,
        damage: Math.round(mate.damage),
        // La télémétrie ne compte pas les assistances.
        sub: `Réa. ${mate.revives}${mate.recalls > 0 ? ` · Rappels ${mate.recalls}` : ''}`,
        stats: memberStats.find((row) => row.memberKey?.toLowerCase() === mate.accountId.toLowerCase()),
        // Pas de distance pour un coéquipier non suivi : seule la télémétrie la donne, en centimètres et vol compris.
        walk: null as number | null,
        ride: 0,
        throws: '',
      })),
    ],
    [focusMembers, memberIdentityMap, memberStats, squadMates, throwableStats]
  )

  // Impacts anatomiques réels de l'escouade (LogPlayerTakeDamage.damageReason) ; absents avant le 2026-09-13.
  const squadBodyZones = telemetry?.squadBodyZones ?? null
  const bodyZonesAvailable = squadBodyZones?.available === true

  const showInReplay = useCallback(
    (seconds: number) => {
      setReplayStart({ seconds, key: Date.now() })
      setActiveTab('replay')
    },
    [setActiveTab]
  )

  if (loading) {
    return (
      <main className="debrief app-container app-main space-y-4">
        <NavigationTrail currentLabel="Débriefing" currentHref={pageHref} fallbackParent={fallbackParent} />
        <CardSkeleton className="h-48" />
        <CardSkeleton className="h-96" />
      </main>
    )
  }

  if (error || !match) {
    return (
      <main className="debrief app-container app-main space-y-4">
        <NavigationTrail currentLabel="Erreur" currentHref={pageHref} fallbackParent={fallbackParent} />
        <div className="app-panel p-6" role="alert">
          <p className="font-semibold" style={{ color: 'var(--debrief-neg)' }}>
            {error || 'Match introuvable.'}
          </p>
          <Link href={fallbackParent.href} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold hover:underline" style={{ color: 'var(--debrief-link)' }}>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> {clanId ? 'Retour à la liste des matchs' : 'Retour au tournoi'}
          </Link>
        </div>
      </main>
    )
  }

  const mapImage = mapAssetUrl(match.mapName)
  const outcome = match.placement === 1 ? 'Victoire' : match.placement <= 3 ? 'Podium' : 'Éliminés'
  const duration = formatMatchDuration(durationSeconds)
  const kpis = [
    {
      label: 'Kills',
      value: numberFormat.format(clanTotals.kills + mateTotals.kills),
      sub: squadMates.length > 0 ? `dont coéquipiers : ${mateTotals.kills}` : 'escouade',
      icon: Skull,
      color: 'var(--debrief-neg)',
    },
    {
      label: 'Dégâts',
      value: numberFormat.format(Math.round(clanTotals.damage + mateTotals.damage)),
      sub: squadMates.length > 0 ? `dont coéquipiers : ${numberFormat.format(Math.round(mateTotals.damage))}` : 'escouade',
      icon: Flame,
      color: 'var(--debrief-warn)',
    },
    {
      label: 'Assistances',
      value: numberFormat.format(clanTotals.assists),
      sub: squadMates.length > 0 ? 'membres suivis' : 'escouade',
      icon: Target,
      color: 'var(--debrief-sky)',
      title: squadMates.length > 0 ? 'La télémétrie ne compte pas les assistances : seules celles des membres suivis sont connues.' : undefined,
    },
    {
      label: 'Réanimations',
      value: numberFormat.format(clanTotals.revives + mateTotals.revives),
      sub: 'escouade',
      icon: HeartHandshake,
      color: 'var(--debrief-pos)',
    },
  ]

  const duelRow = (kill: KillEventApi, won: boolean) => {
    const at =
      typeof kill.timestampSeconds === 'number' && kill.timestampSeconds > matchStartEpoch
        ? formatClock(kill.timestampSeconds - matchStartEpoch)
        : '—'
    return (
      <li key={kill.id} className="debrief-row flex items-center gap-2.5 px-3.5 py-2 text-[13px]">
        <span className="w-10 shrink-0 text-xs tabular-nums text-gray-500">{at}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <b className="truncate" style={{ color: won ? (kill.isClanKill ? 'var(--debrief-pos)' : 'var(--debrief-mate)') : 'var(--theme-ui-text)' }}>
            {!won && kill.killerClanTag ? `[${kill.killerClanTag}] ` : ''}
            {kill.killerName}
          </b>
          <span className="shrink-0 text-gray-500" aria-hidden="true">
            →
          </span>
          <span className="truncate" style={{ color: won ? 'var(--theme-ui-text-secondary)' : kill.isClanVictim ? 'var(--debrief-neg)' : 'var(--debrief-mate)' }}>
            {won && kill.victimClanTag ? `[${kill.victimClanTag}] ` : ''}
            {kill.victimName}
          </span>
        </span>
        {kill.source === 'telemetry' && <TelemetryChip />}
        <span className="hidden whitespace-nowrap text-xs text-gray-700 sm:inline">
          {weaponDisplayName(kill.damageCauser, weaponLabels)}
          {kill.headshot ? ' · tête' : ''}
        </span>
        <span className="w-11 shrink-0 text-right text-xs tabular-nums text-gray-500">{kill.distance > 0 ? `${Math.round(kill.distance)} m` : ''}</span>
      </li>
    )
  }

  return (
    <main className="debrief app-container app-main flex flex-col gap-4">
      <NavigationTrail
        currentLabel={`Débriefing #${match.placement} · ${resolveMapName(match.mapName)}`}
        currentHref={pageHref}
        fallbackParent={fallbackParent}
      />

      {clanId && (
        <div className="-mt-2 flex justify-end">
          <Link
            href={matchTelemetryAuditPath(clanId, matchId, { period, fromDate: fromDate ?? undefined })}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-gray-500 hover:text-gray-900"
          >
            Audit technique <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {tournament && <TournamentRoundBanner tournament={tournament} focusClanId={match.focus?.clanId ?? null} />}

      {/* --- En-tête : carte, classement, escouade, indicateurs --- */}
      <section className="app-panel flex flex-col overflow-hidden p-0 sm:flex-row" aria-label="Résumé de la partie">
        <div
          className="relative h-[120px] shrink-0 bg-cover bg-center sm:h-auto sm:w-[220px]"
          style={{ backgroundColor: '#0b1120', backgroundImage: mapImage ? `url(${mapImage})` : undefined }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 to-slate-950/10" aria-hidden="true" />
          <div className="absolute bottom-3.5 left-4 flex flex-col gap-1 text-white">
            <PlacementBadge
              placement={match.placement}
              label={lobbyTeams ? `#${match.placement} / ${lobbyTeams}` : undefined}
              className="self-start"
            />
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-white/80">{outcome}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5 p-4 sm:px-5 sm:py-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.02em]">{resolveMapName(match.mapName)}</h1>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
              {resolveGameMode(match.gameMode)}
            </span>
            {!match.matchType || match.matchType === 'official' ? (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700">Officiel</span>
            ) : (
              <MatchTypeBadge matchType={match.matchType} size="sm" />
            )}
            <span className="text-xs text-gray-500">{[formatMatchDate(match.createdAt), duration].filter(Boolean).join(' · ')}</span>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label="Escouade">
            {focusMembers.map((member) => (
              <li key={member.memberId} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs">
                <span className="font-bold" style={{ color: 'var(--debrief-pos)' }}>
                  {member.displayName}
                </span>
                <span className="tabular-nums text-gray-500">
                  {member.kills} K · {numberFormat.format(Math.round(member.damage))}
                </span>
              </li>
            ))}
            {squadMates.map((mate) => (
              <li
                key={mate.accountId}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed bg-gray-50 px-2.5 py-1 text-xs"
                style={{ borderColor: 'var(--debrief-mate)' }}
                title={`${mate.name} — ${mate.knockouts} mise(s) à terre, ${mate.revives} réanimation(s), ${mate.recalls} rappel(s), ${mate.deaths} mort(s). Statistiques issues de la télémétrie.`}
              >
                <span className="font-bold" style={{ color: 'var(--debrief-mate)' }}>
                  {mate.name}
                </span>
                <MateBadge mate={mate} />
                <span className="tabular-nums text-gray-500">
                  {mate.kills} K · {numberFormat.format(Math.round(mate.damage))}
                </span>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {kpis.map((kpi) => {
              const Icon = kpi.icon
              return (
                <div key={kpi.label} className="app-panel-muted px-3 py-2.5" title={kpi.title}>
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
                    <Icon className="h-[13px] w-[13px] shrink-0" style={{ color: kpi.color }} aria-hidden="true" />
                    {kpi.label}
                  </dt>
                  <dd className="mt-0.5 text-2xl font-extrabold tabular-nums">{kpi.value}</dd>
                  <dd className="text-[11px] text-gray-500">{kpi.sub}</dd>
                </div>
              )
            })}
          </dl>
        </div>
      </section>

      {teams.length > 1 && (
        <TeamStrip
          teams={teams}
          focusTeamId={focusTeamId}
          busy={refreshing}
          durationSeconds={durationSeconds}
          phaseTicks={phaseTicks}
          onSelect={selectTeam}
        />
      )}
      {refreshError && (
        <p className="text-xs font-semibold" style={{ color: 'var(--debrief-neg)' }} role="alert">
          {refreshError}
        </p>
      )}

      {/* --- Onglets --- */}
      <div role="tablist" aria-label="Débriefing" className="flex gap-0 border-b border-gray-200 sm:gap-1">
        {TABS.map((tab, index) => {
          const active = tab.value === activeTab
          const Icon = tab.icon
          return (
            <button
              key={tab.value}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              type="button"
              role="tab"
              id={`debrief-tab-${tab.value}`}
              aria-selected={active}
              aria-controls={`debrief-panel-${tab.value}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab.value)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                event.preventDefault()
                const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length
                setActiveTab(TABS[nextIndex].value)
                tabRefs.current[nextIndex]?.focus()
              }}
              className={`-mb-px inline-flex flex-1 flex-col items-center justify-center gap-1 border-b-2 px-0.5 pb-2.5 pt-2 text-[11px] sm:flex-none sm:flex-row sm:gap-1.5 sm:px-3.5 sm:py-2.5 sm:text-sm ${
                active ? 'font-bold' : 'border-transparent font-medium text-gray-500 hover:text-gray-900'
              }`}
              style={active ? { borderColor: 'var(--theme-ui-accent)', color: 'var(--theme-ui-accent-text)' } : undefined}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="sm:hidden">{tab.short}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.value === 'combat' && (
                <span className="hidden rounded-full border border-gray-200 bg-gray-50 px-1.5 text-[11px] font-semibold tabular-nums text-gray-500 sm:inline">
                  {timelineEvents.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`debrief-panel-${activeTab}`} aria-labelledby={`debrief-tab-${activeTab}`} className={refreshing ? 'opacity-60 transition-opacity' : undefined}>
        {activeTab === 'combat' && (
          <MatchCombatTimeline
            events={timelineEvents}
            clanTag={clanTag}
            otherTrackedClanTags={otherTrackedClanTags}
            weaponLabels={weaponLabels}
            onShowInReplay={showInReplay}
          />
        )}

        {activeTab === 'replay' && (
          <section className="flex flex-col gap-4">
            {replayLoading && <CardSkeleton className="h-96" />}
            {replayError && !replayLoading && (
              <div className="app-panel flex flex-col items-start gap-3 p-6 text-sm font-semibold" role="alert">
                <p style={{ color: 'var(--debrief-neg)' }}>{replayError}</p>
                <button
                  type="button"
                  onClick={() => {
                    replayLoadedRef.current = false
                    setReplayError('')
                    setReplayRetryToken((token) => token + 1)
                  }}
                  className="debrief-icon-btn h-8 gap-1.5 px-3 text-xs font-bold"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Réessayer
                </button>
              </div>
            )}
            {!replayLoading && !replayError && !replayData && (
              <div className="app-panel p-6 text-sm font-semibold text-gray-500">Aucune donnée de replay renvoyée pour ce match.</div>
            )}
            {replayData && !replayLoading && (
              <MatchReplay2D data={replayData} focusTeamId={focusTeamId} focusTag={match.focus?.tag ?? null} startAt={replayStart} />
            )}
          </section>
        )}

        {activeTab === 'squad' && (
          <section className="flex flex-col gap-3.5">
            <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
              {squadCards.map((card) => {
                const accuracy = accuracyOf(card.stats)
                const mate = card.mate
                const color = mate ? 'var(--debrief-mate)' : 'var(--debrief-pos)'
                return (
                  <article
                    key={card.key}
                    className={`app-panel flex flex-col gap-3 p-3.5 ${mate ? 'border-dashed' : ''}`}
                    style={mate ? { borderColor: 'var(--debrief-mate)' } : undefined}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="app-panel-muted inline-flex h-9 w-9 shrink-0 items-center justify-center text-[13px] font-extrabold"
                        style={{ color }}
                        aria-hidden="true"
                      >
                        {card.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold" style={{ color }}>
                          {card.name}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {mate ? (
                            <>
                              <MateBadge mate={mate} /> · télémétrie · {card.sub}
                            </>
                          ) : (
                            card.sub
                          )}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[22px] font-extrabold tabular-nums">{card.kills}</p>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500">kills</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 tabular-nums">
                      <div>
                        <p className="text-[11px] text-gray-500">Dégâts infligés</p>
                        <p className="text-[15px] font-bold">{numberFormat.format(card.damage)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-500">Dégâts subis</p>
                        <p className="text-[15px] font-bold">
                          {card.stats?.damageTaken ? numberFormat.format(Math.round(card.stats.damageTaken)) : '—'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Précision</span>
                        {accuracy.percent !== null ? (
                          <b className="tabular-nums">
                            {accuracy.percent} % <span className="font-medium text-gray-500">({accuracy.hits}/{accuracy.shots})</span>
                          </b>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: 'var(--debrief-track)' }}>
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, (accuracy.percent ?? 0) * 2)}%`, background: 'var(--debrief-pos)' }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs text-gray-700">
                      {card.walk !== null && (
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">{formatDistance(card.walk)} à pied</span>
                      )}
                      {card.ride > 0 && (
                        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">{formatDistance(card.ride)} en véhicule</span>
                      )}
                      {card.throws && <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5">{card.throws}</span>}
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="app-panel flex flex-col gap-2.5 p-3.5">
              <h2 className="m-0 text-[15px] font-bold">Arsenal de l’escouade</h2>
              {weaponStats.length === 0 ? (
                <p className="text-xs text-gray-500">Aucune statistique d’arme disponible.</p>
              ) : (
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
                  {weaponStats.slice(0, 9).map((weapon) => {
                    const shots = Number(weapon.shotsFired) || 0
                    const hits = Number(weapon.hitsLanded) || 0
                    const percent = shots > 0 ? Math.round((hits / shots) * 100) : null
                    const tone = percent === null ? 'var(--theme-ui-text-muted)' : percent >= 30 ? 'var(--debrief-pos)' : percent >= 22 ? 'var(--debrief-warn)' : 'var(--debrief-neg)'
                    return (
                      <div key={weapon.weaponName} className="app-panel-muted flex flex-col gap-1.5 px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <b className="truncate text-sm">{weaponDisplayName(weapon.weaponName, weaponLabels)}</b>
                          <span className="whitespace-nowrap text-xs tabular-nums text-gray-500">
                            {weapon.kills || 0} K · {numberFormat.format(Math.round(weapon.damageDealt || 0))} dégâts
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full" style={{ background: 'var(--debrief-track)' }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (percent ?? 0) * 2)}%`, background: tone }} />
                          </div>
                          <span className="w-12 text-right text-xs font-bold tabular-nums">{percent !== null ? `${percent} %` : '—'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'duels' && (
          <section className="flex flex-col gap-3.5">
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
              {[
                { title: 'Duels gagnés', score: `+${squadKills.length}`, color: 'var(--debrief-pos)', rows: squadKills, won: true, empty: 'Aucune élimination enregistrée.' },
                { title: 'Duels perdus', score: `−${squadDeaths.length}`, color: 'var(--debrief-neg)', rows: squadDeaths, won: false, empty: 'Aucun membre éliminé.' },
              ].map((column) => (
                <div key={column.title} className="app-panel overflow-hidden p-0">
                  <div className="debrief-row flex items-baseline justify-between px-3.5 py-3" style={{ boxShadow: `inset 3px 0 0 ${column.color}` }}>
                    <h2 className="m-0 text-[15px] font-bold">{column.title}</h2>
                    <span className="text-[22px] font-extrabold tabular-nums" style={{ color: column.color }}>
                      {column.score}
                    </span>
                  </div>
                  {column.rows.length === 0 ? (
                    <p className="px-3.5 py-3 text-xs text-gray-500">{column.empty}</p>
                  ) : (
                    <ol>{column.rows.map((kill) => duelRow(kill, column.won))}</ol>
                  )}
                </div>
              ))}
            </div>
            {(unlistedSquadKills > 0 || !killFeedAvailable) && (
              <p className="text-xs text-gray-500">
                {!killFeedAvailable &&
                  "Match analysé avant l'enregistrement du kill-feed complet : seuls les frags des clans ayant synchronisé le match apparaissent. "}
                {unlistedSquadKills > 0 &&
                  `${unlistedSquadKills} kill${unlistedSquadKills > 1 ? 's' : ''} de l’escouade selon les statistiques du match ${
                    unlistedSquadKills > 1 ? 'ne sont pas détaillés' : 'n’est pas détaillé'
                  } ici.`}
              </p>
            )}

            <div className="app-panel flex flex-col gap-3.5 p-4">
              <div>
                <h2 className="m-0 text-[15px] font-bold">Zones d’impact</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  {bodyZonesAvailable
                    ? 'Touches localisées par la télémétrie. Les dégâts qu’un joueur s’inflige ne comptent pas comme infligés.'
                    : 'Match analysé avant la capture des zones d’impact : aucune répartition n’est inventée ici. Une nouvelle synchronisation télémétrie la calcule (matchs de moins de 14 jours).'}
                </p>
              </div>
              {bodyZonesAvailable && (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
                  {(['dealt', 'taken'] as const).map((direction) => {
                    const breakdown = squadBodyZones?.[direction]
                    const summary = zoneBars(breakdown)
                    const color = direction === 'dealt' ? 'var(--debrief-pos)' : 'var(--debrief-neg)'
                    return (
                      <div key={direction} className="app-panel-muted flex gap-3.5 px-3.5 py-3">
                        <div className="hidden w-[92px] shrink-0 sm:block">
                          <DamageBodySvg
                            damageByZone={toZoneRecord(breakdown, 'damage')}
                            hitsByZone={toZoneRecord(breakdown, 'hits')}
                            size="sm"
                            variant={direction === 'dealt' ? 'dealt' : 'received'}
                            showLabels={false}
                            showTooltips
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <b className="text-sm" style={{ color }}>
                              {direction === 'dealt' ? 'Tirs infligés' : 'Tirs subis'}
                            </b>
                            <span className="text-xs text-gray-500">
                              {summary.hits} touche{summary.hits > 1 ? 's' : ''}
                              {summary.headPercent !== null ? ` · ${summary.headPercent} % à la tête` : ''}
                            </span>
                          </div>
                          {summary.bars.map((bar) => (
                            <div key={bar.zone} className="grid items-center gap-2 text-xs tabular-nums [grid-template-columns:62px_1fr_72px]">
                              <span className="text-gray-700">{bar.label}</span>
                              <div className="h-2 rounded-full" style={{ background: 'var(--debrief-track)' }}>
                                <div className="h-2 rounded-full" style={{ width: `${bar.widthPercent}%`, background: color }} />
                              </div>
                              <span className="text-right text-gray-500">
                                {bar.hits} · {numberFormat.format(bar.damage)}
                              </span>
                            </div>
                          ))}
                          {summary.unlocalizedDamage > 0 && (
                            <p className="text-[11px] text-gray-500">
                              + {numberFormat.format(summary.unlocalizedDamage)} dégâts non localisés (
                              {direction === 'dealt' ? 'explosifs, véhicules…' : 'zone bleue, chute, explosion'})
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
