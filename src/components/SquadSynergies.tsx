import { useEffect, useMemo, useState } from 'react'

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
}: {
  title: string
  entries: SquadSynergiesData['topPairs']
}) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-600">Pas encore assez de données.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const teamMode = teamModeFromMemberCount(entry.memberNames.length)

            return (
              <li key={entry.memberIds.join(':')} className="text-xs text-gray-700">
                <div className="mb-1 flex items-center gap-2">
                  <TeamModeBadge mode={teamMode} className="shadow-none" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {entry.memberNames.map((memberName) => (
                    <PlayerNameBadge key={`${entry.memberIds.join(':')}:${memberName}`} name={memberName} />
                  ))}
                </div>
                <p>
                  {entry.matchesPlayed} matchs · {entry.totalKills} éliminations · {formatWinRate(entry.winRate)}
                </p>
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
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Synergies</h2>

        <div className="inline-flex rounded border border-gray-200 p-0.5">
          <button
            type="button"
            onClick={() => setTab('classic')}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
              tab === 'classic' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Classique
          </button>
          <button
            type="button"
            onClick={() => setTab('telemetry')}
            className={`rounded px-3 py-1.5 text-xs font-semibold transition ${
              tab === 'telemetry' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            Telemetry
          </button>
        </div>
      </div>

      {tab === 'classic' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <SynergyList title="Meilleurs binômes" entries={synergies.topPairs} />
          <SynergyList title="Meilleurs squads (3-4 joueurs)" entries={synergies.topSquads} />
        </div>
      ) : (
        <div className="space-y-3">
          {telemetryLoading ? <p className="text-sm text-gray-600">Chargement des synergies telemetry...</p> : null}
          {telemetryError ? <p className="text-sm text-amber-700">{telemetryError}</p> : null}

          {!telemetryLoading && !telemetryError ? (
            telemetryRows.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <article className="rounded border border-indigo-200 bg-indigo-50 p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs uppercase tracking-wide text-indigo-700">Qualite synergie</p>
                      <span
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-indigo-300 bg-white text-[10px] font-bold text-indigo-700"
                        title={SYNERGY_SCORE_FORMULA}
                        aria-label={SYNERGY_SCORE_FORMULA}
                      >
                        i
                      </span>
                    </div>
                    <p className="mt-1 text-xl font-semibold text-indigo-900">
                      {telemetrySummary.qualityIndex.toFixed(1)} / 100
                    </p>
                    <p className="text-[11px] text-indigo-700">Score combine revive/co-kill/damage</p>
                  </article>

                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Binomes telemetry</p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">{formatInteger(telemetrySummary.pairCount)}</p>
                  </article>

                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Total revives</p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">{formatInteger(telemetrySummary.totalRevives)}</p>
                  </article>

                  <article className="rounded border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs uppercase tracking-wide text-gray-600">Total co-kills</p>
                    <p className="mt-1 text-xl font-semibold text-gray-900">{formatInteger(telemetrySummary.totalCoKills)}</p>
                  </article>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded border border-gray-200 p-3">
                  <h3 className="mb-2 text-sm font-semibold text-gray-900">Top binomes revive</h3>
                  <ul className="space-y-2 text-xs text-gray-700">
                    {topReviveRows.map((row) => (
                      <li key={`revive:${row.memberAId}:${row.memberBId}`} className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          <PlayerNameBadge name={row.memberAName} />
                          <PlayerNameBadge name={row.memberBName} />
                        </div>
                        <span className="font-semibold text-gray-900 tabular-nums">{row.reviveCount}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                  <div className="rounded border border-gray-200 p-3">
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Top binomes co-kills</h3>
                    <ul className="space-y-2 text-xs text-gray-700">
                      {topCoKillRows.map((row) => (
                        <li key={`cokill:${row.memberAId}:${row.memberBId}`} className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            <PlayerNameBadge name={row.memberAName} />
                            <PlayerNameBadge name={row.memberBName} />
                          </div>
                          <span className="font-semibold text-gray-900 tabular-nums">{row.coKillCount}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <p className="text-xs text-gray-500">
                  Shared damage events: {formatInteger(telemetrySummary.totalSharedDamage)} · score moyen: {telemetrySummary.avgScore.toFixed(1)}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600">Aucune donnee telemetry de synergie pour cette periode.</p>
            )
          ) : null}
        </div>
      )}
    </section>
  )
}
