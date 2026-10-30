import { describe, expect, it } from 'vitest'

import { COACH_GAP_TOOL_DECLARATION, COACH_GAP_TOOL_NAME, COACH_GAP_TOPIC_MAX, coachGapTopics, normalizeCoachGapTopic, runCoachGapTool } from '@/lib/coach/coach-gap'

// Lacune déclarée par le Coach IA (2026-10-30) : outil sans donnée, gardé dans l'audit d'une réponse.

describe('coach-gap', () => {
  it('déclare un outil à un seul paramètre, le sujet', () => {
    expect(COACH_GAP_TOOL_DECLARATION.name).toBe(COACH_GAP_TOOL_NAME)
    expect(COACH_GAP_TOOL_DECLARATION.parameters).toMatchObject({ required: ['topic'] })
  })

  it('nettoie le sujet : espaces resserrés, adresse masquée, 60 caractères au plus, vide refusé', () => {
    expect(normalizeCoachGapTopic('  dégâts   subis par arme ')).toBe('dégâts subis par arme')
    expect(normalizeCoachGapTopic('écris à joueur@example.com')).not.toContain('@')
    const long = normalizeCoachGapTopic('a'.repeat(90))!
    expect(long.length).toBe(COACH_GAP_TOPIC_MAX)
    expect(long.endsWith('…')).toBe(true)
    expect(normalizeCoachGapTopic('   ')).toBeNull()
    expect(normalizeCoachGapTopic(42)).toBeNull()
  })

  it('accuse réception sans rien lire, ou échoue sur un sujet vide', () => {
    expect(runCoachGapTool({ name: COACH_GAP_TOOL_NAME, args: { topic: 'coéquipiers par partie' } })).toEqual({ recorded: true, topic: 'coéquipiers par partie' })
    expect(runCoachGapTool({ name: COACH_GAP_TOOL_NAME, args: {} })).toEqual({ error: 'empty_topic' })
  })

  it('lit les sujets d’un audit : la lacune réussie seulement, jamais un autre outil', () => {
    expect(
      coachGapTopics([
        { name: 'getSessions', args: { date: '2026-10-24' } },
        { name: COACH_GAP_TOOL_NAME, args: { topic: ' coéquipiers ' } },
        { name: COACH_GAP_TOOL_NAME, args: {}, failed: 'empty_topic' },
      ])
    ).toEqual(['coéquipiers'])
    expect(coachGapTopics(null)).toEqual([])
  })
})
