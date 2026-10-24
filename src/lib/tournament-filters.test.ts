import { describe, expect, it } from 'vitest'

import {
  TOURNAMENT_GAME_MODE_OPTIONS,
  TOURNAMENT_MAP_OPTIONS,
  normalizeTournamentGameMode,
  normalizeTournamentMapName,
  tournamentFilterWarning,
  tournamentGameModeLabel,
  tournamentMapLabel,
} from './tournament-filters'

describe('normalizeTournamentMapName', () => {
  it('traduit un nom d’affichage hérité vers la valeur interne des matchs', () => {
    // Piège : le dictionnaire officiel associe « Erangel » à `Erangel_Main`, une carte qui ne sort plus.
    // Les matchs se jouent sur `Baltic_Main`.
    expect(normalizeTournamentMapName('Erangel')).toBe('Baltic_Main')
    expect(normalizeTournamentMapName('miramar')).toBe('Desert_Main')
    expect(normalizeTournamentMapName('Karakin')).toBe('Summerland_Main')
    expect(normalizeTournamentMapName('Deston')).toBe('Kiki_Main')
  })

  it('laisse passer une valeur déjà interne et traite le vide comme « toutes les cartes »', () => {
    expect(normalizeTournamentMapName('Baltic_Main')).toBe('Baltic_Main')
    expect(normalizeTournamentMapName('')).toBeNull()
    expect(normalizeTournamentMapName(null)).toBeNull()
  })

  it('ne propose que des valeurs internes dans la liste du formulaire', () => {
    const values = TOURNAMENT_MAP_OPTIONS.map((option) => option.value).filter(Boolean)
    expect(values.every((value) => value.endsWith('_Main'))).toBe(true)
    expect(TOURNAMENT_MAP_OPTIONS[0]).toEqual({ value: '', label: 'Toutes les cartes' })
  })
})

describe('normalizeTournamentGameMode', () => {
  it('traduit les modes hérités vers ceux des parties personnalisées', () => {
    expect(normalizeTournamentGameMode('squad')).toBe('normal-squad')
    expect(normalizeTournamentGameMode('Duo')).toBe('normal-duo')
    expect(normalizeTournamentGameMode('solo')).toBe('normal-solo')
  })

  it('ramène « trio » à tous les modes : ce n’est pas un mode PUBG', () => {
    expect(normalizeTournamentGameMode('trio')).toBeNull()
  })

  it('laisse passer une valeur réelle', () => {
    expect(normalizeTournamentGameMode('normal-squad')).toBe('normal-squad')
    expect(normalizeTournamentGameMode('tdm')).toBe('tdm')
    expect(normalizeTournamentGameMode(null)).toBeNull()
  })

  it('ne propose que des modes observés sur des matchs personnalisés', () => {
    expect(TOURNAMENT_GAME_MODE_OPTIONS.map((option) => option.value)).toEqual([
      '',
      'normal-squad',
      'normal-duo',
      'normal-solo',
      'tdm',
    ])
  })
})

describe('libellés', () => {
  it('affiche un libellé lisible, y compris pour une valeur héritée', () => {
    expect(tournamentMapLabel('Erangel')).toBe('Erangel')
    expect(tournamentMapLabel('Baltic_Main')).toBe('Erangel')
    expect(tournamentMapLabel(null)).toBe('Toutes les cartes')
    expect(tournamentGameModeLabel('squad')).toBe('Squad (partie perso)')
    expect(tournamentGameModeLabel(null)).toBe('Tous les modes')
  })
})

describe('tournamentFilterWarning — bandeau du formulaire (2026-10-24)', () => {
  it('sans filtre : aucun bandeau', () => {
    expect(tournamentFilterWarning('', '')).toBeNull()
    expect(tournamentFilterWarning(null, null)).toBeNull()
  })

  it('mode seul : dit ce qui est gardé et qu’une autre manche est ignorée, télémétrie comprise', () => {
    const warning = tournamentFilterWarning('normal-squad', '')
    expect(warning).toContain('seules les manches en Squad (partie perso) entreront au classement')
    expect(warning).toContain('Une manche jouée dans un autre mode sera ignorée, même pendant le tournoi')
    expect(warning).toContain('sa télémétrie ne sera pas récupérée')
    expect(warning).toContain('laisse « Tous les modes » et « Toutes les cartes »')
  })

  it('carte seule', () => {
    const warning = tournamentFilterWarning('', 'Baltic_Main')
    expect(warning).toContain('seules les manches sur Erangel entreront au classement')
    expect(warning).toContain('Une manche jouée sur une autre carte sera ignorée')
  })

  it('mode et carte, valeurs héritées comprises', () => {
    const warning = tournamentFilterWarning('squad', 'Erangel')
    expect(warning).toContain('seules les manches en Squad (partie perso) sur Erangel entreront au classement')
    expect(warning).toContain('dans un autre mode ou sur une autre carte')
  })
})
