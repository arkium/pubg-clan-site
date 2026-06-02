'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import SessionRecap from '@/components/SessionRecap'
import SquadSynergies from '@/components/SquadSynergies'
import TopPerformers from '@/components/TopPerformers'
import SegmentedControl from '@/components/ui/SegmentedControl'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import ClanSectionNav from '@/components/ClanSectionNav'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSquadMatches } from '@/hooks/useSquadMatches'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { SquadPeriod } from '@/types/squad-matches'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function periodLabel(period: SquadPeriod) {
  return period === 'week' ? 'Semaine' : 'Mois'
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

export default function ClanMatchesPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const { activeMemberId } = useAuthSession()

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const dashboardHref = activeMemberId ? `/members/${activeMemberId}/dashboard` : '/members'
  const [period, setPeriod] = useState<SquadPeriod>('week')
  const [gameMode, setGameMode] = useState('')

  const {
    clanName,
    availableModes,
    mapLabels,
    squads,
    stats,
    modePerformance,
    sessions,
    synergies,
    topPerformers,
    loading,
    error,
  } = useSquadMatches(clanId, period, gameMode)

  const modeMeta = {
    duo: { label: 'Duo', tone: 'border-sky-200 bg-sky-50 text-sky-800' },
    trio: { label: 'Trio', tone: 'border-violet-200 bg-violet-50 text-violet-800' },
    squad: { label: 'Squad', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  } as const

  const gameModeOptions = useMemo(
    () => [
      { value: '', label: 'Tous' },
      { value: 'duo', label: 'Duo', disabled: !availableModes.includes('duo') },
      { value: 'trio', label: 'Trio', disabled: !availableModes.includes('trio') },
      { value: 'squad', label: 'Squad', disabled: !availableModes.includes('squad') },
    ],
    [availableModes]
  )

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

  if (!clanId) {
    return null
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <header className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {clanName || `Clan #${clanId}`} | Matchs
            </h1>
            <p className="text-sm text-gray-600">
              Performance collective du clan sur la période sélectionnée.
            </p>
            <ClanSectionNav clanId={clanId} />
          </div>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Période</p>
          <SegmentedControl
            options={[
              { value: 'week', label: 'Semaine' },
              { value: 'month', label: 'Mois' },
            ]}
            value={period}
            onChange={(value) => {
              setPeriod(value)
              setGameMode('')
            }}
            size="sm"
            wrap
            fullWidthOnMobile
          />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Mode de jeu</p>
          <SegmentedControl
            options={gameModeOptions}
            value={gameMode}
            onChange={setGameMode}
            size="sm"
            wrap
            fullWidthOnMobile
          />
        </div>
      </div>

      {loading ? <p className="mb-6 text-sm text-gray-600">Chargement des matchs en équipe...</p> : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Éliminations totales ({periodLabel(period)})</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">{stats.totalKills}</p>
            </article>
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Dégâts totaux</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">{Math.round(stats.totalDamage)}</p>
            </article>
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Taux de victoire équipe</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">{(stats.winRate * 100).toFixed(1)}%</p>
            </article>
            <article className="flex min-h-28 flex-col rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Matchs joués ensemble</p>
              <p className="mt-auto self-end text-right text-2xl font-bold text-gray-900 tabular-nums">{stats.matchCount}</p>
            </article>
          </section>

          <section className="mb-6 rounded border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Performances duo/trio/squad</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {modePerformance.map((mode) => (
                <article key={mode.mode} className={`rounded border p-3 ${modeMeta[mode.mode].tone}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <TeamModeBadge mode={mode.mode} label={modeMeta[mode.mode].label} size="sm" className="shadow-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Matchs</span>
                      <span className="text-right font-semibold tabular-nums">{mode.matches}</span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Éliminations</span>
                      <span className="text-right font-semibold tabular-nums">{mode.kills}</span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>W/L</span>
                      <span className="text-right font-semibold tabular-nums">
                        {mode.wins}/{mode.losses}
                      </span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Dégâts</span>
                      <span className="text-right font-semibold tabular-nums">{Math.round(mode.damage)}</span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Aides</span>
                      <span className="text-right font-semibold tabular-nums">{mode.assists}</span>
                    </p>
                    <p className="flex items-baseline justify-between gap-2">
                      <span>Durée</span>
                      <span className="text-right font-semibold tabular-nums">{formatDuration(mode.durationSeconds)}</span>
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="space-y-6">
            <SquadSynergies clanId={clanId} period={period} synergies={synergies} />
            <TopPerformers performers={topPerformers} />
            <SessionRecap clanId={clanId} period={period} gameMode={gameMode || undefined} sessions={sessions} />
          </div>
        </>
      ) : null}
    </main>
  )
}
