import { Suspense } from 'react'

/**
 * Frontière Suspense des pages de clan : elles lisent `?period=` par `useSearchParams`
 * (`usePagePeriod`, docs/TODO/sticky.md §4.E), ce qui en exige une (CLAUDE.md, piège n° 5).
 * Ces routes sont dynamiques : rien ne suspend en pratique, la frontière n'est qu'un filet.
 */
export default function ClanSegmentLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>
}
