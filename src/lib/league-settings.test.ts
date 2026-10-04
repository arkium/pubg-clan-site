import { describe, expect, it } from 'vitest'

import { DEFAULT_LEAGUE_SETTINGS, type LeagueClan, type LeagueMatchRow, type LeagueSettings } from './clan-league'
import { leaguePreview, leagueSettingsChanges, mergeStoredLeagueSettings, sameLeagueSettings, validateLeagueSettings } from './league-settings'

const copy = (): LeagueSettings => JSON.parse(JSON.stringify(DEFAULT_LEAGUE_SETTINGS)) as LeagueSettings
const fieldsOf = (input: unknown) => {
  const result = validateLeagueSettings(input)
  return result.ok ? [] : result.errors.map((error) => error.field)
}

describe('validateLeagueSettings', () => {
  it('accepte les valeurs par défaut et en renvoie une copie', () => {
    const result = validateLeagueSettings(copy())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.settings).toEqual(DEFAULT_LEAGUE_SETTINGS)
      expect(result.settings.placementPoints).not.toBe(DEFAULT_LEAGUE_SETTINGS.placementPoints)
    }
  })

  it('barème : 1 à 16 places, entiers de 0 à 100, jamais plus que la place précédente, 1re place > 0', () => {
    expect(fieldsOf({ ...copy(), placementPoints: [] })).toEqual(['placementPoints'])
    expect(fieldsOf({ ...copy(), placementPoints: Array.from({ length: 17 }, () => 1) })).toEqual(['placementPoints'])
    expect(fieldsOf({ ...copy(), placementPoints: [10, 12, 5] })).toEqual(['placementPoints.1'])
    expect(fieldsOf({ ...copy(), placementPoints: [10, 2.5] })).toEqual(['placementPoints.1'])
    expect(fieldsOf({ ...copy(), placementPoints: [0, 0] })).toEqual(['placementPoints.0'])
    expect(fieldsOf({ ...copy(), placementPoints: [15, 10, 7, 5, 4, 3, 2, 1, 1, 1] })).toEqual([])
  })

  it('coefficients, M, titres et zone dans leurs bornes ; au moins un coefficient positif', () => {
    expect(fieldsOf({ ...copy(), placementWeight: -1 })).toEqual(['placementWeight'])
    expect(fieldsOf({ ...copy(), damageWeight: 11 })).toEqual(['damageWeight'])
    expect(fieldsOf({ ...copy(), priorMatches: 2.5 })).toEqual(['priorMatches'])
    expect(fieldsOf({ ...copy(), zoneEnd: 3 })).toEqual(['zoneEnd'])
    expect(fieldsOf({ ...copy(), titleMinMatches: 0 })).toEqual(['titleMinMatches'])
    expect(fieldsOf({ ...copy(), killWeight: '10' })).toEqual(['killWeight'])
    expect(fieldsOf({ ...copy(), placementWeight: 0, damageWeight: 0, killWeight: 0, knockWeight: 0 })).toEqual(['placementWeight'])
    expect(fieldsOf({ ...copy(), placementWeight: 170, damageWeight: 0.5, priorMatches: 0 })).toEqual([])
  })

  it('seuils : chaque type et chaque période, entiers de 1 à 500', () => {
    const settings = copy()
    settings.minMatches.custom.month = 0
    ;(settings.minMatches.competitive as Record<string, unknown>).week = undefined
    expect(fieldsOf(settings)).toEqual(['minMatches.competitive.week', 'minMatches.custom.month'])
    expect(validateLeagueSettings(null)).toEqual({ ok: false, errors: [{ field: 'settings', message: 'réglages manquants' }] })
  })
})

