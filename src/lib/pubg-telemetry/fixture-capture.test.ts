import { parseTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'

import fixture from '@/lib/pubg-telemetry/__fixtures__/telemetry-golden-standard.json'
import {
  captureTelemetryFixtureFromStream,
  getTelemetryFixtureCaptureMaxBytes,
} from '@/lib/pubg-telemetry/fixture-capture'

function createStreamFromJson(value: unknown) {
  const encoder = new TextEncoder()
  const payload = JSON.stringify(value)

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload))
      controller.close()
    },
  })
}

describe('fixture capture anonymization', () => {
  it('clamps capture max bytes to hard safety cap', () => {
    const previous = process.env.TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES
    process.env.TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES = '52428800'

    expect(getTelemetryFixtureCaptureMaxBytes()).toBe(50 * 1024 * 1024)

    if (previous === undefined) {
      delete process.env.TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES
    } else {
      process.env.TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES = previous
    }
  })

  it('captures valid fixture files that remain parseable', async () => {
    const stream = createStreamFromJson([
      {
        _T: 'LogPlayerKill',
        killerName: 'RealUserAlpha',
        victimName: 'RealUserBravo',
        accountId: 'account.real.alpha',
        character: {
          name: 'RealUserAlpha',
          teamId: 31,
        },
        weapon: 'WeapM416_C',
        damage: 99,
      },
      ...fixture,
    ])

    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const path = await import('node:path')
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telemetry-fixture-capture-'))
    const previousCaptureDir = process.env.TELEMETRY_CAPTURE_FIXTURES_DIR
    process.env.TELEMETRY_CAPTURE_FIXTURES_DIR = tempDir

    const captured = await captureTelemetryFixtureFromStream({
      stream,
      squadMatchId: 'squad_test_001',
      pubgMatchId: 'match_test_001',
    })

    expect(captured.eventCount).toBeGreaterThan(0)

    const fileText = await fs.readFile(captured.filePath, 'utf-8')
    const parsed = JSON.parse(fileText)

    expect(Array.isArray(parsed)).toBe(true)
    expect(fileText.includes('RealUserAlpha')).toBe(false)
    expect(fileText.includes('account.real.alpha')).toBe(false)
    expect(parseTelemetrySnapshot(parsed).summary.totalEvents).toBeGreaterThan(0)

    await fs.rm(tempDir, { recursive: true, force: true })

    if (previousCaptureDir === undefined) {
      delete process.env.TELEMETRY_CAPTURE_FIXTURES_DIR
    } else {
      process.env.TELEMETRY_CAPTURE_FIXTURES_DIR = previousCaptureDir
    }
  })

  it('writes a valid truncated fixture when max capture bytes is reached', async () => {
    const largeEvents = Array.from({ length: 200 }, (_, index) => ({
      _T: 'LogPlayerTakeDamage',
      attackerName: `RealUser_${index}`,
      victimName: `RealVictim_${index}`,
      accountId: `account.real.${index}`,
      character: {
        name: `RealUser_${index}`,
        teamId: 10 + (index % 4),
      },
      damage: 10,
      payload: 'x'.repeat(220),
    }))

    const stream = createStreamFromJson(largeEvents)

    const fs = await import('node:fs/promises')
    const os = await import('node:os')
    const path = await import('node:path')
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'telemetry-fixture-capture-truncated-'))
    const previousCaptureDir = process.env.TELEMETRY_CAPTURE_FIXTURES_DIR
    const previousMaxBytes = process.env.TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES

    process.env.TELEMETRY_CAPTURE_FIXTURES_DIR = tempDir
    process.env.TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES = '2048'

    const captured = await captureTelemetryFixtureFromStream({
      stream,
      squadMatchId: 'squad_test_truncated',
      pubgMatchId: 'match_test_truncated',
    })

    expect(captured.wasTruncated).toBe(true)
    expect(captured.eventCount).toBeGreaterThan(0)
    expect(captured.eventCount).toBeLessThan(largeEvents.length)

    const fileText = await fs.readFile(captured.filePath, 'utf-8')
    const parsed = JSON.parse(fileText)

    expect(Array.isArray(parsed)).toBe(true)
    expect(parseTelemetrySnapshot(parsed).summary.totalEvents).toBe(captured.eventCount)

    await fs.rm(tempDir, { recursive: true, force: true })

    if (previousCaptureDir === undefined) {
      delete process.env.TELEMETRY_CAPTURE_FIXTURES_DIR
    } else {
      process.env.TELEMETRY_CAPTURE_FIXTURES_DIR = previousCaptureDir
    }

    if (previousMaxBytes === undefined) {
      delete process.env.TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES
    } else {
      process.env.TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES = previousMaxBytes
    }
  })
})
