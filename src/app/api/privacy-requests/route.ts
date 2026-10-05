import {
  clientKeyOf,
  createSlidingWindowLimiter,
  isHoneypotFilled,
  PRIVACY_REQUEST_RATE,
  validatePrivacyRequest,
} from '@/lib/legal/privacy-request'
import { submitPrivacyRequest } from '@/lib/legal/privacy-request-service'

/**
 * Demande « Retirer mes données » (/confidentialite/demande) — publique, sans session : docs/features/pages-legales.md.
 * Champ piège et limite de fréquence en mémoire ; l'adresse du visiteur ne sert que de clé et n'est jamais enregistrée.
 */

type Limiter = ReturnType<typeof createSlidingWindowLimiter>
const limiterStore = globalThis as typeof globalThis & { __privacyRequestLimiters?: { client: Limiter; global: Limiter } }
// Sur globalThis : le rechargement à chaud du serveur de développement ne remet pas les compteurs à zéro.
const limiters = (limiterStore.__privacyRequestLimiters ??= {
  client: createSlidingWindowLimiter(PRIVACY_REQUEST_RATE.perClient, PRIVACY_REQUEST_RATE.windowMs),
  global: createSlidingWindowLimiter(PRIVACY_REQUEST_RATE.global, PRIVACY_REQUEST_RATE.windowMs),
})

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 })
  }

  if (isHoneypotFilled(body)) {
    return Response.json({ ok: true, id: null }, { status: 201 })
  }

  if (!limiters.client.take(clientKeyOf(request.headers)) || !limiters.global.take('*')) {
    return Response.json({ error: 'Trop de demandes envoyées. Réessaie dans une heure.' }, { status: 429 })
  }

  const validation = validatePrivacyRequest(body)
  if (!validation.ok) {
    return Response.json({ error: 'Certains champs sont à corriger.', fieldErrors: validation.fieldErrors }, { status: 400 })
  }

  try {
    const { id } = await submitPrivacyRequest(validation.data)
    return Response.json({ ok: true, id }, { status: 201 })
  } catch (error) {
    console.error('[api/privacy-requests] Request not stored:', error)
    return Response.json({ error: 'La demande n’a pas pu être enregistrée. Réessaie plus tard.' }, { status: 500 })
  }
}
