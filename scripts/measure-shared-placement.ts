/**
 * Place d'un clan dans une partie partagée — mesure en LECTURE SEULE (docs/TODO/place-partie-partagee.md).
 *
 *  1. Rejoue la requête du §2 de la fiche (place de la ligne `SquadMatch.placement` contre la meilleure place des
 *     membres, par clan actuel) : l'ampleur « avant ».
 *  2. Tire un échantillon de parties partagées (au moins deux clans suivis, les Top 1 discordants d'abord) et vérifie
 *     que chaque consommateur corrigé rend la place des membres actifs du clan : Ligue (`loadLeagueRows`), Cartes
 *     (`loadClanMapStats`, totaux par clan), matchs (route `GET /api/clans/[clanId]/matches`, période « mois »), cache
 *     des matchs (`buildClanMatchesCachePayloads`, sans écrire), Coach IA (`getSessions` d'une soirée).
 *  3. Effet de la correction : rang en Ligue (semaine, mois ; parties Normal) et Top 1 de la page Cartes, avant / après.
 *
 * Aucune écriture : la route est appelée dans ce seul processus, garde levée par `DISABLE_AUTH_PERMISSIONS`, et ne lit
 * que la base. Usage, depuis la racine du projet :
 *   npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/measure-shared-placement.ts [--since 2026-10-01] [--sample 30] [--route-clans 6]
 */
import { Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'

import { leagueTableBetween, type LeagueMatchRow } from '@/lib/clan-league'
import { loadLeagueClans, loadLeagueRows } from '@/lib/clan-league-service'
import { getLeagueSettings } from '@/lib/league-settings-service'
import { loadClanMapStats } from '@/lib/clan-map-stats-service'
import { buildClanMatchesCachePayloads } from '@/lib/matches-cache-service'
import { createCoachTools } from '@/lib/coach/coach-tools'
import { sessionDateOf } from '@/lib/match-sessions'
import { getPeriodRange } from '@/lib/period'
import { prisma } from '@/lib/prisma'

process.env.DISABLE_AUTH_PERMISSIONS = 'true'

function option(name: string, fallback: string) {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const SINCE = new Date(`${option('since', '2026-10-01')}T00:00:00Z`)
const SAMPLE = Number(option('sample', '30'))
const ROUTE_CLANS = Number(option('route-clans', '6'))
const num = (value: unknown) => Number(value ?? 0)
const timed = async <T>(label: string, run: () => Promise<T>) => {
  const start = Date.now()
  const result = await run()
  console.log(`   (${label} : ${Date.now() - start} ms)`)
  return result
}

type RawMember = {
  squadMatchId: string
  linePlacement: number
  matchType: string
  mapName: string
  createdAt: Date
  clanId: number
  isActive: number | boolean
  joinStatus: string
  placement: number
}

/** Place d'un clan, calculée ici sans le code du site : membres actifs, plus petite place non nulle. */
function expectedPlacements(rows: RawMember[]) {
  const byKey = new Map<string, number | null>()
  for (const row of rows) {
    const key = `${row.squadMatchId}:${row.clanId}`
    const counts = Boolean(Number(row.isActive)) && row.joinStatus === 'active' && row.placement > 0
    const current = byKey.get(key) ?? null
    byKey.set(key, counts && (current === null || row.placement < current) ? row.placement : current)
  }
  return byKey
}

async function main() {
  console.log(`Place d'un clan dans une partie partagée — lecture seule, parties depuis le ${SINCE.toISOString().slice(0, 10)}\n`)

  // ── 1. Requête du §2 (clan actuel des membres, toutes les places de membres) ──
  console.log('1. Ampleur avant correction (requête du §2, clan actuel)')
  const ampleur = await timed('requête §2', () =>
    prisma.$queryRaw<Array<{ clanId: number; matches: bigint; wrong: unknown; falseWins: unknown; lostWins: unknown }>>(Prisma.sql`
      SELECT t.clanId, COUNT(*) AS matches,
             SUM(t.matchPlacement <> t.clanPlacement) AS wrong,
             SUM(t.matchPlacement = 1 AND t.clanPlacement <> 1) AS falseWins,
             SUM(t.matchPlacement <> 1 AND t.clanPlacement = 1) AS lostWins
        FROM (
          SELECT cm.clanId, sm.id, sm.placement AS matchPlacement, MIN(sq.placement) AS clanPlacement
            FROM SquadMember sq
            JOIN ClanMember cm ON cm.id = sq.memberId
            JOIN SquadMatch sm ON sm.id = sq.squadMatchId
           WHERE sm.createdAt >= ${SINCE} AND cm.clanId IS NOT NULL
           GROUP BY cm.clanId, sm.id, sm.placement
        ) t
       GROUP BY t.clanId
       ORDER BY wrong DESC`)
  )
  const total = ampleur.reduce(
    (acc, row) => ({ matches: acc.matches + num(row.matches), wrong: acc.wrong + num(row.wrong), falseWins: acc.falseWins + num(row.falseWins), lostWins: acc.lostWins + num(row.lostWins) }),
    { matches: 0, wrong: 0, falseWins: 0, lostWins: 0 }
  )
  console.log(`   Tous les clans : ${total.matches} parties de clan, ${total.wrong} places fausses, ${total.falseWins} Top 1 en trop, ${total.lostWins} manqués`)
  for (const row of ampleur.slice(0, 8)) {
    console.log(`   clan ${row.clanId} : ${num(row.matches)} parties, ${num(row.wrong)} fausses, ${num(row.falseWins)} Top 1 en trop, ${num(row.lostWins)} manqués`)
  }

  // ── 2. Échantillon de parties partagées ──
  console.log(`\n2. Échantillon de parties partagées (≥ 2 clans suivis), ${SAMPLE} parties, Top 1 discordants d'abord`)
  const candidates = await prisma.$queryRaw<Array<{ id: string; clans: bigint; top1Discord: unknown; discord: unknown }>>(Prisma.sql`
    SELECT t.id, COUNT(*) AS clans, MAX((t.line = 1) <> (t.clanPlace = 1)) AS top1Discord, MAX(t.line <> t.clanPlace) AS discord
      FROM (
        SELECT sm.id, cm.clanId, sm.placement AS line,
               MIN(CASE WHEN cm.isActive = 1 AND cm.joinStatus = 'active' AND sq.placement > 0 THEN sq.placement END) AS clanPlace
          FROM SquadMember sq
          JOIN SquadMatch sm ON sm.id = sq.squadMatchId
          JOIN ClanMember cm ON cm.id = sq.memberId
          JOIN Clan c ON c.id = cm.clanId
         WHERE sm.createdAt >= ${SINCE} AND c.isActive = 1 AND c.isSystem = 0 AND c.pubgClanId IS NOT NULL
         GROUP BY sm.id, cm.clanId, sm.placement
      ) t
     WHERE t.clanPlace IS NOT NULL
     GROUP BY t.id
    HAVING COUNT(*) >= 2`)
  const top1 = candidates.filter((row) => num(row.top1Discord) === 1)
  const discordant = candidates.filter((row) => num(row.top1Discord) !== 1 && num(row.discord) === 1)
  const others = candidates.filter((row) => num(row.discord) !== 1)
  const sampleIds = [...top1.slice(0, Math.ceil(SAMPLE / 2)), ...discordant, ...others].slice(0, SAMPLE).map((row) => row.id)
  console.log(`   ${candidates.length} parties partagées depuis le ${SINCE.toISOString().slice(0, 10)}, dont ${top1.length} au Top 1 discordant et ${discordant.length} autres à place discordante`)

  const raw = await prisma.$queryRaw<RawMember[]>(Prisma.sql`
    SELECT sq.squadMatchId, sm.placement AS linePlacement, sm.matchType, sm.mapName, sm.createdAt,
           cm.clanId, cm.isActive, cm.joinStatus, sq.placement
      FROM SquadMember sq
      JOIN SquadMatch sm ON sm.id = sq.squadMatchId
      JOIN ClanMember cm ON cm.id = sq.memberId
      JOIN Clan c ON c.id = cm.clanId
     WHERE sq.squadMatchId IN (${Prisma.join(sampleIds)}) AND c.isActive = 1 AND c.isSystem = 0 AND c.pubgClanId IS NOT NULL`)
  const expected = expectedPlacements(raw)
  const pairs = [...expected.entries()].filter(([, placement]) => placement !== null).map(([key, placement]) => {
    const [matchId, clanId] = key.split(':')
    const row = raw.find((entry) => entry.squadMatchId === matchId)!
    return { matchId, clanId: Number(clanId), placement: placement!, line: num(row.linePlacement), matchType: row.matchType, createdAt: new Date(row.createdAt) }
  })
  const top1Pairs = pairs.filter((pair) => (pair.line === 1) !== (pair.placement === 1)).length
  console.log(`   ${sampleIds.length} parties, ${pairs.length} couples clan × partie, dont ${pairs.filter((pair) => pair.line !== pair.placement).length} à place discordante et ${top1Pairs} au Top 1 discordant`)

  const report = (label: string, checked: number, ok: number, extra = '') =>
    console.log(`   ${ok === checked ? 'OK ' : 'ÉCART'} ${label} : ${ok} / ${checked} conformes${extra}`)

  // Ligue
  const leagueRows = new Map<string, LeagueMatchRow>()
  for (const matchType of ['official', 'competitive', 'casual', 'custom'] as const) {
    for (const row of await loadLeagueRows(SINCE, matchType)) leagueRows.set(`${row.matchId}:${row.clanId}`, row)
  }
  const leagueChecked = pairs.filter((pair) => leagueRows.has(`${pair.matchId}:${pair.clanId}`))
  report('Ligue (loadLeagueRows)', leagueChecked.length, leagueChecked.filter((pair) => leagueRows.get(`${pair.matchId}:${pair.clanId}`)!.placement === pair.placement).length, ` (${pairs.length - leagueChecked.length} hors des types de la Ligue)`)

  // Coach : bilan d'une soirée, liste de ses parties
  let coachChecked = 0
  let coachOk = 0
  let coachAbsent = 0
  const memberOfClan = new Map<number, { id: number; displayName: string }>()
  for (const pair of pairs) {
    if (!memberOfClan.has(pair.clanId)) {
      const member = await prisma.clanMember.findFirst({ where: { clanId: pair.clanId, isActive: true, joinStatus: 'active' }, select: { id: true, displayName: true } })
      if (member) memberOfClan.set(pair.clanId, member)
    }
    const member = memberOfClan.get(pair.clanId)
    if (!member) continue
    const tools = createCoachTools({ clanId: pair.clanId, memberId: member.id, memberName: member.displayName })
    const result = (await tools.run({ name: 'getSessions', args: { date: sessionDateOf(pair.createdAt) } })) as { sessions?: Array<{ matchList?: Array<{ matchId: string; placement: number }> }> }
    const line = result.sessions?.[0]?.matchList?.find((entry) => entry.matchId === pair.matchId)
    if (!line) {
      coachAbsent += 1
      continue
    }
    coachChecked += 1
    if (line.placement === pair.placement) coachOk += 1
  }
  report('Coach IA (getSessions, liste de la soirée)', coachChecked, coachOk, coachAbsent ? ` (${coachAbsent} hors des 40 parties listées de la soirée)` : '')

  // Route des matchs (période « mois ») : les clans qui ont le plus de couples dans l'échantillon
  const month = getPeriodRange('month', new Date())!
  const monthPairs = pairs.filter((pair) => pair.createdAt >= month.start)
  const routeClans = [...new Set(monthPairs.map((pair) => pair.clanId))]
    .sort((a, b) => monthPairs.filter((pair) => pair.clanId === b).length - monthPairs.filter((pair) => pair.clanId === a).length)
    .slice(0, ROUTE_CLANS)
  const { GET: clanMatchesRoute } = await import('@/app/api/clans/[clanId]/matches/route')
  let routeChecked = 0
  let routeOk = 0
  for (const clanId of routeClans) {
    const response = await timed(`route des matchs, clan ${clanId}`, () =>
      clanMatchesRoute(new NextRequest(`http://localhost/api/clans/${clanId}/matches?period=month`), { params: Promise.resolve({ clanId: String(clanId) }) })
    )
    const body = (await response.json()) as { squads?: Array<{ id: string; placement: number; isWin: boolean }> }
    const byId = new Map((body.squads ?? []).map((squad) => [squad.id, squad]))
    for (const pair of monthPairs.filter((entry) => entry.clanId === clanId)) {
      const squad = byId.get(pair.matchId)
      if (!squad) continue
      routeChecked += 1
      if (squad.placement === pair.placement && squad.isWin === (pair.placement === 1)) routeOk += 1
    }
  }
  report(`Route des matchs (${routeClans.length} clans, mois)`, routeChecked, routeOk)

  // Totaux du mois par clan : Cartes et cache des matchs contre un calcul indépendant
  console.log(`\n3. Effet par clan sur le mois (parties Normal pour les Cartes) : Top 1 avant (ligne) / après (membres)`)
  const monthRows = await prisma.$queryRaw<RawMember[]>(Prisma.sql`
    SELECT sq.squadMatchId, sm.placement AS linePlacement, sm.matchType, sm.mapName, sm.createdAt,
           cm.clanId, cm.isActive, cm.joinStatus, sq.placement
      FROM SquadMember sq
      JOIN SquadMatch sm ON sm.id = sq.squadMatchId
      JOIN ClanMember cm ON cm.id = sq.memberId
     WHERE sm.createdAt >= ${month.start} AND sm.createdAt < ${month.end} AND cm.clanId IN (${Prisma.join(routeClans)})
       AND cm.isActive = 1 AND cm.joinStatus = 'active'`)
  const monthExpected = expectedPlacements(monthRows)
  const lineOf = new Map(monthRows.map((row) => [row.squadMatchId, row]))
  for (const clanId of routeClans) {
    const official = [...monthExpected.entries()]
      .filter(([key]) => key.endsWith(`:${clanId}`))
      .map(([key, placement]) => ({ id: key.split(':')[0], placement }))
      .filter((entry) => lineOf.get(entry.id)?.matchType === 'official')
    const winsAfter = official.filter((entry) => entry.placement === 1).length
    const winsBefore = official.filter((entry) => num(lineOf.get(entry.id)?.linePlacement) === 1).length
    const top10After = official.filter((entry) => entry.placement !== null && entry.placement <= 10).length
    const maps = await loadClanMapStats({ clanId, period: 'month', matchType: 'official' })
    const mapWins = (maps?.maps ?? []).reduce((sum, row) => sum + row.wins, 0)
    const mapTop10 = Math.round((maps?.maps ?? []).reduce((sum, row) => sum + row.top10Rate * row.matches, 0))
    const cache = await buildClanMatchesCachePayloads(clanId)
    const cacheMonth = cache.find((entry) => entry.period === 'month' && entry.matchType === 'official')
    const cacheWins = cacheMonth ? cacheMonth.payload.globalStats.wins : null
    const ok = mapWins === winsAfter && mapTop10 === top10After && cacheWins === winsAfter
    console.log(
      `   ${ok ? 'OK ' : 'ÉCART'} clan ${clanId} : ${official.length} parties Normal, Top 1 ${winsBefore} → ${winsAfter} ` +
        `(Cartes ${mapWins}, cache des matchs ${cacheWins}), Top 10 ${top10After} (Cartes ${mapTop10})`
    )
  }

  // ── 4. Rang en Ligue : ancienne lecture (ligne) contre nouvelle (membres) ──
  console.log('\n4. Rang en Ligue des clans (parties Normal), avant / après')
  const settings = await getLeagueSettings()
  const clans = await loadLeagueClans()
  for (const period of ['week', 'month'] as const) {
    const range = getPeriodRange(period, new Date())!
    const minMatches = settings.minMatches.official[period]
    const before = await timed(`ancienne requête de la Ligue, ${period}`, () =>
      prisma.$queryRaw<Array<{ clanId: number; matchId: string; createdAt: Date; placement: number; damage: number | null; kills: unknown; knocks: unknown }>>(Prisma.sql`
        SELECT cm.clanId AS clanId, sm.id AS matchId, sm.createdAt AS createdAt, sm.placement AS placement,
               SUM(sq.damage) AS damage, SUM(sq.kills) AS kills, SUM(sq.knockouts) AS knocks
          FROM SquadMember sq
          INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
          INNER JOIN ClanMember cm ON cm.id = sq.memberId
          INNER JOIN Clan c ON c.id = cm.clanId
         WHERE sm.matchType IN ('official') AND cm.isActive = 1 AND cm.joinStatus = 'active'
           AND c.isActive = 1 AND c.pubgClanId IS NOT NULL AND sm.createdAt >= ${range.start}
         GROUP BY cm.clanId, sm.id, sm.createdAt, sm.placement`)
    )
    const after = await timed(`nouvelle requête de la Ligue, ${period}`, () => loadLeagueRows(range.start, 'official'))
    const toRows = (rows: typeof before): LeagueMatchRow[] =>
      rows.map((row) => ({ clanId: Number(row.clanId), matchId: row.matchId, createdAt: new Date(row.createdAt), placement: num(row.placement), damage: num(row.damage), kills: num(row.kills), knocks: num(row.knocks) }))
    const tableBefore = leagueTableBetween(toRows(before), clans, range.start, null, minMatches, settings).standings
    const tableAfter = leagueTableBetween(after, clans, range.start, null, minMatches, settings).standings
    const rankBefore = new Map(tableBefore.map((entry) => [entry.clanId, entry]))
    const moved = tableAfter.filter((entry) => rankBefore.get(entry.clanId)?.rank !== entry.rank || rankBefore.get(entry.clanId)?.wins !== entry.wins)
    console.log(`   ${period === 'week' ? 'Semaine' : 'Mois'} : ${tableAfter.length} clans classés, ${moved.filter((entry) => rankBefore.get(entry.clanId)?.rank !== entry.rank).length} changent de rang, ${moved.filter((entry) => rankBefore.get(entry.clanId)?.wins !== entry.wins).length} de nombre de Top 1`)
    for (const entry of moved.slice(0, 12)) {
      const old = rankBefore.get(entry.clanId)
      console.log(`     ${entry.tag.padEnd(6)} rang ${old?.rank ?? '—'} → ${entry.rank}, Top 1 ${old?.wins ?? '—'} → ${entry.wins}, Power score ${old ? Math.round(old.powerScore) : '—'} → ${Math.round(entry.powerScore)}`)
    }
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
