import { sendEmail } from '@/lib/email-service'
import { CONTACT_EMAIL } from '@/lib/legal/legal-info'
import {
  privacyRequestEmail,
  privacyRequestNotification,
  type PrivacyRequestInput,
  type PrivacyRequestKind,
} from '@/lib/legal/privacy-request'
import { notifyPrivacyRequest } from '@/lib/notification-service'
import { prisma } from '@/lib/prisma'

/**
 * Enregistre une demande « Retirer mes données », puis prévient les SuperUsers (notification) et l'adresse de contact
 * (e-mail). Seul l'enregistrement peut faire échouer l'envoi : une panne SMTP ne perd pas la demande.
 */
export async function submitPrivacyRequest(input: PrivacyRequestInput) {
  const row = await prisma.privacyRequest.create({
    data: {
      pubgName: input.pubgName,
      kind: input.kind,
      reason: input.reason || null,
      email: input.email,
    },
  })
  const stored = { ...row, kind: row.kind as PrivacyRequestKind }

  await notifyPrivacyRequest({
    id: row.id,
    ...privacyRequestNotification(stored),
    data: { privacyRequestId: row.id, kind: row.kind, pubgName: row.pubgName, email: row.email, reason: row.reason },
  })

  try {
    await sendEmail({ to: CONTACT_EMAIL, ...privacyRequestEmail(stored) })
  } catch (error) {
    console.error(`[privacy-request] E-mail for request ${row.id} not sent:`, error)
  }

  return { id: row.id }
}
