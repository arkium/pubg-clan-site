import { describe, expect, it } from 'vitest'

import { parseTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import { buildMemberItemUseStatRows, parseItemUseSamples } from './item-use-persistence'

const match = { id: 'sm-1', createdAt: new Date('2026-09-17T20:00:00Z') }
const clanMembers = [
  { id: 7, pubgAccountId: 'account.aaa', pubgPlayerName: 'Alpha' },
  { id: 8, pubgAccountId: null, pubgPlayerName: 'Bravo' },
]

function itemUseEvent(playerName: string, itemId: string, category: string, subCategory: string) {
  return {
    _T: 'LogItemUse',
    character: { name: playerName, accountId: playerName === 'Alpha' ? 'account.aaa' : 'account.bbb', teamId: 1 },
    item: { itemId, category, subCategory },
  }
}

describe('parser — LogItemUse', () => {
  const snapshot = parseTelemetrySnapshot([
    itemUseEvent('Alpha', 'Item_Heal_FirstAid_C', 'Use', 'Heal'),
    itemUseEvent('Alpha', 'Item_Boost_AdrenalineSyringe_C', 'Use', 'Boost'),
    itemUseEvent('Alpha', 'Item_JerryCan_C', 'Use', 'Fuel'),
    itemUseEvent('Bravo', 'Item_Mountainbike_C', 'Use', 'Gadget'),
    itemUseEvent('Bravo', 'Item_Ammo_556mm_C', 'Ammunition', 'None'),
    // `LogHeal` ne porte pas d'itemId exploitable en production : il ne doit produire aucun échantillon d'objet.
    { _T: 'LogHeal', character: { name: 'Alpha', accountId: 'account.aaa' }, healAmount: 40, item: { itemId: '' } },
  ])

  it('capture un échantillon par événement, catégorie et sous-catégorie comprises', () => {
    expect(snapshot.itemUseSamples.map((sample) => [sample.itemId, sample.category, sample.subCategory])).toEqual([
      ['Item_Heal_FirstAid_C', 'Use', 'Heal'],
      ['Item_Boost_AdrenalineSyringe_C', 'Use', 'Boost'],
      ['Item_JerryCan_C', 'Use', 'Fuel'],
      ['Item_Mountainbike_C', 'Use', 'Gadget'],
      ['Item_Ammo_556mm_C', 'Ammunition', 'None'],
    ])
  })

  it('compte les boosts sur la sous-catégorie, pas sur le nom de l’objet', () => {
    // Le parser indexe les membres par identifiant de compte quand il est présent.
    const alpha = snapshot.memberStats.find((member) => member.memberKey === 'account.aaa')
    expect(alpha?.boostsUsed).toBe(1)
    expect(alpha?.healsUsed).toBe(1)
  })
})

describe('buildMemberItemUseStatRows', () => {
  it('ne garde que la catégorie Use et regroupe par membre et par objet', () => {
    const rows = buildMemberItemUseStatRows(match, clanMembers, [
      { actorKey: 'account.aaa', itemId: 'Item_Heal_FirstAid_C', category: 'Use', subCategory: 'Heal' },
      { actorKey: 'Alpha', itemId: 'Item_Heal_FirstAid_C', category: 'Use', subCategory: 'Heal' },
      { actorKey: 'Bravo', itemId: 'Item_Boost_EnergyDrink_C', category: 'Use', subCategory: 'Boost' },
      { actorKey: 'account.aaa', itemId: 'Item_Ammo_556mm_C', category: 'Ammunition', subCategory: 'None' },
      { actorKey: 'account.zzz', itemId: 'Item_Heal_Bandage_C', category: 'Use', subCategory: 'Heal' },
    ])

    expect(rows).toEqual([
      { squadMatchId: 'sm-1', memberId: 7, itemId: 'Item_Heal_FirstAid_C', category: 'Use', subCategory: 'Heal', count: 2, matchDate: match.createdAt },
      { squadMatchId: 'sm-1', memberId: 8, itemId: 'Item_Boost_EnergyDrink_C', category: 'Use', subCategory: 'Boost', count: 1, matchDate: match.createdAt },
    ])
  })

  it('range les objets sans sous-catégorie déclarée à part', () => {
    const [row] = buildMemberItemUseStatRows(match, clanMembers, [
      { actorKey: 'Alpha', itemId: 'Item_Mystere_C', category: 'Use', subCategory: null },
    ])
    expect(row.subCategory).toBe('Unknown')
  })

  it('accepte un JSON stocké sous forme de chaîne et ignore le reste', () => {
    expect(parseItemUseSamples('[{"actorKey":"a","itemId":"b"}]')).toHaveLength(1)
    expect(parseItemUseSamples('pas du json')).toEqual([])
    expect(parseItemUseSamples([{ actorKey: 'a' }, null, 42])).toEqual([])
  })
})
