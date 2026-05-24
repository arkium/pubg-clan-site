'use client'

import { useCallback, useEffect, useState } from 'react'

type SessionMember = {
  memberId: number
  displayName: string
  clanId: number | null
  clan: {
    id: number
    name: string
    tag: string
  } | null
}

type AuthSessionState = {
  loading: boolean
  authenticated: boolean
  email: string | null
  activeMemberId: number | null
  permissions: string[]
  members: SessionMember[]
}

const INITIAL_STATE: AuthSessionState = {
  loading: true,
  authenticated: false,
  email: null,
  activeMemberId: null,
  permissions: [],
  members: [],
}

export function useAuthSession() {
  const [state, setState] = useState<AuthSessionState>(INITIAL_STATE)

  const refresh = useCallback(async () => {
    async function resetToLoggedOut(clearCookie: boolean) {
      if (clearCookie) {
        await fetch('/api/auth/logout', {
          method: 'POST',
        }).catch(() => undefined)
      }

      setState({ ...INITIAL_STATE, loading: false })
    }

    try {
      const response = await fetch('/api/auth/session', {
        cache: 'no-store',
      })

      if (!response.ok) {
        await resetToLoggedOut(response.status === 401)
        return
      }

      const data = (await response.json()) as {
        authenticated: boolean
        user: { email: string }
        activeMemberId: number | null
        permissions?: string[]
        members: SessionMember[]
      }

      setState({
        loading: false,
        authenticated: data.authenticated,
        email: data.user.email,
        activeMemberId: data.activeMemberId,
        permissions: Array.isArray(data.permissions) ? data.permissions : [],
        members: data.members,
      })
    } catch {
      await resetToLoggedOut(false)
    }
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [refresh])

  return {
    ...state,
    refresh,
  }
}
