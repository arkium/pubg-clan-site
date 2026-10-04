import { describe, expect, it } from 'vitest'

import {
  groupMutationsByDay,
  isAutomaticMutation,
  mutationKind,
  mutationSourceLabel,
  mutationTime,
  type ClanMutation,
} from './clan-mutations-view'

const CLAN_A = { id: 1, tag: 'DEMO', name: 'Clan Démo', isSystem: false }
const CLAN_B = { id: 2, tag: 'MEUT', name: 'La Meute', isSystem: false }
const UNGROUPED = { id: 99, tag: 'UNG', name: 'Sans clan', isSystem: true }

function mutation(overrides: Partial<ClanMutation>): ClanMutation {
  return { id: 'm', source: 'auto_transfer', status: 'applied', at: '2026-10-04T10:00:00.000Z', member: { id: 1, name: 'Alpha' }, from: CLAN_A, to: CLAN_B, ...overrides }
}

describe('mutationKind', () => {
  it('distingue arrivée, départ et transfert ; le clan technique compte comme « aucun clan »', () => {
    expect(mutationKind(mutation({}))).toBe('transfer')
    expect(mutationKind(mutation({ from: UNGROUPED }))).toBe('arrival')
    expect(mutationKind(mutation({ from: null }))).toBe('arrival')
    expect(mutationKind(mutation({ to: UNGROUPED }))).toBe('departure')
    expect(mutationKind(mutation({ to: null }))).toBe('departure')
  })

  it('un mouvement annulé depuis l’emporte sur son sens', () => {
    expect(mutationKind(mutation({ status: 'reverted', to: UNGROUPED }))).toBe('reverted')
  })
})

describe('sources', () => {
  it('seules les détections de la synchronisation sont automatiques', () => {
    expect(isAutomaticMutation({ source: 'auto_demotion' })).toBe(true)
    expect(isAutomaticMutation({ source: 'ungrouped_promotion' })).toBe(true)
    expect(isAutomaticMutation({ source: 'manual_transfer' })).toBe(false)
  })

  it('libellé en clair, la source brute si elle est inconnue', () => {
    expect(mutationSourceLabel('manual_demotion')).toBe('Sorti du clan par un responsable')
    expect(mutationSourceLabel('nouvelle_source')).toBe('nouvelle_source')
  })
})

describe('groupMutationsByDay', () => {
  it('regroupe par jour de Paris, dans l’ordre reçu ; 01:45 à Paris reste sur son jour', () => {
    const days = groupMutationsByDay([
      mutation({ id: 'a', at: '2026-10-04T08:00:00.000Z' }),
      // 01:45 à Paris le 4 octobre = 23:45 UTC le 3 : jour du 4, pas du 3.
      mutation({ id: 'b', at: '2026-10-03T23:45:00.000Z' }),
      mutation({ id: 'c', at: '2026-10-03T21:00:00.000Z' }),
    ])
    expect(days.map((day) => day.day)).toEqual(['2026-10-04', '2026-10-03'])
    expect(days[0].mutations.map((m) => m.id)).toEqual(['a', 'b'])
    expect(days[0].label).toBe('dimanche 4 octobre 2026')
    expect(mutationTime('2026-10-03T23:45:00.000Z')).toBe('01:45')
  })

  it('aucune journée sans mouvement', () => {
    expect(groupMutationsByDay([])).toEqual([])
  })
})
