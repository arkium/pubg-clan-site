'use client'

import {
  Axe,
  Backpack,
  Bandage,
  Beer,
  Bomb,
  Car,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDashed,
  Crosshair,
  Crown,
  Droplet,
  Dumbbell,
  Flame,
  Footprints,
  Ghost,
  Handshake,
  HeartPulse,
  LayoutGrid,
  Medal,
  Pause,
  Play,
  Skull,
  Sprout,
  Target,
  Trophy,
  Truck,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

import ArmoryWeaponImage from '@/components/weapons/ArmoryWeaponImage'
import { SquadLabel } from '@/components/tournaments/TournamentDetailSections'
import PodiumSteps, { ClanLogo, PodiumPlate, PodiumStats } from '@/components/ui/PodiumSteps'
import RankCell from '@/components/ui/RankCell'
import ShowMoreToggle from '@/components/ui/ShowMoreToggle'
import SortableTh from '@/components/ui/SortableTh'
import {
  TOURNAMENT_MODE_DISPLAY,
  compactSquadLabel,
  formatTournamentPoints,
  formatTournamentStat,
  isViewerParticipant,
  leaderWindow,
  participantClanIds,
  squadLabelGroups,
  type TournamentViewer,
} from '@/lib/tournament-mode-display'
import type { TournamentMode } from '@/lib/tournament-service'
import type { TournamentStandingView } from '@/lib/tournament-standings-view'
import type {
  TournamentAward,
  TournamentAwardKey,
  TournamentAwardsView,
  TournamentClanAverage,
  TournamentLeader,
  TournamentLeaders as TournamentLeadersData,
  TournamentWeapon,
} from '@/lib/tournament-stats'
import { WEAPON_CATEGORY_LABELS } from '@/lib/weapons/weapon-categories'

/**
 * Statistiques de la page d'un tournoi (demande du 2026-10-11, après le tournoi [FR] du 10/10 — docs/features/tournois.md,
 * « Statistiques du tournoi ») : podium en marches comme la ligue, top killers et top scorers, moyenne par clan, awards
 * et fun facts en carrousel, armes du tournoi. Charte UI : surfaces sombres fixes (`.app-on-photo`) pour la mise en scène
 * (podium, fun facts, awards, armes), or de jeu pour les records, accent pour le lecteur et les états actifs.
 */

const decimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Le tag entre crochets d'un libellé « [FUN] FunsNRoses », et le reste. */
function splitTag(label: string) {
  const [group] = squadLabelGroups([label])
  return { tag: group?.tag ?? '', name: group?.names[0] ?? label }
}

// ── Podium ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Podium en marches 2-1-3, comme la Ligue inter-clans (demande du 2026-10-11) : logo du clan (celui du joueur en solo, le
 * premier clan d'une équipe), nom, tag, points, puis kills et Top 1.
 */
export function TournamentPodium({
  mode,
  standings,
  clanImages,
}: {
  mode: TournamentMode
  standings: TournamentStandingView[]
  clanImages: Record<string, string | null>
}) {
  if (standings.length === 0) return null
  const display = TOURNAMENT_MODE_DISPLAY[mode]
  return (
    <PodiumSteps
      ariaLabel="Podium du tournoi"
      title={`Podium · ${display.unit.many}`}
      emphasis
      entries={standings.slice(0, 3).map((standing) => {
        const team = standing.participant.kind === 'team'
        const { tag, name } = splitTag(standing.label)
        const clanId = participantClanIds(standing.participant)[0]
        const fullName = team ? compactSquadLabel(standing.memberLabels) || standing.label : name
        return {
          key: standing.key,
          position: standing.rank,
          testId: `tournament-podium-${standing.rank}`,
          identity: (
            <span className="flex min-w-0 max-w-full flex-col items-center gap-1" title={standing.label}>
              <ClanLogo imageUrl={clanId !== undefined ? (clanImages[String(clanId)] ?? null) : null} size={48} className="rounded-[14px] sm:h-14 sm:w-14" />
              <b className="max-w-full truncate text-sm font-extrabold tracking-tight sm:text-lg">{fullName}</b>
            </span>
          ),
          caption: team ? standing.clanTags.map((clanTag) => `[${clanTag}]`).join(' + ') || null : tag || null,
          // Points sur la plaque de score du podium (habillage esport, demande du 2026-10-11).
          value: <PodiumPlate value={formatTournamentPoints(standing.totalPoints)} unit="pts" />,
          // Kills et Top 1 en blanc ; sur mobile (colonnes de ~110 px), l'un sous l'autre plutôt que coupés.
          detail: <PodiumStats count={standing.totalKills} label="kills" wins={standing.wins} />,
        }
      })}
    />
  )
}

// ── Top killers et top scorers ──────────────────────────────────────────────────────────────────────

const LEADERS_TOP = 5

function LeaderRow({ entry, kind, mine }: { entry: TournamentLeader; kind: 'killers' | 'scorers'; mine: boolean }) {
  const first = entry.rank === 1
  const value = kind === 'killers' ? entry.kills : (entry.points ?? 0)
  return (
    <li
      className={`grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 px-4 py-2 ${mine ? 'tournament-row--viewer' : ''}`}
      aria-current={mine ? 'true' : undefined}
    >
      <span className="flex justify-center">
        <RankCell rank={entry.rank} size={first ? 'sm' : 'xs'} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`truncate text-gray-900 ${first ? 'text-[15px] font-bold' : 'text-sm'}`}>
            <SquadLabel memberLabels={[entry.label]} fallback={entry.label} />
          </span>
          {kind === 'killers' && first ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--game-gold-soft)] px-1.5 py-px text-[11px] font-extrabold uppercase text-[var(--game-gold)]">
              <Crown className="h-3 w-3" aria-hidden="true" />
              MVP
            </span>
          ) : null}
          {mine ? (
            <span className="shrink-0 rounded-md bg-[var(--theme-ui-accent-soft)] px-1.5 py-px text-[11px] font-extrabold uppercase text-[var(--theme-ui-accent-text)]">
              Toi
            </span>
          ) : null}
        </span>
        <span className="t-meta t-num">
          {kind === 'killers' ? `${integer.format(entry.damage)} dégâts` : `${entry.kills} kills`}
        </span>
      </span>
      <span className="flex items-baseline justify-end gap-1">
        <b className={first ? 't-hero t-hero--sm t-gold' : 't-num text-[15px] font-extrabold text-gray-900'}>
          {kind === 'killers' ? value : formatTournamentPoints(value)}
        </b>
        <span className="t-meta">{kind === 'killers' ? (value === 1 ? 'kill' : 'kills') : 'pts'}</span>
      </span>
    </li>
  )
}

