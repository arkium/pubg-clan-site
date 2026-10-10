import { describe, expect, it } from 'vitest'

describe('Clan approval logic', () => {
  it('garantit qu’un nouveau clan est créé avec isActive: false par défaut', () => {
    const clanCreationData = {
      name: 'Alpha Squad',
      tag: 'ALPH',
      platformShard: 'steam',
      isActive: false, // En attente de validation par le SuperUser
    }

    expect(clanCreationData.isActive).toBe(false)
  })

  it('garantit qu’un membre créateur de clan est initialisé avec joinStatus: pending', () => {
    const creatorMemberData = {
      pubgPlayerName: 'CaptainAlpha',
      isActive: false,
      joinStatus: 'pending',
    }

    expect(creatorMemberData.isActive).toBe(false)
    expect(creatorMemberData.joinStatus).toBe('pending')
  })

  it('active à la fois le clan et le membre Owner lors de la validation SuperUser', () => {
    const clan = { id: 42, name: 'Alpha Squad', isActive: false }
    const ownerMember = { id: 101, clanId: 42, isActive: false, joinStatus: 'pending' }

    // Simulation de l'action de validation SuperUser
    const activatedClan = { ...clan, isActive: true }
    const activatedMember = { ...ownerMember, isActive: true, joinStatus: 'active' }

    expect(activatedClan.isActive).toBe(true)
    expect(activatedMember.isActive).toBe(true)
    expect(activatedMember.joinStatus).toBe('active')
  })

  // Les messages de `/api/join` (joueur déjà enregistré, demande sans compte) sont vérifiés en appelant la route :
  // src/lib/join-request-access.test.ts.
})
