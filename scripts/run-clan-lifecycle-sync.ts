/**
 * Lance un passage de synchronisation d'appartenance (chantier 1 du cycle de vie
 * de clan) hors du cron, pour la mise en service et le diagnostic.
 *
 * Le mode vient d'`AppConfig.clan_lifecycle_mode` et vaut `observe` par defaut :
 * les ecarts sont journalises, **aucun membre n'est deplace**. Passer en `apply`
 * est une decision explicite, a prendre depuis l'onglet « Parametres » une fois le
 * rattrapage initial relu a la main.
 *
 * Usage : npx tsx scripts/run-clan-lifecycle-sync.ts [--max N]
 */

import { getClanLifecycleSettings } from '@/lib/clan-lifecycle/config'
import { runMembershipSyncPass } from '@/lib/clan-lifecycle/membership-sync'
import { prisma } from '@/lib/prisma'

function parseMax() {
  const index = process.argv.indexOf('--max')
  if (index === -1) return undefined
  const value = Number(process.argv[index + 1])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
}

async function main() {
  const settings = await getClanLifecycleSettings()

  console.log('='.repeat(84))
  console.log('PASSAGE — Cycle de vie des clans |', new Date().toISOString())
  console.log('='.repeat(84))
  console.log(`  mode                      : ${settings.mode}${settings.mode === 'observe' ? '  (aucun mouvement ne sera applique)' : '  (LES MOUVEMENTS SERONT APPLIQUES)'}`)
  console.log(`  confirmations exigees     : ${settings.confirmationsRequired}`)
  console.log(`  coupe-circuit             : ${settings.maxMovesRatioPercent} % de l'effectif`)
  console.log(`  webhook Discord           : ${settings.webhookUrl ? 'configure' : 'non configure'}`)

  const summary = await runMembershipSyncPass({ source: 'manual', maxMembers: parseMax() })

  console.log('\n' + '-'.repeat(84))
  console.log('RESULTAT')
  console.log('-'.repeat(84))
  console.log(`  statut                    : ${summary.status}`)
  console.log(`  membres examines          : ${summary.membersScanned}`)
  console.log(`  appels PUBG               : ${summary.apiCalls}`)
  console.log(`  etats  has_clan/no_clan/? : ${summary.statesHasClan} / ${summary.statesNoClan} / ${summary.statesUnknown}`)
  console.log(`  ecarts detectes           : ${summary.discrepanciesFound}`)
  console.log(`  en attente de confirmation: ${summary.awaitingConfirmation}`)
  console.log(`  mouvements prevus         : ${summary.movementsPlanned}`)
  console.log(`  mouvements appliques      : ${summary.movementsApplied}`)
  console.log(`  coupe-circuit             : ${summary.circuitBreakerTripped ? 'DECLENCHE' : 'non'} (${summary.movesRatioPercent} %)`)
  if (summary.message) console.log(`  message                   : ${summary.message}`)

  if (summary.movements.length > 0) {
    console.log('\n  Mouvements retenus :')
    for (const m of summary.movements) {
      console.log(
        `    ${m.memberName.padEnd(20)} [${m.previousClanTag ?? '—'}] -> [${m.targetClanTag ?? '—'}]  (${m.source})`
      )
    }
  }

  console.log(`\n  Run : ${summary.runId}`)
}

main()
  .catch((error) => {
    console.error('Interrompu :', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
