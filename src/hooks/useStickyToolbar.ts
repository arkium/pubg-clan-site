import { useCallback, useRef, useState } from 'react'

export function useStickyToolbar(offsets: { desktop: number; mobile: number } = { desktop: 71, mobile: 73 }) {
  const [isSticky, setIsSticky] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  // Ref-callback plutôt que useRef+useEffect : le sentinel est souvent rendu
  // derrière un état de chargement (data encore null au premier rendu), donc
  // un useEffect dont les deps ne changent pas ne se relance jamais une fois
  // le nœud enfin monté. Le ref-callback s'exécute exactement quand le nœud
  // apparaît/disparaît, quel que soit le rendu où ça arrive.
  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      cleanupRef.current?.()
      cleanupRef.current = null

      if (!node) return

      const computeOffset = () => (window.innerWidth >= 1024 ? offsets.desktop : offsets.mobile)
      let observer = new IntersectionObserver(
        ([entry]) => setIsSticky(!entry.isIntersecting),
        { threshold: 0, rootMargin: `-${computeOffset()}px 0px 0px 0px` }
      )
      observer.observe(node)

      const handleResize = () => {
        observer.disconnect()
        observer = new IntersectionObserver(
          ([entry]) => setIsSticky(!entry.isIntersecting),
          { threshold: 0, rootMargin: `-${computeOffset()}px 0px 0px 0px` }
        )
        observer.observe(node)
      }

      window.addEventListener('resize', handleResize)

      cleanupRef.current = () => {
        observer.disconnect()
        window.removeEventListener('resize', handleResize)
      }
    },
    [offsets.desktop, offsets.mobile]
  )

  return { isSticky, sentinelRef }
}
