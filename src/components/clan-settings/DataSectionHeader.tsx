import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import DataSectionTabs from '@/components/clan-settings/DataSectionTabs'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

/**
 * En-tête des onglets de « Données » d'un clan selon la charte (docs/ui/index.html, En-têtes de page) : fil d'Ariane,
 * bandeau photo (titre Teko, sous-titre, pastilles, action en verre dépoli en haut à droite), puis les onglets.
 */
export default function DataSectionHeader({
  clanId,
  title,
  subtitle,
  icon: Icon,
  currentHref,
  pills = [],
  action,
}: {
  clanId: string | number
  title: string
  subtitle: string
  icon: LucideIcon
  currentHref: string
  pills?: ReactNode[]
  action?: ReactNode
}) {
  return (
    <>
      <NavigationTrail
        currentLabel={title}
        currentHref={currentHref}
        fallbackParent={{ href: `/clans/${clanId}/settings`, label: 'Paramètres du clan', altHref: '/clans' }}
      />
      <header
        className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/matchtelemetry.jpg')`, backgroundPosition: 'center 30%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        {action ? <div className="absolute right-2 top-2 z-10 sm:right-4 sm:top-4">{action}</div> : null}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-3.5 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="t-banner-title text-white drop-shadow-md">{title}</h1>
          </div>
          <p className="text-[13px] text-white/80 drop-shadow-md">{subtitle}</p>
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-white">
            {pills.map((pill, index) => (
              <span key={index} className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5">
                {pill}
              </span>
            ))}
            <span className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5">Réservé au SuperUser</span>
          </div>
        </div>
      </header>
      <DataSectionTabs clanId={clanId} />
    </>
  )
}

/** Bouton d'action du bandeau, en verre dépoli (charte, En-têtes de page). */
export const BANNER_GLASS_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-black/50 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition-colors hover:bg-black/70 disabled:opacity-45 sm:px-3 sm:py-1.5 sm:text-sm'
