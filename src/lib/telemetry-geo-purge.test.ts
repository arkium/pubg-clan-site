import { beforeEach, describe, expect, it, vi } from 'vitest'

// Prisma neutralisé : seules les requêtes brutes de la purge de conservation et son interrupteur sont simulés.
const mocks = vi.hoisted(() => ({ queryRaw: vi.fn(), executeRaw: vi.fn(), configFindUnique: vi.fn(), configUpsert: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
    appConfig: { findUnique: mocks.configFindUnique, upsert: mocks.configUpsert },
  },
}))

import { GEO_PROTECTED_RETENTION_DAYS, GEO_RETENTION_DAYS } from '@/lib/geo-retention'
import {
  GEO_PURGE_BATCH_SIZE,
  GEO_PURGE_NOTICE_TTL_MS,
  GEO_PURGE_RUN_STALE_MS,
  GEO_RETENTION_ENABLED_KEY,
  applyGeoRetention,
  isNoticeExpired,
  isRunStale,
  parseSelection,
  purgeExpiredGeolocation,
  resolveCutoff,
  resolveRetentionCutoffs,
  retentionTargetOf,
  writeGeoRetentionEnabled,
  type GeoPurgeCounts,
  type GeoPurgeRunState,
} from '@/lib/telemetry-geo-purge'

beforeEach(() => {
  mocks.queryRaw.mockReset()
  mocks.executeRaw.mockReset()
  mocks.configFindUnique.mockReset()
  mocks.configUpsert.mockReset()
})

describe('resolveCutoff', () => {
  it('cale la borne sur minuit : la journée en cours n’est jamais purgée', () => {
    // 23/09 à 18h33 : la borne « 14 jours » tombe au 09/09 à 00h00, pas au 09/09 à 18h33.
    const now = new Date(2026, 8, 23, 18, 33, 12)
    const cutoff = resolveCutoff(14, now)!

    expect(cutoff.getFullYear()).toBe(2026)
    expect(cutoff.getMonth()).toBe(8)
    expect(cutoff.getDate()).toBe(9)
    expect(cutoff.getHours()).toBe(0)
    expect(cutoff.getMinutes()).toBe(0)
    expect(cutoff.getSeconds()).toBe(0)
  })

  it('ne bouge pas au fil de la journée : le nombre annoncé reste celui qui sera purgé', () => {
    const matin = resolveCutoff(14, new Date(2026, 8, 23, 7, 0, 0))!
    const soir = resolveCutoff(14, new Date(2026, 8, 23, 23, 59, 59))!

    expect(matin.getTime()).toBe(soir.getTime())
  })

  it('franchit correctement un changement de mois', () => {
    const cutoff = resolveCutoff(14, new Date(2026, 8, 5, 12, 0, 0))!
    expect(cutoff.getMonth()).toBe(7)
    expect(cutoff.getDate()).toBe(22)
  })

  it('ne pose aucune borne pour « tous les matchs »', () => {
    expect(resolveCutoff('all', new Date())).toBeNull()
  })
})

describe('parseSelection', () => {
  it('accepte les seuils proposés par l’interface', () => {
    expect(parseSelection('7')).toBe(7)
    expect(parseSelection('30')).toBe(30)
    expect(parseSelection(90)).toBe(90)
    expect(parseSelection('all')).toBe('all')
    expect(parseSelection('0')).toBe('all')
  })

  it('retombe sur 14 jours devant une valeur inconnue plutôt que de tout purger', () => {
    expect(parseSelection('999')).toBe(14)
    expect(parseSelection('abc')).toBe(14)
    expect(parseSelection(null)).toBe(14)
    expect(parseSelection(undefined)).toBe(14)
  })
})

