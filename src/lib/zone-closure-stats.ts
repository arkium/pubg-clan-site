/**
 * Lecture des positions de fin de zone (`ZoneClosurePosition`) pour la page « Fin de zone ».
 *
 * Tout est agrégé en base sur la grille 40 × 40 : une requête pour la carte, une pour les compteurs par phase et
 * par bande, plus les listes de cartes et de membres qui alimentent les filtres.
 */
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { buildCityGrid } from '@/lib/city-insights'
import type { MapLocations } from '@/lib/map-location-service'
import type { ZoneBand } from '@/lib/zone-closure-positions'

export type ZoneClosurePeriod = 'week' | 'month' | 'all'

export type ZoneClosureCell = { xIndex: number; yIndex: number; count: number }

export type ZoneClosureBandCounts = { center: number; edge: number; outside: number }

export type ZoneClosurePhaseStat = {
  phase: number
  positions: number
  averageRatio: number
  bands: ZoneClosureBandCounts
}

export type ZoneClosureCityStat = {
  locationId: string
  name: string
  positions: number
  share: number
}

export type ZoneClosureSummary = {
  period: ZoneClosurePeriod
  selectedMap: string | null
  maps: Array<{ mapName: string; positions: number; matches: number }>
  members: Array<{ memberId: number; displayName: string; positions: number }>
  counts: {
    positions: number
    matches: number
    closures: number
    members: number
    averageSurvivors: number
  }
  bands: ZoneClosureBandCounts
  averageRatio: number
  byPhase: ZoneClosurePhaseStat[]
  cells: ZoneClosureCell[]
  topCities: ZoneClosureCityStat[]
  dataStart: string | null
}

function emptyBands(): ZoneClosureBandCounts {
  return { center: 0, edge: 0, outside: 0 }
}

export function getZoneClosurePeriodBounds(period: ZoneClosurePeriod, now = new Date()) {
  if (period === 'all') return null
  if (period === 'month') {
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    }
  }
  const start = new Date(now)
  const day = start.getDay()
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1))
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return { startDate: start, endDate: end }
}

type LoadInput = {
  clanId: number
  bounds: { startDate: Date; endDate: Date } | null
  mapName?: string | null
  memberId?: number | null
  phases?: number[]
}

function filters(input: LoadInput, options?: { ignoreMap?: boolean; ignorePhases?: boolean }) {
  const parts = [Prisma.sql`z.clanId = ${input.clanId}`]
  if (input.bounds) {
    parts.push(Prisma.sql`z.matchDate >= ${input.bounds.startDate} AND z.matchDate <= ${input.bounds.endDate}`)
  }
  if (input.mapName && !options?.ignoreMap) parts.push(Prisma.sql`z.mapName = ${input.mapName}`)
  if (input.memberId) parts.push(Prisma.sql`z.memberId = ${input.memberId}`)
  if (input.phases && input.phases.length > 0 && !options?.ignorePhases) {
    parts.push(Prisma.sql`z.phase IN (${Prisma.join(input.phases)})`)
  }
  return Prisma.join(parts, ' AND ')
}

/**
 * Résumé complet pour un clan : cartes disponibles, compteurs, bandes, phases, cellules et Top 5 des villes
 * d'arrivée. La carte sélectionnée s'impose à tout sauf à la liste des cartes.
 */
