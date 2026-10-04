'use client'

import { useCallback, useEffect, useState } from 'react'

import type { ResourceMapResponse } from '@/lib/resources/resource-api'

type Viewer = ResourceMapResponse['viewer']

const LOAD_ERROR = 'La carte des ressources n’a pas pu être chargée. Réessaie dans un instant.'

/**
 * Lecture de `GET /api/resources?map=` (contrat : src/lib/resources/resource-api.ts). Pendant le chargement d'une autre
 * carte, `data` garde la **réponse précédente** : la page l'estompe au lieu de se replier. En erreur, `data` est vide
 * (carte sans marqueur) et `error` porte le message. `update` corrige la réponse en place après une action (« Toujours
 * là », proposition, annulation, signalement) ; `viewer` reste celui de la dernière réponse reçue (onglets SuperUser).
 */
export function useResourceMap(mapKey: string) {
  const [state, setState] = useState<{ key: string | null; token: number; data: ResourceMapResponse | null; error: string | null; viewer: Viewer | null }>({
    key: null,
    token: 0,
    data: null,
    error: null,
    viewer: null,
  })
  const [token, setToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/resources?map=${encodeURIComponent(mapKey)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as (ResourceMapResponse & { error?: string }) | null
        if (!response.ok || !payload?.map) throw new Error(LOAD_ERROR)
        setState({ key: mapKey, token, data: payload, error: null, viewer: payload.viewer })
      })
      .catch((caught: unknown) => {
        if (caught instanceof Error && caught.name === 'AbortError') return
        setState((current) => ({ key: mapKey, token, data: null, error: LOAD_ERROR, viewer: current.viewer }))
      })
    return () => controller.abort()
  }, [mapKey, token])

  const update = useCallback((change: (data: ResourceMapResponse) => ResourceMapResponse) => {
    setState((current) => {
      if (!current.data) return current
      const data = change(current.data)
      return { ...current, data, viewer: data.viewer }
    })
  }, [])

  const reload = useCallback(() => setToken((current) => current + 1), [])

  const loading = state.key !== mapKey || state.token !== token
  return { data: state.data, loading, error: loading ? null : state.error, viewer: state.viewer, update, reload }
}

export type ResourceMapQuery = ReturnType<typeof useResourceMap>
