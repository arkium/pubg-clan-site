import { describe, expect, it } from 'vitest'

import {
  chronological,
  formatPlayTime,
  frDecimal,
  killBars,
  modeBreakdown,
  modeSummaryText,
  neighbourDates,
  periodChipLabel,
  placeTone,
  sessionBannerMap,
  sessionDateParts,
  sessionDateOf,
  summarizeSession,
} from './match-sessions'
import type { SquadMatch } from '@/types/squad-matches'

function match(id: string, time: string, placement: number, members: number, overrides: Partial<SquadMatch> = {}): SquadMatch {
  return {
    id,
    pubgMatchId: `pubg-${id}`,
    gameMode: 'squad-fpp',
    mapName: 'Baltic_Main',
    matchType: 'official',
    placement,
    createdAt: `2026-09-26T${time}:00.000Z`,
    durationSeconds: 1500,
    totalKills: 4,
    totalDamage: 600,
    totalAssists: 1,
    totalRevives: 1,
    members: Array.from({ length: members }, (_, index) => ({
      memberId: index + 1,
      displayName: `Joueur ${index + 1}`,
      kills: index,
      damage: 100,
      assists: 0,
      revives: 0,
      placement,
    })),
    isWin: placement === 1,
    ...overrides,
  }
}

// Ordre de l'API : du plus récent au plus ancien.
const SESSION = [
  match('m3', '21:00', 3, 4, { mapName: 'Desert_Main', totalKills: 9 }),
  match('m2', '20:15', 1, 3, { mapName: 'Tiger_Main', totalKills: 11 }),
  match('m1', '19:42', 6, 4, { totalKills: 5 }),
]

describe('match-sessions — formats', () => {
  it('colore une place : or, top 5, top 10, reste', () => {
    expect([1, 2, 5, 6, 10, 11].map(placeTone)).toEqual(['gold', 'pos', 'pos', 'sky', 'sky', 'neutral'])
  })

  it('écrit les nombres et durées à la française', () => {
    expect(frDecimal(14.25)).toBe('14,3')
    expect(formatPlayTime(9660)).toBe('2 h 41')
    expect(formatPlayTime(2460)).toBe('41 min')
    expect(formatPlayTime(3600)).toBe('1 h 00')
  })

  it('décompose la date d’une soirée', () => {
    expect(sessionDateParts('2026-09-26')).toEqual({ day: '26', weekday: 'sam.', full: 'Samedi 26 septembre' })
  })

  it('nomme la période du bandeau', () => {
    const reference = new Date(2026, 8, 26, 12)
    expect(periodChipLabel('month', reference)).toBe('Septembre 2026')
    expect(periodChipLabel('week', reference)).toBe('Semaine du 21 sept.')
  })
})

describe('match-sessions — soirée', () => {
  it('remet les parties dans l’ordre du jeu', () => {
    expect(chronological(SESSION).map((m) => m.id)).toEqual(['m1', 'm2', 'm3'])
  })

  it('fait le bilan : totaux, meilleure place, place moyenne, début et fin', () => {
    const summary = summarizeSession(SESSION)
    expect(summary).toMatchObject({ games: 3, kills: 25, damage: 1800, wins: 1, durationSeconds: 4500 })
    expect(summary.best?.place).toBe(1)
    expect(summary.best?.match.id).toBe('m2')
    expect(summary.averagePlace).toBeCloseTo(10 / 3)
    expect(summary.start).toBe('2026-09-26T19:42:00.000Z')
    expect(summary.end).toBe('2026-09-26T21:25:00.000Z')
    expect(summarizeSession([]).best).toBeNull()
  })

  it('répartit par mode sans lister les modes non joués', () => {
    expect(modeBreakdown(SESSION)).toEqual([
      { mode: 'trio', games: 1, kills: 11, wins: 1 },
      { mode: 'squad', games: 2, kills: 14, wins: 0 },
    ])
    expect(modeSummaryText(SESSION)).toBe('2 squad · 1 trio')
  })

  it('illustre la soirée par la carte de son top 1, sinon de sa première partie', () => {
    expect(sessionBannerMap(SESSION)).toBe('Tiger_Main')
    expect(sessionBannerMap([SESSION[0], SESSION[2]])).toBe('Baltic_Main')
    expect(sessionBannerMap([])).toBeNull()
  })

  it('propose les soirées voisines, de la plus ancienne à la plus récente', () => {
    const dates = ['2026-09-26', '2026-09-25', '2026-09-21', '2026-09-19', '2026-09-16', '2026-09-12']
    expect(neighbourDates(dates, '2026-09-26')).toEqual(['2026-09-16', '2026-09-19', '2026-09-21', '2026-09-25', '2026-09-26'])
    expect(neighbourDates(dates, '2026-09-19', 3)).toEqual(['2026-09-16', '2026-09-19', '2026-09-21'])
    expect(neighbourDates(dates, '2026-09-12', 3)).toEqual(['2026-09-12', '2026-09-16', '2026-09-19'])
    expect(neighbourDates(dates, '2026-01-01')).toEqual([])
  })

  it('met les kills de chaque joueur à l’échelle du meilleur de la soirée', () => {
    expect(killBars([{ displayName: 'A', kills: 2 }, { displayName: 'B', kills: 6 }], 8)).toEqual([
      { name: 'B', kills: 6, percent: 75 },
      { name: 'A', kills: 2, percent: 25 },
    ])
    expect(killBars([{ displayName: 'A', kills: 0 }], 0)[0].percent).toBe(0)
  })
})

describe('match-sessions — journée de jeu', () => {
  it('range une partie par date de Paris, la nuit comptant pour la soirée de la veille', () => {
    // 20:30 à Paris (été, UTC+2) : même jour.
    expect(sessionDateOf('2026-09-26T18:30:00.000Z')).toBe('2026-09-26')
    // 02:09 à Paris le 26 : soirée du 25.
    expect(sessionDateOf('2026-09-26T00:09:00.000Z')).toBe('2026-09-25')
    // 23:30 UTC le 31 août = 01:30 le 1er septembre à Paris : soirée du 31 août (commencée la veille).
    expect(sessionDateOf('2026-08-31T23:30:00.000Z')).toBe('2026-08-31')
    // 06:10 à Paris : nouvelle journée.
    expect(sessionDateOf('2026-09-26T04:10:00.000Z')).toBe('2026-09-26')
    // Hiver (UTC+1) : 00:30 UTC = 01:30 à Paris, soirée de la veille.
    expect(sessionDateOf(new Date('2026-12-05T00:30:00.000Z'))).toBe('2026-12-04')
  })
})