describe('mergeStoredLeagueSettings', () => {
  it('rien d’enregistré : valeurs par défaut', () => {
    expect(mergeStoredLeagueSettings(null)).toEqual(DEFAULT_LEAGUE_SETTINGS)
  })

  it('un champ abîmé reprend sa valeur par défaut, les autres sont gardés', () => {
    const stored = { ...copy(), placementWeight: 170, zoneEnd: 'huit', minMatches: { ...copy().minMatches, custom: { week: 2, month: -4, all: 10 } } }
    const merged = mergeStoredLeagueSettings(stored)
    expect(merged.placementWeight).toBe(170)
    expect(merged.zoneEnd).toBe(DEFAULT_LEAGUE_SETTINGS.zoneEnd)
    expect(merged.minMatches.custom).toEqual({ week: 2, month: 15, all: 10 })
    expect(mergeStoredLeagueSettings({ placementPoints: [1, 5] }).placementPoints).toEqual(DEFAULT_LEAGUE_SETTINGS.placementPoints)
  })
})

describe('leagueSettingsChanges', () => {
  it('liste lisible de ce qui change ; rien si identique', () => {
    const after = copy()
    after.placementWeight = 170
    after.placementPoints = [12, 8, 6, 5, 4, 3, 2, 1]
    after.minMatches.custom.month = 5
    expect(leagueSettingsChanges(DEFAULT_LEAGUE_SETTINGS, after)).toEqual([
      'barème de placement : 10 · 6 · 5 · 4 · 3 · 2 · 1 · 1 → 12 · 8 · 6 · 5 · 4 · 3 · 2 · 1',
      'coefficient du placement : 250 → 170',
      'seuil Tournois / Custom / mois : 15 → 5 parties',
    ])
    expect(leagueSettingsChanges(DEFAULT_LEAGUE_SETTINGS, copy())).toEqual([])
    expect(sameLeagueSettings(DEFAULT_LEAGUE_SETTINGS, copy())).toBe(true)
  })
})

describe('leaguePreview', () => {
  const clans: LeagueClan[] = ['Alpha', 'Bravo', 'Charlie'].map((name, index) => ({ clanId: index + 1, name, tag: name.slice(0, 3), imageUrl: null }))
  let seq = 0
  const many = (clanId: number, count: number, placement: number, damage: number): LeagueMatchRow[] =>
    Array.from({ length: count }, (_, index) => {
      seq += 1
      return { clanId, matchId: `m${seq}`, createdAt: new Date(Date.UTC(2026, 9, 1, 18 + index)), placement, damage, kills: 0, knocks: 0 }
    })

  it('rangs avant / après côte à côte : un seuil abaissé classe un clan en qualification', () => {
    // Charlie : 3 parties gagnées (en qualification au seuil de 5) ; Alpha et Bravo classés.
    const rows = [...many(1, 6, 4, 500), ...many(2, 6, 10, 300), ...many(3, 3, 1, 700)]
    const draft = copy()
    draft.minMatches.official.week = 3
    const preview = leaguePreview(rows, clans, null, 'official', 'week', DEFAULT_LEAGUE_SETTINGS, draft)
    expect(preview.current).toMatchObject({ minMatches: 5, ranked: 2, qualifying: 1 })
    expect(preview.draft).toMatchObject({ minMatches: 3, ranked: 3, qualifying: 0 })
    const charlie = preview.rows.find((row) => row.name === 'Charlie')!
    expect(charlie.current).toEqual({ rank: null, powerScore: null, qualifying: true })
    expect(charlie.draft.rank).not.toBeNull()
    expect(preview.rows.map((row) => row.draft.rank)).toEqual([1, 2, 3])
  })

  it('parts du score moyen recalculées avec le brouillon', () => {
    const rows = [...many(1, 6, 1, 500), ...many(2, 6, 10, 500)]
    const draft = copy()
    draft.placementWeight = 125
    const preview = leaguePreview(rows, clans, null, 'official', 'week', DEFAULT_LEAGUE_SETTINGS, draft)
    // Placement moyen 5 points : 1 250 contre 500 dégâts, puis 625 contre 500.
    expect(preview.current.shares.placement).toBeCloseTo(1250 / 1750)
    expect(preview.draft.shares.placement).toBeCloseTo(625 / 1125)
  })
})
