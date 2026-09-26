'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, Crosshair, Flame, Gamepad2, Swords, Trophy } from 'lucide-react'

import { KpiGrid, MatchesBanner, type Kpi } from '@/components/matches/MatchesUi'
import SessionLogbook from '@/components/matches/SessionLogbook'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useSquadMatches } from '@/hooks/useSquadMatches'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { formatPlayTime, frDecimal, periodChipLabel } from '@/lib/match-sessions'

/** Les matchs du clan ne proposent que la semaine et le mois : une période mémorisée « Tous » est ignorée. */
const CLAN_MATCH_PERIODS = ['week', 'month'] as const
type ClanMatchPeriod = (typeof CLAN_MATCH_PERIODS)[number]

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const numberFormat = new Intl.NumberFormat('fr-FR')

function ModeIcon({ mode }: { mode: 'duo' | 'trio' | 'squad' }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/icons/squads/${mode}.svg`} width={14} height={14} alt="" aria-hidden="true" />
}

/**
 * Matchs du clan — refonte du 2026-09-26 (docs/features/matches.md, maquette Claude Design « Matchs et soirées »,
 * écrans 10a, 10c, 10e) : bandeau commun avec la page d'une soirée, indicateurs, carnet des soirées.
 */
export default function ClanMatchesPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(CLAN_MATCH_PERIODS, 'week')
  const [gameMode, setGameMode] = useState('')

  const {
    clanName,
    availableModes,
    stats,
    sessions,
    loading,
    error,
  } = useSquadMatches(periodReady ? clanId : null, period, gameMode)
  const showLoading = loading || !periodReady
  const hasMatches = stats.matchCount > 0

  const gameModeOptions = useMemo(
    () => [
      { value: '', label: 'Tous' },
      { value: 'duo', label: 'Duo', icon: <ModeIcon mode="duo" />, disabled: !availableModes.includes('duo') },
      { value: 'trio', label: 'Trio', icon: <ModeIcon mode="trio" />, disabled: !availableModes.includes('trio') },
      { value: 'squad', label: 'Squad', icon: <ModeIcon mode="squad" />, disabled: !availableModes.includes('squad') },
    ],
    [availableModes]
  )
  const totalDuration = sessions.reduce((total, session) => total + session.totalDuration, 0)
  const games = stats.matchCount
  const wins = Math.round(stats.winRate * games)
  const kpis: Kpi[] = [
    { label: 'Kills', value: numberFormat.format(stats.totalKills), detail: `${games ? frDecimal(stats.totalKills / games) : '0'} par partie`, icon: Crosshair, color: 'var(--game-neg)' },
    {
      label: 'Dégâts',
      value: numberFormat.format(Math.round(stats.totalDamage)),
      detail: `${games ? numberFormat.format(Math.round(stats.totalDamage / games)) : '0'} par partie`,
      icon: Flame,
      color: 'var(--game-warn)',
    },
    { label: 'Top 1', value: numberFormat.format(wins), detail: `${frDecimal(stats.winRate * 100)} % des parties`, icon: Trophy, color: 'var(--game-gold)' },
    { label: 'Parties', value: numberFormat.format(games), detail: 'ensemble, en escouade', icon: Swords, color: 'var(--theme-ui-accent)' },
    { label: 'Temps de jeu', value: formatPlayTime(totalDuration), detail: gameMode ? `mode ${gameMode}` : 'toutes soirées', icon: Clock3, color: 'var(--game-sky)' },
  ]

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  useEffect(() => {
    if (gameMode && !availableModes.includes(gameMode)) {
      setGameMode('')
    }
  }, [availableModes, gameMode])

  function changePeriod(value: ClanMatchPeriod) {
    setPeriod(value)
    setGameMode('')
  }

  if (!clanId) {
    return null
  }

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush game-ui flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Matchs"
          currentHref={`/clans/${clanId}/matches`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        <MatchesBanner
          image="/matches.jpg"
          icon={Swords}
          iconColor="#f87171"
          title={clanName ? `Matchs · ${clanName}` : 'Matchs du clan'}
          chips={[
            { icon: CalendarDays, text: periodChipLabel(period) },
            { icon: Gamepad2, text: `${games} partie${games > 1 ? 's' : ''} · ${sessions.length} soirée${sessions.length > 1 ? 's' : ''}` },
            ...(wins > 0 ? [{ icon: Trophy, text: `${wins} chicken dinner${wins > 1 ? 's' : ''}`, gold: true }] : []),
          ]}
        />
      </div>

      <DockingToolbar ariaLabel="Filtres des matchs du clan">
        {({ compact }) => (
          <div className="flex flex-wrap items-center gap-3">
            <PeriodFilter periods={CLAN_MATCH_PERIODS} value={period} onChange={changePeriod} />
            {!compact ? (
              <div role="group" aria-label="Mode de jeu">
                <SegmentedControl options={gameModeOptions} value={gameMode} onChange={setGameMode} size="sm" wrap />
              </div>
            ) : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter">
        {showLoading && !hasMatches ? <TableSkeleton className="mb-6" /> : null}
        {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

        {/* Rechargement : les résultats précédents restent affichés, estompés (la page ne se replie pas). */}
        {!error && (!showLoading || hasMatches) ? (
          <div aria-busy={showLoading} className={showLoading ? 'opacity-60' : undefined}>
            <KpiGrid items={kpis} className="mb-6 grid-cols-2 lg:grid-cols-5" />
            <SessionLogbook clanId={clanId} period={period} gameMode={gameMode || undefined} sessions={sessions} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
