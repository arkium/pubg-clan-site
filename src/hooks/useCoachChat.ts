'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { CoachSseEvent } from '@/lib/coach/coach-chat-service'
import type { CoachConversationView } from '@/lib/coach/coach-conversation-service'

/**
 * Une conversation avec le Coach IA côté tiroir (docs/TODO/chatbot-ia.md §7.2, §8) : envoi d'une question en
 * `POST …/coach/chat`, lecture du flux SSE mot à mot (`fetch` + lecteur de flux : `EventSource` ne fait pas de POST),
 * arrêt, votes, reprise d'un fil. Un refus avant le flux (400, 404, 429, 503) retire la question : elle n'a pas été
 * acceptée. `onDone` et `onRefused` sont appelés depuis le flux (jamais dans un effet) pour ajuster le quota.
 */

export type CoachChatMessage = {
  id: number | null
  localId: string
  role: 'user' | 'assistant'
  content: string
  tools: string[]
  unverified: boolean
  feedbackScore: number | null
  /** Réponse en cours d'arrivée. */
  streaming?: boolean
  /** Réponse interrompue par le joueur : ce qui est arrivé reste. */
  interrupted?: boolean
}

export type CoachChatStatus = 'idle' | 'streaming' | 'error'

export type CoachChatError = {
  code: string
  message: string
  status: number | null
  retryAt: string | null
}

export type CoachDoneData = Extract<CoachSseEvent, { event: 'done' }>['data']

export type CoachChatState = {
  conversationId: number | null
  messages: CoachChatMessage[]
  status: CoachChatStatus
  toolLabel: string | null
  error: CoachChatError | null
  contextLabel: string | null
  suggestions: string[] | null
  /** Dernière question envoyée, pour « Réessayer ». */
  lastQuestion: string | null
}

export type CoachChatOptions = {
  clanId: number | null
  contextPath: string | null
  onDone?: (done: CoachDoneData) => void
  onRefused?: (error: CoachChatError) => void
}

const INITIAL: CoachChatState = {
  conversationId: null,
  messages: [],
  status: 'idle',
  toolLabel: null,
  error: null,
  contextLabel: null,
  suggestions: null,
  lastQuestion: null,
}

export const COACH_REFUSAL_CODES = new Set(['coach_paused', 'hourly_limit', 'too_fast', 'monthly_budget', 'global_budget'])

const REFUSAL_MESSAGES: Record<string, string> = {
  coach_paused: 'Le Coach IA est en pause.',
  hourly_limit: 'Limite de questions par heure atteinte.',
  too_fast: 'Doucement : une question toutes les quelques secondes.',
  monthly_budget: 'Ton budget de questions du mois est épuisé.',
  global_budget: 'Le Coach IA a atteint son plafond du mois pour tout le monde.',
  conversation_not_found: 'Ce fil n’existe plus.',
  invalid_body: 'Question refusée.',
}

const localId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

/** Lit un flux SSE et appelle `onEvent` pour chaque bloc `event:` / `data:`. */
async function readSse(body: ReadableStream<Uint8Array>, onEvent: (event: CoachSseEvent) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let separator = buffer.indexOf('\n\n')
    while (separator >= 0) {
      const block = buffer.slice(0, separator)
      buffer = buffer.slice(separator + 2)
      separator = buffer.indexOf('\n\n')
      let eventName = ''
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      if (!eventName || !data) continue
      try {
        onEvent({ event: eventName, data: JSON.parse(data) } as CoachSseEvent)
      } catch {
        // Bloc illisible : ignoré, le flux continue.
      }
    }
  }
}

