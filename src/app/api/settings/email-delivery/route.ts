import { z } from 'zod'

import { withAdminActionLog } from '@/lib/admin-action-log'
import {
  getEmailDeliveryStatus,
  markEmailDeliveryFailure,
  markEmailDeliverySuccess,
  REQUIRED_EMAIL_ENV_KEYS,
  revokeEmailDeliveryValidation,
} from '@/lib/email-delivery-config-service'
import { sendEmail } from '@/lib/email-service'
import { requirePlatformAdmin } from '@/lib/auth/admin-guards'

// Configuration SMTP de toute la plateforme : réservée au SuperUser. Les Owners lisent seulement
// « l'email est prêt » par GET /api/clans/[clanId]/settings/email-delivery.

const TestEmailSchema = z.object({
  to: z.string().email('Adresse email invalide'),
})

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

export async function GET(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

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

async function handlePost(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

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

async function handleDelete(request: Request) {
  const denied = await requirePlatformAdmin(request)
  if (denied) return denied

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

export const POST = withAdminActionLog('settings/email-delivery', handlePost)
export const DELETE = withAdminActionLog('settings/email-delivery', handleDelete)
