import { NextResponse } from 'next/server'

import { listLinkedMembers } from '@/lib/auth-service'
import { getSessionFromRequest } from '@/lib/auth-session'

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  const linkedMembers = await listLinkedMembers(session.userId)

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.userId,
      email: session.email,
    },
    activeMemberId: session.activeMemberId,
    members: linkedMembers
      .filter((identity) => identity.member.isActive)
      .map((identity) => ({
        memberId: identity.member.id,
        displayName: identity.member.displayName,
        clanId: identity.member.clanId,
        clan: identity.member.clan,
      })),
  })
}