export function useCoachChat(options: CoachChatOptions) {
  const [state, setState] = useState<CoachChatState>(INITIAL)
  const abortRef = useRef<AbortController | null>(null)
  const optionsRef = useRef(options)
  const conversationRef = useRef<number | null>(null)

  // Les options changent à chaque rendu (chemin, rappels) : lues à l'envoi, jamais pendant le rendu.
  useEffect(() => {
    optionsRef.current = options
  })
  useEffect(() => {
    conversationRef.current = state.conversationId
  }, [state.conversationId])
  useEffect(() => () => abortRef.current?.abort(), [])

  const patchMessage = useCallback((id: string, patch: Partial<CoachChatMessage> | ((message: CoachChatMessage) => CoachChatMessage)) => {
    setState((current) => ({
      ...current,
      messages: current.messages.map((message) =>
        message.localId === id ? (typeof patch === 'function' ? patch(message) : { ...message, ...patch }) : message
      ),
    }))
  }, [])

  const send = useCallback(
    async (text: string) => {
      const question = text.trim()
      const { clanId, contextPath } = optionsRef.current
      if (!question || !clanId || abortRef.current) return

      const userId = localId()
      const answerId = localId()
      setState((current) => ({
        ...current,
        status: 'streaming',
        error: null,
        toolLabel: null,
        lastQuestion: question,
        messages: [
          ...current.messages,
          { id: null, localId: userId, role: 'user', content: question, tools: [], unverified: false, feedbackScore: null },
          { id: null, localId: answerId, role: 'assistant', content: '', tools: [], unverified: false, feedbackScore: null, streaming: true },
        ],
      }))

      const controller = new AbortController()
      abortRef.current = controller
      let finished = false
      try {
        const response = await fetch(`/api/clans/${clanId}/coach/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ conversationId: conversationRef.current, contextPath, message: question }),
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as { error?: string; message?: string; retryAt?: string | null } | null
          const code = payload?.error ?? 'http_error'
          const error: CoachChatError = { code, message: payload?.message ?? REFUSAL_MESSAGES[code] ?? 'Le Coach IA n’a pas pu répondre.', status: response.status, retryAt: payload?.retryAt ?? null }
          setState((current) => ({
            ...current,
            status: 'error',
            error,
            messages: current.messages.filter((message) => message.localId !== userId && message.localId !== answerId),
          }))
          if (COACH_REFUSAL_CODES.has(code)) optionsRef.current.onRefused?.(error)
          finished = true
          return
        }

        await readSse(response.body, (event) => {
          switch (event.event) {
            case 'meta':
              conversationRef.current = event.data.conversationId
              setState((current) => ({ ...current, conversationId: event.data.conversationId, contextLabel: event.data.context.label, suggestions: event.data.context.suggestions }))
              patchMessage(userId, { id: event.data.questionId })
              break
            case 'tool':
              setState((current) => ({ ...current, toolLabel: event.data.label }))
              patchMessage(answerId, (message) => ({ ...message, tools: message.tools.includes(event.data.name) ? message.tools : [...message.tools, event.data.name] }))
              break
            case 'delta':
              setState((current) => ({ ...current, toolLabel: null }))
              patchMessage(answerId, (message) => ({ ...message, content: message.content + event.data.text }))
              break
            case 'done':
              finished = true
              patchMessage(answerId, { id: event.data.messageId, unverified: event.data.unverified, streaming: false })
              setState((current) => ({ ...current, status: 'idle', toolLabel: null }))
              optionsRef.current.onDone?.(event.data)
              break
            case 'error':
              finished = true
              setState((current) => ({
                ...current,
                status: 'error',
                toolLabel: null,
                error: { code: event.data.code, message: event.data.message, status: null, retryAt: null },
                messages: current.messages
                  .map((message) => (message.localId === answerId ? { ...message, streaming: false, interrupted: event.data.code === 'aborted' } : message))
                  .filter((message) => message.localId !== answerId || message.content.length > 0),
              }))
              break
          }
        })
      } catch (caught) {
        finished = true
        if (controller.signal.aborted) {
          setState((current) => ({
            ...current,
            status: 'idle',
            toolLabel: null,
            messages: current.messages
              .map((message) => (message.localId === answerId ? { ...message, streaming: false, interrupted: true } : message))
              .filter((message) => message.localId !== answerId || message.content.length > 0),
          }))
        } else {
          setState((current) => ({
            ...current,
            status: 'error',
            toolLabel: null,
            error: { code: 'network', message: caught instanceof Error && caught.message ? 'Connexion perdue pendant la réponse.' : 'Le Coach IA n’a pas pu répondre.', status: null, retryAt: null },
            messages: current.messages
              .map((message) => (message.localId === answerId ? { ...message, streaming: false } : message))
              .filter((message) => message.localId !== answerId || message.content.length > 0),
          }))
        }
      } finally {
        abortRef.current = null
        if (!finished) {
          // Flux fermé sans `done` ni `error` : la réponse reçue reste, l'état redevient disponible.
          patchMessage(answerId, { streaming: false })
          setState((current) => ({ ...current, status: 'idle', toolLabel: null }))
        }
      }
    },
    [patchMessage]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    conversationRef.current = null
    setState(INITIAL)
  }, [])

  const loadConversation = useCallback((view: CoachConversationView) => {
    abortRef.current?.abort()
    conversationRef.current = view.id
    setState({
      ...INITIAL,
      conversationId: view.id,
      contextLabel: view.contextLabel,
      messages: view.messages.map((message) => ({
        id: message.id,
        localId: `m-${message.id}`,
        role: message.role,
        content: message.content,
        tools: message.tools,
        unverified: message.unverified,
        feedbackScore: message.feedbackScore,
      })),
    })
  }, [])

  const vote = useCallback(
    async (message: CoachChatMessage, score: 1 | -1 | null, note?: string) => {
      if (message.id === null) return false
      const response = await fetch(`/api/coach/messages/${message.id}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ score, note: note ?? null }),
      })
      if (response.ok) patchMessage(message.localId, { feedbackScore: score })
      return response.ok
    },
    [patchMessage]
  )

  const dismissError = useCallback(() => {
    setState((current) => ({ ...current, status: current.status === 'error' ? 'idle' : current.status, error: null }))
  }, [])

  return { ...state, send, stop, reset, loadConversation, vote, dismissError }
}
