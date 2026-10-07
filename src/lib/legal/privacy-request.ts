import { z } from 'zod'

import { SITE_DOMAIN } from '@/lib/legal/legal-info'

/**
 * Demande « Retirer mes données » (/confidentialite/demande) — docs/features/pages-legales.md. Validation partagée par
 * le formulaire et la route, limite de fréquence en mémoire, textes de la notification et de l'e-mail. Module pur.
 */

export const PRIVACY_REQUEST_KINDS = ['hide', 'purge', 'correct', 'other'] as const
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number]

export const PRIVACY_REQUEST_KIND_LABELS: Record<PrivacyRequestKind, string> = {
  hide: 'Masquer mon profil',
  purge: 'Purger mon historique',
  correct: 'Corriger une donnée',
  other: 'Autre demande',
}

export const PRIVACY_REQUEST_LIMITS = { pubgName: 32, reason: 1000, email: 190 } as const

export const privacyRequestSchema = z.object({
  pubgName: z
    .string({ error: 'Indique ton pseudo PUBG.' })
    .trim()
    .min(1, 'Indique ton pseudo PUBG.')
    .max(PRIVACY_REQUEST_LIMITS.pubgName, `Pseudo trop long : ${PRIVACY_REQUEST_LIMITS.pubgName} caractères au plus.`),
  kind: z.enum(PRIVACY_REQUEST_KINDS, { error: 'Choisis un type de demande.' }),
  reason: z
    .string()
    .trim()
    .max(PRIVACY_REQUEST_LIMITS.reason, 'Motif trop long : 1 000 caractères au plus.')
    .default(''),
  email: z
    .string({ error: 'Indique une adresse e-mail.' })
    .trim()
    .min(1, 'Indique une adresse e-mail.')
    .max(PRIVACY_REQUEST_LIMITS.email, 'Adresse e-mail trop longue.')
    .email('Adresse e-mail invalide.'),
  confirmOwner: z.literal(true, { error: 'Confirme être le titulaire de ce compte PUBG.' }),
})

export type PrivacyRequestInput = z.infer<typeof privacyRequestSchema>
export type PrivacyRequestField = keyof PrivacyRequestInput
export type PrivacyRequestFieldErrors = Partial<Record<PrivacyRequestField, string>>

const FIELDS = new Set<string>(Object.keys(privacyRequestSchema.shape))

/** Premier message d'erreur de chaque champ, dans l'ordre du formulaire. */
export function validatePrivacyRequest(
  input: unknown
): { ok: true; data: PrivacyRequestInput } | { ok: false; fieldErrors: PrivacyRequestFieldErrors } {
  const parsed = privacyRequestSchema.safeParse(input)
  if (parsed.success) return { ok: true, data: parsed.data }

  const fieldErrors: PrivacyRequestFieldErrors = {}
  for (const issue of parsed.error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string' && FIELDS.has(field)) {
      const key = field as PrivacyRequestField
      fieldErrors[key] ??= issue.message
    }
  }
  return { ok: false, fieldErrors }
}

/** Champ piège, invisible pour un humain : un robot qui le remplit reçoit un succès, mais rien n'est enregistré. */
export const PRIVACY_REQUEST_HONEYPOT = 'website'

export function isHoneypotFilled(body: unknown) {
  if (!body || typeof body !== 'object') return false
  const value = (body as Record<string, unknown>)[PRIVACY_REQUEST_HONEYPOT]
  return typeof value === 'string' && value.trim() !== ''
}

/** Par adresse et pour tout le site, sur une heure glissante. Assez pour un joueur, trop peu pour remplir la base. */
export const PRIVACY_REQUEST_RATE = { perClient: 3, global: 30, windowMs: 60 * 60 * 1000 } as const

/**
 * Fenêtre glissante en mémoire du processus : perdue au redémarrage, ce qui suffit contre un envoi en rafale. Les
 * adresses ne servent que de clés et ne sont jamais écrites ; un essai refusé n'est pas compté.
 */
export function createSlidingWindowLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>()

  return {
    take(key: string, now = Date.now()) {
      if (hits.size > 500) {
        for (const [entry, times] of hits) {
          if (times.every((at) => now - at >= windowMs)) hits.delete(entry)
        }
      }
      const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return false
      }
      recent.push(now)
      hits.set(key, recent)
      return true
    },
  }
}

/** Adresse du visiteur posée par Nginx (`X-Real-IP`, non falsifiable par le client), sinon premier `X-Forwarded-For`. */
export function clientKeyOf(headers: Headers) {
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

/** RGPD art. 12 : réponse sous un mois. Le 31 janvier donne le 28 (ou 29) février, pas début mars. */
export function privacyRequestDeadline(createdAt: Date) {
  const year = createdAt.getUTCFullYear()
  const month = createdAt.getUTCMonth() + 1
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const deadline = new Date(createdAt)
  deadline.setUTCFullYear(year, month, Math.min(createdAt.getUTCDate(), lastDay))
  return deadline
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' })

type StoredPrivacyRequest = {
  id: number
  pubgName: string
  kind: PrivacyRequestKind
  reason: string | null
  email: string
  createdAt: Date
}

// `Notification.title` et `Notification.message` sont des VARCHAR(191) : le motif complet va dans `data`.
const NOTIFICATION_TEXT_MAX = 191

function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export function privacyRequestNotification(request: StoredPrivacyRequest) {
  const label = PRIVACY_REQUEST_KIND_LABELS[request.kind]
  return {
    title: `Demande sur les données n° ${request.id}`,
    message: truncate(
      `${label} pour ${request.pubgName}. Réponse à ${request.email} avant le ${dateFormat.format(privacyRequestDeadline(request.createdAt))}.`,
      NOTIFICATION_TEXT_MAX
    ),
  }
}

/** Le sujet ne reprend rien de ce que le visiteur a saisi. */
export function privacyRequestEmail(request: StoredPrivacyRequest) {
  const label = PRIVACY_REQUEST_KIND_LABELS[request.kind]
  return {
    subject: `[${SITE_DOMAIN}] Demande sur les données n° ${request.id} : ${label}`,
    text: [
      `Nouvelle demande déposée sur https://${SITE_DOMAIN}/confidentialite/demande.`,
      '',
      `Numéro : ${request.id}`,
      `Type : ${label}`,
      `Pseudo PUBG : ${request.pubgName}`,
      `E-mail de réponse : ${request.email}`,
      `Motif : ${request.reason || '(aucun)'}`,
      `Reçue le : ${dateTimeFormat.format(request.createdAt)}`,
      `Réponse attendue avant le : ${dateFormat.format(privacyRequestDeadline(request.createdAt))}`,
      '',
      'Avant d’agir, vérifier que le compte appartient au demandeur (capture de son profil en jeu).',
      'Le traitement est manuel : docs/features/pages-legales.md.',
    ].join('\n'),
  }
}

/** Traitement par le SuperUser (/settings/privacy-requests) : `handledAt` est posé à la clôture, effacé à la réouverture. */
export const PRIVACY_REQUEST_STATUSES = ['pending', 'done', 'rejected'] as const
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number]

export const PRIVACY_REQUEST_STATUS_LABELS: Record<PrivacyRequestStatus, string> = {
  pending: 'En attente',
  done: 'Traitée',
  rejected: 'Refusée',
}

export function isPrivacyRequestStatus(value: unknown): value is PrivacyRequestStatus {
  return typeof value === 'string' && (PRIVACY_REQUEST_STATUSES as readonly string[]).includes(value)
}
