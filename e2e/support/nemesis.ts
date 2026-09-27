import type { ApiMock } from './api'
import { MEMBER_ID } from './data'
import { mockMemberProfile } from './members'

import type { OpponentRow } from '@/lib/nemesis'

/**
 * Némésis d'un joueur (e2e/nemesis.spec.ts) : 10 chasseurs, 8 proies, un joueur jamais nommé, des duels dans les deux
 * sens. Noms inventés, dates relatives à l'heure du test ; aucun lien avec la production.
 */

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const W = (id: string) => `Item_Weapon_${id}_C`

// [clé, nom, tag, arme, nombre, duel inverse, jours]
type Row = [string, string, string | null, string, number, number, number]
const row = ([key, name, tag, weapon, count, reverseCount, days]: Row, resolved = true): OpponentRow => ({
  key,
  name,
  clanTag: tag,
  isBot: false,
  resolved,
  count,
  reverseCount,
  lastAt: daysAgo(days),
  topWeapon: W(weapon),
})

const KILLERS: Row[] = [
  ['acc.snipe', 'xSnipeZz', 'TTV', 'Kar98k', 7, 2, 3],
  ['acc.baguette', 'BaguetteSniper', 'FRA', 'M24', 5, 1, 1],
  ['acc.kronos', 'Kr0nos', null, 'BerylM762', 4, 0, 5],
  ['acc.sel', 'LeGrosSel', 'SALT', 'Mk14', 3, 6, 14],
  ['acc.unknown', 'acc.unknown', null, 'UMP', 3, 0, 20],
  ['acc.panzer', 'PanzerPoulet', 'PZP', 'DP28', 2, 0, 8],
  ['acc.mouette', 'Mouette_91', null, 'Mini14', 2, 9, 12],
  ['acc.tartif', 'Tartiflette64', null, 'Vector', 2, 5, 25],
  ['acc.rafale', 'Rafale_77', 'LTF', 'BerylM762', 1, 2, 30],
  ['acc.ghost', 'GhostOfPochinki', null, 'Kar98k', 1, 0, 40],
]
const VICTIMS: Row[] = [
  ['acc.mouette', 'Mouette_91', null, 'BerylM762', 9, 2, 1],
  ['acc.sel', 'LeGrosSel', 'SALT', 'UMP', 6, 3, 4],
  ['acc.tartif', 'Tartiflette64', null, 'Vector', 5, 2, 6],
  ['acc.snipe', 'xSnipeZz', 'TTV', 'Mini14', 2, 7, 3],
  ['acc.rafale', 'Rafale_77', 'LTF', 'BerylM762', 2, 1, 9],
  ['acc.pingouin', 'Pingouin_Fou', null, 'M249', 2, 0, 15],
  ['acc.baguette', 'BaguetteSniper', 'FRA', 'Mk14', 1, 5, 20],
  ['acc.jambon', 'JambonBeurre', null, 'DP28', 1, 0, 28],
]

export function nemesisPayload(url: URL) {
  const weapon = url.searchParams.get('weapon')
  const killers = KILLERS.map((entry) => row(entry, entry[0] !== 'acc.unknown'))
  const victims = VICTIMS.map((entry) => row(entry))
  const filter = (rows: OpponentRow[]) => (weapon ? rows.filter((entry) => entry.topWeapon === weapon) : rows)
  return {
    data: {
      period: url.searchParams.get('period') ?? 'all',
      totalDeathsTracked: 44,
      totalKillsTracked: 57,
      playerKills: 43,
      playerDeaths: 30,
      playerKd: 43 / 30,
      botKillCount: 14,
      botDeathCount: 5,
      environmentalDeathCount: 9,
      topDeathWeapons: [
        { weaponName: W('Kar98k'), count: 11 },
        { weaponName: W('BerylM762'), count: 9 },
        { weaponName: W('M24'), count: 7 },
        { weaponName: W('Mk14'), count: 5 },
        { weaponName: W('UMP'), count: 4 },
      ],
      topKillers: filter(killers),
      topVictims: filter(victims),
      availableWeapons: ['BerylM762', 'DP28', 'Kar98k', 'M24', 'Mini14', 'Mk14', 'UMP', 'Vector'].map(W),
      selectedWeapon: weapon,
    },
  }
}

export function mockMemberNemesis(api: ApiMock) {
  mockMemberProfile(api)
  api.on('GET', `/api/members/${MEMBER_ID}/nemesis`, (url) => ({ body: nemesisPayload(url) }))
}
