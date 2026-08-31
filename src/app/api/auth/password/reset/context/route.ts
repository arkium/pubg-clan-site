
import { getPasswordResetContext } from '@/lib/auth-service'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')?.trim() ?? ''

  if (!token) {
    return Response.json({ error: 'Token requis' }, { status: 400 })
  }

  const context = await getPasswordResetContext(token)
  if (!context) {
    return Response.json({ error: 'Lien invalide ou expiré' }, { status: 404 })
  }

  return Response.json({
    success: true,
    valid: true,
  })
}
