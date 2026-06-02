import {
  buildTelemetrySuccessBasePayload,
  buildTelemetrySuccessPayloadWithJson,
  isTelemetryJsonFieldUnsupportedError,
  normalizeErrorMessage,
} from '@/lib/pubg-telemetry/persistence-payload'
import { parseTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import telemetrySample from '@/lib/pubg-telemetry/__fixtures__/telemetry-sample.json'

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
    expect(fullPayload.weaponStats.length).toBeGreaterThan(0)
    expect(fullPayload.memberStats.length).toBeGreaterThan(0)
  })
})
