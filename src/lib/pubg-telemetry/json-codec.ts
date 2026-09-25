import { gunzipSync, gzipSync } from 'node:zlib'

/**
 * Compression des colonnes JSON de `SquadMatchTelemetry`.
 *
 * Ces colonnes étaient stockées en `longtext` — du JSON brut, sans compression (le type `JSON` de
 * MariaDB 10.11 n'est qu'un alias de LONGTEXT). Mesuré le 2026-09-24 : la géolocalisation compresse
 * à **8,7×**, les autres colonnes à **7,3×**, avec restitution exacte et 4 ms de décompression.
 *
 * L'enjeu n'est pas seulement la taille : `OPTIMIZE TABLE` écrit un fichier neuf dimensionné par
 * les **lignes vivantes**. En ramenant celles-ci de 6,99 Go à ~2 Go, la compression fait passer la
 * reconstruction sous le seuil de l'espace disque disponible — c'est elle qui rend au système de
 * fichiers les ~19 Go immobilisés (voir `docs/ops/database-performance.md` §4bis).
 *
 * La migration est graduelle : colonnes `*Gz` ajoutées en `INSTANT`, anciennes colonnes vidées par
 * lots. **Les deux formats coexistent pendant des mois**, d'où `decodeJsonColumn`, qui accepte les
 * deux.
 *
 * ⚠️ Ne jamais lire une de ces colonnes directement : sur un match compressé elle est `NULL`, et
 * rien ne signale l'erreur — la page s'affiche simplement vide. Toute lecture sélectionne la
 * colonne `*Gz` en plus et passe la ligne à `decodeTelemetryRow`.
 */

const GZIP_LEVEL = 6

/** Signature gzip (RFC 1952). */
const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

/**
 * Colonnes JSON stockées compressées.
 *
 * `summary` en est **volontairement absente** : cinq routes l'interrogent en SQL par
 * `JSON_EXTRACT` (`telemetry/circles`, `heatmap`, `loot`, `vehicles`), ce qu'un blob compressé
 * rendrait impossible. Elle pèse moins de 10 Mo au total : aucun intérêt à y toucher.
 */
export const COMPRESSED_JSON_COLUMNS = [
  'positionSamples',
  'trajectorySegments',
  'weaponStats',
  'memberStats',
  'deathSamples',
  'landingSamples',
  'phaseSnapshots',
  'killSamples',
  'shotSamples',
  'damageSamples',
  'knockoutSamples',
  'reviveSamples',
  'vehicleSamples',
  'killFeedSamples',
  'carePackageSamples',
] as const

export type CompressedJsonColumn = (typeof COMPRESSED_JSON_COLUMNS)[number]

/** Nom de la colonne compressée correspondante. */
export function gzColumnOf(column: CompressedJsonColumn): `${CompressedJsonColumn}Gz` {
  return `${column}Gz`
}

export class JsonColumnDecodeError extends Error {
  constructor(column: string, cause: unknown) {
    super(
      `Colonne ${column} compressée illisible : ${cause instanceof Error ? cause.message : String(cause)}`
    )
    this.name = 'JsonColumnDecodeError'
  }
}

function toBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value)
  return null
}

/**
 * Prépare la valeur à écrire dans la colonne compressée.
 *
 * Une valeur vide rend `null` : la colonne reste `NULL`, de sorte que `*Gz IS NOT NULL` garde
 * exactement le sens de l'ancien `JSON_LENGTH(...) > 0`. Sans cette règle, un match sans donnée
 * paraîtrait en porter une, et serait sélectionné à tort par les purges et les rattrapages.
 */
export function encodeJsonColumn(value: unknown): Buffer | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value) && value.length === 0) return null

  const json = JSON.stringify(value)
  if (!json || json === 'null' || json === '[]') return null

  return gzipSync(Buffer.from(json, 'utf8'), { level: GZIP_LEVEL })
}

/**
 * Rend la valeur exploitable d'une colonne, quel que soit son format : la colonne compressée si
 * elle est renseignée, sinon l'ancienne colonne en clair.
 *
 * @throws {JsonColumnDecodeError} si la colonne compressée existe mais ne peut pas être relue —
 * mieux vaut une erreur visible qu'un écran vide sans explication.
 */
export function decodeJsonColumn(compressed: unknown, legacy: unknown, column = 'inconnue'): unknown {
  const buffer = toBuffer(compressed)
  if (!buffer || buffer.length === 0) return legacy

  if (buffer[0] !== GZIP_MAGIC_0 || buffer[1] !== GZIP_MAGIC_1) {
    throw new JsonColumnDecodeError(column, 'en-tête gzip absent')
  }

  try {
    return JSON.parse(gunzipSync(buffer).toString('utf8'))
  } catch (error) {
    throw new JsonColumnDecodeError(column, error)
  }
}

/** Vrai si la ligne porte une valeur dans l'un ou l'autre format. */
export function hasJsonColumn(compressed: unknown, legacy: unknown): boolean {
  const buffer = toBuffer(compressed)
  if (buffer && buffer.length > 0) return true
  if (legacy === null || legacy === undefined) return false
  if (Array.isArray(legacy)) return legacy.length > 0
  if (typeof legacy === 'string') return legacy.length > 0 && legacy !== '[]' && legacy !== 'null'
  return true
}

/**
 * Normalise une ligne de `SquadMatchTelemetry` : chaque colonne compressée présente remplace sa
 * version en clair.
 *
 * C'est **le** point de passage de toutes les lectures. Un seul appel par site, plutôt qu'un appel
 * par colonne : sur dix-sept fichiers et quinze colonnes, la dispersion serait la première source
 * d'oubli. Les colonnes absentes de la ligne sont ignorées — chaque requête sélectionne ce dont
 * elle a besoin.
 */
export function decodeTelemetryRow<T extends Record<string, unknown>>(row: T): T {
  for (const column of COMPRESSED_JSON_COLUMNS) {
    const gz = `${column}Gz`
    if (!(gz in row)) continue
    const compressed = row[gz]
    if (compressed === null || compressed === undefined) continue
    ;(row as Record<string, unknown>)[column] = decodeJsonColumn(compressed, row[column], column)
  }
  return row
}
