/**
 * Rôles hérités d'un ancien clan — réparation de l'existant (règle du 2026-11-09, docs/features/cycle-de-vie-clan.md
 * §5 bis : un membre qui change de clan redevient simple Membre, Owner compris).
 *
 * Avant cette règle, la synchronisation de nuit, les promotions et l'archivage déplaçaient les joueurs sans toucher à
 * leurs rôles. Comme les permissions réunissent tous les rôles d'un membre sans regarder leur clan (`hasAnyRole`), un
 * ancien Owner passait les gardes Owner de son nouveau clan. Ce script retire chaque rôle dont le clan n'est pas celui du
 * membre, puis pose le rôle Membre du clan actuel à un membre actif resté sans rôle dans son clan.
 *
 * Usage :
 *   npx tsx scripts/reset-foreign-member-roles.ts            # simulation : liste, n'écrit rien
 *   npx tsx scripts/reset-foreign-member-roles.ts --apply    # écrit
 */

import { prisma } from '../src/lib/prisma'
import { assignDefaultMemberRole } from '../src/lib/role-service'

const apply = process.argv.slice(2).includes('--apply')

async function main() {
  const rows = await prisma.clanMemberRole.findMany({
    select: {
      id: true,
      member: {
        select: {
          id: true,
          displayName: true,
          clanId: true,
          isActive: true,
          clan: { select: { tag: true } },
          _count: { select: { identities: true } },
        },
      },
      role: { select: { name: true, clanId: true, clan: { select: { tag: true } } } },
    },
  })

  const foreign = rows.filter((row) => row.role.clanId !== row.member.clanId)
  console.log(`${foreign.length} rôle(s) d'un autre clan que celui du membre${apply ? '' : ' (simulation)'} :`)
  for (const row of foreign) {
    const owner = row.role.name === 'Owner' ? ' ⚠️ Owner' : ''
    const account = row.member._count.identities > 0 ? ', avec compte' : ''
    console.log(
      `  - ${row.member.displayName} (#${row.member.id}, ${row.member.isActive ? 'actif' : 'inactif'}${account}) dans [${row.member.clan?.tag ?? '—'}] : ` +
        `rôle ${row.role.name} de [${row.role.clan?.tag ?? '?'}]${owner}`
    )
  }

  if (!apply) {
    console.log('\nSimulation : rien n’est écrit. Relance avec --apply pour retirer ces rôles.')
    return
  }

  await prisma.clanMemberRole.deleteMany({ where: { id: { in: foreign.map((row) => row.id) } } })

  // Membre actif resté sans rôle dans son clan : le rôle Membre, comme après un déplacement.
  const memberIds = [...new Set(foreign.filter((row) => row.member.isActive && row.member.clanId).map((row) => row.member.id))]
  let assigned = 0
  for (const memberId of memberIds) {
    const member = foreign.find((row) => row.member.id === memberId)?.member
    if (!member?.clanId) continue
    const remaining = await prisma.clanMemberRole.count({ where: { memberId, role: { clanId: member.clanId } } })
    if (remaining === 0 && (await assignDefaultMemberRole(memberId, member.clanId))) assigned += 1
  }

  console.log(`\n${foreign.length} rôle(s) retiré(s), rôle Membre posé à ${assigned} membre(s).`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
