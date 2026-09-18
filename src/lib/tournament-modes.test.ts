import { describe, expect, it } from 'vitest'

import {
  computeTournamentModeStandings,
  computeTournamentStandings,
  groupMatchByMode,
  normalizeTournamentRules,
  scoreTournamentTeam,
} from './tournament-service'

const RULES = { placementPoints: { 1: 10, 2: 6 }, killPoints: 1, winBonus: 4, bestOfRounds: null }

function member(memberId: number, clanId: number | null, kills: number, placement: number, damage = 0) {
  return { memberId, member: { clanId, displayName: `J${memberId}` }, kills, placement, damage }
}

/** Une manche, escouade mixte : 2 joueurs du clan 1 et 2 du clan 2, premiers du match. */
const mixedMatch = {
  id: 'm1',
  createdAt: new Date('2026-09-17T20:00:00Z'),
  members: [member(1, 1, 3, 1), member(2, 1, 1, 1), member(3, 2, 2, 1), member(4, 2, 0, 1)],
}

describe('normalizeTournamentRules — mode et règle d’escouade', () => {
  it('retient le mode et la règle choisis', () => {
    const rules = normalizeTournamentRules({ mode: 'solo_ffa', mixedSquadRule: 'prorata' })
    expect(rules.mode).toBe('solo_ffa')
    expect(rules.mixedSquadRule).toBe('prorata')
  })

  it('retombe sur inter-clans et partage intégral quand la valeur est absente ou inconnue', () => {
    expect(normalizeTournamentRules({}).mode).toBe('inter_clan')
    expect(normalizeTournamentRules({ mode: 'championnat' }).mode).toBe('inter_clan')
    expect(normalizeTournamentRules({ mixedSquadRule: 'moitié' }).mixedSquadRule).toBe('full_share')
  })

  it('conserve le barème existant : un tournoi enregistré avant les modes reste inter-clans', () => {
    const rules = normalizeTournamentRules({ placementPoints: { 1: 15 }, killPoints: 2, winBonus: 5 })
    expect(rules).toMatchObject({ mode: 'inter_clan', mixedSquadRule: 'full_share', killPoints: 2, winBonus: 5 })
    expect(rules.placementPoints[1]).toBe(15)
  })
})

describe('escouade mixte inter-clans', () => {
  it('partage intégral : chaque clan marque tout le placement et le bonus', () => {
    const standings = computeTournamentStandings([mixedMatch], [1, 2], RULES)
    // 10 de placement + 4 de bonus + ses propres kills.
    expect(standings.map((s) => [s.clanId, s.totalPoints])).toEqual([[1, 18], [2, 16]])
  })

  it('prorata : placement et bonus divisés par l’effectif, kills intacts', () => {
    const standings = computeTournamentStandings([mixedMatch], [1, 2], { ...RULES, mixedSquadRule: 'prorata' })
    // (10 + 4) / 2 = 7, plus les kills du clan.
    expect(standings.map((s) => [s.clanId, s.totalPoints])).toEqual([[1, 11], [2, 9]])
  })

  it('ne partage rien quand l’escouade est mono-clan', () => {
    const soloClan = { ...mixedMatch, members: [member(1, 1, 3, 1), member(2, 1, 1, 1)] }
    const full = computeTournamentStandings([soloClan], [1], RULES)
    const prorata = computeTournamentStandings([soloClan], [1], { ...RULES, mixedSquadRule: 'prorata' })
    expect(full[0].totalPoints).toBe(prorata[0].totalPoints)
  })

  it('n’applique jamais le partage aux kills', () => {
    const score = scoreTournamentTeam({ bestPlacement: 1, totalKills: 4, placementShare: 0.5 }, normalizeTournamentRules(RULES))
    expect(score).toMatchObject({ placementScore: 5, winBonus: 2, killScore: 4, points: 11 })
  })
})

