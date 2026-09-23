import { beforeEach, describe, expect, it, vi } from 'vitest'

// Vitest ne collecte que `src/lib/**` (voir vitest.config.ts) : comme les autres
// `*-route-contracts.test.ts`, ce fichier vit dans src/lib et importe le handler depuis src/app.
//
// Contrats verrouillés ici :
//  - la route ne compte JAMAIS pendant la requête (le scan coûte ~247 s et dépassait le
//    proxy_read_timeout de Nginx, ce qui faisait afficher « Aucun match ne correspond au filtre »
//    alors que des milliers de matchs attendaient) ;
//  - sans comptage publié, démarrer une purge est refusé plutôt que lancé à l'aveugle ;
//  - la purge démarre côté serveur et la réponse ne l'attend pas.
// Voir docs/TODO/todo.md, Administration, Lot 2.

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  queryRaw: vi.fn(),
  readGeoPurgeCounts: vi.fn(),
  readGeoPurgeRunForDisplay: vi.fn(),
  refreshGeoPurgeCounts: vi.fn(),
  requestGeoPurgeCancel: vi.fn(),
  startGeoPurgeRun: vi.fn(),
}))

vi.mock('@/lib/auth-session', () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}))

vi.mock('@/lib/telemetry-geo-purge', async () => {
  const actual = await vi.importActual<typeof import('@/lib/telemetry-geo-purge')>(
    '@/lib/telemetry-geo-purge'
  )
  return {
    parseSelection: actual.parseSelection,
    readGeoPurgeCounts: mocks.readGeoPurgeCounts,
    readGeoPurgeRunForDisplay: mocks.readGeoPurgeRunForDisplay,
    refreshGeoPurgeCounts: mocks.refreshGeoPurgeCounts,
    requestGeoPurgeCancel: mocks.requestGeoPurgeCancel,
    startGeoPurgeRun: mocks.startGeoPurgeRun,
  }
})

type Route = typeof import('@/app/api/superuser/database/purge-telemetry/route')

/** Le drapeau « recomptage en cours » vit au niveau du module : chaque test repart d'un module neuf. */
async function freshRoute(): Promise<Route> {
  vi.resetModules()
  return import('@/app/api/superuser/database/purge-telemetry/route')
}

const getRequest = () => new Request('http://localhost:3000/api/superuser/database/purge-telemetry')

const postRequest = (body: unknown) =>
  new Request('http://localhost:3000/api/superuser/database/purge-telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const counts = (purgeable: number, protectedMatches = 211) => ({
  computedAt: '2026-09-23T06:00:00.000Z',
  durationMs: 247_000,
  totalRows: 18030,
  totalWithGeo: 8786,
  protectedMatches,
  byThreshold: {
    '14': { cutoff: '2026-09-09T00:00:00.000Z', targeted: purgeable + protectedMatches, protectedMatches, purgeable },
  },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSessionFromRequest.mockResolvedValue({ isSuperUser: true })
  mocks.queryRaw.mockResolvedValue([{ total: BigInt(18030) }])
  mocks.readGeoPurgeCounts.mockResolvedValue(null)
  mocks.readGeoPurgeRunForDisplay.mockResolvedValue(null)
  mocks.refreshGeoPurgeCounts.mockResolvedValue(counts(2932))
  mocks.requestGeoPurgeCancel.mockResolvedValue(true)
})

