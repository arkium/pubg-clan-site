'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const SELECTED_CLAN_STORAGE_KEY = 'selectedClanId'
const CLAN_SWITCH_ALLOWED_STORAGE_KEY = 'canSwitchClan'
const SELECTED_CLAN_EVENT_NAME = 'selected-clan-changed'

function parseClanId(value: string | null) {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function getStoredClanId() {
  if (typeof window === 'undefined') {
    return null
  }

  return parseClanId(window.localStorage.getItem(SELECTED_CLAN_STORAGE_KEY))
}

function canSwitchClanFromStorage() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(CLAN_SWITCH_ALLOWED_STORAGE_KEY) === '1'
}

interface UseSelectedClanOptions {
  redirectIfMissing?: boolean
  redirectPath?: string
}

export function useSelectedClan(options?: UseSelectedClanOptions) {
  const { redirectIfMissing = false, redirectPath = '/clans' } = options ?? {}
  const router = useRouter()
  const pathname = usePathname()
  const [clanId, setClanIdState] = useState<number | null>(null)
  const [canSwitchClan, setCanSwitchClanState] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function hydrateClanSelection() {
      const storedClanId = getStoredClanId()
      const switchAllowed = canSwitchClanFromStorage()

      if (!cancelled) {
        setCanSwitchClanState(switchAllowed)
      }

      try {
        const modeResponse = await fetch('/api/auth/mode', { cache: 'no-store' })
        const modePayload = (await modeResponse.json().catch(() => null)) as
          | { authDisabled?: boolean }
          | null
        if (!cancelled && modePayload?.authDisabled) {
          window.localStorage.setItem(CLAN_SWITCH_ALLOWED_STORAGE_KEY, '1')
          setCanSwitchClanState(true)
        }
      } catch {
        // Ignore — falls back to the stored switch flag.
      }

      if (storedClanId) {
        if (!cancelled) {
          setClanIdState(storedClanId)
          setHydrated(true)
        }
        return
      }

      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' })
        if (!response.ok) {
          return
        }

        const payload = (await response.json().catch(() => null)) as
          | {
              activeMemberId?: number | null
              members?: Array<{ memberId: number; clanId: number | null }>
            }
          | null

        const members = Array.isArray(payload?.members) ? payload.members : []
        const activeMemberId = payload?.activeMemberId ?? null
        const fallbackClanId =
          members.find((member) => member.memberId === activeMemberId)?.clanId ??
          members.find((member) => member.clanId !== null)?.clanId ??
          null

        if (fallbackClanId && !cancelled) {
          window.localStorage.setItem(SELECTED_CLAN_STORAGE_KEY, String(fallbackClanId))
          setClanIdState(fallbackClanId)
        }
      } catch {
        // Ignore session bootstrap errors.
      } finally {
        if (!cancelled) {
          setHydrated(true)
        }
      }
    }

    void hydrateClanSelection()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === SELECTED_CLAN_STORAGE_KEY) {
        setClanIdState(parseClanId(event.newValue))
      }

      if (event.key === CLAN_SWITCH_ALLOWED_STORAGE_KEY) {
        setCanSwitchClanState(event.newValue === '1')
      }
    }

    function onSelectedClanChanged(event: Event) {
      const detail = (event as CustomEvent<number | null>).detail
      setClanIdState(detail ?? null)
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener(SELECTED_CLAN_EVENT_NAME, onSelectedClanChanged)

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(SELECTED_CLAN_EVENT_NAME, onSelectedClanChanged)
    }
  }, [])

  useEffect(() => {
    if (!hydrated || !redirectIfMissing || clanId !== null || pathname === redirectPath) {
      return
    }

    router.replace(redirectPath)
  }, [clanId, hydrated, pathname, redirectIfMissing, redirectPath, router])

  const setClanId = useCallback((nextClanId: number) => {
    if (typeof window === 'undefined') {
      return false
    }

    const currentClanId = parseClanId(window.localStorage.getItem(SELECTED_CLAN_STORAGE_KEY))
    const canSwitchClan = canSwitchClanFromStorage()

    if (!canSwitchClan && currentClanId !== nextClanId) {
      return false
    }

    window.localStorage.setItem(SELECTED_CLAN_STORAGE_KEY, String(nextClanId))
    window.sessionStorage.removeItem('pubg-nav-stack')
    window.dispatchEvent(
      new CustomEvent<number>(SELECTED_CLAN_EVENT_NAME, { detail: nextClanId })
    )
    return true
  }, [])

  const syncCanSwitchClan = useCallback((allowed: boolean) => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(CLAN_SWITCH_ALLOWED_STORAGE_KEY, allowed ? '1' : '0')
    setCanSwitchClanState(allowed)
  }, [])

  const clearClanId = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.removeItem(SELECTED_CLAN_STORAGE_KEY)
    window.sessionStorage.removeItem('pubg-nav-stack')
    window.dispatchEvent(
      new CustomEvent<number | null>(SELECTED_CLAN_EVENT_NAME, { detail: null })
    )
  }, [])

  return {
    clanId,
    hydrated,
    canSwitchClan,
    setClanId,
    clearClanId,
    syncCanSwitchClan,
  }
}
