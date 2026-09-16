import { describe, expect, it } from 'vitest'

import { aggregateRawPositionRows, mergeMapSummaries } from './position-metric-raw-aggregation'

// Erangel : 819 200 unités de côté → une cellule de la grille 40 × 40 fait 20 480 unités.
const MAP = 'Baltic_Main'
const members = new Map([
  ['account.a', 'account.a'],
  ['pagiotte', 'account.a'],
  ['account.b', 'account.b'],
])

const row = {
  positionSamples: [
    { memberKey: 'account.A', phase: 1, x: 10_000, y: 10_000 },
    { memberKey: 'account.b', phase: 5, x: 30_000, y: 10_000 },
    { memberKey: 'account.opponent', phase: 1, x: 10_000, y: 10_000 },
  ],
  deathSamples: [{ memberKey: 'Pagiotte', phase: 6, x: 10_000, y: 30_000 }],
  shotSamples: [{ memberKey: 'account.a', phase: 1, count: 7, x: 10_000, y: 10_000 }],
  damageSamples: [
    { memberKey: 'account.a', role: 'attacker', phase: 1, count: 3, x: 10_000, y: 10_000 },
    { memberKey: 'account.a', role: 'victim', phase: 2, count: 2, x: 10_000, y: 10_000 },
  ],
  knockoutSamples: [{ memberKey: 'account.b', role: 'knocker', phase: 5, x: 30_000, y: 10_000 }],
  reviveSamples: [{ memberKey: 'account.b', role: 'revived', phase: 5, x: 30_000, y: 10_000 }],
}

function countOf(cells: ReturnType<typeof aggregateRawPositionRows>['cells'], metric: string) {
  return cells.filter((cell) => cell.metric === metric).reduce((sum, cell) => sum + cell.count, 0)
}

describe('aggregateRawPositionRows', () => {
  it('ne garde que les membres du clan, pondère tirs et dégâts, sépare les rôles', () => {
    const { cells, memberPoints, phases } = aggregateRawPositionRows({
      rows: [row],
      mapName: MAP,
      canonicalKeyByLowerKey: members,
      requestedMemberKey: null,
      phaseFilter: 'all',
    })

    expect(countOf(cells, 'position')).toBe(2)
    expect(countOf(cells, 'death')).toBe(1)
    expect(countOf(cells, 'shot')).toBe(7)
    expect(countOf(cells, 'damage_dealt')).toBe(3)
    expect(countOf(cells, 'damage_taken')).toBe(2)
    expect(countOf(cells, 'knockout_dealt')).toBe(1)
    expect(countOf(cells, 'revive_received')).toBe(1)
    // Pseudo et compte d'un même membre se rejoignent sur sa clé canonique.
    expect(memberPoints).toEqual(new Map([['account.a', 2], ['account.b', 1]]))
    expect([...phases].sort()).toEqual([1, 5, 6])
    expect(cells.find((cell) => cell.metric === 'position' && cell.xIndex === 1)).toBeDefined()
  })

  it('combine filtre de membre et plage tactique sans perdre la liste des membres', () => {
    const { cells, memberPoints } = aggregateRawPositionRows({
      rows: [row],
      mapName: MAP,
      canonicalKeyByLowerKey: members,
      requestedMemberKey: 'account.a',
      phaseFilter: 'early',
    })

    expect(countOf(cells, 'position')).toBe(1)
    expect(countOf(cells, 'death')).toBe(0) // phase 6 : hors « Début »
    expect(countOf(cells, 'damage_taken')).toBe(2)
    expect(countOf(cells, 'knockout_dealt')).toBe(0) // autre membre
    expect(memberPoints.size).toBe(2)
  })

  it('renvoie des résultats vides pour une période sans match', () => {
    const empty = aggregateRawPositionRows({
      rows: [],
      mapName: MAP,
      canonicalKeyByLowerKey: members,
      requestedMemberKey: null,
      phaseFilter: 'all',
    })
    expect(empty.cells).toEqual([])
    expect(empty.memberPoints.size).toBe(0)
  })
})

describe('mergeMapSummaries', () => {
  it('additionne matchs couverts et matchs relus, puis trie par nombre de matchs', () => {
    const merged = mergeMapSummaries(
      [{ mapName: 'Savage_Main', matches: 3, positionPoints: 90, rotationPoints: 40, deathPoints: 3 }],
      [
        { mapName: 'Savage_Main', matches: 2 },
        { mapName: 'Baltic_Main', matches: 4 },
      ]
    )

    expect(merged).toEqual([
      { mapName: 'Savage_Main', matches: 5, positionPoints: 90, rotationPoints: 40, deathPoints: 3 },
      { mapName: 'Baltic_Main', matches: 4, positionPoints: 0, rotationPoints: 0, deathPoints: 0 },
    ])
    expect(mergeMapSummaries([], [])).toEqual([])
  })
})
