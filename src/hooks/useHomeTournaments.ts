'use client'

import { useEffect, useState } from 'react'

import type { HomeTournamentsPayload } from '@/lib/home-tournaments'

/**
 * Tournois de la vitrine (`GET /api/home/tournaments`). `enabled` : la route n'est ouverte qu'avec une session ou en
 * mode visiteur — sans l'un ni l'autre, rien n'est demandé. Une lecture en échec laisse `data` à `null` : la vitrine
 * masque alors ses tournois sans afficher d'erreur.
 */
export function useHomeTournaments(enabled: boolean) {
  const [data, setData] = useState<HomeTournamentsPayload | null>(null)
  const [loading, setLoading] = useState(enabled)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()

    async function fetchTournaments() {
      try {
        const response = await fetch('/api/home/tournaments', { cache: 'no-store', signal: controller.signal })
        if (!response.ok) return
        setData((await response.json()) as HomeTournamentsPayload)
      } catch {
        // Vitrine : un échec ne s'affiche pas, la section disparaît simplement.
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void fetchTournaments()
    return () => controller.abort()
  }, [enabled])

  return { data, loading: enabled && loading }
}
