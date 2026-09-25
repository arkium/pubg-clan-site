import { describe, expect, it } from 'vitest'
import { gzipSync } from 'node:zlib'

import {
  COMPRESSED_JSON_COLUMNS,
  JsonColumnDecodeError,
  decodeJsonColumn,
  decodeTelemetryRow,
  encodeJsonColumn,
  hasJsonColumn,
} from '@/lib/pubg-telemetry/json-codec'

// Les colonnes JSON de SquadMatchTelemetry étaient stockées en `longtext` : ~20 Go de texte brut.
// La compression les ramène à ~2 Go, ce qui rend possible la reconstruction de la table. La
// migration étant graduelle, les deux formats coexisteront des mois : ces tests verrouillent
// surtout la tolérance à ce mélange, et le refus de perdre une donnée en silence.

const ECHANTILLONS = [
  { memberKey: 'account.abc', teamId: 12, phase: 1, timestampSeconds: 0, x: 797985.18, y: 20327.03 },
  { memberKey: 'account.def', teamId: 3, phase: 2, timestampSeconds: 63, x: 12.5, y: 99.25 },
]

describe('COMPRESSED_JSON_COLUMNS', () => {
  it('exclut summary, que cinq routes interrogent en SQL par JSON_EXTRACT', () => {
    // Compresser `summary` casserait /telemetry/circles, heatmap, loot et vehicles, sans erreur
    // visible : les agrégats tomberaient simplement à zéro.
    expect(COMPRESSED_JSON_COLUMNS).not.toContain('summary')
  })

  it('couvre les quinze colonnes volumineuses', () => {
    expect(COMPRESSED_JSON_COLUMNS).toContain('positionSamples')
    expect(COMPRESSED_JSON_COLUMNS).toContain('memberStats')
    expect(COMPRESSED_JSON_COLUMNS).toContain('carePackageSamples')
    expect(new Set(COMPRESSED_JSON_COLUMNS).size).toBe(COMPRESSED_JSON_COLUMNS.length)
  })
})

describe('encodeJsonColumn', () => {
  it('compresse et restitue à l’identique', () => {
    expect(decodeJsonColumn(encodeJsonColumn(ECHANTILLONS), null)).toEqual(ECHANTILLONS)
  })

  it('rend null sur une valeur vide, pour que `IS NOT NULL` garde le sens de `JSON_LENGTH > 0`', () => {
    // Sans cette règle, un match sans donnée paraîtrait en porter une : purges et rattrapages le
    // sélectionneraient à tort, indéfiniment.
    expect(encodeJsonColumn([])).toBeNull()
    expect(encodeJsonColumn(null)).toBeNull()
    expect(encodeJsonColumn(undefined)).toBeNull()
  })

  it('préserve un objet, pas seulement un tableau', () => {
    const stats = { totalEvents: 10, killEvents: 3, nested: { a: [1, 2, 3] } }
    expect(decodeJsonColumn(encodeJsonColumn(stats), null)).toEqual(stats)
  })

  it('compresse réellement une charge répétitive', () => {
    const charge = Array.from({ length: 2000 }, (_, i) => ({ ...ECHANTILLONS[0], timestampSeconds: i }))
    const brut = Buffer.byteLength(JSON.stringify(charge), 'utf8')
    expect(encodeJsonColumn(charge)!.length).toBeLessThan(brut / 5)
  })
})

describe('decodeJsonColumn — les deux formats coexistent', () => {
  it('préfère la colonne compressée', () => {
    expect(decodeJsonColumn(encodeJsonColumn(ECHANTILLONS), [{ memberKey: 'ancien' }])).toEqual(ECHANTILLONS)
  })

  it('retombe sur la colonne en clair quand la compressée est vide', () => {
    expect(decodeJsonColumn(null, ECHANTILLONS)).toEqual(ECHANTILLONS)
    expect(decodeJsonColumn(Buffer.alloc(0), ECHANTILLONS)).toEqual(ECHANTILLONS)
  })

  it('accepte un Uint8Array, MariaDB ne rendant pas toujours un Buffer', () => {
    expect(decodeJsonColumn(new Uint8Array(encodeJsonColumn(ECHANTILLONS)!), null)).toEqual(ECHANTILLONS)
  })

  it('lève une erreur nommant la colonne plutôt que de rendre du vide', () => {
    expect(() => decodeJsonColumn(Buffer.from('pas du gzip'), null, 'memberStats')).toThrow(
      JsonColumnDecodeError
    )
    expect(() => decodeJsonColumn(gzipSync(Buffer.from('pas du JSON')), null, 'memberStats')).toThrow(
      /memberStats/
    )
  })
})

describe('decodeTelemetryRow', () => {
  it('normalise toutes les colonnes présentes en une passe', () => {
    const row = {
      squadMatchId: 'abc',
      positionSamples: null,
      positionSamplesGz: encodeJsonColumn(ECHANTILLONS),
      memberStats: null,
      memberStatsGz: encodeJsonColumn([{ memberKey: 'x', kills: 3 }]),
    }

    const normalisee = decodeTelemetryRow(row)

    expect(normalisee.positionSamples).toEqual(ECHANTILLONS)
    expect(normalisee.memberStats).toEqual([{ memberKey: 'x', kills: 3 }])
    expect(normalisee.squadMatchId).toBe('abc')
  })

  it('traite un lot mixte — ancien et nouveau format — de façon identique', () => {
    // Le cas réel pendant tout le rattrapage : un même SELECT rend les deux formats.
    const lignes = [
      { positionSamples: null, positionSamplesGz: encodeJsonColumn(ECHANTILLONS) },
      { positionSamples: ECHANTILLONS, positionSamplesGz: null },
    ]
    const [compresse, clair] = lignes.map((l) => decodeTelemetryRow({ ...l }))
    expect(compresse.positionSamples).toEqual(clair.positionSamples)
  })

  it('laisse intacte une colonne absente de la requête', () => {
    // Chaque site sélectionne son propre sous-ensemble : la normalisation ne doit rien inventer.
    const row = { squadMatchId: 'abc', memberStats: ECHANTILLONS }
    expect(decodeTelemetryRow({ ...row })).toEqual(row)
  })

  it('ne touche pas une colonne dont la version compressée est nulle', () => {
    const row = { deathSamples: ECHANTILLONS, deathSamplesGz: null }
    expect(decodeTelemetryRow({ ...row }).deathSamples).toEqual(ECHANTILLONS)
  })
})

describe('hasJsonColumn', () => {
  it('reconnaît la présence dans l’un ou l’autre format', () => {
    expect(hasJsonColumn(encodeJsonColumn(ECHANTILLONS), null)).toBe(true)
    expect(hasJsonColumn(null, ECHANTILLONS)).toBe(true)
    expect(hasJsonColumn(null, JSON.stringify(ECHANTILLONS))).toBe(true)
  })

  it('ne confond pas « vide » et « présent »', () => {
    expect(hasJsonColumn(null, null)).toBe(false)
    expect(hasJsonColumn(Buffer.alloc(0), null)).toBe(false)
    expect(hasJsonColumn(null, [])).toBe(false)
    expect(hasJsonColumn(null, '[]')).toBe(false)
  })
})
