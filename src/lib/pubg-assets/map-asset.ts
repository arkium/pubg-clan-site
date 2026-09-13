import mapNameData from './dictionaries/mapName.json'

const mapNameDictionary = mapNameData as Record<string, string>

/** Clés techniques disposant réellement d'un fichier dans `public/maps/pubg/`. */
export const MAP_ASSET_KEYS = [
  'Baltic_Main',
  'Chimera_Main',
  'Desert_Main',
  'DihorOtok_Main',
  'Heaven_Main',
  'Kiki_Main',
  'Neon_Main',
  'Range_Main',
  'Savage_Main',
  'Summerland_Main',
  'Tiger_Main',
] as const

export type MapAssetKey = (typeof MAP_ASSET_KEYS)[number]

/**
 * Clés techniques renvoyées par l'API PUBG qui n'ont pas d'asset dédié : la
 * carte remastérisée sert de fond pour l'ancienne variante.
 */
const TECHNICAL_KEY_ALIASES: Record<string, MapAssetKey> = {
  Erangel_Main: 'Baltic_Main',
}

function normalizeMapToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

const ASSET_LOOKUP = new Map<string, MapAssetKey>()

for (const key of MAP_ASSET_KEYS) {
  ASSET_LOOKUP.set(normalizeMapToken(key), key)
}

for (const [technicalKey, displayName] of Object.entries(mapNameDictionary)) {
  const assetKey =
    TECHNICAL_KEY_ALIASES[technicalKey] ??
    ASSET_LOOKUP.get(normalizeMapToken(technicalKey)) ??
    null

  if (!assetKey) continue

  ASSET_LOOKUP.set(normalizeMapToken(technicalKey), assetKey)
  ASSET_LOOKUP.set(normalizeMapToken(displayName), assetKey)
}

// "Erangel (Remastered)" est le libellé de Baltic_Main : "erangel" seul doit
// pointer sur le même fond, quelle que soit la variante stockée en base.
ASSET_LOOKUP.set(normalizeMapToken('Erangel'), 'Baltic_Main')

/**
 * Résout n'importe quelle écriture de carte (clé technique `Savage_Main`, nom
 * affiché `Sanhok`, variante `Erangel (Remastered)`) vers la clé d'asset locale.
 * Renvoie `null` si aucune image n'est disponible, pour permettre un repli
 * explicite plutôt qu'un 404 silencieux.
 */
export function resolveMapAssetKey(value: string | null | undefined): MapAssetKey | null {
  if (!value) return null
  return ASSET_LOOKUP.get(normalizeMapToken(value)) ?? null
}

/** URL de la carte satellite locale, ou `null` si l'asset n'existe pas. */
export function mapAssetUrl(value: string | null | undefined): string | null {
  const key = resolveMapAssetKey(value)
  return key ? `/maps/pubg/${key}.webp` : null
}
