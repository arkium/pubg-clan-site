import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const JoinRequestSchema = z.object({
  pubgPlayerName: z.string().trim().min(1, 'Le pseudo PUBG est requis').max(32),
  platformShard: z.string().default('steam'),
  mode: z.enum(['preview', 'join']).default('join'),
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
        mode: 'unknown_mode' as any,
      })
    ).toThrow()
  })
})
