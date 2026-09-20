import { describe, expect, it, vi } from 'vitest'

/**
 * Le schema est IMPORTE depuis la route, pas recopie ici.
 *
 * Il l'etait jusqu'au 2026-09-20, et le chantier 4 a montre le probleme : ajouter
 * `contactEmail` au vrai schema n'aurait pas fait rougir ce fichier, qui aurait
 * continue de valider une copie perimee. Un test vert qui ne teste rien est pire
 * que pas de test.
 *
 * La route tire Prisma et l'API PUBG a l'import : on les neutralise, seul le
 * schema nous interesse ici.
 */
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/pubg', () => ({
  searchPlayerByName: vi.fn(),
  fetchPlayerClan: vi.fn(),
}))
vi.mock('@/lib/role-service', () => ({
  initializeDefaultRoles: vi.fn(),
  assignDefaultMemberRole: vi.fn(),
}))
vi.mock('@/lib/notification-service', () => ({
  notifyJoinRequest: vi.fn(),
  notifyClanCreationRequest: vi.fn(),
}))

import { JoinRequestSchema } from '@/app/api/join/route'

describe('JoinRequestSchema — email de contact (chantier 4)', () => {
  it('accepte une demande sans email : rejoindre un clan existant n’en exige pas', () => {
    const result = JoinRequestSchema.parse({ pubgPlayerName: 'Viper' })

    expect(result.contactEmail).toBeUndefined()
  })

  it('accepte un email valide et le normalise', () => {
    const result = JoinRequestSchema.parse({
      pubgPlayerName: 'Viper',
      contactEmail: '  joueur@exemple.com  ',
    })

    expect(result.contactEmail).toBe('joueur@exemple.com')
  })

  it('rejette une adresse malformée', () => {
    expect(() =>
      JoinRequestSchema.parse({ pubgPlayerName: 'Viper', contactEmail: 'pas-un-email' })
    ).toThrow()
  })

  it('traite une chaîne vide comme une absence, pas comme une erreur', () => {
    const result = JoinRequestSchema.parse({ pubgPlayerName: 'Viper', contactEmail: '' })

    expect(result.contactEmail).toBeUndefined()
  })
})

describe('JoinRequestSchema validation', () => {
  it('valide une requête standard par défaut en mode "join"', () => {
    const result = JoinRequestSchema.parse({
      pubgPlayerName: 'Viper_Sniper',
    })

    expect(result.pubgPlayerName).toBe('Viper_Sniper')
    expect(result.platformShard).toBe('steam')
    expect(result.mode).toBe('join')
  })

  it('permet de spécifier le mode "preview" pour la fenêtre de confirmation', () => {
    const result = JoinRequestSchema.parse({
      pubgPlayerName: 'GhostPlayer',
      platformShard: 'xbox',
      mode: 'preview',
    })

    expect(result.pubgPlayerName).toBe('GhostPlayer')
    expect(result.platformShard).toBe('xbox')
    expect(result.mode).toBe('preview')
  })

  it('nettoie les espaces superflus autour du pseudo PUBG', () => {
    const result = JoinRequestSchema.parse({
      pubgPlayerName: '   SMK_Captain   ',
    })

    expect(result.pubgPlayerName).toBe('SMK_Captain')
  })

  it('rejette un pseudo vide ou composé uniquement d’espaces', () => {
    expect(() =>
      JoinRequestSchema.parse({
        pubgPlayerName: '   ',
      })
    ).toThrow('Le pseudo PUBG est requis')
  })

  it('rejette un mode non supporté', () => {
    expect(() =>
      JoinRequestSchema.parse({
        pubgPlayerName: 'ValidPlayer',
        // `parse` accepte `unknown` : aucun cast n'est necessaire.
        mode: 'unknown_mode',
      })
    ).toThrow()
  })
})
