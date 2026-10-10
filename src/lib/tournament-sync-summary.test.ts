import { describe, expect, it } from 'vitest'

import { summarizeTournamentSync, tournamentSyncFailureMessage } from './tournament-sync-summary'

// Module pur : aucune base, aucun réseau. Le tournoi [FR] du 10/10/2026, 21:00 → 01:00 (heure de Paris).
const TOURNAMENT = {
  startDate: '2026-10-10T19:00:00.000Z',
  endDate: '2026-10-10T23:00:00.000Z',
  gameMode: null,
  mapName: null,
}
const DURING = new Date('2026-10-10T20:30:00.000Z')

describe('summarizeTournamentSync', () => {
  it('une manche arrivée : combien, le total, et que le replay suit', () => {
    const summary = summarizeTournamentSync({ newRounds: 1, eligibleMatches: 3 }, TOURNAMENT, DURING)
    expect(summary.tone).toBe('success')
    expect(summary.message).toContain('1 nouvelle manche ajoutée — 3 manches au total.')
    expect(summary.message).toContain('replay')
  })

  it('accorde le pluriel', () => {
    expect(summarizeTournamentSync({ newRounds: 2, eligibleMatches: 2 }, TOURNAMENT, DURING).message).toContain(
      '2 nouvelles manches ajoutées — 2 manches au total.'
    )
  })

  it('0 manche : PUBG ne l’a pas encore publiée, attendre puis recliquer sans risque, avec la fenêtre du tournoi', () => {
    const summary = summarizeTournamentSync({ newRounds: 0, eligibleMatches: 0 }, TOURNAMENT, DURING)
    expect(summary.tone).toBe('waiting')
    expect(summary.message).toContain('Aucune manche trouvée pour l’instant.')
    expect(summary.message).toContain('PUBG publie une partie quelques minutes après sa fin')
    expect(summary.message).toContain('recliquez')
    expect(summary.message).toContain('sans risque')
    expect(summary.message).toContain('10 oct. 21:00 → 11 oct. 01:00')
    // Sans filtre, pas de phrase sur les filtres.
    expect(summary.message).not.toContain('ne retient que')
  })

  it('0 manche avec un filtre : le rappelle, car un filtre trop strict ne retient rien', () => {
    const summary = summarizeTournamentSync(
      { newRounds: 0, eligibleMatches: 0 },
      { ...TOURNAMENT, gameMode: 'normal-squad', mapName: 'Baltic_Main' },
      DURING
    )
    expect(summary.message).toMatch(/Le tournoi ne retient que : format .+, carte .+\./)
  })

  it('rien de nouveau mais des manches déjà là : le dit, et invite à recliquer', () => {
    const summary = summarizeTournamentSync({ newRounds: 0, eligibleMatches: 4 }, TOURNAMENT, DURING)
    expect(summary.tone).toBe('waiting')
    expect(summary.message).toContain('Aucune nouvelle manche — 4 manches déjà au classement.')
    expect(summary.message).toContain('recliquez')
  })

  it('avant le début : le tournoi n’a pas commencé', () => {
    const summary = summarizeTournamentSync(
      { newRounds: 0, eligibleMatches: 0 },
      TOURNAMENT,
      new Date('2026-10-10T15:00:00.000Z')
    )
    expect(summary).toMatchObject({ tone: 'waiting', message: expect.stringContaining('Le tournoi n’a pas commencé') })
  })

  it('signale une partie illisible', () => {
    const summary = summarizeTournamentSync(
      { newRounds: 1, eligibleMatches: 1, materializationErrors: ['match abc : délai dépassé'] },
      TOURNAMENT,
      DURING
    )
    expect(summary.message).toContain('Une partie n’a pas pu être lue : match abc : délai dépassé.')
  })

  it('réponse sans décompte (serveur antérieur) : le total seulement', () => {
    expect(summarizeTournamentSync({ eligibleMatches: 2 }, TOURNAMENT, DURING)).toEqual({
      tone: 'success',
      message: 'Synchronisation terminée : 2 manches au classement.',
    })
  })
})

describe('tournamentSyncFailureMessage', () => {
  it('réseau coupé : recharger avant de recliquer', () => {
    expect(tournamentSyncFailureMessage(null, null)).toContain('Rechargez la page dans une minute')
  })

  it('délai du proxy dépassé (réponse non JSON) : la synchronisation continue peut-être', () => {
    expect(tournamentSyncFailureMessage(504, null)).toContain('continue peut-être sur le serveur')
  })

  it('session expirée', () => {
    expect(tournamentSyncFailureMessage(401, { error: 'Unauthorized' })).toContain('reconnectez-vous')
  })

  it('refus de la garde : réservé à l’Owner', () => {
    expect(tournamentSyncFailureMessage(403, { error: 'Forbidden' })).toContain('réservé à l’Owner du clan organisateur')
  })

  it('refus expliqué par la route : repris tel quel', () => {
    const error = 'Seul un joueur du clan organisateur peut synchroniser.'
    expect(tournamentSyncFailureMessage(403, { error })).toBe(error)
  })

  it('échec PUBG : la raison, puis réessayer sans risque', () => {
    const message = tournamentSyncFailureMessage(502, { error: 'La récupération PUBG a échoué : clan 1: Too Many Requests' })
    expect(message).toContain('La récupération PUBG a échoué')
    expect(message).toContain('Réessayez dans une minute')
    expect(message).toContain('sans risque')
  })
})
