import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Règles apprises du Coach IA (docs/TODO/coach-ia-pistes.md §6.3, lot 10) : texte normalisé et borné, bloc du prompt,
 * estimation en tokens, borne de 20 actives côté service, cache de 30 s, et le prompt système inchangé quand
 * l'interrupteur est fermé. Prisma simulé.
 */

const mocks = vi.hoisted(() => ({
  ruleFindMany: vi.fn(),
  ruleCount: vi.fn(),
  ruleCreate: vi.fn(),
  ruleUpdate: vi.fn(),
  ruleFindUnique: vi.fn(),
  ruleDeleteMany: vi.fn(),
  messageFindUnique: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    coachRule: {
      findMany: mocks.ruleFindMany,
      count: mocks.ruleCount,
      create: mocks.ruleCreate,
      update: mocks.ruleUpdate,
      findUnique: mocks.ruleFindUnique,
      deleteMany: mocks.ruleDeleteMany,
    },
    coachMessage: { findUnique: mocks.messageFindUnique },
  },
}))

import { buildCoachSystemPrompt } from '@/lib/coach/coach-prompt'
import { COACH_RULE_MAX_ACTIVE, COACH_RULE_TEXT_MAX, coachRulesPromptBlock, coachRulesPromptTokens, estimateCoachTokens, normalizeCoachRuleText } from '@/lib/coach/coach-rules'
import { activeCoachRuleTexts, createCoachRule, deleteCoachRule, readCoachRulesReport, resetCoachRulesCache, updateCoachRule } from '@/lib/coach/coach-rules-service'

const row = (id: number, text: string, enabled = true) => ({ id, text, enabled, fromMessageId: null, createdAt: new Date('2026-10-25T10:00:00Z'), updatedAt: new Date('2026-10-25T10:00:00Z') })

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  resetCoachRulesCache()
})

describe('texte d’une règle', () => {
  it('réduit les espaces et les sauts de ligne, borne la longueur', () => {
    expect(normalizeCoachRuleText('  Un Top 10\n n’est   pas une victoire. ')).toEqual({ text: 'Un Top 10 n’est pas une victoire.' })
    expect(normalizeCoachRuleText('court')).toEqual({ error: 'Une règle fait au moins 8 caractères.' })
    expect(normalizeCoachRuleText('x'.repeat(COACH_RULE_TEXT_MAX + 1))).toEqual({ error: `Une règle fait au plus ${COACH_RULE_TEXT_MAX} caractères.` })
    expect(normalizeCoachRuleText(42)).toEqual({ error: 'Texte de règle attendu.' })
  })

  it('estime les tokens à 4 caractères par token', () => {
    expect(estimateCoachTokens('Sur Karakin, les véhicules sont rares.')).toBe(10)
    expect(estimateCoachTokens('   ')).toBe(0)
  })
})

describe('bloc du prompt', () => {
  it('est vide sans règle et liste les règles sous un titre sinon', () => {
    expect(coachRulesPromptBlock([])).toBe('')
    expect(coachRulesPromptBlock(['  ', ''])).toBe('')
    const block = coachRulesPromptBlock(['Un Top 10 n’est pas une victoire.', 'Sur Karakin, ne propose pas de rotation en véhicule.'])
    expect(block).toContain('Règles du site')
    expect(block).toContain('- Un Top 10 n’est pas une victoire.')
    expect(block).toContain('- Sur Karakin, ne propose pas de rotation en véhicule.')
    expect(coachRulesPromptTokens(['Un Top 10 n’est pas une victoire.'])).toBeGreaterThan(estimateCoachTokens('Un Top 10 n’est pas une victoire.'))
  })

  it('entre dans le prompt système après les règles absolues, et n’y change rien quand il est vide', () => {
    const base = { playerName: 'NovakTV', clanTag: 'SRTY', clanName: 'Serenity', contextBlock: 'Contexte : aucun.', today: new Date('2026-10-25T20:00:00Z') }
    const without = buildCoachSystemPrompt(base)
    expect(buildCoachSystemPrompt({ ...base, rulesBlock: '', memoryBlock: '' })).toBe(without)
    expect(without).not.toContain('Règles du site')
    const withRules = buildCoachSystemPrompt({ ...base, rulesBlock: coachRulesPromptBlock(['Un Top 10 n’est pas une victoire.']) })
    expect(withRules).toContain('Règles du site')
    expect(withRules.indexOf('Règles absolues')).toBeLessThan(withRules.indexOf('Règles du site'))
    expect(withRules.indexOf('Règles du site')).toBeLessThan(withRules.indexOf('Lexique des joueurs'))
  })
})

