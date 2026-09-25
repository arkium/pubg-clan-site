/**
 * Annuaire des joueurs (`/settings/opponents/players`) — mesure préalable, LECTURE SEULE.
 *
 * Répond aux questions du §3.D de docs/TODO/players.md avant d'écrire la requête :
 * volumes de `Player` / `ClanEncounter`, qualité du rattachement `ClanMember` → `Player`,
 * coût des tris et des filtres candidats. Aucune écriture, aucun changement de variable serveur.
 *
 * ⚠️ DATABASE_URL vise la base de PRODUCTION : les agrégats complets (tri par rencontres)
 * parcourent `ClanEncounter` une fois. À lancer ponctuellement, pas en boucle.
 *
 * Usage : npx tsx scripts/check-players-directory-cost.ts [prefixeDeRecherche=lord] [--edge-cases-only]
 *   --edge-cases-only : ne lance que la section 8 (rapide), sans les agrégats coûteux.
 *   --directory       : exécute le vrai `listPlayersDirectory` sur quelques combinaisons de
 *                       filtres (lecture seule, sans agrégat complet) et affiche les temps.
 */
import 'dotenv/config'

import { listPlayersDirectory, type PlayersDirectoryQuery } from '../src/lib/players-directory'
import { prisma } from '../src/lib/prisma'

type Row = Record<string, unknown>

const n = (value: unknown) => (typeof value === 'bigint' ? Number(value) : Number(value ?? 0))

async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now()
  const result = await run()
  console.log(`  ${label.padEnd(58)} ${String(Date.now() - started).padStart(6)} ms`)
  return result
}

