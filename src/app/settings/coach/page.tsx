'use client'

import { Bot, Brain, KeyRound, Save, SlidersHorizontal, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { FormFeedback } from '@/components/settings/AdminPageStates'
import { formatEur, INT } from '@/components/settings/coach/CoachAdminShared'
import CoachModelTiles from '@/components/settings/coach/CoachModelTiles'
import { Callout, ErrorState, ListSkeleton, SectionCard, Switch, Tag } from '@/components/ui/CharteKit'
import type { CoachAdminState, CoachModelTestResult } from '@/lib/coach/coach-admin-report'
import type { CoachNumericSetting, CoachSettings } from '@/lib/coach/coach-config'
import { coachQuestionsForBudget, estimatedCoachCostPerQuestionEur } from '@/lib/coach/coach-cost'
import { getCoachModel } from '@/lib/coach/coach-models'

/**
 * Réglages du Coach IA (docs/TODO/chatbot-ia.md §9, onglet 1) : interrupteur (enregistré tout de suite), modèle en
 * tuiles radio avec « Tester », budgets et limites en brouillon — « Enregistrer » est le seul bouton rempli de la page.
 * Données : GET / PUT /api/settings/coach ; la clé n'arrive jamais ici, seulement sa présence.
 */

type NumericField = { key: CoachNumericSetting; label: string; unit: string; hint: string }

const FIELDS: NumericField[] = [
  { key: 'budgetPerAccountEur', label: 'Budget par compte', unit: '€ / mois', hint: 'Mois calendaire de Paris ; atteint, le compte attend le 1er.' },
  { key: 'globalBudgetEur', label: 'Plafond global', unit: '€ / mois', hint: 'Tout le site ; atteint, le Coach se ferme à tous sauf à toi. Alerte Discord à 80 %.' },
  { key: 'usdEurRate', label: 'Taux $ → €', unit: '€ pour 1 $', hint: 'Google facture en dollars, les budgets sont en euros.' },
  { key: 'hourlyLimit', label: 'Questions par heure', unit: 'par compte', hint: 'Heure glissante ; toi, tu n’as pas de limite.' },
  { key: 'minIntervalSeconds', label: 'Anti-rafale', unit: 'secondes', hint: 'Délai minimal entre deux questions d’un même compte.' },
  { key: 'maxInputChars', label: 'Longueur d’une question', unit: 'caractères', hint: 'Compteur sous la saisie du tiroir.' },
  { key: 'historyMessages', label: 'Historique renvoyé', unit: 'messages', hint: 'Messages du fil joints à chaque question : plus, c’est plus cher.' },
  { key: 'maxToolRounds', label: 'Tours d’outils', unit: 'par question', hint: 'Au-delà, le modèle conclut avec ce qu’il a.' },
]

type Draft = { model: string } & Record<CoachNumericSetting, string>

function draftOf(settings: CoachSettings): Draft {
  return {
    model: settings.model,
    budgetPerAccountEur: String(settings.budgetPerAccountEur),
    globalBudgetEur: String(settings.globalBudgetEur),
    usdEurRate: String(settings.usdEurRate),
    hourlyLimit: String(settings.hourlyLimit),
    minIntervalSeconds: String(settings.minIntervalSeconds),
    maxInputChars: String(settings.maxInputChars),
    historyMessages: String(settings.historyMessages),
    maxToolRounds: String(settings.maxToolRounds),
  }
}

function changedKeys(draft: Draft, settings: CoachSettings): Array<keyof Draft> {
  const reference = draftOf(settings)
  return (Object.keys(draft) as Array<keyof Draft>).filter((key) => draft[key] !== reference[key])
}

async function putSettings(patch: Record<string, unknown>): Promise<CoachAdminState> {
  const response = await fetch('/api/settings/coach', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings: patch }),
  })
  const payload = (await response.json().catch(() => null)) as (CoachAdminState & { error?: string; errors?: string[] }) | null
  if (!response.ok || !payload) throw new Error(payload?.errors?.join(' ') ?? payload?.error ?? 'Enregistrement impossible')
  return payload
}

