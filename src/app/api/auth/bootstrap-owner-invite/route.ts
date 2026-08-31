import { z } from 'zod'

import { createOwnerBootstrapInvite } from '@/lib/auth-service'

const BootstrapByClanSchema = z.object({
  clanId: z.number().int().positive('Invalid clanId'),
  email: z.string().email('Invalid email address'),
})

const BootstrapByOwnerPseudoSchema = z.object({
  ownerPlayerName: z.string().trim().min(1, 'ownerPlayerName is required'),
  platformShard: z.string().trim().min(1).optional(),
  email: z.string().email('Invalid email address'),
})

const BootstrapInviteSchema = z.union([BootstrapByClanSchema, BootstrapByOwnerPseudoSchema])

function hasValidBootstrapSecret(request: Request) {
  const configuredSecret = process.env.AUTH_BOOTSTRAP_SECRET
  if (!configuredSecret) {
    return false
  }

  const providedSecret = request.headers.get('x-bootstrap-secret')
  return providedSecret === configuredSecret
}

export async function POST(request: Request) {
  try {
    if (!hasValidBootstrapSecret(request)) {
      return Response.json({ error: 'Unauthorized bootstrap request' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as unknown
    const validated = BootstrapInviteSchema.safeParse(body)

    if (!validated.success) {
      return Response.json(
        { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const result = await createOwnerBootstrapInvite(validated.data)

    return Response.json({
      success: true,
      inviteId: result.inviteId,
      expiresAt: result.expiresAt,
      activationUrl: result.activationUrl,
      ownerMember: {
        id: result.ownerMember.id,
        displayName: result.ownerMember.displayName,
        clan: result.ownerMember.clan,
      },
    })
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    console.error('Bootstrap owner invite error:', error)
    return Response.json({ error: 'Failed to bootstrap owner invite' }, { status: 500 })
  }
}
