/**
 * Configure les reglages du cycle de vie de clan (chantier 5 — onglet « Parametres »
 * en attendant que la page existe).
 *
 * Usage :
 *   npx tsx scripts/set-clan-lifecycle-config.ts --show
 *   npx tsx scripts/set-clan-lifecycle-config.ts --webhook "<url>" [--test]
 *   npx tsx scripts/set-clan-lifecycle-config.ts --webhook ""          # coupe les notifications
 *   npx tsx scripts/set-clan-lifecycle-config.ts --mode observe|apply
 *   npx tsx scripts/set-clan-lifecycle-config.ts --confirmations 3
 *   npx tsx scripts/set-clan-lifecycle-config.ts --max-ratio 10
 *
 * `--test` envoie un message de controle dans le salon : c'est une ecriture
 * **visible par des tiers**, a n'utiliser que volontairement.
 */

import {
  getClanLifecycleSettings,
  resetClanLifecycleConfigCache,
  setClanLifecycleDiscordWebhookUrl,
  setClanLifecycleMode,
  setConfirmationsRequired,
  setMaxMovesRatioPercent,
} from '@/lib/clan-lifecycle/config'
import { sendDiscordWebhook } from '@/lib/discord/discord-client'
import { prisma } from '@/lib/prisma'

function argValue(flag: string) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

/** Ne jamais recracher un secret en clair dans un journal. */
function maskWebhook(url: string | null) {
  if (!url) return 'non configure'
  const parts = url.split('/')
  const id = parts[parts.length - 2] ?? '?'
  return `https://discord.com/api/webhooks/${id}/****`
}

async function printSettings(title: string) {
  resetClanLifecycleConfigCache()
  const s = await getClanLifecycleSettings()
  console.log(`\n${title}`)
  console.log(`  mode                    : ${s.mode}`)
  console.log(`  confirmations exigees   : ${s.confirmationsRequired}`)
  console.log(`  coupe-circuit           : ${s.maxMovesRatioPercent} %`)
  console.log(`  archivage UNG apres     : ${s.archiveAfterDays} jours`)
  console.log(`  archivage automatique   : ${s.autoArchive}`)
  console.log(`  promotion automatique   : ${s.autoPromote}`)
  console.log(`  webhook Discord         : ${maskWebhook(s.webhookUrl)}`)
  return s
}

async function main() {
  console.log('='.repeat(76))
  console.log('CONFIGURATION — Cycle de vie des clans')
  console.log('='.repeat(76))

  await printSettings('Avant :')

  const webhook = argValue('--webhook')
  if (webhook !== undefined) {
    const saved = await setClanLifecycleDiscordWebhookUrl(webhook)
    console.log(`\n  -> webhook ${saved ? 'enregistre' : 'efface'}`)
  }

  const mode = argValue('--mode')
  if (mode !== undefined) {
    if (mode !== 'observe' && mode !== 'apply') {
      throw new Error("--mode attend 'observe' ou 'apply'")
    }
    await setClanLifecycleMode(mode)
    console.log(`\n  -> mode = ${mode}`)
    if (mode === 'apply') {
      console.log('     ATTENTION : les mouvements seront desormais appliques.')
    }
  }

  const confirmations = argValue('--confirmations')
  if (confirmations !== undefined) {
    const value = await setConfirmationsRequired(Number(confirmations))
    console.log(`\n  -> confirmations exigees = ${value}`)
  }

  const maxRatio = argValue('--max-ratio')
  if (maxRatio !== undefined) {
    const value = await setMaxMovesRatioPercent(Number(maxRatio))
    console.log(`\n  -> coupe-circuit = ${value} %`)
  }

  const after = await printSettings('Apres :')

  if (process.argv.includes('--test')) {
    if (!after.webhookUrl) {
      console.log("\n  Test impossible : aucun webhook configure.")
      return
    }

    console.log('\n  Envoi d\'un message de controle dans le salon...')
    const result = await sendDiscordWebhook(after.webhookUrl, {
      username: 'Cycle de vie des clans',
      embeds: [
        {
          title: '✅ Webhook configuré',
          description:
            "Ce salon recevra désormais les mouvements de clan détectés automatiquement " +
            '(bascules vers le clan technique, transferts entre clans suivis, coupe-circuit).\n\n' +
            "Message de contrôle — aucun mouvement n'a eu lieu.",
          color: 0x22c55e,
          timestamp: new Date().toISOString(),
          footer: { text: 'Configuration initiale' },
        },
      ],
    })

    console.log(
      result.ok
        ? `  -> envoye (HTTP ${result.status})`
        : `  -> ECHEC (HTTP ${result.status ?? '?'}) : ${result.error}`
    )
  }
}

main()
  .catch((error) => {
    console.error('\nInterrompu :', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
