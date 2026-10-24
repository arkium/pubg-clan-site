import { accessDecisionToResponse, decideClanAccess } from '@/lib/auth/admin-guards'
import { getSessionFromRequest } from '@/lib/auth-session'
import {
  COACH_SSE_HEADERS,
  encodeCoachSseEvent,
  loadCoachChatScope,
  parseCoachChatBody,
  prepareCoachChat,
  runCoachChat,
  type CoachSseEvent,
} from '@/lib/coach/coach-chat-service'
import { getCoachSettings } from '@/lib/coach/coach-config'

/**
 * Une question au Coach IA (docs/TODO/chatbot-ia.md §7.2). Membre actif du clan de l'adresse ou SuperUser
 * (`decideClanAccess`, jamais ouvert au mode visiteur) ; refus de quota avant tout flux (429, 503), puis réponse en
 * `text/event-stream` : `meta`, `tool`, `delta`, `done` ou `error`. Premier flux SSE du site : les en-têtes coupent
 * la mise en tampon de Nginx et toute compression ; fermer le tiroir interrompt l'appel au modèle.
 */

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  const { clanId: rawClanId } = await params
  const clanId = parseClanId(rawClanId)
  if (!clanId) return Response.json({ error: 'Invalid clan id' }, { status: 400 })

  const session = await getSessionFromRequest(request)
  const refused = accessDecisionToResponse(await decideClanAccess(session, clanId, 'member'))
  if (refused || !session) return refused ?? Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const settings = await getCoachSettings()
    const body = parseCoachChatBody(await request.json().catch(() => null), settings.maxInputChars)
    if ('error' in body) return Response.json({ error: 'invalid_body', message: body.error }, { status: 400 })

    const scope = await loadCoachChatScope(session, clanId)
    const prepared = await prepareCoachChat({ session, scope, body, settings })
    if (prepared.refusal !== null) {
      const { status, ...payload } = prepared.refusal
      return Response.json(payload, { status })
    }

    const encoder = new TextEncoder()
    const abort = new AbortController()
    request.signal?.addEventListener('abort', () => abort.abort(), { once: true })
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const emit = (event: CoachSseEvent) => {
          try {
            controller.enqueue(encoder.encode(encodeCoachSseEvent(event)))
          } catch {
            // Flux déjà fermé côté client : la réponse se termine en base, pas sur le réseau.
          }
        }
        void runCoachChat({ session, scope, body, signal: abort.signal, emit }, prepared).finally(() => {
          try {
            controller.close()
          } catch {
            // Déjà fermé.
          }
        })
      },
      cancel() {
        abort.abort()
      },
    })
    return new Response(stream, { status: 200, headers: COACH_SSE_HEADERS })
  } catch (error) {
    console.error('[coach/chat] Question impossible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
