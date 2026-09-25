import {
  buildTelemetrySuccessBasePayload,
  buildTelemetrySuccessPayloadWithJson,
  isTelemetryJsonFieldUnsupportedError,
  normalizeErrorMessage,
} from '@/lib/pubg-telemetry/persistence-payload'
import { parseTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import telemetrySample from '@/lib/pubg-telemetry/__fixtures__/telemetry-sample.json'
import { COMPRESSED_JSON_COLUMNS, decodeJsonColumn } from '@/lib/pubg-telemetry/json-codec'
import { Prisma } from '@prisma/client'

describe('telemetry persistence payload', () => {
  it('truncates long errors to database-safe length', () => {
    const long = 'x'.repeat(4500)
    const normalized = normalizeErrorMessage(long)

    expect(normalized.length).toBe(4000)
    expect(normalized.endsWith('...')).toBe(true)
  })

  it('detects unsupported JSON field errors from Prisma runtime', () => {
    expect(
      isTelemetryJsonFieldUnsupportedError(new Error('Unknown argument `summary` for upsert'))
    ).toBe(true)
    expect(isTelemetryJsonFieldUnsupportedError(new Error('Unexpected network error'))).toBe(
      false
    )
  })

  it('builds success payloads with parser JSON sections', () => {
    const parsed = parseTelemetrySnapshot(telemetrySample)

    const basePayload = buildTelemetrySuccessBasePayload({
      parserVersion: 'v1',
      parsedAt: new Date('2026-06-01T20:00:00.000Z'),
      telemetryGeneratedAt: '2026-06-01T19:00:00.000Z',
      contentLength: 123,
      bytesDownloaded: 120,
    })

    const fullPayload = buildTelemetrySuccessPayloadWithJson(basePayload, parsed)

    expect(fullPayload.status).toBe('success')
    expect(fullPayload.sourceGeneratedAt?.toISOString()).toBe('2026-06-01T19:00:00.000Z')
    expect(fullPayload.summary.totalEvents).toBe(10)
    // Depuis le 2026-09-25, les sections volumineuses partent compressees : on verifie leur
    // contenu a travers le codec, la colonne en clair etant desormais vide.
    expect(decodeJsonColumn(fullPayload.weaponStatsGz, null)).toHaveLength(
      (parsed.weaponStats as unknown[]).length
    )
    expect(decodeJsonColumn(fullPayload.memberStatsGz, null)).toHaveLength(
      (parsed.memberStats as unknown[]).length
    )
  })

  it('ecrit toutes les sections compressees et laisse les colonnes en clair vides', () => {
    // La colonne en clair doit partir a NULL cote base (`Prisma.DbNull`) : la laisser remplie
    // annulerait tout le gain, et la remplir de `null` JSON ne viderait pas la place.
    const parsed = parseTelemetrySnapshot(telemetrySample)
    const payload = buildTelemetrySuccessPayloadWithJson(
      buildTelemetrySuccessBasePayload({
        parserVersion: 'v1',
        parsedAt: new Date('2026-09-24T20:00:00.000Z'),
        telemetryGeneratedAt: null,
        contentLength: null,
        bytesDownloaded: 0,
      }),
      parsed
    )

    // `summary` reste en clair : cinq routes l'interrogent par JSON_EXTRACT.
    expect(payload.summary).not.toBe(Prisma.DbNull)

    for (const colonne of COMPRESSED_JSON_COLUMNS) {
      const enClair = (payload as Record<string, unknown>)[colonne]
      expect(enClair, `${colonne} doit partir a NULL`).toBe(Prisma.DbNull)
    }

    // Aller-retour : ce qui est ecrit doit etre relisible a l'identique.
    expect(Buffer.isBuffer(payload.memberStatsGz)).toBe(true)
    expect(decodeJsonColumn(payload.memberStatsGz, null)).toEqual(parsed.memberStats)

    if (parsed.positionSamples.length > 0) {
      expect(decodeJsonColumn(payload.positionSamplesGz, null)).toEqual(parsed.positionSamples)
    } else {
      // Un match sans position n'ecrit aucun blob : `IS NOT NULL` garde son sens.
      expect(payload.positionSamplesGz).toBeNull()
    }
  })
})
