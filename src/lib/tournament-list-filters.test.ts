import {
  EMPTY_TOURNAMENT_FILTERS,
  countTournamentsByMode,
  countTournamentsByPhase,
  filterBySearchAndStatus,
  filterTournaments,
  hasActiveTournamentFilters,
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
    mode: 'inter_clan',
    startDate: '2026-09-01T18:00:00.000Z',
    endDate: '2026-09-01T22:00:00.000Z',
    gameMode: 'squad-fpp',
    mapName: 'Baltic_Main',
    mapLabel: 'Erangel',
    organizerClan: { id: 1, name: 'D32', tag: 'SMK' },
    roundCount: 3,
    participantCount: 4,
    clanCount: 4,
    lastRoundAt: null,
    leaders: [],
    standings: [],
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
    tournament({ id: 'solo', phase: 'upcoming', mode: 'solo_ffa', title: 'Solo Cup' }),
    tournament({ id: 'draft', phase: 'draft', mode: 'intra_clan', title: 'Scrims' }),
    tournament({
      id: 'old',
      winner: {
        key: 'clan:9',
        participant: { kind: 'clan', clanId: 9 },
        label: '[LMT] La Meute',
        clanTags: ['LMT'],
        memberLabels: [],
        clanIds: [9],
        totalPoints: 42,
        totalKills: 12,
        wins: 2,
      },
    }),
  ]

  it('filtre sur le statut, un brouillon comptant parmi les tournois à venir', () => {
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, status: 'live' }).map((t) => t.id)).toEqual(['live'])
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, status: 'upcoming' }).map((t) => t.id)).toEqual(['solo', 'draft'])
  })

  it('filtre sur le mode du tournoi', () => {
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, mode: 'solo_ffa' }).map((t) => t.id)).toEqual(['solo'])
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, mode: 'inter_clan' }).map((t) => t.id)).toEqual(['live', 'old'])
  })

  it('cherche dans le titre, la description, l’organisateur et le vainqueur', () => {
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, search: 'ratz' }).map((t) => t.id)).toEqual(['live'])
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, search: 'SMK' }).map((t) => t.id)).toEqual(['solo', 'draft', 'old'])
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, search: 'meute' }).map((t) => t.id)).toEqual(['old'])
    expect(filterTournaments(list, { ...EMPTY_TOURNAMENT_FILTERS, search: 'introuvable' })).toEqual([])
  })

  it('compte les modes sur la recherche et le statut, pas sur le mode choisi', () => {
    const filters = { ...EMPTY_TOURNAMENT_FILTERS, status: 'upcoming' as const, mode: 'solo_ffa' as const }
    expect(countTournamentsByMode(filterBySearchAndStatus(list, filters))).toEqual({
      inter_clan: 0,
      custom_teams: 0,
      solo_ffa: 1,
      intra_clan: 1,
    })
  })

  it('sait dire si un filtre est actif', () => {
    expect(hasActiveTournamentFilters(EMPTY_TOURNAMENT_FILTERS)).toBe(false)
    expect(hasActiveTournamentFilters({ ...EMPTY_TOURNAMENT_FILTERS, search: '  ' })).toBe(false)
    expect(hasActiveTournamentFilters({ ...EMPTY_TOURNAMENT_FILTERS, status: 'finished' })).toBe(true)
    expect(hasActiveTournamentFilters({ ...EMPTY_TOURNAMENT_FILTERS, mode: 'intra_clan' })).toBe(true)
  })
})

describe('répartition en trois temps', () => {
  const list = [
    tournament({ id: 'old', phase: 'finished', startDate: '2026-08-01T18:00:00.000Z' }),
    tournament({ id: 'recent', phase: 'finished', startDate: '2026-09-10T18:00:00.000Z' }),
    tournament({ id: 'soon', phase: 'upcoming', startDate: '2026-10-01T18:00:00.000Z' }),
    tournament({ id: 'next', phase: 'upcoming', startDate: '2026-09-29T18:00:00.000Z' }),
    tournament({ id: 'draft', phase: 'draft', startDate: '2026-11-01T18:00:00.000Z' }),
    tournament({ id: 'live', phase: 'live', startDate: '2026-09-22T18:00:00.000Z' }),
  ]

  it('direct, à venir du plus proche au plus lointain (brouillons compris), palmarès du plus récent', () => {
    const split = splitTournamentsByPhase(list)
    expect(split.live.map((t) => t.id)).toEqual(['live'])
    expect(split.upcoming.map((t) => t.id)).toEqual(['next', 'soon', 'draft'])
    expect(split.finished.map((t) => t.id)).toEqual(['recent', 'old'])
    expect(countTournamentsByPhase(list)).toEqual({ live: 1, upcoming: 3, finished: 2 })
  })
})
