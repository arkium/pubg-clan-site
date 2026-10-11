import { describe, expect, it } from 'vitest'

import {
  TOURNAMENT_MODE_DISPLAY,
  compactSquadLabel,
  countdownLabel,
  elapsedLabel,
  formatTournamentPoints,
  formatTournamentStat,
  isViewerParticipant,
  leaderWindow,
  participantClanIds,
  participantCountLabel,
  participantForm,
  placementScale,
  resolveTournamentPhase,
  squadLabelGroups,
  tournamentRuleLines,
  viewerPosition,
  viewerSentence,
} from './tournament-mode-display'
import { TOURNAMENT_MODES, type TournamentParticipant } from './tournament-service'

const clan = (clanId: number): TournamentParticipant => ({ kind: 'clan', clanId })
const player = (memberId: number, clanId: number | null): TournamentParticipant => ({ kind: 'player', memberId, clanId })
const team = (memberIds: number[], clanIds: number[]): TournamentParticipant => ({ kind: 'team', memberIds, clanIds })

describe('présentation des modes', () => {
  it('couvre chaque mode du moteur', () => {
    expect(Object.keys(TOURNAMENT_MODE_DISPLAY).sort()).toEqual([...TOURNAMENT_MODES].sort())
  })

  it('compte ce que le mode classe, au singulier comme au pluriel', () => {
    expect(participantCountLabel('inter_clan', 6)).toBe('6 clans')
    expect(participantCountLabel('solo_ffa', 1)).toBe('1 joueur')
    expect(participantCountLabel('custom_teams', 5)).toBe('5 équipes')
    expect(participantCountLabel('intra_clan', 4)).toBe('4 squads')
  })

  it('n’affiche la décimale des points que si elle existe', () => {
    expect(formatTournamentPoints(42)).toBe('42')
    expect(formatTournamentPoints(18.5)).toBe('18,5')
  })
})

describe('le lecteur dans un classement', () => {
  const viewer = { memberIds: [7], clanIds: [2] }

  it('se reconnaît selon le mode : son clan, lui-même ou une équipe où il joue', () => {
    expect(isViewerParticipant(clan(2), viewer)).toBe(true)
    expect(isViewerParticipant(clan(3), viewer)).toBe(false)
    expect(isViewerParticipant(player(7, 2), viewer)).toBe(true)
    // En solo, un autre joueur du même clan n'est pas le lecteur.
    expect(isViewerParticipant(player(8, 2), viewer)).toBe(false)
    expect(isViewerParticipant(team([5, 7], [1, 2]), viewer)).toBe(true)
    expect(isViewerParticipant(team([5, 6], [2]), viewer)).toBe(false)
  })

  it('situe le lecteur par rapport au premier', () => {
    const standings = [
      { participant: clan(9), totalPoints: 58, label: '[LMT] La Meute' },
      { participant: clan(2), totalPoints: 52, label: '[DEMO] Clan Démo' },
      { participant: clan(4), totalPoints: 41, label: '[RATZ] Les Ratz' },
    ]
    const position = viewerPosition(standings, viewer, 'inter_clan')
    expect(position).toMatchObject({ who: 'Ton clan', rank: 2, gapToLeader: 6, leaderLabel: '[LMT] La Meute' })
    expect(viewerSentence(position!)).toBe('Ton clan est 2e, à 6 pts de [LMT] La Meute')
  })

  it('en tête, parle d’avance ; en solo, tutoie', () => {
    const position = viewerPosition(
      [
        { participant: player(7, 2), totalPoints: 30 },
        { participant: player(8, 3), totalPoints: 26 },
      ],
      viewer,
      'solo_ffa'
    )
    expect(viewerSentence(position!)).toBe('Tu es 1er, 4 pts d’avance')
  })

  it('reste muet quand le lecteur ne joue pas (visiteur)', () => {
    expect(viewerPosition([{ participant: clan(9), totalPoints: 10 }], { memberIds: [], clanIds: [] }, 'inter_clan')).toBeNull()
  })

  it('liste les clans d’un participant', () => {
    expect(participantClanIds(clan(2))).toEqual([2])
    expect(participantClanIds(player(7, null))).toEqual([])
    expect(participantClanIds(team([1, 2, 3], [4, 4, 5]))).toEqual([4, 5])
  })
})

describe('forme : la place à chaque manche', () => {
  it('suit l’ordre des manches et signale une absence', () => {
    const rounds = [
      { index: 1, scores: [{ key: 'clan:2', bestPlacement: 3 }] },
      { index: 2, scores: [{ key: 'clan:9', bestPlacement: 1 }] },
      { index: 3, scores: [{ key: 'clan:2', bestPlacement: 1 }] },
    ]
    expect(participantForm('clan:2', rounds)).toEqual([
      { round: 1, placement: 3 },
      { round: 2, placement: null },
      { round: 3, placement: 1 },
    ])
  })
})

