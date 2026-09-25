import { describe, expect, it, vi } from 'vitest'

// Le module tire Prisma pour ses requêtes : on le neutralise, seules les règles pures sont testées ici.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  GEO_PURGE_NOTICE_TTL_MS,
  GEO_PURGE_RUN_STALE_MS,
  isNoticeExpired,
  isRunStale,
  parseSelection,
  resolveCutoff,
  type GeoPurgeRunState,
} from '@/lib/telemetry-geo-purge'

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
