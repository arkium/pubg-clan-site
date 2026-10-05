'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { KRAFTON_DISCLAIMER, LEGAL_LINKS, PUBLISHER_NAME, PUBLISHER_URL } from '@/lib/legal/legal-info'

const LINK =
  'inline-flex min-h-8 items-center rounded-[6px] t-body transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-ui-accent-ring)]'

/**
 * Footer du site (maquette « Pages légales », variante 1a) : une ligne — ©, liens légaux, arkium.eu — et la mention
 * KRAFTON dessous, toujours visible. La vitrine `/` le masque et porte le sien (`.home-footer`), avec les mêmes liens.
 * docs/features/pages-legales.md.
 */
export default function SiteFooter({ year }: { year: number }) {
  const pathname = usePathname()

  return (
    <footer className="app-footer charte border-t border-gray-200 bg-white/85 backdrop-blur">
      <div className="app-container app-gutter flex flex-col gap-1.5 py-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="t-body font-bold text-gray-900">
            © {year} {PUBLISHER_NAME}
          </span>
          <nav aria-label="Informations légales" className="min-w-0">
            <ul className="flex flex-wrap items-center gap-x-4">
              {LEGAL_LINKS.map((link) => {
                // Une sous-page (Retirer mes données, sous Confidentialité) marque aussi son lien parent.
                const exact = pathname === link.href
                const current = exact || pathname.startsWith(`${link.href}/`)
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={exact ? 'page' : current ? 'true' : undefined}
                      className={`${LINK} ${
                        current
                          ? 'font-semibold text-[var(--theme-ui-accent-text)] underline decoration-[var(--theme-ui-accent-ring)] underline-offset-4'
                          : 'text-gray-700 hover:text-[var(--theme-ui-accent-text)]'
                      }`}
                    >
                      {link.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
          <a href={PUBLISHER_URL} target="_blank" rel="noreferrer" className={`${LINK} ml-auto text-gray-500 hover:text-[var(--theme-ui-accent-text)]`}>
            arkium.eu
          </a>
        </div>
        <p className="t-meta max-w-3xl leading-relaxed">{KRAFTON_DISCLAIMER}</p>
      </div>
    </footer>
  )
}
