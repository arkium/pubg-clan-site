'use client'

import { useState } from 'react'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'
import { ComparatorRankRow, SortCaption, comparatorSlot } from '@/components/comparator/ComparatorUi'

interface ClanPulseCardsProps {
  clans: ClanComparatorEntry[]
  selectedClanIds: number[]
}

type PulseSortType = 'participation' | 'rhythm' | 'squads'

function formatPercent(value: number | undefined): string {
  if (value === undefined) return '—'
  return `${(value * 100).toFixed(1)} %`
}

export default function ClanPulseCards({ clans, selectedClanIds }: ClanPulseCardsProps) {
  const [sortBy, setSortBy] = useState<PulseSortType>('participation')

  const orderedClans = selectedClanIds
    .map((id) => clans.find((c) => c.clanId === id))
    .filter((c): c is ClanComparatorEntry => Boolean(c))

  if (orderedClans.length === 0) return null

  // Prepare clans data and sort
  const enrichedClans = orderedClans.map((clan, slotIndex) => {
    const pulse = clan.pulse
    const dist = pulse?.squadSizeDistribution
    const totalSquadMatches = dist ? dist.solo + dist.duo + dist.trio + dist.squad : 0

    const duoPct = totalSquadMatches > 0 && dist ? Math.round((dist.duo / totalSquadMatches) * 100) : 0
    const trioPct = totalSquadMatches > 0 && dist ? Math.round((dist.trio / totalSquadMatches) * 100) : 0
    const squadPct = totalSquadMatches > 0 && dist ? Math.round((dist.squad / totalSquadMatches) * 100) : 0

    let topModeName = 'Squad'
    let topModePct = squadPct
    if (duoPct >= squadPct && duoPct >= trioPct) {
      topModeName = 'Duo'
      topModePct = duoPct
    } else if (trioPct >= squadPct && trioPct >= duoPct) {
      topModeName = 'Trio'
      topModePct = trioPct
    }

    const activeMembers = pulse?.rosterHealth.activeMembers ?? 0
    const totalMembers = pulse?.rosterHealth.totalMembers ?? 0
    const participationRate = pulse?.rosterHealth.participationRate ?? 0
    const daysWithMatches = pulse?.dailyMatchCounts.length ?? 0

    return {
      clan,
      slot: comparatorSlot(slotIndex),
      activeMembers,
      totalMembers,
      participationRate,
      daysWithMatches,
      totalSquadMatches,
      duoPct,
      trioPct,
      squadPct,
      topModeName,
      topModePct,
    }
  })

  // Sorting
  const sorted = [...enrichedClans].sort((a, b) => {
    if (sortBy === 'participation') {
      if (b.participationRate !== a.participationRate) return b.participationRate - a.participationRate
      if (b.activeMembers !== a.activeMembers) return b.activeMembers - a.activeMembers
      return b.daysWithMatches - a.daysWithMatches
    }
    if (sortBy === 'rhythm') {
      if (b.daysWithMatches !== a.daysWithMatches) return b.daysWithMatches - a.daysWithMatches
      return b.participationRate - a.participationRate
    }
    // sortBy === 'squads'
    if (b.topModePct !== a.topModePct) return b.topModePct - a.topModePct
    return b.totalSquadMatches - a.totalSquadMatches
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SortCaption>Trier par :</SortCaption>
        <SegmentedControl
          options={[
            { value: 'participation', label: 'Roster actif' },
            { value: 'rhythm', label: 'Rythme hebdo' },
            { value: 'squads', label: 'Mode favori' },
          ]}
          value={sortBy}
          onChange={(value) => setSortBy(value as PulseSortType)}
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

          if (sortBy === 'participation') {
            value = formatPercent(item.participationRate)
            aside = `${item.activeMembers} / ${item.totalMembers} membres`
            line1 = `${item.daysWithMatches} jour${item.daysWithMatches > 1 ? 's' : ''} avec matchs / 7 j`
            line2 = `DUO ${item.duoPct}% · TRIO ${item.trioPct}% · SQUAD ${item.squadPct}%`
          } else if (sortBy === 'rhythm') {
            value = `${item.daysWithMatches}`
            unit = '/ 7 j'
            aside = item.daysWithMatches >= 5 ? 'Très régulier' : item.daysWithMatches >= 3 ? 'Régulier' : 'Occasionnel'
            line1 = `${formatPercent(item.participationRate)} mobilisation (${item.activeMembers}/${item.totalMembers})`
            line2 = `DUO ${item.duoPct}% · TRIO ${item.trioPct}% · SQUAD ${item.squadPct}%`
          } else if (sortBy === 'squads') {
            value = `${item.topModePct} %`
            unit = item.topModeName
            aside = `${item.totalSquadMatches} match${item.totalSquadMatches > 1 ? 's' : ''}`
            line1 = `Duo ${item.duoPct}% · Trio ${item.trioPct}% · Squad ${item.squadPct}%`
            line2 = `${formatPercent(item.participationRate)} ROSTER ACTIF`
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
