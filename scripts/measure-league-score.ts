/**
 * Vérification du nouveau Power score de la Ligue Inter-Clans (docs/TODO/score.md, « Vérification attendue »), en
 * LECTURE SEULE :
 *  1. moyennes de la ligue sur le mois en cours (points de placement, dégâts, kills, knocks) et part de chaque terme
 *     dans le score moyen — objectif ≈ 40 % pour le placement, coefficient proposé si hors 35-45 % ;
 *  2. classement du mois avant / après (rang, parties, ancien score, nouveau score) et clans en qualification ;
 *  3. par type de partie et par période : clans classés, en qualification, sans partie.
 *
 *   npx tsx scripts/measure-league-score.ts
 */
import 'dotenv/config'

import {
  LEAGUE_MATCH_TYPE_OPTIONS,
  leagueTableBetween,
  type LeagueClan,
  type LeagueMatchRow,
} from '@/lib/clan-league'
import { loadLeagueRows } from '@/lib/clan-league-service'
import { getLeagueSettingsState } from '@/lib/league-settings-service'
import { getPeriodRange, STANDARD_PERIODS } from '@/lib/period'
import { prisma } from '@/lib/prisma'

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const decimal = (value: number, digits = 2) => value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })

async function loadClans(): Promise<LeagueClan[]> {
  const clans = await prisma.clan.findMany({ where: { isActive: true, pubgClanId: { not: null } }, select: { id: true, name: true, tag: true } })
  return clans.map((clan) => ({ clanId: clan.id, name: clan.name, tag: clan.tag, imageUrl: null }))
}

