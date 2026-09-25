/**
 * Arrêt de suivi d'un clan — état des clans inactifs, LECTURE SEULE.
 *
 * Répond au §3 de docs/TODO/clan-archive.md : un clan refusé garde `isActive = false` et
 * reste donc listé dans « Clans en attente ». Pour chaque clan inactif non système, affiche
 * son demandeur, les mouvements qui le visent par statut, et une conclusion :
 *   en attente — une décision reste à prendre (mouvement `pending` ou demandeur `pending`) ;
 *   refusé     — demandeur `rejected`, ou mouvements tous clos en `ignored` ;
 *   indéterminé — ni l'un ni l'autre, à examiner à la main.
 *
 * Aucune écriture. Une fois la colonne `Clan.archivedAt` en place, la colonne « archivé »
 * dit si le clan est déjà sorti de la liste d'attente.
 *
 * Usage : npx tsx scripts/check-clan-archive-state.ts
 */
import 'dotenv/config'

import { ARCHIVED_CLAN_WHERE, PENDING_CLAN_WHERE } from '../src/lib/clan-archive-state'
import { prisma } from '../src/lib/prisma'

type Row = Record<string, unknown>

const n = (value: unknown) => (typeof value === 'bigint' ? Number(value) : Number(value ?? 0))

async function main() {
  const [hasArchiveColumn] = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Clan' AND COLUMN_NAME = 'archivedAt'`
  )
  const archiveColumn = n(hasArchiveColumn?.c) > 0

  const clans = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT c.id, c.tag, c.name, c.platformShard, c.createdAt,
            ${archiveColumn ? 'c.archivedAt, c.archivedReason' : 'NULL AS archivedAt, NULL AS archivedReason'},
            (SELECT cm.joinStatus FROM ClanMember cm
               JOIN ClanMemberRole cmr ON cmr.memberId = cm.id
               JOIN ClanRole r ON r.id = cmr.roleId AND r.name = 'Owner'
              WHERE cm.clanId = c.id LIMIT 1) AS ownerStatus,
            (SELECT COUNT(*) FROM PlayerClanChange p WHERE p.newClanId = c.id AND p.status = 'pending') AS pendingMoves,
            (SELECT COUNT(*) FROM PlayerClanChange p WHERE p.newClanId = c.id AND p.status = 'ignored') AS ignoredMoves,
            (SELECT COUNT(*) FROM PlayerClanChange p WHERE p.newClanId = c.id AND p.status = 'applied') AS appliedMoves,
            (SELECT COUNT(*) FROM ClanMember cm WHERE cm.clanId = c.id AND cm.isActive = 1) AS activeMembers,
            (SELECT COUNT(*) FROM ClanMember cm WHERE cm.clanId = c.id) AS allMembers
     FROM Clan c
     WHERE c.isActive = 0 AND c.isSystem = 0
     ORDER BY c.createdAt`
  )

  console.log(`Colonne Clan.archivedAt présente : ${archiveColumn ? 'oui' : 'non'}`)
  console.log(`Clans inactifs non système : ${clans.length}\n`)

  const verdicts = { attente: 0, refusé: 0, indéterminé: 0, archivé: 0 }
  for (const clan of clans) {
    const pendingMoves = n(clan.pendingMoves)
    const ignoredMoves = n(clan.ignoredMoves)
    const ownerStatus = clan.ownerStatus === null ? null : String(clan.ownerStatus)

    let verdict: keyof typeof verdicts
    if (clan.archivedAt) verdict = 'archivé'
    else if (pendingMoves > 0 || ownerStatus === 'pending') verdict = 'attente'
    else if (ownerStatus === 'rejected' || ignoredMoves > 0) verdict = 'refusé'
    else verdict = 'indéterminé'
    verdicts[verdict] += 1

    console.log(
      `  #${n(clan.id)} [${String(clan.tag)}] ${String(clan.name)} (${String(clan.platformShard)}) créé ${new Date(
        String(clan.createdAt)
      ).toISOString().slice(0, 10)} · demandeur=${ownerStatus ?? 'aucun'} · mouvements pending=${pendingMoves} ignored=${ignoredMoves} applied=${n(
        clan.appliedMoves
      )} · membres actifs=${n(clan.activeMembers)}/${n(clan.allMembers)}${
        clan.archivedAt ? ` · archivé (${String(clan.archivedReason)})` : ''
      } → ${verdict}`
    )
  }

  console.log(
    `\nBilan : ${verdicts.attente} en attente, ${verdicts.refusé} refusé(s) encore listé(s) en attente, ` +
      `${verdicts.indéterminé} indéterminé(s), ${verdicts.archivé} déjà archivé(s).`
  )

  if (archiveColumn) {
    // Mêmes clauses que les routes (pending-clans, archived-clans, tableau de bord du cycle de vie).
    const [pending, archived] = await Promise.all([
      prisma.clan.count({ where: PENDING_CLAN_WHERE }),
      prisma.clan.count({ where: ARCHIVED_CLAN_WHERE }),
    ])
    console.log(`Clauses de l'application : « Clans en attente » = ${pending} · « Clans archivés » = ${archived}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
