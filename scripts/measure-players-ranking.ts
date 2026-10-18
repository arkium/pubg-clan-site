/**
 * Classement des joueurs (page « Joueurs ») — mesure préalable, LECTURE SEULE.
 *
 * Vérifie les chiffres de la maquette Claude Design « Joueurs » avant d'écrire le service : clans suivis et joueurs,
 * parties par période et par mode (gameMode PUBG), joueurs au-dessus de plusieurs seuils, part des parties jouées
 * sans un autre membre du clan (absentes de `SquadMember`), duels entre membres de clans différents (`KillEvent`),
 * couverture du retard sur le cercle (`MemberTelemetryStats`) et coût de la requête groupée.
 *
 * ⚠️ DATABASE_URL vise la base de PRODUCTION : aucune écriture, quelques agrégats sur `SquadMember`.
 *
 *   npx tsx scripts/measure-players-ranking.ts
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { getPeriodRange, type StandardPeriod } from '../src/lib/period'
import { prisma } from '../src/lib/prisma'

const n = (value: unknown) => (typeof value === 'bigint' ? Number(value) : Number(value ?? 0))

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now()
  const result = await run()
  console.log(`  ${label.padEnd(64)} ${String(Date.now() - started).padStart(6)} ms`)
  return result
}

const TRACKED_CLAN = Prisma.sql`c.isActive = 1 AND c.isSystem = 0 AND c.archivedAt IS NULL`
const ACTIVE_MEMBER = Prisma.sql`cm.isActive = 1 AND cm.joinStatus = 'active'`

/** Distance moyenne des kills par joueur (rôle « Tireur à distance ») : coût d'un agrégat `KillEvent` par période. */
async function measureKillDistances() {
  const now = new Date()
  console.log('== Distance des kills par joueur (KillEvent ⋈ SquadMatch officielles)')
  for (const period of ['week', 'month', 'all'] as StandardPeriod[]) {
    const since = getPeriodRange(period, now)?.start ?? null
    const rows = await timed(`agrégat ${period}`, () =>
      prisma.$queryRaw<Array<{ memberId: number; kills: bigint; withDistance: bigint; avgCm: number | null }>>(Prisma.sql`
        SELECT ke.killerMemberId AS memberId, COUNT(*) AS kills, COUNT(ke.distance) AS withDistance, AVG(ke.distance) AS avgCm
        FROM KillEvent ke
        INNER JOIN SquadMatch sm ON sm.id = ke.squadMatchId
        WHERE ke.killerMemberId IS NOT NULL AND sm.matchType = 'official'
          AND (ke.victimMemberId IS NULL OR ke.victimMemberId <> ke.killerMemberId)
          ${since ? Prisma.sql`AND sm.createdAt >= ${since}` : Prisma.empty}
        GROUP BY ke.killerMemberId`))
    const kills = rows.reduce((sum, row) => sum + n(row.kills), 0)
    const withDistance = rows.reduce((sum, row) => sum + n(row.withDistance), 0)
    const metres = rows.filter((row) => row.avgCm !== null).map((row) => Number(row.avgCm) / 100).sort((a, b) => a - b)
    const median = metres.length > 0 ? metres[Math.floor(metres.length / 2)] : 0
    console.log(`  ${rows.length} tireurs, ${kills} kills (${withDistance} avec distance), distance moyenne médiane ${median.toFixed(0)} m`)
  }
}

