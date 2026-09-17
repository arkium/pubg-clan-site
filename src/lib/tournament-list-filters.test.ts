import { describe, expect, it } from 'vitest'

import {
  EMPTY_TOURNAMENT_FILTERS,
  filterTournaments,
  hasActiveTournamentFilters,
  sortTournaments,
  splitTournamentsByPhase,
} from './tournament-list-filters'
import { resolveTournamentPhase } from './tournament-overview'
import type { TournamentOverview } from './tournament-overview'

function tournament(overrides: Partial<TournamentOverview>): TournamentOverview {
  return {
    id: 'a',
    title: 'Coupe SMK',
    description: 'Tournoi inter-clans du dimanche',
    status: 'finished',
    phase: 'finished',
    startDate: '2026-09-01T18:00:00.000Z',
    endDate: '2026-09-01T22:00:00.000Z',
    gameMode: 'squad-fpp',
    mapName: 'Baltic_Main',
    mapLabel: 'Erangel',
    organizerClan: { id: 1, name: 'D32', tag: 'SMK' },
    roundCount: 3,
    participantCount: 4,
    winner: null,
    ...overrides,
  }
}

describe('resolveTournamentPhase', () => {
  const now = new Date('2026-09-17T20:00:00Z')

  it('dérive l’état affiché des dates, pas seulement du statut', () => {
    const active = { status: 'active', startDate: new Date('2026-09-16'), endDate: new Date('2026-09-18') }
    expect(resolveTournamentPhase(active, now)).toBe('live')
    expect(resolveTournamentPhase({ ...active, startDate: new Date('2026-09-20'), endDate: new Date('2026-09-21') }, now)).toBe('upcoming')
    // Période passée : le tournoi n'est plus annoncé « en direct », même resté en `active`.
    expect(resolveTournamentPhase({ ...active, startDate: new Date('2026-09-10'), endDate: new Date('2026-09-12') }, now)).toBe('finished')
  })

  it('garde brouillon et terminé tels quels', () => {
    expect(resolveTournamentPhase({ status: 'draft', startDate: new Date('2026-09-16'), endDate: new Date('2026-09-18') }, now)).toBe('draft')
    expect(resolveTournamentPhase({ status: 'finished', startDate: new Date('2026-09-16'), endDate: new Date('2026-09-30') }, now)).toBe('finished')
  })

  it('reste « en direct » le dernier jour, jusqu’à minuit', () => {
    const lastDay = { status: 'active', startDate: new Date('2026-09-15'), endDate: new Date('2026-09-17') }
    expect(resolveTournamentPhase(lastDay, now)).toBe('live')
  })
})

describe('filterTournaments', () => {
  const list = [
    tournament({ id: 'live', phase: 'live', title: 'Nuit des Ratz', organizerClan: { id: 6, name: 'Les-Ratz', tag: 'RATZ' } }),
    tournament({ id: 'solo', phase: 'upcoming', title: 'Solo Cup', gameMode: 'solo', mapName: 'Desert_Main', mapLabel: 'Miramar' }),
    tournament({ id: 'old' }),
  ]

  it('filtre sur le statut, le format et la carte', () => {
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, status: 'live' }).map((t) => t.id)).toEqual(['live'])
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, gameMode: 'solo' }).map((t) => t.id)).toEqual(['solo'])
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, mapName: 'Baltic_Main' }).map((t) => t.id)).toEqual(['live', 'old'])
  })

  it('cherche dans le titre, la description et le clan organisateur', () => {
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, search: 'ratz' }).map((t) => t.id)).toEqual(['live'])
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, search: 'SMK' }).map((t) => t.id)).toEqual(['solo', 'old'])
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, search: 'dimanche' })).toHaveLength(3)
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, search: 'introuvable' })).toEqual([])
  })

  it('sait dire si un filtre est actif', () => {
    expect(hasActiveTournamentFilters(EMPTY_TOURNAMENT_FILTERS)).toBe(false)
    expect(hasActiveTournamentFilters({ ...EMPTY_TOURNAMENT_FILTERS, search: '  ' })).toBe(false)
    expect(hasActiveTournamentFilters({ ...EMPTY_TOURNAMENT_FILTERS, status: 'finished' })).toBe(true)
  })
})

describe('tri et répartition', () => {
  const list = [
    tournament({ id: 'b', title: 'Beta', startDate: '2026-08-01T18:00:00.000Z' }),
    tournament({ id: 'a', title: 'Alpha', startDate: '2026-09-10T18:00:00.000Z', organizerClan: { id: 2, name: 'Aurore', tag: 'AF' } }),
  ]

  it('trie par date puis par nom et par organisateur', () => {
    expect(sortTournaments(list, 'recent').map((t) => t.id)).toEqual(['a', 'b'])
    expect(sortTournaments(list, 'oldest').map((t) => t.id)).toEqual(['b', 'a'])
    expect(sortTournaments(list, 'title').map((t) => t.id)).toEqual(['a', 'b'])
    expect(sortTournaments(list, 'organizer').map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('range les brouillons avec le direct, jamais dans les archives', () => {
    const split = splitTournamentsByPhase([
      tournament({ id: 'draft', phase: 'draft' }),
      tournament({ id: 'live', phase: 'live' }),
      tournament({ id: 'done', phase: 'finished' }),
    ])
    expect(split.current.map((t) => t.id)).toEqual(['draft', 'live'])
    expect(split.archived.map((t) => t.id)).toEqual(['done'])
  })
})
