import { useEffect, useMemo, useState } from 'react'
import { Users, Shield, Zap, HeartPulse, Target, Flame } from 'lucide-react'

import TeamModeBadge, { teamModeFromMemberCount } from '@/components/ui/TeamModeBadge'
import PlayerNameBadge from '@/components/ui/PlayerNameBadge'

import type { SquadSynergiesData } from '@/types/squad-matches'
import type { SquadPeriod } from '@/types/squad-matches'

interface SquadSynergiesProps {
  clanId: number
  period: SquadPeriod
  synergies: SquadSynergiesData
}

type TelemetrySynergyRow = {
  memberAId: number
  memberAName: string
  memberBId: number
  memberBName: string
  reviveCount: number
  coKillCount: number
  sharedDamageEvents: number
}

type SynergyTab = 'classic' | 'telemetry'
const SYNERGY_SCORE_FORMULA = 'Formule: score binome = revive x3 + co-kill x2 + sharedDamage; indice = (score moyen / meilleur score) x100.'

function formatInteger(value: number) {
  return Math.round(value).toLocaleString('fr-FR')
}

function formatWinRate(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function SynergyList({
  title,
  entries,
  icon: Icon,
}: {
  title: string
  entries: SquadSynergiesData['topPairs']
  icon: any
}) {
  return (
    <div className="app-panel p-3">
      <div className="mb-3 flex items-center gap-2 text-blue-500">
        <Icon className="h-4 w-4" />
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs italic text-gray-500">Pas encore assez de données.</p>
      ) : (
        <ul className="grid gap-2">
          {entries.map((entry) => {
            const teamMode = teamModeFromMemberCount(entry.memberNames.length)

            return (
              <li key={entry.memberIds.join(':')} className="rounded border border-gray-200 bg-gray-50 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {entry.memberNames.map((memberName) => (
                      <PlayerNameBadge key={`${entry.memberIds.join(':')}:${memberName}`} name={memberName} />
                    ))}
                  </div>
                  <TeamModeBadge mode={teamMode} className="scale-90 shadow-none origin-right" />
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
                  <span><strong className="text-gray-900">{entry.matchesPlayed}</strong> matchs</span>
                  <span><strong className="text-gray-900">{entry.totalKills}</strong> kills</span>
                  <span className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-500">
                    {formatWinRate(entry.winRate)} WR
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function SquadSynergies({ clanId, period, synergies }: SquadSynergiesProps) {
  const [tab, setTab] = useState<SynergyTab>('classic')
  const [telemetryRows, setTelemetryRows] = useState<TelemetrySynergyRow[]>([])
  const [telemetryLoading, setTelemetryLoading] = useState(false)
  const [telemetryError, setTelemetryError] = useState('')

  useEffect(() => {
    if (tab !== 'telemetry') {
      return
    }

    let cancelled = false

    async function loadTelemetrySynergies() {
      try {
        setTelemetryLoading(true)
        setTelemetryError('')

        const response = await fetch(`/api/clans/${clanId}/telemetry/synergies?period=${period}`, {
          cache: 'no-store',
        })
        const payload = (await response.json()) as { rows?: TelemetrySynergyRow[]; error?: string }

        if (!response.ok) {
          throw new Error(payload.error ?? 'Impossible de charger les synergies telemetry')
        }

        if (!cancelled) {
          setTelemetryRows(payload.rows ?? [])
        }
      } catch (error) {
        if (!cancelled) {
          setTelemetryRows([])
          setTelemetryError(
            error instanceof Error ? error.message : 'Impossible de charger les synergies telemetry'
          )
        }
      } finally {
        if (!cancelled) {
          setTelemetryLoading(false)
        }
      }
    }

    void loadTelemetrySynergies()

    return () => {
      cancelled = true
    }
  }, [clanId, period, tab])

  const topReviveRows = useMemo(
    () => [...telemetryRows].sort((a, b) => b.reviveCount - a.reviveCount).slice(0, 10),
    [telemetryRows]
  )

  const topCoKillRows = useMemo(
    () => [...telemetryRows].sort((a, b) => b.coKillCount - a.coKillCount).slice(0, 10),
    [telemetryRows]
  )

  const telemetrySummary = useMemo(() => {
    const pairCount = telemetryRows.length
    const totalRevives = telemetryRows.reduce((sum, row) => sum + row.reviveCount, 0)
    const totalCoKills = telemetryRows.reduce((sum, row) => sum + row.coKillCount, 0)
    const totalSharedDamage = telemetryRows.reduce((sum, row) => sum + row.sharedDamageEvents, 0)

    const weightedScores = telemetryRows.map(
      (row) => row.reviveCount * 3 + row.coKillCount * 2 + row.sharedDamageEvents
    )
    const maxScore = weightedScores.reduce((max, score) => Math.max(max, score), 0)
    const avgScore =
      weightedScores.length > 0
        ? weightedScores.reduce((sum, score) => sum + score, 0) / weightedScores.length
        : 0

    const qualityIndex = maxScore > 0 ? Math.min(100, (avgScore / maxScore) * 100) : 0

    return {
      pairCount,
      totalRevives,
      totalCoKills,
      totalSharedDamage,
      avgScore,
      qualityIndex,
    }
  }, [telemetryRows])

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-700">Synergies d'équipe</h3>

        <div className="inline-flex rounded-lg bg-gray-100 p-0.5 shadow-inner">
          <button
            type="button"
            onClick={() => setTab('classic')}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
              tab === 'classic' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Résultats
          </button>
          <button
            type="button"
            onClick={() => setTab('telemetry')}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${
              tab === 'telemetry' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Télémétrie
          </button>
        </div>
      </div>

      {tab === 'classic' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SynergyList title="Meilleurs binômes" icon={Users} entries={synergies.topPairs} />
          <SynergyList title="Meilleures escouades (3-4 joueurs)" icon={Shield} entries={synergies.topSquads} />
        </div>
      ) : (
        <div className="app-panel p-3">
          {telemetryLoading ? <p className="text-sm text-gray-500">Chargement des synergies telemetry...</p> : null}
          {telemetryError ? <p className="text-sm text-amber-500">{telemetryError}</p> : null}

          {!telemetryLoading && !telemetryError ? (
            telemetryRows.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 mb-5">
                  <article className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-indigo-500" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Indice synergie</p>
                    </div>
                    <p className="mt-1.5 text-2xl font-black text-indigo-500">
                      {telemetrySummary.qualityIndex.toFixed(1)} <span className="text-xs font-medium text-indigo-400">/ 100</span>
                    </p>
                  </article>

                  <article className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Binômes actifs</p>
                    <p className="mt-1.5 text-xl font-black text-gray-900">{formatInteger(telemetrySummary.pairCount)}</p>
                  </article>

                  <article className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                    <div className="flex items-center gap-2">
                      <HeartPulse className="h-3.5 w-3.5 text-emerald-500" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Total Revives</p>
                    </div>
                    <p className="mt-1.5 text-xl font-black text-emerald-500">{formatInteger(telemetrySummary.totalRevives)}</p>
                  </article>

                  <article className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-3.5 w-3.5 text-orange-500" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-orange-500">Total Co-kills</p>
                    </div>
                    <p className="mt-1.5 text-xl font-black text-orange-500">{formatInteger(telemetrySummary.totalCoKills)}</p>
                  </article>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
                      <HeartPulse className="h-4 w-4 text-emerald-500" />
                      Top Sauvetages
                    </h3>
                    <ul className="grid gap-1.5">
                      {topReviveRows.map((row) => (
                        <li key={`revive:${row.memberAId}:${row.memberBId}`} className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-2.5 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            <PlayerNameBadge name={row.memberAName} />
                            <PlayerNameBadge name={row.memberBName} />
                          </div>
                          <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-500">
                            {row.reviveCount}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-900">
                      <Target className="h-4 w-4 text-orange-500" />
                      Top Co-kills
                    </h3>
                    <ul className="grid gap-1.5">
                      {topCoKillRows.map((row) => (
                        <li key={`cokill:${row.memberAId}:${row.memberBId}`} className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-2.5 py-1.5">
                          <div className="flex flex-wrap gap-1">
                            <PlayerNameBadge name={row.memberAName} />
                            <PlayerNameBadge name={row.memberBName} />
                          </div>
                          <span className="rounded bg-orange-500/20 px-2 py-0.5 text-xs font-bold text-orange-500">
                            {row.coKillCount}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500">
                  <Flame className="h-4 w-4 text-red-500" />
                  Dégâts partagés : <span className="font-bold text-gray-900">{formatInteger(telemetrySummary.totalSharedDamage)}</span>
                  <span className="mx-2 text-gray-300">|</span>
                  Score moyen : <span className="font-bold text-gray-900">{telemetrySummary.avgScore.toFixed(1)}</span>
                </div>
              </>
            ) : (
              <p className="text-sm italic text-gray-500">Aucune donnee telemetry de synergie pour cette periode.</p>
            )
          ) : null}
        </div>
      )}
    </section>
  )
}
