'use client'

import { useEffect, useState } from 'react'

import type { HomeShowcasePayload } from '@/lib/home-showcase'

/** Données de la vitrine publique de l'accueil (`GET /api/home/showcase`, sans session). */
export function useHomeShowcase() {
  const [data, setData] = useState<HomeShowcasePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function fetchShowcase() {
      try {
        const response = await fetch('/api/home/showcase', { cache: 'no-store', signal: controller.signal })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload?.error ?? 'Lecture impossible')
        }
        setData(payload as HomeShowcasePayload)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Lecture impossible')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void fetchShowcase()
    return () => controller.abort()
  }, [])

  return { data, loading, error }
}
