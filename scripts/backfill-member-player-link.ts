/**
 * Rattache à leur ligne `Player` les fiches `ClanMember` qui n'en ont pas (`playerId` nul).
 *
 * Contexte : jusqu'au 2026-10-20, seule la route « Suivre » (`settings/opponents/track`) posait `ClanMember.playerId`.
 * `/join`, la première installation, l'ajout d'un membre et les validations le font désormais
 * (`src/lib/member-player-link.ts`) ; ce script rattrape les fiches déjà en base — dont les membres actifs absents de
 * l'annuaire faute de ligne `Player` (docs/TODO/players.md §3.C).
 *
 * Il crée au besoin la ligne `Player` (pseudo, compte, shard), sans jamais toucher au clan PUBG du joueur
 * (`opponentClanId`, `clanResolvedAt`, `EncounteredPlayer`) : la résolution des joueurs croisés s'en charge.
 *
 * ⚠️ DATABASE_URL vise la base de PRODUCTION. Le défaut est une simulation (lecture seule).
 *
 * Usage :
 *   npx tsx scripts/backfill-member-player-link.ts            # simulation : comptes et exemples
 *   npx tsx scripts/backfill-member-player-link.ts --apply    # écrit, fiche par fiche
 */
import { prisma } from '../src/lib/prisma'
import { linkMemberToPlayer } from '../src/lib/member-player-link'

const apply = process.argv.slice(2).includes('--apply')

type Candidate = {
  id: number
  displayName: string
  joinStatus: string
  isActive: number | boolean
  clanTag: string | null
  existingPlayerId: string | null
}

async function main() {
  const candidates = await prisma.$queryRawUnsafe<Candidate[]>(`
    SELECT cm.id, cm.displayName, cm.joinStatus, cm.isActive, c.tag AS clanTag, p.id AS existingPlayerId
    FROM ClanMember cm
    LEFT JOIN Clan c ON c.id = cm.clanId
    LEFT JOIN Player p ON p.pubgAccountId = cm.pubgAccountId AND p.platformShard = cm.platformShard
    WHERE cm.playerId IS NULL AND cm.pubgAccountId IS NOT NULL
    ORDER BY cm.isActive DESC, cm.id
  `)

  const toLink = candidates.filter((row) => row.existingPlayerId)
  const toCreate = candidates.filter((row) => !row.existingPlayerId)
  const active = candidates.filter((row) => Boolean(row.isActive) && row.joinStatus === 'active')

  console.log(`Fiches sans playerId (compte PUBG connu) : ${candidates.length}`)
  console.log(`  dont membres actifs                      : ${active.length}`)
  console.log(`  ligne Player existante, lien seul         : ${toLink.length}`)
  console.log(`  ligne Player à créer                      : ${toCreate.length}`)
  for (const row of toCreate.slice(0, 20)) {
    console.log(`    - #${row.id} ${row.displayName} [${row.clanTag ?? '—'}] ${row.joinStatus}${row.isActive ? '' : ' (inactif)'}`)
  }

  if (!apply) {
    console.log('\nSimulation : rien n’a été écrit. Relancer avec --apply pour poser les liens.')
    return
  }

  let linked = 0
  let skipped = 0
  for (const row of candidates) {
    const playerId = await linkMemberToPlayer(row.id)
    if (playerId) linked += 1
    else skipped += 1
  }
  console.log(`\nÉcrit : ${linked} fiche(s) rattachée(s), ${skipped} ignorée(s).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
