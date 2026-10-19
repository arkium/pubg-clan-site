import 'server-only'

import { buildAdminInbox, type AdminInbox, type AdminInboxFacts } from '@/lib/admin-inbox/build'
import { PENDING_CLAN_WHERE } from '@/lib/clan-archive-state'
import { listUnfinishedOnboardings } from '@/lib/clan-onboarding/service'
import { listArchiveCandidates } from '@/lib/clan-lifecycle/ungrouped-archive'
import { CRON_ACTION_LABELS, type CronActionKey } from '@/lib/cron-observability'
import { privacyRequestDeadline } from '@/lib/legal/privacy-request'
import { PLAYER_CLAN_CHANGE_STATUSES } from '@/lib/player-clan-change'
import { prisma } from '@/lib/prisma'
import { countQueue } from '@/lib/resources/resource-service'
import { getSiteConfiguration } from '@/lib/site-config'
import { countUrgentTelemetryBacklog } from '@/lib/telemetry-recoveries-backlog'
import { getTelemetryRecoveriesStatus } from '@/lib/telemetry-recoveries-status'

/**
 * Lecture des faits de la boîte « À traiter » (`build.ts`). Chaque source est lue seule : une panne en masque la
 * ligne (signalée dans `unavailable`), jamais toute la boîte. Que des lectures, toutes déjà faites par les pages
 * d'origine — la boîte ne compte rien que ces pages ne comptent déjà.
 */

const OWNER_ROLE = { role: { name: 'Owner' } }

async function readOrNull<T>(source: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch (error) {
    console.warn(`[admin-inbox] Source « ${source} » illisible :`, error instanceof Error ? error.message : error)
    return null
  }
}

async function readOrphanJoinRequests() {
  // Demandes d'adhésion (pas le demandeur d'un clan à valider, qui porte le rôle Owner) dans un clan sans Owner actif.
  const pending = await prisma.clanMember.findMany({
    where: { joinStatus: 'pending', roles: { none: OWNER_ROLE }, clan: { is: { isSystem: false } } },
    select: {
      pubgPlayerName: true,
      clan: {
        select: {
          id: true,
          tag: true,
          name: true,
          members: { where: { isActive: true, joinStatus: 'active', roles: { some: OWNER_ROLE } }, select: { id: true }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  return pending
    .filter((member) => member.clan && member.clan.members.length === 0)
    .map((member) => ({
      playerName: member.pubgPlayerName,
      clan: { id: member.clan!.id, tag: member.clan!.tag, name: member.clan!.name },
    }))
}

async function readTelemetry() {
  // Pas `getTelemetryBacklogSummary` : ~9 s pour un seul chiffre utile ici (mesuré le 2026-10-19).
  const [status, urgentBacklog] = await Promise.all([getTelemetryRecoveriesStatus(), countUrgentTelemetryBacklog()])
  return {
    workerAlive: status.worker.alive,
    queueRemaining: status.queue.remaining,
    urgentBacklog,
  }
}

async function readCronFailures(now: Date) {
  // Les analyses de télémétrie ont leur propre ligne (parties qui expirent) : elles échouent par centaines sans que
  // ce soit un incident du cron.
  const rows = await prisma.cronExecution.findMany({
    where: {
      status: 'failed',
      startedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      NOT: { action: { startsWith: 'telemetry_' } },
    },
    select: { action: true, clan: { select: { tag: true } } },
    orderBy: { startedAt: 'desc' },
    take: 200,
  })
  return rows.map((row) => ({
    label: CRON_ACTION_LABELS[row.action as CronActionKey] ?? row.action,
    clanTag: row.clan?.tag ?? null,
  }))
}

export async function readAdminInboxFacts(now: Date = new Date()): Promise<AdminInboxFacts> {
  const [
    pendingClans,
    onboardingClans,
    orphanJoinRequests,
    privacyDeadlines,
    resourceQueue,
    unacknowledgedMoves,
    archiveCandidates,
    lastLifecycleRun,
    telemetry,
    cronFailures,
    configErrors,
  ] = await Promise.all([
    readOrNull('pendingClans', () =>
      prisma.clan.findMany({ where: PENDING_CLAN_WHERE, select: { id: true, tag: true, name: true, createdAt: true } })
    ),
    readOrNull('onboardingClans', () => listUnfinishedOnboardings(now)),
    readOrNull('orphanJoinRequests', readOrphanJoinRequests),
    readOrNull('privacyDeadlines', async () =>
      (await prisma.privacyRequest.findMany({ where: { status: 'pending' }, select: { createdAt: true } })).map((row) =>
        privacyRequestDeadline(row.createdAt)
      )
    ),
    readOrNull('resourceQueue', () => countQueue()),
    readOrNull('unacknowledgedMoves', () =>
      prisma.playerClanChange.count({ where: { status: PLAYER_CLAN_CHANGE_STATUSES.applied, acknowledgedAt: null } })
    ),
    readOrNull('archiveCandidates', async () => (await listArchiveCandidates()).candidates.length),
    readOrNull('lastLifecycleRun', async () =>
      (await prisma.clanLifecycleRun.findFirst({
        orderBy: { startedAt: 'desc' },
        select: { status: true, startedAt: true, circuitBreakerTripped: true },
      })) ?? undefined
    ),
    readOrNull('telemetry', readTelemetry),
    readOrNull('cronFailures', () => readCronFailures(now)),
    readOrNull('configErrors', async () => (await getSiteConfiguration()).errors),
  ])

  return {
    pendingClans,
    onboardingClans,
    orphanJoinRequests,
    privacyDeadlines,
    resourceQueue,
    unacknowledgedMoves,
    archiveCandidates,
    lastLifecycleRun,
    // Le web tourne avec ENABLE_CRON_JOBS=false en production (le worker cron, lui, a true) : on attend des passages
    // dès que le site est en production, ou quand ce process porte lui-même les crons.
    cronJobsExpected: process.env.NODE_ENV === 'production' || process.env.ENABLE_CRON_JOBS === 'true',
    telemetry,
    cronFailures,
    configErrors,
  }
}

export async function getAdminInbox(now: Date = new Date()): Promise<AdminInbox> {
  return buildAdminInbox(await readAdminInboxFacts(now), now)
}
