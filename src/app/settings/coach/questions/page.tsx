'use client'

import { Check, MessageSquare, ThumbsDown } from 'lucide-react'
import { useState } from 'react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import { DATE_TIME, INT, Kpi } from '@/components/settings/coach/CoachAdminShared'
import { EmptyState, ErrorState, ListSkeleton, SectionCard, Tag } from '@/components/ui/CharteKit'
import type { CoachQuestionsReport } from '@/lib/coach/coach-admin-report'

/**
 * Questions posées au Coach IA (docs/TODO/chatbot-ia.md §9, onglet 3) : fréquences sur 30 jours regroupées par texte
 * normalisé, votes, et chaque vote « Inexact » à relire — date · contexte · clan, jamais le compte. « Relu » sort la
 * réponse de la file. Données : GET /api/settings/coach/questions, POST …/questions/[id]/reviewed.
 */
export default function CoachQuestionsPage() {
  const [token, setToken] = useState(0)
  const { data, error, loading } = useLifecycleResource<CoachQuestionsReport>('/api/settings/coach/questions', token)
  const [reviewed, setReviewed] = useState<Set<number>>(() => new Set())
  const [reviewing, setReviewing] = useState<number | null>(null)
  const [reviewError, setReviewError] = useState('')

  async function markReviewed(messageId: number) {
    setReviewing(messageId)
    setReviewError('')
    try {
      const response = await fetch(`/api/settings/coach/questions/${messageId}/reviewed`, { method: 'POST' })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? 'Enregistrement impossible')
      }
      setReviewed((current) => new Set(current).add(messageId))
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : 'Enregistrement impossible')
    } finally {
      setReviewing(null)
    }
  }

  if (error && !data) return <ErrorState message={error} onRetry={() => setToken((value) => value + 1)} testId="coach-questions-error" />
  if (!data) return <ListSkeleton rows={4} />

  const pending = data.inaccurate.filter((answer) => !reviewed.has(answer.messageId))
  const maxCount = data.frequent[0]?.count ?? 1

  return (
    <div className={`flex flex-col gap-5 ${loading ? 'opacity-60' : ''}`} data-testid="coach-questions">
      <div className="coach-kpis">
        <Kpi value={INT.format(data.votes.helpful)} label={`Votes « Utile » · ${data.days} j`} tone={data.votes.helpful > 0 ? 'pos' : undefined} />
        <Kpi value={INT.format(data.votes.inaccurate)} label={`Votes « Inexact » · ${data.days} j`} tone={data.votes.inaccurate > 0 ? 'neg' : undefined} />
        <Kpi value={INT.format(Math.max(0, data.votes.pendingReview - reviewed.size))} label="À relire" testId="coach-pending-review" />
      </div>

      <SectionCard id="coach-frequent" icon={MessageSquare} title="Questions fréquentes" meta={`${data.days} derniers jours, regroupées par texte ; sans nom de joueur ni compte.`}>
        {data.frequent.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Aucune question sur la période" />
        ) : (
          <div className="coach-freq" data-testid="coach-frequent">
            {data.frequent.map((question) => (
              <div key={question.text} className="coach-freq-row">
                <span className="t-body text-gray-900">{question.text}</span>
                <span className="t-hero t-hero--sm text-gray-900">{INT.format(question.count)}</span>
                <div className="coach-freq-bar">
                  <span style={{ width: `${Math.round((question.count / maxCount) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard id="coach-inaccurate" icon={ThumbsDown} title="Votes « Inexact » à relire" meta="Question, précision du joueur, réponse et outils appelés : de quoi corriger le prompt ou un outil. « Relu » sort la réponse de la file.">
        {reviewError ? (
          <p className="t-body t-neg m-0" role="alert">
            {reviewError}
          </p>
        ) : null}
        {pending.length === 0 ? (
          <EmptyState icon={Check} title="Rien à relire" text="Chaque vote « Inexact » arrive ici avec la réponse et ses outils." />
        ) : (
          <div className="flex flex-col gap-3" data-testid="coach-inaccurate">
            {pending.map((answer) => (
              <article key={answer.messageId} className="coach-review" data-testid={`coach-review-${answer.messageId}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="t-meta">
                    {DATE_TIME.format(new Date(answer.createdAt))}
                    {answer.contextLabel ? ` · ${answer.contextLabel}` : ''}
                    {answer.clanTag ? (
                      <>
                        {' · '}
                        <span className="coach-tag">[{answer.clanTag}]</span>
                      </>
                    ) : null}
                    {answer.unverified ? (
                      <>
                        {' '}
                        <Tag tone="warn">Chiffres sans outil</Tag>
                      </>
                    ) : null}
                  </span>
                  <button type="button" className="app-btn app-btn--sm app-btn--secondary gap-1" disabled={reviewing === answer.messageId} onClick={() => void markReviewed(answer.messageId)}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {reviewing === answer.messageId ? 'Enregistrement…' : 'Relu'}
                  </button>
                </div>
                <div className="coach-review-grid">
                  <div>
                    <div className="t-label">Question</div>
                    <div className="t-body t-strong text-gray-900">{answer.question ?? '—'}</div>
                  </div>
                  <div>
                    <div className="t-label">Précision du joueur</div>
                    <div className="t-body text-gray-900">{answer.note ?? '—'}</div>
                  </div>
                </div>
                <div>
                  <div className="t-label">Réponse</div>
                  <div className="t-body whitespace-pre-wrap text-gray-700">{answer.answer}</div>
                </div>
                {answer.tools.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {answer.tools.map((tool, index) => (
                      <span key={`${tool}-${index}`} className="coach-tool-chip">
                        {tool}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="t-meta">Aucun outil appelé</span>
                )}
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
