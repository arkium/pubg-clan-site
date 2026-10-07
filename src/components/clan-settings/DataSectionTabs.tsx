'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type DataSectionTab = { href: string; label: string }

/**
 * Onglets de « Données » d'un clan (docs/TODO/administration.md Q17, Q20) : la liste est calculée côté serveur selon
 * la délégation (santé : `clan-data-health`, outils : `clan-telemetry-tools`) ; ici, seulement l'onglet actif.
 */
export default function DataSectionTabs({ tabs }: { tabs: DataSectionTab[] }) {
  const pathname = usePathname()
  if (tabs.length < 2) return null

  return (
    <nav className="app-container app-gutter pt-6" aria-label="Données du clan">
      <div className="-mb-px flex gap-6 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map((tab, index) => {
          // Un onglet d'outil reste actif sur ses sous-pages (une soirée sous « Soirées »), pas l'onglet d'accueil.
          const isActive = pathname === tab.href || (index > 0 && pathname.startsWith(`${tab.href}/`))
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-[var(--theme-ui-accent)] text-[var(--theme-ui-accent-text)]'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