export default function CoachSettingsPage() {
  const [state, setState] = useState<CoachAdminState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState('')
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState('')

  // Patron de chargement du dépôt : fonction async déclarée dans l'effet, rechargement par jeton.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoadError('')
        const response = await fetch('/api/settings/coach', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as (CoachAdminState & { error?: string }) | null
        if (!response.ok || !payload) throw new Error(payload?.error ?? 'Lecture des réglages impossible')
        if (!cancelled) {
          setState(payload)
          setDraft(draftOf(payload.settings))
        }
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : 'Lecture des réglages impossible')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const changes = useMemo(() => (state && draft ? changedKeys(draft, state.settings) : []), [draft, state])
  const dirty = changes.length > 0

  const estimate = useMemo(() => {
    if (!draft) return null
    const model = getCoachModel(draft.model)
    const rate = Number(draft.usdEurRate.replace(',', '.'))
    const budget = Number(draft.budgetPerAccountEur.replace(',', '.'))
    if (!model || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(budget)) return null
    const perQuestion = estimatedCoachCostPerQuestionEur(model, rate)
    return { perQuestion, questions: coachQuestionsForBudget(budget, perQuestion) }
  }, [draft])

  function update(changes: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...changes } : current))
    setSaveError('')
    setSaved('')
  }

  async function save() {
    if (!state || !draft || !dirty) return
    setSaving(true)
    setSaveError('')
    try {
      const patch = Object.fromEntries(changes.map((key) => [key, key === 'model' ? draft.model : draft[key].replace(',', '.')]))
      const next = await putSettings(patch)
      setState(next)
      setDraft(draftOf(next.settings))
      setSaved(`Réglages enregistrés (${changes.length > 1 ? `${changes.length} changements` : '1 changement'}).`)
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  // Les trois interrupteurs (Coach, règles apprises, mémoire personnelle) s'enregistrent seuls, tout de suite.
  async function toggle(key: 'enabled' | 'rulesEnabled' | 'memoryEnabled', value: boolean) {
    if (!state) return
    setToggling(true)
    setToggleError('')
    try {
      const next = await putSettings({ [key]: value })
      setState(next)
    } catch (caught) {
      setToggleError(caught instanceof Error ? caught.message : 'Modification impossible')
    } finally {
      setToggling(false)
    }
  }

  async function testModel(modelId: string): Promise<CoachModelTestResult> {
    try {
      const response = await fetch('/api/settings/coach/test-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      })
      const payload = (await response.json().catch(() => null)) as (CoachModelTestResult & { error?: string }) | null
      if (!response.ok || !payload) return { ok: false, model: modelId, durationMs: 0, code: 'internal', message: payload?.error ?? 'Test impossible' }
      return payload
    } catch {
      return { ok: false, model: modelId, durationMs: 0, code: 'network', message: 'Le serveur n’a pas répondu' }
    }
  }

  if (loadError) return <ErrorState message={loadError} onRetry={() => setReloadToken((token) => token + 1)} testId="coach-settings-error" />
  if (!state || !draft) return <ListSkeleton rows={4} />

  const { settings, apiKeyPresent, bounds } = state
  const open = settings.enabled && apiKeyPresent

  return (
    <div className="flex flex-col gap-5" data-testid="coach-settings">
      <SectionCard id="coach-state" icon={Bot} title="Ouverture" meta="Fermé, le Coach ne fait aucun appel au modèle : les membres voient le tiroir en pause.">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2.5">
            <Switch checked={settings.enabled} onChange={(enabled) => void toggle('enabled', enabled)} disabled={toggling} labelledBy="coach-enabled-label" testId="coach-enabled" />
            <span id="coach-enabled-label" className="t-body text-gray-900">
              {toggling ? 'Modification…' : settings.enabled ? 'Ouvert aux membres' : 'Fermé (pause)'}
            </span>
          </div>
          <span className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-gray-500" aria-hidden="true" />
            {apiKeyPresent ? <Tag tone="pos">Clé présente</Tag> : <Tag tone="neg">Clé absente</Tag>}
            <Tag tone={open ? 'pos' : 'neutral'}>{open ? 'En ligne' : 'Hors ligne'}</Tag>
          </span>
        </div>
        <FormFeedback error={toggleError} />
        {!apiKeyPresent ? (
          <Callout tone="warn" icon={KeyRound} title="Clé d’API absente">
            Pose <code className="font-mono">GEMINI_API_KEY</code> dans le <code className="font-mono">.env</code> du serveur (lisible par l’utilisateur des services), puis
            redémarre. Tant qu’elle manque, le Coach reste fermé quel que soit l’interrupteur.
          </Callout>
        ) : null}
      </SectionCard>

      <SectionCard
        id="coach-memory-switches"
        icon={Brain}
        title="Règles apprises et mémoire personnelle"
        meta="Deux fonctions fermées par défaut (docs/TODO/coach-ia-pistes.md §6) : fermées, le prompt est exactement celui d’avant. Chaque interrupteur s’enregistre tout de suite."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Switch checked={settings.rulesEnabled} onChange={(value) => void toggle('rulesEnabled', value)} disabled={toggling} labelledBy="coach-rules-enabled-label" testId="coach-rules-enabled" />
            <span id="coach-rules-enabled-label" className="t-body text-gray-900">
              Règles apprises {settings.rulesEnabled ? 'injectées dans le prompt' : 'gardées, hors du prompt'}
            </span>
            <span className="t-meta">— écrites par toi dans l’onglet Questions, 20 actives au plus (≈ 800 tokens par question au pire).</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Switch checked={settings.memoryEnabled} onChange={(value) => void toggle('memoryEnabled', value)} disabled={toggling} labelledBy="coach-memory-enabled-label" testId="coach-memory-enabled" />
            <span id="coach-memory-enabled-label" className="t-body text-gray-900">
              Mémoire personnelle {settings.memoryEnabled ? 'ouverte aux membres' : 'fermée'}
            </span>
            <span className="t-meta">— ce qu’un joueur demande au Coach de retenir, en ses mots : 8 lignes par compte, 90 jours, visibles et effaçables par lui, jamais lisibles ici.</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        id="coach-model"
        icon={Bot}
        title="Modèle"
        meta="Gemini, en flux. Les prix sont ceux de Google au 24 octobre 2026 ; la réflexion est facturée en sortie. Un changement de modèle s’applique à la prochaine question."
        aside={
          estimate ? (
            <span className="t-meta" data-testid="coach-estimate">
              ≈ {formatEur(estimate.perQuestion, true)} / question · {Number.isFinite(estimate.questions) ? `${INT.format(estimate.questions)} questions` : 'sans limite'} par compte et par mois
            </span>
          ) : undefined
        }
      >
        <CoachModelTiles
          value={draft.model}
          onChange={(model) => update({ model })}
          usdEurRate={Number(draft.usdEurRate.replace(',', '.')) || settings.usdEurRate}
          disabled={saving}
          canTest={apiKeyPresent}
          onTest={testModel}
        />
      </SectionCard>

      <SectionCard id="coach-limits" icon={SlidersHorizontal} title="Budgets et limites" meta="Par compte et pour tout le site ; les nombres hors bornes sont ramenés dans les bornes à l’enregistrement.">
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {FIELDS.map((field) => {
            const bound = bounds[field.key]
            return (
              <div key={field.key} className="flex flex-col gap-1">
                <label htmlFor={`coach-${field.key}`} className="t-label" title={field.hint}>
                  {field.label}
                </label>
                <span className="flex items-center gap-2">
                  <input
                    id={`coach-${field.key}`}
                    type="number"
                    inputMode="decimal"
                    min={bound.min}
                    max={bound.max}
                    step={bound.decimals === 0 ? 1 : 1 / 10 ** bound.decimals}
                    className="app-input w-28"
                    value={draft[field.key]}
                    onChange={(event) => update({ [field.key]: event.target.value } as Partial<Draft>)}
                    data-testid={`coach-field-${field.key}`}
                  />
                  <span className="t-meta whitespace-nowrap">{field.unit}</span>
                </span>
                <span className="t-meta">{field.hint}</span>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4">
          <button type="button" className="app-btn app-btn--md app-btn--primary gap-1.5" onClick={() => void save()} disabled={!dirty || saving} data-testid="coach-save">
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button type="button" className="app-btn app-btn--md app-btn--secondary gap-1.5" onClick={() => update(draftOf(settings))} disabled={!dirty || saving}>
            <Undo2 className="h-4 w-4" aria-hidden="true" />
            Annuler
          </button>
          <span className="t-meta">{dirty ? `${changes.length} ${changes.length > 1 ? 'changements' : 'changement'} non enregistré${changes.length > 1 ? 's' : ''}` : 'Aucun changement en attente'}</span>
        </div>
        <FormFeedback error={saveError} success={saved} />
      </SectionCard>
    </div>
  )
}
