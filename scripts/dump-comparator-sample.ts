/**
 * Extrait, en LECTURE SEULE, une réponse réelle du comparateur de clans (`GET /api/clans/comparator`) pour trois tags,
 * dans un fichier JSON : sert de données aux captures de contrôle visuel de /clans/comparator.
 *
 *   npx tsx scripts/dump-comparator-sample.ts <fichier.json> [période] [TAG1,TAG2,TAG3]
 */
import 'dotenv/config'

import { writeFileSync } from 'node:fs'

import { getClanComparatorStats } from '@/lib/clan-comparator-service'
import { buildClanPairs, getHeadToHeadStats } from '@/lib/head-to-head-service'
import { prisma } from '@/lib/prisma'
import type { SquadPeriod } from '@/types/squad-matches'

async function main() {
  const output = process.argv[2]
  if (!output) throw new Error('fichier de sortie requis')
  const period = (process.argv[3] ?? 'week') as SquadPeriod
  const tags = (process.argv[4] ?? 'RATZ,ATR,47R').split(',')
  const clans = await prisma.clan.findMany({ where: { tag: { in: tags }, isActive: true }, select: { id: true, name: true, tag: true } })
  const clanIds = tags.map((tag) => clans.find((clan) => clan.tag === tag)?.id).filter((id): id is number => typeof id === 'number')
  const [stats, headToHead] = await Promise.all([
    getClanComparatorStats(clanIds, period),
    Promise.all(buildClanPairs(clanIds).map(([a, b]) => getHeadToHeadStats(a, b))),
  ])
  writeFileSync(output, JSON.stringify({ clanIds, clans, response: { period, clans: stats, headToHead } }))
  console.log(`clans ${clanIds.join(',')} → ${output}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
