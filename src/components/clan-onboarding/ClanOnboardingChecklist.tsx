'use client'

import { CheckCircle2, CircleDot, Clock3, Lock, Play, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { ButtonSpinner, Tag, toneStyle, type Tone } from '@/components/ui/CharteKit'
import type { ClanOnboarding, OnboardingAction, OnboardingStep, OnboardingStepStatus } from '@/lib/clan-onboarding/build'

/**
 * Checklist de mise en route d'un clan (`GET /api/settings/clans/[id]/onboarding`, `src/lib/clan-onboarding/`), selon la
 * charte : une ligne par étape, état en pastille, actions en boutons de la charte. Les deux boutons d'action appellent
 * les routes existantes — `cron-control` (synchronisation des matchs) et `telemetry/recoveries` (mise en file) — puis
 * la page relit la checklist.
 */

const STATUS: Record<OnboardingStepStatus, { label: string; tone: Tone; icon: LucideIcon }> = {
  done: { label: 'Fait', tone: 'pos', icon: CheckCircle2 },
  todo: { label: 'À faire', tone: 'warn', icon: CircleDot },
  waiting: { label: 'En cours', tone: 'sky', icon: Clock3 },
  blocked: { label: 'Bloqué', tone: 'neutral', icon: Lock },
}

type Feedback = { tone: 'pos' | 'neg'; text: string }

type RunAction = (step: OnboardingStep, action: Exclude<OnboardingAction, { kind: 'link' }>) => Promise<void>

function StepActions({ step, busy, onRun }: { step: OnboardingStep; busy: boolean; onRun: RunAction }) {
  if (step.actions.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {step.actions.map((action) =>
        action.kind === 'link' ? (
          <Link key={action.href} href={action.href} className="app-btn app-btn--sm app-btn--secondary">
            {action.label}
          </Link>
        ) : (
          <button
            key={action.kind}
            type="button"
            disabled={busy}
            onClick={() => void onRun(step, action)}
            className="app-btn app-btn--sm app-btn--primary gap-1.5"
            data-testid={`onboarding-action-${action.kind}`}
          >
            {busy ? <ButtonSpinner /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
            {action.label}
          </button>
        )
      )}
    </div>
  )
}

type ActionPayload = {
  ok?: boolean
  error?: string
  message?: string
  data?: { queuedCount?: number; alreadyQueuedCount?: number }
} | null

async function post(url: string, body: unknown): Promise<{ ok: boolean; payload: ActionPayload }> {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const payload = (await response.json().catch(() => null)) as ActionPayload
  return { ok: response.ok && payload?.ok !== false, payload }
}

async function runAction(clanId: number, action: Exclude<OnboardingAction, { kind: 'link' }>): Promise<Feedback> {
  if (action.kind === 'sync_matches') {
    const { ok, payload } = await post(`/api/clans/${clanId}/cron-control`, { action: 'sync_matches' })
    return ok ? { tone: 'pos', text: payload?.message ?? 'Synchronisation terminée.' } : { tone: 'neg', text: payload?.error ?? 'L’action a échoué.' }
  }

  // Urgences d'abord : `enqueue_backlog` prend les parties les plus récentes, et laisserait de côté, sur un gros
  // arriéré, celles de 7 à 14 jours que PUBG va effacer ; `enqueue_urgent` les prend de la plus ancienne à la plus récente.
  let queued = 0
  let already = 0
  for (const mode of ['enqueue_urgent', 'enqueue_backlog'] as const) {
    const { ok, payload } = await post(`/api/clans/${clanId}/telemetry/recoveries`, { action: mode })
    if (!ok) return { tone: 'neg', text: payload?.error ?? 'La mise en file a échoué.' }
    queued += payload?.data?.queuedCount ?? 0
    already += payload?.data?.alreadyQueuedCount ?? 0
  }
  return { tone: 'pos', text: `${queued} partie(s) mise(s) en file${already > 0 ? `, ${already} déjà en file` : ''}.` }
}

export default function ClanOnboardingChecklist({ onboarding, onChanged }: { onboarding: ClanOnboarding; onChanged: () => void }) {
  const [busyStep, setBusyStep] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({})

  const run: RunAction = async (step, action) => {
    setBusyStep(step.key)
    try {
      const result = await runAction(onboarding.clan.id, action)
      setFeedback((current) => ({ ...current, [step.key]: result }))
      if (result.tone === 'pos') onChanged()
    } catch {
      setFeedback((current) => ({ ...current, [step.key]: { tone: 'neg', text: 'Le serveur ne répond pas.' } }))
    } finally {
      setBusyStep(null)
    }
  }

  return (
    <ol className="app-panel m-0 flex list-none flex-col p-0" aria-label="Étapes de la mise en route" data-testid="onboarding-steps">
      {onboarding.steps.map((step, index) => {
        const status = STATUS[step.status]
        const Icon = status.icon
        const stepFeedback = feedback[step.key]
        return (
          <li
            key={step.key}
            className="flex items-start gap-3 border-t border-gray-200 px-3.5 py-3.5 first:border-t-0 sm:px-4"
            data-testid="onboarding-step"
            data-key={step.key}
            data-status={step.status}
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" style={toneStyle(status.tone)} aria-hidden="true">
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="t-meta t-num">{index + 1}.</span>
                <h2 className="m-0 text-[14px] font-semibold text-gray-900">{step.title}</h2>
                <Tag tone={status.tone}>{status.label}</Tag>
                {step.optional ? <Tag tone="neutral">Facultatif</Tag> : null}
              </div>
              <p className="t-meta m-0 break-words">{step.detail}</p>
              <StepActions step={step} busy={busyStep === step.key} onRun={run} />
              {stepFeedback ? (
                <p className={`m-0 text-[12px] font-semibold ${stepFeedback.tone === 'pos' ? 't-pos' : 't-neg'}`} role="status">
                  {stepFeedback.text}
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
