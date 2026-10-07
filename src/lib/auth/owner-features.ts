import { prisma } from '@/lib/prisma'

/**
 * Fonctionnalités d'administration d'un clan que le SuperUser peut ouvrir ou fermer aux Owners
 * (docs/TODO/administration.md §5.3). Une fonctionnalité regroupe des pages ET leurs routes : la garde
 * `requireClanFeature` (src/lib/auth/admin-guards.ts) lit le même réglage pour l'API, les pages et les menus.
 *
 * Le réglage est commun à tous les Owners (pas de réglage par clan). Les outils qui agissent sur toute la
 * plateforme ne figurent pas ici : ils restent derrière `requirePlatformAdmin`, sans réglage possible.
 */

export type OwnerFeatureAccess = 'owner' | 'superuser'

type OwnerFeatureDefinition = {
  label: string
  description: string
  defaultAccess: OwnerFeatureAccess
  /** Présent : la fonctionnalité reste réservée au SuperUser quel que soit le réglage enregistré. */
  lockedReason?: string
}

export const OWNER_FEATURES = {
  'clan-members': {
    label: 'Membres',
    description: 'Membres, invitations, demandes d’adhésion et ajout de joueurs dans le clan',
    defaultAccess: 'owner',
  },
  'clan-announcements': {
    label: 'Annonces',
    description: 'Notifications Discord et écran d’accueil de connexion du clan',
    defaultAccess: 'owner',
  },
  'clan-competition': {
    label: 'Compétition',
    description: 'Création, modification et synchronisation des tournois du clan',
    defaultAccess: 'owner',
  },
  'clan-telemetry-tools': {
    label: 'Outils de télémétrie',
    description:
      'État de la télémétrie, erreurs, synchronisation manuelle, récupérations, actions de resynchronisation',
    defaultAccess: 'superuser',
    lockedReason:
      'Ces outils consomment le quota PUBG commun à tous les clans : ils ne s’ouvrent aux Owners qu’avec un plafond par clan et le journal des actions d’administration.',
  },
} as const satisfies Record<string, OwnerFeatureDefinition>

export type OwnerFeature = keyof typeof OWNER_FEATURES

export const OWNER_FEATURE_KEYS = Object.keys(OWNER_FEATURES) as OwnerFeature[]

export const OWNER_FEATURE_ACCESS_CONFIG_KEY = 'owner_feature_access'

export type OwnerFeatureAccessMap = Record<OwnerFeature, OwnerFeatureAccess>

function getDefinition(feature: OwnerFeature): OwnerFeatureDefinition {
  return OWNER_FEATURES[feature]
}

export function isOwnerFeature(value: unknown): value is OwnerFeature {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(OWNER_FEATURES, value)
}

export function isOwnerFeatureLocked(feature: OwnerFeature) {
  return Boolean(getDefinition(feature).lockedReason)
}

/**
 * Lit la valeur JSON de `AppConfig` : `{ "<fonctionnalité>": "owner" | "superuser" }`. Une clé absente,
 * inconnue ou mal formée prend la valeur par défaut du catalogue ; une fonctionnalité verrouillée reste
 * toujours `superuser`.
 */
export function parseOwnerFeatureAccess(raw: string | null): OwnerFeatureAccessMap {
  let stored: Record<string, unknown> = {}
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        stored = parsed as Record<string, unknown>
      }
    } catch {
      stored = {}
    }
  }

  const result = {} as OwnerFeatureAccessMap
  for (const feature of OWNER_FEATURE_KEYS) {
    const definition = getDefinition(feature)
    const value = stored[feature]
    const access: OwnerFeatureAccess =
      value === 'owner' || value === 'superuser' ? value : definition.defaultAccess
    result[feature] = definition.lockedReason ? 'superuser' : access
  }
  return result
}

/** Tout fermé aux Owners : valeur de repli quand la base ne répond pas. */
function closedAccessMap(): OwnerFeatureAccessMap {
  const result = {} as OwnerFeatureAccessMap
  for (const feature of OWNER_FEATURE_KEYS) result[feature] = 'superuser'
  return result
}

const CACHE_TTL_MS = 30_000
let cache: { value: OwnerFeatureAccessMap; expiresAt: number } | null = null

export function resetOwnerFeatureAccessCache() {
  cache = null
}

export async function getOwnerFeatureAccessMap(): Promise<OwnerFeatureAccessMap> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.value

  try {
    const record = await prisma.appConfig.findUnique({
      where: { key: OWNER_FEATURE_ACCESS_CONFIG_KEY },
      select: { value: true },
    })
    const value = parseOwnerFeatureAccess(record?.value ?? null)
    cache = { value, expiresAt: now + CACHE_TTL_MS }
    return value
  } catch (error) {
    // Une base indisponible ne doit jamais ouvrir un outil : on ferme tout, sans mettre en cache.
    console.error('[owner-features] Lecture du réglage impossible, tout reste fermé aux Owners:', error)
    return closedAccessMap()
  }
}

export async function getOwnerFeatureAccess(feature: OwnerFeature): Promise<OwnerFeatureAccess> {
  const map = await getOwnerFeatureAccessMap()
  return map[feature]
}

export async function setOwnerFeatureAccess(feature: OwnerFeature, access: OwnerFeatureAccess) {
  if (access === 'owner' && isOwnerFeatureLocked(feature)) {
    throw new Error(`Feature ${feature} is locked to SuperUser`)
  }

  const record = await prisma.appConfig.findUnique({
    where: { key: OWNER_FEATURE_ACCESS_CONFIG_KEY },
    select: { value: true },
  })
  const next = { ...parseOwnerFeatureAccess(record?.value ?? null), [feature]: access }
  const value = JSON.stringify(next)

  await prisma.appConfig.upsert({
    where: { key: OWNER_FEATURE_ACCESS_CONFIG_KEY },
    update: { value },
    create: { key: OWNER_FEATURE_ACCESS_CONFIG_KEY, value },
  })
  cache = { value: next, expiresAt: Date.now() + CACHE_TTL_MS }
  return next
}
