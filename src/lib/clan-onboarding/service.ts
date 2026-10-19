import 'server-only'

import { Prisma } from '@prisma/client'

import { buildClanOnboarding, type ClanOnboarding, type ClanOnboardingFacts } from '@/lib/clan-onboarding/build'
import { prisma } from '@/lib/prisma'
import { getClanTelemetryBacklog } from '@/lib/telemetry-recoveries-backlog'

/**
 * Lecture des faits de la mise en route d'un clan (`build.ts`). Que des comptages et des lectures ponctuelles, filtrés
 * sur le clan : ~quelques dizaines de millisecondes, la boîte « À traiter » peut en calculer plusieurs.
 */

const OWNER_ROLE = { role: { name: 'Owner' } }

/** Clans créés depuis moins de ce délai : ceux que la boîte « À traiter » suit jusqu'au bout de leur mise en route. */
export const ONBOARDING_FOLLOW_DAYS = 30

/**
 * Coéquipiers déjà croisés dont le clan PUBG est celui-ci, ni suivis dans ce clan ni ailleurs : les « Candidats
 * détectés » ajoutables de /settings/clans (mêmes conditions que `GET /api/settings/opponents/clans/[clanId]/members`,
 * sans ceux déjà suivis dans un autre clan, que la page refuse d'ajouter).
 */
async function countDetectedCandidates(clanId: number, pubgClanId: string, platformShard: string) {
  const rows = await prisma.$queryRaw<Array<{ candidates: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*) AS candidates
    FROM Player p
    INNER JOIN OpponentClan oc ON oc.id = p.opponentClanId
    WHERE oc.pubgClanId = ${pubgClanId} AND oc.platformShard = ${platformShard}
      AND NOT EXISTS (SELECT 1 FROM ClanMember cm2 WHERE cm2.clanId = ${clanId} AND cm2.pubgAccountId = p.pubgAccountId)
      AND NOT EXISTS (
        SELECT 1 FROM ClanMember cm
        WHERE cm.pubgAccountId = p.pubgAccountId AND cm.isActive = true AND cm.joinStatus = 'active' AND cm.clanId <> ${clanId}
      )
  `)
  return Number(rows[0]?.candidates ?? 0)
}

/**
 * Parties en escouade du clan, en partant de ses membres : ~50 ms, contre ~1,2 s **par comptage** pour le filtre de
 * relation Prisma (`squadMatch.count({ where: { members: { some: … } } })`, qui parcourt toutes les parties — mesuré
 * le 2026-10-19 sur GFG).
 */
async function readSquadMatches(clanId: number) {
  const rows = await prisma.$queryRaw<Array<{ squads: bigint | number; officialSquads: bigint | number | null; lastSquadAt: Date | null }>>(Prisma.sql`
    SELECT COUNT(DISTINCT sm.id) AS squads,
           COUNT(DISTINCT CASE WHEN sm.matchType = 'official' THEN sm.id END) AS officialSquads,
           MAX(sm.createdAt) AS lastSquadAt
    FROM SquadMember sq
    INNER JOIN ClanMember cm ON cm.id = sq.memberId
    INNER JOIN SquadMatch sm ON sm.id = sq.squadMatchId
    WHERE cm.clanId = ${clanId}
  `)
  const row = rows[0]
  return {
    squads: Number(row?.squads ?? 0),
    officialSquads: Number(row?.officialSquads ?? 0),
    lastSquadAt: row?.lastSquadAt ? new Date(row.lastSquadAt) : null,
  }
}

export async function readClanOnboardingFacts(clanId: number): Promise<ClanOnboardingFacts | null> {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: {
      id: true,
      name: true,
      tag: true,
      pubgClanId: true,
      platformShard: true,
      isActive: true,
      isSystem: true,
      archivedAt: true,
      archivedReason: true,
      subdomain: true,
      createdAt: true,
    },
  })
  if (!clan || clan.isSystem) return null

  const [owners, activeMembers, pendingJoinRequests, detectedCandidates, individual, squadMatches, lastMatchSync, telemetry, statsCaches] =
    await Promise.all([
      prisma.clanMember.findMany({
        where: { clanId, joinStatus: { in: ['active', 'pending'] }, roles: { some: OWNER_ROLE } },
        select: {
          pubgPlayerName: true,
          isActive: true,
          joinStatus: true,
          identities: { select: { user: { select: { status: true } } }, take: 1 },
          invites: { where: { acceptedAt: null, revokedAt: null }, orderBy: { createdAt: 'desc' }, take: 1, select: { expiresAt: true } },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.clanMember.count({ where: { clanId, isActive: true, joinStatus: 'active' } }),
      prisma.clanMember.count({ where: { clanId, joinStatus: 'pending', roles: { none: OWNER_ROLE } } }),
      clan.pubgClanId ? countDetectedCandidates(clanId, clan.pubgClanId, clan.platformShard) : Promise.resolve(null),
      prisma.match.count({ where: { member: { clanId } } }),
      readSquadMatches(clanId),
      prisma.cronExecution.findFirst({
        where: { clanId, action: { in: ['daily_sync', 'sync_matches'] } },
        orderBy: { startedAt: 'desc' },
        select: { status: true, startedAt: true },
      }),
      getClanTelemetryBacklog(clanId),
      prisma.clanMatchesCache.count({ where: { clanId } }),
    ])

  return {
    clan: {
      id: clan.id,
      name: clan.name,
      tag: clan.tag,
      pubgClanId: clan.pubgClanId,
      isActive: clan.isActive,
      archivedAt: clan.archivedAt,
      archivedReason: clan.archivedReason,
      subdomain: clan.subdomain,
      createdAt: clan.createdAt,
    },
    owners: owners.map((owner) => ({
      playerName: owner.pubgPlayerName,
      active: owner.isActive && owner.joinStatus === 'active',
      hasAccount: owner.identities[0]?.user.status === 'active',
      invite: owner.invites[0] ?? null,
    })),
    activeMembers,
    pendingJoinRequests,
    detectedCandidates,
    matches: { individual, ...squadMatches },
    lastMatchSync,
    telemetry: telemetry
      ? { toQueue: telemetry.toQueueCount, urgent: telemetry.urgentBacklog, inQueue: telemetry.inQueueCount, completionRate: telemetry.completionRate }
      : null,
    statsReady: statsCaches > 0,
  }
}

export async function getClanOnboarding(clanId: number, now: Date = new Date()): Promise<ClanOnboarding | null> {
  const facts = await readClanOnboardingFacts(clanId)
  return facts ? buildClanOnboarding(facts, now) : null
}

/** Clans actifs créés depuis moins de `ONBOARDING_FOLLOW_DAYS` jours dont une étape reste à faire. */
export async function listUnfinishedOnboardings(now: Date = new Date()) {
  const recent = await prisma.clan.findMany({
    where: {
      isActive: true,
      isSystem: false,
      archivedAt: null,
      createdAt: { gte: new Date(now.getTime() - ONBOARDING_FOLLOW_DAYS * 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  const onboardings = await Promise.all(recent.map((clan) => getClanOnboarding(clan.id, now)))
  return onboardings
    .filter((onboarding): onboarding is ClanOnboarding => onboarding !== null && onboarding.nextTodo !== null)
    .map((onboarding) => ({
      clan: { id: onboarding.clan.id, tag: onboarding.clan.tag, name: onboarding.clan.name },
      nextStep: onboarding.nextTodo!.title,
      done: onboarding.done,
      total: onboarding.total,
    }))
}
