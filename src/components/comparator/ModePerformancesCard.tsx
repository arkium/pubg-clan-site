'use client'

import { useState } from 'react'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'
import type { TeamMode } from '@/components/ui/TeamModeBadge'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { ComparatorRankRow, SortCaption, comparatorSlot } from '@/components/comparator/ComparatorUi'

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
    return <p className="t-body text-gray-500">Aucune donnée de mode disponible pour ces clans sur la période.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SortCaption>Trier le classement par :</SortCaption>
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
          <article key={mode} className="app-panel overflow-hidden">
            {/* Photo du mode (signature §0b), badge de mode posé dessus */}
            <header
              className="bg-photo-fallback relative h-28 border-b border-gray-200 bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url('/${mode}.jpg')` }}
            >
              <div className="absolute bottom-3 left-3">
                <TeamModeBadge mode={mode} size="sm" />
              </div>
            </header>

            <div className="divide-y divide-gray-200">
              {performances.map((perf, index) => {
                // Valeur mise en avant et contexte selon le critère de tri
                let value = ''
                let unit = ''
                let aside = ''
                let line1 = ''
                let line2 = ''

                if (sortBy === 'winRate') {
                  value = formatPercent(perf.winRate)
                  aside = `${perf.totalKills} kill${perf.totalKills > 1 ? 's' : ''}`
                  line1 = `${perf.matches} match${perf.matches > 1 ? 's' : ''}`
                  line2 = `${formatPercent(perf.matchShare)} du clan`
                } else if (sortBy === 'kills') {
                  value = perf.totalKills.toString()
                  unit = `kill${perf.totalKills > 1 ? 's' : ''}`
                  aside = `${formatPercent(perf.winRate)} WR`
                  line1 = `${perf.matches} match${perf.matches > 1 ? 's' : ''}`
                  line2 = `${formatPercent(perf.matchShare)} du clan`
                } else if (sortBy === 'matches') {
                  value = perf.matches.toString()
                  unit = `match${perf.matches > 1 ? 's' : ''}`
                  aside = `${formatPercent(perf.matchShare)} du clan`
                  line1 = `${formatPercent(perf.winRate)} WR`
                  line2 = `${perf.totalKills} kill${perf.totalKills > 1 ? 's' : ''}`
                } else if (sortBy === 'share') {
                  value = formatPercent(perf.matchShare)
                  unit = 'du clan'
                  aside = `${perf.matches} match${perf.matches > 1 ? 's' : ''}`
                  line1 = `${formatPercent(perf.winRate)} WR`
                  line2 = `${perf.totalKills} kill${perf.totalKills > 1 ? 's' : ''}`
                }

                const slotIndex = clans.findIndex((c) => c.clanId === perf.clanId)

                return (
                  <ComparatorRankRow
                    key={perf.clanId}
                    compact
                    rank={index + 1}
                    slot={comparatorSlot(slotIndex)}
                    tag={perf.clanTag}
                    name={perf.clanName}
                    line1={line1}
                    line2={line2}
                    value={value}
                    unit={unit}
                    aside={aside}
                  />
                )
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
