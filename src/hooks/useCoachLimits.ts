'use client'

import { useEffect, useState } from 'react'

import type { CoachLimits } from '@/lib/coach/coach-help'

/** Limites chiffrées du Coach IA pour l'aide (`GET /api/coach/limits`, public) ; null tant qu'elles ne sont pas lues. */
export function useCoachLimits(active: boolean): CoachLimits | null {
  const [limits, setLimits] = useState<CoachLimits | null>(null)

  useEffect(() => {
    if (!active) return
    let cancelled = false
    fetch('/api/coach/limits')
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as CoachLimits | null
        if (!cancelled && response.ok && payload && typeof payload.hourlyLimit === 'number') setLimits(payload)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [active])

  return limits
}
