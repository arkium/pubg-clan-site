import { z } from 'zod'

import { createOwnerBootstrapInvite } from '@/lib/auth-service'
import { matchesSecret } from '@/lib/auth/secrets'

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

/**
 * Route publique qui renvoie un lien d'activation Owner : seul un vrai secret l'ouvre. La valeur d'exemple de
 * `.env.example` (en production jusqu'au 2026-10-10) et un secret de moins de 16 caractères la ferment
 * (`src/lib/auth/secrets.ts`) ; comparaison à temps constant.
 */
function hasValidBootstrapSecret(request: Request) {
  return matchesSecret(request.headers.get('x-bootstrap-secret'), process.env.AUTH_BOOTSTRAP_SECRET)
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
