/**
 * Fonctionnalités d'administration d'un clan que le SuperUser peut ouvrir ou fermer aux Owners
 * (docs/TODO/administration.md §5.3) — partie pure, lisible côté client (menus). La lecture et l'écriture du réglage en
 * base sont dans `owner-features.ts` ; la garde serveur est `requireClanFeature` (`admin-guards.ts`).
 *
 * Le réglage est commun à tous les Owners (pas de réglage par clan). Ne figurent pas ici, faute de pouvoir être ouverts
 * aux Owners : les outils qui agissent sur toute la plateforme, et — décision du 2026-10-08 — la télémétrie d'un clan
 * (santé des données, resynchronisation, outils de télémétrie). Tous restent derrière `requirePlatformAdmin`.
 */

export type OwnerFeatureAccess = 'owner' | 'superuser'

type OwnerFeatureDefinition = {
  label: string
  description: string
  defaultAccess: OwnerFeatureAccess
  /** Entrées de menu (`NavItem`) qui suivent ce réglage : masquées aux Owners quand la fonctionnalité leur est fermée. */
  navKeys: readonly string[]
}

export const OWNER_FEATURES = {
  'clan-members': {
    label: 'Membres',
    description: 'Membres, invitations, demandes d’adhésion et ajout de joueurs dans le clan',
    defaultAccess: 'owner',
    navKeys: ['admin.players-roles', 'admin.add-player', 'clan.members-pending'],
  },
  'clan-announcements': {
    label: 'Annonces',
    description: 'Notifications Discord et écran d’accueil de connexion du clan',
    defaultAccess: 'owner',
    navKeys: ['admin.login-welcome', 'admin.discord-notifications'],
  },
  'clan-competition': {
    label: 'Compétition',
    description: 'Création, modification et synchronisation des tournois du clan',
    defaultAccess: 'owner',
    navKeys: ['clan.tournaments'],
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

/**
 * Lit la valeur JSON de `AppConfig` : `{ "<fonctionnalité>": "owner" | "superuser" }`. Une clé absente,
 * inconnue ou mal formée prend la valeur par défaut du catalogue (une clé retirée du catalogue, comme les anciennes
 * `clan-data-health` et `clan-telemetry-tools`, est ignorée).
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
    result[feature] = value === 'owner' || value === 'superuser' ? value : definition.defaultAccess
  }
  return result
}

/** Tout fermé aux Owners : valeur de repli quand la base ne répond pas. */
export function closedOwnerFeatureAccessMap(): OwnerFeatureAccessMap {
  const result = {} as OwnerFeatureAccessMap
  for (const feature of OWNER_FEATURE_KEYS) result[feature] = 'superuser'
  return result
}

export function ownerFeatureOfNavKey(navKey: string): OwnerFeature | null {
  return OWNER_FEATURE_KEYS.find((feature) => getDefinition(feature).navKeys.includes(navKey)) ?? null
}

/**
 * Pour les menus : une entrée rattachée à une fonctionnalité fermée aux Owners est masquée à un non-SuperUser. Sans
 * réglage connu (session encore en chargement), on prend les valeurs par défaut du catalogue.
 */
export function isNavKeyClosedToOwners(navKey: string, access: Partial<Record<string, OwnerFeatureAccess>> | null) {
  const feature = ownerFeatureOfNavKey(navKey)
  if (!feature) return false
  const value = access?.[feature] ?? parseOwnerFeatureAccess(null)[feature]
  return value !== 'owner'
}
