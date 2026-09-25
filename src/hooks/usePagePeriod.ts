'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'

import {
  PERIOD_QUERY_PARAM,
  PERIOD_STORAGE_KEY,
  resolvePagePeriod,
  type Period,
} from '@/lib/period'

/**
 * Période d'une page joueur — docs/TODO/sticky.md §4.E.
 *
 * - L'URL fait foi (`?period=`) : lien partagé, bouton retour et rechargement la conservent.
 * - Sinon, la dernière période choisie pendant la visite (`sessionStorage`) pré-remplit la page.
 * - Sinon, le défaut de la page. Une valeur que la page ne propose pas est ignorée.
 *
 * `ready` passe à `true` quand la période est résolue : une page attend ce signal avant de
 * charger ses données, pour ne pas charger d'abord le défaut, puis la période mémorisée.
 * `source` dit d'où vient la période (`url`, `memory`, `default`) : une page rendue côté serveur
 * s'en sert pour reporter dans l'URL une période venue de la mémoire.
 *
 * Changer de période remplace l'URL par `window.history.replaceState`, intégré au routeur de Next.js
 * (`useSearchParams` suit) : ni entrée d'historique, ni rendu serveur, ni remontée de la page. Un
 * `router.replace` recréerait la page — le segment de page dépend des paramètres de recherche — et
 * ses données disparaîtraient le temps du rechargement. Seule une page rendue côté serveur à partir
 * de `?period=` a besoin de ce rendu : elle passe `{ serverRendered: true }`.
 *
 * `useSearchParams` impose une frontière `Suspense` (CLAUDE.md, piège n° 5) : elle est posée par
 * les layouts `clans/[clanId]` et `members/[id]`, et par les pages statiques elles-mêmes.
 */

const STORAGE_EVENT = 'pubg-clan-site:period-memory'

function readMemory(): string | null {
  try {
    return window.sessionStorage.getItem(PERIOD_STORAGE_KEY)
  } catch {
    // Stockage indisponible (navigation privée stricte) : la page retombe sur son défaut.
    return null
  }
}

function subscribeMemory(onChange: () => void) {
  window.addEventListener(STORAGE_EVENT, onChange)
  return () => window.removeEventListener(STORAGE_EVENT, onChange)
}

const subscribeNothing = () => () => {}

export function usePagePeriod<P extends Period>(
  allowed: readonly P[],
  fallback: P,
  options: { serverRendered?: boolean } = {}
) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const urlValue = searchParams.get(PERIOD_QUERY_PARAM)
  const rememberedValue = useSyncExternalStore(subscribeMemory, readMemory, () => null)
  // Faux pendant l'hydratation seulement : la mémoire n'existe pas côté serveur.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false)

  // Choix en cours d'application : l'URL ne reflète la nouvelle période qu'après la navigation.
  // Il ne vaut que tant que l'URL est restée celle d'où le choix a été fait.
  const [pending, setPending] = useState<{ value: P; fromUrl: string | null } | null>(null)

  const resolved = resolvePagePeriod({
    urlValue,
    rememberedValue: hydrated ? rememberedValue : null,
    allowed,
    fallback,
  })
  const period = pending && pending.fromUrl === urlValue ? pending.value : resolved.period
  const ready = resolved.source === 'url' || hydrated

  // Pas de useCallback : le compilateur React mémoïse déjà (react-hooks/preserve-manual-memoization).
  function setPeriod(next: P) {
    setPending({ value: next, fromUrl: urlValue })
    const params = new URLSearchParams(searchParams.toString())
    params.set(PERIOD_QUERY_PARAM, next)
    const url = `${pathname}?${params.toString()}${window.location.hash}`
    if (options.serverRendered) {
      // `scroll: false` : changer de période ne fait pas remonter la page.
      router.replace(url, { scroll: false })
    } else {
      window.history.replaceState(window.history.state, '', url)
    }
    try {
      window.sessionStorage.setItem(PERIOD_STORAGE_KEY, next)
      window.dispatchEvent(new Event(STORAGE_EVENT))
    } catch {
      // Mémoire indisponible : l'URL suffit pour cette page.
    }
  }

  return { period, setPeriod, ready, source: resolved.source }
}
