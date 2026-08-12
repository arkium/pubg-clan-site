'use client'

import { useState } from 'react'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'
import type { TeamMode } from '@/components/ui/TeamModeBadge'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { Trophy } from 'lucide-react'

type Props = {
  clans: ClanComparatorEntry[]
}

const MODES: TeamMode[] = ['duo', 'trio', 'squad']

type SortType = 'winRate' | 'kills' | 'matches' | 'share'

function formatPercent(value: number | undefined): string {
  if (value === undefined) return '—'
  return `${(value * 100).toFixed(1)} %`
}

export default function ModePerformancesCard({ clans }: Props) {
  const [sortBy, setSortBy] = useState<SortType>('winRate')

  // Extract and group performances by mode
  const modeData = MODES.map((mode) => {
    const performances = clans
      .map((clan) => {
        const perf = clan.pulse?.modePerformance?.find((m) => m.mode === mode)
        if (!perf) return null
        
        const totalClanMatches = clan.performance?.matchCount ?? 0
        const matchShare = totalClanMatches > 0 ? perf.matches / totalClanMatches : 0

        return {
          clanId: clan.clanId,
          clanTag: clan.clanTag,
          clanName: clan.clanName,
          totalClanMatches,
          matchShare,
          ...perf,
        }
      })
      .filter((p): p is NonNullable<typeof p> => p !== null && p.matches > 0)
      .sort((a, b) => {
        if (sortBy === 'winRate') {
          if (b.winRate !== a.winRate) return b.winRate - a.winRate
          if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills
          return b.matches - a.matches
        }
        if (sortBy === 'kills') {
          if (b.totalKills !== a.totalKills) return b.totalKills - a.totalKills
          if (b.winRate !== a.winRate) return b.winRate - a.winRate
          return b.matches - a.matches
        }
        if (sortBy === 'matches') {
          if (b.matches !== a.matches) return b.matches - a.matches
          if (b.winRate !== a.winRate) return b.winRate - a.winRate
          return b.totalKills - a.totalKills
        }
        // sortBy === 'share'
        if (b.matchShare !== a.matchShare) return b.matchShare - a.matchShare
        if (b.matches !== a.matches) return b.matches - a.matches
        return b.winRate - a.winRate
      })

    return {
      mode,
      performances,
    }
  })

  // We only show modes that have at least one clan with matches
  const activeModes = modeData.filter((m) => m.performances.length > 0)

  if (activeModes.length === 0) {
    return (
      <p className="text-sm text-[var(--theme-ui-text-muted)]">
        Aucune donnée de mode disponible pour ces clans sur la période.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-ui-text-muted)]">
          Trier le classement par :
        </p>
        <SegmentedControl
          options={[
            { value: 'winRate', label: 'Winrate' },
            { value: 'kills', label: 'Kills' },
            { value: 'matches', label: 'Matchs' },
            { value: 'share', label: 'Spécialisation' },
          ]}
          value={sortBy}
          onChange={(value) => setSortBy(value as SortType)}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {activeModes.map(({ mode, performances }) => (
          <article key={mode} className="app-panel overflow-hidden rounded-xl border border-[var(--theme-ui-border)] shadow-sm">
            <header className="border-b border-[var(--theme-ui-border)] bg-[var(--theme-bg-base)] p-4 text-center flex flex-col items-center gap-2">
              <TeamModeBadge mode={mode} size="sm" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--theme-ui-text)]">
                {mode === 'duo' ? 'Duo' : mode === 'trio' ? 'Trio' : 'Squad'}
              </h3>
            </header>
            
            <div className="divide-y divide-[var(--theme-ui-border)]">
              {performances.map((perf, index) => {
                const hasTrophy = index === 0
                
                // Dynamic rendering logic based on sortBy
                let primaryValue = ''
                let primaryLabel = ''
                let secondaryRightValue = ''
                
                let secondaryLeft1 = ''
                let secondaryLeft2 = ''
                
                if (sortBy === 'winRate') {
                  primaryValue = formatPercent(perf.winRate)
                  primaryLabel = '' // already has %
                  secondaryRightValue = `${perf.totalKills} kill${perf.totalKills > 1 ? 's' : ''}`
                  secondaryLeft1 = `${perf.matches} match${perf.matches > 1 ? 's' : ''}`
                  secondaryLeft2 = `${formatPercent(perf.matchShare)} du clan`
                } else if (sortBy === 'kills') {
                  primaryValue = perf.totalKills.toString()
                  primaryLabel = ` kill${perf.totalKills > 1 ? 's' : ''}`
                  secondaryRightValue = `${formatPercent(perf.winRate)} WR`
                  secondaryLeft1 = `${perf.matches} match${perf.matches > 1 ? 's' : ''}`
                  secondaryLeft2 = `${formatPercent(perf.matchShare)} du clan`
                } else if (sortBy === 'matches') {
                  primaryValue = perf.matches.toString()
                  primaryLabel = ` match${perf.matches > 1 ? 's' : ''}`
                  secondaryRightValue = `${formatPercent(perf.matchShare)} du clan`
                  secondaryLeft1 = `${formatPercent(perf.winRate)} WR`
                  secondaryLeft2 = `${perf.totalKills} kill${perf.totalKills > 1 ? 's' : ''}`
                } else if (sortBy === 'share') {
                  primaryValue = formatPercent(perf.matchShare)
                  primaryLabel = ' du clan'
                  secondaryRightValue = `${perf.matches} match${perf.matches > 1 ? 's' : ''}`
                  secondaryLeft1 = `${formatPercent(perf.winRate)} WR`
                  secondaryLeft2 = `${perf.totalKills} kill${perf.totalKills > 1 ? 's' : ''}`
                }
                
                return (
                  <div key={perf.clanId} className={`flex items-center justify-between p-4 transition-colors ${index === 0 ? 'bg-blue-500/5' : 'bg-transparent hover:bg-gray-50/5 dark:hover:bg-gray-800/20'}`}>
                    <div className="flex items-center gap-4">
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full font-black text-xs shadow-sm bg-[var(--theme-bg-base)] border border-[var(--theme-ui-border)]">
                        {hasTrophy ? (
                          <Trophy className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <span className="text-[var(--theme-ui-text-muted)]">{index + 1}</span>
                        )}
                      </div>
                      <div>
                        <div className={`text-base font-black tracking-tight ${index === 0 ? 'text-[var(--theme-ui-text)]' : 'text-[var(--theme-ui-text-secondary)]'}`}>
                          {perf.clanTag}
                        </div>
                        <div className="text-xs font-medium text-[var(--theme-ui-text-muted)]">
                          {secondaryLeft1}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-[var(--theme-ui-text-muted)] opacity-70">
                          {secondaryLeft2}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-xl font-black tracking-tight text-blue-500">
                        {primaryValue}<span className="text-base">{primaryLabel}</span>
                      </div>
                      <div className="text-xs font-medium mt-0.5 text-[var(--theme-ui-text-muted)]">
                        {secondaryRightValue}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
