import Image from 'next/image'
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
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
                        <HeartPulse className="h-3.5 w-3.5" />
                      </div>
                      Top Sauvetages
                    </h3>
                    {topReviveRows.filter(r => r.reviveCount > 0).length > 0 ? (
                      <ul className="grid gap-2">
                        {topReviveRows.filter(r => r.reviveCount > 0).map((row, index) => (
                          <li key={`revive:${row.memberAId}:${row.memberBId}`} className="app-panel-muted flex items-center justify-between rounded-xl px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                                {index < MEDAL_ICONS.length ? (
                                  <Image src={MEDAL_ICONS[index]} alt={medalAlt(index)} width={16} height={16} className="drop-shadow-sm" />
                                ) : (
                                  <span className="text-xs font-bold text-gray-500">{index + 1}</span>
                                )}
                              </span>
                              <div className="flex flex-wrap gap-1">
                                <PlayerNameBadge name={row.memberAName} />
                                <PlayerNameBadge name={row.memberBName} />
                              </div>
                            </div>
                            <span className="rounded bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-500">
                              {row.reviveCount}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs italic text-gray-500">Aucun sauvetage pour cette période.</p>
                    )}
                  </div>

                  <div>
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                      <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500/15 text-orange-500">
                        <Target className="h-3.5 w-3.5" />
                      </div>
                      Top Co-kills
                    </h3>
                    {topCoKillRows.filter(r => r.coKillCount > 0).length > 0 ? (
                      <ul className="grid gap-2">
                        {topCoKillRows.filter(r => r.coKillCount > 0).map((row, index) => (
                          <li key={`cokill:${row.memberAId}:${row.memberBId}`} className="app-panel-muted flex items-center justify-between rounded-xl px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                                {index < MEDAL_ICONS.length ? (
                                  <Image src={MEDAL_ICONS[index]} alt={medalAlt(index)} width={16} height={16} className="drop-shadow-sm" />
                                ) : (
                                  <span className="text-xs font-bold text-gray-500">{index + 1}</span>
                                )}
                              </span>
                              <div className="flex flex-wrap gap-1">
                                <PlayerNameBadge name={row.memberAName} />
                                <PlayerNameBadge name={row.memberBName} />
                              </div>
                            </div>
                            <span className="rounded bg-orange-500/20 px-2.5 py-0.5 text-xs font-bold text-orange-500">
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
