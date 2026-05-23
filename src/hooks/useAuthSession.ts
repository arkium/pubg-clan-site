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
  members: SessionMember[]
}

const INITIAL_STATE: AuthSessionState = {
  loading: true,
  authenticated: false,
  email: null,
  activeMemberId: null,
  members: [],
}

export function useAuthSession() {
  const [state, setState] = useState<AuthSessionState>(INITIAL_STATE)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session', {
        cache: 'no-store',
      })

      if (!response.ok) {
        setState({ ...INITIAL_STATE, loading: false })
        return
      }

      const data = (await response.json()) as {
        authenticated: boolean
        user: { email: string }
        activeMemberId: number | null
        members: SessionMember[]
      }

      setState({
        loading: false,
        authenticated: data.authenticated,
        email: data.user.email,
        activeMemberId: data.activeMemberId,
        members: data.members,
      })
    } catch {
      setState({ ...INITIAL_STATE, loading: false })
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
