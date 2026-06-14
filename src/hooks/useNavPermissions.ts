'use client'

import { useEffect, useState } from 'react'
import type { NavRole } from '@/lib/nav-permissions-registry'

const CACHE_KEY = 'nav_permissions_cache'
const CACHE_TTL_MS = 5 * 60 * 1000

type NavPermissionsData = {
  roles: Record<string, NavRole>
  positions: Record<string, string[]>
  labels: Record<string, string>
  targets: Record<string, string>
}

type CacheEntry = {
  ts: number
  data: NavPermissionsData
}

function readCache(): NavPermissionsData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (Date.now() - entry.ts > CACHE_TTL_MS) return null
    return entry.data
  } catch {
    return null
  }
}

function writeCache(data: NavPermissionsData) {
  try {
    const entry: CacheEntry = { ts: Date.now(), data }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry))
  } catch {
    // sessionStorage peut être indisponible
  }
}

export function invalidateNavPermissionsCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}

const EMPTY: NavPermissionsData = { roles: {}, positions: {}, labels: {}, targets: {} }

export function useNavPermissions(): NavPermissionsData {
  const [data, setData] = useState<NavPermissionsData>(() => readCache() ?? EMPTY)

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      setData(cached)
      return
    }

    fetch('/api/settings/nav-permissions')
      .then((r) => r.json())
      .then((payload: NavPermissionsData) => {
        const safe: NavPermissionsData = {
          roles: payload.roles ?? {},
          positions: payload.positions ?? {},
          labels: payload.labels ?? {},
          targets: payload.targets ?? {},
        }
        setData(safe)
        writeCache(safe)
      })
      .catch(() => {
        // Garde les defaults du registry
      })
  }, [])

  return data
}
