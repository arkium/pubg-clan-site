import { z } from 'zod'

import { activateMemberInvite } from '@/lib/auth-service'
import { createSession, setSessionCookie } from '@/lib/auth-session'

const ActivationSchema = z.object({
  token: z.string().min(1, 'Activation token is required'),
  password: z.string().min(8, 'Password must contain at least 8 characters'),
  displayName: z.string().trim().min(1).max(60).optional(),
  loginEmail: z.string().trim().email('Invalid email address').optional(),
})

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown
    const validated = ActivationSchema.safeParse(body)

    if (!validated.success) {
      return Response.json(
        { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const activated = await activateMemberInvite({
      token: validated.data.token,
      password: validated.data.password,
      displayName: validated.data.displayName,
      loginEmail: validated.data.loginEmail,
    })

    const { token, expiresAt } = await createSession({
      userId: activated.userId,
      activeMemberId: activated.memberId,
    })

    const response = Response.json({
      success: true,
      email: activated.email,
      memberId: activated.memberId,
    })

    setSessionCookie(response, token, expiresAt)
    return response
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    console.error('Activation error:', error)
    return Response.json({ error: 'Failed to activate account' }, { status: 500 })
  }
}
