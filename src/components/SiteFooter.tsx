'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { KRAFTON_DISCLAIMER, LEGAL_LINKS, PUBLISHER_NAME, PUBLISHER_URL, SITE_DOMAIN } from '@/lib/legal/legal-info'

const LINK =
  'inline-flex min-h-8 items-center rounded-[6px] t-body transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-ui-accent-ring)]'

/**
 * Contenu du footer (maquette « Pages légales », variante 1a) : une ligne — © Arkium (lien vers arkium.eu), liens
 * légaux, logo texte chickendinner.fr (vers l'accueil) — et la mention KRAFTON dessous. Partagé par le footer du site
 * et celui de la vitrine (`.home-footer`), qui ne diffèrent que par leurs marges : chacun s'aligne sur sa page.
 * docs/features/pages-legales.md.
 */
export function LegalFooterContent({ year }: { year: number }) {
  const pathname = usePathname()

  return (
    // `.charte` : accent jaune de la charte, aussi sur la vitrine (dont l'accent par défaut est l'indigo du thème).
    <div className="charte flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <a href={PUBLISHER_URL} target="_blank" rel="noreferrer" className={`${LINK} t-strong text-gray-900 hover:text-[var(--theme-ui-accent-text)]`}>
          © {year} {PUBLISHER_NAME}
        </a>
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
                        ? 't-strong text-[var(--theme-ui-accent-text)] underline decoration-[var(--theme-ui-accent-ring)] underline-offset-4'
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
        {/* Logo texte du site, comme dans le héros de la vitrine (Teko, « .fr » à l'accent) ; mène à l'accueil. */}
        <Link
          href="/"
          aria-label={`${SITE_DOMAIN}, accueil`}
          className="ml-auto inline-flex min-h-8 items-center rounded-[6px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-ui-accent-ring)]"
        >
          <span className="home-display whitespace-nowrap text-[22px] font-semibold leading-none tracking-[0.02em] text-gray-900">
            chickendinner<span className="text-[var(--theme-ui-accent)]">.fr</span>
          </span>
        </Link>
      </div>
      <p className="t-meta max-w-3xl leading-relaxed">{KRAFTON_DISCLAIMER}</p>
    </div>
  )
}

/** Footer du site, toujours visible ; la vitrine `/` le masque et pose le même contenu dans le sien. */
export default function SiteFooter({ year }: { year: number }) {
  return (
    <footer className="app-footer border-t border-gray-200 bg-white/85 backdrop-blur">
      <div className="app-container app-gutter py-5">
        <LegalFooterContent year={year} />
      </div>
    </footer>
  )
}