export async function loadZoneClosureSummary(
  input: LoadInput & { period: ZoneClosurePeriod; locations: MapLocations }
): Promise<ZoneClosureSummary> {
  const mapsFilter = filters(input, { ignoreMap: true })

  const maps = await prisma.$queryRaw<Array<{ mapName: string; positions: bigint; matches: bigint }>>(Prisma.sql`
    SELECT z.mapName, COUNT(*) AS positions, COUNT(DISTINCT z.squadMatchId) AS matches
    FROM ZoneClosurePosition z
    WHERE ${mapsFilter}
    GROUP BY z.mapName
    ORDER BY positions DESC
  `)

  const selectedMap = input.mapName ?? maps[0]?.mapName ?? null
  const scoped = { ...input, mapName: selectedMap }
  const where = filters(scoped)

  const [phaseRows, cellRows, memberRows, totals] = await Promise.all([
    prisma.$queryRaw<Array<{ phase: number; zoneBand: string; positions: bigint; averageRatio: number | null }>>(Prisma.sql`
      SELECT z.phase, z.zoneBand, COUNT(*) AS positions, AVG(z.distanceRatio) AS averageRatio
      FROM ZoneClosurePosition z
      WHERE ${filters(scoped, { ignorePhases: true })}
      GROUP BY z.phase, z.zoneBand
      ORDER BY z.phase
    `),
    prisma.$queryRaw<Array<{ xIndex: number; yIndex: number; count: bigint }>>(Prisma.sql`
      SELECT z.xIndex, z.yIndex, COUNT(*) AS count
      FROM ZoneClosurePosition z
      WHERE ${where}
      GROUP BY z.xIndex, z.yIndex
    `),
    prisma.$queryRaw<Array<{ memberId: number; displayName: string; positions: bigint }>>(Prisma.sql`
      SELECT z.memberId, cm.displayName, COUNT(*) AS positions
      FROM ZoneClosurePosition z
      INNER JOIN ClanMember cm ON cm.id = z.memberId
      WHERE ${filters({ ...scoped, memberId: null })}
      GROUP BY z.memberId, cm.displayName
      ORDER BY positions DESC
    `),
    prisma.$queryRaw<Array<{
      positions: bigint
      matches: bigint
      closures: bigint
      members: bigint
      averageRatio: number | null
      averageSurvivors: number | null
      dataStart: Date | null
    }>>(Prisma.sql`
      SELECT
        COUNT(*) AS positions,
        COUNT(DISTINCT z.squadMatchId) AS matches,
        COUNT(DISTINCT z.squadMatchId, z.phase) AS closures,
        COUNT(DISTINCT z.memberId) AS members,
        AVG(z.distanceRatio) AS averageRatio,
        AVG(z.survivorCount) AS averageSurvivors,
        MIN(z.matchDate) AS dataStart
      FROM ZoneClosurePosition z
      WHERE ${where}
    `),
  ])

  const bands = emptyBands()
  const byPhaseMap = new Map<number, ZoneClosurePhaseStat & { ratioSum: number }>()
  for (const row of phaseRows) {
    const positions = Number(row.positions)
    const stat = byPhaseMap.get(row.phase) ?? {
      phase: row.phase,
      positions: 0,
      averageRatio: 0,
      ratioSum: 0,
      bands: emptyBands(),
    }
    stat.positions += positions
    stat.ratioSum += (row.averageRatio ?? 0) * positions
    if (row.zoneBand === 'center' || row.zoneBand === 'edge' || row.zoneBand === 'outside') {
      stat.bands[row.zoneBand as ZoneBand] += positions
      if (!input.phases || input.phases.length === 0 || input.phases.includes(row.phase)) {
        bands[row.zoneBand as ZoneBand] += positions
      }
    }
    byPhaseMap.set(row.phase, stat)
  }

  const cells = cellRows.map((row) => ({ xIndex: row.xIndex, yIndex: row.yIndex, count: Number(row.count) }))

  // Villes d'arrivée : même rattachement que les indicateurs de villes des tableaux de bord.
  const grid = selectedMap ? buildCityGrid(input.locations) : new Map()
  const cityPositions = new Map<string, ZoneClosureCityStat>()
  let cityTotal = 0
  for (const cell of cells) {
    const location = grid.get(`${selectedMap}|${cell.xIndex}|${cell.yIndex}`)
    if (!location) continue
    cityTotal += cell.count
    const entry = cityPositions.get(location.id) ?? {
      locationId: location.id,
      name: location.name,
      positions: 0,
      share: 0,
    }
    entry.positions += cell.count
    cityPositions.set(location.id, entry)
  }

  const total = totals[0]
  return {
    period: input.period,
    selectedMap,
    maps: maps.map((row) => ({
      mapName: row.mapName,
      positions: Number(row.positions),
      matches: Number(row.matches),
    })),
    members: memberRows.map((row) => ({
      memberId: row.memberId,
      displayName: row.displayName,
      positions: Number(row.positions),
    })),
    counts: {
      positions: Number(total?.positions ?? 0),
      matches: Number(total?.matches ?? 0),
      closures: Number(total?.closures ?? 0),
      members: Number(total?.members ?? 0),
      averageSurvivors: Number(total?.averageSurvivors ?? 0),
    },
    bands,
    averageRatio: Number(total?.averageRatio ?? 0),
    byPhase: [...byPhaseMap.values()]
      .map(({ ratioSum, ...stat }) => ({
        ...stat,
        averageRatio: stat.positions > 0 ? ratioSum / stat.positions : 0,
      }))
      .sort((left, right) => left.phase - right.phase),
    cells,
    topCities: [...cityPositions.values()]
      .sort((left, right) => right.positions - left.positions)
      .slice(0, 5)
      .map((city) => ({ ...city, share: cityTotal > 0 ? (city.positions / cityTotal) * 100 : 0 })),
    dataStart: total?.dataStart ? new Date(total.dataStart).toISOString() : null,
  }
}
