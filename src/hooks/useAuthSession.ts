'use client'

import { useCallback, useEffect, useState } from 'react'

import { useShellBootstrap } from '@/components/ShellBootstrap'
import type { OwnerFeatureAccess } from '@/lib/auth/owner-feature-catalog'
import { bootstrapAuthState } from '@/lib/shell-bootstrap'

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
  // Premier rendu = ce que sait le serveur (src/lib/shell-bootstrap.ts) : le mode visiteur, connu dès le HTML. La session
  // reste en chargement jusqu'à la réponse de l'API.
  const bootstrap = useShellBootstrap()
  const [state, setState] = useState<AuthSessionState>(() => ({ ...INITIAL_STATE, ...bootstrapAuthState(bootstrap) }))
  const serverAuthDisabled = bootstrap?.authDisabled ?? false

  const refresh = useCallback(async () => {
    // Échec de l'appel : la valeur du serveur, pas « authentification exigée » — qui renvoyait un visiteur vers /login
    // (et rendait la page blanche chez Google tant que robots.txt bloquait l'API).
    const authDisabled = await fetch('/api/auth/mode', { cache: 'no-store' })
      .then((res) => res.json())
      .then((payload: { authDisabled?: boolean }) => payload.authDisabled === true)
      .catch(() => serverAuthDisabled)

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

      // 200 sans session : aucun cookie (la route répond 401 à un cookie expiré), donc rien à purger.
      if (!data.authenticated) {
        await resetToLoggedOut(false)
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
  }, [serverAuthDisabled])

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
