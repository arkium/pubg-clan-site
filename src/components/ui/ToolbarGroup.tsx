import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Groupe de contrôles d'un bandeau (`DockingToolbar`) : intitulé au repos seulement — docké, les contrôles restent
 * seuls. `hint` : explication en infobulle, signalée par une icône plutôt qu'un « i » à 9 px (charte : 11 px minimum),
 * et lue par les lecteurs d'écran.
 */
export default function ToolbarGroup({
  label,
  hint,
  showLabel,
  className = '',
  children,
}: {
  label: string
  hint?: string
  showLabel: boolean
  /** Ex. `self-stretch` : le groupe prend la hauteur de la ligne et son contrôle `flex-1` celle des contrôles voisins. */
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`.trim()}>
      {showLabel ? (
        <span className="t-label flex items-center gap-1.5">
          {label}
          {hint ? (
            <span title={hint} className="inline-flex">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">{hint}</span>
            </span>
          ) : null}
        </span>
      ) : null}
      {children}
    </div>
  )
}
