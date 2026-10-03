'use client'

import { useEffect, useState } from 'react'

import PlayerNameBadge from '@/components/ui/PlayerNameBadge'
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
  return `${(value * 100).toFixed(1).replace('.', ',')} %`
}

/**
 * Couleur de mode de la charte (.game-ui) : duo ciel, trio violet, squad vert — liseré de la carte et win rate.
 * Liseré posé en ligne : la bordure de .app-panel-muted (hors couche) l'emporterait sur un utilitaire Tailwind.
 */
const MODE_COLORS: Record<BestMode, string> = {
  duo: 'var(--game-sky)',
  trio: 'var(--game-violet)',
  squad: 'var(--game-pos)',
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
    <section className="app-panel flex flex-col gap-3 p-4">
      <div>
        <h2 className="t-card-title">Team play Duo / Trio / Squad</h2>
        <p className="t-meta">Repère en un coup d’œil les coéquipiers avec qui ton impact est le plus fort.</p>
      </div>

      {loading ? (
        <CardSkeleton />
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {(compositions ?? []).map((entry) => (
            <article
              key={entry.mode}
              aria-label={entry.label}
              className="app-panel-muted flex flex-col gap-3 p-3"
              style={{ borderLeft: `3px solid ${MODE_COLORS[entry.mode]}` }}
            >
              <div className="flex items-center justify-between gap-2">
                <TeamModeBadge mode={entry.mode} label={entry.label} size="sm" className="shadow-none" />
                <span className="t-hero t-hero--sm" style={{ color: MODE_COLORS[entry.mode] }}>
                  {formatPercent(entry.winRate)}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="t-label">Composition</p>
                {entry.teamMembers.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.teamMembers.map((name) => (
                      <PlayerNameBadge key={`${entry.mode}-${name}`} name={name} />
                    ))}
                  </div>
                ) : (
                  <p className="t-meta">Aucune composition</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <div className="app-stat-tile">
                  <span className="app-stat-tile__value text-gray-900">{entry.matches}</span>
                  <span className="app-stat-tile__label">Matchs</span>
                </div>
                <div className="app-stat-tile">
                  <span className="app-stat-tile__value t-pos">{entry.wins}</span>
                  <span className="app-stat-tile__label">Victoires</span>
                </div>
                <div className="app-stat-tile">
                  <span className="app-stat-tile__value text-gray-900">{entry.avgPlacement.toFixed(1).replace('.', ',')}</span>
                  <span className="app-stat-tile__label">Place moy.</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
