'use client'

import { useEffect, useState } from 'react'

import type { HomeShowcasePayload } from '@/lib/home-showcase'

/**
 * Données de la vitrine publique de l'accueil (`GET /api/home/showcase`, sans session). `initial` : la vitrine rendue
 * par le serveur quand son cache était prêt (`getHomeShowcaseIfReady`) — affichée d'emblée, puis relue sans état de
 * chargement.
 */
export function useHomeShowcase(initial: HomeShowcasePayload | null = null) {
  const [data, setData] = useState<HomeShowcasePayload | null>(initial)
  const [loading, setLoading] = useState(initial === null)
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
