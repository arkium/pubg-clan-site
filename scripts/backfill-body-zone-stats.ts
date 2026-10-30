/**
 * Zones d'impact — rattrapage des périodes passées (docs/TODO/zones-d-impact.md, lot 1).
 *
 * Le recalcul des agrégats ne vise que la semaine, le mois et « tous » courants (plus la semaine et le mois précédents
 * en début de période) : les semaines passées n'ont pas de lignes `MemberBodyZoneStats`. Ce script relance
 * `recalculateTelemetryPeriodForClan` sur les semaines et les mois demandés, un clan à la fois.
 *
 * SIMULATION par défaut : liste les clans et les périodes, et compte les parties de chaque période, sans rien écrire.
 * `--apply` écrit. Effet de bord à noter dans le journal : les lignes de ces périodes dans `MemberTelemetryStats`,
 * `MemberWeaponStats` et les synergies sont réécrites avec les parties arrivées après coup (attendu).
 *
 * Le rattrapage d'agrégats en masse a déjà planté au hasard (code natif) : reprendre par `--from-clan <id>`.
 *
 * Usage, depuis la racine du projet :
 *   npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/backfill-body-zone-stats.ts \
 *     --clan 25 --from-week 2026-36 --to-week 2026-43 --months 2026-09 [--apply]
 *   … --all-clans [--from-clan 102] …
 */
import { prisma } from '@/lib/prisma'
import { recalculateTelemetryPeriodForClan } from '@/lib/pubg-telemetry/period-aggregates'
import { getPeriodBounds, getPeriodKey, type StatsPeriod } from '@/lib/pubg-telemetry/period-keys'

const argv = process.argv.slice(2)
const flag = (name: string) => argv.includes(name)
const option = (name: string) => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

const APPLY = flag('--apply')
const CLAN_ID = option('--clan') ? Number(option('--clan')) : null
const FROM_CLAN = option('--from-clan') ? Number(option('--from-clan')) : null

/** Jeudi (local) de la semaine ISO `YYYY-WW` : une date sûrement dans la semaine. */
function isoWeekThursday(value: string): Date {
  const match = /^(\d{4})-(\d{1,2})$/.exec(value)
  if (!match) throw new Error(`Semaine attendue au format YYYY-WW : ${value}`)
  const [year, week] = [Number(match[1]), Number(match[2])]
  const january4 = new Date(year, 0, 4, 12)
  const monday = new Date(january4)
  monday.setDate(january4.getDate() - ((january4.getDay() + 6) % 7) + (week - 1) * 7)
  monday.setDate(monday.getDate() + 3)
  return monday
}

function weekReferences(from: string | undefined, to: string | undefined): Date[] {
  if (!from && !to) return []
  if (!from || !to) throw new Error('--from-week et --to-week vont ensemble')
  const dates: Date[] = []
  for (let date = isoWeekThursday(from); date <= isoWeekThursday(to); date = new Date(date.getTime() + 7 * 86_400_000)) {
    dates.push(date)
  }
  return dates
}

function monthReferences(value: string | undefined): Date[] {
  if (!value) return []
  return value.split(',').map((entry) => {
    const match = /^(\d{4})-(\d{2})$/.exec(entry.trim())
    if (!match) throw new Error(`Mois attendu au format YYYY-MM : ${entry}`)
    return new Date(Number(match[1]), Number(match[2]) - 1, 15, 12)
  })
}

async function main() {
  if (!CLAN_ID && !flag('--all-clans')) throw new Error('--clan <id> ou --all-clans')
  const periods: Array<{ period: StatsPeriod; referenceDate: Date }> = [
    ...weekReferences(option('--from-week'), option('--to-week')).map((referenceDate) => ({ period: 'week' as const, referenceDate })),
    ...monthReferences(option('--months')).map((referenceDate) => ({ period: 'month' as const, referenceDate })),
  ]
  if (periods.length === 0) throw new Error('aucune période : --from-week/--to-week et/ou --months')

  const clans = await prisma.clan.findMany({
    where: CLAN_ID ? { id: CLAN_ID } : { isActive: true, ...(FROM_CLAN ? { id: { gte: FROM_CLAN } } : {}) },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })

  console.log(
    `Zones d'impact — rattrapage ${APPLY ? 'ÉCRITURE (--apply)' : 'SIMULATION, rien n’est écrit'} : ${clans.length} clan(s), ` +
      `périodes ${periods.map((entry) => getPeriodKey(entry.period, entry.referenceDate)).join(', ')}`
  )

  for (const clan of clans) {
    for (const entry of periods) {
      const periodKey = getPeriodKey(entry.period, entry.referenceDate)
      if (!APPLY) {
        const { startDate, endDate } = getPeriodBounds(entry.period, entry.referenceDate)
        const matches = await prisma.squadMatch.count({
          where: { createdAt: { gte: startDate, lte: endDate }, members: { some: { member: { clanId: clan.id } } } },
        })
        console.log(`  clan ${clan.id} (${clan.name}) ${periodKey} : ${matches} partie(s) à relire`)
        continue
      }
      const startedAt = Date.now()
      const summary = await recalculateTelemetryPeriodForClan(clan.id, entry.period, entry.referenceDate)
      console.log(
        `  clan ${clan.id} (${clan.name}) ${periodKey} : ${summary.memberBodyZoneRows} ligne(s) de zones, ` +
          `${summary.memberTelemetryRows} membre(s), ${summary.memberWeaponRows} arme(s), ${summary.clanSynergyRows} synergie(s) — ` +
          `${Math.round((Date.now() - startedAt) / 1000)} s`
      )
    }
  }

  if (!APPLY) console.log('\nSimulation terminée : relancer avec --apply pour écrire (un clan d’abord, puis les autres par lots).')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
