import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Mémoire personnelle du Coach IA (docs/TODO/coach-ia-pistes.md §6.2, lot 11) : étanchéité du texte retenu (les mots
 * du joueur seulement), clés, baseline vérifiée dans un résultat d'outil, bloc du prompt, borne de 8 lignes et
 * remplacement de la plus ancienne, effacement par le compte seul, et aucune lecture depuis l'administration.
 */

const mocks = vi.hoisted(() => ({
  memoryFindMany: vi.fn(),
  memoryCreate: vi.fn(),
  memoryUpdate: vi.fn(),
  memoryDelete: vi.fn(),
  memoryDeleteMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    coachMemory: { findMany: mocks.memoryFindMany, create: mocks.memoryCreate, update: mocks.memoryUpdate, delete: mocks.memoryDelete, deleteMany: mocks.memoryDeleteMany },
  },
}))

import {
  baselineInToolResults,
  COACH_MEMORY_MAX,
  COACH_MEMORY_TOOL_DECLARATION,
  COACH_MEMORY_TOOL_NAME,
  coachMemoryPromptBlock,
  isQuotedFromMessage,
  normalizeForMatch,
  parseCoachMemoryArgs,
  type CoachMemoryView,
} from '@/lib/coach/coach-memory'
import { clearCoachMemories, createCoachMemoryTool, deleteCoachMemory, listCoachMemories, rememberCoachMemory } from '@/lib/coach/coach-memory-service'
import { buildCoachSystemPrompt } from '@/lib/coach/coach-prompt'

const NOW = new Date('2026-10-25T20:00:00Z')
const MESSAGE = 'Retiens que mon objectif, c’est 30 % de headshots au Kar98k d’ici décembre.'

const stored = (id: number, key: string, text: string, updatedAt = '2026-10-20T20:00:00Z') => ({
  id,
  key,
  text,
  baseline: null,
  memberId: 100,
  clanId: 292,
  updatedAt: new Date(updatedAt),
  expiresAt: new Date('2027-01-18T20:00:00Z'),
})

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.memoryCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 50, key: data.key, text: data.text, baseline: data.baseline ?? null, updatedAt: NOW, expiresAt: data.expiresAt }))
  mocks.memoryUpdate.mockImplementation(async ({ where, data }: { where: { id: number }; data: Record<string, unknown> }) => ({ id: where.id, key: 'goal', text: data.text, baseline: data.baseline ?? null, updatedAt: NOW, expiresAt: data.expiresAt }))
})

describe('étanchéité du texte retenu', () => {
  it('compare sans casse, accents ni ponctuation', () => {
    expect(normalizeForMatch('  Évite les ROTATIONS à pied, « surtout » tard ! ')).toBe('evite les rotations a pied surtout tard')
    expect(isQuotedFromMessage('30 % de headshots au Kar98k', MESSAGE)).toBe(true)
    expect(isQuotedFromMessage('mon objectif, c’est 30 % de headshots au kar98k', MESSAGE)).toBe(true)
    expect(isQuotedFromMessage('tes rotations sont trop tardives', MESSAGE)).toBe(false)
    expect(isQuotedFromMessage('', MESSAGE)).toBe(false)
  })

  it('refuse une déduction du modèle, une clé inconnue, un texte trop long', () => {
    expect(parseCoachMemoryArgs({ key: 'goal', text: '30 % de headshots au Kar98k' }, MESSAGE)).toEqual({ key: 'goal', text: '30 % de headshots au Kar98k', baseline: null })
    expect(parseCoachMemoryArgs({ key: 'avoid', text: '40 % de tes morts viennent de rotations tardives' }, MESSAGE)).toMatchObject({ error: 'not_in_message' })
    expect(parseCoachMemoryArgs({ key: 'weakness', text: 'Kar98k' }, MESSAGE)).toMatchObject({ error: 'invalid_key' })
    expect(parseCoachMemoryArgs({ key: 'note', text: '' }, MESSAGE)).toMatchObject({ error: 'invalid_text' })
    expect(parseCoachMemoryArgs({ key: 'note', text: 'a'.repeat(201) }, 'a'.repeat(300))).toMatchObject({ error: 'invalid_text' })
  })

  it('accepte une baseline bien formée et la vérifie dans les résultats d’outils de la réponse', () => {
    const parsed = parseCoachMemoryArgs({ key: 'goal', text: '30 % de headshots au Kar98k', baseline: { metric: 'headshotRate', weapon: 'Kar98k', value: 22.4 } }, MESSAGE)
    expect(parsed).toEqual({ key: 'goal', text: '30 % de headshots au Kar98k', baseline: { metric: 'headshotRate', weapon: 'Kar98k', value: 22.4 } })
    expect(parseCoachMemoryArgs({ key: 'goal', text: 'Kar98k', baseline: { metric: 'x' } }, MESSAGE)).toMatchObject({ error: 'invalid_baseline' })
    const results = [{ weapons: [{ name: 'Kar98k', headshotRate: 22.4, kills: 122 }] }]
    expect(baselineInToolResults({ value: 22.4 }, results)).toBe(true)
    expect(baselineInToolResults({ value: 22 }, results)).toBe(false)
    expect(baselineInToolResults({ value: 122 }, results)).toBe(true)
    expect(baselineInToolResults({ value: 12 }, results)).toBe(false)
    expect(baselineInToolResults({ value: 22.4 }, [])).toBe(false)
  })
})

