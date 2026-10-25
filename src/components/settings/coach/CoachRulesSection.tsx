'use client'

import { Brain, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import { FormFeedback } from '@/components/settings/AdminPageStates'
import { EmptyState, ErrorState, ListSkeleton, SectionCard, Switch, Tag } from '@/components/ui/CharteKit'
import { COACH_RULE_TEXT_MAX, type CoachRulesReport, type CoachRuleView } from '@/lib/coach/coach-rules'

/**
 * Règles apprises du Coach IA (docs/TODO/coach-ia-pistes.md §6.3, lot 10) — section de l'onglet Questions. Une règle est
 * une phrase écrite ici par le SuperUser, au tutoiement et à l'impératif, qui entre dans le prompt de toutes les
 * questions quand l'interrupteur de l'onglet Réglages est ouvert. « En faire une règle » sur un vote « Inexact »
 * pré-remplit le lien vers ce vote, jamais le texte (la note du joueur n'entre pas dans le prompt).
 * Données : GET · POST /api/settings/coach/rules, PATCH · DELETE …/rules/[id].
 */

export type CoachRulePrefill = { messageId: number; token: number }

type WriteResult = { rule?: CoachRuleView; error?: string }

async function write(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<WriteResult> {
  const response = await fetch(url, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const payload = (await response.json().catch(() => null)) as WriteResult | null
  if (!response.ok) return { error: payload?.error ?? 'Enregistrement impossible' }
  return payload ?? {}
}

export default function CoachRulesSection({ prefill }: { prefill: CoachRulePrefill | null }) {
  const [token, setToken] = useState(0)
  const { data, error, loading } = useLifecycleResource<CoachRulesReport>('/api/settings/coach/rules', token)
  const [text, setText] = useState('')
  // « En faire une règle » : le vote d'origine est rattaché tant que ce pré-remplissage n'a pas été détaché ou consommé
  // (dérivé du jeton, sans état posé dans un effet) ; le texte reste à écrire.
  const [clearedToken, setClearedToken] = useState<number | null>(null)
  const fromMessageId = prefill && prefill.token !== clearedToken ? prefill.messageId : null
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ error?: string; success?: string }>({})
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Le pré-remplissage amène la section à l'écran et le curseur dans la saisie.
  useEffect(() => {
    if (!prefill) return
    document.getElementById('coach-rules')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    inputRef.current?.focus()
  }, [prefill])

  const reload = () => setToken((value) => value + 1)

  async function add() {
    if (!text.trim() || saving) return
    setSaving(true)
    setFeedback({})
    const result = await write('/api/settings/coach/rules', 'POST', { text, fromMessageId })
    setSaving(false)
    if (result.error) {
      setFeedback({ error: result.error })
      return
    }
    setText('')
    setClearedToken(prefill?.token ?? null)
    setFeedback({ success: 'Règle ajoutée : elle entre dans le prompt à la prochaine question si l’interrupteur est ouvert.' })
    reload()
  }

  async function patch(id: number, body: { text?: string; enabled?: boolean }) {
    setFeedback({})
    const result = await write(`/api/settings/coach/rules/${id}`, 'PATCH', body)
    if (result.error) setFeedback({ error: result.error })
    else setEditing(null)
    reload()
  }

  async function remove(id: number) {
    setFeedback({})
    const result = await write(`/api/settings/coach/rules/${id}`, 'DELETE')
    if (result.error) setFeedback({ error: result.error })
    setConfirmDelete(null)
    reload()
  }

  if (error && !data) return <ErrorState message={error} onRetry={reload} testId="coach-rules-error" />
  if (!data) return <ListSkeleton rows={3} />

  const full = data.activeCount >= data.maxActive

  return (
    <SectionCard
      id="coach-rules"
      icon={Brain}
      title="Règles apprises"
      meta="Une phrase à l’impératif, au tutoiement, écrite par toi après relecture d’une réponse : elle entre dans le prompt de toutes les questions. Une règle qui corrige une donnée ou un outil est un pansement : corrige l’outil, puis retire-la."
      aside={
        <span className={`t-meta ${loading ? 'opacity-60' : ''}`} data-testid="coach-rules-count">
          {data.activeCount} / {data.maxActive} actives · ≈ {data.promptTokens} tokens par question
          {data.enabled ? '' : ' · hors du prompt (interrupteur fermé, onglet Réglages)'}
        </span>
      }
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="coach-rule-input" className="t-label">
          Nouvelle règle
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            id="coach-rule-input"
            className="app-input min-w-0 flex-1"
            value={text}
            maxLength={COACH_RULE_TEXT_MAX}
            placeholder="Ex. : Un Top 10 n’est pas une victoire."
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void add()
              }
            }}
            data-testid="coach-rules-input"
          />
          <button type="button" className="app-btn app-btn--md app-btn--primary gap-1.5" onClick={() => void add()} disabled={!text.trim() || saving || full} data-testid="coach-rules-add">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Enregistrement…' : 'Ajouter'}
          </button>
        </div>
        <span className="flex flex-wrap items-center gap-2 t-meta">
          <span>
            {text.length} / {COACH_RULE_TEXT_MAX}
          </span>
          {fromMessageId ? (
            <Tag tone="neutral" testId="coach-rules-from">
              <span className="inline-flex items-center gap-1">
                D’après le vote n° {fromMessageId}
                <button type="button" aria-label="Détacher du vote" onClick={() => setClearedToken(prefill?.token ?? null)}>
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            </Tag>
          ) : null}
          {full ? <span className="t-neg">Vingt règles actives : retire ou désactive une règle avant d’en ajouter une.</span> : null}
        </span>
        <FormFeedback error={feedback.error} success={feedback.success} />
      </div>

      {data.rules.length === 0 ? (
        <EmptyState icon={Brain} title="Aucune règle" text="Les votes « Inexact » ci-dessus te diront lesquelles écrire." />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="coach-rules">
          {data.rules.map((rule) => (
            <li key={rule.id} className="app-panel-muted flex flex-wrap items-center gap-2 p-3" data-testid={`coach-rule-${rule.id}`}>
              <Switch checked={rule.enabled} onChange={(enabled) => void patch(rule.id, { enabled })} labelledBy={`coach-rule-text-${rule.id}`} testId={`coach-rule-enabled-${rule.id}`} />
              {editing?.id === rule.id ? (
                <>
                  <input
                    className="app-input min-w-0 flex-1"
                    value={editing.text}
                    maxLength={COACH_RULE_TEXT_MAX}
                    autoFocus
                    onChange={(event) => setEditing({ id: rule.id, text: event.target.value })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void patch(rule.id, { text: editing.text })
                      }
                      if (event.key === 'Escape') setEditing(null)
                    }}
                    aria-label="Texte de la règle"
                  />
                  <button type="button" className="app-btn app-btn--sm app-btn--secondary gap-1" onClick={() => void patch(rule.id, { text: editing.text })}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Enregistrer
                  </button>
                  <button type="button" className="app-btn app-btn--sm app-btn--secondary" onClick={() => setEditing(null)}>
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <span id={`coach-rule-text-${rule.id}`} className={`t-body min-w-0 flex-1 ${rule.enabled ? 'text-gray-900' : 'text-gray-500 line-through'}`} data-testid="coach-rule-text">
                    {rule.text}
                  </span>
                  <span className="t-meta whitespace-nowrap">
                    ≈ {rule.tokens} tokens{rule.fromMessageId ? ` · vote n° ${rule.fromMessageId}` : ''}
                  </span>
                  <button type="button" className="app-btn app-btn--sm app-btn--secondary gap-1" onClick={() => setEditing({ id: rule.id, text: rule.text })} aria-label={`Modifier : ${rule.text}`}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    Modifier
                  </button>
                  {confirmDelete === rule.id ? (
                    <button type="button" className="app-btn app-btn--sm app-btn--danger-solid gap-1" onClick={() => void remove(rule.id)} data-testid={`coach-rule-delete-${rule.id}`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Confirmer la suppression
                    </button>
                  ) : (
                    <button type="button" className="app-btn app-btn--sm app-btn--secondary gap-1" onClick={() => setConfirmDelete(rule.id)} aria-label={`Supprimer : ${rule.text}`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      Supprimer
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
