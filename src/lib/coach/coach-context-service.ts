import { parseCoachContextPath, type CoachResolvedContext } from '@/lib/coach/coach-context'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { prisma } from '@/lib/prisma'

/**
 * Vérification serveur du contexte de page (docs/TODO/chatbot-ia.md §7.2) : le chemin envoyé par le tiroir ne prouve
 * rien. Un match n'est retenu que s'il compte un membre du clan de la session, un joueur que s'il en est membre ; tout
 * le reste tombe à « sans contexte ».
 */

export type CoachContextScope = { clanId: number; memberId: number; memberName: string }

const NONE: CoachResolvedContext = { kind: 'none' }

async function matchContext(matchId: string, clanId: number): Promise<CoachResolvedContext> {
  const match = await prisma.squadMatch.findFirst({
    where: { id: matchId, members: { some: { member: { clanId } } } },
    select: { id: true, mapName: true, createdAt: true, placement: true, totalKills: true, telemetry: { select: { status: true } } },
  })
  if (!match) return NONE
  const labels = await getMapLabels()
  return {
    kind: 'match',
    matchId: match.id,
    mapName: match.mapName,
    mapLabel: mapDisplayName(match.mapName, labels),
    createdAt: match.createdAt,
    placement: match.placement,
    squadKills: match.totalKills,
    telemetryAnalyzed: match.telemetry?.status === 'success',
  }
}

export async function resolveCoachContext(path: string | null | undefined, scope: CoachContextScope): Promise<CoachResolvedContext> {
  const parsed = parseCoachContextPath(path)
  switch (parsed.kind) {
    case 'match':
      return parsed.clanId === scope.clanId ? matchContext(parsed.matchId, scope.clanId) : NONE
    case 'tournament-match':
      return matchContext(parsed.matchId, scope.clanId)
    case 'session':
      return parsed.clanId === scope.clanId ? { kind: 'session', date: parsed.date } : NONE
    case 'clan': {
      if (parsed.clanId !== scope.clanId) return NONE
      if (parsed.page === 'weapons') return { kind: 'weapons', memberId: scope.memberId, memberName: scope.memberName }
      if (parsed.page === 'opponents') return { kind: 'opponents' }
      if (parsed.page === 'drop-zones') return { kind: 'drop-zones' }
      return NONE
    }
    case 'member': {
      if (parsed.page === 'other') return NONE
      const member = await prisma.clanMember.findFirst({
        where: { id: parsed.memberId, clanId: scope.clanId },
        select: { id: true, displayName: true },
      })
      if (!member) return NONE
      if (parsed.page === 'weapons') return { kind: 'weapons', memberId: member.id, memberName: member.displayName }
      if (parsed.page === 'nemesis') return { kind: 'opponents' }
      return { kind: 'drop-zones' }
    }
    case 'none':
      return NONE
  }
}
