import Link from 'next/link'
import { House, MapPinOff } from 'lucide-react'

/**
 * Page 404 (adresse inconnue ou `notFound()`), à la charte UI : bandeau d'image standard au titre Teko, chiffre héros,
 * puis les portes de sortie vers les pages publiques. Next.js répond 404 et pose lui-même `noindex`
 * (docs/features/seo.md). Image : `public/404-hors-zone.jpg`, générée par IA (signalé dans les mentions légales).
 */

const EXITS = [
  { href: '/clans', label: 'Les clans' },
  { href: '/clans-leaderboard', label: 'Ligue des clans' },
  { href: '/tournaments', label: 'Tournois' },
  { href: '/carte-des-ressources', label: 'Carte des ressources' },
]

export default function NotFound() {
  return (
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter flex flex-col gap-4">
        {/* Hauteur standard des bandeaux d'image (docs/ui/index.html#en-tetes). */}
        <header
          className="app-on-photo bg-photo-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/404-hors-zone.jpg')`, backgroundPosition: 'center 15%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3 py-2.5 sm:px-5 sm:py-4">
            <span className="t-hero t-hero--lg t-accent leading-none drop-shadow-md">404</span>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <MapPinOff className="h-5 w-5 shrink-0 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title m-0 text-white drop-shadow-md">Hors de la zone</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md sm:text-sm">
              Cette page n’existe pas, ou elle a été déplacée. Ne traîne pas dans le gaz bleu.
            </p>
          </div>
        </header>

        <nav aria-label="Pages pour repartir" className="app-panel flex flex-col gap-3 p-4 sm:p-5">
          <p className="t-body m-0 text-gray-700">Regagne la zone par l’une de ces pages :</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="app-btn app-btn--primary app-btn--md gap-1.5">
              <House className="h-4 w-4" aria-hidden="true" />
              Accueil
            </Link>
            {EXITS.map((exit) => (
              <Link key={exit.href} href={exit.href} className="app-btn app-btn--secondary app-btn--md">
                {exit.label}
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
