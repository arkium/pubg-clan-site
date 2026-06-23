import { Prisma } from '@prisma/client'

import { sendEmail } from '@/lib/email-service'
import { prisma } from '@/lib/prisma'
import type { NotificationType } from '@/types/notifications'

type NotificationMetric = 'kills' | 'damage' | 'wr'

const DEFAULT_PREFERENCES = {
  squadDetected: true,
  topPerformance: true,
  challengeStarted: true,
  reportReady: true,
  inviteReminder: false,
  emailNotifications: false,
  pushNotifications: true,
  inAppNotifications: true,
} as const

function metricLabel(metric: NotificationMetric) {
  if (metric === 'kills') return 'kills'
  if (metric === 'damage') return 'damage'
  return 'win rate'
}

function badgeForMetric(metric: NotificationMetric) {
  if (metric === 'kills') return 'top_killer'
  if (metric === 'damage') return 'top_damage'
  return 'best_wr'
}

async function getOrCreatePreferences(memberId: number) {
  return prisma.notificationPreference.upsert({
    where: { memberId },
    update: {},
    create: {
      memberId,
      ...DEFAULT_PREFERENCES,
    },
  })
}

function isTypeEnabled(
  preference: Awaited<ReturnType<typeof getOrCreatePreferences>>,
  type: NotificationType
) {
  switch (type) {
    case 'squad_detected':
      return preference.squadDetected
    case 'top_performance':
      return preference.topPerformance
    case 'challenge_started':
      return preference.challengeStarted
    case 'report_ready':
      return preference.reportReady
    case 'invite_reminder':
      return preference.inviteReminder
    default:
      return true
  }
}

async function sendEmailNotification(memberId: number, title: string) {
  const identity = await prisma.memberIdentity.findUnique({
    where: {
      memberId,
    },
    include: {
      user: {
        select: {
          email: true,
          emailVerifiedAt: true,
          status: true,
        },
      },
      member: {
        select: {
          displayName: true,
        },
      },
    },
  })

  if (!identity || !identity.user.emailVerifiedAt || identity.user.status !== 'active') {
    console.info(`[Notification] Email skipped for member ${memberId}: no verified account`)
    return
  }

  await sendEmail({
    to: identity.user.email,
    subject: title,
    text: `Bonjour ${identity.member.displayName},\n\n${title}`,
  })
}

async function sendPushNotification(memberId: number, title: string) {
  console.info(`[Notification] Push queued for member ${memberId}: ${title}`)
}

async function createNotificationForMember({
  memberId,
  type,
  title,
  message,
  data,
}: {
  memberId: number
  type: NotificationType
  title: string
  message: string
  data?: Prisma.InputJsonValue
}) {
  const preference = await getOrCreatePreferences(memberId)

  if (!isTypeEnabled(preference, type)) {
    return null
  }

  const notification = preference.inAppNotifications
    ? await prisma.notification.create({
        data: {
          memberId,
          type,
          title,
          message,
          ...(data ? { data } : {}),
        },
      })
    : null

  if (preference.emailNotifications) {
    await sendEmailNotification(memberId, title)
  }

  if (preference.pushNotifications) {
    await sendPushNotification(memberId, title)
  }

  return notification
}

export async function notifySquadDetected(squadMatchId: string) {
  const squadMatch = await prisma.squadMatch.findUnique({
    where: { id: squadMatchId },
    include: {
      members: {
        orderBy: { memberId: 'asc' },
      },
    },
  })

  if (!squadMatch) {
    return
  }

  await Promise.all(
    squadMatch.members.map((member) =>
      createNotificationForMember({
        memberId: member.memberId,
        type: 'squad_detected',
        title: 'New squad match detected!',
        message: `Your squad played together on ${squadMatch.mapName}.`,
        data: {
          squadMatchId: squadMatch.id,
          pubgMatchId: squadMatch.pubgMatchId,
          placement: squadMatch.placement,
          mapName: squadMatch.mapName,
        },
      })
    )
  )
}

export async function notifyTopPerformance(
  memberId: number,
  metric: NotificationMetric,
  period: string
) {
  const title = `You were top ${metricLabel(metric)} this ${period}!`
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const alreadySentToday = await prisma.notification.findFirst({
    where: {
      memberId,
      type: 'top_performance',
      title,
      createdAt: { gte: today },
    },
    select: { id: true },
  })

  if (alreadySentToday) {
    return
  }

  await createNotificationForMember({
    memberId,
    type: 'top_performance',
    title,
    message: `Congratulations! You earned the ${badgeForMetric(metric)} badge.`,
    data: {
      memberId,
      metric,
      period,
      badge: badgeForMetric(metric),
    },
  })
}

export async function notifyChallengeStarted(challengeId: string, clanId: number) {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: {
      name: true,
      members: {
        where: { isActive: true },
        select: { id: true },
      },
    },
  })

  if (!clan) {
    return
  }

  await Promise.all(
    clan.members.map((member) =>
      createNotificationForMember({
        memberId: member.id,
        type: 'challenge_started',
        title: 'New challenge started',
        message: `New challenge started for clan ${clan.name}.`,
        data: {
          challengeId,
          clanId,
        },
      })
    )
  )
}

export async function notifyReportReady(
  reportId: string,
  memberId: number,
  options?: {
    clanId?: number
    reportType?: 'weekly' | 'monthly'
  }
) {
  const reportLabel = options?.reportType === 'monthly' ? 'monthly' : 'weekly'
  await createNotificationForMember({
    memberId,
    type: 'report_ready',
    title: `Your ${reportLabel} report is ready`,
    message: 'Open your report to review your latest PUBG progress.',
    data: {
      reportId,
      memberId,
      link: options?.clanId ? `/clans/${options.clanId}/reports/${reportId}` : `/reports/${reportId}`,
      reportType: reportLabel,
    },
  })
}

export async function notifyJoinRequest(
  clanId: number,
  pendingMemberName: string,
  pendingMemberId: number
) {
  const managingMembers = await prisma.clanMember.findMany({
    where: {
      clanId,
      isActive: true,
      roles: {
        some: {
          role: { name: { in: ['Owner', 'Admin'] } },
        },
      },
    },
    select: { id: true },
  })

  await Promise.all(
    managingMembers.map((member) =>
      createNotificationForMember({
        memberId: member.id,
        type: 'join_request',
        title: 'Nouvelle demande d\'adhésion',
        message: `${pendingMemberName} a demandé à rejoindre votre clan. Validez ou refusez depuis la page des membres en attente.`,
        data: {
          pendingMemberId,
          clanId,
        },
      })
    )
  )
}

export async function notifyInviteReminder(memberId: number) {
  const now = new Date()
  const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000)

  const recent = await prisma.notification.findFirst({
    where: {
      memberId,
      type: 'invite_reminder',
      createdAt: { gte: twelveHoursAgo },
    },
    select: { id: true },
  })

  if (recent) {
    return
  }

  await createNotificationForMember({
    memberId,
    type: 'invite_reminder',
    title: 'Invite your friends to the clan!',
    message: 'Your clan is online — invite your friends and squad up.',
    data: {
      memberId,
      sentAt: now.toISOString(),
    },
  })
}
