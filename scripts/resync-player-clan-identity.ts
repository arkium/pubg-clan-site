/**
 * Réaligne le miroir « adversaire » sur le clan suivi.
 *
 * Contexte : `ClanMember.clanId` (clan suivi), `Player.opponentClanId` (identité
 * globale) et `EncounteredPlayer.pubgClan*` (copie par clan observateur) décrivent
 * le même fait. Jusqu'au correctif du 2026-09-22, seul le premier était mis à jour
 * lors d'un changement de clan — voir `src/lib/player-clan-identity.ts` et
 * `docs/features/cycle-de-vie-clan.md` §11.
 *
 * Le code corrigé empêche de nouveaux décalages ; ce script répare ceux déjà en base.
 *
 * ⚠️ DATABASE_URL vise la base de PRODUCTION. Le défaut est une simulation.
 *
 * Usage :
 *   npx tsx scripts/resync-player-clan-identity.ts                  # simulation
 *   npx tsx scripts/resync-player-clan-identity.ts --apply          # écrit
 *   npx tsx scripts/resync-player-clan-identity.ts --only=conflict  # contradictions seules
 *   npx tsx scripts/resync-player-clan-identity.ts --player=WESTEN88
 *
 * Trois classes de décalage, d'urgence décroissante :
 *   conflict — le miroir nomme un clan, le clan suivi en nomme un autre. Le miroir
 *              énonce un fait faux : c'est le cas WESTEN88.
 *   cleared  — le miroir nomme un clan, le membre est garé dans le parking. Le
 *              cycle de vie a mesuré « plus de clan PUBG » : le miroir doit suivre.
 *   filled   — le miroir est vide, le clan suivi nomme un clan. Rien de faux, juste
 *              une résolution jamais faite ; la remplir complète `/settings/opponents`.
 */
import { prisma } from '../src/lib/prisma'
import { syncOpponentIdentityForMember } from '../src/lib/player-clan-identity'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const playerFilter = args.find((a) => a.startsWith('--player='))?.split('=')[1] ?? null
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1] ?? 'all'

type DriftRow = {
  memberId: number
  displayName: string
  pubgAccountId: string
  platformShard: string
  trackedClanTag: string | null
  trackedClanName: string | null
  trackedPubgClanId: string | null
  mirrorTag: string | null
  mirrorPubgClanId: string | null
}

type DriftKind = 'conflict' | 'cleared' | 'filled'

function classify(row: DriftRow): DriftKind {
  if (!row.mirrorPubgClanId) return 'filled'
  if (!row.trackedPubgClanId) return 'cleared'
  return 'conflict'
}

async function main() {
  // Un décalage = membre actif d'un clan suivi dont le miroir pointe ailleurs.
  // `NULL` des deux côtés n'en est pas un : le joueur n'a simplement pas de clan
  // PUBG connu et la résolution des joueurs croisés s'en chargera.
  const rows = await prisma.$queryRawUnsafe<DriftRow[]>(
    `
    SELECT cm.id AS memberId, cm.displayName, cm.pubgAccountId, cm.platformShard,
           c.tag AS trackedClanTag, c.name AS trackedClanName, c.pubgClanId AS trackedPubgClanId,
           oc.tag AS mirrorTag, oc.pubgClanId AS mirrorPubgClanId
    FROM ClanMember cm
    INNER JOIN Player p
            ON p.pubgAccountId = cm.pubgAccountId
           AND p.platformShard = cm.platformShard
    LEFT JOIN Clan c ON c.id = cm.clanId
    LEFT JOIN OpponentClan oc ON oc.id = p.opponentClanId
    WHERE cm.isActive = 1
      AND cm.joinStatus = 'active'
      AND cm.pubgAccountId IS NOT NULL
      AND NOT (p.opponentClanId IS NULL AND c.pubgClanId IS NULL)
      AND (p.opponentClanId IS NULL OR c.pubgClanId IS NULL OR oc.pubgClanId <> c.pubgClanId)
      ${playerFilter ? 'AND cm.displayName = ?' : ''}
    ORDER BY cm.displayName
  `,
    ...(playerFilter ? [playerFilter] : [])
  )

  const selected = rows.filter((row) => only === 'all' || classify(row) === only)

  if (selected.length === 0) {
    console.log('Aucun décalage : le miroir adversaire est aligné sur les clans suivis.')
    return
  }

  const counts: Record<DriftKind, number> = { conflict: 0, cleared: 0, filled: 0 }
  for (const row of selected) counts[classify(row)] += 1

  console.log(
    `${selected.length} membre(s) à réaligner${apply ? '' : ' (simulation)'} — ` +
      `${counts.conflict} conflict, ${counts.cleared} cleared, ${counts.filled} filled :`
  )
  console.log('')

  for (const row of selected) {
    const from = row.mirrorTag ? `[${row.mirrorTag}]` : 'aucun clan'
    const to = row.trackedPubgClanId ? `[${row.trackedClanTag}]` : 'aucun clan (parking)'
    console.log(`  ${classify(row).padEnd(9)} ${row.displayName.padEnd(20)} ${from.padEnd(14)} -> ${to}`)

    if (!apply) continue

    const result = await syncOpponentIdentityForMember({
      pubgAccountId: row.pubgAccountId,
      platformShard: row.platformShard,
      pubgPlayerName: row.displayName,
      clan: {
        pubgClanId: row.trackedPubgClanId,
        tag: row.trackedClanTag,
        name: row.trackedClanName,
      },
    })
    console.log(`            ${result?.encounteredRowsUpdated ?? 0} ligne(s) EncounteredPlayer réalignée(s)`)
  }

  if (!apply) {
    console.log('')
    console.log('Simulation uniquement. Relancer avec --apply pour écrire.')
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
