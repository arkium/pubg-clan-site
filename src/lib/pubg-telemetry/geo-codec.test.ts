import { describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'

import {
  GeoColumnDecodeError,
  decodeGeoColumn,
  encodeGeoColumn,
  hasGeoColumn,
} from '@/lib/pubg-telemetry/geo-codec'

// La géolocalisation était stockée en `longtext` — du JSON brut, ~94 % des 20,6 Go de la table.
// La compression gzip rend 8,2× sur données réelles. La migration étant graduelle, les deux
// formats coexisteront des mois : ces tests verrouillent surtout la tolérance à ce mélange.

const ECHANTILLONS = [
  { memberKey: 'account.abc', teamId: 12, phase: 1, timestampSeconds: 0, x: 797985.18, y: 20327.03 },
  { memberKey: 'account.def', teamId: 3, phase: 2, timestampSeconds: 63, x: 12.5, y: 99.25 },
]

describe('encodeGeoColumn', () => {
  it('compresse un tableau et le restitue à l’identique', () => {
    const encode = encodeGeoColumn(ECHANTILLONS)
    expect(encode).toBeInstanceOf(Buffer)
    expect(decodeGeoColumn(encode, null)).toEqual(ECHANTILLONS)
  })

  it('rend null sur un tableau vide, pour que `IS NOT NULL` garde le sens de `JSON_LENGTH > 0`', () => {
    // Sans cette règle, un match sans position paraîtrait en porter une : le comptage de purge
    // et le rattrapage des fermetures de zone le sélectionneraient à tort.
    expect(encodeGeoColumn([])).toBeNull()
    expect(encodeGeoColumn(null)).toBeNull()
    expect(encodeGeoColumn(undefined)).toBeNull()
  })

  it('compresse réellement une charge répétitive', () => {
    const charge = Array.from({ length: 2000 }, (_, i) => ({ ...ECHANTILLONS[0], timestampSeconds: i }))
    const brut = Buffer.byteLength(JSON.stringify(charge), 'utf8')
    const compresse = encodeGeoColumn(charge)!
    expect(compresse.length).toBeLessThan(brut / 5)
  })
})

describe('decodeGeoColumn — les deux formats coexistent', () => {
  it('préfère la colonne compressée quand elle est renseignée', () => {
    const ancienne = [{ memberKey: 'ancien' }]
    expect(decodeGeoColumn(encodeGeoColumn(ECHANTILLONS), ancienne)).toEqual(ECHANTILLONS)
  })

  it('retombe sur la colonne en clair quand la compressée est vide', () => {
    expect(decodeGeoColumn(null, ECHANTILLONS)).toEqual(ECHANTILLONS)
    expect(decodeGeoColumn(undefined, ECHANTILLONS)).toEqual(ECHANTILLONS)
    expect(decodeGeoColumn(Buffer.alloc(0), ECHANTILLONS)).toEqual(ECHANTILLONS)
  })

  it('rend la chaîne JSON héritée telle quelle, les assistants d’analyse la gèrent déjà', () => {
    const json = JSON.stringify(ECHANTILLONS)
    expect(decodeGeoColumn(null, json)).toBe(json)
  })

  it('accepte un Uint8Array, MariaDB ne rendant pas toujours un Buffer', () => {
    const encode = encodeGeoColumn(ECHANTILLONS)!
    expect(decodeGeoColumn(new Uint8Array(encode), null)).toEqual(ECHANTILLONS)
  })

  it('traite un lot mixte — ancien et nouveau format — de façon identique', () => {
    // Le cas réel pendant tout le rattrapage : un même SELECT rend les deux formats.
    const lignes = [
      { positionSamplesGz: encodeGeoColumn(ECHANTILLONS), positionSamples: null },
      { positionSamplesGz: null, positionSamples: ECHANTILLONS },
    ]
    const decodes = lignes.map((l) => decodeGeoColumn(l.positionSamplesGz, l.positionSamples))
    expect(decodes[0]).toEqual(decodes[1])
  })
})

describe('decodeGeoColumn — échecs visibles', () => {
  it('lève une erreur explicite sur un blob sans en-tête gzip', () => {
    expect(() => decodeGeoColumn(Buffer.from('pas du gzip'), null)).toThrow(GeoColumnDecodeError)
  })

  it('lève une erreur explicite sur un gzip valide qui ne contient pas du JSON', () => {
    // Un tableau vide silencieux afficherait une carte vide sans la moindre explication.
    expect(() => decodeGeoColumn(gzipSync(Buffer.from('ceci n’est pas du JSON')), null)).toThrow(
      GeoColumnDecodeError
    )
  })
})

describe('hasGeoColumn', () => {
  it('reconnaît la présence de géolocalisation dans l’un ou l’autre format', () => {
    expect(hasGeoColumn(encodeGeoColumn(ECHANTILLONS), null)).toBe(true)
    expect(hasGeoColumn(null, ECHANTILLONS)).toBe(true)
    expect(hasGeoColumn(null, JSON.stringify(ECHANTILLONS))).toBe(true)
  })

  it('ne confond pas « vide » et « présent »', () => {
    expect(hasGeoColumn(null, null)).toBe(false)
    expect(hasGeoColumn(Buffer.alloc(0), null)).toBe(false)
    expect(hasGeoColumn(null, [])).toBe(false)
    expect(hasGeoColumn(null, '[]')).toBe(false)
  })
})
