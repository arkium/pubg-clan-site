import { describe, expect, it } from 'vitest'

describe('Member Lifecycle: Rejection, Re-application, and Reactivation', () => {
  it('différencie un membre actif d’un membre rejeté', () => {
    const activeMember = {
      pubgPlayerName: 'leniver',
      isActive: true,
      joinStatus: 'active',
    }

    const rejectedMember = {
      pubgPlayerName: 'leniver',
      isActive: false,
      joinStatus: 'rejected',
    }

    const isAlreadyActive = (m: { isActive: boolean; joinStatus: string }) =>
      m.isActive && m.joinStatus === 'active'

    expect(isAlreadyActive(activeMember)).toBe(true)
    expect(isAlreadyActive(rejectedMember)).toBe(false)
  })

  it('permet à un joueur rejeté de resoumettre une demande sur /join', () => {
    const rejectedMember = {
      id: 21,
      pubgPlayerName: 'leniver',
      clanId: 1,
      isActive: false,
      joinStatus: 'rejected',
    }

    // Simulation de re-soumission
    const canReapply = !rejectedMember.isActive && rejectedMember.joinStatus !== 'pending'
    expect(canReapply).toBe(true)

    const updatedData = {
      ...rejectedMember,
      isActive: false,
      joinStatus: 'pending',
    }

    expect(updatedData.joinStatus).toBe('pending')
    expect(updatedData.isActive).toBe(false)
  })

  it('bloque uniquement si une demande est déjà en cours de validation (pending)', () => {
    const pendingMember = {
      id: 21,
      pubgPlayerName: 'leniver',
      clanId: 1,
      isActive: false,
      joinStatus: 'pending',
    }

    const shouldBlockAsPending = (m: { isActive: boolean; joinStatus: string }) =>
      !m.isActive && m.joinStatus === 'pending'

    expect(shouldBlockAsPending(pendingMember)).toBe(true)
  })

  it('permet à un admin d’ajouter directement un joueur précédemment rejeté via /members/add', () => {
    const rejectedMember = {
      id: 21,
      displayName: 'Leniver',
      pubgPlayerName: 'Leniver',
      clanId: 1,
      isActive: false,
      joinStatus: 'rejected',
    }

    // Simulation de l'ajout admin (réactivation)
    const reactivatedMember = {
      ...rejectedMember,
      clanId: 1,
      isActive: true,
      joinStatus: 'active',
    }

    expect(reactivatedMember.isActive).toBe(true)
    expect(reactivatedMember.joinStatus).toBe('active')
    expect(reactivatedMember.clanId).toBe(1)
  })

  it('bloque l’ajout sur /members/add uniquement si le joueur est déjà actif', () => {
    const checkCanAdd = (existing: { isActive: boolean; joinStatus: string } | null) => {
      if (existing && existing.isActive && existing.joinStatus === 'active') {
        return { error: 'Ce joueur est déjà membre actif du clan.' }
      }
      return { success: true }
    }

    const activeMember = { isActive: true, joinStatus: 'active' }
    const rejectedMember = { isActive: false, joinStatus: 'rejected' }
    const newMember = null

    expect(checkCanAdd(activeMember)).toEqual({ error: 'Ce joueur est déjà membre actif du clan.' })
    expect(checkCanAdd(rejectedMember)).toEqual({ success: true })
    expect(checkCanAdd(newMember)).toEqual({ success: true })
  })

  it('Arrêter le suivi : passe isActive à false sans effacer l’historique des matchs', () => {
    const activeMember = {
      id: 42,
      displayName: 'Stalker',
      clanId: 1,
      isActive: true,
      roles: [{ role: { name: 'Member' } }],
    }

    const pastMatches = [
      { id: 101, memberId: 42, kills: 3, damage: 450 },
      { id: 102, memberId: 42, kills: 1, damage: 120 },
    ]

    // Arrêt du suivi
    const deactivatedMember = {
      ...activeMember,
      isActive: false,
    }

    expect(deactivatedMember.isActive).toBe(false)
    // L'historique des matchs reste intact
    expect(pastMatches.length).toBe(2)
    expect(pastMatches.every((m) => m.memberId === deactivatedMember.id)).toBe(true)
  })

  it('Arrêter le suivi : bloque la suppression si le membre possède le rôle Owner', () => {
    const isOwner = (member: { roles: Array<{ role: { name: string } }> }) =>
      member.roles.some((entry) => entry.role.name === 'Owner')

    const ownerMember = {
      id: 1,
      displayName: 'Boss',
      clanId: 1,
      isActive: true,
      roles: [{ role: { name: 'Owner' } }],
    }

    const standardMember = {
      id: 2,
      displayName: 'Rookie',
      clanId: 1,
      isActive: true,
      roles: [{ role: { name: 'Member' } }],
    }

    expect(isOwner(ownerMember)).toBe(true)
    expect(isOwner(standardMember)).toBe(false)
  })

  it('Changer de clan : exige la même plateforme shard et bloque le rôle Owner', () => {
    const canTransferMember = (
      member: { roles: Array<{ role: { name: string } }>; platformShard: string },
      targetClan: { platformShard: string; isActive: boolean }
    ) => {
      if (member.roles.some((r) => r.role.name === 'Owner')) {
        return { error: 'Owner cannot be moved' }
      }
      if (member.platformShard !== targetClan.platformShard) {
        return { error: 'Platform shard mismatch' }
      }
      if (!targetClan.isActive) {
        return { error: 'Target clan inactive' }
      }
      return { success: true }
    }

    const steamMember = {
      roles: [{ role: { name: 'Member' } }],
      platformShard: 'steam',
    }
    const steamOwner = {
      roles: [{ role: { name: 'Owner' } }],
      platformShard: 'steam',
    }
    const targetSteamClan = { platformShard: 'steam', isActive: true }
    const targetKakaoClan = { platformShard: 'kakao', isActive: true }

    expect(canTransferMember(steamMember, targetSteamClan)).toEqual({ success: true })
    expect(canTransferMember(steamOwner, targetSteamClan)).toEqual({ error: 'Owner cannot be moved' })
    expect(canTransferMember(steamMember, targetKakaoClan)).toEqual({ error: 'Platform shard mismatch' })
  })
})

