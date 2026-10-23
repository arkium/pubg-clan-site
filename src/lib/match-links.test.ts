import { describe, expect, it } from 'vitest'

import { clanSessionDataPath, matchDebriefPath, matchTournamentDebriefPath, matchTournamentReplayPath } from './match-links'

describe('match-links', () => {
  it('construit le lien du débriefing sans contexte', () => {
    expect(matchDebriefPath(18, 'cmu1k4in8auof0493sog1dm50')).toBe(
      '/clans/18/telemetry/matches/cmu1k4in8auof0493sog1dm50/debrief'
    )
  })

  it('reprend période et date pour le lien retour', () => {
    expect(matchDebriefPath(1, 'abc', { period: 'week', fromDate: '2026-09-13' })).toBe(
      '/clans/1/telemetry/matches/abc/debrief?period=week&fromDate=2026-09-13'
    )
  })

  it('mène le SuperUser à la soirée d’une partie dans les données du clan', () => {
    expect(clanSessionDataPath(292, '2026-10-22')).toBe('/clans/292/settings/data/sessions/2026-10-22')
  })

  it('encode un identifiant inattendu plutôt que de casser le chemin', () => {
    expect(matchDebriefPath(1, 'a/b')).toBe('/clans/1/telemetry/matches/a%2Fb/debrief')
  })
})

describe('matchTournamentDebriefPath', () => {
  it('construit le lien du débriefing de manche', () => {
    expect(matchTournamentDebriefPath('cmthj1d0q002tunb4hyosm3a8', 'cmthld13a00dd04aw8xu80llc')).toBe(
      '/tournaments/cmthj1d0q002tunb4hyosm3a8/matches/cmthld13a00dd04aw8xu80llc'
    )
  })
})

describe('matchTournamentReplayPath', () => {
  it('ouvre le débriefing de manche sur l’onglet Replay 2D', () => {
    expect(matchTournamentReplayPath('t1', 'm1')).toBe('/tournaments/t1/matches/m1?tab=replay')
  })
})
