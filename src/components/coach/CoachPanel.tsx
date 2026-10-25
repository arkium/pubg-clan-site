'use client'

import { ArrowUp, Brain, Check, Copy, History, Lock, Maximize2, MoreHorizontal, Pencil, Plus, RefreshCw, Shield, Square, ThumbsDown, ThumbsUp, Trash2, X, Zap } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import CoachMarkdown from '@/components/coach/CoachMarkdown'
import { useAuthSession } from '@/hooks/useAuthSession'
import { COACH_REFUSAL_CODES, useCoachChat, type CoachChatMessage } from '@/hooks/useCoachChat'
import { useCoachConversations } from '@/hooks/useCoachConversations'
import { useCoachMemory } from '@/hooks/useCoachMemory'
import { useCoachQuota } from '@/hooks/useCoachQuota'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { COACH_INPUT_MAX_CHARS, COACH_LEGAL_LINE, coachProvisionalContext, coachRefusalText, coachThreadWhen, type CoachThreadGroup } from '@/lib/coach/coach-client'
import type { CoachConversationSummary } from '@/lib/coach/coach-conversation-service'
import { coachPlainText } from '@/lib/coach/coach-markdown'
import { COACH_MEMORY_KEY_LABELS, type CoachMemoryView } from '@/lib/coach/coach-memory'

/**
 * Le Coach IA lui-même (docs/TODO/chatbot-ia.md §8) : en-tête, contexte de page, fil, saisie, liste des fils, teaser
 * visiteur. Partagé par le tiroir (`variant="drawer"`) et la page plein écran (`variant="page"`). Aucun appel réseau
 * tant que `active` est faux : les tests Playwright des autres pages n'ont rien à intercepter.
 */

type Props = { variant: 'drawer' | 'page'; active: boolean; onClose?: () => void }

const GROUPS: CoachThreadGroup[] = ['Aujourd’hui', 'Cette semaine', 'Plus ancien']

function pageClanId(pathname: string | null): number | null {
  const match = /^\/clans\/(\d+)(?:\/|$)/.exec(pathname ?? '')
  return match ? Number(match[1]) : null
}

