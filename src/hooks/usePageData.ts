'use client'

import { useEffect, useState } from 'react'

/**
 * Lecture d'une route API pour une page à filtres : `loading` tant que la réponse de l'adresse demandée n'est pas
 * arrivée, et `data` garde la **réponse précédente** pendant ce temps — la page l'estompe au lieu de se replier
 * (CLAUDE.md, checklist nouvelle page). `pick` extrait la donnée utile ; fonction pure déclarée au niveau du module.
 */
export function usePageData<T>(url: string | null, pick: (payload: unknown) => T | null) {
  // L'adresse de la dernière réponse reçue : « en chargement » tant qu'elle diffère de l'adresse demandée.
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string }>({ url: null, data: null, error: '' })

  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url, { cache: 'no-store' })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null)
        if (!response.ok) throw new Error('Chargement impossible.')
        if (!cancelled) setState({ url, data: pick(payload), error: '' })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setState({ url, data: null, error: caught instanceof Error ? caught.message : 'Chargement impossible.' })
      })
    return () => {
      cancelled = true
    }
    // `pick` est une fonction pure déclarée au niveau du module : seule l'adresse compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const loading = url === null || state.url !== url
  return { data: state.data, loading, error: loading ? '' : state.error }
}
