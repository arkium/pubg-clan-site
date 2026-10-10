import { Prisma } from '@prisma/client'

import { DISTINCTION_BADGE_META, type DistinctionBadgeKey } from '@/lib/distinction-badges'
import { sendEmail } from '@/lib/email-service'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { buildNotificationEmail } from '@/lib/notification-email'
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@/lib/notification-preferences'
import { prisma } from '@/lib/prisma'
import type { NotificationType } from '@/types/notifications'

type NotificationMetric = 'kills' | 'damage' | 'wr'

// Titres et messages en français : ils s'affichent dans la page des notifications et partent tels quels par e-mail.
function metricLabel(metric: NotificationMetric) {
  if (metric === 'kills') return 'en kills'
  if (metric === 'damage') return 'en dégâts'
  return 'en win rate'
}

/** Période de `stats-calculator.ts` (`week`, `month`, `all`) ; une valeur inconnue n'ajoute rien. */
function periodLabel(period: string) {
  if (period === 'week') return ' cette semaine'
  if (period === 'month') return ' ce mois-ci'
  if (period === 'all') return ' depuis le début'
  return ''
}

function badgeForMetric(metric: NotificationMetric): DistinctionBadgeKey {
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
      ...NOTIFICATION_PREFERENCE_DEFAULTS,
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
    case 'invite_reminder':
      return preference.inviteReminder
    default:
      return true
  }
}

/**
 * Destinataire des e-mails d'un membre : l'adresse du compte lié. `deliverable` seulement pour un compte actif, à
 * l'adresse vérifiée et réelle (jamais l'adresse technique `@local.invalid` d'une invitation). `null` sans compte lié.
 */
export async function getNotificationEmailRecipient(memberId: number) {
  const identity = await prisma.memberIdentity.findUnique({
    where: { memberId },
    include: {
      user: { select: { email: true, emailVerifiedAt: true, status: true } },
      member: { select: { displayName: true } },
    },
  })
  if (!identity) return null

  const address = identity.user.email.trim()
  const email = address.toLowerCase().endsWith('@local.invalid') ? null : address
  return {
    email,
    displayName: identity.member.displayName,
    deliverable: email !== null && Boolean(identity.user.emailVerifiedAt) && identity.user.status === 'active',
  }
}

async function sendEmailNotification(memberId: number, title: string, message: string) {
  const recipient = await getNotificationEmailRecipient(memberId)

  if (!recipient?.deliverable || !recipient.email) {
    console.info(`[Notification] Email skipped for member ${memberId}: no verified account`)
    return
  }

  // Même gabarit que l'aperçu de la page des préférences, avec le lien de désabonnement et ses en-têtes.
  const email = buildNotificationEmail({ memberId, displayName: recipient.displayName, title, message })
  await sendEmail({ to: recipient.email, subject: email.subject, text: email.text, headers: email.headers })
}

async function sendPushNotification(memberId: number, title: string) {
  console.info(`[Notification] Push queued for member ${memberId}: ${title}`)
}

export async function createNotificationForMember({
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
    await sendEmailNotification(memberId, title, message)
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

  const mapLabel = mapDisplayName(squadMatch.mapName, await getMapLabels())
  const placement = squadMatch.placement ? ` — top ${squadMatch.placement}` : ''

  await Promise.all(
    squadMatch.members.map((member) =>
      createNotificationForMember({
        memberId: member.memberId,
        type: 'squad_detected',
        title: 'Nouvelle partie en escouade',
        message: `Ton escouade a joué ensemble sur ${mapLabel}${placement}.`,
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
  const title = `Tu es en tête du clan ${metricLabel(metric)}${periodLabel(period)}`
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
    message: `Bravo ! Tu décroches la distinction « ${DISTINCTION_BADGE_META[badgeForMetric(metric)].shortLabel} ».`,
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
        title: 'Nouveau défi lancé',
        message: `Un nouveau défi a démarré pour le clan ${clan.name}.`,
        data: {
          challengeId,
          clanId,
        },
      })
    )
  )
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
          role: { name: 'Owner' },
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

export async function notifyClanCreationRequest(
  clanId: number,
  clanName: string,
  clanTag: string,
  creatorPlayerName: string
) {
  try {
    const superUsers = await prisma.userAccount.findMany({
      where: { isSuperUser: true },
      include: {
        identities: { select: { memberId: true } },
      },
    })

    const memberIds = superUsers.flatMap((su) => su.identities.map((id) => id.memberId))

    await Promise.all(
      memberIds.map((memberId) =>
        createNotificationForMember({
          memberId,
          type: 'clan_creation_request',
          title: 'Nouveau clan en attente de validation SuperUser',
          message: `Le clan "${clanName}" [${clanTag}] a été créé par ${creatorPlayerName} et attend votre validation SuperUser avant activation dans la ligue.`,
          data: {
            clanId,
            clanName,
            clanTag,
            creatorPlayerName,
          },
        })
      )
    )
  } catch (error) {
    console.error('[notification] Failed to notify superusers about clan creation:', error)
  }
}

/** Demande « Retirer mes données » (docs/features/pages-legales.md) : à traiter à la main par un SuperUser. */
export async function notifyPrivacyRequest(request: {
  id: number
  title: string
  message: string
  data: Prisma.InputJsonValue
}) {
  try {
    const superUsers = await prisma.userAccount.findMany({
      where: { isSuperUser: true },
      include: { identities: { select: { memberId: true } } },
    })
    const memberIds = superUsers.flatMap((su) => su.identities.map((id) => id.memberId))

    await Promise.all(
      memberIds.map((memberId) =>
        createNotificationForMember({
          memberId,
          type: 'privacy_request',
          title: request.title,
          message: request.message,
          data: request.data,
        })
      )
    )
  } catch (error) {
    console.error(`[notification] Failed to notify superusers about privacy request ${request.id}:`, error)
  }
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
    title: 'Ton clan est en ligne',
    message: 'Invite tes amis et forme ton escouade pour la soirée.',
    data: {
      memberId,
      sentAt: now.toISOString(),
    },
  })
}
