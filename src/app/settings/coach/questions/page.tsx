'use client'

import { AlertTriangle, Brain, Check, MessageSquare, Pencil, ThumbsDown } from 'lucide-react'
import { useState } from 'react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import { DATE_TIME, INT, Kpi } from '@/components/settings/coach/CoachAdminShared'
import CoachConversationDelete from '@/components/settings/coach/CoachConversationDelete'
import CoachRulesSection, { type CoachRulePrefill } from '@/components/settings/coach/CoachRulesSection'
import { EmptyState, ErrorState, ListSkeleton, SectionCard, Tag, type Tone } from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import { COACH_DIFFICULT_SIGNAL_LABELS, type CoachDifficultSignal, type CoachQuestionsReport } from '@/lib/coach/coach-admin-report'
import { COACH_FEEDBACK_NOTE_MAX } from '@/lib/coach/coach-conversation-service'
import { paginate } from '@/lib/pagination'

/** Questions fréquentes par page : la liste se pagine, elle ne s'allonge jamais sans fin (règle du site). */
const QUESTIONS_PAGE_SIZE = 10
/** Questions difficiles par page. */
const DIFFICULT_PAGE_SIZE = 10

const SIGNAL_TONES: Record<CoachDifficultSignal, Tone> = { inaccurate: 'neg', unverified: 'warn', tool_failed: 'neg', gap: 'sky', rephrased: 'warn' }

/**
 * Questions posées au Coach IA (docs/TODO/chatbot-ia.md §9, onglet 3) : fréquences sur 30 jours regroupées par texte
 * normalisé, votes, et chaque vote « Inexact » à relire — date · contexte · clan, jamais le compte. « Relu » sort la
 * réponse de la file ; « En faire une règle » ouvre la section des règles apprises (lot 10) avec le vote rattaché.
 * Données : GET /api/settings/coach/questions, POST …/questions/[id]/reviewed, règles : `CoachRulesSection`.
 */