async function explain(label: string, sql: string, ...params: unknown[]) {
  const rows = await prisma.$queryRawUnsafe<Row[]>(`EXPLAIN ${sql}`, ...params)
  console.log(`\n  EXPLAIN — ${label}`)
  for (const row of rows) {
    console.log(
      `    ${String(row.table ?? '').padEnd(14)} type=${String(row.type ?? '').padEnd(7)} key=${String(
        row.key ?? '-'
      ).padEnd(34)} rows=${String(row.rows ?? '').padStart(9)}  ${String(row.Extra ?? '')}`
    )
  }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--edge-cases-only')) return edgeCases()
  if (args.includes('--directory')) return directory()
  const prefix = (args.find((arg) => !arg.startsWith('--')) ?? 'lord').replace(/[%_\\]/g, '')

  const [version] = await prisma.$queryRawUnsafe<Row[]>('SELECT VERSION() AS v')
  console.log(`Serveur : ${String(version?.v)}`)

  const [collation] = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COLLATION_NAME AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Player' AND COLUMN_NAME = 'pubgPlayerName'`
  )
  console.log(`Collation de Player.pubgPlayerName : ${String(collation?.c)}`)

  console.log('\n=== 1. Volumes ===')
  const [volumes] = await timed('comptages exacts', () =>
    prisma.$queryRawUnsafe<Row[]>(
      `SELECT
         (SELECT COUNT(*) FROM Player) AS players,
         (SELECT COUNT(*) FROM ClanEncounter) AS encounters,
         (SELECT COUNT(*) FROM ClanMember) AS members,
         (SELECT COUNT(*) FROM OpponentClan) AS opponentClans`
    )
  )
  console.log(
    `  Player ${n(volumes?.players).toLocaleString('fr-FR')} · ClanEncounter ${n(volumes?.encounters).toLocaleString(
      'fr-FR'
    )} · ClanMember ${n(volumes?.members).toLocaleString('fr-FR')} · OpponentClan ${n(
      volumes?.opponentClans
    ).toLocaleString('fr-FR')}`
  )

  const indexes = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS i, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('Player', 'ClanEncounter')
     GROUP BY TABLE_NAME, INDEX_NAME ORDER BY TABLE_NAME, INDEX_NAME`
  )
  console.log('\n  Index disponibles :')
  for (const index of indexes) console.log(`    ${String(index.t)}.${String(index.i)} (${String(index.cols)})`)

  console.log('\n=== 2. Rattachement ClanMember → Player ===')
  const links = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT
       CASE
         WHEN cm.isActive = 1 AND cm.joinStatus = 'active' THEN 'actif'
         WHEN cm.joinStatus = 'pending' THEN 'en attente'
         WHEN cm.isActive = 0 AND cm.archivedReason IS NOT NULL THEN CONCAT('archivé:', cm.archivedReason)
         ELSE CONCAT('inactif:', cm.joinStatus)
       END AS etat,
       COUNT(*) AS total,
       SUM(cm.playerId IS NOT NULL) AS viaPlayerId,
       SUM(cm.playerId IS NULL AND EXISTS (
         SELECT 1 FROM Player p WHERE p.pubgAccountId = cm.pubgAccountId AND p.platformShard = cm.platformShard
       )) AS viaCompteSeulement,
       SUM(cm.playerId IS NULL AND NOT EXISTS (
         SELECT 1 FROM Player p WHERE p.pubgAccountId = cm.pubgAccountId AND p.platformShard = cm.platformShard
       )) AS sansPlayer,
       SUM(cm.pubgAccountId IS NULL) AS sansCompte
     FROM ClanMember cm
     GROUP BY etat ORDER BY total DESC`
  )
  for (const row of links) {
    console.log(
      `  ${String(row.etat).padEnd(32)} total=${n(row.total)} viaPlayerId=${n(row.viaPlayerId)} viaCompte=${n(
        row.viaCompteSeulement
      )} sansPlayer=${n(row.sansPlayer)} (dont sans pubgAccountId=${n(row.sansCompte)})`
    )
  }

  const [divergent] = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COUNT(*) AS c FROM ClanMember cm JOIN Player p ON p.id = cm.playerId
     WHERE cm.pubgAccountId IS NOT NULL
       AND (p.pubgAccountId <> cm.pubgAccountId OR p.platformShard <> cm.platformShard)`
  )
  console.log(`  playerId pointant vers un autre compte que pubgAccountId : ${n(divergent?.c)}`)

  const [multi] = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COUNT(*) AS joueurs, COALESCE(MAX(nb), 0) AS maxFiches FROM (
       SELECT l.playerId, COUNT(DISTINCT l.memberId) AS nb FROM (
         SELECT cm.playerId AS playerId, cm.id AS memberId FROM ClanMember cm WHERE cm.playerId IS NOT NULL
         UNION
         SELECT p.id, cm.id FROM ClanMember cm
         JOIN Player p ON p.pubgAccountId = cm.pubgAccountId AND p.platformShard = cm.platformShard
       ) l GROUP BY l.playerId HAVING COUNT(DISTINCT l.memberId) > 1
     ) x`
  )
  console.log(`  Player rattachés à plusieurs fiches ClanMember : ${n(multi?.joueurs)} (max ${n(multi?.maxFiches)} fiches)`)

  console.log('\n=== 3. Compteurs ===')
  await timed('COUNT(*) Player', () => prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM Player'))
  const [solo] = await timed('COUNT solo (résolu, sans clan)', () =>
    prisma.$queryRawUnsafe<Row[]>(
      'SELECT COUNT(*) AS c FROM Player WHERE clanResolvedAt IS NOT NULL AND opponentClanId IS NULL'
    )
  )
  const [unresolved] = await timed('COUNT non résolus', () =>
    prisma.$queryRawUnsafe<Row[]>('SELECT COUNT(*) AS c FROM Player WHERE clanResolvedAt IS NULL')
  )
  const [favorites] = await timed('COUNT favoris', () =>
    prisma.$queryRawUnsafe<Row[]>('SELECT COUNT(*) AS c FROM Player WHERE isFavorite = 1')
  )
  console.log(`  solo=${n(solo?.c)} · non résolus=${n(unresolved?.c)} · favoris=${n(favorites?.c)}`)

  console.log('\n=== 4. Pages candidates (50 lignes) ===')
  const byLastSeen = 'SELECT p.id FROM Player p ORDER BY p.lastSeenAt DESC, p.id DESC LIMIT 50'
  await timed('tri lastSeenAt', () => prisma.$queryRawUnsafe(byLastSeen))
  await explain('tri lastSeenAt', byLastSeen)

  const byName = 'SELECT p.id FROM Player p ORDER BY p.pubgPlayerName ASC, p.id ASC LIMIT 50'
  await timed('tri pubgPlayerName', () => prisma.$queryRawUnsafe(byName))
  await explain('tri pubgPlayerName', byName)

  const byEncounters = `SELECT ce.playerId, SUM(ce.encounterCount) AS total FROM ClanEncounter ce
     GROUP BY ce.playerId ORDER BY total DESC, ce.playerId DESC LIMIT 50`
  await timed('tri rencontres (agrégat complet ClanEncounter)', () => prisma.$queryRawUnsafe(byEncounters))
  await explain('tri rencontres', byEncounters)

  console.log(`\n=== 5. Recherche « ${prefix} » ===`)
  const prefixSql = 'SELECT p.id FROM Player p WHERE p.pubgPlayerName LIKE ? ORDER BY p.lastSeenAt DESC, p.id DESC LIMIT 50'
  await timed('préfixe + tri lastSeenAt', () => prisma.$queryRawUnsafe(prefixSql, `${prefix}%`))
  const [prefixCount] = await timed('préfixe COUNT', () =>
    prisma.$queryRawUnsafe<Row[]>('SELECT COUNT(*) AS c FROM Player WHERE pubgPlayerName LIKE ?', `${prefix}%`)
  )
  await explain('préfixe', prefixSql, `${prefix}%`)
  await timed('sous-chaîne + tri lastSeenAt', () => prisma.$queryRawUnsafe(prefixSql, `%${prefix}%`))
  const [containsCount] = await timed('sous-chaîne COUNT', () =>
    prisma.$queryRawUnsafe<Row[]>('SELECT COUNT(*) AS c FROM Player WHERE pubgPlayerName LIKE ?', `%${prefix}%`)
  )
  console.log(`  résultats : préfixe=${n(prefixCount?.c)} · sous-chaîne=${n(containsCount?.c)}`)

  console.log('\n=== 6. Filtre « Croisés par » (clan qui a le plus de rencontres) ===')
  const [bigClan] = await prisma.$queryRawUnsafe<Row[]>(
    'SELECT clanId, COUNT(*) AS c FROM ClanEncounter GROUP BY clanId ORDER BY c DESC LIMIT 1'
  )
  if (bigClan) {
    const clanId = n(bigClan.clanId)
    console.log(`  clan ${clanId} : ${n(bigClan.c).toLocaleString('fr-FR')} joueurs croisés`)
    const seenBy = `SELECT p.id FROM Player p
       WHERE EXISTS (SELECT 1 FROM ClanEncounter ce WHERE ce.playerId = p.id AND ce.clanId = ?)
       ORDER BY p.lastSeenAt DESC, p.id DESC LIMIT 50`
    await timed('croisés par + tri lastSeenAt', () => prisma.$queryRawUnsafe(seenBy, clanId))
    await explain('croisés par', seenBy, clanId)
    await timed('croisés par COUNT', () =>
      prisma.$queryRawUnsafe('SELECT COUNT(*) AS c FROM ClanEncounter WHERE clanId = ?', clanId)
    )
    const seenByEncounters = `SELECT ce.playerId FROM ClanEncounter ce WHERE ce.clanId = ?
       ORDER BY ce.encounterCount DESC LIMIT 50`
    await timed('croisés par + tri rencontres de ce clan', () => prisma.$queryRawUnsafe(seenByEncounters, clanId))
  }

  console.log('\n=== 7. Non suivis (exclusion des joueurs rattachés) ===')
  const linked = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT DISTINCT l.playerId FROM (
       SELECT cm.playerId AS playerId FROM ClanMember cm WHERE cm.playerId IS NOT NULL
       UNION
       SELECT p.id FROM ClanMember cm
       JOIN Player p ON p.pubgAccountId = cm.pubgAccountId AND p.platformShard = cm.platformShard
     ) l`
  )
  const linkedIds = linked.map((row) => String(row.playerId))
  console.log(`  joueurs rattachés à une fiche : ${linkedIds.length}`)
  if (linkedIds.length > 0) {
    const placeholders = linkedIds.map(() => '?').join(',')
    await timed('non suivis + tri lastSeenAt (NOT IN)', () =>
      prisma.$queryRawUnsafe(
        `SELECT p.id FROM Player p WHERE p.id NOT IN (${placeholders}) ORDER BY p.lastSeenAt DESC, p.id DESC LIMIT 50`,
        ...linkedIds
      )
    )
    await timed('suivis + tri lastSeenAt (IN)', () =>
      prisma.$queryRawUnsafe(
        `SELECT p.id FROM Player p WHERE p.id IN (${placeholders}) ORDER BY p.lastSeenAt DESC, p.id DESC LIMIT 50`,
        ...linkedIds
      )
    )
  }

  await edgeCases()
}

async function edgeCases() {
  console.log('\n=== 8. Cas limites ===')
  // Prisma échappe-t-il `_` et `%` dans startsWith/contains ? On compare le compte Prisma aux
  // deux interprétations SQL possibles d'un motif contenant `_`.
  const probe = 'a_'
  const viaPrisma = await prisma.player.count({ where: { pubgPlayerName: { startsWith: probe } } })
  const [literal] = await prisma.$queryRawUnsafe<Row[]>(
    "SELECT COUNT(*) AS c FROM Player WHERE pubgPlayerName LIKE ? ESCAPE '!'",
    'a!_%'
  )
  const [wildcard] = await prisma.$queryRawUnsafe<Row[]>(
    'SELECT COUNT(*) AS c FROM Player WHERE pubgPlayerName LIKE ?',
    'a_%'
  )
  console.log(
    `  startsWith('${probe}') Prisma=${viaPrisma} · SQL littéral=${n(literal?.c)} · SQL joker=${n(wildcard?.c)} → ${
      viaPrisma === n(literal?.c) && viaPrisma !== n(wildcard?.c) ? 'Prisma échappe' : 'Prisma N’échappe PAS (ou cas non discriminant)'
    }`
  )
  // Correctif retenu par l'annuaire : échapper nous-mêmes avec `\` (caractère d'échappement
  // par défaut de LIKE). Doit retomber sur le compte littéral.
  const escaped = await prisma.player.count({ where: { pubgPlayerName: { startsWith: 'a\\_' } } })
  console.log(`  startsWith('a\\\\_') Prisma=${escaped} → ${escaped === n(literal?.c) ? 'échappement effectif' : 'INEFFICACE'}`)

  const frozen = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT cm.id, cm.displayName, cm.clanId, c.isActive AS clanActive, c.isSystem
     FROM ClanMember cm LEFT JOIN Clan c ON c.id = cm.clanId
     WHERE cm.isActive = 1 AND cm.joinStatus = 'active' AND (c.id IS NULL OR c.isActive = 0)`
  )
  console.log(`  membres actifs dans un clan absent ou inactif : ${frozen.length}`)
  for (const row of frozen.slice(0, 10)) {
    console.log(`    #${n(row.id)} ${String(row.displayName)} clan=${String(row.clanId)} actif=${String(row.clanActive)}`)
  }

  const unlinked = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT cm.id, cm.displayName, cm.pubgAccountId, c.tag FROM ClanMember cm LEFT JOIN Clan c ON c.id = cm.clanId
     WHERE cm.playerId IS NULL AND NOT EXISTS (
       SELECT 1 FROM Player p WHERE p.pubgAccountId = cm.pubgAccountId AND p.platformShard = cm.platformShard
     )`
  )
  console.log(`  fiches sans aucune ligne Player : ${unlinked.length}`)
  for (const row of unlinked) {
    console.log(`    #${n(row.id)} ${String(row.displayName)} [${String(row.tag)}] compte=${String(row.pubgAccountId).slice(0, 12)}…`)
  }

  const shards = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT 'Player' AS t, platformShard AS s, COUNT(*) AS c FROM Player GROUP BY platformShard
     UNION ALL SELECT 'Clan', platformShard, COUNT(*) FROM Clan WHERE isActive = 1 GROUP BY platformShard`
  )
  console.log(`  shards : ${shards.map((row) => `${String(row.t)}/${String(row.s)}=${n(row.c)}`).join(' · ')}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

