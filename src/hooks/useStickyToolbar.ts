import { useCallback, useRef, useState } from 'react'

/** Émis par le header quand sa hauteur change (il peut passer sur deux lignes). */
export const HEADER_HEIGHT_EVENT = 'pubg-clan-site:header-height'

/** Hauteur courante du header, publiée dans `--app-header-height` (défauts CSS : 73 / 71 px). */
export function readHeaderHeight() {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-height'))
  return Number.isFinite(value) ? value : window.innerWidth >= 1024 ? 71 : 73
}

/**
 * Ref callback à poser sur le header du site : publie sa hauteur réelle dans
 * `--app-header-height` et prévient les bandeaux quand elle change (header sur deux lignes).
 * Ref callback, pour suivre le header même s'il n'apparaît qu'après un chargement.
 */
export function useHeaderHeightPublisher() {
  const cleanupRef = useRef<(() => void) | null>(null)

  return useCallback((node: HTMLElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!node) return

    const publish = () => {
      document.documentElement.style.setProperty('--app-header-height', `${node.offsetHeight}px`)
      window.dispatchEvent(new Event(HEADER_HEIGHT_EVENT))
    }

    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(node)

    cleanupRef.current = () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--app-header-height')
    }
  }, [])
}

/**
 * Détecte le moment où un bandeau doit se docker sous le header — docs/TODO/sticky.md §4.A.
 *
 * Sentinelle invisible + `IntersectionObserver` (jamais d'écoute du défilement). La marge haute
 * de l'observateur suit la hauteur réelle du header, relue à chaque redimensionnement et à chaque
 * changement de hauteur du header.
 *
 * Ref callback plutôt que useRef + useEffect : la sentinelle est souvent rendue derrière un état
 * de chargement, et un effet dont les dépendances ne changent pas ne se relancerait jamais une
 * fois le nœud enfin monté.
 */
export function useStickyToolbar() {
  const [isSticky, setIsSticky] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null

    if (!node) return

    let observer: IntersectionObserver | null = null
    const connect = () => {
      observer?.disconnect()
      observer = new IntersectionObserver(
        ([entry]) => {
          // Docké seulement quand la sentinelle est passée AU-DESSUS du bas du header : une
          // sentinelle encore sous l'écran n'est pas non plus « en intersection ».
          const headerBottom = entry.rootBounds?.top ?? 0
          setIsSticky(!entry.isIntersecting && entry.boundingClientRect.top < headerBottom)
        },
        { threshold: 0, rootMargin: `-${Math.round(readHeaderHeight())}px 0px 0px 0px` }
      )
      observer.observe(node)
    }

    connect()
    window.addEventListener('resize', connect)
    window.addEventListener(HEADER_HEIGHT_EVENT, connect)

    cleanupRef.current = () => {
      observer?.disconnect()
      window.removeEventListener('resize', connect)
      window.removeEventListener(HEADER_HEIGHT_EVENT, connect)
    }
  }, [])

  return { isSticky, sentinelRef }
}
