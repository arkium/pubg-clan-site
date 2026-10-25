import { AlertCircle, ChevronDown, HelpCircle, Sparkles, ThumbsUp, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { COACH_HELP_IMPROVE, COACH_HELP_MEMORY_TIP, coachHelpDomains, coachHelpLimits, type CoachLimits } from '@/lib/coach/coach-help'

/**
 * « Ce qu'il sait faire, ses limites, comment l'améliorer » (demande du 2026-10-25). Même contenu, deux habillages :
 * - `variant="card"` (carte « Coach IA » de `/account`) : domaines en liste sans exemples, trois blocs repliables à
 *   chevron (`<details>`), fermés par défaut ;
 * - `variant="page"` (page plein écran du Coach) : une seule barre « Comment ça marche ? » avec « Afficher » à droite,
 *   qui déplie les trois blocs d'un coup — un bloc par domaine avec ses questions d'exemple.
 * Source : `src/lib/coach/coach-help.ts` ; patron du repli : `ClanSyncPanel`.
 */
export default function CoachHelp({ variant, memoryEnabled = false, limits = null }: { variant: 'card' | 'page'; memoryEnabled?: boolean; limits?: CoachLimits | null }) {
  const domains = coachHelpDomains(memoryEnabled)
  const improve = memoryEnabled ? [...COACH_HELP_IMPROVE, COACH_HELP_MEMORY_TIP] : COACH_HELP_IMPROVE
  // Limites chiffrées dès que les réglages sont lus ; la ligne sur la mémoire ne suit que l'ouverture réelle.
  const limitRows = coachHelpLimits(limits ? { ...limits, memoryEnabled } : null)
  const collapsible = variant === 'card'

  const blocks = (
    <div className={`coach-help coach-help--${variant}`} data-testid={variant === 'page' ? 'coach-help-blocks' : 'coach-help'}>
      <HelpBlock icon={Sparkles} title="Ce qu’il sait faire" collapsible={collapsible} testId={`coach-help-can-${variant}`}>
        {variant === 'page' ? (
          <div className="coach-help-domains">
            {domains.map((domain) => (
              <div key={domain.id} className="coach-help-domain">
                <div className="t-label">{domain.title}</div>
                <ul className="coach-help-examples">
                  {domain.examples.map((example) => (
                    <li key={example}>« {example} »</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="coach-help-list">
            {domains.map((domain) => (
              <li key={domain.id}>{domain.title}</li>
            ))}
          </ul>
        )}
      </HelpBlock>

      <HelpBlock icon={AlertCircle} title="Ses limites" collapsible={collapsible} testId={`coach-help-limits-${variant}`}>
        <ul className="coach-help-list" data-testid="coach-help-limit-rows">
          {limitRows.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </HelpBlock>

      <HelpBlock icon={ThumbsUp} title="Pour l’améliorer" collapsible={collapsible} testId={`coach-help-improve-${variant}`}>
        <ul className="coach-help-list">
          {improve.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </HelpBlock>
    </div>
  )

  if (variant === 'card') return blocks

  return (
    <details className="coach-help-group" data-testid="coach-help">
      <summary className="coach-help-group-title">
        <HelpCircle className="h-5 w-5" aria-hidden="true" />
        <span>Comment ça marche ?</span>
        <span className="coach-help-group-toggle">
          <span className="coach-help-when-closed">Afficher</span>
          <span className="coach-help-when-open">Masquer</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </span>
      </summary>
      <div className="coach-help-group-body">{blocks}</div>
    </details>
  )
}

/** Un bloc : repliable (résumé à chevron, fermé par défaut) ou toujours ouvert quand la barre du dessus fait le repli. */
function HelpBlock({ icon: Icon, title, collapsible, testId, children }: { icon: LucideIcon; title: string; collapsible: boolean; testId: string; children: ReactNode }) {
  if (!collapsible) {
    return (
      <section className="coach-help-block" aria-labelledby={testId} data-testid={testId}>
        <h3 id={testId} className="coach-help-title coach-help-title--static">
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span>{title}</span>
        </h3>
        <div className="coach-help-body">{children}</div>
      </section>
    )
  }
  return (
    <details className="coach-help-block" data-testid={testId}>
      <summary className="coach-help-title">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{title}</span>
        <ChevronDown className="coach-help-chevron h-4 w-4" aria-hidden="true" />
      </summary>
      <div className="coach-help-body">{children}</div>
    </details>
  )
}
