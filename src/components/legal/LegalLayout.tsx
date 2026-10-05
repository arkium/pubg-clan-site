import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { NavigationTrail, type FallbackParent } from '@/components/ui/NavigationTrail'

/**
 * Gabarit des pages légales (maquette « Pages légales », variante 1a « Document ») — docs/features/pages-legales.md.
 * Bandeau d'image au titre Teko, puis sommaire latéral et sections toutes dépliées en `.app-panel` : le texte se lit
 * d'un trait, se cherche (Ctrl+F) et s'imprime. Sous 768 px, le sommaire passe au-dessus des sections.
 */

export type LegalSection = { id: string; title: string; content: ReactNode }

const number = (index: number) => String(index + 1).padStart(2, '0')

export function LegalPageShell({
  label,
  href,
  parent,
  image,
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  label: string
  href: string
  parent: FallbackParent
  image: string
  icon: LucideIcon
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    // `.charte` : page à la charte UI (accent jaune, Teko, classes de rôle) ; `.game-ui` : jetons de jeu (--game-*).
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail currentLabel={label} currentHref={href} fallbackParent={parent} />

        {/* Hauteur standard des bandeaux d'image (docs/ui/index.html#en-tetes). */}
        <header
          className="app-on-photo bg-photo-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('${image}')`, backgroundPosition: 'center 40%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Icon className="h-5 w-5 shrink-0 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title m-0 text-white drop-shadow-md">{title}</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md sm:text-sm">{subtitle}</p>
          </div>
        </header>

        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}

export function LegalDocument({ sections, intro }: { sections: LegalSection[]; intro?: ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] md:gap-6">
      <nav aria-label="Sur cette page" className="md:sticky md:top-[calc(var(--app-header-height)+1rem)] md:self-start md:pt-1">
        <p className="t-label">Sur cette page</p>
        <ol className="mt-1.5 grid sm:grid-cols-2 md:grid-cols-1">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="t-body flex min-h-8 items-center gap-2 rounded-[6px] text-gray-700 transition-colors hover:text-[var(--theme-ui-accent-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-ui-accent-ring)]"
              >
                <span className="t-label t-num">{number(index)}</span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="flex min-w-0 flex-col gap-3">
        {intro}
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-title`} className="app-panel p-4 sm:p-5">
            <h2 id={`${section.id}-title`} className="m-0 flex items-baseline gap-2">
              <span className="t-label t-num">{number(index)}</span>
              <span className="t-section-title">{section.title}</span>
            </h2>
            <div className="mt-3 flex flex-col gap-3">{section.content}</div>
          </section>
        ))}
      </div>
    </div>
  )
}

/** Paragraphe courant, borné pour rester lisible. */
export function LegalText({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <p className={`t-body m-0 max-w-[42rem] ${muted ? 'text-gray-500' : 'text-gray-700'}`}>{children}</p>
}

/** Mention reprise telle quelle (affiliation KRAFTON). */
export function LegalNote({ children }: { children: ReactNode }) {
  return <p className="app-panel-muted t-body m-0 max-w-[42rem] px-3.5 py-3 text-gray-900">{children}</p>
}

/** Intitulé / valeur ; l'intitulé passe au-dessus de sa valeur sous 640 px. */
export function LegalFacts({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="m-0 grid gap-x-6 gap-y-1.5 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col sm:contents">
          <dt className="t-body text-gray-500">{row.label}</dt>
          <dd className="t-body m-0 font-semibold text-gray-900">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
