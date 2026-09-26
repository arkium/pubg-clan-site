'use client'

import { Crown } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import Leaderboard from '@/components/Leaderboard'
import DistinctionStrip from '@/components/ui/DistinctionStrip'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import PodiumCards from '@/components/ui/PodiumCards'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { SortReminder } from '@/components/ui/SortableTh'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
import { useLeaderboard } from '@/hooks/useLeaderboard'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useTableSort } from '@/hooks/useTableSort'
import { computeDistinctions, distinctionsByMember } from '@/lib/distinctions'
import {
  formatInteger,
  formatKpm,
  LEADERBOARD_SORT_COLUMNS,
  rankLeaderboard,
  type LeaderboardSortKey,
} from '@/lib/leaderboard-sort'
import { STANDARD_PERIODS } from '@/lib/period'
import type { LeaderboardTeamMode } from '@/types/leaderboard'
import type { ClanMatchTypeFilter } from '@/types/squad-matches'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const MATCH_TYPE_OPTIONS: Array<{ value: ClanMatchTypeFilter; label: string }> = [
  { value: 'official', label: 'Officiel' },
  { value: 'casual', label: 'Casual' },
  { value: 'custom', label: 'Custom' },
  { value: 'all', label: 'Tous' },
]

const TEAM_MODE_OPTIONS: Array<{ value: LeaderboardTeamMode; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'solo', label: 'Solo' },
  { value: 'duo', label: 'Duo' },
  { value: 'trio', label: 'Trio' },
  { value: 'squad', label: 'Squad' },
]

const TEAM_MODE_HINT = '« Tous » regroupe Duo, Trio et Squad, sans le Solo'

function formatSyncDate(value: string | null) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Classement calculé en direct'
  const day = date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `Synchronisé le ${day} à ${time}`
}

/** Groupe de contrôles du bandeau : intitulé au repos seulement (docké, les contrôles restent seuls). */
function ToolbarGroup({ label, hint, showLabel, children }: { label: string; hint?: string; showLabel: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {showLabel ? (
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
          {label}
          {hint ? (
            <span
              title={hint}
              className="inline-grid h-3.5 w-3.5 place-items-center rounded-full border border-current text-[9px] normal-case"
            >
              <span aria-hidden="true">i</span>
              <span className="sr-only">{hint}</span>
            </span>
          ) : null}
        </span>
      ) : null}
      {children}
    </div>
  )
}

export default function LeaderboardPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [matchType, setMatchType] = useState<ClanMatchTypeFilter>('official')
  const [teamMode, setTeamMode] = useState<LeaderboardTeamMode>('all')
  // Tri par les en-têtes, côté client : l'API renvoie toutes les lignes, trier ne recharge rien.
  const { sortKey, sortDir, onSort, colTint } = useTableSort<LeaderboardSortKey>('kills')

  const { leaderboard, progression, lastUpdatedAt, loading, error } = useLeaderboard(
    periodReady ? clanId : null,
    period,
    'kills',
    matchType,
    teamMode
  )

  const rows = useMemo(() => rankLeaderboard(leaderboard, sortKey, sortDir), [leaderboard, sortKey, sortDir])
  const distinctions = useMemo(() => computeDistinctions(leaderboard), [leaderboard])
  const distinctionMap = useMemo(() => distinctionsByMember(distinctions), [distinctions])
  const sortColumn = LEADERBOARD_SORT_COLUMNS[sortKey]

  const podium = useMemo(
    () =>
      rankLeaderboard(leaderboard, sortKey, 'desc')
        .slice(0, 3)
        .map(({ entry }) => ({
          key: entry.id,
          name: entry.displayName,
          href: `/members/${entry.memberId}/dashboard`,
          avatarUrl: entry.avatarUrl,
          subline: `${formatInteger(entry.matchesPlayed)} matchs · ${formatKpm(entry.avgKillsPerGame)} K/M`,
          value: LEADERBOARD_SORT_COLUMNS[sortKey].format(entry),
          distinctions: distinctionMap.get(entry.memberId),
        })),
    [leaderboard, sortKey, distinctionMap]
  )

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  if (!clanId) return null

  return (
    // Le shell fournit déjà <main> : une page à bandeau n'en ouvre pas un second.
    <div className="flex-1">
      <div className="app-container app-gutter pt-8">
        <NavigationTrail
          currentLabel="Classement"
          currentHref={`/clans/${clanId}/leaderboard`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        {/* Hauteur du bandeau inchangée (décision du 2026-09-26) : seul son contenu suit la maquette. */}
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/leaderboard.jpg')`, backgroundPosition: 'center top' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Crown className="h-4 w-4 text-yellow-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">
                Classement du clan
              </h1>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-200 drop-shadow-md sm:mt-2 sm:gap-2.5 sm:text-[13px]">
              <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 font-semibold text-white">
                {leaderboard.length} membres
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              <span>{formatSyncDate(lastUpdatedAt)}</span>
            </p>
          </div>
        </header>
      </div>

      {/* Bandeau de filtres — standard des pages joueurs (docs/TODO/sticky.md §4.A, refonte-ui.md §4.A). Intitulés
          au repos ; docké sur ordinateur, les contrôles seuls et le rappel du tri. */}
      <DockingToolbar
        ariaLabel="Filtres du classement"
        dockedAside={<SortReminder label={sortColumn.label} sortDir={sortDir} />}
      >
        {({ isSticky, compact }) => (
          <div className="flex flex-wrap items-end gap-3">
            <ToolbarGroup label="Période" showLabel={!isSticky}>
              <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
            </ToolbarGroup>
            {!compact && (
              <ToolbarGroup label="Type de match" showLabel={!isSticky}>
                <SegmentedControl options={MATCH_TYPE_OPTIONS} value={matchType} onChange={setMatchType} size="sm" className="shrink-0" />
              </ToolbarGroup>
            )}
            {!compact && (
              <ToolbarGroup label="Mode d'escouade" hint={TEAM_MODE_HINT} showLabel={!isSticky}>
                <SegmentedControl options={TEAM_MODE_OPTIONS} value={teamMode} onChange={setTeamMode} size="sm" className="shrink-0" />
              </ToolbarGroup>
            )}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter pb-8">
        {loading && leaderboard.length === 0 ? <TableSkeleton className="mb-6" /> : null}
        {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

        {/* Pendant un rechargement, le classement précédent reste affiché : la page ne se replie pas
            sous le bandeau et ne remonte pas quand on change de période. */}
        {!error && (!loading || leaderboard.length > 0) ? (
          <div aria-busy={loading} className={`flex flex-col gap-4 ${loading ? 'opacity-60' : ''}`}>
            <PodiumCards entries={podium} metricLabel={sortColumn.label} />
            <DistinctionStrip
              items={distinctions.map((distinction) => ({
                key: distinction.key,
                memberName: distinction.entry.displayName,
                value: distinction.value,
              }))}
            />
            <Leaderboard
              rows={rows}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              colTint={colTint}
              teamMode={teamMode}
              distinctions={distinctionMap}
              progression={progression}
              showPerformanceDelta={period !== 'all'}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
