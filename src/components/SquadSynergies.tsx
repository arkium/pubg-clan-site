import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { Users, Zap, HeartPulse, Target, Flame, RefreshCcw } from 'lucide-react'
import { Skeleton } from '@/components/ui/Skeleton'

import TeamModeBadge from '@/components/ui/TeamModeBadge'
import PlayerNameBadge from '@/components/ui/PlayerNameBadge'

import type { SquadSynergiesData } from '@/types/squad-matches'
import type { SquadPeriod } from '@/types/squad-matches'

interface SquadSynergiesProps {
  clanId: number
  period: SquadPeriod
  synergies: SquadSynergiesData
}

const MEDAL_ICONS = [
  '/icons/medal-gold.svg',
  '/icons/medal-silver.svg',
  '/icons/medal-bronze.svg',
]

function medalAlt(index: number) {
  if (index === 0) return 'Or'
  if (index === 1) return 'Argent'
  return 'Bronze'
}

type TelemetrySynergyRow = {
  memberAId: number
  memberAName: string
  memberBId: number
  memberBName: string
  reviveCount: number
  recallCount: number
  coKillCount: number
  sharedDamageEvents: number
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString('fr-FR')
}

function formatWinRate(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function formatDuration(seconds: number) {
  if (!seconds) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`
  return `${m}m`
}

function SynergyList({
  entries,
  mode,
}: {
  entries: SquadSynergiesData['topPairs']
  mode: 'duo' | 'trio' | 'squad'
}) {
  return (
    <div className="app-panel overflow-hidden">
      <header 
        className="relative border-b border-[var(--theme-ui-border)] h-28 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('/${mode}.jpg')` }}
      >
        <div className="absolute bottom-3 left-3">
          <TeamModeBadge mode={mode} size="sm" />
        </div>
      </header>
      <div className="p-4 bg-[var(--theme-bg-base)]">
      {entries.length === 0 ? (
        <p className="text-xs italic text-gray-500">Pas encore assez de données.</p>
      ) : (
        <ul className="flex flex-col">
          {entries.map((entry, index) => {
            return (
              <li
                key={entry.memberIds.join(':')}
                className="flex items-center justify-between gap-2 border-b border-[var(--theme-ui-border)] py-3 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                    {index < MEDAL_ICONS.length ? (
                      <Image src={MEDAL_ICONS[index]} alt={medalAlt(index)} width={20} height={20} className="drop-shadow-sm" />
                    ) : (
                      <span className="text-sm font-bold text-gray-500">{index + 1}</span>
                    )}
                  </div>
                  
                  <div className="flex flex-col items-start gap-1">
                    {entry.memberNames.map((memberName) => (
                      <PlayerNameBadge
                        key={`${entry.memberIds.join(':')}:${memberName}`}
                        name={memberName}
                      />
                    ))}
                  </div>
                </div>
                
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-right shrink-0">
                  <div>
                    <dd className="text-sm font-bold tabular-nums text-gray-900">{entry.matchesPlayed}</dd>
                    <dt className="text-[10px] font-semibold uppercase text-gray-500">Matchs</dt>
                  </div>
                  <div>
                    <dd className="text-sm font-bold tabular-nums text-gray-900">{entry.totalKills}</dd>
                    <dt className="text-[10px] font-semibold uppercase text-gray-500">Kills</dt>
                  </div>
                  <div>
                    <dd className="text-sm font-bold tabular-nums text-gray-900">{formatDuration(entry.totalDurationSeconds ?? 0)}</dd>
                    <dt className="text-[10px] font-semibold uppercase text-gray-500">Durée</dt>
                  </div>
                  <div>
                    <dd className="text-sm font-bold tabular-nums text-emerald-500">{formatWinRate(entry.winRate)}</dd>
                    <dt className="text-[10px] font-semibold uppercase text-gray-500">WR</dt>
                  </div>
                </dl>
              </li>
            )
          })}
        </ul>
      )}
      </div>
    </div>
  )
}

