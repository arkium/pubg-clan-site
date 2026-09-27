import { describe, expect, it } from 'vitest'

import {
  chronologyPage,
  filterByMode,
  groupSessions,
  modeCounts,
  modeShares,
  parsePlayerMode,
  parseSessionDate,
  playerKpis,
  sessionPageOf,
  telemetryBadge,
} from './player-matches'
import type { DashboardMatch } from '@/types/dashboard'

let sequence = 0
const match = (pubgCreatedAt: string, values: Partial<DashboardMatch> = {}): DashboardMatch => ({
  id: `m${++sequence}`,
  pubgMatchId: `p${sequence}`,
  clanMode: 'squad',
  mapName: 'Baltic_Main',
  gameMode: 'squad-fpp',
  matchType: 'official',
  duration: 1500,
  placement: 10,
  kills: 2,
  damageDealt: 250,
  assists: 0,
  revives: 0,
  pubgCreatedAt,
  squad: [],
  ...values,
})

// Heures en UTC ; Paris = UTC+2 en septembre. Une partie de 01:30 à Paris compte dans la soirée de la veille.
const matches = [
  match('2026-09-26T19:00:00Z', { placement: 4, kills: 3, clanMode: 'duo' }),
  match('2026-09-26T20:00:00Z', { placement: 1, kills: 6, damageDealt: 900, duration: 1800 }),
  match('2026-09-26T23:30:00Z', { placement: 12, kills: 0, clanMode: 'solo', duration: 600 }),
  match('2026-09-24T18:30:00Z', { placement: 1, kills: 4 }),
  match('2026-09-20T19:10:00Z', { placement: 30, kills: 1, clanMode: 'trio' }),
]

describe('modes', () => {
  it('membres du clan dans l’équipe, « Sans le clan » compris', () => {
    expect(modeCounts(matches)).toEqual([
      { mode: 'duo', count: 1 },
      { mode: 'trio', count: 1 },
      { mode: 'squad', count: 2 },
      { mode: 'solo', count: 1 },
    ])
    expect(filterByMode(matches, 'solo').map((entry) => entry.placement)).toEqual([12])
    expect(filterByMode(matches, null)).toHaveLength(5)
    expect(modeShares(matches).find((share) => share.mode === 'squad')).toEqual({ mode: 'squad', games: 2, kills: 10, wins: 2 })
    expect(parsePlayerMode('trio')).toBe('trio')
    expect(parsePlayerMode('Squad')).toBeNull()
  })
})

describe('chiffres clés', () => {
  it('kills, dégâts, meilleure place (puis le plus de kills), place moyenne, temps de jeu', () => {
    const kpis = playerKpis(matches)
    expect(kpis).toMatchObject({ games: 5, kills: 14, wins: 2, playSeconds: 1500 * 3 + 1800 + 600 })
    expect(kpis.killsPerGame).toBeCloseTo(2.8)
    expect(kpis.best?.kills).toBe(6)
    expect(kpis.averagePlace).toBeCloseTo(9.6)
    expect(playerKpis([])).toMatchObject({ games: 0, best: null, averagePlace: null, killsPerGame: 0 })
  })
})

describe('chronologie', () => {
  it('de la plus ancienne à la plus récente ; ouverte sur la dernière page, pleine (la plus ancienne est incomplète)', () => {
    const page = chronologyPage(matches, null, 2)
    expect(page).toMatchObject({ page: 3, pageCount: 3, from: 4, to: 5, total: 5 })
    expect(page.steps.map((step) => step.match.placement)).toEqual([1, 12])
    const first = chronologyPage(matches, 1, 2)
    expect(first.steps.map((step) => step.match.placement)).toEqual([30])
  })

  it('séparateur de soirée, la partie de 01:30 reste dans la soirée de la veille', () => {
    const page = chronologyPage(matches, null, 4)
    expect(page.steps.map((step) => [step.session, step.firstOfSession])).toEqual([
      ['2026-09-24', true],
      ['2026-09-26', true],
      ['2026-09-26', false],
      ['2026-09-26', false],
    ])
    expect(chronologyPage(matches, 99, 3).page).toBe(2)
  })
})

describe('soirées', () => {
  it('la plus récente d’abord, parties dans l’ordre du jeu, fin = dernière partie + durée', () => {
    const sessions = groupSessions(matches)
    expect(sessions.map((session) => session.date)).toEqual(['2026-09-26', '2026-09-24', '2026-09-20'])
    expect(sessions[0]).toMatchObject({ kills: 9, wins: 1, bestPlace: 1, start: '2026-09-26T19:00:00Z', end: '2026-09-26T23:40:00.000Z' })
    expect(sessions[0].matches.map((entry) => entry.placement)).toEqual([4, 1, 12])
  })

  it('page d’une soirée (4 par page) et date lue dans l’URL', () => {
    const dates = Array.from({ length: 9 }, (_, index) => ({ date: `2026-09-${String(20 - index).padStart(2, '0')}` }))
    expect(sessionPageOf(dates, '2026-09-20')).toBe(1)
    expect(sessionPageOf(dates, '2026-09-15')).toBe(2)
    expect(sessionPageOf(dates, '2026-09-12')).toBe(3)
    expect(sessionPageOf(dates, '2025-01-01')).toBe(1)
    expect(parseSessionDate('2026-09-26')).toBe('2026-09-26')
    expect(parseSessionDate('26/09/2026')).toBeNull()
  })
})

describe('carte de fin de partie', () => {
  it('état de la télémétrie, et une partie sans coéquipier du clan', () => {
    expect(telemetryBadge('success').label).toBe('Télémétrie prête')
    expect(telemetryBadge('expired').label).toBe('Télémétrie expirée')
    expect(telemetryBadge('failed').tone).toBe('neg')
    expect(telemetryBadge('pending').tone).toBe('warn')
    expect(telemetryBadge(null).label).toBe('Sans coéquipier du clan')
  })
})