describe('groupMatchByMode', () => {
  const rules = (mode: string, extra: Record<string, unknown> = {}) => normalizeTournamentRules({ ...RULES, mode, ...extra })

  it('inter-clans : une entrée par clan', () => {
    const entries = groupMatchByMode(mixedMatch, [1, 2], rules('inter_clan'))
    expect(entries.map((entry) => entry.key)).toEqual(['clan:1', 'clan:2'])
  })

  it('équipes libres : une seule entrée pour l’escouade mixte', () => {
    const entries = groupMatchByMode(mixedMatch, [1, 2], rules('custom_teams'))
    expect(entries).toHaveLength(1)
    expect(entries[0].participant).toEqual({ kind: 'team', memberIds: [1, 2, 3, 4], clanIds: [1, 2] })
    expect(entries[0].totalKills).toBe(6)
  })

  it('solo : une entrée par joueur, avec son propre placement', () => {
    const match = { ...mixedMatch, members: [member(1, 1, 3, 1), member(3, 2, 2, 5)] }
    const entries = groupMatchByMode(match, [1, 2], rules('solo_ffa'))
    expect(entries.map((entry) => [entry.key, entry.bestPlacement, entry.totalKills])).toEqual([
      ['player:1', 1, 3],
      ['player:3', 5, 2],
    ])
  })

  it('intra-clan : seuls les membres du clan organisateur, en une escouade', () => {
    const entries = groupMatchByMode(mixedMatch, [1, 2], rules('intra_clan'), 1)
    expect(entries).toHaveLength(1)
    expect(entries[0].participant).toEqual({ kind: 'team', memberIds: [1, 2], clanIds: [1] })
    expect(entries[0].totalKills).toBe(4)
  })

  it('intra-clan sans clan organisateur : aucune entrée plutôt qu’un classement faux', () => {
    expect(groupMatchByMode(mixedMatch, [1, 2], rules('intra_clan'))).toEqual([])
  })
})

describe('computeTournamentModeStandings', () => {
  const secondMatch = {
    id: 'm2',
    createdAt: new Date('2026-09-17T21:00:00Z'),
    members: [member(1, 1, 0, 2), member(2, 1, 1, 2), member(3, 2, 5, 2), member(4, 2, 0, 2)],
  }

  it('cumule les manches par équipe en mode équipes libres', () => {
    const standings = computeTournamentModeStandings([mixedMatch, secondMatch], [1, 2], { ...RULES, mode: 'custom_teams' })
    expect(standings).toHaveLength(1)
    // Manche 1 : 10 + 4 + 6 kills = 20. Manche 2 : 6 + 6 kills = 12.
    expect(standings[0]).toMatchObject({ totalPoints: 32, totalKills: 12, matchesPlayed: 2, wins: 1, bestPlacement: 1 })
  })

  it('classe les joueurs un par un en solo, du meilleur au moins bon', () => {
    const standings = computeTournamentModeStandings([mixedMatch], [1, 2], { ...RULES, mode: 'solo_ffa' })
    expect(standings.map((s) => [s.key, s.totalPoints])).toEqual([
      ['player:1', 17],
      ['player:3', 16],
      ['player:2', 15],
      ['player:4', 14],
    ])
  })

  it('ne retient que les meilleures manches avec bestOfRounds', () => {
    const standings = computeTournamentModeStandings(
      [mixedMatch, secondMatch],
      [1, 2],
      { ...RULES, mode: 'custom_teams', bestOfRounds: 1 }
    )
    expect(standings[0]).toMatchObject({ totalPoints: 20, matchesPlayed: 1 })
  })

  it('cumule les dégâts du participant, utiles au classement solo', () => {
    const match = {
      id: 'm3',
      createdAt: new Date('2026-09-17T22:00:00Z'),
      members: [member(1, 1, 2, 1, 300), member(3, 2, 1, 1, 150)],
    }
    const solo = computeTournamentModeStandings([match], [1, 2], { ...RULES, mode: 'solo_ffa' })
    expect(solo.map((s) => [s.key, s.totalDamage])).toEqual([
      ['player:1', 300],
      ['player:3', 150],
    ])
    const byClan = computeTournamentModeStandings([match], [1, 2], RULES)
    expect(byClan.map((s) => s.totalDamage)).toEqual([300, 150])
  })

  it('donne le même classement que la vue par clan en inter-clans', () => {
    const byClan = computeTournamentStandings([mixedMatch], [1, 2], RULES)
    const byMode = computeTournamentModeStandings([mixedMatch], [1, 2], RULES)
    expect(byMode.map((s) => s.totalPoints)).toEqual(byClan.map((s) => s.totalPoints))
    expect(byMode.map((s) => s.participant)).toEqual([{ kind: 'clan', clanId: 1 }, { kind: 'clan', clanId: 2 }])
  })
})
