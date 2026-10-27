/**
 * Recalculs après la correction de la place d'un clan dans une partie partagée (docs/TODO/place-partie-partagee.md §8).
 *
 * SIMULATION PAR DÉFAUT : lit la base, compare chaque agrégat stocké à sa nouvelle valeur et affiche les écarts, sans
 * rien écrire. `--apply` écrit (DATABASE_URL = la production : ne le lancer qu'après le déploiement de la correction,
 * avec l'accord de l'exploitant).
 *
 *  - `PlayerStats.matchesWon` / `winRate`, toutes périodes gardées (le cron de 03:00 ne recalcule que les périodes en
 *    cours) : victoire = la place du joueur (`SquadMember.placement = 1`), parties officielles de la fenêtre de la ligne,
 *    la règle de `calculatePlayerStats`. Seules ces deux colonnes changent ; les badges (`best_wr`, `mvp`) des périodes
 *    en cours sont réattribués par le cron suivant.
 *  - `ClanMatchesCache` : `precomputeClanMatchesStats` pour chaque clan dont une charge diffère.
 *  - `ClanComparatorCache` : `computeClanComparatorStats` pour chaque clan dont une charge diffère.
 * Hors du script : `Clan.clanStats` n'est pas touché (il lit `Match.placement`, la place de chaque joueur) ; la Ligue,
 * la page Cartes, l'annuaire et les vitrines se recalculent à la lecture (caches mémoire de 5 minutes) ; les défis actifs
 * au prochain passage du cron (`refreshChallengeProgressForClan`) ; les alertes Discord et notifications déjà envoyées
 * ne se rattrapent pas.
 *
 * Usage, depuis la racine du projet :
 *   npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/recalc-shared-placement.ts [--clan <id>] [--only playerstats,matches-cache,comparator] [--apply]
 */
import { Prisma } from '@prisma/client'

import { buildClanComparatorPayload, computeClanComparatorStats } from '@/lib/clan-comparator-service'
import { buildClanMatchesCachePayloads, precomputeClanMatchesStats } from '@/lib/matches-cache-service'
import { prisma } from '@/lib/prisma'

const APPLY = process.argv.includes('--apply')
const clanArg = process.argv.indexOf('--clan')
const CLAN_ID = clanArg > 0 ? Number(process.argv[clanArg + 1]) : null
const onlyArg = process.argv.indexOf('--only')
const ONLY = new Set(onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : ['playerstats', 'matches-cache', 'comparator'])
const num = (value: unknown) => Number(value ?? 0)

if (CLAN_ID !== null && (!Number.isInteger(CLAN_ID) || CLAN_ID <= 0)) {
  console.error('--clan doit être un identifiant de clan entier positif')
  process.exit(1)
}

async function recalcPlayerStats() {
  console.log('\n— PlayerStats (matchesWon, winRate)')
  const rows = await prisma.$queryRaw<
    Array<{ id: string; periodType: string; matchesPlayed: number; matchesWon: number; expectedPlayed: bigint | number; expectedWins: bigint | number | string | null }>
  >(Prisma.sql`
    SELECT ps.id, ps.periodType, ps.matchesPlayed, ps.matchesWon,
           COUNT(sm.id) AS expectedPlayed, SUM(sm.id IS NOT NULL AND sq.placement = 1) AS expectedWins
      FROM PlayerStats ps
      ${CLAN_ID ? Prisma.sql`INNER JOIN ClanMember cm ON cm.id = ps.memberId AND cm.clanId = ${CLAN_ID}` : Prisma.empty}
      LEFT JOIN SquadMember sq ON sq.memberId = ps.memberId
      LEFT JOIN SquadMatch sm ON sm.id = sq.squadMatchId AND sm.matchType = 'official'
                             AND sm.createdAt >= ps.startDate AND sm.createdAt <= ps.endDate
     GROUP BY ps.id, ps.periodType, ps.matchesPlayed, ps.matchesWon
  `)
  const wrong = rows.filter((row) => num(row.matchesWon) !== num(row.expectedWins))
  // Une ligne de la période en cours dont les parties ont changé depuis le dernier calcul (cron de 03:00) : le cron
  // suivant la recalcule entière. Ici, seules les lignes à jour sont corrigées, pour garder winRate = matchesWon / matchesPlayed.
  const stale = wrong.filter((row) => num(row.matchesPlayed) !== num(row.expectedPlayed))
  const changed = wrong.filter((row) => num(row.matchesPlayed) === num(row.expectedPlayed))
  const byType = new Map<string, number>()
  for (const row of changed) byType.set(row.periodType, (byType.get(row.periodType) ?? 0) + 1)
  console.log(`  ${rows.length} lignes lues, ${changed.length} à corriger (${[...byType].map(([type, count]) => `${type} : ${count}`).join(', ') || 'aucune'})`)
  const delta = changed.reduce((sum, row) => sum + num(row.expectedWins) - num(row.matchesWon), 0)
  console.log(`  écart total de Top 1 sur ces lignes : ${delta >= 0 ? '+' : ''}${delta}`)
  if (stale.length > 0) console.log(`  ${stale.length} ligne(s) de période en cours, périmées depuis le dernier cron : laissées au cron de 03:00`)
  if (!APPLY || changed.length === 0) return

  for (let start = 0; start < changed.length; start += 200) {
    const chunk = changed.slice(start, start + 200)
    await prisma.$transaction(
      chunk.map((row) => {
        const matchesWon = num(row.expectedWins)
        const matchesPlayed = num(row.matchesPlayed)
        return prisma.playerStats.update({ where: { id: row.id }, data: { matchesWon, winRate: matchesPlayed > 0 ? matchesWon / matchesPlayed : 0 } })
      })
    )
  }
  console.log(`  ${changed.length} lignes corrigées`)
}

