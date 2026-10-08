import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { NavigationTrail } from '@/components/ui/NavigationTrail'

/**
 * Fil d'Ariane et bandeau photo d'une page d'administration, selon la charte (docs/ui/index.html, En-têtes de page) :
 * titre Teko et icône à l'accent en bas à gauche sur un dégradé sombre, pastilles, action principale en verre dépoli en
 * haut à droite. `ClanSettingsBanner` le reprend pour les paramètres d'un clan.
 */
export default function AdminPageBanner({
  title,
  subtitle,
  icon: Icon,
  image,
  imagePosition = 'center 35%',
  currentHref,
  parent,
  pills = [],
  action,
  hideTrail = false,
}: {
  title: string
  subtitle: ReactNode
  icon: LucideIcon
  image: string
  imagePosition?: string
  currentHref: string
  /** Page de retour quand l'historique ne fournit rien. */
  parent: { href: string; label: string; altHref?: string }
  pills?: ReactNode[]
  action?: ReactNode
  /** Page de premier niveau (accueil Plateforme) : le fil d'Ariane est enregistré mais pas affiché. */
  hideTrail?: boolean
}) {
  return (
    <>
      <NavigationTrail currentLabel={title} currentHref={currentHref} fallbackParent={parent} hidden={hideTrail} />
      <header
        className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('${image}')`, backgroundPosition: imagePosition }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        {action ? <div className="absolute right-2 top-2 z-10 sm:right-4 sm:top-4">{action}</div> : null}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-3.5 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 shrink-0 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="t-banner-title text-white drop-shadow-md">{title}</h1>
          </div>
          <p className="text-[13px] text-white/80 drop-shadow-md">{subtitle}</p>
          {pills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-white">
              {pills.map((pill, index) => (
                <span key={index} className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5">
                  {pill}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </header>
    </>
  )
}

/** Bouton d'action du bandeau, en verre dépoli (charte, En-têtes de page). */
export const BANNER_GLASS_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-black/50 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition-colors hover:bg-black/70 disabled:opacity-45 sm:px-3 sm:py-1.5 sm:text-sm'
