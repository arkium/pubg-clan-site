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
 * Mode SEC par defaut : liste ce qui serait fait sans rien ecrire.
 * Ajouter `--apply` pour appliquer reellement.
 *
 * Usage :
 *   npx tsx scripts/mark-system-clans.ts            # simulation
 *   npx tsx scripts/mark-system-clans.ts --apply    # application
 */

import { prisma } from '@/lib/prisma'

const APPLY = process.argv.includes('--apply')

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
}

main()
  .catch((error) => {
    console.error('Interrompu :', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