/** Ancienne formule (avant le 2026-10-04) : tous les clans qui ont joué, win rate × 10 000 + dégâts + kills × 10 + knocks × 5. */
function oldStandings(rows: readonly LeagueMatchRow[], clans: readonly LeagueClan[], from: Date) {
  const totals = new Map<number, { matches: number; wins: number; damage: number; kills: number; knocks: number }>()
  for (const row of rows) {
    if (row.createdAt < from) continue
    const entry = totals.get(row.clanId) ?? { matches: 0, wins: 0, damage: 0, kills: 0, knocks: 0 }
    entry.matches += 1
    if (row.placement === 1) entry.wins += 1
    entry.damage += row.damage
    entry.kills += row.kills
    entry.knocks += row.knocks
    totals.set(row.clanId, entry)
  }
  return clans
    .flatMap((clan) => {
      const entry = totals.get(clan.clanId)
      if (!entry) return []
      const score = (entry.wins / entry.matches) * 10000 + entry.damage / entry.matches + (entry.kills / entry.matches) * 10 + (entry.knocks / entry.matches) * 5
      return [{ clanId: clan.clanId, name: clan.name, matches: entry.matches, score }]
    })
    .sort((a, b) => b.score - a.score || b.matches - a.matches)
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

async function main() {
  const now = new Date()
  const clans = await loadClans()
  const month = getPeriodRange('month', now)!
  // Réglages en vigueur (/settings/league, lecture seule) : défaut tant que le SuperUser n'a rien enregistré.
  const state = await getLeagueSettingsState()
  const settings = state.settings
  const { placementWeight: PLACEMENT_WEIGHT, damageWeight: DAMAGE_WEIGHT, killWeight: KILL_WEIGHT, knockWeight: KNOCK_WEIGHT } = settings
  const minOf = (matchType: (typeof LEAGUE_MATCH_TYPE_OPTIONS)[number]['value'], period: 'week' | 'month' | 'all') => settings.minMatches[matchType][period]
  console.log(`Réglages : ${state.isDefault ? 'par défaut' : `enregistrés le ${state.updatedAt} par ${state.updatedBy ?? '—'}`}`)

  // 1. Moyennes et parts — mois en cours, Normal.
  const officialRows = await loadLeagueRows(null, 'official')
  const table = leagueTableBetween(officialRows, clans, month.start, null, minOf('official', 'month'), settings)
  const { league } = table
  const terms = {
    placement: league.avgPlacementPoints * PLACEMENT_WEIGHT,
    damage: league.avgDamage * DAMAGE_WEIGHT,
    kills: league.avgKills * KILL_WEIGHT,
    knocks: league.avgKnocks * KNOCK_WEIGHT,
  }
  console.log(`\n1. Ligue Normal, mois en cours (depuis le ${month.start.toISOString().slice(0, 10)}) — ${integer.format(league.matches)} lignes clan × partie`)
  console.log(`   Points de placement moyens ${decimal(league.avgPlacementPoints)} · dégâts ${decimal(league.avgDamage, 1)} · kills ${decimal(league.avgKills)} · knocks ${decimal(league.avgKnocks)}`)
  console.log(`   Score moyen de la ligue : ${decimal(league.rawScore, 1)}`)
  for (const [name, value] of Object.entries(terms)) {
    console.log(`   ${name.padEnd(10)} ${decimal(value, 1).padStart(8)}  ${decimal((value / league.rawScore) * 100, 1)} %`)
  }
  const placementShare = terms.placement / league.rawScore
  const rest = league.rawScore - terms.placement
  const suggested = (0.4 * rest) / (0.6 * league.avgPlacementPoints)
  console.log(`   Part du placement : ${decimal(placementShare * 100, 1)} % (objectif 35-45 %) · coefficient pour 40 % : ${decimal(suggested, 0)}`)

  // Stabilité de la part du placement : mois précédent complet et tout l'historique.
  const previousMonth = getPeriodRange('month-1', now)!
  const windows: Array<[string, Date | null, Date | null]> = [['mois précédent', previousMonth.start, previousMonth.end], ['tout l’historique', null, null]]
  for (const [label, from, to] of windows) {
    const window = leagueTableBetween(officialRows, clans, from, to, minOf('official', 'month'), settings).league
    const share = (window.avgPlacementPoints * PLACEMENT_WEIGHT) / window.rawScore
    const coefficient = (0.4 * (window.rawScore - window.avgPlacementPoints * PLACEMENT_WEIGHT)) / (0.6 * window.avgPlacementPoints)
    console.log(
      `   ${label} : ${integer.format(window.matches)} lignes · placement ${decimal(window.avgPlacementPoints)} pts · dégâts ${decimal(window.avgDamage, 0)} · ` +
        `part du placement ${decimal(share * 100, 1)} % · coefficient pour 40 % : ${decimal(coefficient, 0)}`
    )
  }

  // 2. Classement du mois avant / après.
  const before = oldStandings(officialRows, clans, month.start)
  const oldById = new Map(before.map((entry) => [entry.clanId, entry]))
  console.log(`\n2. Classement du mois, avant → après (seuil ${minOf('official', 'month')} parties)`)
  console.log(`   ${'Clan'.padEnd(26)} ${'parties'.padStart(7)} ${'ancien rang'.padStart(11)} ${'ancien score'.padStart(12)} ${'nouveau rang'.padStart(12)} ${'brut'.padStart(8)} ${'nouveau score'.padStart(13)}`)
  for (const standing of table.standings) {
    const old = oldById.get(standing.clanId)
    console.log(
      `   ${standing.name.slice(0, 26).padEnd(26)} ${String(standing.matches).padStart(7)} ${String(old?.rank ?? '—').padStart(11)} ${integer.format(old?.score ?? 0).padStart(12)} ${String(standing.rank).padStart(12)} ${integer.format(standing.rawScore).padStart(8)} ${integer.format(standing.powerScore).padStart(13)}`
    )
  }
  for (const qualifier of table.qualifying) {
    const old = oldById.get(qualifier.clanId)
    console.log(
      `   ${qualifier.name.slice(0, 26).padEnd(26)} ${String(qualifier.matches).padStart(7)} ${String(old?.rank ?? '—').padStart(11)} ${integer.format(old?.score ?? 0).padStart(12)} ${`qualif. ${qualifier.matches}/${qualifier.required}`.padStart(12)}`
    )
  }

  // 3. Par type et par période : classés / en qualification.
  console.log('\n3. Clans classés / en qualification, par type de partie et par période')
  for (const option of LEAGUE_MATCH_TYPE_OPTIONS) {
    const rows = option.value === 'official' ? officialRows : await loadLeagueRows(null, option.value)
    const cells = STANDARD_PERIODS.map((period) => {
      const range = getPeriodRange(period, now)
      const result = leagueTableBetween(rows, clans, range?.start ?? null, null, minOf(option.value, period), settings)
      return `${period} ${result.standings.length} classés / ${result.qualifying.length} en qualif. (${integer.format(result.league.matches)} lignes)`
    })
    console.log(`   ${option.label.padEnd(18)} ${cells.join(' · ')}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
