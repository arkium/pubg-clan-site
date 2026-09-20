/**
 * Chantier 0 — Marque les clans techniques existants avec `Clan.isSystem = true`.
 *
 * Un clan technique est le parking des joueurs sans clan : historiquement cree par
 * `getOrCreateUngroupedClan` sous le nom "Ungrouped" / tag "UNG", sans `pubgClanId`.
 * Depuis le chantier 0, l'identite passe par `isSystem` et non plus par le nom.
 *
 * Mesure du 2026-09-20 : aucun clan de ce type n'existe en base de production, le
 * script est donc un no-op attendu. Il reste necessaire pour les autres
 * environnements et pour toute base plus ancienne.
 *
 * Peut aussi CREER le clan technique d'un shard qui n'en a pas encore
 * (`--create <shard>`) : sans lui, le bouton « Sortir du clan » du chantier 3 ne
 * s'affiche jamais, puisque PATCH /api/members/[id] exige que la cible existe deja.
 *
 * Mode SEC par defaut : liste ce qui serait fait sans rien ecrire.
 * Ajouter `--apply` pour appliquer reellement.
 *
 * Usage :
 *   npx tsx scripts/mark-system-clans.ts                        # simulation
 *   npx tsx scripts/mark-system-clans.ts --apply                # marquage
 *   npx tsx scripts/mark-system-clans.ts --create steam --apply # creation
 */

import { prisma } from '@/lib/prisma'
import { UNGROUPED_CLAN_NAME, UNGROUPED_CLAN_TAG } from '@/lib/system-clan'

const APPLY = process.argv.includes('--apply')

function parseCreateShard() {
  const index = process.argv.indexOf('--create')
  if (index === -1) return null
  const shard = process.argv[index + 1]
  if (!shard || shard.startsWith('--')) {
    throw new Error('--create attend un shard, par exemple : --create steam')
  }
  return shard
}

const CREATE_SHARD = parseCreateShard()

async function main() {
  console.log('='.repeat(84))
  console.log(`MARQUAGE DES CLANS TECHNIQUES — mode ${APPLY ? 'APPLICATION' : 'SIMULATION (--apply pour ecrire)'}`)
  console.log('='.repeat(84))

  // Candidats : pas encore marques, sans contrepartie PUBG, et portant les marqueurs
  // historiques du parking. La condition `pubgClanId: null` est essentielle : un vrai
  // clan PUBG qui s'appellerait "Ungrouped" ne doit surtout pas etre marque.
  const candidates = await prisma.clan.findMany({
    where: {
      isSystem: false,
      pubgClanId: null,
      OR: [{ name: 'Ungrouped' }, { tag: 'UNG' }],
    },
    select: {
      id: true,
      name: true,
      tag: true,
      platformShard: true,
      isActive: true,
      _count: { select: { members: true } },
    },
    orderBy: { id: 'asc' },
  })

  const alreadyMarked = await prisma.clan.findMany({
    where: { isSystem: true },
    select: { id: true, name: true, tag: true, platformShard: true },
    orderBy: { id: 'asc' },
  })

  console.log(`\nDeja marques isSystem : ${alreadyMarked.length}`)
  for (const clan of alreadyMarked) {
    console.log(`  #${clan.id}  [${clan.tag}] ${clan.name} (${clan.platformShard})`)
  }

  console.log(`\nCandidats au marquage : ${candidates.length}`)
  if (candidates.length === 0) {
    console.log('  Aucun — rien a faire.')
  }
  for (const clan of candidates) {
    console.log(
      `  #${clan.id}  [${clan.tag}] ${clan.name} (${clan.platformShard}) — ` +
        `${clan._count.members} membre(s), ${clan.isActive ? 'actif' : 'inactif'}`
    )
  }

  // Garde-fou : plusieurs clans techniques sur un meme shard casserait
  // getOrCreateUngroupedClan, qui en attend exactement un.
  const perShard = new Map<string, number>()
  for (const clan of [...alreadyMarked, ...candidates]) {
    perShard.set(clan.platformShard, (perShard.get(clan.platformShard) ?? 0) + 1)
  }
  const duplicated = [...perShard.entries()].filter(([, count]) => count > 1)
  if (duplicated.length > 0) {
    console.log('\n⚠️  Plusieurs clans techniques sur un meme shard — a resoudre a la main :')
    for (const [shard, count] of duplicated) {
      console.log(`     ${shard} : ${count}`)
    }
    console.log('     Marquage interrompu pour ne pas aggraver la situation.')
    return
  }

  if (candidates.length > 0 && APPLY) {
    const result = await prisma.clan.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { isSystem: true },
    })
    console.log(`\n✅ ${result.count} clan(s) marque(s) isSystem = true.`)
  } else if (candidates.length > 0) {
    console.log('\nSimulation : relancer avec --apply pour ecrire.')
  }

  if (!CREATE_SHARD) {
    return
  }

  console.log(`\n--- Creation du clan technique pour le shard « ${CREATE_SHARD} » ---`)

  const existingForShard = await prisma.clan.findFirst({
    where: { platformShard: CREATE_SHARD, isSystem: true },
    select: { id: true, name: true, tag: true },
  })

  if (existingForShard) {
    console.log(
      `  Deja present : #${existingForShard.id} [${existingForShard.tag}] ${existingForShard.name} — rien a faire.`
    )
    return
  }

  // Collision possible sur @@unique([name, platformShard]) : un vrai clan PUBG
  // pourrait deja porter ce nom sur ce shard.
  const nameCollision = await prisma.clan.findFirst({
    where: { platformShard: CREATE_SHARD, name: UNGROUPED_CLAN_NAME },
    select: { id: true, pubgClanId: true },
  })

  if (nameCollision) {
    console.log(
      `  [!] Un clan nomme « ${UNGROUPED_CLAN_NAME} » existe deja sur ce shard (#${nameCollision.id}, ` +
        `pubgClanId=${nameCollision.pubgClanId ?? 'null'}). Creation annulee — a resoudre a la main.`
    )
    return
  }

  if (!APPLY) {
    console.log(
      `  Simulation : creerait [${UNGROUPED_CLAN_TAG}] ${UNGROUPED_CLAN_NAME} ` +
        `(shard ${CREATE_SHARD}, isSystem=true, isActive=true).`
    )
    console.log('  Relancer avec --apply pour ecrire.')
    return
  }

  const created = await prisma.clan.create({
    data: {
      name: UNGROUPED_CLAN_NAME,
      tag: UNGROUPED_CLAN_TAG,
      platformShard: CREATE_SHARD,
      isSystem: true,
    },
    select: { id: true, name: true, tag: true, platformShard: true, isSystem: true, isActive: true },
  })

  console.log(`\n[OK] Clan technique cree : #${created.id} [${created.tag}] ${created.name}`)
  console.log(`     shard=${created.platformShard} isSystem=${created.isSystem} isActive=${created.isActive}`)
  console.log('     Le bouton « Sortir du clan » devient disponible pour les membres de ce shard.')
}

main()
  .catch((error) => {
    console.error('Interrompu :', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
