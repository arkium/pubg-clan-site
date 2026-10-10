import { requireOwnMember } from '@/lib/auth/own-member-guard'
import { getEmailSenderStatus } from '@/lib/email-service'
import { buildNotificationEmail, NOTIFICATION_EMAIL_EXAMPLE } from '@/lib/notification-email'
import { NOTIFICATION_PREFERENCE_DEFAULTS, pickPreferenceUpdate } from '@/lib/notification-preferences'
import { getNotificationEmailRecipient } from '@/lib/notification-service'
import { prisma } from '@/lib/prisma'

function parseMemberId(memberId: string) {
  const parsed = Number(memberId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function ensureMemberExists(memberId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: { id: true },
  })

  return !!member
}

/**
 * Canal e-mail vu par le joueur : son adresse, si un e-mail peut réellement partir (compte vérifié, envoi configuré sur
 * le serveur), et l'aperçu d'un e-mail — construit par `buildNotificationEmail`, comme les vrais, liens compris.
 */
async function emailChannel(memberId: number) {
  const [recipient, member] = await Promise.all([
    getNotificationEmailRecipient(memberId),
    prisma.clanMember.findUnique({ where: { id: memberId }, select: { displayName: true } }),
  ])
  const sender = getEmailSenderStatus()
  const preview = buildNotificationEmail({
    memberId,
    displayName: recipient?.displayName ?? member?.displayName ?? 'joueur',
    ...NOTIFICATION_EMAIL_EXAMPLE,
  })

  return {
    address: recipient?.email ?? null,
    deliverable: recipient?.deliverable ?? false,
    senderReady: sender.ready,
    preview: {
      from: sender.from,
      subject: preview.subject,
      text: preview.text,
      oneClickUnsubscribe: 'List-Unsubscribe' in preview.headers,
    },
  }
}

// Préférences personnelles : seul le compte lié au membre (et le SuperUser) les lit et les modifie.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsedMemberId = parseMemberId(id)

    if (!parsedMemberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireOwnMember(parsedMemberId, request)
    if (authError) return authError

    if (!(await ensureMemberExists(parsedMemberId))) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    const preferences = await prisma.notificationPreference.upsert({
      where: { memberId: parsedMemberId },
      update: {},
      create: { memberId: parsedMemberId, ...NOTIFICATION_PREFERENCE_DEFAULTS },
    })

    return Response.json({ preferences, email: await emailChannel(parsedMemberId) })
  } catch (error) {
    console.error('Error fetching notification preferences:', error)
    return Response.json(
      { error: 'Failed to fetch notification preferences' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const parsedMemberId = parseMemberId(id)

    if (!parsedMemberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireOwnMember(parsedMemberId, request)
    if (authError) return authError

    if (!(await ensureMemberExists(parsedMemberId))) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

    if (!body) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const updateData = pickPreferenceUpdate(body)

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: 'No valid preference fields provided' }, { status: 400 })
    }

    const preferences = await prisma.notificationPreference.upsert({
      where: { memberId: parsedMemberId },
      update: updateData,
      create: {
        memberId: parsedMemberId,
        ...NOTIFICATION_PREFERENCE_DEFAULTS,
        ...updateData,
      },
    })

    return Response.json({ preferences })
  } catch (error) {
    console.error('Error updating notification preferences:', error)
    return Response.json(
      { error: 'Failed to update notification preferences' },
      { status: 500 }
    )
  }
}
