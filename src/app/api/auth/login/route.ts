import { NextResponse } from 'next/server'
import { z } from 'zod'

import { authenticateUser } from '@/lib/auth-service'
import { createSession, setSessionCookie } from '@/lib/auth-session'

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown
    const validated = LoginSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
        { status: 400 }
      )
    }

    const authenticated = await authenticateUser(validated.data)
    if (!authenticated) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const { token, expiresAt } = await createSession({
      userId: authenticated.userId,
      activeMemberId: authenticated.defaultMemberId,
    })

    const response = NextResponse.json({
      success: true,
      email: authenticated.email,
      activeMemberId: authenticated.defaultMemberId,
    })

    setSessionCookie(response, token, expiresAt)
    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Failed to login' }, { status: 500 })
  }
}
