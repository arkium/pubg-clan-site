
import { clearSessionCookie, revokeSessionFromRequest } from '@/lib/auth-session'

export async function POST(request: Request) {
  try {
    await revokeSessionFromRequest(request)
  } catch (error) {
    console.error('Logout revoke session failed:', error)
  }

  const response = Response.json({ success: true })
  clearSessionCookie(response)
  return response
}