describe('bloc du prompt', () => {
  const lines: CoachMemoryView[] = [
    { id: 1, key: 'goal', text: '30 % de headshots au Kar98k', baseline: { metric: 'headshotRate', weapon: 'Kar98k', value: 22, at: '2026-10-24T20:00:00Z' }, updatedAt: '2026-10-24T20:00:00Z', expiresAt: '2027-01-22T20:00:00Z' },
    { id: 2, key: 'avoid', text: 'les rotations à pied tard dans la partie', baseline: null, updatedAt: '2026-10-20T20:00:00Z', expiresAt: '2027-01-18T20:00:00Z' },
  ]

  it('date chaque ligne, présente les mots du joueur et la mesure de départ, rappelle l’usage de l’outil', () => {
    const block = coachMemoryPromptBlock(lines)
    expect(block).toContain('dit par lui-même')
    expect(block).toContain('- Objectif (24 oct.) : « 30 % de headshots au Kar98k » — mesuré à 22 (headshotRate, Kar98k) le 24 oct.')
    expect(block).toContain('- À éviter (20 oct.) : « les rotations à pied tard dans la partie »')
    expect(block).toContain('rememberAboutMe')
    expect(coachMemoryPromptBlock([])).toContain('rememberAboutMe')
    expect(coachMemoryPromptBlock([])).not.toContain('dit par lui-même')
  })

  it('n’entre dans le prompt système que quand on le lui donne, avant le contexte de page', () => {
    const base = { playerName: 'NovakTV', clanTag: 'SRTY', clanName: 'Serenity', contextBlock: 'Contexte : aucun.', today: NOW }
    expect(buildCoachSystemPrompt(base)).not.toContain('rememberAboutMe')
    const prompt = buildCoachSystemPrompt({ ...base, memoryBlock: coachMemoryPromptBlock(lines) })
    expect(prompt.indexOf('Format :')).toBeLessThan(prompt.indexOf('dit par lui-même'))
    expect(prompt.indexOf('dit par lui-même')).toBeLessThan(prompt.indexOf('Contexte : aucun.'))
  })
})

describe('service', () => {
  it('liste les lignes vivantes du compte, les plus récentes d’abord, 8 au plus', async () => {
    mocks.memoryFindMany.mockResolvedValue([stored(1, 'goal', 'x'), stored(2, 'bidon', 'y')])
    const lines = await listCoachMemories(7, NOW)
    expect(lines.map((line) => line.key)).toEqual(['goal', 'note'])
    expect(mocks.memoryFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 7, expiresAt: { gt: NOW } }, orderBy: { updatedAt: 'desc' }, take: COACH_MEMORY_MAX }))
  })

  it('retient une nouvelle ligne avec son échéance à 90 jours', async () => {
    mocks.memoryFindMany.mockResolvedValue([])
    const result = await rememberCoachMemory({ userId: 7, memberId: 100, clanId: 292, key: 'goal', text: '30 % de headshots au Kar98k', baseline: { metric: 'headshotRate', weapon: 'Kar98k', value: 22 }, now: NOW })
    expect(result.total).toBe(1)
    expect(result.replaced).toBeNull()
    expect(mocks.memoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 7, memberId: 100, clanId: 292, key: 'goal', source: 'player', expiresAt: new Date('2027-01-23T20:00:00Z'), baseline: { metric: 'headshotRate', weapon: 'Kar98k', value: 22, at: NOW.toISOString() } }),
      })
    )
  })

  it('même clé et même texte : la date est rafraîchie, pas de doublon', async () => {
    mocks.memoryFindMany.mockResolvedValue([stored(3, 'goal', '30 % de headshots au kar98k')])
    const result = await rememberCoachMemory({ userId: 7, memberId: 100, clanId: 292, key: 'goal', text: '30 % de headshots au Kar98k', baseline: null, now: NOW })
    expect(mocks.memoryUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 3 } }))
    expect(mocks.memoryCreate).not.toHaveBeenCalled()
    expect(result.total).toBe(1)
  })

  it('au-delà de 8 lignes, la plus ancienne laisse la place', async () => {
    mocks.memoryFindMany.mockResolvedValue(Array.from({ length: COACH_MEMORY_MAX }, (_, index) => stored(index + 1, 'note', `note ${index + 1}`, `2026-10-${10 + index}T20:00:00Z`)))
    mocks.memoryDelete.mockResolvedValue({})
    const result = await rememberCoachMemory({ userId: 7, memberId: null, clanId: null, key: 'preference', text: 'je joue surtout le soir', baseline: null, now: NOW })
    expect(mocks.memoryDelete).toHaveBeenCalledWith({ where: { id: 1 } })
    expect(result.replaced).toBe('note 1')
    expect(result.total).toBe(COACH_MEMORY_MAX)
  })

  it('efface une ligne du compte seul, ou tout', async () => {
    mocks.memoryDeleteMany.mockResolvedValue({ count: 0 })
    expect(await deleteCoachMemory(5, 7)).toBe(false)
    expect(mocks.memoryDeleteMany).toHaveBeenCalledWith({ where: { id: 5, userId: 7 } })
    mocks.memoryDeleteMany.mockResolvedValue({ count: 3 })
    expect(await clearCoachMemories(7)).toBe(3)
    expect(mocks.memoryDeleteMany).toHaveBeenLastCalledWith({ where: { userId: 7 } })
  })
})

