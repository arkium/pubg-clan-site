import { describe, expect, it, vi } from 'vitest'

// Partie pure seulement : aucune lecture en base.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { collectUntrackedLobbyPlayers } from './tournament-untracked-players'

// Tournoi [FR] du 2026-10-10 en miniature : vOdKaNiCe38 joue avec la squad OCD + LTF, gurugun avec [BF].
const TRACKED = new Map([
  ['account.valino', '[OCD] Valino13'],
  ['account.pompoko', '[LTF] P0mpoko'],
  ['account.julius', '[BF] IA_JULIUS'],
])

describe('collectUntrackedLobbyPlayers', () => {
  it('liste les joueurs du lobby que le site ne suit pas, avec leurs manches, kills et coéquipiers suivis', () => {
    const { players, roundsWithoutTelemetry } = collectUntrackedLobbyPlayers(
      [
        {
          round: 1,
          stats: [
            { memberKey: 'account.valino', teamId: 2, kills: 4 },
            { memberKey: 'account.pompoko', teamId: 2, kills: 2 },
            { memberKey: 'account.vodka', teamId: 2, kills: 5 },
            { memberKey: 'account.julius', teamId: 9, kills: 1 },
            { memberKey: 'account.gurugun', teamId: 9, kills: 0 },
          ],
        },
        { round: 2, stats: null },
        {
          round: 3,
          stats: [
            { memberKey: 'Account.VODKA', teamId: 4, kills: 6 },
            { memberKey: 'account.valino', teamId: 4, kills: 1 },
          ],
        },
      ],
      TRACKED
    )

    expect(roundsWithoutTelemetry).toEqual([2])
    // Un même compte, quelle que soit la casse : un seul joueur, ses kills cumulés.
    expect(players).toEqual([
      { accountId: 'account.vodka', rounds: [1, 3], kills: 11, teammates: ['[OCD] Valino13', '[LTF] P0mpoko'] },
      { accountId: 'account.gurugun', rounds: [1], kills: 0, teammates: ['[BF] IA_JULIUS'] },
    ])
  })

  it('ignore les bots et les animaux de Dihor Otok, et les joueurs suivis quelle que soit la casse', () => {
    const { players } = collectUntrackedLobbyPlayers(
      [
        {
          round: 1,
          stats: [
            { memberKey: 'ai.123', teamId: 50, kills: 0 },
            { memberKey: 'Monster.Bear-12', teamId: 60, kills: 0 },
            { memberKey: 'ACCOUNT.VALINO', teamId: 2, kills: 3 },
          ],
        },
      ],
      TRACKED
    )
    expect(players).toEqual([])
  })
})
