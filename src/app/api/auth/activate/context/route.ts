
import { getActivationInviteContext } from '@/lib/auth-service'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')?.trim() ?? ''

  if (!token) {
    return Response.json({ error: 'Activation token is required' }, { status: 400 })
  }

  const context = await getActivationInviteContext(token)
  if (!context) {
    return Response.json({ error: 'Invalid or expired activation token' }, { status: 404 })
  }

  return Response.json({
    success: true,
    requiresLoginEmail: context.requiresLoginEmail,
  })
}