async function directory() {
  const base: PlayersDirectoryQuery = {
    status: 'all',
    q: '',
    seenByClanId: null,
    page: 1,
    pageSize: 25,
    sortBy: 'lastSeenAt',
    sortOrder: 'desc',
  }
  const [bigClan] = await prisma.$queryRawUnsafe<Row[]>(
    'SELECT clanId FROM ClanEncounter GROUP BY clanId ORDER BY COUNT(*) DESC LIMIT 1'
  )
  const cases: Array<[string, Partial<PlayersDirectoryQuery>, boolean]> = [
    ['défaut (tous, dernière vue) + compteurs', {}, true],
    ['page suivante, sans compteurs', { page: 2 }, false],
    ['préfixe « lord »', { q: 'lord' }, false],
    ['préfixe littéral « a_ » (échappement)', { q: 'a_' }, false],
    ['sous-chaîne « *kromb »', { q: '*kromb' }, false],
    ['suivis, tri rencontres (borné)', { status: 'tracked', sortBy: 'totalEncounters' }, false],
    ['non suivis', { status: 'untracked' }, false],
    ['sans clan PUBG', { status: 'noclan' }, false],
    ['favoris', { status: 'favorites' }, false],
    [`croisés par le clan ${n(bigClan?.clanId)}`, { seenByClanId: n(bigClan?.clanId) }, false],
    ['tous, tri rencontres → repli attendu', { sortBy: 'totalEncounters' }, false],
    ['tri alphabétique', { sortBy: 'pubgPlayerName', sortOrder: 'asc' }, false],
  ]

  console.log('\n=== listPlayersDirectory — code réel ===')
  for (const [label, overrides, includeCounters] of cases) {
    const started = Date.now()
    const result = await listPlayersDirectory({ ...base, ...overrides }, { includeCounters })
    const first = result.rows[0]
    console.log(
      `  ${label.padEnd(42)} ${String(Date.now() - started).padStart(6)} ms  total=${result.pagination.total} lignes=${
        result.rows.length
      }${result.sort.fallback ? ' [repli tri]' : ''}${
        first ? `  1re: ${first.pubgPlayerName} (${first.tracking.status}, ${first.encounters.total} renc.)` : ''
      }`
    )
    if (result.counters) console.log(`    compteurs : ${JSON.stringify(result.counters)}`)
  }
}
