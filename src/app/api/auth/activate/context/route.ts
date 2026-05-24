import { NextResponse } from 'next/server'

import { getActivationInviteContext } from '@/lib/auth-service'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')?.trim() ?? ''

  if (!token) {
    return NextResponse.json({ error: 'Activation token is required' }, { status: 400 })
  }

  const context = await getActivationInviteContext(token)
  if (!context) {
    return NextResponse.json({ error: 'Invalid or expired activation token' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    requiresLoginEmail: context.requiresLoginEmail,
  })
}