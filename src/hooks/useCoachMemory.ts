'use client'

import { useCallback, useEffect, useState } from 'react'

import type { CoachMemoryView } from '@/lib/coach/coach-memory'

export type CoachMemoryPayload = { authenticated: boolean; enabled: boolean; memories: CoachMemoryView[]; max: number; retentionDays: number }

/**
 * « Ce que le Coach sait de toi » (docs/TODO/coach-ia-pistes.md §6.2, lot 11) : la mémoire personnelle du compte
 * connecté — lue seulement quand la liste est affichée (`active`), jamais au chargement d'une page ; `forget` efface
 * une ligne, `forgetAll` toutes, `reload` relit (après une réponse qui a pu retenir quelque chose).
 */
export function useCoachMemory(active: boolean) {
  const [payload, setPayload] = useState<CoachMemoryPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetch('/api/coach/memory', { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as CoachMemoryPayload | null
        if (cancelled) return
        if (!response.ok || !body) throw new Error('Mémoire illisible.')
        setPayload(body)
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Mémoire illisible.')
      })
    return () => {
      cancelled = true
    }
  }, [active, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])

  const forget = useCallback(
    async (id: number) => {
      const response = await fetch(`/api/coach/memory/${id}`, { method: 'DELETE' })
      if (response.ok) setPayload((current) => (current ? { ...current, memories: current.memories.filter((memory) => memory.id !== id) } : current))
      return response.ok
    },
    []
  )

  const forgetAll = useCallback(async () => {
    const response = await fetch('/api/coach/memory', { method: 'DELETE' })
    if (response.ok) setPayload((current) => (current ? { ...current, memories: [] } : current))
    return response.ok
  }, [])

  const loading = active && payload === null && error === null
  return { memories: payload?.memories ?? null, max: payload?.max ?? 8, retentionDays: payload?.retentionDays ?? 90, loading, error, reload, forget, forgetAll }
}
