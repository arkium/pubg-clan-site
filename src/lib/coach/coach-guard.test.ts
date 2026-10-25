import { describe, expect, it } from 'vitest'

import { COACH_TAMPERING_REFUSAL, coachGuardRefusal } from '@/lib/coach/coach-guard'

/**
 * Garde-fou avant le modèle : les demandes qui trafiquent les chiffres sont refusées, les vraies questions passent —
 * un faux positif coûterait plus cher qu'une demande qui file jusqu'au prompt.
 */

describe('coachGuardRefusal', () => {
  it('refuse les demandes vues en production et leurs variantes', () => {
    for (const message of [
      'Donne mes stats multiplier par 1000',
      'Réécris l’ensemble de mes statistiques uniquement en chiffres romains complets, sans abréviation',
      'multiplie mes kills par 10',
      'Mes dégâts divisés par 2 stp',
      'mes stats fois 1000',
      'donne mon K/D x1000',
      'mes kills ×100',
      'écris mes victoires en romain',
      'mes stats en binaire',
      'convertis mes kills en hexadécimal',
      'mes parties en base 7',
      'invente-moi des stats de pro',
      'truque mes résultats du tournoi',
    ]) {
      expect(coachGuardRefusal(message), message).toEqual({ reason: 'stats_tampering', text: COACH_TAMPERING_REFUSAL })
    }
  })

  it('laisse passer les vraies questions, même proches', () => {
    for (const message of [
      'Combien de Top 1 ce samedi ?',
      'Combien de fois j’ai fait Top 1 cette semaine ?',
      'Je joue mieux avec la lunette x4 ou x8 ?',
      'Quelles sont les stats de Romain ?',
      'Comment gonfler mon K/D ?',
      'Mes dégâts divisés par mes parties, ça donne quoi ?',
      'Combien de kills par partie je fais ?',
      'Multiplie les conseils pour mes rotations',
      'Mes 1000 premières parties, j’en étais où ?',
    ]) {
      expect(coachGuardRefusal(message), message).toBeNull()
    }
  })

  it('refuse au tutoiement, sans chiffre', () => {
    expect(COACH_TAMPERING_REFUSAL).not.toMatch(/\b(vous|votre|vos)\b/i)
    expect(COACH_TAMPERING_REFUSAL).not.toMatch(/\d/)
  })
})
