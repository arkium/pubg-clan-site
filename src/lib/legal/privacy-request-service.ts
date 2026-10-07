import { sendEmail } from '@/lib/email-service'
import { CONTACT_EMAIL } from '@/lib/legal/legal-info'
import {
  privacyRequestDeadline,
  privacyRequestEmail,
  privacyRequestNotification,
  type PrivacyRequestInput,
  type PrivacyRequestKind,
  type PrivacyRequestStatus,
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

/** Liste pour l'administration : les demandes en attente d'abord, les plus anciennes en tête (échéance la plus proche). */
export async function listPrivacyRequests(filter: 'pending' | 'all') {
  const rows = await prisma.privacyRequest.findMany({
    where: filter === 'pending' ? { status: 'pending' } : undefined,
    orderBy: [{ createdAt: 'asc' }],
    take: 500,
  })
  const counts = await prisma.privacyRequest.groupBy({ by: ['status'], _count: { _all: true } })
  return {
    requests: rows.map((row) => ({ ...row, deadline: privacyRequestDeadline(row.createdAt) })),
    counts: Object.fromEntries(counts.map((entry) => [entry.status, entry._count._all])) as Record<string, number>,
  }
}

/** Clôt (`done`, `rejected`) ou rouvre (`pending`) une demande ; renvoie `null` si elle n'existe pas. */
export async function setPrivacyRequestStatus(id: number, status: PrivacyRequestStatus) {
  const existing = await prisma.privacyRequest.findUnique({ where: { id }, select: { id: true } })
  if (!existing) return null
  return prisma.privacyRequest.update({
    where: { id },
    data: { status, handledAt: status === 'pending' ? null : new Date() },
  })
}
