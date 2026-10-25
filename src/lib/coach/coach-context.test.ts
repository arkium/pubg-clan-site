import { describe, expect, it } from 'vitest'

import {
  coachContextLabel,
  coachContextPromptBlock,
  coachSuggestions,
  parseCoachContextPath,
  placementLabel,
  type CoachResolvedContext,
} from '@/lib/coach/coach-context'

describe('reconnaissance du chemin de page', () => {
  it('reconnaît les pages du clan', () => {
    expect(parseCoachContextPath('/clans/292/telemetry/matches/cmatch123/debrief')).toEqual({ kind: 'match', clanId: 292, matchId: 'cmatch123' })
    expect(parseCoachContextPath('/clans/292/telemetry/matches/cmatch123/debrief?tab=replay#x')).toEqual({ kind: 'match', clanId: 292, matchId: 'cmatch123' })
    expect(parseCoachContextPath('/clans/292/matches/session/2026-10-22')).toEqual({ kind: 'session', clanId: 292, date: '2026-10-22' })
    expect(parseCoachContextPath('/clans/292/matches')).toEqual({ kind: 'clan', clanId: 292, page: 'matches' })
    expect(parseCoachContextPath('/clans/292/stats/weapons')).toEqual({ kind: 'clan', clanId: 292, page: 'weapons' })
    expect(parseCoachContextPath('/clans/292/stats/maps')).toEqual({ kind: 'clan', clanId: 292, page: 'maps' })
    expect(parseCoachContextPath('/clans/292/stats/opponents')).toEqual({ kind: 'clan', clanId: 292, page: 'opponents' })
    expect(parseCoachContextPath('/clans/292/drop-zones')).toEqual({ kind: 'clan', clanId: 292, page: 'drop-zones' })
    expect(parseCoachContextPath('/clans/292/overview')).toEqual({ kind: 'clan', clanId: 292, page: 'other' })
  })

  it('reconnaît les pages joueur et tournoi', () => {
    expect(parseCoachContextPath('/members/77/weapons')).toEqual({ kind: 'member', memberId: 77, page: 'weapons' })
    expect(parseCoachContextPath('/members/77/nemesis')).toEqual({ kind: 'member', memberId: 77, page: 'nemesis' })
    expect(parseCoachContextPath('/members/77/dashboard')).toEqual({ kind: 'member', memberId: 77, page: 'career' })
    expect(parseCoachContextPath('/members/77/rewards')).toEqual({ kind: 'member', memberId: 77, page: 'other' })
    expect(parseCoachContextPath('/members/77/items')).toEqual({ kind: 'member', memberId: 77, page: 'items' })
    expect(parseCoachContextPath('/members/77/heatmap')).toEqual({ kind: 'member', memberId: 77, page: 'heatmap' })
    expect(parseCoachContextPath('/members/77/stats')).toEqual({ kind: 'member', memberId: 77, page: 'career' })
    expect(parseCoachContextPath('/members/77/playstyle')).toEqual({ kind: 'member', memberId: 77, page: 'playstyle' })
    expect(parseCoachContextPath('/clans/292/stats')).toEqual({ kind: 'clan', clanId: 292, page: 'playstyle' })
    expect(parseCoachContextPath('/clans/292/stats/career')).toEqual({ kind: 'clan', clanId: 292, page: 'career' })
    expect(parseCoachContextPath('/clans/292/stats/zone-closures')).toEqual({ kind: 'clan', clanId: 292, page: 'zone-closures' })
    expect(parseCoachContextPath('/clans/292/stats/positions?map=Erangel')).toEqual({ kind: 'clan', clanId: 292, page: 'positions' })
    expect(parseCoachContextPath('/clans/292/stats/awards')).toEqual({ kind: 'clan', clanId: 292, page: 'other' })
    expect(parseCoachContextPath('/players?tab=compare')).toEqual({ kind: 'players' })
    expect(parseCoachContextPath('/tournaments/ctour1/matches/cmatch9')).toEqual({ kind: 'tournament-match', tournamentId: 'ctour1', matchId: 'cmatch9' })
    expect(parseCoachContextPath('/tournaments/ctour1')).toEqual({ kind: 'tournament', tournamentId: 'ctour1' })
    expect(parseCoachContextPath('/tournaments/ctour1/matches')).toEqual({ kind: 'tournament', tournamentId: 'ctour1' })
    expect(parseCoachContextPath('/tournaments')).toEqual({ kind: 'none' })
    expect(parseCoachContextPath('/tournaments/ctour1/settings')).toEqual({ kind: 'none' })
  })

  it('ne fait confiance à rien d’autre', () => {
    expect(parseCoachContextPath(null)).toEqual({ kind: 'none' })
    expect(parseCoachContextPath('')).toEqual({ kind: 'none' })
    expect(parseCoachContextPath('/players/abc')).toEqual({ kind: 'none' })
    expect(parseCoachContextPath('/clans/abc/matches')).toEqual({ kind: 'none' })
    expect(parseCoachContextPath('/clans/0/matches')).toEqual({ kind: 'none' })
    expect(parseCoachContextPath('/members/-1/weapons')).toEqual({ kind: 'none' })
    expect(parseCoachContextPath('/clans/1/telemetry/matches/../../debrief')).toEqual({ kind: 'clan', clanId: 1, page: 'other' })
    expect(parseCoachContextPath('/clans/1/telemetry/matches/%2e%2e/debrief')).toEqual({ kind: 'clan', clanId: 1, page: 'other' })
    expect(parseCoachContextPath(`/clans/1/${'a'.repeat(600)}`)).toEqual({ kind: 'none' })
  })
})