export default function CoachPanel({ variant, active, onClose }: Props) {
  const pathname = usePathname()
  const session = useAuthSession()
  const { clanId: selectedClanId } = useSelectedClan()
  const clanId = pageClanId(pathname) ?? selectedClanId
  // Teaser pour un compte sans session seulement : le mode visiteur (DISABLE_AUTH_PERMISSIONS) ouvre la lecture des
  // pages, pas le Coach, mais un membre connecté sous ce mode reste un membre.
  const visitor = !session.loading && !session.authenticated
  const member = session.members.find((entry) => entry.memberId === session.activeMemberId) ?? null
  const playerName = member?.displayName ?? (session.isSuperUser ? 'SuperUser' : null)
  const clanTag = member?.clan?.tag ?? null

  // Contexte de la page d'où le tiroir est ouvert ; la page plein écran n'en a pas.
  const pagePath = variant === 'drawer' ? pathname : null
  const [detached, setDetached] = useState(false)
  const contextPath = detached ? null : pagePath
  const provisional = useMemo(() => coachProvisionalContext(contextPath), [contextPath])
  const enabled = active && !visitor && !session.loading
  const { quota, reload: reloadQuota, apply: applyQuota } = useCoachQuota(enabled)
  const [listOpen, setListOpen] = useState(variant === 'page')
  const threads = useCoachConversations(enabled && listOpen)
  // « Ce que le Coach sait de toi » (lot 11) : seulement quand la mémoire personnelle est ouverte (le quota le dit),
  // lue quand la liste s'affiche ; une réponse peut y avoir ajouté une ligne, la liste se relit à sa fin.
  const memoryEnabled = Boolean(quota?.memoryEnabled)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const memory = useCoachMemory(enabled && memoryEnabled && memoryOpen)
  const [announcement, setAnnouncement] = useState('')

  // Fin de réponse ou refus : signalés depuis le flux, pas par un effet — quota ajusté, lecteurs d'écran prévenus.
  const chat = useCoachChat({
    clanId,
    contextPath,
    onDone: (done) => {
      applyQuota({ remainingHour: done.remainingHour ?? undefined, monthPercent: done.monthPercent ?? undefined })
      setAnnouncement('Réponse du Coach terminée.')
      threads.reload()
      memory.reload()
    },
    onRefused: () => reloadQuota(),
  })

  const [draft, setDraft] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Le fil suit la réponse qui arrive (DOM seulement).
  const lastMessage = chat.messages[chat.messages.length - 1]
  useEffect(() => {
    const node = threadRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [chat.messages.length, lastMessage?.content.length, chat.toolLabel])

  const contextLabel = detached ? null : (chat.contextLabel ?? provisional.label)
  const suggestions = chat.suggestions ?? provisional.suggestions
  const streaming = chat.status === 'streaming'
  const refusal = quota && !quota.allowed ? coachRefusalText(quota.reason, quota.retryAt, quota.periodEnd) : null
  const errorRefusal = chat.error && COACH_REFUSAL_CODES.has(chat.error.code) ? coachRefusalText(chat.error.code, chat.error.retryAt, quota?.periodEnd ?? null) : null
  const blocked = Boolean(refusal) || visitor || !clanId
  const overLimit = draft.length > COACH_INPUT_MAX_CHARS
  const canSend = !blocked && !streaming && draft.trim().length > 0 && !overLimit

  const send = useCallback(
    (text: string) => {
      const question = text.trim()
      if (!question || blocked || streaming) return
      setDraft('')
      setListOpen(false)
      void chat.send(question)
    },
    [blocked, streaming, chat]
  )

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) send(draft)
    }
  }

  const openThread = async (summary: CoachConversationSummary) => {
    const view = await threads.load(summary.id)
    if (!view) return
    chat.loadConversation(view)
    setDetached(true)
    if (variant === 'drawer') setListOpen(false)
    textareaRef.current?.focus()
  }

  const newThread = () => {
    chat.reset()
    setDetached(false)
    if (variant === 'drawer') setListOpen(false)
    textareaRef.current?.focus()
  }

  const header = (
    <div className="coach-head">
      <span className="coach-head-icon">
        <Shield className="coach-ico" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="coach-title">Coach IA</div>
        <div className="coach-sub">
          {clanTag ? <span className="coach-tag">[{clanTag}]</span> : null}
          {visitor ? (
            <span className="t-accent inline-flex items-center gap-1">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Réservé aux membres
            </span>
          ) : quota && !quota.allowed && quota.reason === 'coach_paused' ? (
            <span className="coach-online coach-online--off">En pause</span>
          ) : (
            <span className="coach-online">En ligne</span>
          )}
        </div>
      </div>
      {!visitor && quota ? <QuotaPill remainingHour={quota.remainingHour} hourlyLimit={quota.hourlyLimit} monthPercent={quota.monthPercent} unlimited={quota.unlimited} /> : <span className="ml-auto" />}
      {!visitor && memoryEnabled ? (
        <button
          type="button"
          className="coach-icon-btn"
          aria-label="Ce que le Coach sait de toi"
          title="Ce que le Coach sait de toi"
          aria-pressed={memoryOpen}
          onClick={() => {
            setMemoryOpen((current) => !current)
            setListOpen(false)
          }}
          data-testid="coach-memory-toggle"
        >
          <Brain className="coach-ico" aria-hidden="true" />
        </button>
      ) : null}
      {!visitor ? (
        <button
          type="button"
          className="coach-icon-btn"
          aria-label="Fils de discussion"
          aria-pressed={listOpen}
          onClick={() => {
            setListOpen((current) => !current)
            setMemoryOpen(false)
          }}
          data-testid="coach-threads-toggle"
        >
          <History className="coach-ico" aria-hidden="true" />
        </button>
      ) : null}
      {variant === 'drawer' && clanId && !visitor ? (
        <Link href={`/clans/${clanId}/coach`} className="coach-icon-btn coach-maximize" aria-label="Agrandir en plein écran" onClick={onClose}>
          <Maximize2 className="coach-ico" aria-hidden="true" />
        </Link>
      ) : null}
      {variant === 'drawer' ? (
        <button type="button" className="coach-icon-btn" aria-label="Fermer le Coach IA" onClick={onClose} data-testid="coach-close">
          <X className="coach-ico" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )

  if (visitor) {
    return (
      <>
        {header}
        <CoachTeaser />
      </>
    )
  }

  const threadList = (
    <ThreadList
      conversations={threads.conversations}
      loading={threads.loading}
      error={threads.error}
      activeId={chat.conversationId}
      onNew={newThread}
      onOpen={(summary) => void openThread(summary)}
      onRename={threads.rename}
      onDelete={async (id) => {
        const ok = await threads.remove(id)
        if (ok && chat.conversationId === id) newThread()
        return ok
      }}
    />
  )

  const memoryList = <MemoryList memories={memory.memories} max={memory.max} retentionDays={memory.retentionDays} loading={memory.loading} error={memory.error} onForget={memory.forget} onForgetAll={memory.forgetAll} />

  const thread = (
    <>
      {pagePath && !detached ? (
        <div className="coach-context-row">
          <span className="coach-context" data-testid="coach-context">
            <Zap className="coach-ico" aria-hidden="true" style={{ width: 14, height: 14 }} />
            {contextLabel ? `Contexte : ${contextLabel}` : 'Sans contexte'}
            {contextLabel ? (
              <button type="button" aria-label="Détacher le contexte" onClick={() => setDetached(true)}>
                <X className="coach-ico" aria-hidden="true" style={{ width: 14, height: 14 }} />
              </button>
            ) : null}
          </span>
        </div>
      ) : pagePath && provisional.label ? (
        <div className="coach-context-row">
          <button type="button" className="coach-context coach-context--add" onClick={() => setDetached(false)}>
            <Plus className="coach-ico" aria-hidden="true" style={{ width: 14, height: 14 }} />
            Ajouter le contexte de la page
          </button>
        </div>
      ) : null}

      <div ref={threadRef} className="coach-thread" data-testid="coach-thread">
        {chat.messages.length === 0 ? (
          <>
            <div className="coach-msg">
              <span className="coach-avatar">
                <Shield className="coach-ico" aria-hidden="true" style={{ width: 14, height: 14 }} />
              </span>
              <div className="coach-bubble">
                {playerName ? `Salut ${playerName} ! ` : 'Salut ! '}
                {contextLabel ? 'J’ai le contexte de ta page sous la main. Que veux-tu décortiquer ?' : 'Pose-moi une question sur tes parties, tes armes ou tes adversaires.'}
                {clanId ? (
                  <>
                    {' '}
                    <Link href={variant === 'page' ? '#aide' : `/clans/${clanId}/coach#aide`} className="t-accent underline" onClick={variant === 'drawer' ? onClose : undefined} data-testid="coach-help-link">
                      Ce que je sais faire et mes limites
                    </Link>
                  </>
                ) : null}
              </div>
            </div>
            <div className="coach-suggestions">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" className="coach-suggestion" onClick={() => send(suggestion)} disabled={blocked || streaming}>
                  <Zap className="coach-ico" aria-hidden="true" />
                  {suggestion}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {chat.messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.localId} className="coach-msg">
              <div className="coach-bubble coach-bubble--user">{message.content}</div>
            </div>
          ) : (
            <AssistantMessage key={message.localId} message={message} toolLabel={message.streaming ? chat.toolLabel : null} onVote={chat.vote} />
          )
        )}

        {chat.error && !errorRefusal ? (
          <div className="coach-notice coach-notice--neg" role="alert">
            <span>{chat.error.message}</span>
            {chat.lastQuestion && !streaming ? (
              <button
                type="button"
                className="app-btn app-btn--secondary app-btn--xs gap-1"
                onClick={() => {
                  const question = chat.lastQuestion ?? ''
                  chat.dismissError()
                  send(question)
                }}
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                Réessayer
              </button>
            ) : null}
          </div>
        ) : null}
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
      </div>

      <div className="coach-composer">
        {refusal || errorRefusal ? (
          <div className="coach-notice coach-notice--warn mb-2" data-testid="coach-refusal">
            <span>{errorRefusal ?? refusal}</span>
          </div>
        ) : null}
        <div className="coach-input-row">
          <div className="coach-input">
            <textarea
              ref={textareaRef}
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={blocked ? 'Le Coach ne peut pas répondre pour le moment' : contextLabel ? 'Pose une question sur ce match, tes armes…' : 'Pose une question…'}
              aria-label="Ta question au Coach IA"
              disabled={blocked}
              data-testid="coach-input"
            />
            <span className={`coach-count ${overLimit ? 'coach-count--over' : ''}`}>
              {draft.length} / {COACH_INPUT_MAX_CHARS}
            </span>
          </div>
          {streaming ? (
            <button type="button" className="app-btn app-btn--secondary coach-send" aria-label="Arrêter la réponse" onClick={chat.stop} data-testid="coach-stop">
              <Square className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="app-btn app-btn--primary coach-send" aria-label="Envoyer" disabled={!canSend} onClick={() => send(draft)} data-testid="coach-send">
              <ArrowUp className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="coach-legal">{COACH_LEGAL_LINE}</p>
      </div>
    </>
  )

  if (variant === 'page') {
    return (
      <div className="coach-page">
        <aside className="coach-page-list" aria-label={memoryOpen ? 'Ce que le Coach sait de toi' : 'Fils de discussion'}>
          {memoryOpen ? memoryList : threadList}
        </aside>
        <section className="coach-page-panel">
          {header}
          <div className="coach-body">{thread}</div>
        </section>
      </div>
    )
  }

  return (
    <>
      {header}
      <div className="coach-body">{listOpen ? threadList : memoryOpen ? memoryList : thread}</div>
    </>
  )
}

const MEMORY_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })

