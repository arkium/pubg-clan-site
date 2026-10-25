import 'dotenv/config'

import { purgeCoachHistoryForPubgName } from '../src/lib/coach/coach-retention'
import { prisma } from '../src/lib/prisma'

/**
 * Demande « Purger mon historique » (docs/features/pages-legales.md §3) — part Coach IA : fils, messages et lignes
 * d'usage des comptes liés à un pseudo PUBG. ÉCRIT dans la base de DATABASE_URL avec `--apply` ; sans lui, simulation.
 *
 *   npx tsx scripts/purge-coach-history.ts --pubg-name Arkium_FR            # simulation
 *   npx tsx scripts/purge-coach-history.ts --pubg-name Arkium_FR --apply    # suppression
 *
 * Vérifier d'abord que le compte appartient au demandeur (capture de son profil en jeu), puis clore la demande dans
 * Plateforme › Demandes de confidentialité.
 */

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? (process.argv[index + 1] ?? null) : null
}

async function main() {
  const pubgName = argValue('--pubg-name')
  const apply = process.argv.includes('--apply')
  if (!pubgName) {
    console.error('Usage : npx tsx scripts/purge-coach-history.ts --pubg-name <pseudo PUBG> [--apply]')
    process.exit(1)
  }

  const result = await purgeCoachHistoryForPubgName(pubgName, { apply })
  const mode = apply ? 'Supprimés' : 'À supprimer (simulation, rien n’est écrit)'
  console.log(`Pseudo : ${pubgName}`)
  console.log(`Fiches de membre : ${result.memberIds.length > 0 ? result.memberIds.join(', ') : 'aucune'}`)
  console.log(`Comptes liés : ${result.userIds.length > 0 ? result.userIds.join(', ') : 'aucun'}`)
  console.log(`${mode} : ${result.conversations} fil(s) avec leurs messages, ${result.usages} ligne(s) d’usage, ${result.memories} ligne(s) de mémoire personnelle`)
  if (!apply && (result.conversations > 0 || result.usages > 0 || result.memories > 0)) console.log('Relancer avec --apply pour supprimer.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
