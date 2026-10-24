'use client'

import { useCallback, useEffect, useState } from 'react'

import type { CoachQuotaPayload } from '@/lib/coach/coach-quota'

/**
 * Quota du Coach IA du compte connecté (`GET /api/coach/quota`, docs/TODO/chatbot-ia.md §2.2). Lu seulement quand le
 * tiroir est ouvert (`active`) : rien n'est appelé au chargement d'une page. `reload` relit (après un refus),
 * `apply` ajuste le restant après une réponse sans relire.
 */
export function useCoachQuota(active: boolean) {
  const [quota, setQuota] = useState<CoachQuotaPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetch('/api/coach/quota', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as (CoachQuotaPayload & { authenticated?: boolean }) | null
        if (cancelled) return
        if (!response.ok || !payload?.authenticated) {
          setQuota(null)
          setError(response.ok ? null : 'Quota illisible.')
          return
        }
        setQuota(payload)
        setError(null)
      })
      .catch(() => {
        if (!cancelled) setError('Quota illisible.')
      })
    return () => {
      cancelled = true
    }
  }, [active, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])

  const apply = useCallback((patch: Partial<Pick<CoachQuotaPayload, 'remainingHour' | 'monthPercent'>>) => {
    setQuota((current) => (current ? { ...current, ...patch } : current))
  }, [])

  return { quota, error, reload, apply }
}
