import { beforeEach, describe, expect, it, vi } from 'vitest'

// `OPTIMIZE TABLE` reconstruit la table entière : il exige autant d'espace disque libre qu'elle
// occupe. Sur `SquadMatchTelemetry` (20,57 Go pour 1,57 Go récupérables, ~10 Go libres au
// 2026-09-24), le lancer aurait rempli le disque d'une VM mutualisée. Ces tests verrouillent le
// garde-fou : il refuse par défaut, y compris — et surtout — quand l'espace n'est pas mesurable.

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  statfs: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn(),
    appConfig: { findUnique: mocks.findUnique, upsert: mocks.upsert },
  },
}))

vi.mock('node:fs/promises', () => ({ statfs: mocks.statfs }))

import {
  DISK_HEADROOM_RATIO,
  MIN_RECLAIMABLE_MB,
  assessOptimize,
  isOptimizeRunStale,
  startOptimizeRun,
  type OptimizeRunState,
} from '@/lib/table-maintenance'

const MO = 1024 * 1024

/** `information_schema` puis `datadir` : l'ordre des appels du module. */
function mockDatabase(options: { totalMb: number; freeInFileMb: number }) {
  mocks.queryRaw.mockImplementation((strings: unknown) => {
    const sql = Array.isArray(strings) ? strings.join(' ') : String(strings)
    if (sql.includes('information_schema.TABLES')) {
      return Promise.resolve([
        {
          tableName: 'SquadMatchTelemetry',
          rowCount: BigInt(18050),
          dataSizeMb: options.totalMb,
          indexSizeMb: 0,
          dataFreeMb: options.freeInFileMb,
        },
      ])
    }
    if (sql.includes('GLOBAL_VARIABLES')) return Promise.resolve([{ v: '/var/lib/mysql' }])
    throw new Error(`Requête inattendue : ${sql}`)
  })
}

function mockDisk(freeMb: number | null) {
  if (freeMb === null) {
    mocks.statfs.mockRejectedValue(new Error('ENOENT'))
    return
  }
  mocks.statfs.mockResolvedValue({ bsize: MO, bavail: freeMb, blocks: freeMb * 4 })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findUnique.mockResolvedValue(null)
  mocks.upsert.mockResolvedValue({})
})

describe('assessOptimize', () => {
  it('refuse quand le disque ne peut pas accueillir la reconstruction', async () => {
    mockDatabase({ totalMb: 20_570, freeInFileMb: 1_570 })
    mockDisk(10_000)

    const a = await assessOptimize('SquadMatchTelemetry')

    expect(a.verdict).toBe('blocked_disk')
    expect(a.requiredMb).toBe(Math.round(20_570 * DISK_HEADROOM_RATIO))
    expect(a.reason).toContain('insuffisant')
  })

  it('refuse aussi quand l’espace disque n’est pas mesurable — le doute ne profite pas à l’opération', async () => {
    mockDatabase({ totalMb: 20_570, freeInFileMb: 1_570 })
    mockDisk(null) // base sur un autre hôte : le datadir n'existe pas ici

    const a = await assessOptimize('SquadMatchTelemetry')

    expect(a.verdict).toBe('blocked_unknown_disk')
    expect(a.disk.measured).toBe(false)
  })

  it('juge le compactage inutile quand il n’y a presque rien à récupérer', async () => {
    mockDatabase({ totalMb: 20_570, freeInFileMb: MIN_RECLAIMABLE_MB - 1 })
    mockDisk(40_000)

    const a = await assessOptimize('SquadMatchTelemetry')

    expect(a.verdict).toBe('pointless')
    expect(a.reason).toContain('réutilisé')
  })

  it('autorise quand le disque suit et que le gain est réel', async () => {
    mockDatabase({ totalMb: 15_000, freeInFileMb: 7_000 })
    mockDisk(40_000)

    const a = await assessOptimize('SquadMatchTelemetry')

    expect(a.verdict).toBe('useful')
  })
})

describe('startOptimizeRun', () => {
  it('ne lance rien quand le disque est insuffisant', async () => {
    mockDatabase({ totalMb: 20_570, freeInFileMb: 5_000 })
    mockDisk(10_000)

    const result = await startOptimizeRun('SquadMatchTelemetry')

    expect(result.started).toBe(false)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('ne lance rien non plus quand l’espace est inconnu, même avec force', async () => {
    mockDatabase({ totalMb: 20_570, freeInFileMb: 5_000 })
    mockDisk(null)

    const result = await startOptimizeRun('SquadMatchTelemetry', { force: true })

    expect(result.started).toBe(false)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('accepte un compactage jugé inutile seulement sur demande explicite', async () => {
    mockDatabase({ totalMb: 15_000, freeInFileMb: 10 })
    mockDisk(40_000)

    expect((await startOptimizeRun('SquadMatchTelemetry')).started).toBe(false)
    expect((await startOptimizeRun('SquadMatchTelemetry', { force: true })).started).toBe(true)
  })
})

describe('isOptimizeRunStale', () => {
  const run = (updatedAt: string, status: OptimizeRunState['status'] = 'running'): OptimizeRunState => ({
    status,
    table: 'SquadMatchTelemetry',
    startedAt: '2026-09-24T10:00:00.000Z',
    updatedAt,
  })

  it('signale un compactage dont le battement de cœur s’est tu', () => {
    expect(isOptimizeRunStale(run('2026-09-24T10:00:00.000Z'), new Date('2026-09-24T10:06:00.000Z'))).toBe(true)
  })

  it('laisse vivre un compactage qui bat encore', () => {
    expect(isOptimizeRunStale(run('2026-09-24T10:05:00.000Z'), new Date('2026-09-24T10:06:00.000Z'))).toBe(false)
  })

  it('ne requalifie pas un compactage terminé', () => {
    expect(isOptimizeRunStale(run('2026-09-24T10:00:00.000Z', 'done'), new Date('2027-01-01T00:00:00.000Z'))).toBe(false)
  })
})
