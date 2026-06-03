import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/pubg-telemetry/backlog', () => ({
  listSquadMatchesNeedingTelemetry: vi.fn(),
}))

vi.mock('@/lib/pubg-telemetry/index', () => ({
  syncTelemetryForSquadMatch: vi.fn(),
  upsertFailedTelemetrySnapshot: vi.fn(),
}))

import { listSquadMatchesNeedingTelemetry } from '@/lib/pubg-telemetry/backlog'
import {
  syncTelemetryForSquadMatch,
  upsertFailedTelemetrySnapshot,
} from '@/lib/pubg-telemetry/index'
import { syncTelemetryBatchForRecentSquadMatches } from '@/lib/pubg-telemetry/job'

const mockedListBacklog = vi.mocked(listSquadMatchesNeedingTelemetry)
const mockedSyncTelemetry = vi.mocked(syncTelemetryForSquadMatch)
const mockedUpsertFailedSnapshot = vi.mocked(upsertFailedTelemetrySnapshot)

describe('syncTelemetryBatchForRecentSquadMatches retry/backoff', () => {
  beforeEach(() => {
    mockedListBacklog.mockReset()
    mockedSyncTelemetry.mockReset()
    mockedUpsertFailedSnapshot.mockReset()
  })

  afterEach(() => {
    delete process.env.TELEMETRY_RETRY_MAX
    delete process.env.TELEMETRY_RETRY_BASE_DELAY_MS
    vi.useRealTimers()
  })

  it('retries transient failures and succeeds on next attempt', async () => {
    process.env.TELEMETRY_RETRY_MAX = '2'
    process.env.TELEMETRY_RETRY_BASE_DELAY_MS = '50'

    mockedListBacklog.mockResolvedValue([
      {
        id: 'squad_1',
        pubgMatchId: 'match_1',
        telemetry: null,
        members: [
          {
            memberId: 1,
            member: {
              id: 1,
              clanId: 7,
              pubgAccountId: 'account.player.1',
              platformShard: 'steam',
            },
          },
        ],
      },
    ])

    mockedSyncTelemetry
      .mockResolvedValueOnce({
        squadMatchId: 'squad_1',
        pubgMatchId: 'match_1',
        status: 'failed',
        bytesDownloaded: 0,
        contentLength: null,
        errorCode: 'TELEMETRY_SYNC_FAILED',
        errorMessage: 'Telemetry asset download failed (503)',
        durationMs: 12,
      })
      .mockResolvedValueOnce({
        squadMatchId: 'squad_1',
        pubgMatchId: 'match_1',
        status: 'success',
        bytesDownloaded: 123,
        contentLength: 123,
        errorCode: null,
        errorMessage: null,
        durationMs: 10,
      })

    vi.useFakeTimers()

    const runPromise = syncTelemetryBatchForRecentSquadMatches({
      maxMatchesPerRun: 20,
      concurrency: 1,
      clanId: 7,
      parserVersion: 'v1',
    })

    await vi.runAllTimersAsync()
    const result = await runPromise

    expect(result.parsed).toBe(1)
    expect(result.failed).toBe(0)
    expect(mockedSyncTelemetry).toHaveBeenCalledTimes(2)
    expect(mockedUpsertFailedSnapshot).not.toHaveBeenCalled()
  })

  it('does not retry deterministic failures', async () => {
    process.env.TELEMETRY_RETRY_MAX = '3'

    mockedListBacklog.mockResolvedValue([
      {
        id: 'squad_2',
        pubgMatchId: 'match_2',
        telemetry: null,
        members: [
          {
            memberId: 2,
            member: {
              id: 2,
              clanId: 7,
              pubgAccountId: 'account.player.2',
              platformShard: 'steam',
            },
          },
        ],
      },
    ])

    mockedSyncTelemetry.mockResolvedValue({
      squadMatchId: 'squad_2',
      pubgMatchId: 'match_2',
      status: 'failed',
      bytesDownloaded: 0,
      contentLength: null,
      errorCode: 'ASSET_URL_MISSING',
      errorMessage: 'No telemetry asset URL returned by PUBG API for this match',
      durationMs: 8,
    })

    const result = await syncTelemetryBatchForRecentSquadMatches({
      maxMatchesPerRun: 20,
      concurrency: 1,
      clanId: 7,
      parserVersion: 'v1',
    })

    expect(result.parsed).toBe(0)
    expect(result.failed).toBe(1)
    expect(mockedSyncTelemetry).toHaveBeenCalledTimes(1)
  })

  it('passes parserVersion to backlog selection for reprocessing', async () => {
    mockedListBacklog.mockResolvedValue([])

    await syncTelemetryBatchForRecentSquadMatches({
      maxMatchesPerRun: 5,
      concurrency: 1,
      clanId: 9,
      parserVersion: 'v2',
    })

    expect(mockedListBacklog).toHaveBeenCalledWith(5, {
      clanId: 9,
      parserVersion: 'v2',
      retryMax: 2,
    })
  })

  it('prioritizes failed, then pending, then rebuild candidates', async () => {
    mockedListBacklog.mockResolvedValue([
      {
        id: 'squad_rebuild',
        pubgMatchId: 'match_rebuild',
        telemetry: {
          status: 'success',
          parserVersion: 'v1',
          attemptCount: 0,
          nextRetryAt: null,
        },
        members: [
          {
            memberId: 10,
            member: {
              id: 10,
              clanId: 7,
              pubgAccountId: 'account.player.10',
              platformShard: 'steam',
            },
          },
        ],
      },
      {
        id: 'squad_failed',
        pubgMatchId: 'match_failed',
        telemetry: {
          status: 'failed',
          parserVersion: 'v1',
          attemptCount: 1,
          nextRetryAt: null,
        },
        members: [
          {
            memberId: 11,
            member: {
              id: 11,
              clanId: 7,
              pubgAccountId: 'account.player.11',
              platformShard: 'steam',
            },
          },
        ],
      },
      {
        id: 'squad_pending',
        pubgMatchId: 'match_pending',
        telemetry: null,
        members: [
          {
            memberId: 12,
            member: {
              id: 12,
              clanId: 7,
              pubgAccountId: 'account.player.12',
              platformShard: 'steam',
            },
          },
        ],
      },
    ])

    mockedSyncTelemetry.mockImplementation(async (input) => ({
      squadMatchId: input.squadMatchId,
      pubgMatchId: input.pubgMatchId,
      status: 'success',
      bytesDownloaded: 10,
      contentLength: 10,
      errorCode: null,
      errorMessage: null,
      durationMs: 3,
    }))

    const result = await syncTelemetryBatchForRecentSquadMatches({
      maxMatchesPerRun: 10,
      concurrency: 1,
      clanId: 7,
      parserVersion: 'v2',
    })

    const orderedSquadIds = mockedSyncTelemetry.mock.calls.map((call) => call[0].squadMatchId)
    expect(orderedSquadIds).toEqual(['squad_failed', 'squad_pending', 'squad_rebuild'])
    expect(result.reprocessed).toBe(1)
    expect(result.queued).toEqual({
      failed: 1,
      pending: 1,
      rebuild: 1,
    })
  })
})
