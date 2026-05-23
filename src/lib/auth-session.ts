import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { generateToken, hashToken } from '@/lib/auth-crypto'

const SESSION_COOKIE_NAME = 'pubg_clan_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

function parseCookie(cookieHeader: string | null, key: string) {
  if (!cookieHeader) {
    return null
  }

  for (const part of cookieHeader.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (name === key) {
      return valueParts.join('=')
    }
  }

  return null
}

function buildCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  }
}

export type AuthSessionContext = {
  sessionId: string
  userId: number
  email: string
  activeMemberId: number | null
}

export async function createSession(params: {
  userId: number
  activeMemberId?: number | null
}) {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  const session = await prisma.userSession.create({
    data: {
      userId: params.userId,
      activeMemberId: params.activeMemberId ?? null,
      tokenHash,
      expiresAt,
    },
  })

  return {
    session,
    token,
    expiresAt,
  }
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(SESSION_COOKIE_NAME, token, buildCookieOptions(expiresAt))
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  })
}

export async function revokeSessionByToken(token: string) {
  await prisma.userSession.updateMany({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  })
}

export function getSessionTokenFromRequest(request: Request) {
  const cookieHeader = request.headers.get('cookie')
  return parseCookie(cookieHeader, SESSION_COOKIE_NAME)
}

export async function getSessionFromRequest(request: Request): Promise<AuthSessionContext | null> {
  const token = getSessionTokenFromRequest(request)
  if (!token) {
    return null
  }

  const now = new Date()
  const session = await prisma.userSession.findFirst({
    where: {
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          status: true,
          emailVerifiedAt: true,
        },
      },
      activeMember: {
        select: {
          id: true,
          isActive: true,
        },
      },
    },
  })

  if (!session) {
    return null
  }

  if (session.user.status !== 'active' || !session.user.emailVerifiedAt) {
    return null
  }

  if (session.activeMember && !session.activeMember.isActive) {
    return {
      sessionId: session.id,
      userId: session.user.id,
      email: session.user.email,
      activeMemberId: null,
    }
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    email: session.user.email,
    activeMemberId: session.activeMemberId,
  }
}

export async function revokeSessionFromRequest(request: Request) {
  const token = getSessionTokenFromRequest(request)
  if (!token) {
    return
  }

  await revokeSessionByToken(token)
}