/** « Ce que le Coach sait de toi » (lot 11) : les lignes du compte, une croix par ligne, « Tout oublier ». */
function MemoryList({
  memories,
  max,
  retentionDays,
  loading,
  error,
  onForget,
  onForgetAll,
}: {
  memories: CoachMemoryView[] | null
  max: number
  retentionDays: number
  loading: boolean
  error: string | null
  onForget: (id: number) => Promise<boolean>
  onForgetAll: () => Promise<boolean>
}) {
  return (
    <div className="coach-memory" data-testid="coach-memory">
      <p className="coach-memory-intro">
        Ce que tu as demandé au Coach de retenir, en tes mots — au plus {max} lignes, gardées {retentionDays} jours après leur dernière mise à jour. Dis-lui « retiens que… » pour en ajouter. Rien ici n’est lu par l’administrateur.
      </p>
      {loading ? <p className="t-meta m-0 px-2 py-3">Chargement…</p> : null}
      {error ? <p className="t-meta m-0 px-2 py-3">{error}</p> : null}
      {memories && memories.length === 0 ? <p className="t-meta m-0 px-2 py-3">Le Coach ne retient rien pour l’instant.</p> : null}
      {memories?.map((memory) => (
        <div key={memory.id} className="coach-memory-row" data-testid={`coach-memory-${memory.id}`}>
          <div className="coach-memory-main">
            <span className="coach-memory-key">{COACH_MEMORY_KEY_LABELS[memory.key] ?? memory.key}</span>
            <span className="coach-memory-text">« {memory.text} »</span>
            <span className="coach-memory-meta">
              {MEMORY_DATE.format(new Date(memory.updatedAt))}
              {memory.baseline ? ` · mesuré à ${memory.baseline.value}${memory.baseline.weapon ? ` (${memory.baseline.weapon})` : ''} le ${MEMORY_DATE.format(new Date(memory.baseline.at))}` : ''}
            </span>
          </div>
          <button type="button" className="coach-icon-btn" aria-label={`Oublier : ${memory.text}`} title="Oublier" onClick={() => void onForget(memory.id)}>
            <X className="coach-ico" aria-hidden="true" />
          </button>
        </div>
      ))}
      {memories && memories.length > 0 ? (
        <div className="coach-memory-foot">
          <span>
            {memories.length} / {max}
          </span>
          <button type="button" className="app-btn app-btn--secondary app-btn--xs gap-1" onClick={() => void onForgetAll()} data-testid="coach-memory-forget-all">
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Tout oublier
          </button>
        </div>
      ) : null}
    </div>
  )
}

