'use client'

import { Check, CircleX, Loader2, Play, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { formatEur, formatUsdPerM, INT } from '@/components/settings/coach/CoachAdminShared'
import { coachTestSummary, type CoachModelTestResult } from '@/lib/coach/coach-admin-report'
import { estimatedCoachCostPerQuestionEur } from '@/lib/coach/coach-cost'
import { COACH_MODELS, coachModelBadges, coachModelPriceAt } from '@/lib/coach/coach-models'

/**
 * Tuiles radio du choix de modèle (docs/ui/index.html §44, « choix du modèle ») : jamais un `<select>` natif. Chaque
 * tuile : nom, identifiant, prix d'entrée et de sortie, coût estimé par question au taux courant, plafond de sortie,
 * pastilles de statut, note de l'essai, bouton « Tester » et son résultat sous la tuile.
 */
export default function CoachModelTiles({
  value,
  onChange,
  usdEurRate,
  disabled = false,
  canTest,
  onTest,
}: {
  value: string
  onChange: (modelId: string) => void
  usdEurRate: number
  disabled?: boolean
  /** Sans clé, « Tester » ne sert à rien. */
  canTest: boolean
  onTest: (modelId: string) => Promise<CoachModelTestResult>
}) {
  const [results, setResults] = useState<Record<string, CoachModelTestResult | 'running'>>({})
  const now = new Date()

  async function runTest(modelId: string) {
    setResults((current) => ({ ...current, [modelId]: 'running' }))
    const result = await onTest(modelId)
    setResults((current) => ({ ...current, [modelId]: result }))
  }

  return (
    <div className="coach-models" role="radiogroup" aria-label="Modèle du Coach IA" data-testid="coach-models">
      {COACH_MODELS.map((model) => {
        const checked = model.id === value
        const price = coachModelPriceAt(model, now)
        const badges = coachModelBadges(model, now)
        const result = results[model.id]
        const summary = result && result !== 'running' ? coachTestSummary(result) : null
        const SummaryIcon = summary?.tone === 'pos' ? Check : summary?.tone === 'warn' ? TriangleAlert : CircleX
        return (
          <div
            key={model.id}
            role="radio"
            aria-checked={checked}
            aria-disabled={disabled || undefined}
            tabIndex={0}
            className="coach-model"
            data-testid={`coach-model-${model.id}`}
            onClick={() => {
              if (!disabled) onChange(model.id)
            }}
            onKeyDown={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault()
                if (!disabled) onChange(model.id)
              }
            }}
          >
            <div className="coach-model-head">
              <span className="t-card-title">{model.label}</span>
              <button
                type="button"
                className="app-btn app-btn--sm app-btn--secondary gap-1"
                disabled={!canTest || result === 'running'}
                title={canTest ? 'Une question minuscule avec un outil, facturée à ton compte' : 'Clé absente : rien à tester'}
                onClick={(event) => {
                  event.stopPropagation()
                  void runTest(model.id)
                }}
              >
                {result === 'running' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                {result === 'running' ? 'Test…' : 'Tester'}
              </button>
            </div>
            <span className="coach-model-id">{model.id}</span>
            <span className="coach-model-prices">
              <span>Entrée {formatUsdPerM(price.inputUsdPerM)}</span>
              <span>Sortie {formatUsdPerM(price.outputUsdPerM)}</span>
              <span>≈ {formatEur(estimatedCoachCostPerQuestionEur(model, usdEurRate, now), true)} / question</span>
              <span>{INT.format(model.maxOutputTokens)} tokens de sortie</span>
            </span>
            {badges.length > 0 ? (
              <span className="coach-pills">
                {badges.map((badge) => (
                  <span key={badge.label} className={`coach-pill coach-pill--${badge.tone}`}>
                    {badge.label}
                  </span>
                ))}
              </span>
            ) : null}
            {model.note ? <p className="coach-model-note">{model.note}</p> : null}
            {summary ? (
              <span className={`coach-test t-${summary.tone}`} role="status" data-testid={`coach-model-test-${model.id}`}>
                <SummaryIcon className="coach-ico" aria-hidden="true" />
                {summary.text}
              </span>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
