import { describe, expect, it } from 'vitest'

import type { ResourceQueueItem } from './resource-api'
import {
  EDITOR_WINDOW_METERS,
  MINI_MAP_WINDOW_METERS,
  actorInitial,
  authorsLine,
  clampToView,
  dateTimeLabel,
  dayMonth,
  decisionToastLabel,
  insideView,
  joinNames,
  markerPercent,
  miniMapView,
  nudgePoint,
  pendingSummary,
  playersLabel,
  pointFromFraction,
  pruneSelection,
  queueItemGrid,
  queueItemNature,
  queueItemTitle,
  savedPointsLabel,
  selectionState,
  shortDate,
  toggleAll,
  toggleSelected,
  validatedLabel,
} from './resource-admin-view'

function item(partial: Partial<ResourceQueueItem>): ResourceQueueItem {
  return {
    id: 'point:p1',
    type: 'proposal',
    map: 'Baltic_Main',
    mapLabel: 'Erangel',
    pointId: 'p1',
    kind: 'fuel',
    reportKind: null,
    before: null,
    after: { x: 4200, y: 4300, kind: 'fuel', grid: 'E-M' },
    authors: [{ name: 'Kr4ken', validatedCount: 12 }],
    comments: [],
    createdAt: '2026-10-03T19:42:00.000Z',
    reportIds: ['p1'],
    ...partial,
  }
}

describe('dates (heure de Paris)', () => {
  it('« 3 oct. », « 3 oct. · 21:42 », « 1/10 » et « 28/09 »', () => {
    expect(shortDate('2026-10-03T19:42:00.000Z')).toBe('3 oct.')
    expect(dateTimeLabel('2026-10-03T19:42:00.000Z')).toBe('3 oct. · 21:42')
    // 23:30 UTC le 30/09 = 01:30 à Paris le 1/10.
    expect(dayMonth('2026-09-30T23:30:00.000Z')).toBe('1/10')
    expect(dayMonth('2026-09-28T10:00:00.000Z')).toBe('28/09')
    expect(shortDate(null)).toBe('—')
    expect(dateTimeLabel('pas une date')).toBe('—')
  })
})

describe('libellés de la file', () => {
  it('type : simple, ou « avant → après » quand le signalement change le type', () => {
    expect(queueItemTitle(item({}))).toBe('Station-service')
    expect(
      queueItemTitle(
        item({ type: 'report', reportKind: 'wrong_kind', kind: 'garage', before: { x: 1, y: 1, kind: 'garage', grid: 'A-I' }, after: { x: 1, y: 1, kind: 'fuel', grid: 'A-I' } })
      )
    ).toBe('Garage → Station-service')
    expect(queueItemTitle(item({ type: 'report', reportKind: 'missing', kind: 'dock', before: { x: 1, y: 1, kind: 'dock', grid: 'A-I' }, after: null }))).toBe('Ponton')
  })

  it('repère de grille : la position demandée, à défaut l’actuelle', () => {
    expect(queueItemGrid(item({}))).toBe('E-M')
    expect(queueItemGrid(item({ before: { x: 1, y: 1, kind: 'dock', grid: 'B-J' }, after: null }))).toBe('B-J')
  })

  it('nature : nouveau point neutre, n’existe plus négatif, mal placé et mauvais type en orange', () => {
    expect(queueItemNature(item({}))).toEqual({ label: 'Nouveau point', tone: 'neutral' })
    expect(queueItemNature(item({ type: 'report', reportKind: 'missing' }))).toEqual({ label: 'N’existe plus', tone: 'neg' })
    expect(queueItemNature(item({ type: 'report', reportKind: 'misplaced' }))).toEqual({ label: 'Mal placé', tone: 'warn' })
    expect(queueItemNature(item({ type: 'report', reportKind: 'wrong_kind' }))).toEqual({ label: 'Mauvais type', tone: 'warn' })
  })

  it('auteurs : un joueur avec ses points validés, plusieurs sans', () => {
    expect(authorsLine([{ name: 'Kr4ken', validatedCount: 12 }], '2026-10-03T10:00:00.000Z')).toBe('Kr4ken · 12 validés · 3 oct.')
    expect(authorsLine([{ name: 'Nyx', validatedCount: 0 }], '2026-10-03T10:00:00.000Z')).toBe('Nyx · aucun validé · 3 oct.')
    expect(
      authorsLine(
        [
          { name: 'Nyx', validatedCount: 4 },
          { name: 'Vexa', validatedCount: 2 },
          { name: 'Lemon', validatedCount: 0 },
        ],
        '2026-10-02T10:00:00.000Z'
      )
    ).toBe('Nyx, Vexa et Lemon · 2 oct.')
    expect(joinNames(['A', 'B'])).toBe('A et B')
    expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C et 2 autres')
    expect(joinNames([])).toBe('Joueur inconnu')
    expect(validatedLabel(1)).toBe('1 validé')
  })

  it('compteurs : joueurs, points saisis, file', () => {
    expect(playersLabel(3)).toBe('3 joueurs')
    expect(playersLabel(1)).toBe('1 joueur')
    expect(savedPointsLabel(9)).toBe('9 points saisis')
    expect(savedPointsLabel(1)).toBe('1 point saisi')
    expect(savedPointsLabel(0)).toBe('Aucun point saisi')
    expect(pendingSummary(6)).toBe('6 en attente · signalements identiques regroupés')
    expect(pendingSummary(0)).toBe('Aucun élément en attente')
  })

  it('notification annulable', () => {
    expect(decisionToastLabel('validate')).toBe('Validé')
    expect(decisionToastLabel('refuse')).toBe('Refusé')
    expect(decisionToastLabel('edit')).toBe('Modifié et validé')
    expect(decisionToastLabel('validate', 3)).toBe('3 validés')
  })

  it('pastille initiale', () => {
    expect(actorInitial('kr4ken')).toBe('K')
    expect(actorInitial('  _éclair')).toBe('É')
    expect(actorInitial('')).toBe('?')
  })
})