function QuotaPill({ remainingHour, hourlyLimit, monthPercent, unlimited }: { remainingHour: number | null; hourlyLimit: number; monthPercent: number | null; unlimited: boolean }) {
  if (unlimited) {
    return (
      <span className="coach-quota" title="SuperUser : sans limite">
        ∞
      </span>
    )
  }
  if (monthPercent !== null && monthPercent >= 80) {
    return (
      <span className={`coach-quota ${monthPercent >= 100 ? 'coach-quota--out' : 'coach-quota--low'}`} title="Part du budget mensuel consommée" data-testid="coach-quota">
        Budget du mois : <b>{Math.min(100, monthPercent)} %</b>
      </span>
    )
  }
  const remaining = remainingHour ?? hourlyLimit
  const tone = remaining <= 0 ? 'coach-quota--out' : remaining <= 2 ? 'coach-quota--low' : ''
  return (
    <span className={`coach-quota ${tone}`} title="Questions restantes cette heure" data-testid="coach-quota">
      <b>{remaining}</b> / {hourlyLimit}
    </span>
  )
}

function AssistantMessage({ message, toolLabel, onVote }: { message: CoachChatMessage; toolLabel: string | null; onVote: (message: CoachChatMessage, score: 1 | -1 | null, note?: string) => Promise<boolean> }) {
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')
  const [noted, setNoted] = useState(false)
  const [copied, setCopied] = useState(false)
  const waiting = Boolean(message.streaming) && message.content.length === 0

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coachPlainText(message.content))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Presse-papiers refusé : rien à faire.
    }
  }

  const vote = async (score: 1 | -1 | null) => {
    if (score === -1 && !noteOpen) {
      setNoteOpen(true)
      await onVote(message, -1)
      return
    }
    setNoteOpen(false)
    await onVote(message, score)
  }

  const sendNote = async () => {
    const ok = await onVote(message, -1, note.trim() || undefined)
    if (ok) {
      setNoted(true)
      setNoteOpen(false)
    }
  }

  return (
    <>
      <div className="coach-msg">
        <span className="coach-avatar">
          <Shield className="coach-ico" aria-hidden="true" style={{ width: 14, height: 14 }} />
        </span>
        {waiting ? (
          <div className="coach-status-line" style={{ paddingLeft: 0 }}>
            <span className="coach-typing" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            {toolLabel ?? 'Je réfléchis…'}
          </div>
        ) : (
          <div className="coach-bubble">
            <CoachMarkdown text={message.content} />
            {message.interrupted ? <p className="t-meta m-0 mt-2">Réponse interrompue.</p> : null}
          </div>
        )}
      </div>
      {message.streaming && !waiting && toolLabel ? <div className="coach-status-line">{toolLabel}</div> : null}
      {message.unverified ? (
        <div className="coach-notice coach-notice--warn" style={{ marginLeft: 38 }} data-testid="coach-unverified">
          <span>Chiffres non vérifiés par les données : le Coach n’a consulté aucune statistique pour cette réponse.</span>
        </div>
      ) : null}
      {!message.streaming && message.content ? (
        <div className="coach-actions">
          <button type="button" className="coach-action" aria-pressed={message.feedbackScore === 1} disabled={message.id === null} onClick={() => void vote(message.feedbackScore === 1 ? null : 1)}>
            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            Utile
          </button>
          <button type="button" className="coach-action coach-action--neg" aria-pressed={message.feedbackScore === -1} disabled={message.id === null} onClick={() => void vote(message.feedbackScore === -1 ? null : -1)}>
            <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
            Inexact
          </button>
          <button type="button" className="coach-action" aria-label={copied ? 'Copié' : 'Copier la réponse'} onClick={() => void copy()}>
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? 'Copié' : null}
          </button>
          {noted ? <span className="t-meta">Merci, c’est noté.</span> : null}
        </div>
      ) : null}
      {noteOpen ? (
        <div className="coach-note-row">
          <input className="app-input" value={note} maxLength={280} onChange={(event) => setNote(event.target.value)} placeholder="Qu’est-ce qui est faux ? (facultatif)" aria-label="Précision sur l’inexactitude" />
          <button type="button" className="app-btn app-btn--secondary app-btn--sm" onClick={() => void sendNote()}>
            Envoyer
          </button>
        </div>
      ) : null}
    </>
  )
}