describe('outil rememberAboutMe', () => {
  const results: unknown[] = []
  const tool = createCoachMemoryTool({ userId: 7, memberId: 100, clanId: 292, message: MESSAGE, toolResults: () => results, now: NOW })

  beforeEach(() => {
    results.length = 0
  })

  it('est déclaré sans jamais prendre d’identifiant de compte, et son nom est stable', () => {
    expect(tool.declaration).toBe(COACH_MEMORY_TOOL_DECLARATION)
    expect(tool.declaration.name).toBe(COACH_MEMORY_TOOL_NAME)
    expect(Object.keys(tool.declaration.parameters.properties)).toEqual(['key', 'text', 'baseline'])
  })

  it('retient les mots du joueur et répond ce qui a été retenu', async () => {
    mocks.memoryFindMany.mockResolvedValue([])
    const result = (await tool.run({ name: COACH_MEMORY_TOOL_NAME, args: { key: 'goal', text: '30 % de headshots au Kar98k' } })) as Record<string, unknown>
    expect(result).toMatchObject({ remembered: true, key: 'goal', text: '30 % de headshots au Kar98k', total: 1, max: COACH_MEMORY_MAX, keptDays: 90 })
    expect(mocks.memoryCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 7 }) }))
  })

  it('refuse une déduction, et une baseline absente des résultats d’outils de la réponse', async () => {
    expect(await tool.run({ name: COACH_MEMORY_TOOL_NAME, args: { key: 'avoid', text: 'tes rotations tardives' } })).toMatchObject({ error: 'not_in_message' })
    expect(await tool.run({ name: COACH_MEMORY_TOOL_NAME, args: { key: 'goal', text: '30 % de headshots au Kar98k', baseline: { metric: 'headshotRate', value: 22 } } })).toMatchObject({ error: 'baseline_unverified' })
    expect(mocks.memoryCreate).not.toHaveBeenCalled()
    results.push({ weapons: [{ name: 'Kar98k', headshotRate: 22 }] })
    mocks.memoryFindMany.mockResolvedValue([])
    expect(await tool.run({ name: COACH_MEMORY_TOOL_NAME, args: { key: 'goal', text: '30 % de headshots au Kar98k', baseline: { metric: 'headshotRate', value: 22 } } })).toMatchObject({ remembered: true, baseline: expect.objectContaining({ value: 22 }) })
  })
})

describe('jamais lue par le SuperUser', () => {
  it('ni le service ni le rapport d’administration ne touchent à la mémoire', () => {
    for (const file of ['coach-admin-service.ts', 'coach-admin-report.ts', 'coach-alerts.ts']) {
      const source = readFileSync(join(process.cwd(), 'src/lib/coach', file), 'utf8')
      expect(source, file).not.toMatch(/coachMemory|coach-memory/)
    }
    const inbox = readFileSync(join(process.cwd(), 'src/lib/admin-inbox/build.ts'), 'utf8')
    expect(inbox).not.toMatch(/coachMemory|coach-memory/)
  })
})