function LeaderColumn({
  kind,
  title,
  hint,
  icon: Icon,
  entries,
  viewerKeys,
}: {
  kind: 'killers' | 'scorers'
  title: string
  hint: string
  icon: LucideIcon
  entries: TournamentLeader[]
  viewerKeys: ReadonlySet<string>
}) {
  const [expanded, setExpanded] = useState(false)
  const { top, viewer } = leaderWindow(entries, viewerKeys, LEADERS_TOP)
  const shown = expanded ? entries : top
  return (
    <section aria-label={title} className="app-panel flex min-w-0 flex-col overflow-hidden" data-testid={`tournament-${kind}`}>
      <div className="flex items-center gap-2.5 border-b border-gray-200 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--game-gold-soft)] shadow-[inset_0_0_0_1px_var(--game-gold-ring)]">
          <Icon className="h-[18px] w-[18px] text-[var(--game-gold)]" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col">
          <h2 className="t-card-title">{title}</h2>
          <span className="t-meta">{hint}</span>
        </span>
      </div>
      <ol className="flex flex-col py-1">
        {shown.map((entry) => (
          <LeaderRow key={entry.key} entry={entry} kind={kind} mine={viewerKeys.has(entry.key)} />
        ))}
        {!expanded && viewer ? (
          <>
            <li aria-hidden="true" className="px-4 text-center text-xs leading-3 text-gray-500">
              ⋮
            </li>
            <LeaderRow entry={viewer} kind={kind} mine />
          </>
        ) : null}
      </ol>
      {entries.length > LEADERS_TOP ? (
        <ShowMoreToggle
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          moreLabel={`Voir les ${entries.length} players`}
          lessLabel={`Revenir au top ${LEADERS_TOP}`}
          className="mt-0 rounded-none border-t border-gray-200"
        />
      ) : null}
    </section>
  )
}