describe('service', () => {
  it('lit les textes actifs, dans l’ordre, bornés à 20, et les garde 30 s', async () => {
    mocks.ruleFindMany.mockResolvedValue([{ text: 'A' }, { text: 'B' }])
    expect(await activeCoachRuleTexts(1_000)).toEqual(['A', 'B'])
    expect(mocks.ruleFindMany).toHaveBeenCalledWith({ where: { enabled: true }, orderBy: { createdAt: 'asc' }, take: COACH_RULE_MAX_ACTIVE, select: { text: true } })
    expect(await activeCoachRuleTexts(20_000)).toEqual(['A', 'B'])
    expect(mocks.ruleFindMany).toHaveBeenCalledTimes(1)
    expect(await activeCoachRuleTexts(40_000)).toEqual(['A', 'B'])
    expect(mocks.ruleFindMany).toHaveBeenCalledTimes(2)
  })

  it('une base injoignable rend une liste vide : la réponse part sans règle, jamais en erreur', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.ruleFindMany.mockRejectedValue(new Error('down'))
    expect(await activeCoachRuleTexts()).toEqual([])
    error.mockRestore()
  })

  it('rapport : actives sur 20, tokens du bloc, interrupteur', async () => {
    mocks.ruleFindMany.mockResolvedValue([row(1, 'Un Top 10 n’est pas une victoire.'), row(2, 'Désactivée', false)])
    const report = await readCoachRulesReport({ rulesEnabled: true })
    expect(report).toMatchObject({ enabled: true, activeCount: 1, maxActive: 20 })
    expect(report.rules.map((rule) => rule.id)).toEqual([1, 2])
    expect(report.rules[0].tokens).toBe(estimateCoachTokens('Un Top 10 n’est pas une victoire.'))
    expect(report.promptTokens).toBe(coachRulesPromptTokens(['Un Top 10 n’est pas une victoire.']))
  })

  it('crée une règle active, rattachée à un vote existant seulement, et refuse la 21e', async () => {
    mocks.ruleCount.mockResolvedValue(3)
    mocks.messageFindUnique.mockResolvedValue(null)
    mocks.ruleCreate.mockResolvedValue(row(9, 'Un Top 10 n’est pas une victoire.'))
    const created = await createCoachRule({ text: ' Un Top 10  n’est pas une victoire. ', fromMessageId: 42, createdById: 7 })
    expect(created).toMatchObject({ rule: { id: 9, enabled: true } })
    expect(mocks.ruleCreate).toHaveBeenCalledWith(expect.objectContaining({ data: { text: 'Un Top 10 n’est pas une victoire.', fromMessageId: null, createdById: 7 } }))

    expect(await createCoachRule({ text: 'trop', createdById: 7 })).toEqual({ error: 'invalid', message: 'Une règle fait au moins 8 caractères.' })
    mocks.ruleCount.mockResolvedValue(COACH_RULE_MAX_ACTIVE)
    expect(await createCoachRule({ text: 'Une règle de trop pour le prompt.', createdById: 7 })).toMatchObject({ error: 'limit' })
    expect(mocks.ruleCreate).toHaveBeenCalledTimes(1)
  })

  it('modifie texte et interrupteur ; réactiver au-delà de 20 actives est refusé ; inconnue = not_found', async () => {
    mocks.ruleFindUnique.mockResolvedValue({ id: 2, enabled: false })
    mocks.ruleCount.mockResolvedValue(COACH_RULE_MAX_ACTIVE)
    expect(await updateCoachRule(2, { enabled: true })).toMatchObject({ error: 'limit' })
    mocks.ruleCount.mockResolvedValue(5)
    mocks.ruleUpdate.mockResolvedValue(row(2, 'Nouveau texte de règle.', true))
    expect(await updateCoachRule(2, { enabled: true, text: 'Nouveau texte de règle.' })).toMatchObject({ rule: { id: 2, text: 'Nouveau texte de règle.' } })
    expect(mocks.ruleUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 2 }, data: { text: 'Nouveau texte de règle.', enabled: true } }))
    expect(await updateCoachRule(2, {})).toEqual({ error: 'invalid', message: 'Rien à modifier.' })
    mocks.ruleFindUnique.mockResolvedValue(null)
    expect(await updateCoachRule(3, { enabled: false })).toMatchObject({ error: 'not_found' })
  })

  it('supprime et vide le cache', async () => {
    mocks.ruleFindMany.mockResolvedValue([{ text: 'A' }])
    await activeCoachRuleTexts(1_000)
    mocks.ruleDeleteMany.mockResolvedValue({ count: 1 })
    expect(await deleteCoachRule(1)).toBe(true)
    mocks.ruleFindMany.mockResolvedValue([])
    expect(await activeCoachRuleTexts(2_000)).toEqual([])
    mocks.ruleDeleteMany.mockResolvedValue({ count: 0 })
    expect(await deleteCoachRule(99)).toBe(false)
  })
})
