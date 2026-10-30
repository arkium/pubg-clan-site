'use client'

import { MessagesSquare, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import { DATE_TIME, INT } from '@/components/settings/coach/CoachAdminShared'
import CoachConversationDelete from '@/components/settings/coach/CoachConversationDelete'
import { Callout, ConfirmDialog, EmptyState, ErrorState, ListSkeleton, SectionCard } from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import type { CoachOwnConversation } from '@/lib/coach/coach-admin-report'
import { paginate } from '@/lib/pagination'

const PAGE_SIZE = 10

/**
 * Fils du SuperUser (2026-10-30) : ses propres essais du Coach IA, à supprimer un par un ou d'un coup pour qu'ils ne
 * faussent plus les questions fréquentes, les outils et les questions difficiles. Les fils des membres ne se listent
 * pas ici (/confidentialite : le SuperUser ne relit que les réponses signalées) ; un fil relu se supprime depuis
 * l'onglet Questions. GET / DELETE /api/settings/coach/conversations, DELETE …/conversations/[id].
 */
export default function CoachConversationsPage() {
  const [token, setToken] = useState(0)
  const [page, setPage] = useState(1)
  const [deleted, setDeleted] = useState<Set<number>>(() => new Set())
  const [confirmAll, setConfirmAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'pos' | 'neg'; text: string } | null>(null)
  const { data, error, loading } = useLifecycleResource<{ conversations: CoachOwnConversation[] }>('/api/settings/coach/conversations', token)

  async function deleteAll() {
    setBusy(true)
    try {
      const response = await fetch('/api/settings/coach/conversations', { method: 'DELETE' })
      const payload = (await response.json().catch(() => null)) as { deleted?: number; error?: string } | null
      if (!response.ok) throw new Error(payload?.error ?? 'Suppression impossible')
      const count = payload?.deleted ?? 0
      setMessage({ tone: 'pos', text: `${INT.format(count)} fil${count > 1 ? 's' : ''} supprimé${count > 1 ? 's' : ''}.` })
      setDeleted(new Set())
      setPage(1)
      setToken((value) => value + 1)
    } catch (caught) {
      setMessage({ tone: 'neg', text: caught instanceof Error ? caught.message : 'Suppression impossible' })
    } finally {
      setBusy(false)
      setConfirmAll(false)
    }
  }

  if (error && !data) return <ErrorState message={error} onRetry={() => setToken((value) => value + 1)} testId="coach-conversations-error" />
  if (!data) return <ListSkeleton rows={4} />

  const rows = data.conversations.filter((conversation) => !deleted.has(conversation.id))
  const visible = paginate(rows, page, PAGE_SIZE)

  return (
    <div className={`flex flex-col gap-5 ${loading ? 'opacity-60' : ''}`} data-testid="coach-conversations">
      <Callout tone="sky" icon={MessagesSquare} title="Tes propres fils seulement">
        Tes essais du Coach. Ceux des membres ne s’affichent pas ici ; un fil relu (vote « Inexact », question difficile)
        se supprime depuis l’onglet Questions. Le coût déjà dépensé reste compté dans le mois.
      </Callout>
      {message ? (
        <p className={`t-body m-0 ${message.tone === 'pos' ? 't-pos' : 't-neg'}`} role="status" data-testid="coach-conversations-message">
          {message.text}
        </p>
      ) : null}

      <SectionCard
        id="coach-own-conversations"
        icon={MessagesSquare}
        title="Mes fils"
        meta={`${INT.format(rows.length)} fil${rows.length > 1 ? 's' : ''}, du plus récent au plus ancien.`}
        aside={
          rows.length > 0 ? (
            <button type="button" className="app-btn app-btn--sm app-btn--danger gap-1" onClick={() => setConfirmAll(true)} data-testid="coach-conversations-delete-all">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {rows.length === 1 ? 'Supprimer mon fil' : `Supprimer mes ${INT.format(rows.length)} fils`}
            </button>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon={MessagesSquare} title="Aucun fil" text="Tes questions au Coach apparaissent ici." />
        ) : (
          <>
            <ul className="flex flex-col gap-2" data-testid="coach-conversations-list">
              {visible.visible.map((conversation) => (
                <li key={conversation.id} className="app-panel-muted flex flex-wrap items-center justify-between gap-2 px-3 py-2.5" data-testid={`coach-conversation-${conversation.id}`}>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="t-card-title truncate">{conversation.title}</span>
                    <span className="t-meta">
                      {DATE_TIME.format(new Date(conversation.updatedAt))} · {INT.format(conversation.questions)} question{conversation.questions > 1 ? 's' : ''}
                      {conversation.contextLabel ? ` · ${conversation.contextLabel}` : ''}
                      {conversation.clanTag ? ` · [${conversation.clanTag}]` : ''}
                    </span>
                  </span>
                  <CoachConversationDelete
                    conversationId={conversation.id}
                    ownedBySomeoneElse={false}
                    onDeleted={(id) => setDeleted((current) => new Set(current).add(id))}
                    onError={(text) => setMessage({ tone: 'neg', text })}
                  />
                </li>
              ))}
            </ul>
            <Pagination
              page={visible.current}
              pageCount={visible.pageCount}
              total={rows.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              ariaLabel="Pages de mes fils"
              itemLabel="Fils"
            />
          </>
        )}
      </SectionCard>

      {confirmAll ? (
        <ConfirmDialog
          icon={Trash2}
          title={rows.length === 1 ? 'Supprimer ton fil ?' : `Supprimer tes ${INT.format(rows.length)} fils ?`}
          confirmLabel="Tout supprimer"
          tone="danger"
          busy={busy}
          onCancel={() => setConfirmAll(false)}
          onConfirm={() => void deleteAll()}
          testId="coach-conversations-delete-all-dialog"
        >
          Leurs questions, réponses et votes disparaissent des statistiques et de ton historique du Coach. Le coût déjà dépensé
          reste compté dans le mois. Action journalisée, sans retour possible.
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
