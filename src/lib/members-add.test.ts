import { describe, expect, it } from 'vitest'
import { z } from 'zod'

// Schéma testé à l'identique de src/app/api/members/route.ts
const AddMemberSchema = z
  .object({
    displayName: z.string().trim().optional().default(''),
    pubgPlayerName: z.string().trim().min(1, 'Le pseudo PUBG est requis'),
    platformShard: z.string().default('steam'),
    clanId: z.number().int().positive().optional(),
    mode: z.enum(['preview', 'create']).default('create'),
  })
  .transform((data) => ({
    ...data,
    displayName: data.displayName && data.displayName.length > 0 ? data.displayName : data.pubgPlayerName,
  }))

describe('AddMemberSchema validation', () => {
  it('utilise automatiquement pubgPlayerName si displayName est vide', () => {
    const result = AddMemberSchema.parse({
      pubgPlayerName: 'Shroud_99',
      displayName: '',
    })

    expect(result.pubgPlayerName).toBe('Shroud_99')
    expect(result.displayName).toBe('Shroud_99')
  })

  it('utilise automatiquement pubgPlayerName si displayName est omis', () => {
    const result = AddMemberSchema.parse({
      pubgPlayerName: 'ChocoTaco',
    })

    expect(result.pubgPlayerName).toBe('ChocoTaco')
    expect(result.displayName).toBe('ChocoTaco')
  })

  it('utilise automatiquement pubgPlayerName si displayName ne contient que des espaces', () => {
    const result = AddMemberSchema.parse({
      pubgPlayerName: 'JustAero',
      displayName: '   ',
    })

    expect(result.pubgPlayerName).toBe('JustAero')
    expect(result.displayName).toBe('JustAero')
  })

  it('conserve le displayName personnalisé s’il est renseigné', () => {
    const result = AddMemberSchema.parse({
      pubgPlayerName: 'Pro_Sniper_123',
      displayName: 'Alexandre',
    })

    expect(result.pubgPlayerName).toBe('Pro_Sniper_123')
    expect(result.displayName).toBe('Alexandre')
  })

  it('rejette la requête si pubgPlayerName est manquant ou vide', () => {
    expect(() =>
      AddMemberSchema.parse({
        displayName: 'Alexandre',
        pubgPlayerName: '',
      })
    ).toThrow('Le pseudo PUBG est requis')
  })
})
