import { z } from 'zod'

import {
  getEmailDeliveryStatus,
  markEmailDeliveryFailure,
  markEmailDeliverySuccess,
  revokeEmailDeliveryValidation,
} from '@/lib/email-delivery-config-service'
import { sendEmail } from '@/lib/email-service'
import { getSessionFromRequest } from '@/lib/auth-session'
import { getMemberPermissionKeys } from '@/lib/role-service'

const TestEmailSchema = z.object({
  to: z.string().email('Adresse email invalide'),
})

function canReadEmailDeliveryStatus(permissions: string[]) {
  return permissions.includes('*')
}

function canRunEmailDeliveryTest(permissions: string[]) {
  return permissions.includes('*')
}

const REQUIRED_EMAIL_ENV_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const

function maskSensitiveValue(value: string) {
  if (value.length <= 4) {
    return '*'.repeat(value.length)
  }

  return `${'*'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`
}

function readEmailEnvStatus() {
  const items = REQUIRED_EMAIL_ENV_KEYS.map((key) => {
    const raw = process.env[key]
    const normalized = typeof raw === 'string' ? raw.trim() : ''
    const isSet = normalized.length > 0
    const isSensitive = key === 'SMTP_PASS'

    return {
      key,
      isSet,
      isSensitive,
      value: isSet ? (isSensitive ? maskSensitiveValue(normalized) : normalized) : null,
    }
  })

  const missingKeys = items.filter((item) => !item.isSet).map((item) => item.key)

  return {
    allRequiredSet: missingKeys.length === 0,
    missingKeys,
    items,
    example: [
      'SMTP_HOST=smtp.example.com',
      'SMTP_PORT=587',
      'SMTP_USER=apikey_or_username',
      'SMTP_PASS=your_password_or_api_key',
      'SMTP_FROM="PUBG Clan <noreply@example.com>"',
    ].join('\n'),
  }
}

async function getAuthorizedPermissions(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) as Response }
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  return { permissions }
}

export async function GET(request: Request) {
  const auth = await getAuthorizedPermissions(request)
  if (auth.error) {
    return auth.error
  }

  const permissions = auth.permissions
  if (!canReadEmailDeliveryStatus(permissions)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const status = await getEmailDeliveryStatus()
  const env = readEmailEnvStatus()
  const ready = status.ready && env.allRequiredSet

  return Response.json({
    ready,
    lastSuccessAt: status.lastSuccessAt,
    lastTestRecipient: status.lastTestRecipient,
    lastError: status.lastError,
    env,
  })
}

export async function POST(request: Request) {
  const auth = await getAuthorizedPermissions(request)
  if (auth.error) {
    return auth.error
  }

  const permissions = auth.permissions
  if (!canRunEmailDeliveryTest(permissions)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const env = readEmailEnvStatus()
  if (!env.allRequiredSet) {
    return Response.json(
      {
        error: 'Configuration .env incomplete pour email.',
        env,
      },
      { status: 400 }
    )
  }

  const body = (await request.json().catch(() => null)) as unknown
  const validated = TestEmailSchema.safeParse(body)

  if (!validated.success) {
    return Response.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  const recipient = validated.data.to.trim().toLowerCase()

  try {
    const delivery = await sendEmail({
      to: recipient,
      subject: 'Test de configuration email - PUBG Clan Site',
      text: [
        'Cet email confirme que la configuration de livraison email est operationnelle.',
        `Destinataire test: ${recipient}`,
        `Date: ${new Date().toISOString()}`,
      ].join('\n'),
    })

    await markEmailDeliverySuccess(recipient)
    const status = await getEmailDeliveryStatus()
    const currentEnv = readEmailEnvStatus()
    const ready = status.ready && currentEnv.allRequiredSet

    return Response.json({
      success: true,
      message: 'Email de test envoye avec succes.',
      ready,
      lastSuccessAt: status.lastSuccessAt,
      lastTestRecipient: status.lastTestRecipient,
      lastError: status.lastError,
      delivery,
      env: currentEnv,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Echec de l\'envoi de l\'email de test'
    await markEmailDeliveryFailure(message)

    return Response.json({ error: message, ready: false, env }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await getAuthorizedPermissions(request)
  if (auth.error) {
    return auth.error
  }

  const permissions = auth.permissions
  if (!canRunEmailDeliveryTest(permissions)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  await revokeEmailDeliveryValidation()
  const status = await getEmailDeliveryStatus()
  const env = readEmailEnvStatus()
  const ready = status.ready && env.allRequiredSet

  return Response.json({
    success: true,
    message: 'Validation email revoquee.',
    ready,
    lastSuccessAt: status.lastSuccessAt,
    lastTestRecipient: status.lastTestRecipient,
    lastError: status.lastError,
    env,
  })
}
