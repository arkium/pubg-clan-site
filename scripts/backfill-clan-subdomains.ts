/**
 * Attribue un sous-domaine aux clans actifs qui n'en ont pas — docs/TODO/chickendinnerfr.md §4.B.
 *
 * Simulation par défaut : affiche les attributions sans rien écrire. Idempotent : un clan qui a déjà un
 * sous-domaine le garde. Relançable à tout moment (rattrapage d'une attribution manquée à l'activation).
 *
 * Usage :
 *   npx tsx scripts/backfill-clan-subdomains.ts            # simulation
 *   npx tsx scripts/backfill-clan-subdomains.ts --apply    # écriture
 */
import 'dotenv/config'

import { pickClanSubdomain } from '../src/lib/clan-subdomain'
import { prisma } from '../src/lib/prisma'

async function main() {
  const apply = process.argv.includes('--apply')

  const clans = await prisma.clan.findMany({
    select: { id: true, name: true, tag: true, isActive: true, isSystem: true, subdomain: true },
    orderBy: { id: 'asc' },
  })

  const taken = new Set(clans.map((clan) => clan.subdomain).filter((value): value is string => Boolean(value)))
  const activeTagCounts = new Map<string, number>()
  for (const clan of clans) {
    if (!clan.isActive || clan.isSystem) continue
    const tag = clan.tag.trim().toLowerCase()
    activeTagCounts.set(tag, (activeTagCounts.get(tag) ?? 0) + 1)
  }

  const pending = clans.filter((clan) => clan.isActive && !clan.isSystem && !clan.subdomain)
  const plan = pending.map((clan) => {
    const subdomain = pickClanSubdomain({
      clanId: clan.id,
      tag: clan.tag,
      name: clan.name,
      tagShared: (activeTagCounts.get(clan.tag.trim().toLowerCase()) ?? 0) > 1,
      taken,
    })
    taken.add(subdomain)
    return { id: clan.id, tag: clan.tag, name: clan.name, subdomain }
  })

  console.log(`${clans.filter((clan) => clan.subdomain).length} clan(s) ont déjà un sous-domaine.`)
  console.log(`${plan.length} attribution(s) ${apply ? 'à écrire' : 'prévue(s) (simulation)'} :`)
  console.table(plan)

  if (!apply) {
    console.log('Simulation : rien n’a été écrit. Relancer avec --apply pour écrire.')
    return
  }

  let written = 0
  for (const entry of plan) {
    const { count } = await prisma.clan.updateMany({
      where: { id: entry.id, subdomain: null },
      data: { subdomain: entry.subdomain },
    })
    written += count
  }
  console.log(`${written} sous-domaine(s) écrit(s).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
