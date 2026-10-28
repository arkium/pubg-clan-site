import { Calculator, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { METHODOLOGY_PATH } from '@/lib/legal/legal-info'

export const CALCULATION_HELP_TITLE = 'Comment c’est calculé ?'

/**
 * « Comment c'est calculé ? » en bas des pages de classement et d'analyse (Ligue, Joueurs, annuaire, comparateur,
 * tournois, carte des ressources, lecture de zone — décision du 2026-10-28) : même barre que « D'où viennent ces
 * chiffres ? » des pages joueur et clan (classes `app-help-bar*` : icône, « Afficher » / « Masquer » et chevron en
 * accent), repliée par défaut mais **dans le HTML** (`<details>`). Les pages joueur et clan gardent leur propre barre.
 *
 * `summary` : le bloc « En bref » rendu par le serveur, rangé sous la méthode (comme celui de la vue d'ensemble d'un
 * clan, docs/TODO/aide-des-pages.md D6) — dans le HTML, liens compris, plus de panneau propre.
 *
 * Sans hook : rendue par une page client. `open` + `onToggle` la pilotent quand la page l'ouvre elle-même (lien
 * « Comment c'est calculé » du haut de la page Joueurs) ; sinon elle s'ouvre et se ferme seule.
 */
export default function CalculationHelp({
  children,
  summary,
  methodologyHref = METHODOLOGY_PATH,
  id,
  open,
  onToggle,
  className = '',
  testId = 'calculation-help',
}: {
  children: ReactNode
  summary?: ReactNode
  methodologyHref?: string
  id?: string
  open?: boolean
  onToggle?: (open: boolean) => void
  className?: string
  testId?: string
}) {
  return (
    <details
      id={id}
      className={`app-help-bar ${className}`.trim()}
      data-testid={testId}
      open={open}
      onToggle={onToggle ? (event) => onToggle((event.currentTarget as HTMLDetailsElement).open) : undefined}
    >
      <summary className="app-help-bar-title">
        <Calculator className="h-5 w-5" aria-hidden="true" />
        <span>{CALCULATION_HELP_TITLE}</span>
        <span className="app-help-bar-toggle">
          <span className="app-help-bar-when-closed">Afficher</span>
          <span className="app-help-bar-when-open">Masquer</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </span>
      </summary>
      <div className="app-help-bar-body">
        <div className="app-help-bar-method">{children}</div>
        {summary ? <div className="app-help-bar-extra">{summary}</div> : null}
        <Link href={methodologyHref} className="app-help-bar-link">
          Méthodologie : comment le site calcule ses chiffres →
        </Link>
      </div>
    </details>
  )
}
