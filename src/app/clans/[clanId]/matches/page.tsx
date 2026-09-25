'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Clock3, Crosshair, Gauge, ShieldCheck, Swords, type LucideIcon } from 'lucide-react'

import SquadMatchList from '@/components/SquadMatchList'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
import SessionRecap from '@/components/SessionRecap'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useAuthSession } from '@/hooks/useAuthSession'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useSquadMatches } from '@/hooks/useSquadMatches'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { PERIOD_LABELS } from '@/lib/period'

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

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

function MatchStatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  detail: string
  icon: LucideIcon
  tone: 'red' | 'amber' | 'emerald' | 'blue' | 'cyan'
}) {
  const toneClasses = {
    red: 'border-red-500/20 bg-red-500/10 text-red-500',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-500',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-500',
    cyan: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-500',
  }

  return (
    <article className="app-panel-muted flex min-h-40 flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="min-h-8 text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${toneClasses[tone]}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 text-right text-[1.75rem] font-black leading-none tabular-nums text-gray-900">
        {value}
      </p>
      <p className="mt-auto pt-2 text-right text-[11px] font-medium text-gray-500">{detail}</p>
    </article>
  )
}

export default function ClanMatchesPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const { activeMemberId } = useAuthSession()

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const dashboardHref = activeMemberId ? `/members/${activeMemberId}/dashboard` : '/members'
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(CLAN_MATCH_PERIODS, 'week')
  const [gameMode, setGameMode] = useState('')

  const {
    clanName,
    availableModes,
    mapLabels,
    squads,
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
      { value: 'duo', label: 'Duo', disabled: !availableModes.includes('duo') },
      { value: 'trio', label: 'Trio', disabled: !availableModes.includes('trio') },
      { value: 'squad', label: 'Squad', disabled: !availableModes.includes('squad') },
    ],
    [availableModes]
  )
  const totalDuration = sessions.reduce((total, session) => total + session.totalDuration, 0)

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
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Matchs"
          currentHref={`/clans/${clanId}/matches`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-center bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/matches.jpg')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Swords className="h-4 w-4 text-red-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">
                {clanName || `Clan #${clanId}`} · Matchs
              </h1>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
              Performance collective du clan.
            </p>
          </div>
        </header>
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
            <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <MatchStatCard
                label="Éliminations totales"
                value={stats.totalKills.toLocaleString('fr-FR')}
                detail={`${stats.matchCount > 0 ? (stats.totalKills / stats.matchCount).toFixed(1) : '0.0'} par match`}
                icon={Crosshair}
                tone="red"
              />
              <MatchStatCard
                label="Dégâts totaux"
                value={Math.round(stats.totalDamage).toLocaleString('fr-FR')}
                detail={`${stats.matchCount > 0 ? Math.round(stats.totalDamage / stats.matchCount).toLocaleString('fr-FR') : '0'} par match`}
                icon={Gauge}
                tone="amber"
              />
              <MatchStatCard
                label="Taux de victoire équipe"
                value={`${(stats.winRate * 100).toFixed(1)}%`}
                detail={`${Math.round(stats.winRate * stats.matchCount).toLocaleString('fr-FR')} victoires`}
                icon={ShieldCheck}
                tone="emerald"
              />
              <MatchStatCard
                label="Matchs joués ensemble"
                value={stats.matchCount.toLocaleString('fr-FR')}
                detail={PERIOD_LABELS[period]}
                icon={Swords}
                tone="blue"
              />
              <MatchStatCard
                label="Temps de jeu du clan"
                value={formatDuration(totalDuration)}
                detail={gameMode ? `Mode ${gameMode}` : 'Tous les modes'}
                icon={Clock3}
                tone="cyan"
              />
            </section>


            <div className="space-y-6">
              <SessionRecap clanId={clanId} period={period} gameMode={gameMode || undefined} sessions={sessions} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