describe('isNoticeExpired', () => {
  const termine = (finishedAt: string): GeoPurgeRunState => ({
    status: 'done',
    olderThanDays: 14,
    cutoff: null,
    target: 2679,
    purged: 2723,
    startedAt: '2026-09-23T20:50:00.000Z',
    updatedAt: finishedAt,
    finishedAt,
  })

  it('laisse le compte rendu visible juste apres la purge', () => {
    const fin = '2026-09-23T20:55:00.000Z'
    expect(isNoticeExpired(termine(fin), new Date('2026-09-23T22:00:00.000Z'))).toBe(false)
  })

  it('cesse de l’afficher passe le delai : ce n’est plus une nouvelle', () => {
    // Le compte rendu restait affiche indefiniment et laissait croire a une action en attente.
    const fin = '2026-09-23T20:55:00.000Z'
    const apres = new Date(new Date(fin).getTime() + GEO_PURGE_NOTICE_TTL_MS + 1000)
    expect(isNoticeExpired(termine(fin), apres)).toBe(true)
  })

  it('n’expire jamais un run encore en cours', () => {
    const encours = { ...termine('2026-09-23T20:55:00.000Z'), status: 'running' as const }
    expect(isNoticeExpired(encours, new Date('2027-01-01T00:00:00.000Z'))).toBe(false)
  })
})

describe('isRunStale', () => {
  const run = (overrides: Partial<GeoPurgeRunState> = {}): GeoPurgeRunState => ({
    status: 'running',
    olderThanDays: 14,
    cutoff: null,
    target: 100,
    purged: 10,
    startedAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z',
    ...overrides,
  })

  it('considère orphelin un run dont le battement de cœur a cessé', () => {
    const now = new Date(new Date('2026-09-23T10:00:00.000Z').getTime() + GEO_PURGE_RUN_STALE_MS + 1000)
    expect(isRunStale(run(), now)).toBe(true)
  })

  it('laisse vivre un run qui bat encore', () => {
    const now = new Date(new Date('2026-09-23T10:00:00.000Z').getTime() + 60_000)
    expect(isRunStale(run(), now)).toBe(false)
  })

  it('ne requalifie jamais un run déjà terminé', () => {
    const now = new Date('2027-01-01T00:00:00.000Z')
    expect(isRunStale(run({ status: 'done' }), now)).toBe(false)
    expect(isRunStale(run({ status: 'cancelled' }), now)).toBe(false)
  })
})

describe('conservation de la géolocalisation', () => {
  // Valeurs interpolées d'une requête brute (`prisma.$queryRaw\`…\``) : les dates bornes y sont passées telles quelles.
  const datesOf = (call: unknown[]) => call.slice(1).filter((value): value is Date => value instanceof Date)
  const ids = (count: number, from = 0) => Array.from({ length: count }, (_, index) => ({ id: `t${from + index}` }))

  it('30 jours, 90 pour un Top 1 ou un custom (décision du 2026-10-27, affichée sur les pages publiques)', () => {
    expect(GEO_RETENTION_DAYS).toBe(30)
    expect(GEO_PROTECTED_RETENTION_DAYS).toBe(90)
  })

  it('bornes calées sur minuit, comme la purge manuelle', () => {
    const now = new Date(2026, 9, 27, 1, 15, 0)
    const { standardCutoff, protectedCutoff } = resolveRetentionCutoffs(now)

    expect(standardCutoff.getTime()).toBe(new Date(2026, 8, 27).getTime())
    expect(protectedCutoff.getTime()).toBe(new Date(2026, 6, 29).getTime())
  })

  it('vide les lots jusqu’à épuisement et compte les matchs vidés', async () => {
    mocks.queryRaw
      .mockResolvedValueOnce(ids(GEO_PURGE_BATCH_SIZE))
      .mockResolvedValueOnce(ids(12, GEO_PURGE_BATCH_SIZE))
    mocks.executeRaw.mockImplementation(async () => 0)

    const now = new Date(2026, 9, 27, 1, 15, 0)
    expect(await purgeExpiredGeolocation(now, { pauseMs: 0 })).toBe(GEO_PURGE_BATCH_SIZE + 12)

    expect(mocks.queryRaw).toHaveBeenCalledTimes(2)
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2)
    // Chaque sélection porte les deux bornes : 30 jours pour tous, 90 pour les matchs protégés.
    const { standardCutoff, protectedCutoff } = resolveRetentionCutoffs(now)
    expect(datesOf(mocks.queryRaw.mock.calls[0])).toEqual([standardCutoff, protectedCutoff])
    const sql = (mocks.queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?')
    expect(sql).toMatch(/AND \(NOT \? OR \? < \?\)/)
  })

  it('n’écrit rien quand aucun match n’a dépassé sa durée', async () => {
    mocks.queryRaw.mockResolvedValueOnce([])

    expect(await purgeExpiredGeolocation(new Date(), { pauseMs: 0 })).toBe(0)
    expect(mocks.executeRaw).not.toHaveBeenCalled()
  })
})

