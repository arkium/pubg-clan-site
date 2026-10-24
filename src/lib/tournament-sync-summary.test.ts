import { describe, expect, it } from 'vitest'

import {
  TOURNAMENT_SYNC_MAX_ATTEMPTS,
  summarizeTournamentSync,
  tournamentSyncFailureMessage,
  tournamentSyncProgressMessage,
  tournamentSyncWaitingNotice,
} from './tournament-sync-summary'

// Module pur : aucune base, aucun réseau. Le tournoi [FR] du 10/10/2026, 21:00 → 01:00 (heure de Paris).
const TOURNAMENT = {
  startDate: '2026-10-10T19:00:00.000Z',
  endDate: '2026-10-10T23:00:00.000Z',
  gameMode: null,
  mapName: null,
}
const DURING = new Date('2026-10-10T20:30:00.000Z')

describe('summarizeTournamentSync', () => {
  it('une manche arrivée : combien, le total, et que le replay suit ; pas de nouvel essai', () => {
    const summary = summarizeTournamentSync({ newRounds: 1, eligibleMatches: 3 }, TOURNAMENT, DURING)
    expect(summary.tone).toBe('success')
    expect(summary.retry).toBe(false)
    expect(summary.message).toContain('1 nouvelle manche ajoutée — 3 manches au total.')
    expect(summary.message).toContain('replay')
  })

  it('accorde le pluriel', () => {
    expect(summarizeTournamentSync({ newRounds: 2, eligibleMatches: 2 }, TOURNAMENT, DURING).message).toContain(
      '2 nouvelles manches ajoutées — 2 manches au total.'
    )
  })

  it('0 manche : rappelle ce qui compte (un joueur du clan organisateur, la fenêtre) et demande un nouvel essai', () => {
    const summary = summarizeTournamentSync({ newRounds: 0, eligibleMatches: 0 }, TOURNAMENT, DURING)
    expect(summary.tone).toBe('waiting')
    expect(summary.retry).toBe(true)
    expect(summary.message).toContain('Aucune manche trouvée pour l’instant.')
    expect(summary.message).toContain('jouées par au moins un joueur du clan organisateur')
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

  it('rien de nouveau mais des manches déjà là : le dit, et demande un nouvel essai', () => {
    const summary = summarizeTournamentSync({ newRounds: 0, eligibleMatches: 4 }, TOURNAMENT, DURING)
    expect(summary).toMatchObject({ tone: 'waiting', retry: true })
    expect(summary.message).toContain('Aucune nouvelle manche pour l’instant — 4 manches déjà au classement.')
  })

  it('avant le début : le tournoi n’a pas commencé, aucun nouvel essai', () => {
    const summary = summarizeTournamentSync(
      { newRounds: 0, eligibleMatches: 0 },
      TOURNAMENT,
      new Date('2026-10-10T15:00:00.000Z')
    )
    expect(summary).toMatchObject({ tone: 'waiting', retry: false, message: expect.stringContaining('Le tournoi n’a pas commencé') })
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
      retry: false,
      message: 'Synchronisation terminée : 2 manches au classement.',
    })
  })
})

describe('relance automatique (10 essais, un par minute)', () => {
  const nothingYet = summarizeTournamentSync({ newRounds: 0, eligibleMatches: 3 }, TOURNAMENT, DURING)

  it('pendant un essai : le numéro n’apparaît qu’à partir du deuxième', () => {
    expect(tournamentSyncProgressMessage(1)).toBe(
      'Recherche des parties du clan organisateur sur PUBG… Cela prend de quelques secondes à une minute.'
    )
    expect(tournamentSyncProgressMessage(3)).toContain(`(essai 3 sur ${TOURNAMENT_SYNC_MAX_ATTEMPTS})`)
  })

  it('en attente : délai de publication, compte à rebours et numéro du prochain essai', () => {
    const notice = tournamentSyncWaitingNotice(nothingYet, { attempt: 1, secondsLeft: 42 })
    expect(notice.tone).toBe('waiting')
    expect(notice.message).toContain('Aucune nouvelle manche pour l’instant — 3 manches déjà au classement.')
    expect(notice.message).toContain('PUBG publie une manche 2 à 3 minutes après sa fin : le site réessaie seul.')
    expect(notice.message).toContain('Prochain essai dans 42 s (essai 2 sur 10).')
  })

  it('jamais de compte à rebours négatif', () => {
    expect(tournamentSyncWaitingNotice(nothingYet, { attempt: 2, secondsLeft: -3 }).message).toContain('Prochain essai dans 0 s')
  })

  it('après le dernier essai : quoi vérifier (fin de manche, un joueur du clan organisateur), puis recliquer sans risque', () => {
    const notice = tournamentSyncWaitingNotice(nothingYet, { attempt: TOURNAMENT_SYNC_MAX_ATTEMPTS, secondsLeft: null })
    expect(notice.message).toContain('Toujours rien après 10 essais.')
    expect(notice.message).toContain('un observateur seul n’apparaît pas chez PUBG')
    expect(notice.message).toContain('recliquer est sans risque')
    expect(notice.message).not.toContain('Prochain essai')
  })

  it('essais arrêtés par l’organisateur : le dit', () => {
    expect(tournamentSyncWaitingNotice(nothingYet, { attempt: 4, secondsLeft: null }).message).toContain(
      'Essais automatiques arrêtés.'
    )
  })

  it('une manche arrivée : le message tel quel, sans relance', () => {
    const arrived = summarizeTournamentSync({ newRounds: 1, eligibleMatches: 1 }, TOURNAMENT, DURING)
    expect(tournamentSyncWaitingNotice(arrived, { attempt: 1, secondsLeft: 60 })).toEqual({ tone: 'success', message: arrived.message })
  })
})

describe('tournamentSyncFailureMessage', () => {
  it('réseau coupé : recharger avant de recliquer', () => {
    expect(tournamentSyncFailureMessage(null, null)).toContain('Recharge la page dans une minute')
  })

  it('délai du proxy dépassé (réponse non JSON) : la synchronisation continue peut-être', () => {
    expect(tournamentSyncFailureMessage(504, null)).toContain('continue peut-être sur le serveur')
  })

  it('session expirée', () => {
    expect(tournamentSyncFailureMessage(401, { error: 'Unauthorized' })).toContain('reconnecte-toi')
  })

  it('refus de la garde : réservé à l’Owner et au SuperUser', () => {
    expect(tournamentSyncFailureMessage(403, { error: 'Forbidden' })).toContain(
      'réservé à l’Owner du clan organisateur et au SuperUser'
    )
  })

  it('refus expliqué par la route : repris tel quel', () => {
    const error = 'Only the organizer can synchronize this tournament'
    expect(tournamentSyncFailureMessage(403, { error })).toBe(error)
  })

  it('échec PUBG : la raison, puis réessayer sans risque', () => {
    const message = tournamentSyncFailureMessage(502, { error: 'La récupération PUBG a échoué : clan 1: Too Many Requests' })
    expect(message).toContain('La récupération PUBG a échoué')
    expect(message).toContain('Réessaie dans une minute')
    expect(message).toContain('sans risque')
  })
})
