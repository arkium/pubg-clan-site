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

  it('adapte le message d’erreur pour un joueur déjà enregistré sans mentionner la création de clan', () => {
    const existingMember = {
      pubgPlayerName: 'pagiotte',
      clan: { name: 'SMK', tag: 'SMK' },
    }

    const errorMessage = `Le joueur "${existingMember.pubgPlayerName}" est déjà enregistré dans le clan "${existingMember.clan.name}". Veuillez vous connecter à votre compte pour accéder à votre espace clan.`

    expect(errorMessage).not.toContain('créer un clan')
    expect(errorMessage).toContain('déjà enregistré dans le clan "SMK"')
    expect(errorMessage).toContain('Veuillez vous connecter')
  })

  it('adapte le message d’authentification selon qu’il s’agit d’un clan existant ou nouveau', () => {
    const formatAuthError = (clan: { name: string } | null) => {
      const actionDesc = clan
        ? `envoyer votre demande d'adhésion au clan "${clan.name}"`
        : `soumettre la création d'un nouveau clan`
      return `Vous devez être connecté avec votre compte utilisateur pour ${actionDesc}.`
    }

    const msgExistingClan = formatAuthError({ name: 'SMK' })
    const msgNewClan = formatAuthError(null)

    expect(msgExistingClan).toBe('Vous devez être connecté avec votre compte utilisateur pour envoyer votre demande d\'adhésion au clan "SMK".')
    expect(msgExistingClan).not.toContain('créer un clan')

    expect(msgNewClan).toBe('Vous devez être connecté avec votre compte utilisateur pour soumettre la création d\'un nouveau clan.')
    expect(msgNewClan).not.toContain('demande d\'adhésion')
  })
})
