'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trophy } from 'lucide-react'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'

interface ClanDnaCardsProps {
  clans: ClanComparatorEntry[]
  selectedClanIds: number[]
}

type DnaSortType = 'hotDrop' | 'survival' | 'teamplay'

function formatPercent(value: number | undefined): string {
  if (value === undefined) return '—'
  return `${value.toFixed(1)} %`
}

const SLOT_STYLES = [
  {
    name: 'P1',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.3)]',
  },
  {
    name: 'P2',
    badgeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-[0_0_8px_rgba(249,115,22,0.3)]',
  },
  {
    name: 'P3',
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
  },
]

export default function ClanDnaCards({ clans, selectedClanIds }: ClanDnaCardsProps) {
  const [sortBy, setSortBy] = useState<DnaSortType>('hotDrop')

  const orderedClans = selectedClanIds
    .map((id) => clans.find((c) => c.clanId === id))
    .filter((c): c is ClanComparatorEntry => Boolean(c))

  if (orderedClans.length === 0) return null

  const enrichedClans = orderedClans.map((clan) => {
    const dna = clan.dna

    const hotDropPct = dna?.hotDropSharePercent !== undefined ? dna.hotDropSharePercent : null
    const survivalSec = dna?.avgTimeSurvivedSeconds ?? 0
    const survivalMin = Math.round(survivalSec / 60)
    const teamplayRatio = dna?.teamplayRatio ?? null
    const revivesGiven = dna?.revivesGiven ?? 0
    const matchCount = clan.performance?.matchCount ?? 0
    const revivesPerMatch = matchCount > 0 ? revivesGiven / matchCount : 0

    const slotIndex = orderedClans.findIndex((c) => c.clanId === clan.clanId)
    const slot = SLOT_STYLES[slotIndex !== -1 ? slotIndex % SLOT_STYLES.length : 0]

    // Hot drop tier
    let hotDropLabel = '—'
    if (hotDropPct !== null) {
      if (hotDropPct >= 40) hotDropLabel = 'Spawn fraggers'
      else if (hotDropPct >= 20) hotDropLabel = 'Lobbies disputés'
      else hotDropLabel = 'Loot prudent'
    }

    // Survival phase
    let phaseLabel = '—'
    if (survivalMin >= 18) phaseLabel = 'Endgame (Phase 6+)'
    else if (survivalMin >= 12) phaseLabel = 'Midgame (Phase 4-5)'
    else if (survivalMin > 0) phaseLabel = 'Early game (Phase 2-3)'

    // Revives summary
    const revivesSummary = `${revivesGiven} revive${revivesGiven > 1 ? 's' : ''} (${revivesPerMatch.toFixed(1)} / m.)${
      teamplayRatio !== null ? ` · RATIO ${teamplayRatio.toFixed(2)}` : ''
    }`

    return {
      clan,
      slot,
      hotDropPct,
      hotDropLabel,
      survivalSec,
      survivalMin,
      phaseLabel,
      teamplayRatio,
      revivesGiven,
      revivesPerMatch,
      revivesSummary,
    }
  })

  // Sorting
  const sorted = [...enrichedClans].sort((a, b) => {
    if (sortBy === 'hotDrop') {
      const aVal = a.hotDropPct ?? -1
      const bVal = b.hotDropPct ?? -1
      if (bVal !== aVal) return bVal - aVal
      return b.survivalSec - a.survivalSec
    }
    if (sortBy === 'survival') {
      if (b.survivalSec !== a.survivalSec) return b.survivalSec - a.survivalSec
      return b.revivesGiven - a.revivesGiven
    }
    // sortBy === 'teamplay'
    if (b.revivesGiven !== a.revivesGiven) return b.revivesGiven - a.revivesGiven
    return b.revivesPerMatch - a.revivesPerMatch
  })

  return (
    <div className="space-y-4">
      {/* Sort Control */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-ui-text-muted)]">
          Trier par :
        </p>
        <SegmentedControl
          options={[
            { value: 'hotDrop', label: 'Hot drop' },
            { value: 'survival', label: 'Survie' },
            { value: 'teamplay', label: 'Revives' },
          ]}
          value={sortBy}
          onChange={(value) => setSortBy(value as DnaSortType)}
        />
      </div>

      {/* Leaderboard Card List */}
      <div className="rounded-xl border border-[var(--theme-ui-border)] divide-y divide-[var(--theme-ui-border)] overflow-hidden bg-[var(--theme-ui-surface)] shadow-sm">
        {sorted.map((item, index) => {
          let primaryValue = ''
          let primaryLabel = ''
          let secondaryRightValue = ''

          let secondaryLeft1 = ''
          let secondaryLeft2 = ''

          if (sortBy === 'hotDrop') {
            primaryValue = item.hotDropPct !== null ? formatPercent(item.hotDropPct) : '—'
            primaryLabel = ''
            secondaryRightValue = item.hotDropLabel
            secondaryLeft1 = `Survie moy. : ${item.survivalMin > 0 ? `${item.survivalMin} min` : '—'} (${item.phaseLabel})`
            secondaryLeft2 = `REVIVES : ${item.revivesSummary}`
          } else if (sortBy === 'survival') {
            primaryValue = item.survivalMin > 0 ? `${item.survivalMin}` : '—'
            primaryLabel = item.survivalMin > 0 ? ' min' : ''
            secondaryRightValue = item.phaseLabel
            secondaryLeft1 = `Hot drop : ${item.hotDropPct !== null ? formatPercent(item.hotDropPct) : '—'} (${item.hotDropLabel})`
            secondaryLeft2 = `REVIVES : ${item.revivesSummary}`
          } else if (sortBy === 'teamplay') {
            primaryValue = `${item.revivesGiven}`
            primaryLabel = ` revive${item.revivesGiven > 1 ? 's' : ''}`
            secondaryRightValue = `${item.revivesPerMatch.toFixed(1)} / match${item.teamplayRatio !== null ? ` (KO: ${item.teamplayRatio.toFixed(2)})` : ''}`
            secondaryLeft1 = `Survie moy. : ${item.survivalMin > 0 ? `${item.survivalMin} min` : '—'} (${item.phaseLabel})`
            secondaryLeft2 = `HOT DROP : ${item.hotDropPct !== null ? formatPercent(item.hotDropPct) : '—'} (${item.hotDropLabel})`
          }

          return (
            <div
              key={item.clan.clanId}
              className={`flex items-center justify-between p-4 transition-colors ${
                index === 0
                  ? 'bg-blue-500/5'
                  : 'bg-transparent hover:bg-gray-50/5 dark:hover:bg-gray-800/20'
              }`}
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                {/* P1 / P2 / P3 Badge */}
                <span
                  className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg text-xs sm:text-sm font-black tracking-wider uppercase border ${item.slot.badgeClass}`}
                >
                  {item.slot.name}
                </span>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/clans/${item.clan.clanId}/overview`}
                      className={`text-base font-black tracking-tight hover:text-blue-400 transition truncate ${
                        index === 0 ? 'text-[var(--theme-ui-text)]' : 'text-[var(--theme-ui-text-secondary)]'
                      }`}
                    >
                      {item.clan.clanTag}
                    </Link>
                    {index === 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                        <Trophy className="h-3 w-3 text-yellow-500" />
                        1er
                      </span>
                    )}
                    <span className="hidden sm:inline text-xs text-[var(--theme-ui-text-muted)] truncate max-w-[130px]">
                      {item.clan.clanName}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-[var(--theme-ui-text-muted)] truncate">
                    {secondaryLeft1}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--theme-ui-text-muted)] opacity-70 truncate">
                    {secondaryLeft2}
                  </div>
                </div>
              </div>

              <div className="text-right flex-shrink-0 pl-2">
                <div className="text-xl font-black tracking-tight text-blue-500">
                  {primaryValue}
                  <span className="text-base">{primaryLabel}</span>
                </div>
                <div className="text-xs font-medium mt-0.5 text-[var(--theme-ui-text-muted)]">
                  {secondaryRightValue}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