describe('GET /api/superuser/database/purge-telemetry', () => {
  it('sert le comptage publié sans jamais recompter pendant la requête', async () => {
    mocks.readGeoPurgeCounts.mockResolvedValue(counts(2932))

    const { GET } = await freshRoute()
    const body = await (await GET(getRequest() as never)).json()

    expect(body.counts.byThreshold['14'].purgeable).toBe(2932)
    expect(body.counts.byThreshold['14'].protectedMatches).toBe(211)
    expect(mocks.refreshGeoPurgeCounts).not.toHaveBeenCalled()
  })

  it('rend counts à null quand aucun comptage n’a encore été publié — et surtout pas 0', async () => {
    const { GET } = await freshRoute()
    const body = await (await GET(getRequest() as never)).json()

    expect(body.counts).toBeNull()
    expect(body.run).toBeNull()
  })

  it('expose la purge en cours pour que la page puisse la suivre après un retour', async () => {
    mocks.readGeoPurgeRunForDisplay.mockResolvedValue({
      status: 'running',
      olderThanDays: 14,
      cutoff: '2026-09-09T00:00:00.000Z',
      target: 2932,
      purged: 750,
      startedAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T10:02:00.000Z',
    })

    const { GET } = await freshRoute()
    const body = await (await GET(getRequest() as never)).json()

    expect(body.run).toMatchObject({ status: 'running', purged: 750, target: 2932 })
  })

  it('refuse un appelant qui n’est pas SuperUser', async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ isSuperUser: false })
    const { GET } = await freshRoute()
    expect((await GET(getRequest() as never)).status).toBe(403)
  })
})

describe('POST /api/superuser/database/purge-telemetry', () => {
  it('démarre la purge côté serveur avec le volume publié comme cible', async () => {
    mocks.readGeoPurgeCounts.mockResolvedValue(counts(2932))
    mocks.startGeoPurgeRun.mockResolvedValue({ started: true, state: { status: 'running', purged: 0 } })

    const { POST } = await freshRoute()
    const res = await POST(postRequest({ action: 'start', olderThanDays: '14' }) as never)
    const body = await res.json()

    expect(body).toMatchObject({ ok: true, started: true })
    expect(mocks.startGeoPurgeRun).toHaveBeenCalledWith(14, 2932)
  })

  it('refuse de purger tant qu’aucun comptage n’est disponible', async () => {
    const { POST } = await freshRoute()
    const res = await POST(postRequest({ action: 'start', olderThanDays: '14' }) as never)

    expect(res.status).toBe(409)
    expect(mocks.startGeoPurgeRun).not.toHaveBeenCalled()
  })

  it('ne démarre rien quand le seuil ne cible aucun match', async () => {
    mocks.readGeoPurgeCounts.mockResolvedValue(counts(0))

    const { POST } = await freshRoute()
    const body = await (await POST(postRequest({ action: 'start', olderThanDays: '14' }) as never)).json()

    expect(body).toMatchObject({ started: false, reason: 'nothing_to_purge' })
    expect(mocks.startGeoPurgeRun).not.toHaveBeenCalled()
  })

  it('refuse une seconde purge concurrente', async () => {
    mocks.readGeoPurgeCounts.mockResolvedValue(counts(2932))
    mocks.startGeoPurgeRun.mockResolvedValue({
      started: false,
      reason: 'already_running',
      state: { status: 'running', purged: 10 },
    })

    const { POST } = await freshRoute()
    const res = await POST(postRequest({ action: 'start', olderThanDays: '14' }) as never)

    expect(res.status).toBe(409)
  })

  it('transmet la demande d’interruption', async () => {
    const { POST } = await freshRoute()
    const body = await (await POST(postRequest({ action: 'cancel' }) as never)).json()

    expect(body).toMatchObject({ ok: true, cancelled: true })
    expect(mocks.requestGeoPurgeCancel).toHaveBeenCalled()
  })

  it('lance le recomptage sans attendre ses ~247 s', async () => {
    let resolveCount: (value: unknown) => void = () => {}
    mocks.refreshGeoPurgeCounts.mockReturnValue(new Promise((resolve) => {
      resolveCount = resolve
    }))

    const { POST } = await freshRoute()
    const body = await (await POST(postRequest({ action: 'recount' }) as never)).json()

    expect(body).toMatchObject({ ok: true, started: true })
    expect(mocks.refreshGeoPurgeCounts).toHaveBeenCalled()
    resolveCount(counts(2932))
  })
})