function ThreadList({
  conversations,
  loading,
  error,
  activeId,
  onNew,
  onOpen,
  onRename,
  onDelete,
}: {
  conversations: CoachConversationSummary[] | null
  loading: boolean
  error: string | null
  activeId: number | null
  onNew: () => void
  onOpen: (summary: CoachConversationSummary) => void
  onRename: (id: number, title: string) => Promise<boolean>
  onDelete: (id: number) => Promise<boolean>
}) {
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [renaming, setRenaming] = useState<{ id: number; title: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const grouped = useMemo(() => {
    const groups = new Map<CoachThreadGroup, Array<CoachConversationSummary & { when: string }>>()
    for (const summary of conversations ?? []) {
      const { group, when } = coachThreadWhen(summary.updatedAt)
      const list = groups.get(group) ?? []
      list.push({ ...summary, when })
      groups.set(group, list)
    }
    return groups
  }, [conversations])

  return (
    <div className="coach-threads" data-testid="coach-threads">
      <button type="button" className="app-btn app-btn--secondary app-btn--md coach-threads-new" onClick={onNew}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Nouveau fil
      </button>
      {loading ? <p className="t-meta m-0 px-2 py-3">Chargement des fils…</p> : null}
      {error ? <p className="t-meta m-0 px-2 py-3">{error}</p> : null}
      {conversations && conversations.length === 0 ? <p className="t-meta m-0 px-2 py-3">Aucun fil pour l’instant : pose ta première question.</p> : null}
      {GROUPS.map((group) => {
        const rows = grouped.get(group)
        if (!rows || rows.length === 0) return null
        return (
          <div key={group}>
            <div className="coach-threads-group">{group}</div>
            {rows.map((row) => (
              <div key={row.id}>
                {renaming?.id === row.id ? (
                  <div className="coach-thread-actions">
                    <input
                      className="app-input"
                      value={renaming.title}
                      maxLength={120}
                      autoFocus
                      aria-label="Nouveau titre"
                      onChange={(event) => setRenaming({ id: row.id, title: event.target.value })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void onRename(row.id, renaming.title).then(() => setRenaming(null))
                        if (event.key === 'Escape') setRenaming(null)
                      }}
                    />
                    <button type="button" className="app-btn app-btn--secondary app-btn--xs" onClick={() => void onRename(row.id, renaming.title).then(() => setRenaming(null))}>
                      OK
                    </button>
                  </div>
                ) : (
                  <div
                    className={`coach-thread-row ${activeId === row.id ? 'coach-thread-row--active' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-current={activeId === row.id ? 'true' : undefined}
                    onClick={() => onOpen(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpen(row)
                      }
                    }}
                  >
                    <span className="coach-thread-main">
                      <span className="coach-thread-title">{row.title}</span>
                      <span className="coach-thread-meta">{row.contextLabel ?? 'Sans contexte'}</span>
                    </span>
                    <span className="coach-thread-time">{row.when}</span>
                    <button
                      type="button"
                      className="coach-icon-btn"
                      aria-label="Actions du fil"
                      aria-expanded={menuFor === row.id}
                      onClick={(event) => {
                        event.stopPropagation()
                        setConfirmDelete(null)
                        setMenuFor((current) => (current === row.id ? null : row.id))
                      }}
                    >
                      <MoreHorizontal className="coach-ico" aria-hidden="true" />
                    </button>
                  </div>
                )}
                {menuFor === row.id && renaming?.id !== row.id ? (
                  <div className="coach-thread-actions">
                    {confirmDelete === row.id ? (
                      <>
                        <span className="t-meta">Supprimer ce fil ?</span>
                        <button
                          type="button"
                          className="app-btn app-btn--danger app-btn--xs"
                          onClick={() =>
                            void onDelete(row.id).then(() => {
                              setMenuFor(null)
                              setConfirmDelete(null)
                            })
                          }
                        >
                          Oui, supprimer
                        </button>
                        <button type="button" className="app-btn app-btn--secondary app-btn--xs" onClick={() => setConfirmDelete(null)}>
                          Non
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="app-btn app-btn--secondary app-btn--xs gap-1"
                          onClick={() => {
                            setRenaming({ id: row.id, title: row.title })
                            setMenuFor(null)
                          }}
                        >
                          <Pencil className="h-3 w-3" aria-hidden="true" />
                          Renommer
                        </button>
                        <button type="button" className="app-btn app-btn--danger app-btn--xs gap-1" onClick={() => setConfirmDelete(row.id)}>
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          Supprimer
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** Visiteur ou compte sans session : réponses d'exemple floutées, carte « Exclusivité membres », aucun appel. */
function CoachTeaser() {
  return (
    <>
      <div className="coach-teaser" data-testid="coach-teaser">
        <div className="coach-thread coach-blur" aria-hidden="true">
          <div className="coach-msg">
            <span className="coach-avatar" />
            <div className="coach-bubble">Salut ! J’ai analysé le match de ton escouade. Que veux-tu décortiquer ?</div>
          </div>
          <div className="coach-msg">
            <div className="coach-bubble coach-bubble--user">Pourquoi l’escouade s’est fait sortir en zone 5 ?</div>
          </div>
          <div className="coach-msg">
            <span className="coach-avatar" />
            <div className="coach-bubble">
              <p className="coach-answer-title">Phase 5 · 18:42</p>
              <ul className="coach-points">
                <li>Exemple : isolement à 145 m du reste de l’escouade.</li>
                <li>Exemple : 420 dégâts subis en 6 s.</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="coach-lock-card">
          <span className="coach-lock-icon">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="app-stamp">Exclusivité membres</span>
          <p className="coach-lock-title">Débloque ton Coach IA</p>
          <p className="t-body text-gray-700 m-0">Le Coach IA analyse chaque tir, chaque rotation et chaque duel de ton escouade. Connecte-toi, ou inscris ton clan avec ton pseudo PUBG.</p>
          <Link href="/join" className="app-btn app-btn--primary app-btn--md w-full justify-center">
            Inscrire mon clan avec mon pseudo PUBG
          </Link>
          <Link href="/login" className="app-btn app-btn--secondary app-btn--md w-full justify-center">
            Se connecter
          </Link>
        </div>
      </div>
      <div className="coach-composer">
        <div className="coach-input-row">
          <div className="coach-input">
            <textarea rows={1} aria-label="Ta question au Coach IA" placeholder="Réservé aux membres d’un clan" disabled />
          </div>
        </div>
        <p className="coach-legal">{COACH_LEGAL_LINE}</p>
      </div>
    </>
  )
}