describe('temps', () => {
  const now = new Date('2026-09-27T18:00:00Z')

  it('compte à rebours en heures puis en jours, rien une fois passé', () => {
    expect(countdownLabel('2026-09-27T23:00:00Z', now)).toBe('dans 5 h')
    expect(countdownLabel('2026-09-29T18:00:00Z', now)).toBe('dans 2 j')
    expect(countdownLabel('2026-09-27T18:20:00Z', now)).toBe('dans moins d’une heure')
    expect(countdownLabel('2026-09-26T18:00:00Z', now)).toBeNull()
  })

  it('dit depuis quand la dernière manche a été jouée', () => {
    expect(elapsedLabel('2026-09-27T17:38:00Z', now)).toBe('il y a 22 min')
    expect(elapsedLabel('2026-09-27T15:00:00Z', now)).toBe('il y a 3 h')
    expect(elapsedLabel('2026-09-25T18:00:00Z', now)).toBe('il y a 2 j')
  })

  it('résout la phase affichée : le dernier jour compte jusqu’à minuit', () => {
    const at = new Date('2026-09-17T20:00:00Z')
    expect(resolveTournamentPhase({ status: 'active', startDate: '2026-09-15', endDate: '2026-09-17' }, at)).toBe('live')
    expect(resolveTournamentPhase({ status: 'active', startDate: '2026-09-20', endDate: '2026-09-21' }, at)).toBe('upcoming')
    expect(resolveTournamentPhase({ status: 'draft', startDate: '2026-09-15', endDate: '2026-09-17' }, at)).toBe('draft')
  })
})

describe('barème', () => {
  it('classe les places et rapporte chacune au meilleur score', () => {
    const scale = placementScale({ '2': 6, '1': 10, '10': 0, '3': 5 })
    expect(scale.map((entry) => entry.placement)).toEqual([1, 2, 3, 10])
    expect(scale[0].ratio).toBe(1)
    expect(scale[1].ratio).toBeCloseTo(0.6)
    expect(scale[3].ratio).toBe(0)
  })

  it('résume kill, bonus, manches retenues et, en inter-clans seulement, les escouades mixtes', () => {
    const base = { killPoints: 1, winBonus: 2, bestOfRounds: null, mixedSquadRule: 'prorata' as const }
    expect(tournamentRuleLines({ ...base, mode: 'inter_clan' })).toEqual([
      { label: 'Par kill', value: '1 pt' },
      { label: 'Bonus Top 1', value: '+2 pts' },
      { label: 'Manches retenues', value: 'toutes' },
      { label: 'Squads mixtes', value: 'au prorata de l’effectif' },
    ])
    const solo = tournamentRuleLines({ ...base, mode: 'solo_ffa', bestOfRounds: 3 })
    expect(solo.map((line) => line.label)).not.toContain('Squads mixtes')
    expect(solo.find((line) => line.label === 'Manches retenues')?.value).toBe('les 3 meilleures')
    expect(tournamentRuleLines({ ...base, mode: 'solo_ffa', bestOfRounds: 1 })[2].value).toBe('la meilleure')
  })
})

describe('compactSquadLabel', () => {
  it('écrit le tag une fois par clan, dans l’ordre des joueurs', () => {
    expect(compactSquadLabel(['[SMK] Viande_Hachee', '[SMK] 37u51v3', '[UNG] TigrOo-SmK', '[BEE] Serejaah'])).toBe(
      '[SMK] Viande_Hachee, 37u51v3 + [UNG] TigrOo-SmK + [BEE] Serejaah'
    )
  })

  it('garde tel quel un joueur sans tag', () => {
    expect(compactSquadLabel(['Joueur 99', '[FR] Vi1nny'])).toBe('Joueur 99 + [FR] Vi1nny')
  })
  it('groupe les joueurs par clan pour les tableaux (tag en gras, pseudos en graisse normale)', () => {
    expect(squadLabelGroups(['[LTF] P0mpoko', '[OCD] Valino13', '[OCD] ZaPiT'])).toEqual([
      { tag: '[LTF]', names: ['P0mpoko'] },
      { tag: '[OCD]', names: ['Valino13', 'ZaPiT'] },
    ])
  })
})

describe('statistiques du tournoi — affichage', () => {
  const NNBSP = ' '
  const entries = Array.from({ length: 12 }, (_, index) => ({ key: `player:${index + 1}`, rank: index + 1 }))

  it('les cinq premiers, puis la ligne du lecteur s’il est plus loin', () => {
    expect(leaderWindow(entries, new Set(['player:9']))).toEqual({ top: entries.slice(0, 5), viewer: entries[8] })
    // Déjà dans le top 5 ou absent : pas de ligne en plus.
    expect(leaderWindow(entries, new Set(['player:2'])).viewer).toBeNull()
    expect(leaderWindow(entries, new Set()).viewer).toBeNull()
    expect(leaderWindow(entries, new Set(['player:4']), 3).viewer).toEqual(entries[3])
  })

  it('durées comme les awards du clan, distances en km au-delà de 1 000 m', () => {
    expect(formatTournamentStat(6305, 'duration', '')).toEqual({ value: '1h 45m 05s', unit: '' })
    expect(formatTournamentStat(1343, 'duration', '')).toEqual({ value: '22m 23s', unit: '' })
    expect(formatTournamentStat(42, 'duration', '')).toEqual({ value: '42s', unit: '' })
    expect(formatTournamentStat(428.4, 'distance', 'm')).toEqual({ value: '428', unit: 'm' })
    expect(formatTournamentStat(2537.4, 'distance', 'm')).toEqual({ value: '2,5', unit: 'km' })
    expect(formatTournamentStat(978259, 'distance', 'm')).toEqual({ value: `978`, unit: 'km' })
  })

  it('nombres entiers avec séparateur de milliers ; unité au singulier pour 1, sauf « fois »', () => {
    expect(formatTournamentStat(64909.4, 'damage', 'dégâts')).toEqual({ value: `64${NNBSP}909`, unit: 'dégâts' })
    expect(formatTournamentStat(1, 'count', 'réanimations')).toEqual({ value: '1', unit: 'réanimation' })
    expect(formatTournamentStat(1, 'count', 'fois')).toEqual({ value: '1', unit: 'fois' })
    expect(formatTournamentStat(3, 'count', 'kills')).toEqual({ value: '3', unit: 'kills' })
  })
})
