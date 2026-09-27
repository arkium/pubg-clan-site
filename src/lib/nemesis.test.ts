import { describe, expect, it } from 'vitest'

import { aggregateWeapons, buildNemesis, isRealWeaponName, revengeLabel, type NemesisEvent, type OpponentInfo } from './nemesis'

const at = (day: number) => new Date(Date.UTC(2026, 8, day, 20))
const death = (killer: string | null, weapon: string | null, day = 20): NemesisEvent => ({
  killerAccountId: killer,
  killerRawKey: null,
  victimAccountId: 'me',
  victimRawKey: null,
  weaponName: weapon,
  matchDate: at(day),
})
const kill = (victim: string, weapon: string | null, day = 20): NemesisEvent => ({
  killerAccountId: 'me',
  killerRawKey: null,
  victimAccountId: victim,
  victimRawKey: null,
  weaponName: weapon,
  matchDate: at(day),
})

const NAMES: Record<string, { name: string; tag: string | null }> = { 'acc.snipe': { name: 'xSnipeZz', tag: 'TTV' }, 'acc.mouette': { name: 'Mouette_91', tag: null } }
function resolveOpponent(accountId: string | null, rawKey: string | null): OpponentInfo {
  if (accountId?.startsWith('ai.')) return { key: accountId, name: 'Bot', clanTag: null, isBot: true, resolved: true }
  if (accountId && NAMES[accountId]) return { key: accountId, name: NAMES[accountId].name, clanTag: NAMES[accountId].tag, isBot: false, resolved: true }
  if (accountId) return { key: accountId, name: accountId, clanTag: null, isBot: false, resolved: false }
  return { key: rawKey ?? 'unknown', name: rawKey ?? 'Inconnu', clanTag: null, isBot: false, resolved: true }
}

const DEATHS = [
  death('acc.snipe', 'Item_Weapon_Kar98k_C', 21),
  death('acc.snipe', 'Item_Weapon_Kar98k_C', 19),
  death('acc.snipe', 'Item_Weapon_M24_C', 18),
  death('acc.mouette', 'Item_Weapon_BerylM762_C'),
  death('ai.0042', 'Item_Weapon_UMP_C'),
  death(null, 'BlueZone'),
  death('acc.inconnu', 'Item_Weapon_Mini14_C'),
]
const KILLS = [
  kill('acc.mouette', 'Item_Weapon_BerylM762_C'),
  kill('acc.mouette', 'Item_Weapon_BerylM762_C'),
  kill('acc.mouette', 'Item_Weapon_UMP_C'),
  kill('acc.snipe', 'Item_Weapon_Mini14_C'),
  kill('ai.0001', 'Item_Weapon_UMP_C'),
  kill('ai.0002', 'Item_Weapon_UMP_C'),
]

describe('armes', () => {
  it('seules les vraies armes comptent', () => {
    expect(isRealWeaponName('Item_Weapon_Kar98k_C')).toBe(true)
    expect(isRealWeaponName('WeapHK416_C')).toBe(true)
    expect(isRealWeaponName('BlueZone')).toBe(false)
    expect(aggregateWeapons(DEATHS)[0]).toEqual({ weaponName: 'Item_Weapon_Kar98k_C', count: 2 })
  })
})

describe('buildNemesis', () => {
  const summary = buildNemesis({ deaths: DEATHS, kills: KILLS, weapon: null, resolveOpponent })

  it('chasseurs et proies : joueurs seulement, arme principale, dernière fois, duel inverse', () => {
    expect(summary.topKillers[0]).toMatchObject({ name: 'xSnipeZz', clanTag: 'TTV', count: 3, reverseCount: 1, topWeapon: 'Item_Weapon_Kar98k_C', lastAt: at(21).toISOString() })
    expect(summary.topKillers.some((row) => row.isBot)).toBe(false)
    expect(summary.topKillers.find((row) => row.key === 'acc.inconnu')).toMatchObject({ resolved: false, reverseCount: 0 })
    expect(summary.topVictims[0]).toMatchObject({ name: 'Mouette_91', count: 3, reverseCount: 1 })
  })

  it('bilan : joueurs, bots et zone à part', () => {
    expect(summary).toMatchObject({
      totalKillsTracked: 6,
      totalDeathsTracked: 7,
      playerKills: 4,
      playerDeaths: 5,
      botKillCount: 2,
      botDeathCount: 1,
      environmentalDeathCount: 1,
    })
    expect(summary.playerKd).toBeCloseTo(0.8)
  })

  it('filtre d’arme : listes et bilan filtrés, duel inverse et death cam sur toutes les armes', () => {
    const kar = buildNemesis({ deaths: DEATHS, kills: KILLS, weapon: 'Item_Weapon_Kar98k_C', resolveOpponent })
    expect(kar.topKillers).toHaveLength(1)
    expect(kar.topKillers[0]).toMatchObject({ name: 'xSnipeZz', count: 2, reverseCount: 1 })
    expect(kar.topVictims).toEqual([])
    expect(kar.playerDeaths).toBe(2)
    expect(kar.topDeathWeapons.map((row) => row.weaponName)).toContain('Item_Weapon_BerylM762_C')
  })

  it('10 lignes au plus par liste', () => {
    const many = Array.from({ length: 14 }, (_, index) => death(`acc.${index}`, 'Item_Weapon_AKM_C'))
    expect(buildNemesis({ deaths: many, kills: [], weapon: null, resolveOpponent }).topKillers).toHaveLength(10)
  })
})

describe('revanche', () => {
  it('kills à rendre ou vengé', () => {
    expect(revengeLabel({ count: 7, reverseCount: 2 })).toEqual({ settled: false, text: '5 kills à rendre' })
    expect(revengeLabel({ count: 2, reverseCount: 1 })).toEqual({ settled: false, text: '1 kill à rendre' })
    expect(revengeLabel({ count: 3, reverseCount: 3 })).toEqual({ settled: true, text: 'Vengé' })
    expect(revengeLabel(null)).toBeNull()
  })
})