/**
 * Deux colonnes sous le podium (demande du 2026-10-11) : top killers (le premier est le MVP du tournoi) et top scorers.
 * Top 5, puis la ligne du lecteur s'il est plus loin ; « Voir les N players » déplie tout le classement.
 */
export function TournamentLeaders({ leaders, viewer }: { leaders: TournamentLeadersData; viewer: TournamentViewer }) {
  if (leaders.killers.length === 0 && leaders.scorers.length === 0) return null
  const viewerKeys = new Set(viewer.memberIds.map((memberId) => `player:${memberId}`))
  return (
    <div className="grid gap-3 md:grid-cols-2 md:items-start">
      <LeaderColumn
        kind="killers"
        title="Top killers"
        hint="Kills sur toutes les manches, départagés par les dégâts"
        icon={Skull}
        entries={leaders.killers}
        viewerKeys={viewerKeys}
      />
      <LeaderColumn
        kind="scorers"
        title="Top scorers"
        hint="Points au barème : place de sa squad, ses kills, bonus Top 1"
        icon={Trophy}
        entries={leaders.scorers}
        viewerKeys={viewerKeys}
      />
    </div>
  )
}

// ── Moyenne par clan ────────────────────────────────────────────────────────────────────────────────

/**
 * Onglet « Moyenne par clan » (demande du 2026-10-11) : points des players du clan (détail par player) ÷ nombre de
 * players. Tous les clans sont classés ; le nombre de players est affiché à côté, comme dans le tableur des organisateurs.
 */