export default function CoachQuestionsPage() {
  const [token, setToken] = useState(0)
  const { data, error, loading } = useLifecycleResource<CoachQuestionsReport>('/api/settings/coach/questions', token)
  const [reviewed, setReviewed] = useState<Set<number>>(() => new Set())
  const [reviewing, setReviewing] = useState<number | null>(null)
  const [reviewError, setReviewError] = useState('')
  const [questionsPage, setQuestionsPage] = useState(1)
  const [rulePrefill, setRulePrefill] = useState<CoachRulePrefill | null>(null)
  // Précision réécrite par le SuperUser (2026-10-25) : brouillon par message, texte enregistré gardé localement.
  const [noteDraft, setNoteDraft] = useState<{ messageId: number; text: string } | null>(null)
  const [savedNotes, setSavedNotes] = useState<Map<number, string | null>>(() => new Map())
  const [noteSaving, setNoteSaving] = useState(false)
  // Fils supprimés depuis cette page (2026-10-30) : retirés tout de suite des deux listes, les compteurs suivent au rechargement.
  const [deletedConversations, setDeletedConversations] = useState<Set<number>>(() => new Set())
  const [difficultPage, setDifficultPage] = useState(1)

  function conversationDeleted(conversationId: number) {
    setDeletedConversations((current) => new Set(current).add(conversationId))
    setToken((value) => value + 1)
  }

  async function saveNote() {
    if (!noteDraft || noteSaving) return
    setNoteSaving(true)
    setReviewError('')
    try {
      const response = await fetch(`/api/settings/coach/questions/${noteDraft.messageId}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: noteDraft.text }),
      })
      const payload = (await response.json().catch(() => null)) as { note?: string | null; error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Enregistrement impossible')
      setSavedNotes((current) => new Map(current).set(noteDraft.messageId, payload?.note ?? null))
      setNoteDraft(null)
    } catch (caught) {
      setReviewError(caught instanceof Error ? caught.message : 'Enregistrement impossible')
    } finally {
      setNoteSaving(false)
    }
  }

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

  const pending = data.inaccurate.filter((answer) => !reviewed.has(answer.messageId) && !deletedConversations.has(answer.conversationId))
  // Barres à l'échelle de la question la plus posée, quelle que soit la page affichée.
  const maxCount = data.frequent[0]?.count ?? 1
  const questions = paginate(data.frequent, questionsPage, QUESTIONS_PAGE_SIZE)
  const difficultRows = data.difficult.filter((answer) => !deletedConversations.has(answer.conversationId))
  const difficult = paginate(difficultRows, difficultPage, DIFFICULT_PAGE_SIZE)

  return (
    <div className={`flex flex-col gap-5 ${loading ? 'opacity-60' : ''}`} data-testid="coach-questions">
      <div className="coach-kpis">
        <Kpi value={INT.format(data.votes.helpful)} label={`Votes « Utile » · ${data.days} j`} tone={data.votes.helpful > 0 ? 'pos' : undefined} />
        <Kpi value={INT.format(data.votes.inaccurate)} label={`Votes « Inexact » · ${data.days} j`} tone={data.votes.inaccurate > 0 ? 'neg' : undefined} />
        <Kpi value={INT.format(Math.max(0, data.votes.pendingReview - reviewed.size))} label="À relire" testId="coach-pending-review" />
      </div>

      <SectionCard
        id="coach-frequent"
        icon={MessageSquare}
        title="Questions fréquentes"
        meta={`${data.days} derniers jours ; les formulations proches (accents, ponctuation, mots vides, terminaisons) sont réunies sur une ligne ; sans nom de joueur ni compte.`}
      >
        {data.frequent.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Aucune question sur la période" />
        ) : (
          <>
            <div className="coach-freq" data-testid="coach-frequent">
              {questions.visible.map((question) => (
                <div key={question.text} className="coach-freq-row">
                  <span className="t-body text-gray-900">
                    {question.text}
                    {question.variants > 1 ? <span className="t-meta"> · {question.variants} formulations</span> : null}
                  </span>
                  <span className="t-hero t-hero--sm text-gray-900">{INT.format(question.count)}</span>
                  <div className="coach-freq-bar">
                    <span style={{ width: `${Math.round((question.count / maxCount) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              page={questions.current}
              pageCount={questions.pageCount}
              total={data.frequent.length}
              pageSize={QUESTIONS_PAGE_SIZE}
              onPageChange={setQuestionsPage}
              ariaLabel="Pages des questions fréquentes"
              itemLabel="Questions"
            />
          </>
        )}
      </SectionCard>

      <SectionCard
        id="coach-difficult"
        icon={AlertTriangle}
        title="Questions difficiles"
        meta={`${data.days} derniers jours : réponses marquées par un vote « Inexact », des chiffres sans outil, un outil en échec, une donnée que le Coach dit ne pas pouvoir lire, ou une question reposée dans la foulée. Aucune auto-évaluation du modèle ; date, contexte et clan, jamais le compte.`}
      >
        {difficultRows.length === 0 ? (
          <EmptyState icon={Check} title="Aucune question difficile" text="Une réponse arrive ici dès qu’un signal la marque." />
        ) : (
          <>
            <div className="flex flex-col gap-3" data-testid="coach-difficult">
              {difficult.visible.map((answer) => (
                <article key={answer.messageId} className="coach-review" data-testid={`coach-difficult-${answer.messageId}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="t-meta flex flex-wrap items-center gap-1.5">
                      {DATE_TIME.format(new Date(answer.createdAt))}
                      {answer.contextLabel ? ` · ${answer.contextLabel}` : ''}
                      {answer.clanTag ? <span className="coach-tag">[{answer.clanTag}]</span> : null}
                      {answer.signals.map((signal) => (
                        <Tag key={signal} tone={SIGNAL_TONES[signal]}>
                          {COACH_DIFFICULT_SIGNAL_LABELS[signal]}
                        </Tag>
                      ))}
                    </span>
                    <CoachConversationDelete conversationId={answer.conversationId} ownedBySomeoneElse onDeleted={conversationDeleted} onError={setReviewError} />
                  </div>
                  <div>
                    <div className="t-label">Question</div>
                    <div className="t-body t-strong text-gray-900">{answer.question ?? '—'}</div>
                  </div>
                  {answer.gapTopics.length > 0 ? (
                    <div className="t-body text-gray-700">
                      <span className="t-label">Donnée manquante · </span>
                      {answer.gapTopics.join(' · ')}
                    </div>
                  ) : null}
                  {answer.failures.length > 0 ? (
                    <div className="t-body text-gray-700">
                      <span className="t-label">Échec · </span>
                      {answer.failures.join(' · ')}
                    </div>
                  ) : null}
                  <details>
                    <summary className="t-label cursor-pointer">Réponse</summary>
                    <div className="t-body mt-1 whitespace-pre-wrap text-gray-700">{answer.answer}</div>
                  </details>
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
            <Pagination
              page={difficult.current}
              pageCount={difficult.pageCount}
              total={difficultRows.length}
              pageSize={DIFFICULT_PAGE_SIZE}
              onPageChange={setDifficultPage}
              ariaLabel="Pages des questions difficiles"
              itemLabel="Réponses"
            />
          </>
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
                  <span className="flex flex-wrap items-center gap-2">
                    <button type="button" className="app-btn app-btn--sm app-btn--secondary gap-1" onClick={() => setRulePrefill({ messageId: answer.messageId, token: Date.now() })} data-testid={`coach-rule-from-${answer.messageId}`}>
                      <Brain className="h-3.5 w-3.5" aria-hidden="true" />
                      En faire une règle
                    </button>
                    <button type="button" className="app-btn app-btn--sm app-btn--secondary gap-1" disabled={reviewing === answer.messageId} onClick={() => void markReviewed(answer.messageId)}>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {reviewing === answer.messageId ? 'Enregistrement…' : 'Relu'}
                    </button>
                    <CoachConversationDelete conversationId={answer.conversationId} ownedBySomeoneElse onDeleted={conversationDeleted} onError={setReviewError} />
                  </span>
                </div>
                <div className="coach-review-grid">
                  <div>
                    <div className="t-label">Question</div>
                    <div className="t-body t-strong text-gray-900">{answer.question ?? '—'}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="t-label">Précision du joueur</span>
                      {noteDraft?.messageId !== answer.messageId ? (
                        <button
                          type="button"
                          className="coach-icon-btn"
                          style={{ width: 24, height: 24 }}
                          aria-label="Modifier la précision"
                          title="Modifier la précision"
                          onClick={() => setNoteDraft({ messageId: answer.messageId, text: (savedNotes.has(answer.messageId) ? savedNotes.get(answer.messageId) : answer.note) ?? '' })}
                          data-testid={`coach-note-edit-${answer.messageId}`}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    {noteDraft?.messageId === answer.messageId ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          className="app-input w-full"
                          rows={2}
                          value={noteDraft.text}
                          maxLength={COACH_FEEDBACK_NOTE_MAX}
                          autoFocus
                          onChange={(event) => setNoteDraft({ messageId: answer.messageId, text: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setNoteDraft(null)
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault()
                              void saveNote()
                            }
                          }}
                          aria-label="Précision du joueur"
                          data-testid={`coach-note-input-${answer.messageId}`}
                        />
                        <span className="flex flex-wrap items-center gap-2">
                          <button type="button" className="app-btn app-btn--sm app-btn--secondary gap-1" onClick={() => void saveNote()} disabled={noteSaving} data-testid={`coach-note-save-${answer.messageId}`}>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            {noteSaving ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                          <button type="button" className="app-btn app-btn--sm app-btn--secondary" onClick={() => setNoteDraft(null)} disabled={noteSaving}>
                            Annuler
                          </button>
                          <span className="t-meta">
                            {noteDraft.text.length} / {COACH_FEEDBACK_NOTE_MAX} · remplace le texte du joueur, journalisé
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div className="t-body text-gray-900" data-testid={`coach-note-${answer.messageId}`}>
                        {(savedNotes.has(answer.messageId) ? savedNotes.get(answer.messageId) : answer.note) ?? '—'}
                      </div>
                    )}
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

      <CoachRulesSection prefill={rulePrefill} />
    </div>
  )
}
