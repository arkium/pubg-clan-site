'use client'

import { useEffect, useState } from 'react'

import TeamModeBadge from '@/components/ui/TeamModeBadge'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import type { DashboardPeriod } from '@/types/dashboard'

type BestMode = 'duo' | 'trio' | 'squad'

type BestComposition = {
  mode: BestMode
  label: string
  teamMembers: string[]
  matches: number
  wins: number
  winRate: number
  avgPlacement: number
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function modeCardTone(mode: BestMode) {
  if (mode === 'duo') {
    return {
      card: 'border-sky-200 bg-sky-50 text-sky-800',
      title: 'text-sky-900',
      playersWrap: 'border-sky-200 bg-white/80',
      playerPill: 'border-sky-200 bg-white text-sky-900',
      metric: 'border-sky-200 bg-white/85',
      metricValue: 'text-sky-900',
    }
  }

  if (mode === 'trio') {
    return {
      card: 'border-violet-200 bg-violet-50 text-violet-800',
      title: 'text-violet-900',
      playersWrap: 'border-violet-200 bg-white/80',
      playerPill: 'border-violet-200 bg-white text-violet-900',
      metric: 'border-violet-200 bg-white/85',
      metricValue: 'text-violet-900',
    }
  }

  return {
    card: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    title: 'text-emerald-900',
    playersWrap: 'border-emerald-200 bg-white/80',
    playerPill: 'border-emerald-200 bg-white text-emerald-900',
    metric: 'border-emerald-200 bg-white/85',
    metricValue: 'text-emerald-900',
  }
}

type TeamPlayCompositionsCardProps = {
  memberId: number
  period?: DashboardPeriod
}

export default function TeamPlayCompositionsCard({ memberId, period = 'all' }: TeamPlayCompositionsCardProps) {
  const [compositions, setCompositions] = useState<BestComposition[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        const response = await fetch(`/api/members/${memberId}/map-stats?period=${period}`, {
          cache: 'no-store',
        })
        const payload = (await response.json()) as { bestCompositions?: BestComposition[] }
        if (!cancelled) {
          setCompositions(payload.bestCompositions ?? [])
        }
      } catch {
        if (!cancelled) {
          setCompositions([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [memberId, period])

  if (!loading && (!compositions || compositions.every((entry) => entry.matches === 0))) {
    return null
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Team Play Duo/Trio/Squad</h2>
      <p className="mb-3 text-sm text-gray-500">
        Repere en un coup d&apos;oeil les coequipiers avec qui ton impact est le plus fort.
      </p>

      {loading ? (
        <CardSkeleton />
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {(compositions ?? []).map((entry) => {
            const tone = modeCardTone(entry.mode)

            return (
              <article key={entry.mode} className={`rounded-2xl border p-4 shadow-sm ${tone.card}`}>
                <div className="flex items-center justify-between gap-2">
                  <TeamModeBadge mode={entry.mode} label={entry.label} size="sm" className="shadow-none" />
                  <span className={`text-lg font-bold ${tone.title}`}>{formatPercent(entry.winRate)}</span>
                </div>

                <div className={`mt-3 rounded-xl border p-3 ${tone.playersWrap}`}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Composition</p>
                  {entry.teamMembers.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {entry.teamMembers.map((name) => (
                        <span
                          key={`${entry.mode}-${name}`}
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-semibold ${tone.playerPill}`}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Aucune composition</p>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className={`rounded-xl border p-2.5 text-center ${tone.metric}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Matchs</p>
                    <p className={`mt-1 text-lg font-bold ${tone.metricValue}`}>{entry.matches}</p>
                  </div>
                  <div className={`rounded-xl border p-2.5 text-center ${tone.metric}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Wins</p>
                    <p className={`mt-1 text-lg font-bold ${tone.metricValue}`}>{entry.wins}</p>
                  </div>
                  <div className={`rounded-xl border p-2.5 text-center ${tone.metric}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Win rate</p>
                    <p className={`mt-1 text-base font-bold ${tone.metricValue}`}>{formatPercent(entry.winRate)}</p>
                  </div>
                  <div className={`rounded-xl border p-2.5 text-center ${tone.metric}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Place moy.</p>
                    <p className={`mt-1 text-base font-bold ${tone.metricValue}`}>{entry.avgPlacement.toFixed(2)}</p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