/** Seuil de classement : joueurs au-dessus de 5, 10 et 15 parties sur des semaines et un mois complets. */
async function measureFullPeriods() {
  const now = new Date()
  const week = getPeriodRange('week', now)!
  const windows: Array<[string, Date, Date]> = [1, 2, 3].map((back) => {
    const start = new Date(week.start.getTime() - back * 7 * 86_400_000)
    return [`semaine du ${start.toISOString().slice(0, 10)}`, start, new Date(start.getTime() + 7 * 86_400_000)]
  })
  const previousMonth = getPeriodRange('month-1', now)!
  windows.push([`mois du ${previousMonth.start.toISOString().slice(0, 10)}`, previousMonth.start, previousMonth.end])
  console.log('== Périodes complètes : joueurs au-dessus du seuil (parties officielles de clan)')
  for (const [label, start, end] of windows) {
    const rows = await prisma.$queryRaw<Array<{ total: bigint; duo: bigint; squad: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS total, SUM(sm.gameMode LIKE 'duo%') AS duo, SUM(sm.gameMode LIKE 'squad%') AS squad
      FROM SquadMember sq
      INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
      INNER JOIN ClanMember cm ON cm.id = sq.memberId
      INNER JOIN Clan c ON c.id = cm.clanId
      WHERE sm.matchType = 'official' AND ${ACTIVE_MEMBER} AND ${TRACKED_CLAN}
        AND sm.createdAt >= ${start} AND sm.createdAt < ${end}
      GROUP BY sq.memberId`)
    const at = (pick: (row: (typeof rows)[number]) => bigint, min: number) => rows.filter((row) => n(pick(row)) >= min).length
    console.log(
      `  ${label.padEnd(26)} ${String(rows.length).padStart(4)} joueurs · tous ≥5 ${at((r) => r.total, 5)} ≥10 ${at((r) => r.total, 10)} ≥15 ${at((r) => r.total, 15)}` +
        ` · duo ≥5 ${at((r) => r.duo, 5)} ≥10 ${at((r) => r.duo, 10)} · squad ≥10 ${at((r) => r.squad, 10)}`
    )
  }
}

/** Rôle Ghost : part des fermetures de zone passées dans le nouveau cercle (`ZoneClosurePosition`), par période. */
async function measureZoneClosures() {
  const now = new Date()
  console.log('== Fermetures de zone par joueur (ZoneClosurePosition ⋈ SquadMatch officielles)')
  for (const period of ['week', 'month', 'all'] as StandardPeriod[]) {
    const since = getPeriodRange(period, now)?.start ?? null
    const rows = await timed(`agrégat ${period}`, () =>
      prisma.$queryRaw<Array<{ memberId: number; matches: bigint; closures: bigint; inside: bigint }>>(Prisma.sql`
        SELECT z.memberId AS memberId, COUNT(DISTINCT z.squadMatchId) AS matches, COUNT(*) AS closures,
               SUM(z.zoneBand <> 'outside') AS inside
        FROM ZoneClosurePosition z
        INNER JOIN SquadMatch sm ON sm.id = z.squadMatchId
        WHERE sm.matchType = 'official'
          ${since ? Prisma.sql`AND sm.createdAt >= ${since}` : Prisma.empty}
        GROUP BY z.memberId`))
    const shares = rows.map((row) => n(row.inside) / Math.max(1, n(row.closures))).sort((a, b) => a - b)
    const matches = rows.reduce((sum, row) => sum + n(row.matches), 0)
    console.log(
      `  ${rows.length} joueurs, ${matches} lignes joueur × partie couvertes, part dans la zone : ` +
        `médiane ${Math.round((shares[Math.floor(shares.length / 2)] ?? 0) * 100)} %, ` +
        `p10 ${Math.round((shares[Math.floor(shares.length * 0.1)] ?? 0) * 100)} %, p90 ${Math.round((shares[Math.floor(shares.length * 0.9)] ?? 0) * 100)} %`
    )
  }
}

/** Le vrai service (`getPlayersRanking`, `getPlayersComparison`) sur chaque période et mode : temps et volumes. */
async function measureService() {
  const { getPlayersComparison, getPlayersRanking } = await import('../src/lib/players-ranking-service')
  const { rankPlayers } = await import('../src/lib/players-ranking')
  console.log('== Service (premier appel, sans cache)')
  for (const period of ['week', 'month', 'all'] as StandardPeriod[]) {
    for (const mode of ['all', 'duo', 'squad'] as const) {
      const ranking = await timed(`getPlayersRanking ${period} ${mode}`, () => getPlayersRanking(period, mode))
      const top = rankPlayers(ranking.ranked, 'damage').slice(0, 3)
      const withPrevious = ranking.ranked.filter((entry) => entry.previousRanks !== null).length
      const bytes = Buffer.byteLength(JSON.stringify(ranking))
      console.log(
        `    ${ranking.ranked.length} classés, ${ranking.qualifying.length} en qualification, ${withPrevious} avec rang précédent, ` +
          `${ranking.clans.length} clans, ${Math.round(bytes / 1024)} Ko · top dégâts : ${top.map((entry) => `${entry.name} [${entry.clanTag}] ${Math.round(entry.avgDamage)}`).join(', ')}`
      )
    }
  }
  const month = await getPlayersRanking('month', 'all')
  const [a, b] = rankPlayers(month.ranked, 'damage')
  if (a && b) {
    const comparison = await timed('getPlayersComparison mois (2 joueurs + moyenne du clan du 1er)', () =>
      getPlayersComparison([{ kind: 'player', memberId: a.memberId }, { kind: 'player', memberId: b.memberId }, { kind: 'clan', clanId: a.clanId }], 'month', 'all')
    )
    for (const slot of comparison.slots) {
      console.log(
        `    ${slot.name} : ${slot.matches} parties, rôles ${JSON.stringify(slot.roles)}, retard cercle ${slot.values.avgCircleDelaySeconds} s, ` +
          `zone ${slot.values.avgBlueZoneHits}, armes ${slot.weapons.map((weapon) => `${weapon.name} (${weapon.matchCount} p., ${weapon.kills} k)`).join(', ')}`
      )
    }
    console.log(`    duels : ${JSON.stringify(comparison.duels)}`)
  }
}

async function main() {
  if (process.argv.includes('--service')) return measureService()
  if (process.argv.includes('--zone-only')) return measureZoneClosures()
  if (process.argv.includes('--kills-only')) return measureKillDistances()
  if (process.argv.includes('--full-periods')) return measureFullPeriods()
  console.log('== Clans suivis et joueurs')
  const [clans] = await prisma.$queryRaw<Array<{ clans: bigint; withPubg: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS clans, SUM(c.pubgClanId IS NOT NULL) AS withPubg FROM Clan c WHERE ${TRACKED_CLAN}`)
  const [members] = await prisma.$queryRaw<Array<{ members: bigint; linked: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS members, SUM(EXISTS(SELECT 1 FROM MemberIdentity mi WHERE mi.memberId = cm.id)) AS linked
    FROM ClanMember cm INNER JOIN Clan c ON c.id = cm.clanId WHERE ${TRACKED_CLAN} AND ${ACTIVE_MEMBER}`)
  console.log(`  clans suivis : ${n(clans.clans)} (dont ${n(clans.withPubg)} reliés à un clan PUBG)`)
  console.log(`  joueurs actifs de ces clans : ${n(members.members)} (dont ${n(members.linked)} reliés à un compte du site)`)

  console.log('\n== Types et modes des parties de clan (SquadMatch, tout l\'historique)')
  const modes = await prisma.$queryRaw<Array<{ matchType: string; gameMode: string; matches: bigint }>>(Prisma.sql`
    SELECT sm.matchType AS matchType, sm.gameMode AS gameMode, COUNT(*) AS matches FROM SquadMatch sm
    GROUP BY sm.matchType, sm.gameMode ORDER BY matches DESC LIMIT 20`)
  for (const row of modes) console.log(`  ${row.matchType.padEnd(12)} ${row.gameMode.padEnd(16)} ${n(row.matches)}`)

  const now = new Date()
  for (const period of ['week', 'month', 'all'] as StandardPeriod[]) {
    const range = getPeriodRange(period, now)
    const since = range?.start ?? null
    console.log(`\n== Période ${period}${since ? ` (depuis ${since.toISOString()})` : ''}`)
    const rows = await timed('parties officielles par joueur et par mode (SquadMember)', () =>
      prisma.$queryRaw<Array<{ memberId: number; duo: bigint; squad: bigint; other: bigint; total: bigint }>>(Prisma.sql`
        SELECT sq.memberId AS memberId,
               SUM(sm.gameMode LIKE 'duo%') AS duo,
               SUM(sm.gameMode LIKE 'squad%') AS squad,
               SUM(sm.gameMode NOT LIKE 'duo%' AND sm.gameMode NOT LIKE 'squad%') AS other,
               COUNT(*) AS total
        FROM SquadMember sq
        INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
        INNER JOIN ClanMember cm ON cm.id = sq.memberId
        INNER JOIN Clan c ON c.id = cm.clanId
        WHERE sm.matchType = 'official' AND ${ACTIVE_MEMBER} AND ${TRACKED_CLAN}
          ${since ? Prisma.sql`AND sm.createdAt >= ${since}` : Prisma.empty}
        GROUP BY sq.memberId`))
    const count = (pick: (row: (typeof rows)[number]) => bigint, min: number) => rows.filter((row) => n(pick(row)) >= min).length
    for (const min of [1, 5, 10, 20, 30]) {
      console.log(
        `  ≥ ${String(min).padStart(2)} parties : tous ${String(count((r) => r.total, min)).padStart(4)}` +
          ` · duo ${String(count((r) => r.duo, min)).padStart(4)} · squad ${String(count((r) => r.squad, min)).padStart(4)}`
      )
    }
    const totals = rows.reduce((acc, row) => ({ duo: acc.duo + n(row.duo), squad: acc.squad + n(row.squad), other: acc.other + n(row.other) }), { duo: 0, squad: 0, other: 0 })
    console.log(`  lignes joueur × partie : duo ${totals.duo} · squad ${totals.squad} · autre ${totals.other}`)

    const [solo] = await timed('parties officielles hors SquadMember (Match seul)', () =>
      prisma.$queryRaw<Array<{ inMatch: bigint; withoutClan: bigint }>>(Prisma.sql`
        SELECT COUNT(*) AS inMatch,
               SUM(NOT EXISTS(SELECT 1 FROM SquadMatch sm INNER JOIN SquadMember sq ON sq.squadMatchId = sm.id
                              WHERE sm.pubgMatchId = m.pubgMatchId AND sq.memberId = m.memberId)) AS withoutClan
        FROM \`Match\` m
        INNER JOIN ClanMember cm ON cm.id = m.memberId
        INNER JOIN Clan c ON c.id = cm.clanId
        WHERE m.matchType = 'official' AND ${ACTIVE_MEMBER} AND ${TRACKED_CLAN}
          ${since ? Prisma.sql`AND m.pubgCreatedAt >= ${since}` : Prisma.empty}`))
    console.log(`  lignes Match officielles : ${n(solo.inMatch)}, dont ${n(solo.withoutClan)} sans autre membre du clan (absentes du classement)`)
  }

  console.log('\n== Duels entre joueurs de clans suivis différents (KillEvent, tout l\'historique)')
  const [duels] = await timed('kills entre membres de deux clans différents', () =>
    prisma.$queryRaw<Array<{ kills: bigint; pairs: bigint; byAccount: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS kills,
             COUNT(DISTINCT LEAST(ke.killerMemberId, vm.id), GREATEST(ke.killerMemberId, vm.id)) AS pairs,
             SUM(ke.victimMemberId IS NULL) AS byAccount
      FROM KillEvent ke
      INNER JOIN ClanMember km ON km.id = ke.killerMemberId
      INNER JOIN ClanMember vm ON vm.id = ke.victimMemberId OR (ke.victimMemberId IS NULL AND vm.pubgAccountId = ke.victimAccountId)
      WHERE km.clanId <> vm.clanId AND km.isActive = 1 AND vm.isActive = 1`))
  console.log(`  ${n(duels.kills)} kills, ${n(duels.pairs)} paires de joueurs, dont ${n(duels.byAccount)} retrouvés par accountId seulement`)

  console.log('\n== Couverture télémétrie du mois (MemberTelemetryStats)')
  const monthKey = `month-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [telemetry] = await prisma.$queryRaw<Array<{ rows_: bigint; withDelay: bigint; withHits: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS rows_, SUM(t.avgCircleDelaySeconds > 0) AS withDelay, SUM(t.avgBlueZoneHits > 0) AS withHits
    FROM MemberTelemetryStats t WHERE t.period = ${monthKey}`)
  console.log(`  ${monthKey} : ${n(telemetry.rows_)} lignes, retard sur le cercle > 0 : ${n(telemetry.withDelay)}, coups de zone > 0 : ${n(telemetry.withHits)}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