describe('sélection multiple', () => {
  const ids = ['a', 'b', 'c']

  it('cocher, décocher, tout sélectionner puis tout désélectionner', () => {
    let selected: Set<string> = toggleSelected(new Set(), 'a')
    expect([...selected]).toEqual(['a'])
    expect(selectionState(ids, selected)).toBe('some')
    selected = toggleAll(ids, selected)
    expect(selectionState(ids, selected)).toBe('all')
    selected = toggleAll(ids, selected)
    expect(selectionState(ids, selected)).toBe('none')
    expect(selectionState([], new Set())).toBe('none')
    expect([...toggleSelected(new Set(['a']), 'a')]).toEqual([])
  })

  it('après un rechargement, la sélection ne garde que les lignes encore présentes', () => {
    expect([...pruneSelection(new Set(['a', 'b', 'z']), ['b', 'c'])]).toEqual(['b'])
  })
})

describe('mini-cartes', () => {
  it('extrait centré : taille et position du fond en pourcentages', () => {
    const view = miniMapView({ sizeMeters: 8192, x: 4096, y: 2000, windowMeters: MINI_MAP_WINDOW_METERS })
    expect(view).toMatchObject({ viewX: 3896, viewY: 1800, window: 400, backgroundSize: '2048% 2048%' })
    // p = viewX / (8192 − 400)
    expect(view.backgroundPosition).toBe('50% 23.1%')
    expect(markerPercent(view, { x: 4096, y: 2000 })).toEqual({ left: 50, top: 50 })
  })

  it('au bord de la carte, l’extrait reste dans l’image et le marqueur se décale', () => {
    const view = miniMapView({ sizeMeters: 8192, x: 50, y: 8150, windowMeters: MINI_MAP_WINDOW_METERS })
    expect(view.viewX).toBe(0)
    expect(view.viewY).toBe(7792)
    expect(view.backgroundPosition).toBe('0% 100%')
    expect(markerPercent(view, { x: 50, y: 8150 })).toEqual({ left: 12.5, top: 89.5 })
  })

  it('extrait plus grand que la carte : l’image entière', () => {
    const view = miniMapView({ sizeMeters: 800, x: 100, y: 100, windowMeters: EDITOR_WINDOW_METERS })
    expect(view).toMatchObject({ viewX: 0, viewY: 0, window: 800, backgroundSize: '100% 100%', backgroundPosition: '0% 0%' })
  })

  it('éditeur : pointeur et clavier gardent le marqueur dans l’extrait, en mètres entiers', () => {
    const view = miniMapView({ sizeMeters: 8192, x: 4000, y: 4000, windowMeters: EDITOR_WINDOW_METERS })
    expect(pointFromFraction(view, 0.5, 0.25)).toEqual({ x: 4000, y: 3750 })
    expect(pointFromFraction(view, 1.4, -0.2)).toEqual({ x: 4500, y: 3500 })
    expect(nudgePoint(view, { x: 4000, y: 4000 }, 'ArrowRight')).toEqual({ x: 4010, y: 4000 })
    expect(nudgePoint(view, { x: 4000, y: 4000 }, 'ArrowUp', true)).toEqual({ x: 4000, y: 3950 })
    expect(nudgePoint(view, { x: 4495, y: 4000 }, 'ArrowRight')).toEqual({ x: 4500, y: 4000 })
    expect(nudgePoint(view, { x: 4000, y: 4000 }, 'Enter')).toBeNull()
    expect(clampToView(view, { x: 3000.4, y: 4100.6 })).toEqual({ x: 3500, y: 4101 })
    expect(insideView(view, { x: 4600, y: 4000 })).toBe(false)
  })
})
