import { timingSafeEqual } from 'node:crypto'

/**
 * Règle commune aux secrets du `.env` (bootstrap de l'Owner, lien de désabonnement des e-mails) : une valeur d'exemple
 * de `.env.example` est publique, une valeur trop courte se devine — ni l'une ni l'autre n'ouvre quoi que ce soit.
 * Constat du 2026-10-10 : la production tournait avec `AUTH_BOOTSTRAP_SECRET="change-me-long-random-string"`.
 */

export const SECRET_MIN_LENGTH = 16

/** Valeurs d'exemple de `.env.example` et de docs/ops/deployment.md, connues de tous. */
export const EXAMPLE_SECRETS: readonly string[] = [
  'change-me-long-random-string',
  'une-longue-chaine-aleatoire',
  'change-me-cron-secret',
  'ton-secret-long',
]

export type SecretState = 'missing' | 'example' | 'too_short' | 'ok'

export function secretState(value: string | null | undefined): SecretState {
  const secret = value?.trim() ?? ''
  if (!secret) return 'missing'
  if (EXAMPLE_SECRETS.includes(secret)) return 'example'
  if (secret.length < SECRET_MIN_LENGTH) return 'too_short'
  return 'ok'
}

/** Le secret s'il est utilisable, sinon `null`. */
export function usableSecret(value: string | null | undefined): string | null {
  return secretState(value) === 'ok' ? value!.trim() : null
}

/** Comparaison à temps constant d'un secret reçu avec le secret configuré (utilisable seulement). */
export function matchesSecret(provided: string | null | undefined, configured: string | null | undefined): boolean {
  const secret = usableSecret(configured)
  if (!secret || !provided) return false
  const left = Buffer.from(provided)
  const right = Buffer.from(secret)
  return left.length === right.length && timingSafeEqual(left, right)
}
