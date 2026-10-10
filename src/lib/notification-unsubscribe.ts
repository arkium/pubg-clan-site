import { createHmac } from 'node:crypto'

import { safeEqual } from '@/lib/auth-crypto'
import { usableSecret } from '@/lib/auth/secrets'
import { siteUrl } from '@/lib/seo/page-seo'

/**
 * Lien « Ne plus recevoir ces e-mails » des notifications : un jeton signé (HMAC-SHA256) par membre, sans table ni
 * expiration — le lien d'un vieil e-mail doit encore marcher. Il ne fait qu'une chose : couper le canal e-mail du membre
 * (`emailNotifications = false`) ; le reste se règle dans les préférences, après connexion.
 *
 * Secret : `NOTIFICATION_LINK_SECRET`, sinon `AUTH_BOOTSTRAP_SECRET` (déjà requis en production), séparés par le préfixe
 * signé. Sans secret utilisable, aucun lien n'est produit — l'e-mail garde le lien vers les préférences. Changer de
 * secret invalide les liens déjà envoyés : la page le dit et renvoie vers les préférences.
 */

const SIGNED_PREFIX = 'notification-email-unsubscribe:v1:'

/** Premier secret utilisable (`src/lib/auth/secrets.ts` : ni valeur d'exemple, ni moins de 16 caractères). */
export function notificationLinkSecret(env: Record<string, string | undefined> = process.env): string | null {
  return usableSecret(env.NOTIFICATION_LINK_SECRET) ?? usableSecret(env.AUTH_BOOTSTRAP_SECRET)
}

function sign(memberId: number, secret: string) {
  return createHmac('sha256', secret).update(`${SIGNED_PREFIX}${memberId}`).digest('base64url')
}

export function createUnsubscribeToken(memberId: number, secret = notificationLinkSecret()): string | null {
  if (!secret || !Number.isInteger(memberId) || memberId <= 0) return null
  return `${memberId}.${sign(memberId, secret)}`
}

/** Membre du jeton, ou `null` s'il est mal formé ou mal signé. */
export function verifyUnsubscribeToken(token: string | null | undefined, secret = notificationLinkSecret()): number | null {
  if (!secret || !token) return null
  const match = /^(\d{1,10})\.([A-Za-z0-9_-]{43})$/.exec(token.trim())
  if (!match) return null
  const memberId = Number(match[1])
  if (!Number.isSafeInteger(memberId) || memberId <= 0) return null
  return safeEqual(match[2], sign(memberId, secret)) ? memberId : null
}

/**
 * Liens du jeton : `pageUrl` (dans le texte de l'e-mail, page de confirmation) et `oneClickUrl` (en-tête
 * `List-Unsubscribe`, RFC 8058 : la messagerie l'appelle en POST, sans page).
 */
export function notificationUnsubscribeLinks(memberId: number, base: URL = siteUrl(), secret = notificationLinkSecret()) {
  const token = createUnsubscribeToken(memberId, secret)
  if (!token) return null
  const query = `?t=${encodeURIComponent(token)}`
  return {
    pageUrl: new URL(`/notifications/desabonnement${query}`, base).toString(),
    oneClickUrl: new URL(`/api/notifications/unsubscribe${query}`, base).toString(),
  }
}
