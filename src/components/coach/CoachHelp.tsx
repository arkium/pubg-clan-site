import { AlertCircle, Sparkles, ThumbsUp } from 'lucide-react'

import { COACH_HELP_IMPROVE, COACH_HELP_LIMITS, COACH_HELP_MEMORY_TIP, coachHelpDomains } from '@/lib/coach/coach-help'

/**
 * « Ce qu'il sait faire, ses limites, comment l'améliorer » (demande du 2026-10-25) : même contenu sur la carte de
 * `/account` (`variant="card"`, domaines en liste sans exemples) et sur la page plein écran du Coach (`variant="page"`,
 * un bloc par domaine avec ses questions d'exemple). Source : `src/lib/coach/coach-help.ts`.
 */
export default function CoachHelp({ variant, memoryEnabled = false }: { variant: 'card' | 'page'; memoryEnabled?: boolean }) {
  const domains = coachHelpDomains(memoryEnabled)
  const improve = memoryEnabled ? [...COACH_HELP_IMPROVE, COACH_HELP_MEMORY_TIP] : COACH_HELP_IMPROVE

  return (
    <div className={`coach-help coach-help--${variant}`} data-testid="coach-help">
      <section className="coach-help-block" aria-labelledby={`coach-help-can-${variant}`}>
        <h3 id={`coach-help-can-${variant}`} className="coach-help-title">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Ce qu’il sait faire
        </h3>
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
      </section>

      <section className="coach-help-block" aria-labelledby={`coach-help-limits-${variant}`}>
        <h3 id={`coach-help-limits-${variant}`} className="coach-help-title">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          Ses limites
        </h3>
        <ul className="coach-help-list">
          {COACH_HELP_LIMITS.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </section>

      <section className="coach-help-block" aria-labelledby={`coach-help-improve-${variant}`}>
        <h3 id={`coach-help-improve-${variant}`} className="coach-help-title">
          <ThumbsUp className="h-4 w-4" aria-hidden="true" />
          Pour l’améliorer
        </h3>
        <ul className="coach-help-list">
          {improve.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
