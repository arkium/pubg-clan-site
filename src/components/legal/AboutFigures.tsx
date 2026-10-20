import { getHomeShowcaseIfReady } from '@/lib/home-showcase-service'
import { citableSiteSentence, figuresDate } from '@/lib/site-figures'

/**
 * Chiffres vivants de « À propos » (docs/TODO/geo-seo-propositions.md, 4.1 et 4.7), rendus par le serveur et datés.
 * Ils viennent de la vitrine de l'accueil, déjà en cache : mêmes définitions, aucune lecture de plus. Vitrine pas encore
 * prête : rien plutôt qu'un faux zéro (CLAUDE.md, piège n° 13).
 */
export default async function AboutFigures() {
  const showcase = await getHomeShowcaseIfReady()
  if (!showcase) return null

  const date = figuresDate(new Date())
  return (
    <p className="t-body m-0 max-w-[42rem] text-gray-700" data-testid="about-figures">
      {citableSiteSentence(showcase.stats)}{' '}
      <span className="text-gray-500">
        Chiffres du <time dateTime={date.iso}>{date.label}</time>.
      </span>
    </p>
  )
}
