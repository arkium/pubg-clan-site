/**
 * Annuaires de noms d'un ou plusieurs tournois. Le moteur (`tournament-service.ts`) ne manipule que des identifiants :
 * la liste `/tournaments` et la page d'un tournoi résolvent ici clans et joueurs, en deux requêtes au total.
 */
import { prisma } from '@/lib/prisma'
import type { ClanDirectory, MemberDirectory } from '@/lib/tournament-standings-view'

type MatchWithMembers = { members: Array<{ memberId: number }> }

export function collectTournamentMemberIds(matches: MatchWithMembers[]) {
  return [...new Set(matches.flatMap((match) => match.members.map((row) => row.memberId)))]
}

export async function loadTournamentDirectories(
  clanIds: number[],
  memberIds: number[]
): Promise<{ clans: ClanDirectory; members: MemberDirectory }> {
  const uniqueClanIds = [...new Set(clanIds)]
  const uniqueMemberIds = [...new Set(memberIds)]
  const [clanRows, memberRows] = await Promise.all([
    uniqueClanIds.length > 0
      ? prisma.clan.findMany({ where: { id: { in: uniqueClanIds } }, select: { id: true, name: true, tag: true } })
      : Promise.resolve([]),
    uniqueMemberIds.length > 0
      ? prisma.clanMember.findMany({
          where: { id: { in: uniqueMemberIds } },
          select: { id: true, displayName: true, clanId: true },
        })
      : Promise.resolve([]),
  ])

  return {
    clans: Object.fromEntries(clanRows.map((clan) => [clan.id, { name: clan.name, tag: clan.tag }])),
    members: Object.fromEntries(
      memberRows.map((member) => [member.id, { displayName: member.displayName, clanId: member.clanId }])
    ),
  }
}
