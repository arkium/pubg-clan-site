/**
 * Sous-domaine d'un clan (`<sous-domaine>.chickendinner.fr`) — docs/TODO/chickendinnerfr.md §4.
 *
 * Module pur, sans Prisma : il est importé par le proxy. Les lectures et écritures en base sont dans
 * `clan-subdomain-service.ts`.
 */

/** Sous-domaines techniques, jamais attribués à un clan. */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'www',
  'api',
  'admin',
  'mail',
  'smtp',
  'imap',
  'pop',
  'ftp',
  'dev',
  'staging',
  'test',
  'status',
  'static',
  'cdn',
  'assets',
  'app',
  'auth',
  'login',
])

export const SUBDOMAIN_MIN_LENGTH = 2
export const SUBDOMAIN_MAX_LENGTH = 63

const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/**
 * Forme candidate d'un texte libre (tag ou nom de clan) : minuscules, accents retirés, caractères hors
 * `[a-z0-9]` remplacés par `-`, tirets consécutifs fusionnés et retirés aux extrémités, longueur bornée.
 */
export function normalizeSubdomain(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SUBDOMAIN_MAX_LENGTH)
    .replace(/-$/, '')
}

export type SubdomainValidationError = 'too_short' | 'too_long' | 'invalid_characters' | 'reserved'

/** `null` si la valeur (déjà normalisée) est un sous-domaine attribuable. */
export function validateSubdomain(value: string): SubdomainValidationError | null {
  if (value.length < SUBDOMAIN_MIN_LENGTH) return 'too_short'
  if (value.length > SUBDOMAIN_MAX_LENGTH) return 'too_long'
  if (!SUBDOMAIN_PATTERN.test(value)) return 'invalid_characters'
  if (RESERVED_SUBDOMAINS.has(value)) return 'reserved'
  return null
}

export const SUBDOMAIN_ERROR_MESSAGES: Record<SubdomainValidationError | 'taken' | 'system', string> = {
  too_short: `Au moins ${SUBDOMAIN_MIN_LENGTH} caractères.`,
  too_long: `Au plus ${SUBDOMAIN_MAX_LENGTH} caractères.`,
  invalid_characters: 'Lettres minuscules, chiffres et tirets seulement, sans tiret au début ni à la fin.',
  reserved: 'Ce sous-domaine est réservé au site.',
  taken: 'Ce sous-domaine est déjà attribué à un autre clan.',
  system: "Le clan système n'a pas de sous-domaine.",
}

export type SubdomainCandidateInput = {
  clanId: number
  tag: string
  name: string
  /** Un autre clan actif porte le même tag (casse ignorée) : le tag seul serait ambigu. */
  tagShared: boolean
  /** Sous-domaines déjà attribués (à d'autres clans). */
  taken: ReadonlySet<string>
}

function isAvailable(value: string, taken: ReadonlySet<string>) {
  return validateSubdomain(value) === null && !taken.has(value)
}

/**
 * Choisit le sous-domaine d'un clan (§4.B) :
 * 1. le tag en minuscules, s'il est valide, non réservé, libre, et porté par ce seul clan ;
 * 2. sinon le nom normalisé ;
 * 3. sinon le nom (ou le tag, ou `clan-<id>`) suivi de `-2`, `-3`…
 */
export function pickClanSubdomain(input: SubdomainCandidateInput): string {
  const fromTag = normalizeSubdomain(input.tag)
  if (!input.tagShared && fromTag === input.tag.toLowerCase() && isAvailable(fromTag, input.taken)) {
    return fromTag
  }

  const fromName = normalizeSubdomain(input.name)
  if (isAvailable(fromName, input.taken)) return fromName

  const base =
    [fromName, fromTag].find((value) => value.length >= SUBDOMAIN_MIN_LENGTH && !RESERVED_SUBDOMAINS.has(value)) ??
    `clan-${input.clanId}`
  if (isAvailable(base, input.taken)) return base
  for (let suffix = 2; ; suffix += 1) {
    const ending = `-${suffix}`
    const candidate = `${base.slice(0, SUBDOMAIN_MAX_LENGTH - ending.length).replace(/-$/, '')}${ending}`
    if (isAvailable(candidate, input.taken)) return candidate
  }
}
