import { describe, expect, it } from 'vitest'

import {
  actionStateMatches,
  actionSummary,
  pointObject,
  pointsCountLabel,
  reportObject,
  reportsDetail,
  resourceActionVerb,
  shortDate,
  undoDetail,
  type PointSnapshot,
  type ResourceActionState,
} from './resource-history'

const point = (data: Partial<PointSnapshot> = {}): PointSnapshot => ({
  id: 'p1',
  mapName: 'Baltic_Main',
  kind: 'fuel',
  x: 5500,
  y: 3500,
  status: 'validated',
  createdByUserId: 10,
  validatedByUserId: 1,
  validatedAt: '2026-10-01T10:00:00.000Z',
  lastConfirmedAt: '2026-10-01T10:00:00.000Z',
  ...data,
})

describe('libellés de l’historique', () => {
  it('objet d’un point : type et repère, flèche quand ils changent', () => {
    expect(pointObject(point())).toBe('Station-service · F-L')
    expect(pointObject(point({ kind: 'garage', x: 3500, y: 4500 }), point({ x: 3500, y: 4500 }))).toBe('Garage → Station-service · D-M')
    expect(pointObject(point({ kind: 'dock', x: 1500, y: 6500 }), point({ kind: 'dock', x: 1500, y: 7100 }))).toBe('Ponton · B-O → B-P')
    expect(pointObject(point({ mapName: 'Unknown_Main' }))).toBe('Station-service · ?')
  })

  it('signalements : objet, « Signalé par », regroupement', () => {
    expect(reportObject('missing', point({ kind: 'garage', x: 4500, y: 2500 }))).toBe('Signalement « N’existe plus » · Garage E-K')
    expect(reportObject('wrong_kind', point())).toBe('Signalement « Mauvais type » · Station-service F-L')
    expect(reportsDetail(1, 'Lemon')).toBe('Signalé par Lemon')
    expect(reportsDetail(2, 'Lemon')).toBe('2 signalements regroupés')
    expect(reportsDetail(1, null)).toBeNull()
  })

  it('dates courtes à l’heure de Paris, compte de points, annulation, résumé', () => {
    expect(shortDate(new Date('2026-10-01T08:00:00Z'))).toBe('1/10')
    // 23:30 UTC le 30/09 = 01:30 à Paris le 1/10.
    expect(shortDate(new Date('2026-09-30T23:30:00Z'))).toBe('1/10')
    expect(pointsCountLabel(1)).toBe('1 point saisi')
    expect(pointsCountLabel(9)).toBe('9 points saisis')
    expect(undoDetail('move_point', 'Paulo', new Date('2026-10-03T12:00:00Z'))).toBe('Déplacement de Paulo du 3/10')
    expect(resourceActionVerb('recheck_map')).toBe('a marqué à revérifier')
    expect(resourceActionVerb('inconnue')).toBe('inconnue')
    expect(actionSummary('validate_point', { object: 'Station-service · F-L', detail: 'Proposée par Vexa' })).toBe('a validé Station-service · F-L — Proposée par Vexa')
    expect(actionSummary('verify_map', { object: 'x'.repeat(300), detail: null })).toHaveLength(255)
  })
})

describe('état actuel = état d’après ?', () => {
  const after: ResourceActionState = {
    point: point(),
    reports: [{ id: 'r1', pointId: 'p1', kind: 'missing', status: 'accepted', userId: 11, resolvedByUserId: 1, resolvedAt: '2026-10-01T10:00:00.000Z' }],
    map: { mapName: 'Baltic_Main', verifiedAt: null, recheckSince: '2026-10-01T08:00:00.000Z' },
  }

  it('identique, ou seulement reconfirmé depuis : oui', () => {
    expect(actionStateMatches(after, after)).toBe(true)
    expect(actionStateMatches(after, { ...after, point: point({ lastConfirmedAt: '2026-10-04T10:00:00.000Z' }) })).toBe(true)
    expect(actionStateMatches({}, {})).toBe(true)
  })

  it('point déplacé, retypé, retiré ou supprimé ; signalement rouvert ; carte changée : non', () => {
    expect(actionStateMatches(after, { ...after, point: point({ x: 5600 }) })).toBe(false)
    expect(actionStateMatches(after, { ...after, point: point({ kind: 'garage' }) })).toBe(false)
    expect(actionStateMatches(after, { ...after, point: point({ status: 'removed' }) })).toBe(false)
    expect(actionStateMatches(after, { ...after, point: undefined })).toBe(false)
    expect(actionStateMatches(after, { ...after, reports: [{ ...after.reports![0], status: 'pending' }] })).toBe(false)
    expect(actionStateMatches(after, { ...after, reports: [] })).toBe(false)
    expect(actionStateMatches(after, { ...after, map: { mapName: 'Baltic_Main', verifiedAt: '2026-10-03T08:00:00.000Z', recheckSince: null } })).toBe(false)
  })
})
