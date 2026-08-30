'use client'

import { useEffect, useState } from 'react'
import type { NavRole, NavItemDef } from '@/lib/nav-permissions-registry'
import { NAV_REGISTRY } from '@/lib/nav-permissions-registry'

const CACHE_KEY = 'nav_permissions_cache'
const CACHE_TTL_MS = 5 * 60 * 1000

type NavPermissionsData = {
  items: NavItemDef[]
  roles: Record<string, NavRole>
  positions: Record<string, string[]>
  promotedPositions: Record<string, string[]>
  labels: Record<string, string>
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

// NAV_REGISTRY sert de valeur initiale pendant le chargement de l'API
const EMPTY: NavPermissionsData = {
  items: NAV_REGISTRY,
  roles: {},
  positions: {},
  promotedPositions: {},
  labels: {},
}

export function useNavPermissions(): NavPermissionsData {
  const [data, setData] = useState<NavPermissionsData>(() => readCache() ?? EMPTY)

  useEffect(() => {
    invalidateNavPermissionsCache()

    fetch('/api/settings/nav-permissions', { cache: 'no-store' })
      .then((r) => r.json())
      .then((payload: Partial<NavPermissionsData>) => {
        const safe: NavPermissionsData = {
          items: Array.isArray(payload.items) && payload.items.length > 0
            ? payload.items
            : NAV_REGISTRY,
          roles: payload.roles ?? {},
          positions: payload.positions ?? {},
          promotedPositions: payload.promotedPositions ?? {},
          labels: payload.labels ?? {},
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
