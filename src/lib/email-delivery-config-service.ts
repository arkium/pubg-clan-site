import { prisma } from '@/lib/prisma'

const EMAIL_DELIVERY_READY_KEY = 'email_delivery_ready'
const EMAIL_DELIVERY_LAST_SUCCESS_AT_KEY = 'email_delivery_last_success_at'
const EMAIL_DELIVERY_LAST_TEST_RECIPIENT_KEY = 'email_delivery_last_test_recipient'
const EMAIL_DELIVERY_LAST_ERROR_KEY = 'email_delivery_last_error'

export type EmailDeliveryStatus = {
  ready: boolean
  lastSuccessAt: string | null
  lastTestRecipient: string | null
  lastError: string | null
}

export const REQUIRED_EMAIL_ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const

export function isEmailEnvComplete() {
  return REQUIRED_EMAIL_ENV_KEYS.every((key) => (process.env[key] ?? '').trim().length > 0)
}

/** « L'email est prêt » : configuration complète et dernier test réussi, sans rien exposer d'autre. */
export async function isEmailDeliveryReady() {
  return isEmailEnvComplete() && (await getEmailDeliveryStatus()).ready
}

function normalizeOptionalValue(value: string | undefined) {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function getEmailDeliveryStatus(): Promise<EmailDeliveryStatus> {
  const records = await prisma.appConfig.findMany({
    where: {
      key: {
        in: [
          EMAIL_DELIVERY_READY_KEY,
          EMAIL_DELIVERY_LAST_SUCCESS_AT_KEY,
          EMAIL_DELIVERY_LAST_TEST_RECIPIENT_KEY,
          EMAIL_DELIVERY_LAST_ERROR_KEY,
        ],
      },
    },
    select: {
      key: true,
      value: true,
    },
  })

  const map = new Map(records.map((record) => [record.key, record.value]))

  return {
    ready: map.get(EMAIL_DELIVERY_READY_KEY) === 'true',
    lastSuccessAt: normalizeOptionalValue(map.get(EMAIL_DELIVERY_LAST_SUCCESS_AT_KEY)),
    lastTestRecipient: normalizeOptionalValue(map.get(EMAIL_DELIVERY_LAST_TEST_RECIPIENT_KEY)),
    lastError: normalizeOptionalValue(map.get(EMAIL_DELIVERY_LAST_ERROR_KEY)),
  }
}

export async function markEmailDeliverySuccess(recipient: string) {
  const now = new Date().toISOString()

  await prisma.$transaction([
    prisma.appConfig.upsert({
      where: { key: EMAIL_DELIVERY_READY_KEY },
      update: { value: 'true' },
      create: { key: EMAIL_DELIVERY_READY_KEY, value: 'true' },
    }),
    prisma.appConfig.upsert({
      where: { key: EMAIL_DELIVERY_LAST_SUCCESS_AT_KEY },
      update: { value: now },
      create: { key: EMAIL_DELIVERY_LAST_SUCCESS_AT_KEY, value: now },
    }),
    prisma.appConfig.upsert({
      where: { key: EMAIL_DELIVERY_LAST_TEST_RECIPIENT_KEY },
      update: { value: recipient },
      create: { key: EMAIL_DELIVERY_LAST_TEST_RECIPIENT_KEY, value: recipient },
    }),
    prisma.appConfig.upsert({
      where: { key: EMAIL_DELIVERY_LAST_ERROR_KEY },
      update: { value: '' },
      create: { key: EMAIL_DELIVERY_LAST_ERROR_KEY, value: '' },
    }),
  ])
}

export async function markEmailDeliveryFailure(message: string) {
  await prisma.$transaction([
    prisma.appConfig.upsert({
      where: { key: EMAIL_DELIVERY_READY_KEY },
      update: { value: 'false' },
      create: { key: EMAIL_DELIVERY_READY_KEY, value: 'false' },
    }),
    prisma.appConfig.upsert({
      where: { key: EMAIL_DELIVERY_LAST_ERROR_KEY },
      update: { value: message.slice(0, 500) },
      create: { key: EMAIL_DELIVERY_LAST_ERROR_KEY, value: message.slice(0, 500) },
    }),
  ])
}

export async function revokeEmailDeliveryValidation() {
  await prisma.$transaction([
    prisma.appConfig.upsert({
      where: { key: EMAIL_DELIVERY_READY_KEY },
      update: { value: 'false' },
      create: { key: EMAIL_DELIVERY_READY_KEY, value: 'false' },
    }),
    prisma.appConfig.upsert({
      where: { key: EMAIL_DELIVERY_LAST_SUCCESS_AT_KEY },
      update: { value: '' },
      create: { key: EMAIL_DELIVERY_LAST_SUCCESS_AT_KEY, value: '' },
    }),
    prisma.appConfig.upsert({
      where: { key: EMAIL_DELIVERY_LAST_TEST_RECIPIENT_KEY },
      update: { value: '' },
      create: { key: EMAIL_DELIVERY_LAST_TEST_RECIPIENT_KEY, value: '' },
    }),
  ])
}
