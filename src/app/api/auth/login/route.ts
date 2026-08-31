import { z } from 'zod'

import { authenticateUser } from '@/lib/auth-service'
import { createSession, setSessionCookie } from '@/lib/auth-session'
import { getSetupState } from '@/lib/setup-service'

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(request: Request) {
  try {
    const setupState = await getSetupState()
    if (setupState === 'pending_activation') {
      return Response.json(
        { error: "Initialisation en attente: activez d'abord le compte Owner." },
        { status: 403 }
      )
    }

    const body = (await request.json().catch(() => null)) as unknown
    const validated = LoginSchema.safeParse(body)

    if (!validated.success) {
      return Response.json(
        { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const authenticated = await authenticateUser(validated.data)
    if (!authenticated) {
      return Response.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const { token, expiresAt } = await createSession({
      userId: authenticated.userId,
      activeMemberId: authenticated.defaultMemberId,
    })

    const response = Response.json({
      success: true,
      email: authenticated.email,
      activeMemberId: authenticated.defaultMemberId,
      defaultClanId: authenticated.defaultClanId,
      canSwitchClan: authenticated.canSwitchClan,
    })

    setSessionCookie(response, token, expiresAt)
    return response
  } catch (error) {
    console.error('Login error:', error)
    return Response.json({ error: 'Failed to login' }, { status: 500 })
  }
}
