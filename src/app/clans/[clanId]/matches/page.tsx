'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import SessionRecap from '@/components/SessionRecap'
import SquadMatchList from '@/components/SquadMatchList'
import SquadSynergies from '@/components/SquadSynergies'
import TopPerformers from '@/components/TopPerformers'
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

export default function ClanMatchesPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const [period, setPeriod] = useState<SquadPeriod>('week')
  const [gameMode, setGameMode] = useState('')

  const {
    clanName,
    availableModes,
    squads,
    stats,
    sessions,
    synergies,
    topPerformers,
    loading,
    error,
  } = useSquadMatches(clanId, period, gameMode)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  if (!clanId) {
    return null
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {clanName || `Clan #${clanId}`} | Matchs ensemble
          </h1>
          <p className="text-sm text-gray-600">
            Performance collective du clan sur la période sélectionnée.
          </p>
        </div>
        <Link
          href="/members"
          className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Voir les membres
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Période</p>
          <div className="flex rounded border border-gray-200 p-1">
            {(['week', 'month'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setPeriod(value)
                  setGameMode('')
                }}
                className={`rounded px-3 py-1 text-sm font-medium ${
                  value === period
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {periodLabel(value)}
              </button>
            ))}
          </div>
        </div>

        <label className="text-sm text-gray-700">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
            Mode de jeu
          </span>
          <select
            value={gameMode}
            onChange={(event) => setGameMode(event.target.value)}
            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Tous</option>
            {availableModes.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="mb-6 text-sm text-gray-600">Chargement des matchs squad...</p> : null}
      {error ? <p className="mb-6 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total kills ({periodLabel(period)})</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{stats.totalKills}</p>
            </article>
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total damage</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{Math.round(stats.totalDamage)}</p>
            </article>
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Win rate squad</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{(stats.winRate * 100).toFixed(1)}%</p>
            </article>
            <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-gray-500">Matchs joués ensemble</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{stats.matchCount}</p>
            </article>
          </section>

          <div className="space-y-6">
            <SquadMatchList clanId={clanId} period={period} matches={squads} />
            <SquadSynergies synergies={synergies} />
            <SessionRecap sessions={sessions} />
            <TopPerformers performers={topPerformers} />
          </div>
        </>
      ) : null}
    </main>
  )
}
