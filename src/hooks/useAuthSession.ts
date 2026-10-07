'use client'

import { useCallback, useEffect, useState } from 'react'

import type { OwnerFeatureAccess } from '@/lib/auth/owner-feature-catalog'

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
  isSuperUser: boolean
  /** Délégation aux Owners (docs/TODO/administration.md §5.3) : fonctionnalité → `owner` | `superuser`. */
  ownerFeatures: Record<string, OwnerFeatureAccess> | null
  /** DISABLE_AUTH_PERMISSIONS=true côté serveur — mode visiteur (lecture publique). */
  authDisabled: boolean
}

const INITIAL_STATE: AuthSessionState = {
  loading: true,
  authenticated: false,
  email: null,
  activeMemberId: null,
  permissions: [],
  members: [],
  isSuperUser: false,
  ownerFeatures: null,
  authDisabled: false,
}

export function useAuthSession() {
  const [state, setState] = useState<AuthSessionState>(INITIAL_STATE)

  const refresh = useCallback(async () => {
    const authDisabled = await fetch('/api/auth/mode', { cache: 'no-store' })
      .then((res) => res.json())
      .then((payload: { authDisabled?: boolean }) => payload.authDisabled === true)
      .catch(() => false)

    async function resetToLoggedOut(clearCookie: boolean) {
      if (clearCookie) {
        await fetch('/api/auth/logout', {
          method: 'POST',
        }).catch(() => undefined)
      }

      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pubg-nav-stack')
      }

      setState({ ...INITIAL_STATE, loading: false, authDisabled })
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
        user: { email: string; isSuperUser?: boolean }
        activeMemberId: number | null
        permissions?: string[]
        members: SessionMember[]
        isSuperUser?: boolean
        ownerFeatures?: Record<string, OwnerFeatureAccess>
      }

      if (!data.authenticated) {
        await resetToLoggedOut(true)
        return
      }

      setState({
        loading: false,
        authenticated: data.authenticated,
        email: data.user.email,
        activeMemberId: data.activeMemberId,
        permissions: Array.isArray(data.permissions) ? data.permissions : [],
        members: data.members,
        isSuperUser: data.isSuperUser === true,
        ownerFeatures: data.ownerFeatures ?? null,
        authDisabled,
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
