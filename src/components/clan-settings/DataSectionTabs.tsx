'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import MobileDropdownNav from '@/components/ui/MobileDropdownNav'

export type DataSectionTab = { href: string; label: string }

/** Onglets de « Données » d’un clan (docs/TODO/administration.md Q17, Q20), section réservée au SuperUser. */
export function dataSectionTabs(clanId: string | number): DataSectionTab[] {
  const base = `/clans/${clanId}/settings/data`
  return [
    { href: base, label: 'Santé des données' },
    { href: `${base}/state`, label: 'État' },
    { href: `${base}/sessions`, label: 'Soirées' },
    { href: `${base}/errors`, label: 'Erreurs' },
    { href: `${base}/sync`, label: 'Synchronisation' },
    { href: `${base}/recoveries`, label: 'Récupérations' },
  ]
}

/**
 * Navigation entre les onglets de « Données » : soulignement accent dès 768 px, menu déroulant en dessous — jamais de
 * défilement horizontal (charte §6). Un onglet d'outil reste actif sur ses sous-pages (une soirée sous « Soirées »).
 */
export default function DataSectionTabs({ clanId, className = '' }: { clanId: string | number; className?: string }) {
  const pathname = usePathname()
  const tabs = dataSectionTabs(clanId)
  const isActive = (tab: DataSectionTab, index: number) =>
    pathname === tab.href || (index > 0 && pathname.startsWith(`${tab.href}/`))
  const active = tabs.find(isActive) ?? tabs[0]

  return (
    <nav aria-label="Données du clan" className={className}>
      <MobileDropdownNav
        id="data-section-nav"
        label="Données du clan"
        currentLabel={active.label}
        items={tabs.map((tab, index) => ({ key: tab.href, label: tab.label, href: tab.href, active: isActive(tab, index) }))}
        visibilityClass="md:hidden"
      />
      <div className="hidden gap-6 border-b border-gray-200 md:flex">
        {tabs.map((tab, index) => {
          const current = isActive(tab, index)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current ? 'page' : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold transition-colors ${
                current
                  ? 'border-[var(--theme-ui-accent)] text-[var(--theme-ui-accent-text)]'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
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
