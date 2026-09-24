import { gunzipSync, gzipSync } from 'node:zlib'

/**
 * Compression des colonnes de géolocalisation de `SquadMatchTelemetry`.
 *
 * `positionSamples` et `trajectorySegments` étaient stockées en `longtext` — du JSON brut, sans
 * aucune compression (le type `JSON` de MariaDB 10.11 n'est qu'un alias de LONGTEXT). Elles
 * représentaient ~94 % des 20,6 Go de la table. Mesuré le 2026-09-24 sur un match réel de
 * 2 214 Ko : **gzip niveau 6 rend 268 Ko, soit 8,2×**, en 24 ms à l'écriture et **4 ms à la
 * lecture**, avec restitution exacte. Sur un serveur dont le buffer pool tient en 128 Mo, lire
 * 268 Ko au lieu de 2,2 Mo *accélère* le replay : les 4 ms de CPU sont largement regagnées.
 *
 * La migration est volontairement graduelle — nouvelles colonnes `*Gz` ajoutées en `INSTANT`,
 * anciennes colonnes conservées puis vidées par lots. Pendant des mois, **les deux formats
 * coexisteront** : toute lecture passe donc par `decodeGeoColumn`, qui accepte les deux.
 *
 * ⚠️ Ne jamais lire `positionSamples` / `trajectorySegments` directement : un match compressé
 * rendrait un contenu illisible, sans erreur. Toujours sélectionner la colonne `*Gz` en plus et
 * passer les deux à `decodeGeoColumn`.
 */

const GZIP_LEVEL = 6

/** Signature gzip (RFC 1952) : deux octets magiques en tête de flux. */
const GZIP_MAGIC_0 = 0x1f
const GZIP_MAGIC_1 = 0x8b

export class GeoColumnDecodeError extends Error {
  constructor(cause: unknown) {
    super(
      `Colonne de géolocalisation compressée illisible : ${cause instanceof Error ? cause.message : String(cause)}`
    )
    this.name = 'GeoColumnDecodeError'
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
 * Un tableau vide ou absent rend `null` : la colonne reste `NULL`, de sorte que
 * `positionSamplesGz IS NOT NULL` garde exactement le sens de l'ancien `JSON_LENGTH(…) > 0`.
 * Sans cette règle, un match sans position paraîtrait en porter une.
 */
export function encodeGeoColumn(value: unknown): Buffer | null {
  if (value === null || value === undefined) return null
  if (Array.isArray(value) && value.length === 0) return null

  const json = JSON.stringify(value)
  if (!json || json === 'null' || json === '[]') return null

  return gzipSync(Buffer.from(json, 'utf8'), { level: GZIP_LEVEL })
}

/**
 * Rend la valeur exploitable d'une colonne de géolocalisation, quel que soit son format de
 * stockage : la colonne compressée si elle est renseignée, sinon l'ancienne colonne en clair.
 *
 * Le résultat est un tableau (ou la valeur héritée telle quelle), directement consommable par les
 * assistants d'analyse existants (`parseArray`, `asArray`, `storedArray`, `parseRows`).
 *
 * @throws {GeoColumnDecodeError} si la colonne compressée existe mais ne peut pas être relue —
 * mieux vaut une erreur visible qu'une carte vide sans explication.
 */
export function decodeGeoColumn(compressed: unknown, legacy: unknown): unknown {
  const buffer = toBuffer(compressed)
  if (!buffer || buffer.length === 0) return legacy

  if (buffer[0] !== GZIP_MAGIC_0 || buffer[1] !== GZIP_MAGIC_1) {
    throw new GeoColumnDecodeError('en-tête gzip absent')
  }

  try {
    return JSON.parse(gunzipSync(buffer).toString('utf8'))
  } catch (error) {
    throw new GeoColumnDecodeError(error)
  }
}

/** Vrai si la ligne porte encore de la géolocalisation, dans l'un ou l'autre format. */
export function hasGeoColumn(compressed: unknown, legacy: unknown): boolean {
  const buffer = toBuffer(compressed)
  if (buffer && buffer.length > 0) return true
  if (legacy === null || legacy === undefined) return false
  if (Array.isArray(legacy)) return legacy.length > 0
  if (typeof legacy === 'string') return legacy.length > 0 && legacy !== '[]' && legacy !== 'null'
  return true
}