async function targetClans() {
  return prisma.clan.findMany({
    where: CLAN_ID ? { id: CLAN_ID } : { isActive: true },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })
}

type StoredWins = { globalStats?: { wins?: number } }

async function recalcMatchesCache() {
  console.log('\n— ClanMatchesCache')
  const stale: number[] = []
  for (const clan of await targetClans()) {
    const [fresh, stored] = await Promise.all([
      buildClanMatchesCachePayloads(clan.id),
      prisma.clanMatchesCache.findMany({ where: { clanId: clan.id }, select: { period: true, matchType: true, periodKey: true, payload: true } }),
    ])
    const storedByKey = new Map(stored.map((row) => [`${row.period}:${row.matchType}`, row]))
    const differing = fresh.filter((entry) => {
      const row = storedByKey.get(`${entry.period}:${entry.matchType}`)
      return !row || row.periodKey !== entry.periodKey || (row.payload as StoredWins)?.globalStats?.wins !== entry.payload.globalStats.wins
    })
    if (differing.length === 0) continue
    stale.push(clan.id)
    console.log(
      `  clan ${clan.id} (${clan.name}) : ${differing
        .map((entry) => {
          const row = storedByKey.get(`${entry.period}:${entry.matchType}`)
          return `${entry.period}/${entry.matchType} Top 1 ${row ? ((row.payload as StoredWins)?.globalStats?.wins ?? '?') : 'absent'} → ${entry.payload.globalStats.wins}`
        })
        .join(', ')}`
    )
  }
  console.log(`  ${stale.length} clan(s) à recalculer`)
  if (!APPLY) return
  for (const clanId of stale) await precomputeClanMatchesStats(clanId)
  console.log(`  ${stale.length} clan(s) recalculés`)
}

type StoredComparator = { performance?: { wins?: number; top10Count?: number } }

async function recalcComparator() {
  console.log('\n— ClanComparatorCache')
  const stale: number[] = []
  const now = new Date()
  for (const clan of await targetClans()) {
    const stored = await prisma.clanComparatorCache.findMany({ where: { clanId: clan.id }, select: { period: true, payload: true } })
    const storedByPeriod = new Map(stored.map((row) => [row.period, row.payload as StoredComparator]))
    const lines: string[] = []
    for (const period of ['week', 'month', 'all'] as const) {
      const fresh = await buildClanComparatorPayload(clan.id, period, now)
      const old = storedByPeriod.get(period)
      if (!old || old.performance?.wins !== fresh.performance.wins || old.performance?.top10Count !== fresh.performance.top10Count) {
        lines.push(`${period} Top 1 ${old?.performance?.wins ?? 'absent'} → ${fresh.performance.wins}, Top 10 ${old?.performance?.top10Count ?? 'absent'} → ${fresh.performance.top10Count}`)
      }
    }
    if (lines.length === 0) continue
    stale.push(clan.id)
    console.log(`  clan ${clan.id} (${clan.name}) : ${lines.join(' ; ')}`)
  }
  console.log(`  ${stale.length} clan(s) à recalculer`)
  if (!APPLY) return
  for (const clanId of stale) await computeClanComparatorStats(clanId, now)
  console.log(`  ${stale.length} clan(s) recalculés`)
}

async function main() {
  console.log(`Recalculs de la place d'un clan dans une partie partagée — ${APPLY ? 'ÉCRITURE (--apply)' : 'SIMULATION, rien n’est écrit'}${CLAN_ID ? `, clan ${CLAN_ID}` : ''}`)
  if (ONLY.has('playerstats')) await recalcPlayerStats()
  if (ONLY.has('matches-cache')) await recalcMatchesCache()
  if (ONLY.has('comparator')) await recalcComparator()
  if (!APPLY) console.log('\nSimulation terminée : relancer avec --apply pour écrire.')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
