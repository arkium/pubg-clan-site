import { z } from 'zod'

import { initializeFirstRun, isFirstRun } from '@/lib/setup-service'

const SetupSchema = z.object({
  displayName: z.string().trim().min(1, 'Display name is required'),
  pubgPlayerName: z.string().trim().min(1, 'PUBG player name is required'),
  platformShard: z.string().trim().min(1).default('steam'),
  email: z.string().email('Invalid email address'),
})

export async function POST(request: Request) {
  try {
    if (!(await isFirstRun())) {
      return Response.json({ error: 'Setup already completed' }, { status: 409 })
    }

    const body = (await request.json().catch(() => null)) as unknown
    const parsed = SetupSchema.safeParse(body)

    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const result = await initializeFirstRun(parsed.data)

    return Response.json({
      success: true,
      clan: result.member.clan,
      member: {
        id: result.member.id,
        displayName: result.member.displayName,
        pubgPlayerName: result.member.pubgPlayerName,
      },
      invite: {
        inviteId: result.invite.inviteId,
        expiresAt: result.invite.expiresAt,
        activationUrl: result.invite.activationUrl,
      },
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'PUBG player not found') {
        return Response.json({ error: error.message }, { status: 404 })
      }

      if (error.message === 'Member already exists for this PUBG name and platform') {
        return Response.json({ error: error.message }, { status: 409 })
      }

      if (error.message === 'Setup already completed') {
        return Response.json({ error: error.message }, { status: 409 })
      }

      return Response.json({ error: error.message }, { status: 400 })
    }

    console.error('First-run setup failed:', error)
    return Response.json({ error: 'Failed to initialize setup' }, { status: 500 })
  }
}