export default function SquadSynergies({ clanId, period, synergies }: SquadSynergiesProps) {
  const [telemetryRows, setTelemetryRows] = useState<TelemetrySynergyRow[]>([])
  const [telemetryLoading, setTelemetryLoading] = useState(false)
  const [telemetryError, setTelemetryError] = useState('')

  useEffect(() => {

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
  }, [clanId, period])

  const topReviveRows = useMemo(
    () => [...telemetryRows].sort((a, b) => b.reviveCount - a.reviveCount).slice(0, 10),
    [telemetryRows]
  )

  const topCoKillRows = useMemo(
    () => [...telemetryRows].sort((a, b) => b.coKillCount - a.coKillCount).slice(0, 10),
    [telemetryRows]
  )

  const topRecallRows = useMemo(
    () => [...telemetryRows].sort((a, b) => (b.recallCount ?? 0) - (a.recallCount ?? 0)).slice(0, 10),
    [telemetryRows]
  )

  const telemetrySummary = useMemo(() => {
    const pairCount = telemetryRows.length
    const totalRevives = telemetryRows.reduce((sum, row) => sum + row.reviveCount, 0)
    const totalRecalls = telemetryRows.reduce((sum, row) => sum + (row.recallCount ?? 0), 0)
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
      totalRecalls,
      totalCoKills,
      totalSharedDamage,
      avgScore,
      qualityIndex,
    }
  }, [telemetryRows])

  return (
    <section>
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Synergies d&apos;équipe</h3>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <SynergyList 
          mode="duo"
          entries={synergies.topPairs} 
        />
        <SynergyList 
          mode="trio"
          entries={synergies.topSquads.filter(s => s.memberIds.length === 3)} 
        />
        <SynergyList 
          mode="squad"
          entries={synergies.topSquads.filter(s => s.memberIds.length >= 4)} 
        />
      </div>

      <div className="mb-4 mt-8">
        <h3 className="text-sm font-semibold text-gray-700">Statistiques de Coopération</h3>
      </div>
      <div className="app-panel p-4">
          {telemetryLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : null}
          {telemetryError ? <p className="text-sm text-amber-500">{telemetryError}</p> : null}

          {!telemetryLoading && !telemetryError ? (
            telemetryRows.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 mb-5">
                  <article className="app-panel-muted relative overflow-hidden rounded-2xl px-4 py-3">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
                    <div className="relative">
                      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-500">
                        <Zap className="h-4 w-4" />
                      </div>
                      <p className="text-2xl font-black leading-none tabular-nums text-gray-900">
                        {telemetrySummary.qualityIndex.toFixed(1)} <span className="text-sm font-medium text-gray-400">/ 100</span>
                      </p>
                      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-gray-500">Indice synergie</p>
                    </div>
                  </article>

                  <article className="app-panel-muted relative overflow-hidden rounded-2xl px-4 py-3">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
                    <div className="relative">
                      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-500/15 text-gray-500">
                        <Users className="h-4 w-4" />
                      </div>
                      <p className="text-2xl font-black leading-none tabular-nums text-gray-900">{formatInteger(telemetrySummary.pairCount)}</p>
                      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-gray-500">Binômes actifs</p>
                    </div>
                  </article>

                  <article className="app-panel-muted relative overflow-hidden rounded-2xl px-4 py-3">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
                    <div className="relative">
                      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
                        <HeartPulse className="h-4 w-4" />
                      </div>
                      <p className="text-2xl font-black leading-none tabular-nums text-emerald-500">{formatInteger(telemetrySummary.totalRevives)}</p>
                      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-gray-500">Total Revives</p>
                    </div>
                  </article>

                  <article className="app-panel-muted relative overflow-hidden rounded-2xl px-4 py-3">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
                    <div className="relative">
                      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/15 text-orange-500">
                        <Target className="h-4 w-4" />
                      </div>
                      <p className="text-2xl font-black leading-none tabular-nums text-orange-500">{formatInteger(telemetrySummary.totalCoKills)}</p>
                      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-gray-500">Total Co-kills</p>
                    </div>
                  </article>

                  <article className="app-panel-muted relative overflow-hidden rounded-2xl px-4 py-3">
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-transparent" />
                    <div className="relative">
                      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-500">
                        <RefreshCcw className="h-4 w-4" />
                      </div>
                      <p className="text-2xl font-black leading-none tabular-nums text-blue-500">{formatInteger(telemetrySummary.totalRecalls)}</p>
                      <p className="mt-1.5 text-[10px] uppercase tracking-wide text-gray-500">Total Recalls</p>
                    </div>
                  </article>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="app-panel overflow-hidden">
                    <header 
                      className="relative h-28 border-b border-[var(--theme-ui-border)] bg-cover bg-center bg-no-repeat"
                      style={{ backgroundImage: `url('/sauvetage.jpg')` }}
                    >
                      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-bold text-white shadow-sm backdrop-blur-md">
                        <HeartPulse className="h-4 w-4 text-emerald-400" />
                        Top Sauvetages
                      </div>
                    </header>
                    <div className="bg-[var(--theme-bg-base)] p-4">
                      {topReviveRows.filter(r => r.reviveCount > 0).length > 0 ? (
                        <ul className="flex flex-col">
                          {topReviveRows.filter(r => r.reviveCount > 0).map((row, index) => (
                            <li key={`revive:${row.memberAId}:${row.memberBId}`} className="flex items-center justify-between gap-2 border-b border-[var(--theme-ui-border)] py-3 last:border-0">
                              <div className="flex items-center gap-3">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                                  {index < MEDAL_ICONS.length ? (
                                    <Image src={MEDAL_ICONS[index]} alt={medalAlt(index)} width={20} height={20} className="drop-shadow-sm" />
                                  ) : (
                                    <span className="text-sm font-bold text-gray-500">{index + 1}</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                  <PlayerNameBadge name={row.memberAName} />
                                  <PlayerNameBadge name={row.memberBName} />
                                </div>
                              </div>
                              <span className="rounded bg-emerald-500/20 px-2.5 py-1 text-sm font-bold tabular-nums text-emerald-500">
                                {row.reviveCount}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs italic text-gray-500">Aucun sauvetage pour cette période.</p>
                      )}
                    </div>
                  </div>

                  <div className="app-panel overflow-hidden">
                    <header 
                      className="relative h-28 border-b border-[var(--theme-ui-border)] bg-cover bg-center bg-no-repeat"
                      style={{ backgroundImage: `url('/cokills.jpg')` }}
                    >
                      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-bold text-white shadow-sm backdrop-blur-md">
                        <Target className="h-4 w-4 text-orange-400" />
                        Top Co-kills
                      </div>
                    </header>
                    <div className="bg-[var(--theme-bg-base)] p-4">
                      {topCoKillRows.filter(r => r.coKillCount > 0).length > 0 ? (
                        <ul className="flex flex-col">
                          {topCoKillRows.filter(r => r.coKillCount > 0).map((row, index) => (
                            <li key={`cokill:${row.memberAId}:${row.memberBId}`} className="flex items-center justify-between gap-2 border-b border-[var(--theme-ui-border)] py-3 last:border-0">
                              <div className="flex items-center gap-3">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                                  {index < MEDAL_ICONS.length ? (
                                    <Image src={MEDAL_ICONS[index]} alt={medalAlt(index)} width={20} height={20} className="drop-shadow-sm" />
                                  ) : (
                                    <span className="text-sm font-bold text-gray-500">{index + 1}</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                  <PlayerNameBadge name={row.memberAName} />
                                  <PlayerNameBadge name={row.memberBName} />
                                </div>
                              </div>
                              <span className="rounded bg-orange-500/20 px-2.5 py-1 text-sm font-bold tabular-nums text-orange-500">
                                {row.coKillCount}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs italic text-gray-500">Aucun co-kill pour cette période.</p>
                      )}
                    </div>
                  </div>

                  <div className="app-panel overflow-hidden">
                    <header 
                      className="relative h-28 border-b border-[var(--theme-ui-border)] bg-cover bg-center bg-no-repeat"
                      style={{ backgroundImage: `url('/recall.jpg')` }}
                    >
                      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-bold text-white shadow-sm backdrop-blur-md">
                        <RefreshCcw className="h-4 w-4 text-blue-400" />
                        Top Recalls
                      </div>
                    </header>
                    <div className="bg-[var(--theme-bg-base)] p-4">
                      {topRecallRows.filter(r => (r.recallCount ?? 0) > 0).length > 0 ? (
                        <ul className="flex flex-col">
                          {topRecallRows.filter(r => (r.recallCount ?? 0) > 0).map((row, index) => (
                            <li key={`recall:${row.memberAId}:${row.memberBId}`} className="flex items-center justify-between gap-2 border-b border-[var(--theme-ui-border)] py-3 last:border-0">
                              <div className="flex items-center gap-3">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                                  {index < MEDAL_ICONS.length ? (
                                    <Image src={MEDAL_ICONS[index]} alt={medalAlt(index)} width={20} height={20} className="drop-shadow-sm" />
                                  ) : (
                                    <span className="text-sm font-bold text-gray-500">{index + 1}</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                  <PlayerNameBadge name={row.memberAName} />
                                  <PlayerNameBadge name={row.memberBName} />
                                </div>
                              </div>
                              <span className="rounded bg-blue-500/20 px-2.5 py-1 text-sm font-bold tabular-nums text-blue-500">
                                {row.recallCount}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs italic text-gray-500">Aucun recall pour cette période.</p>
                      )}
                    </div>
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
    </section>
  )
}
