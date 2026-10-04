'use client'

import { useState } from 'react'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'
import { ComparatorRankRow, SortCaption, comparatorSlot } from '@/components/comparator/ComparatorUi'

interface ClanDnaCardsProps {
  clans: ClanComparatorEntry[]
  selectedClanIds: number[]
}

type DnaSortType = 'hotDrop' | 'survival' | 'teamplay'

function formatPercent(value: number | undefined): string {
  if (value === undefined) return '—'
  return `${value.toFixed(1)} %`
}

export default function ClanDnaCards({ clans, selectedClanIds }: ClanDnaCardsProps) {
  const [sortBy, setSortBy] = useState<DnaSortType>('hotDrop')

  const orderedClans = selectedClanIds
    .map((id) => clans.find((c) => c.clanId === id))
    .filter((c): c is ClanComparatorEntry => Boolean(c))

  if (orderedClans.length === 0) return null

  const enrichedClans = orderedClans.map((clan, slotIndex) => {
    const dna = clan.dna

    const hotDropPct = dna?.hotDropSharePercent !== undefined ? dna.hotDropSharePercent : null
    const survivalSec = dna?.avgTimeSurvivedSeconds ?? 0
    const survivalMin = Math.round(survivalSec / 60)
    const teamplayRatio = dna?.teamplayRatio ?? null
    const revivesGiven = dna?.revivesGiven ?? 0
    const matchCount = clan.performance?.matchCount ?? 0
    const revivesPerMatch = matchCount > 0 ? revivesGiven / matchCount : 0

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
      slot: comparatorSlot(slotIndex),
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SortCaption>Trier par :</SortCaption>
        <SegmentedControl
          options={[
            { value: 'hotDrop', label: 'Hot drop' },
            { value: 'survival', label: 'Survie' },
            { value: 'teamplay', label: 'Réanimations' },
          ]}
          value={sortBy}
          onChange={(value) => setSortBy(value as DnaSortType)}
        />
      </div>

      {/* Classement des clans sur le critère choisi */}
      <div className="app-panel divide-y divide-gray-200 overflow-hidden">
        {sorted.map((item, index) => {
          let value = ''
          let unit = ''
          let aside = ''
          let line1 = ''
          let line2 = ''

          if (sortBy === 'hotDrop') {
            value = item.hotDropPct !== null ? formatPercent(item.hotDropPct) : '—'
            aside = item.hotDropLabel
            line1 = `Survie moy. : ${item.survivalMin > 0 ? `${item.survivalMin} min` : '—'} (${item.phaseLabel})`
            line2 = `REVIVES : ${item.revivesSummary}`
          } else if (sortBy === 'survival') {
            value = item.survivalMin > 0 ? `${item.survivalMin}` : '—'
            unit = item.survivalMin > 0 ? 'min' : ''
            aside = item.phaseLabel
            line1 = `Hot drop : ${item.hotDropPct !== null ? formatPercent(item.hotDropPct) : '—'} (${item.hotDropLabel})`
            line2 = `REVIVES : ${item.revivesSummary}`
          } else if (sortBy === 'teamplay') {
            value = `${item.revivesGiven}`
            unit = `revive${item.revivesGiven > 1 ? 's' : ''}`
            aside = `${item.revivesPerMatch.toFixed(1)} / match${item.teamplayRatio !== null ? ` (KO: ${item.teamplayRatio.toFixed(2)})` : ''}`
            line1 = `Survie moy. : ${item.survivalMin > 0 ? `${item.survivalMin} min` : '—'} (${item.phaseLabel})`
            line2 = `HOT DROP : ${item.hotDropPct !== null ? formatPercent(item.hotDropPct) : '—'} (${item.hotDropLabel})`
          }

          return (
            <ComparatorRankRow
              key={item.clan.clanId}
              rank={index + 1}
              slot={item.slot}
              tag={item.clan.clanTag}
              name={item.clan.clanName}
              href={`/clans/${item.clan.clanId}/overview`}
              line1={line1}
              line2={line2}
              value={value}
              unit={unit}
              aside={aside}
            />
          )
        })}
      </div>
    </div>
  )
}
