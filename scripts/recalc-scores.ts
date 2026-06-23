/**
 * Recalcule les scores de télémétrie (aggressionScore, supportScore, zoneDisciplineScore)
 * pour tous les clans ou un clan spécifique, à partir des données raw déjà en base.
 *
 * Usage :
 *   tsx scripts/recalc-scores.ts              # tous les clans
 *   tsx scripts/recalc-scores.ts --clan 1     # clan id=1 uniquement
 *   tsx scripts/recalc-scores.ts --dry-run    # affiche les clans sans écrire
 */
import 'dotenv/config'

import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'
import { prisma } from '@/lib/prisma'

function parseArgs() {
  const args = process.argv.slice(2)
  let clanId: number | null = null
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--clan' && args[i + 1]) {
      const parsed = Number(args[i + 1])
      if (!Number.isInteger(parsed) || parsed <= 0) {
        console.error(`--clan doit être un entier positif, reçu : "${args[i + 1]}"`)
        process.exit(1)
      }
      clanId = parsed
      i++
    } else if (args[i] === '--dry-run') {
      dryRun = true
    }
  }

  return { clanId, dryRun }
}

async function main() {
  const { clanId, dryRun } = parseArgs()

  const clans = await prisma.clan.findMany({
    where: clanId ? { id: clanId } : undefined,
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })

  if (clans.length === 0) {
    console.warn(clanId ? `Clan id=${clanId} introuvable.` : 'Aucun clan en base.')
    return
  }

  console.log(`Recalcul des scores pour ${clans.length} clan(s)${dryRun ? ' [DRY-RUN — aucune écriture]' : ''} :`)
  for (const clan of clans) {
    console.log(`  • #${clan.id} ${clan.name}`)
  }
  console.log()

  if (dryRun) {
    console.log('Mode dry-run : arrêt avant écriture.')
    return
  }

  const startedAt = Date.now()
  let totalMemberRows = 0
  let totalWeaponRows = 0

  for (const clan of clans) {
    const clanStart = Date.now()
    process.stdout.write(`[${clan.id}] ${clan.name} … `)

    try {
      const result = await recalculateTelemetryPeriodAggregatesForClan(clan.id)

      const memberRows = result.summaries.reduce((s, r) => s + r.memberTelemetryRows, 0)
      const weaponRows = result.summaries.reduce((s, r) => s + r.memberWeaponRows, 0)
      totalMemberRows += memberRows
      totalWeaponRows += weaponRows

      const periods = result.summaries.map((s) => `${s.periodKey}(${s.memberTelemetryRows})`).join(', ')
      console.log(`OK — ${memberRows} lignes stats, ${weaponRows} armes — ${Date.now() - clanStart}ms`)
      console.log(`       périodes : ${periods}`)
    } catch (err) {
      console.log(`ERREUR`)
      console.error(`  ↳`, err instanceof Error ? err.message : err)
    }
  }

  const durationS = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log()
  console.log(`Terminé en ${durationS}s — ${totalMemberRows} lignes MemberTelemetryStats, ${totalWeaponRows} lignes MemberWeaponStats mises à jour.`)
}

void main()
  .catch((err) => {
    console.error('Fatal :', err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
