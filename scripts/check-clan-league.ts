/**
 * Contrôle en lecture seule de la Ligue Inter-Clans (docs/features/ligue-clans.md) : compare le classement recalculé à
 * la volée (`getClanLeague`) aux chiffres de `ClanComparatorCache`, l'ancienne source de la page, pour la semaine et le
 * mois en cours. Aucune écriture.
 *
 *   npx tsx scripts/check-clan-league.ts
 */
import { getClanLeague } from '../src/lib/clan-league-service'
import type { ClanComparatorPayload } from '../src/lib/clan-comparator-service'
import { prisma } from '../src/lib/prisma'

async function main() {
  for (const period of ['week', 'month', 'all'] as const) {
    const started = Date.now()
    const league = await getClanLeague(period)
    const elapsed = Date.now() - started
    const cacheRows = await prisma.clanComparatorCache.findMany({ where: { period }, select: { clanId: true, payload: true, computedAt: true } })
    const byClan = new Map(cacheRows.map((row) => [row.clanId, row]))
    let differences = 0
    for (const entry of league.standings) {
      const cached = byClan.get(entry.clanId)
      const perf = (cached?.payload as unknown as ClanComparatorPayload | undefined)?.performance
      if (!perf) continue
      const gaps = [
        ['matches', entry.matches, perf.matchCount],
        ['winRate', entry.winRate, perf.winRate],
        ['avgDamage', entry.avgDamage, perf.avgDamagePerMatch],
        ['avgKills', entry.avgKills, perf.avgKillsPerMatch],
        ['avgKnocks', entry.avgKnocks, perf.avgKnockoutsPerMatch],
      ].filter(([, live, stored]) => Math.abs(Number(live) - Number(stored)) > 0.01)
      if (gaps.length > 0) {
        differences += 1
        console.log(`  ${period} ${entry.name}: ${gaps.map(([key, live, stored]) => `${key} ${Number(live).toFixed(2)} ≠ ${Number(stored).toFixed(2)}`).join(', ')} (cache du ${cached?.computedAt.toISOString()})`)
      }
    }
    console.log(
      `${period}: ${league.standings.length} clans classés, ${league.withoutMatch.length} sans partie, ${league.feed.length} événements, ` +
        `écarts avec le cache : ${differences}, ${elapsed} ms`
    )
    console.log('  top 3 :', league.standings.slice(0, 3).map((entry) => `${entry.rank}. ${entry.name} (${Math.round(entry.powerScore)}, avant ${entry.previousRank ?? '—'})`).join(' · '))
    console.log('  fil :', league.feed.map((event) => `${event.date} ${event.clan} ${event.text}`).join(' | ') || '(vide)')
    console.log('  titres :', JSON.stringify(league.titles))
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
