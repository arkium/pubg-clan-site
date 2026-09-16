import { describe, expect, it } from 'vitest'

import { PUBG_SQUAD_COLORS, applyReplaySquadFocus, squadColorsByIndex } from './replay-focus'

const data = {
  match: { clanTag: 'SMK' },
  players: [
    { i: 0, n: 'Pagiotte', team: 1, sq: true },
    { i: 1, n: 'Zed', team: 4, sq: false },
    { i: 2, n: 'Alpha', team: 4, sq: false },
  ],
  crates: [
    { sq: true, lteams: [1] },
    { sq: false, lteams: [4, 9] },
    { sq: true },
  ],
}

describe('applyReplaySquadFocus', () => {
  it('suit l’équipe choisie pour les joueurs, les caisses pillées et le libellé', () => {
    const focused = applyReplaySquadFocus(data, 4, 'RAF')

    expect(focused.players.map((player) => player.sq)).toEqual([false, true, true])
    expect(focused.crates?.map((crate) => crate.sq)).toEqual([false, true, true])
    expect(focused.match.clanTag).toBe('RAF')
  })

  it('laisse le payload intact sans équipe choisie', () => {
    expect(applyReplaySquadFocus(data, null)).toBe(data)
  })
})

describe('squadColorsByIndex', () => {
  it('attribue les couleurs PUBG dans l’ordre alphabétique des pseudos de l’escouade', () => {
    const colors = squadColorsByIndex(applyReplaySquadFocus(data, 4).players)
    expect(colors.get(2)).toBe(PUBG_SQUAD_COLORS[0])
    expect(colors.get(1)).toBe(PUBG_SQUAD_COLORS[1])
    expect(colors.has(0)).toBe(false)
  })
})
