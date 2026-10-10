import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@/lib/notification-preferences'
import { verifyUnsubscribeToken } from '@/lib/notification-unsubscribe'
import { prisma } from '@/lib/prisma'

/**
 * Désabonnement des e-mails de notification, sans session : le jeton signé du lien (`?t=`) suffit
 * (`src/lib/notification-unsubscribe.ts`). Il ne coupe que le canal e-mail du membre.
 *
 * - GET : état, pour la page de confirmation `/notifications/desabonnement` — ne modifie rien (les messageries et les
 *   antivirus ouvrent les liens des e-mails avant le destinataire).
 * - POST : coupe le canal. Appelé par la page, ou directement par la messagerie (`List-Unsubscribe-Post`, RFC 8058 :
 *   corps `List-Unsubscribe=One-Click`, ignoré ici — le jeton est dans l'adresse).
 */

function tokenOf(request: Request) {
  return new URL(request.url).searchParams.get('t')
}

const INVALID = () => Response.json({ error: 'invalid_token' }, { status: 400 })

export async function GET(request: Request) {
  try {
    const memberId = verifyUnsubscribeToken(tokenOf(request))
    if (!memberId) return INVALID()

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: { id: true, displayName: true, notificationPreference: { select: { emailNotifications: true } } },
    })
    if (!member) return Response.json({ error: 'member_not_found' }, { status: 404 })

    return Response.json({
      memberId: member.id,
      displayName: member.displayName,
      emailNotifications: member.notificationPreference?.emailNotifications ?? NOTIFICATION_PREFERENCE_DEFAULTS.emailNotifications,
    })
  } catch (error) {
    console.error('Error reading notification unsubscribe state:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const memberId = verifyUnsubscribeToken(tokenOf(request))
    if (!memberId) return INVALID()

    const member = await prisma.clanMember.findUnique({ where: { id: memberId }, select: { id: true } })
    if (!member) return Response.json({ error: 'member_not_found' }, { status: 404 })

    await prisma.notificationPreference.upsert({
      where: { memberId },
      update: { emailNotifications: false },
      create: { memberId, ...NOTIFICATION_PREFERENCE_DEFAULTS, emailNotifications: false },
    })

    return Response.json({ ok: true, memberId })
  } catch (error) {
    console.error('Error unsubscribing from notification emails:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