const match: CoachResolvedContext = {
  kind: 'match',
  matchId: 'cmatch123',
  mapName: 'Erangel_Main',
  mapLabel: 'Erangel',
  createdAt: new Date('2026-10-22T19:47:00Z'),
  placement: 3,
  squadKills: 18,
  telemetryAnalyzed: true,
}

const tournament: CoachResolvedContext = { kind: 'tournament', tournamentId: 'ctour1', title: 'L’Observateur des fun', phase: 'finished' }

describe('étiquette, suggestions et bloc de prompt', () => {
  it('écrit le bandeau sans numéro de match, à l’heure de Paris', () => {
    expect(coachContextLabel(match)).toBe('Erangel · 22 oct. 21:47 · Top 3')
    expect(placementLabel(1)).toBe('Top 1')
    expect(placementLabel(10)).toBe('Top 10')
    expect(placementLabel(17)).toBe('17e')
    expect(coachContextLabel({ kind: 'session', date: '2026-10-22' })).toBe('Soirée du 22/10')
    expect(coachContextLabel({ kind: 'none' })).toBeNull()
  })

  it('nomme un tournoi par son titre, coupé s’il est long', () => {
    expect(coachContextLabel(tournament)).toBe('Tournoi · L’Observateur des fun')
    const label = coachContextLabel({ ...tournament, title: 'Un titre de tournoi vraiment très long qui dépasse largement la limite du bandeau' })!
    expect(label.endsWith('…')).toBe(true)
    expect(label.length).toBeLessThanOrEqual('Tournoi · '.length + 60)
  })

  it('propose trois suggestions quel que soit le contexte', () => {
    const kinds: CoachResolvedContext[] = [
      match,
      { ...match, telemetryAnalyzed: false },
      { kind: 'session', date: '2026-10-22' },
      { kind: 'weapons', memberId: 7, memberName: 'NovakTV' },
      { kind: 'items', memberId: 7, memberName: 'NovakTV' },
      { kind: 'schedule', memberId: 7, memberName: 'NovakTV' },
      { kind: 'career', memberId: 7, memberName: 'NovakTV' },
      { kind: 'playstyle', memberId: 7, memberName: 'NovakTV' },
      { kind: 'playstyle', memberId: null, memberName: null },
      { kind: 'players' },
      { kind: 'opponents' },
      { kind: 'drop-zones' },
      { kind: 'drop-zones', memberName: 'NovakTV' },
      { kind: 'maps' },
      { kind: 'clan-career' },
      { kind: 'zone-closures' },
      { kind: 'cities' },
      tournament,
      { ...tournament, phase: 'live' },
      { ...tournament, phase: 'upcoming' },
      { kind: 'none' },
    ]
    for (const context of kinds) expect(coachSuggestions(context)).toHaveLength(3)
    expect(coachSuggestions(match)[0]).toBe('Pourquoi on s’est fait sortir ?')
    expect(coachSuggestions(tournament)[0]).toBe('Qui a gagné le tournoi ?')
    expect(coachSuggestions({ ...tournament, phase: 'live' })[0]).toBe('Qui est en tête ?')
    expect(coachSuggestions({ ...tournament, phase: 'upcoming' })[0]).toBe('Quand commence le tournoi ?')
  })

  it('dit au modèle quel outil appeler', () => {
    expect(coachContextPromptBlock(match)).toContain('getMatchDebrief avec matchId « cmatch123 »')
    expect(coachContextPromptBlock({ ...match, telemetryAnalyzed: false })).toContain('pas encore analysée')
    expect(coachContextPromptBlock({ kind: 'weapons', memberId: 7, memberName: 'NovakTV' })).toContain('getWeaponStats')
    expect(coachContextPromptBlock({ kind: 'session', date: '2026-10-22' })).toContain('getSessions avec date « 2026-10-22 »')
    expect(coachContextPromptBlock({ kind: 'clan-career' })).toContain('getClanCareer')
    expect(coachContextPromptBlock({ kind: 'zone-closures' })).toContain('getZoneClosures')
    expect(coachContextPromptBlock({ kind: 'cities' })).toContain('getCityInsights avec scope « clan »')
    expect(coachContextPromptBlock({ kind: 'drop-zones', memberName: 'NovakTV' })).toContain('getDropZones avec playerName « NovakTV »')
    expect(coachContextPromptBlock({ kind: 'drop-zones' })).not.toContain('playerName')
    expect(coachContextLabel({ kind: 'drop-zones', memberName: 'NovakTV' })).toBe('Largages de NovakTV')
    expect(coachContextLabel({ kind: 'clan-career' })).toBe('Carrière PUBG du clan')
    expect(coachContextLabel({ kind: 'zone-closures' })).toBe('Fin de zone')
    expect(coachContextLabel({ kind: 'cities' })).toBe('Positions et villes')
    expect(coachContextLabel({ kind: 'items', memberId: 7, memberName: 'NovakTV' })).toBe('Objets de NovakTV')
    expect(coachContextLabel({ kind: 'maps' })).toBe('Cartes du clan')
    expect(coachContextLabel({ kind: 'schedule', memberId: 7, memberName: 'NovakTV' })).toBe('Activité de NovakTV')
    expect(coachContextPromptBlock({ kind: 'schedule', memberId: 7, memberName: 'NovakTV' })).toContain('getPlaySchedule')
    expect(coachContextLabel({ kind: 'players' })).toBe('Classement des joueurs')
    expect(coachContextLabel({ kind: 'career', memberId: 7, memberName: 'NovakTV' })).toBe('Carrière de NovakTV')
    expect(coachContextPromptBlock({ kind: 'career', memberId: 7, memberName: 'NovakTV' })).toContain('getCareerStats')
    expect(coachContextLabel({ kind: 'playstyle', memberId: null, memberName: null })).toBe('Style de jeu du clan')
    expect(coachContextLabel({ kind: 'playstyle', memberId: 7, memberName: 'NovakTV' })).toBe('Style de jeu de NovakTV')
    expect(coachContextPromptBlock({ kind: 'playstyle', memberId: 7, memberName: 'NovakTV' })).toContain('getClanPlaystyle avec playerName « NovakTV »')
    expect(coachContextPromptBlock({ kind: 'players' })).toContain('getPlayerBenchmark')
    expect(coachContextPromptBlock({ kind: 'maps' })).toContain('getMapPerformance')
    expect(coachContextPromptBlock({ kind: 'items', memberId: 7, memberName: 'NovakTV' })).toContain('getItemUsage')
    expect(coachContextPromptBlock(tournament)).toContain('getTournamentResults avec tournamentId « ctour1 »')
    // « Mon résultat » sur la page d'un tournoi : la ligne du joueur, et ses armes du tournoi.
    expect(coachContextPromptBlock(tournament)).toContain('« mon résultat » est sa ligne « you »')
    expect(coachContextPromptBlock(tournament)).toContain('terminé')
    expect(coachContextPromptBlock({ kind: 'none' })).toContain('sans contexte')
  })
})