describe('interrupteur de la conservation automatique', () => {
  it('fermé par défaut : clé absente, la maintenance ne lit ni n’écrit aucun match', async () => {
    mocks.configFindUnique.mockResolvedValue(null)

    expect(await applyGeoRetention(new Date(), { pauseMs: 0 })).toEqual({ enabled: false })
    expect(mocks.configFindUnique).toHaveBeenCalledWith({ where: { key: GEO_RETENTION_ENABLED_KEY } })
    expect(mocks.queryRaw).not.toHaveBeenCalled()
    expect(mocks.executeRaw).not.toHaveBeenCalled()
  })

  it('reste fermé pour toute valeur autre que « true »', async () => {
    for (const value of ['false', '1', 'TRUE', '']) {
      mocks.configFindUnique.mockResolvedValueOnce({ key: GEO_RETENTION_ENABLED_KEY, value })
      expect(await applyGeoRetention(new Date(), { pauseMs: 0 })).toEqual({ enabled: false })
    }
    expect(mocks.queryRaw).not.toHaveBeenCalled()
  })

  it('ouvert : applique la purge et rend le nombre de matchs vidés', async () => {
    mocks.configFindUnique.mockResolvedValue({ key: GEO_RETENTION_ENABLED_KEY, value: 'true' })
    mocks.queryRaw.mockResolvedValueOnce([{ id: 't1' }, { id: 't2' }])

    expect(await applyGeoRetention(new Date(), { pauseMs: 0 })).toEqual({ enabled: true, purged: 2 })
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1)
  })

  it('s’ouvre et se ferme par la même clé', async () => {
    await writeGeoRetentionEnabled(true)
    await writeGeoRetentionEnabled(false)

    expect(mocks.configUpsert.mock.calls.map(([args]) => args.update.value)).toEqual(['true', 'false'])
    expect(mocks.configUpsert.mock.calls[0][0].where).toEqual({ key: GEO_RETENTION_ENABLED_KEY })
  })
})

describe('retentionTargetOf', () => {
  const threshold = (purgeable: number, protectedMatches: number) => ({
    cutoff: '2026-09-27T00:00:00.000Z',
    targeted: purgeable + protectedMatches,
    protectedMatches,
    purgeable,
  })
  const counts = (byThreshold: GeoPurgeCounts['byThreshold']): GeoPurgeCounts => ({
    computedAt: '2026-10-27T05:01:46.854Z',
    durationMs: 106_347,
    totalRows: 37_743,
    totalWithGeo: 25_627,
    protectedMatches: 2_399,
    byThreshold,
  })

  it('matchs ordinaires au-delà de 30 jours + protégés au-delà de 90 (comptage du 2026-10-27 : 7 609)', () => {
    expect(retentionTargetOf(counts({ '30': threshold(7_609, 895), '90': threshold(0, 0) }))).toBe(7_609)
    expect(retentionTargetOf(counts({ '30': threshold(100, 40), '90': threshold(0, 12) }))).toBe(112)
  })

  it('null sans comptage publié : un volume inconnu n’est pas zéro', () => {
    expect(retentionTargetOf(null)).toBeNull()
    expect(retentionTargetOf(counts({ '30': threshold(10, 0) }))).toBeNull()
  })
})
