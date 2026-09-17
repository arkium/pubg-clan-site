/**
 * Contrôle en lecture seule des indicateurs de villes des tableaux de bord : volumétrie, temps de réponse et
 * classement obtenu pour un clan (et un membre si fourni).
 *
 * Usage : npx tsx scripts/inspect-city-insights.ts <clanId> [week|month|all] [memberId]
 */
import 'dotenv/config'

import {
  aggregateCityCells,
  buildCityGrid,
  buildCityInsights,
  buildCityTimeline,
  getCityPeriodBounds,
  getCityTimelineStart,
  loadCityMatchCoverage,
  loadCityMetricCells,
  withClanComparison,
} from '../src/lib/city-insights'
import { getMapLabels, mapDisplayName } from '../src/lib/map-label-service'
import { getMapLocations } from '../src/lib/map-location-service'
import { prisma } from '../src/lib/prisma'
import type { CityInsightsPeriod } from '../src/types/city-insights'

async function main() {
  const clanId = Number(process.argv[2])
  const period = (process.argv[3] ?? 'month') as CityInsightsPeriod
  const memberId = process.argv[4] ? Number(process.argv[4]) : undefined
  if (!Number.isInteger(clanId)) throw new Error('Usage : voir l’en-tête du script')

  const bounds = getCityPeriodBounds(period)
  const startedAt = Date.now()
  const [mapLabels, locations, cells, timelineCells, coverage] = await Promise.all([
    getMapLabels(),
    getMapLocations(),
    loadCityMetricCells({ clanId, memberId, bounds }),
    loadCityMetricCells({
      clanId,
      memberId,
      bounds: { startDate: getCityTimelineStart(), endDate: new Date() },
      withWeeks: true,
    }),
    loadCityMatchCoverage({ clanId, memberId, bounds }),
  ])
  const loadMs = Date.now() - startedAt

  const grid = buildCityGrid(locations)
  const mapLabel = (mapName: string) => mapDisplayName(mapName, mapLabels)
  const aggregation = aggregateCityCells({ rows: cells, grid, mapLabel })
  let insights = buildCityInsights({
    period,
    aggregation,
    timeline: buildCityTimeline(timelineCells, grid),
    matchCount: coverage.matchCount,
    dataStart: coverage.dataStart,
    mapLabel,
  })

  if (memberId) {
    const clanCells = await loadCityMetricCells({ clanId, bounds })
    insights = withClanComparison(insights, aggregateCityCells({ rows: clanCells, grid, mapLabel }))
  }

  console.log(`Période ${period} · clan ${clanId}${memberId ? ` · membre ${memberId}` : ''}`)
  console.log(`Lignes lues : ${cells.length} (période) + ${timelineCells.length} (8 semaines) en ${loadMs} ms`)
  console.log(`Matchs couverts : ${insights.matchCount} · données depuis ${insights.dataStart ?? 'aucune'}`)
  console.log(`Carte principale : ${insights.mainMapLabel ?? 'aucune'}`)
  console.log('Totaux par métrique :', insights.metricTotals, '· dont en ville :', insights.cityTotals)
  for (const metric of ['presence', 'kill', 'damage', 'revive'] as const) {
    const top = insights.top[metric]
    console.log(`\nTop ${metric} :`)
    for (const city of top) {
      const clanPart = city.clanShare === null ? '' : ` · clan ${city.clanShare.toFixed(1)} %`
      console.log(`  ${city.name} (${city.mapLabel}) : ${city.events} · ${city.share.toFixed(1)} %${clanPart}`)
    }
    if (top.length === 0) console.log('  aucune donnée')
  }
  console.log('\nVille favorite :', insights.favoriteCity?.name ?? 'aucune')
  console.log('Zone de combat favorite :', insights.favoriteCombatCity?.name ?? 'aucune')
  console.log('Évolution :', insights.timeline.map((point) => `${point.label}:${point.presence}`).join(' '))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
