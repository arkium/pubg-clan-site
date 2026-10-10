import { describe, expect, it } from 'vitest'

import { tournamentManageAccess, type TournamentManagerSession } from './tournament-manage-access'

// Module pur. Clan organisateur 1 ([FR]), autre clan 2.
const FR = { id: 1, name: 'FR-Alliance-BE', tag: 'FR' }

function session(overrides: Partial<TournamentManagerSession> = {}): TournamentManagerSession {
  return {
    isSuperUser: false,
    activeMemberId: 10,
    permissions: [],
    members: [{ memberId: 10, clanId: 1 }],
    ownerFeatures: null,
    ...overrides,
  }
}

describe('tournamentManageAccess — même règle que requireClanFeature et la synchronisation', () => {
  it('visiteur ou membre sans droit : aucun bouton', () => {
    expect(tournamentManageAccess(session({ activeMemberId: null, members: [] }), FR)).toEqual({
      canManage: false,
      canSync: false,
      syncBlockedReason: null,
    })
    expect(tournamentManageAccess(session(), FR).canManage).toBe(false)
  })

  it('Owner du clan organisateur : tout, synchronisation comprise', () => {
    expect(tournamentManageAccess(session({ permissions: ['*'] }), FR)).toEqual({
      canManage: true,
      canSync: true,
      syncBlockedReason: null,
    })
  })

  it('« manage_settings » sans être Owner : pas de bouton, le serveur refuserait', () => {
    expect(tournamentManageAccess(session({ permissions: ['manage_settings'] }), FR).canManage).toBe(false)
  })

  it('Owner d’un autre clan : rien sur ce tournoi', () => {
    const owner = session({ permissions: ['*'], members: [{ memberId: 10, clanId: 2 }] })
    expect(tournamentManageAccess(owner, FR).canManage).toBe(false)
  })

  it('compétition fermée aux Owners par le SuperUser : plus de bouton pour l’Owner', () => {
    const owner = session({ permissions: ['*'], ownerFeatures: { 'clan-competition': 'superuser' } })
    expect(tournamentManageAccess(owner, FR).canManage).toBe(false)
  })

  it('SuperUser joueur actif du clan organisateur : tout', () => {
    expect(tournamentManageAccess(session({ isSuperUser: true }), FR)).toMatchObject({ canManage: true, canSync: true })
  })

  it('SuperUser hors du clan : gère, mais ne synchronise pas, et sait pourquoi', () => {
    const access = tournamentManageAccess(session({ isSuperUser: true, members: [{ memberId: 10, clanId: 2 }] }), FR)
    expect(access).toMatchObject({ canManage: true, canSync: false })
    expect(access.syncBlockedReason).toContain('réservé à un joueur de [FR] qui a joué la manche')
  })

  it('SuperUser avec un joueur [FR] qui n’est pas le joueur actif : lui dit de passer dessus', () => {
    const access = tournamentManageAccess(
      session({ isSuperUser: true, members: [{ memberId: 10, clanId: 2 }, { memberId: 11, clanId: 1 }] }),
      FR
    )
    expect(access.syncBlockedReason).toContain('passez sur votre joueur de [FR]')
  })

  it('tournoi sans organisateur connu : aucun bouton', () => {
    expect(tournamentManageAccess(session({ isSuperUser: true }), null).canManage).toBe(false)
  })
})
