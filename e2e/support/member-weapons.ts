import type { ApiMock } from './api'
import { CLAN_ID, MEMBER_ID } from './data'
import { mockMemberProfile } from './members'

/**
 * Armes d'un joueur (e2e/member-weapons.spec.ts) : télémétrie par période (variantes d'une même arme, une ligne hors
 * arme), lancers, maîtrise PUBG avec niveaux d'expert. Chiffres inventés, dates relatives à l'heure du test ; aucun lien
 * avec la production.
 */

type Period = 'week' | 'month' | 'all'
const FACTOR: Record<Period, number> = { week: 1, month: 3, all: 10 }
const periodOf = (url: URL): Period => {
  const value = url.searchParams.get('period')
  return value === 'month' || value === 'all' ? value : 'week'
}

// [identifiant, libellé, kills, kills en headshot, tirs, touches, dist. moy., dist. max, parties]
type Row = [string, string, number, number, number, number, number, number, number]
const ROWS: Row[] = [
  ['WeapHK416_C', 'M416', 14, 4, 1000, 240, 32, 187, 11],
  ['WeapDuncansHK416_C', 'M416 de Duncan', 4, 1, 240, 58, 40, 150, 3],
  ['WeapBerylM762_C', 'Beryl M762', 12, 3, 980, 206, 31, 142, 9],
  ['WeapMini14_C', 'Mini 14', 9, 4, 410, 131, 88, 263, 7],
  ['WeapUMP_C', 'UMP45', 7, 1, 620, 167, 18, 64, 6],
  ['WeapKar98k_C', 'Kar98k', 6, 4, 38, 21, 146, 412, 5],
  ['WeapSKS_C', 'SKS', 5, 2, 290, 81, 76, 221, 4],
  ['WeapVector_C', 'Vector', 4, 1, 510, 143, 12, 38, 3],
  ['WeapDP28_C', 'DP-28', 3, 0, 330, 76, 47, 118, 3],
  ['ProjGrenade_C', 'Grenade', 3, 0, 0, 12, 21, 30, 9],
  ['WeapSaiga12_C', 'S12K', 2, 1, 40, 22, 6, 11, 2],
  ['WeapM1911_C', 'P1911', 1, 0, 60, 14, 9, 15, 2],
  ['WeapPan_C', 'Poêle', 1, 0, 0, 0, 1, 1, 1],
  // Pas une arme : jamais au râtelier, jamais un record (sinon 500 m battrait le Kar98k).
  ['None', 'None', 5, 0, 0, 3, 300, 500, 4],
]

export function memberWeaponRows(period: Period) {
  const factor = FACTOR[period]
  return ROWS.map(([weaponName, weaponLabel, kills, headshots, shotsFired, hitsLanded, avgDistance, maxDistance, matchCount]) => ({
    weaponName,
    weaponLabel,
    kills: kills * factor,
    headshots: headshots * factor,
    shotsFired: shotsFired * factor,
    hitsLanded: hitsLanded * factor,
    accuracy: shotsFired ? (hitsLanded / shotsFired) * 100 : 0,
    avgDistance,
    maxDistance,
    totalDamage: 0,
    matchCount: matchCount * factor,
  }))
}

const THROWS: Array<[string, number]> = [
  ['Item_Weapon_Grenade_C', 14],
  ['Item_Weapon_SmokeBomb_C', 9],
  ['Item_Weapon_Molotov_C', 6],
  ['Item_Weapon_FlashBang_C', 3],
  ['Item_Weapon_C4_C', 1],
  ['Item_Weapon_Apple_C', 1],
]

// [identifiant, libellé du site, kills, knocks, coups à la tête, dégâts, niveau, niveau d'expert, XP]
type Mastery = [string, string, number, number, number, number, number, number, number]
const MASTERY: Mastery[] = [
  ['Item_Weapon_HK416_C', 'M416', 5720, 3708, 3514, 701241, 99, 6, 952500],
  ['Item_Weapon_BerylM762_C', 'Beryl M762', 3010, 2052, 1825, 369252, 99, 5, 952500],
  ['Item_Weapon_Mini14_C', 'Mini 14', 2040, 1676, 2644, 411756, 99, 3, 952500],
  ['Item_Weapon_Kar98k_C', 'Kar98k', 1399, 1422, 1682, 254780, 99, 2, 952500],
  ['Item_Weapon_M249_C', 'M249', 296, 209, 169, 34980, 99, 1, 939780],
  ['Item_Weapon_UMP_C', 'UMP45', 240, 164, 123, 30065, 89, 0, 794260],
  ['Item_Weapon_Vector_C', 'Vector', 281, 178, 197, 32602, 84, 0, 734953],
  ['Item_Weapon_Grenade_C', 'Grenade', 88, 40, 0, 20100, 41, 0, 190000],
  ['Item_Weapon_Pan_C', 'Poêle', 0, 0, 0, 0, 0, 0, 0],
]

export function memberMastery() {
  const refreshed = new Date(Date.now() - 2 * 3_600_000).toISOString()
  return {
    memberId: MEMBER_ID,
    weapons: MASTERY.map(([weaponId, weaponLabel, kills, knockouts, headshots, damage, level, tier, xpTotal], index) => ({
      id: index + 1,
      memberId: MEMBER_ID,
      weaponId,
      weaponName: weaponId.replace(/^Item_Weapon_/, '').replace(/_C$/, ''),
      weaponLabel,
      kills,
      headshots,
      knockouts,
      shots: 0,
      hits: 0,
      damage,
      longestKillDistance: 0,
      level,
      xpTotal,
      tier,
      lastRefreshedAt: refreshed,
    })),
  }
}

export function mockMemberArsenal(api: ApiMock) {
  mockMemberProfile(api)
  api
    .on('GET', `/api/members/${MEMBER_ID}/telemetry/weapons`, (url) => ({
      body: { ok: true, meta: { period: periodOf(url), count: ROWS.length }, data: { rows: memberWeaponRows(periodOf(url)), note: null } },
    }))
    .on('GET', `/api/members/${MEMBER_ID}/throwables`, (url) => {
      const factor = FACTOR[periodOf(url)]
      const items = THROWS.map(([itemId, count]) => ({ itemId, count: count * factor }))
      return { body: { data: { period: periodOf(url), totalThrows: items.reduce((sum, item) => sum + item.count, 0), items } } }
    })
    .on('GET', `/api/members/${MEMBER_ID}/weapon-mastery`, { body: memberMastery() })
    .on('POST', `/api/members/${MEMBER_ID}/weapon-mastery`, { body: { memberId: MEMBER_ID, count: MASTERY.length } })
}

/** Membre du clan du joueur, connecté : il peut rafraîchir la maîtrise. */
export function signInAsClanMember(api: ApiMock) {
  api.on('GET', '/api/auth/mode', { body: { authDisabled: false } }).on('GET', '/api/auth/session', {
    body: {
      authenticated: true,
      user: { email: 'membre@example.com', isSuperUser: false },
      activeMemberId: MEMBER_ID,
      permissions: [],
      members: [{ memberId: MEMBER_ID, displayName: 'Joueur Alpha', clanId: CLAN_ID, clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' } }],
      isSuperUser: false,
    },
  })
}
