'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const SELECTED_CLAN_STORAGE_KEY = 'selectedClanId'
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

interface UseSelectedClanOptions {
  redirectIfMissing?: boolean
  redirectPath?: string
}

export function useSelectedClan(options?: UseSelectedClanOptions) {
  const { redirectIfMissing = false, redirectPath = '/clans' } = options ?? {}
  const router = useRouter()
  const pathname = usePathname()
  const [clanId, setClanIdState] = useState<number | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setClanIdState(getStoredClanId())
      setHydrated(true)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === SELECTED_CLAN_STORAGE_KEY) {
        setClanIdState(parseClanId(event.newValue))
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
      return
    }

    window.localStorage.setItem(SELECTED_CLAN_STORAGE_KEY, String(nextClanId))
    window.dispatchEvent(
      new CustomEvent<number>(SELECTED_CLAN_EVENT_NAME, { detail: nextClanId })
    )
  }, [])

  const clearClanId = useCallback(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.removeItem(SELECTED_CLAN_STORAGE_KEY)
    window.dispatchEvent(
      new CustomEvent<number | null>(SELECTED_CLAN_EVENT_NAME, { detail: null })
    )
  }, [])

  return {
    clanId,
    hydrated,
    setClanId,
    clearClanId,
  }
}
