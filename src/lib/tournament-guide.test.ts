import { describe, expect, it } from 'vitest'

import {
  MIXED_SQUAD_RULE_DESCRIPTIONS,
  TOURNAMENT_GUIDE_CARDS,
  TOURNAMENT_MODE_DESCRIPTIONS,
  TOURNAMENT_QUICK_GUIDE,
} from './tournament-guide'
import { TOURNAMENT_MODES, normalizeTournamentRules } from './tournament-service'

describe('descriptions des modes', () => {
  it('couvre exactement les modes connus du moteur', () => {
    expect(TOURNAMENT_MODE_DESCRIPTIONS.map((mode) => mode.value).sort()).toEqual([...TOURNAMENT_MODES].sort())
  })

  it('n’invente aucun mode : chaque valeur survit à la normalisation', () => {
    for (const mode of TOURNAMENT_MODE_DESCRIPTIONS) {
      expect(normalizeTournamentRules({ mode: mode.value }).mode).toBe(mode.value)
    }
  })

  it('décrit les deux règles d’escouade mixte, elles aussi acceptées par le moteur', () => {
    expect(MIXED_SQUAD_RULE_DESCRIPTIONS.map((rule) => rule.value)).toEqual(['full_share', 'prorata'])
    for (const rule of MIXED_SQUAD_RULE_DESCRIPTIONS) {
      expect(normalizeTournamentRules({ mixedSquadRule: rule.value }).mixedSquadRule).toBe(rule.value)
    }
  })
})

describe('fiches du guide', () => {
  it('couvre les six sujets attendus, sans doublon d’identifiant', () => {
    const ids = TOURNAMENT_GUIDE_CARDS.map((card) => card.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([
      'captured-matches',
      'organizer-rule',
      'modes',
      'mixed-squads',
      'sync',
      'scoring',
      'discord',
    ])
  })

  it('n’a ni titre ni texte vide', () => {
    for (const card of TOURNAMENT_GUIDE_CARDS) {
      expect(card.title.trim().length).toBeGreaterThan(0)
      expect(card.body.trim().length).toBeGreaterThan(20)
      for (const bullet of card.bullets ?? []) {
        expect(bullet.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('explique chaque mode dans la fiche des modes', () => {
    const modesCard = TOURNAMENT_GUIDE_CARDS.find((card) => card.id === 'modes')
    for (const mode of TOURNAMENT_MODE_DESCRIPTIONS) {
      expect(modesCard?.bullets?.some((bullet) => bullet.startsWith(mode.label))).toBe(true)
    }
  })

  it('rappelle les deux pièges qui font qu’un classement paraît faux', () => {
    const scoring = TOURNAMENT_GUIDE_CARDS.find((card) => card.id === 'scoring')
    expect(scoring?.bullets?.some((bullet) => bullet.includes('filtre'))).toBe(true)
    expect(scoring?.bullets?.some((bullet) => bullet.includes('décimaux'))).toBe(true)
  })
})

describe('pages joueurs', () => {
  it('donne à chaque mode un libellé court et ce qu’il classe', () => {
    for (const mode of TOURNAMENT_MODE_DESCRIPTIONS) {
      expect(mode.shortLabel.trim().length).toBeGreaterThan(0)
      expect(mode.ranks).toMatch(/^classe les /)
    }
  })

  it('résume le guide en quatre lignes, d’accord avec les fiches complètes', () => {
    expect(TOURNAMENT_QUICK_GUIDE).toHaveLength(4)
    const text = TOURNAMENT_QUICK_GUIDE.join(' ').toLowerCase()
    // Les quatre règles des fiches : parties personnalisées, clan organisateur, barème, mode.
    for (const concept of ['parties personnalisées', 'clan organisateur', 'placement', 'kill', 'bonus de victoire', 'mode']) {
      expect(text).toContain(concept)
    }
    // Chaque ligne équilibre son gras (`**…**`) : sinon le rendu mettrait tout le reste en gras.
    for (const line of TOURNAMENT_QUICK_GUIDE) {
      expect(line.split('**').length % 2).toBe(1)
    }
  })
})