export function TournamentClanAverageTable({ entries, viewer }: { entries: TournamentClanAverage[]; viewer: TournamentViewer }) {
  const top = Math.max(1, entries[0]?.average ?? 1)
  return (
    <div className="app-table-shell overflow-hidden">
      <table className="w-full table-auto text-[13px]">
        <thead className="app-table-head">
          <tr>
            <SortableTh align="left" className="w-12 pl-3">Rang</SortableTh>
            <SortableTh align="left">Clan</SortableTh>
            <SortableTh align="left" className="max-md:text-right" title="Points des players du clan ÷ nombre de players">
              Moyenne
            </SortableTh>
            <SortableTh className="max-md:hidden" title="Players du clan classés au détail par player">Players</SortableTh>
            <SortableTh className="max-md:hidden" title="Somme des points de ses players au détail par player">Points</SortableTh>
            <SortableTh className="pr-3 max-md:hidden">Kills</SortableTh>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const mine = isViewerParticipant(entry.participant, viewer)
            return (
              <tr key={entry.key} className={`app-table-row${mine ? ' tournament-row--viewer' : ''}`} aria-current={mine ? 'true' : undefined}>
                <td className="py-2 pl-3 pr-[9px]">
                  <RankCell rank={entry.rank} />
                </td>
                <td className="min-w-0 px-[9px] py-2">
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <b className="truncate text-sm text-gray-900">{entry.label}</b>
                      {mine ? (
                        <span className="shrink-0 rounded-md bg-[var(--theme-ui-accent-soft)] px-1.5 py-px text-[11px] font-extrabold uppercase text-[var(--theme-ui-accent-text)]">
                          {TOURNAMENT_MODE_DISPLAY.inter_clan.viewer}
                        </span>
                      ) : null}
                    </span>
                    <span className="t-meta t-num md:hidden">
                      {entry.players} player{entry.players > 1 ? 's' : ''} · {formatTournamentPoints(entry.points)} pts · {entry.kills} kills
                    </span>
                  </span>
                </td>
                <td className="px-[9px] py-2 max-md:text-right">
                  <span className="flex items-center gap-2 max-md:justify-end">
                    <span className="h-2 min-w-[5rem] flex-1 overflow-hidden rounded-md bg-[var(--theme-ui-surface-strong)] max-md:hidden" aria-hidden="true">
                      <span className="block h-full rounded-md bg-[var(--tmode)]" style={{ width: `${Math.max(0, Math.round((entry.average / top) * 100))}%` }} />
                    </span>
                    <b className="t-num min-w-[3.25rem] text-right text-[15px] font-extrabold text-gray-900">{decimal.format(entry.average)}</b>
                  </span>
                </td>
                <td className="t-num px-[9px] py-2 text-right text-gray-700 max-md:hidden">{entry.players}</td>
                <td className="t-num px-[9px] py-2 text-right text-gray-700 max-md:hidden">{formatTournamentPoints(entry.points)}</td>
                <td className="t-num py-2 pl-[9px] pr-3 text-right text-gray-700 max-md:hidden">{entry.kills}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Awards et fun facts ─────────────────────────────────────────────────────────────────────────────

/** Charte §5 : pas d'emoji — une icône lucide par award, en or de jeu sur la carte sombre. */
const AWARD_ICONS: Record<TournamentAwardKey, LucideIcon> = {
  best_round: Zap,
  first_blood: Droplet,
  top_damage: Flame,
  knockouts: Axe,
  headshots: Target,
  sniper: Crosshair,
  revives: HeartPulse,
  assists: Handshake,
  damage_taken: Dumbbell,
  survivor: Sprout,
  jacky_tuning: Car,
  rodeur: Footprints,
  swimmer: Waves,
  boosts: Beer,
  heals: Bandage,
  blue_zone: CircleDashed,
  destructeur: Bomb,
  road_kills: Truck,
  collector: Backpack,
  first_out: Ghost,
}

const AUTOPLAY_MS = 6000
/** Un geste devient un glissement au-delà de 8 px, et seulement s'il est plus horizontal que vertical. */
const DRAG_START_PX = 8
/** Part d'une carte à glisser pour passer à la suivante ; en deçà, le carrousel revient en place. */
const DRAG_COMMIT_RATIO = 0.2
/** Au bord (première ou dernière carte), la piste résiste : on sent la limite sans la franchir. */
const DRAG_EDGE_RESISTANCE = 0.3

const WIDE_QUERY = '(min-width: 1024px)'
const MEDIUM_QUERY = '(min-width: 640px)'
function subscribeWidth(onChange: () => void) {
  const queries = [window.matchMedia(WIDE_QUERY), window.matchMedia(MEDIUM_QUERY)]
  for (const query of queries) query.addEventListener('change', onChange)
  return () => {
    for (const query of queries) query.removeEventListener('change', onChange)
  }
}
/** Cartes visibles à la fois : une sur mobile, deux à partir de 640 px, trois à partir de 1 024 px. */
const usePerView = () =>
  useSyncExternalStore(
    subscribeWidth,
    () => (window.matchMedia(WIDE_QUERY).matches ? 3 : window.matchMedia(MEDIUM_QUERY).matches ? 2 : 1),
    () => 1
  )

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const useReducedMotion = () =>
  useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => true)

function StatValue({ value, format, unit, hero }: { value: number; format: TournamentAward['format']; unit: string; hero?: boolean }) {
  const formatted = formatTournamentStat(value, format, unit)
  return (
    <span className="flex items-baseline gap-1 whitespace-nowrap">
      <b className={hero ? 't-hero text-[30px] leading-none text-[var(--game-gold)]' : 't-num text-[13px] font-extrabold text-white'}>{formatted.value}</b>
      {formatted.unit ? <span className={hero ? 'text-xs font-bold text-slate-300' : 'text-[11px] text-slate-400'}>{formatted.unit}</span> : null}
    </span>
  )
}

function RoundChip({ round }: { round: number | null }) {
  if (round === null) return null
  return (
    <span className="shrink-0 rounded-md border border-white/15 bg-white/10 px-1.5 py-px text-[11px] font-bold text-slate-200" title={`À la manche ${round}`}>
      M{round}
    </span>
  )
}

/** Une carte d'award, sombre dans les deux thèmes (mise en scène « esport ») : icône, règle, lauréat en or, suivants. */
function AwardCard({ award, number }: { award: TournamentAward; number: number }) {
  const Icon = AWARD_ICONS[award.key] ?? Medal
  const [winner, ...followers] = award.winners
  return (
    <article
      aria-label={award.label}
      className="app-on-photo relative flex h-full min-h-[218px] flex-col gap-3 overflow-hidden rounded-[14px] border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 p-4 text-slate-100"
    >
      <Icon className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 text-white/[0.05]" aria-hidden="true" />
      <span className="absolute right-3.5 top-3 font-mono text-[11px] font-bold text-slate-500" aria-hidden="true">
        {String(number).padStart(2, '0')}
      </span>
      <div className="flex items-start gap-3 pr-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--game-gold-soft)] shadow-[inset_0_0_0_1px_var(--game-gold-ring)]">
          <Icon className="h-5 w-5 text-[var(--game-gold)]" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-[15px] font-extrabold uppercase leading-tight tracking-[0.02em]">{award.label}</h3>
          <span className="text-xs text-slate-400">{award.description}</span>
        </span>
      </div>
      {winner ? (
        <div className="mt-auto flex flex-col gap-2" data-testid="tournament-award-winner">
          <div className="flex items-center gap-2.5">
            <RankCell rank={1} />
            <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-white">
              <SquadLabel memberLabels={[winner.label]} fallback={winner.label} />
            </span>
            <RoundChip round={winner.round} />
          </div>
          <StatValue value={winner.value} format={award.format} unit={award.unit} hero />
          {followers.length > 0 ? (
            <ol className="flex flex-col gap-1 border-t border-white/10 pt-2">
              {followers.map((entry, index) => (
                <li key={entry.memberId} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 text-[13px]">
                  <RankCell rank={index + 2} size="xs" />
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-slate-300">{entry.label}</span>
                    <RoundChip round={entry.round} />
                  </span>
                  <StatValue value={entry.value} format={award.format} unit={award.unit} />
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

/**
 * Awards du tournoi (demande du 2026-10-11) : fun facts en bandeau, puis les awards en carrousel — chevrons, glisser à la
 * souris ou au doigt, défilement automatique (arrêté au survol, au focus, pendant un glissement, en pause ou si le système
 * réduit les animations) — ou tous en grille (« Tout voir »). Le carrousel glisse sous un cadre fixe : jamais de
 * défilement horizontal (charte §4). Sur mobile, un geste vertical fait toujours défiler la page (`touch-action: pan-y`).
 */
export function TournamentAwards({ data }: { data: TournamentAwardsView }) {
  const perView = usePerView()
  const reducedMotion = useReducedMotion()
  const [index, setIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // Glissement en cours (souris ou doigt) : décalage de la piste en pixels, `null` au repos.
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; active: boolean } | null>(null)
  const count = data.awards.length
  const maxIndex = Math.max(0, count - perView)
  const current = Math.min(index, maxIndex)
  const canSlide = count > perView
  const paused = !canSlide || expanded || userPaused || hovered || focused || reducedMotion || dragOffset !== null

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => setIndex((value) => (Math.min(value, maxIndex) >= maxIndex ? 0 : Math.min(value, maxIndex) + 1)), AUTOPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [paused, current, maxIndex])

  if (count === 0 && data.facts.length === 0) return null
  const go = (next: number) => setIndex(Math.min(Math.max(0, next), maxIndex))
  const lastVisible = Math.min(count, current + perView)

  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false }
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.active) {
      // Geste surtout vertical : c'est la page qui défile, le carrousel laisse faire.
      if (Math.abs(dy) > DRAG_START_PX && Math.abs(dy) >= Math.abs(dx)) dragRef.current = null
      if (Math.abs(dx) < DRAG_START_PX || Math.abs(dx) <= Math.abs(dy)) return
      drag.active = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const atEdge = (dx > 0 && current === 0) || (dx < 0 && current >= maxIndex)
    setDragOffset(atEdge ? dx * DRAG_EDGE_RESISTANCE : dx)
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag?.active) return
    setDragOffset(null)
    if (cancelled) return
    const cardWidth = event.currentTarget.getBoundingClientRect().width / perView
    const dx = event.clientX - drag.startX
    // Une carte au-delà de 20 % de sa largeur, plusieurs pour un grand geste.
    const cards = Math.abs(dx) < cardWidth * DRAG_COMMIT_RATIO ? 0 : Math.max(1, Math.round(Math.abs(dx) / cardWidth))
    go(current + (dx < 0 ? cards : -cards))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <h2 className="t-section-title">Awards du tournoi</h2>
        <span className="t-meta">
          Distinctions fun sur {data.rounds} manche{data.rounds > 1 ? 's' : ''}
          {data.telemetryRounds < data.rounds
            ? ` · télémétrie lue sur ${data.telemetryRounds} manche${data.telemetryRounds > 1 ? 's' : ''} : certains awards l’ignorent`
            : ''}
        </span>
        {count > 0 ? (
          <span className="ml-auto flex items-center gap-1" role="group" aria-label="Défilement des awards">
            {!expanded && canSlide ? (
              <>
                <span className="t-num mr-1.5 whitespace-nowrap text-[13px] font-bold text-gray-500" aria-live="polite">
                  {current + 1}
                  {perView > 1 ? `–${lastVisible}` : ''} / {count}
                </span>
                <button type="button" className="app-pager-button" onClick={() => go(current - 1)} disabled={current === 0} aria-label="Awards précédents">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="app-pager-button" onClick={() => go(current + 1)} disabled={current >= maxIndex} aria-label="Awards suivants">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
                {reducedMotion ? null : (
                  <button
                    type="button"
                    className="app-pager-button"
                    onClick={() => setUserPaused((value) => !value)}
                    aria-pressed={userPaused}
                    aria-label={userPaused ? 'Reprendre le défilement' : 'Mettre le défilement en pause'}
                  >
                    {userPaused ? <Play className="h-3.5 w-3.5" aria-hidden="true" /> : <Pause className="h-3.5 w-3.5" aria-hidden="true" />}
                  </button>
                )}
              </>
            ) : null}
            {canSlide ? (
              // Bouton principal de la charte (`.charte .app-btn--primary`) : accent plein, encre sombre (demande du 2026-10-11).
              <button
                type="button"
                className="app-btn app-btn--sm app-btn--primary ml-1 gap-1.5 whitespace-nowrap"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />}
                {expanded ? 'Réduire' : 'Tout voir'}
              </button>
            ) : null}
          </span>
        ) : null}
      </div>

      {data.facts.length > 0 ? (
        <dl className="app-on-photo grid grid-cols-2 overflow-hidden rounded-[14px] border border-white/10 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 text-slate-100 md:grid-cols-4">
          {data.facts.map((fact, factIndex) => {
            const formatted = formatTournamentStat(fact.value, fact.format, fact.unit)
            return (
              <div
                key={fact.key}
                className={`flex min-w-0 flex-col gap-0.5 px-4 py-3 ${factIndex % 2 === 1 ? 'border-l border-white/10' : ''} ${
                  factIndex >= 2 ? 'max-md:border-t max-md:border-white/10' : ''
                } ${factIndex === 2 ? 'md:border-l md:border-white/10' : ''}`}
              >
                {/* Intitulé sur deux lignes au besoin (mobile) plutôt que coupé. */}
                <dt className="text-[11px] font-extrabold uppercase leading-tight tracking-[0.12em] text-slate-400">{fact.label}</dt>
                <dd className="mt-auto flex items-baseline gap-1">
                  <b className="t-hero text-[30px] leading-none text-[var(--game-gold)]">{formatted.value}</b>
                  <span className="text-xs font-bold text-slate-300">{formatted.unit}</span>
                </dd>
                {fact.detail ? <dd className="truncate text-xs text-slate-400">{fact.detail}</dd> : null}
              </div>
            )
          })}
        </dl>
      ) : null}

      {count > 0 ? (
        expanded || !canSlide ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Awards">
            {data.awards.map((award, awardIndex) => (
              <AwardCard key={award.key} award={award} number={awardIndex + 1} />
            ))}
          </div>
        ) : (
          <div
            className="flex flex-col gap-2"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
            }}
          >
            {/* Cadre fixe : la piste glisse dessous, rien ne défile de côté. */}
            <div
              className={`-mx-1.5 touch-pan-y select-none overflow-hidden ${dragOffset !== null ? 'cursor-grabbing' : 'cursor-grab'}`}
              aria-roledescription="carrousel"
              aria-label="Awards"
              data-testid="tournament-awards-carousel"
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={(event) => endDrag(event)}
              onPointerCancel={(event) => endDrag(event, true)}
              // Une image (médaille) ne doit pas partir en glisser-déposer natif à la place du carrousel.
              onDragStart={(event) => event.preventDefault()}
            >
              <div
                // Pendant le glissement, la piste suit le pointeur sans transition ; au lâcher, elle se cale en douceur.
                className={`flex ${dragOffset !== null ? '' : 'transition-transform duration-500 ease-out motion-reduce:transition-none'}`}
                style={{ transform: `translateX(calc(${-(current * 100) / perView}% + ${dragOffset ?? 0}px))` }}
              >
                {data.awards.map((award, awardIndex) => {
                  const visible = awardIndex >= current && awardIndex < current + perView
                  return (
                    <div
                      key={award.key}
                      className="shrink-0 px-1.5"
                      style={{ width: `${100 / perView}%` }}
                      aria-roledescription="diapositive"
                      aria-hidden={visible ? undefined : true}
                      inert={!visible}
                    >
                      <AwardCard award={award} number={awardIndex + 1} />
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Barre de lecture : se remplit en attendant la carte suivante ; absente en pause. */}
            <span className="h-[3px] overflow-hidden rounded-full bg-[var(--game-track-strong)]" aria-hidden="true">
              {paused ? null : (
                <span
                  key={current}
                  className="tournament-autoplay-bar block h-full bg-[var(--game-gold)]"
                  style={{ '--autoplay-ms': `${AUTOPLAY_MS}ms` } as CSSProperties}
                />
              )}
            </span>
          </div>
        )
      ) : null}
    </div>
  )
}

// ── Armes ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * Les 8 armes qui ont fait le plus de kills pendant le tournoi et leurs 3 meilleurs tireurs (demande du 2026-10-11).
 * Cartes sombres de l'armurerie (`.armory-showcase`), silhouette de l'arme, rangs par `RankCell`.
 */
/** Sur mobile, une colonne : les 4 premières armes, les suivantes à la demande. */
const WEAPONS_ON_MOBILE = 4

export function TournamentWeapons({ weapons, viewer }: { weapons: TournamentWeapon[]; viewer: TournamentViewer }) {
  const [expanded, setExpanded] = useState(false)
  if (weapons.length === 0) return null
  const viewerIds = new Set(viewer.memberIds)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 className="t-section-title">Armes du tournoi</h2>
        <span className="t-meta">
          Les {weapons.length} armes qui ont fait le plus de kills, et leurs 3 meilleurs tireurs
        </span>
      </div>
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {weapons.map((weapon, index) => (
          <li
            key={weapon.id}
            className={`armory-showcase app-on-photo flex min-w-0 flex-col overflow-hidden rounded-[14px] ${
              !expanded && index >= WEAPONS_ON_MOBILE ? 'max-sm:hidden' : ''
            }`}
            data-testid="tournament-weapon"
          >
            <div className="relative h-[76px] sm:h-[96px]">
              {/* Rang et catégorie à gauche (coupée si trop longue), kills à droite : jamais l'un sur l'autre. */}
              <span className="absolute inset-x-2.5 top-2 flex items-center gap-1.5">
                <RankCell rank={index + 1} size="xs" className={index >= 3 ? 'pl-0 text-white/70' : ''} />
                <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.1em] text-white/60">
                  {WEAPON_CATEGORY_LABELS[weapon.category]}
                </span>
                <span className="flex shrink-0 items-baseline gap-1">
                  <b className="t-hero text-[24px] leading-none text-[var(--game-gold)]">{weapon.kills}</b>
                  <span className="text-[11px] font-bold text-white/70">kills</span>
                </span>
              </span>
              <span className="absolute inset-x-0 bottom-1 top-8" aria-hidden="true">
                <ArmoryWeaponImage id={weapon.iconId} variant="card" onDark />
              </span>
            </div>
            <div className="flex flex-col gap-1.5 border-t border-white/10 px-3 pb-3 pt-2.5">
              <b className="truncate text-[15px] text-white">{weapon.name}</b>
              <ol className="flex flex-col gap-1" aria-label={`Meilleurs tireurs au ${weapon.name}`}>
                {weapon.shooters.map((shooter, shooterIndex) => {
                  const mine = viewerIds.has(shooter.memberId)
                  return (
                    <li
                      key={shooter.memberId}
                      className={`grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 py-0.5 text-[13px] ${
                        mine ? 'bg-[var(--theme-ui-accent-soft)]' : ''
                      }`}
                    >
                      <RankCell rank={shooterIndex + 1} size="xs" />
                      <span className="truncate text-white/85">{shooter.label}</span>
                      <span className="t-num whitespace-nowrap font-extrabold text-white">
                        {shooter.kills} <span className="text-[11px] font-normal text-white/60">kill{shooter.kills > 1 ? 's' : ''}</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          </li>
        ))}
      </ol>
      {weapons.length > WEAPONS_ON_MOBILE ? (
        <ShowMoreToggle
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          moreLabel={`Voir les ${weapons.length} armes`}
          lessLabel={`Revenir aux ${WEAPONS_ON_MOBILE} premières`}
          className="mt-0 sm:hidden"
        />
      ) : null}
    </div>
  )
}
