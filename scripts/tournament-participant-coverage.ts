/**
 * Couverture d'un tournoi : tous les joueurs des manches sont-ils suivis par le site ? — lecture seule.
 *
 * Une manche ne retient que les joueurs suivis (`ClanMember` actif d'un clan actif) : un joueur inconnu du site ne
 * marque aucun point et son équipe n'apparaît pas. La télémétrie, elle, couvre tout le lobby (`memberStats`, une
 * entrée par compte PUBG avec la place de son équipe) : ce script compare les deux, manche par manche, et nomme les
 * inconnus quand le site les a déjà croisés (`Player`, `EncounteredPlayer`).
 *
 * ⚠️ DATABASE_URL vise la base de PRODUCTION : aucune écriture ici.
 *
 * Usage :
 *   npx tsx scripts/tournament-participant-coverage.ts <tournamentId>
 */
import { prisma } from '../src/lib/prisma'
import { decodeTelemetryRow } from '../src/lib/pubg-telemetry/json-codec'
import { getTournamentMatches } from '../src/lib/tournament-service'

type MemberStat = { memberKey?: string; teamId?: number; teamPlacement?: number; kills?: number }

async function main() {
  const tournamentId = process.argv[2]
  if (!tournamentId) throw new Error('Usage : npx tsx scripts/tournament-participant-coverage.ts <tournamentId>')

  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { title: true } })
  if (!tournament) throw new Error(`Tournoi introuvable : ${tournamentId}`)

  const matches = [...(await getTournamentMatches(tournamentId))].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )
  const tracked = await prisma.clanMember.findMany({
    where: { isActive: true, clan: { isActive: true } },
    select: { pubgAccountId: true, displayName: true, clan: { select: { tag: true } } },
  })
  const trackedByAccount = new Map(
    tracked.filter((member) => member.pubgAccountId).map((member) => [member.pubgAccountId!.toLowerCase(), member])
  )

  console.log(`Tournoi « ${tournament.title} » — ${matches.length} manche(s)\n`)
  const untrackedAccounts = new Map<string, { rounds: number[]; kills: number; teammates: Set<string> }>()

  for (const [index, match] of matches.entries()) {
    const round = index + 1
    const row = await prisma.squadMatchTelemetry.findUnique({
      where: { squadMatchId: match.id },
      select: { status: true, memberStats: true, memberStatsGz: true },
    })
    const stats = row ? ((decodeTelemetryRow(row).memberStats as MemberStat[] | null) ?? []) : []
    const header = `Manche ${round} (${new Date(match.createdAt).toISOString()}, ${match.mapName})`
    if (!row || row.status !== 'success' || stats.length === 0) {
      console.log(`${header} : télémétrie indisponible (${row?.status ?? 'absente'}) — ${match.members.length} joueur(s) suivi(s) retenu(s)\n`)
      continue
    }

    // Joueurs humains seulement (`account.…`) : ni bots (`ai.…`) ni animaux (`Monster.Bear-…` sur Dihor Otok).
    const humans = stats.filter((stat) => stat.memberKey?.toLowerCase().startsWith('account.'))
    const missing = humans.filter((stat) => !trackedByAccount.has(stat.memberKey!.toLowerCase()))
    const teams = new Map<number, { total: number; missing: number }>()
    for (const stat of humans) {
      const team = teams.get(stat.teamId ?? -1) ?? { total: 0, missing: 0 }
      team.total += 1
      if (!trackedByAccount.has(stat.memberKey!.toLowerCase())) team.missing += 1
      teams.set(stat.teamId ?? -1, team)
    }
    const fullyMissingTeams = [...teams.values()].filter((team) => team.missing === team.total).length
    console.log(
      `${header} : ${humans.length} joueurs dans le lobby, ${humans.length - missing.length} suivis, ${missing.length} inconnus du site` +
        ` — ${teams.size} équipes, dont ${fullyMissingTeams} entièrement inconnues`
    )
    for (const stat of missing) {
      const entry = untrackedAccounts.get(stat.memberKey!) ?? { rounds: [], kills: 0, teammates: new Set<string>() }
      entry.rounds.push(round)
      entry.kills += stat.kills ?? 0
      // Coéquipiers suivis : disent dans quelle squad (et pour quel clan) l'inconnu a joué.
      for (const mate of humans) {
        const known = mate.teamId === stat.teamId ? trackedByAccount.get(mate.memberKey!.toLowerCase()) : undefined
        if (known) entry.teammates.add(`[${known.clan?.tag ?? '?'}] ${known.displayName}`)
      }
      untrackedAccounts.set(stat.memberKey!, entry)
    }
  }

  if (untrackedAccounts.size === 0) {
    console.log('\nTous les joueurs des manches sont suivis par le site.')
    return
  }

  // Pseudos des inconnus, quand le site les a déjà croisés.
  const accounts = [...untrackedAccounts.keys()]
  const [players, encountered] = await Promise.all([
    prisma.player.findMany({ where: { pubgAccountId: { in: accounts } }, select: { pubgAccountId: true, pubgPlayerName: true } }),
    prisma.encounteredPlayer.findMany({ where: { pubgAccountId: { in: accounts } }, select: { pubgAccountId: true, pubgPlayerName: true } }),
  ])
  const names = new Map<string, string>()
  for (const entry of [...encountered, ...players]) names.set(entry.pubgAccountId, entry.pubgPlayerName)

  console.log(`\n${untrackedAccounts.size} joueur(s) inconnu(s) du site sur l'ensemble du tournoi :`)
  for (const [account, entry] of [...untrackedAccounts.entries()].sort((left, right) => right[1].rounds.length - left[1].rounds.length)) {
    console.log(`  ${(names.get(account) ?? '(pseudo inconnu)').padEnd(24)} manches ${entry.rounds.join(', ').padEnd(16)} ${entry.kills} kill(s)  ${account}`)
    console.log(`    avec : ${[...entry.teammates].join(', ') || 'aucun joueur suivi'}`)
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
