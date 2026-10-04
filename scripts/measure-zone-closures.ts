/**
 * Mesure, en LECTURE SEULE, la page « Fin de zone » d'un clan (`loadZoneClosureSummary`, comme la route
 * `telemetry/zone-closures`) : temps de réponse par période, bandes du clan et profil « Qui joue le cercle ».
 *
 *   npx tsx scripts/measure-zone-closures.ts 13
 */
import 'dotenv/config'

import { getMapLocations } from '@/lib/map-location-service'
import { prisma } from '@/lib/prisma'
import { getZoneClosurePeriodBounds, loadZoneClosureSummary } from '@/lib/zone-closure-stats'

async function main() {
  const clanId = Number(process.argv[2] ?? 13)
  const locations = await getMapLocations()
  for (const period of ['week', 'month', 'all'] as const) {
    const started = performance.now()
    const summary = await loadZoneClosureSummary({ clanId, period, bounds: getZoneClosurePeriodBounds(period), locations })
    const ms = Math.round(performance.now() - started)
    const { center, edge, outside } = summary.bands
    console.log(`\n${period} · ${ms} ms · ${summary.selectedMap ?? '—'} · ${summary.counts.positions} observations (centre ${center}, bord ${edge}, dehors ${outside})`)
    for (const member of summary.members.slice(0, 8)) {
      const total = member.positions || 1
      console.log(
        `  ${member.displayName.padEnd(22)} ${String(member.positions).padStart(4)} obs · ratio ${member.averageRatio.toFixed(2)} · ` +
          `centre ${Math.round((member.bands.center / total) * 100)} % · bord ${Math.round((member.bands.edge / total) * 100)} % · dehors ${Math.round((member.bands.outside / total) * 100)} %`
      )
    }
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
