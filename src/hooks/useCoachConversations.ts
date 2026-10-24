'use client'

import { useCallback, useEffect, useState } from 'react'

import type { CoachConversationSummary, CoachConversationView } from '@/lib/coach/coach-conversation-service'

/**
 * Fils du Coach IA du compte connecté (docs/TODO/chatbot-ia.md §7.1) : liste, lecture, renommage, suppression. La liste
 * n'est lue que lorsqu'elle est affichée (`active`) ; `reload` la relit. Aucun appel au chargement d'une page.
 */
export function useCoachConversations(active: boolean) {
  const [conversations, setConversations] = useState<CoachConversationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetch('/api/coach/conversations', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as { conversations?: CoachConversationSummary[] } | null
        if (cancelled) return
        if (!response.ok) throw new Error('Fils illisibles.')
        setConversations(payload?.conversations ?? [])
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Fils illisibles.')
      })
    return () => {
      cancelled = true
    }
  }, [active, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])

  const load = useCallback(async (id: number): Promise<CoachConversationView | null> => {
    const response = await fetch(`/api/coach/conversations/${id}`, { cache: 'no-store' })
    if (!response.ok) return null
    return (await response.json().catch(() => null)) as CoachConversationView | null
  }, [])

  const rename = useCallback(
    async (id: number, title: string) => {
      const response = await fetch(`/api/coach/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (response.ok) reload()
      return response.ok
    },
    [reload]
  )

  const remove = useCallback(
    async (id: number) => {
      const response = await fetch(`/api/coach/conversations/${id}`, { method: 'DELETE' })
      if (response.ok) reload()
      return response.ok
    },
    [reload]
  )

  const loading = active && conversations === null && error === null
  return { conversations, loading, error, reload, load, rename, remove }
}
