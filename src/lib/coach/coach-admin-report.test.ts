import { describe, expect, it, vi } from 'vitest'

/**
 * Rapports de /settings/coach (docs/TODO/chatbot-ia.md §9) : consommation du mois, regroupement des questions, question
 * d'une réponse, résumé d'un test de modèle. Construction pure — Prisma n'est importé que par le type des réglages.
 */

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  buildCoachDifficultAnswers,
  buildCoachToolsReport,
  buildCoachUsageReport,
  coachTestSummary,
  coachToolNames,
  groupCoachQuestions,
  normalizeCoachQuestion,
  questionBefore,
  questionTokens,
  type CoachAnswerRow,
  type CoachUsageRow,
} from '@/lib/coach/coach-admin-report'
import { COACH_SETTING_DEFAULTS } from '@/lib/coach/coach-config'

const PERIOD = { start: new Date('2026-09-30T22:00:00.000Z'), end: new Date('2026-10-31T23:00:00.000Z') }
// Taux à 1 : un micro-dollar vaut un micro-euro, les attentes se lisent sans conversion.
const SETTINGS = { ...COACH_SETTING_DEFAULTS, usdEurRate: 1, globalBudgetEur: 10, budgetPerAccountEur: 2 }

const row = (overrides: Partial<CoachUsageRow>): CoachUsageRow => ({
  userId: 1,
  model: 'gemini-3.5-flash-lite',
  status: 'ok',
  tokensIn: 5000,
  tokensOut: 300,
  costMicroUsd: 0,
  createdAt: new Date('2026-10-10T20:00:00.000Z'),
  ...overrides,
})

describe('buildCoachUsageReport', () => {
  const rows = [
    row({ userId: 1, costMicroUsd: 1_000_000 }),
    row({ userId: 1, status: 'aborted', costMicroUsd: 700_000, tokensIn: 4000, tokensOut: 100 }),
    row({ userId: 2, model: 'gemini-3.8-flash', costMicroUsd: 500_000 }),
    row({ userId: 2, status: 'error', costMicroUsd: 0, tokensIn: 0, tokensOut: 0 }),
    row({ userId: 3, status: 'refused', costMicroUsd: 0, tokensIn: 0, tokensOut: 0 }),
  ]
  const report = buildCoachUsageReport({ rows, settings: SETTINGS, period: PERIOD, accountLabels: new Map([[1, 'Menez69']]), errorsLast24h: 1 })

  it('compte les questions répondues, les comptes actifs, les erreurs et les interrompues', () => {
    expect(report.totals).toEqual({ costEur: 2.2, questions: 2, accounts: 2, costPerQuestionEur: 1.1, errors: 1, aborted: 1 })
    expect(report.errorsLast24h).toBe(1)
    expect(report.period).toEqual({ start: PERIOD.start.toISOString(), end: PERIOD.end.toISOString() })
  })

  it('mesure le plafond global et ce qu’il reste', () => {
    expect(report.global).toEqual({ spentEur: 2.2, budgetEur: 10, percent: 22, remainingEur: 7.8 })
  })

  it('ventile par modèle, le plus coûteux d’abord, avec le libellé du catalogue', () => {
    expect(report.byModel).toEqual([
      { model: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', questions: 1, tokensIn: 9000, tokensOut: 400, costEur: 1.7 },
      { model: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', questions: 1, tokensIn: 5000, tokensOut: 300, costEur: 0.5 },
    ])
  })

  it('ne retient que les comptes au-delà de 80 % de leur budget, nommés par leur pseudo', () => {
    expect(report.accountsNearBudget).toEqual([{ userId: 1, label: 'Menez69', spentEur: 1.7, percent: 85 }])
    expect(report.budgetPerAccountEur).toBe(2)
  })

  it('nomme un compte inconnu par son numéro et accepte un modèle hors catalogue', () => {
    const other = buildCoachUsageReport({
      rows: [row({ userId: 9, model: 'gemini-9-ultra', costMicroUsd: 2_500_000 })],
      settings: SETTINGS,
      period: PERIOD,
      accountLabels: new Map(),
      errorsLast24h: 0,
    })
    expect(other.accountsNearBudget).toEqual([{ userId: 9, label: 'Compte n° 9', spentEur: 2.5, percent: 125 }])
    expect(other.byModel[0]).toMatchObject({ model: 'gemini-9-ultra', label: 'gemini-9-ultra' })
  })

  it('sans question : pas de coût moyen, un plafond à zéro vaut 100 %', () => {
    const empty = buildCoachUsageReport({ rows: [], settings: { ...SETTINGS, globalBudgetEur: 0 }, period: PERIOD, accountLabels: new Map(), errorsLast24h: 0 })
    expect(empty.totals.costPerQuestionEur).toBeNull()
    expect(empty.global).toEqual({ spentEur: 0, budgetEur: 0, percent: 100, remainingEur: 0 })
    expect(empty.byModel).toEqual([])
  })
})

describe('questions', () => {
  it('normalise accents, casse, ponctuation et espaces', () => {
    expect(normalizeCoachQuestion('  Pourquoi on a perdu, en fin de partie ?! ')).toBe('pourquoi on a perdu en fin de partie')
    expect(normalizeCoachQuestion('Où atterrir sur Miramar ?')).toBe('ou atterrir sur miramar')
  })

  it('regroupe par texte normalisé, garde la première forme et borne la liste', () => {
    const grouped = groupCoachQuestions([
      { content: 'Quelle est ma meilleure arme ?' },
      { content: 'Pourquoi on a perdu en fin de partie ?' },
      { content: 'quelle est ma meilleure arme' },
      { content: '   ' },
      { content: 'Où atterrir ?' },
    ])
    expect(grouped).toEqual([
      { text: 'Quelle est ma meilleure arme ?', count: 2, variants: 1 },
      { text: 'Où atterrir ?', count: 1, variants: 1 },
      { text: 'Pourquoi on a perdu en fin de partie ?', count: 1, variants: 1 },
    ])
    expect(groupCoachQuestions(grouped.map((group) => ({ content: group.text })), 1)).toHaveLength(1)
  })

  it('réduit une question à ses mots-clés : mots vides, tournures de demande et terminaisons ignorés', () => {
    expect([...questionTokens('Donne la liste des membres qui posent problème pour progresser dans la ligue')]).toEqual(['list', 'membr', 'pos', 'problem', 'progress', 'ligu'])
    expect([...questionTokens('Donne la liste des membres qui pose un problème pour progresser dans la ligue ?')]).toEqual(['list', 'membr', 'pos', 'problem', 'progress', 'ligu'])
    expect([...questionTokens('et mon loot ?')]).toEqual(['loot'])
    expect([...questionTokens('Coach, dis-moi : et toi ?')]).toEqual([])
  })

  it('réunit les formulations proches et garde la plus fréquente comme libellé, sans mélanger deux questions', () => {
    const grouped = groupCoachQuestions([
      { content: 'Donne la liste des membres qui pose un problème pour progresser dans la ligue ?' },
      { content: 'Donne la liste des membres qui posent problème pour progresser dans la ligue' },
      { content: 'Donne la liste des membres qui posent problème pour progresser dans la ligue' },
      { content: 'qui a gagné le tournoi ?' },
      { content: 'Qui a gagne le dernier tournoi' },
      { content: 'donne moi le meilleur joueur de mon clan.' },
      { content: 'donne moi le membre avec qui je joue le plus.' },
      { content: 'et toi ?' },
      { content: 'Et toi ?' },
    ])
    expect(grouped).toEqual([
      { text: 'Donne la liste des membres qui posent problème pour progresser dans la ligue', count: 3, variants: 2 },
      { text: 'et toi ?', count: 2, variants: 1 },
      { text: 'qui a gagné le tournoi ?', count: 2, variants: 2 },
      { text: 'donne moi le meilleur joueur de mon clan.', count: 1, variants: 1 },
      { text: 'donne moi le membre avec qui je joue le plus.', count: 1, variants: 1 },
    ])
  })

  it('retrouve la question qui précède une réponse dans son fil', () => {
    const messages = [
      { id: 1, conversationId: 5, content: 'Première question' },
      { id: 3, conversationId: 5, content: 'Deuxième question' },
      { id: 7, conversationId: 6, content: 'Autre fil' },
    ]
    expect(questionBefore({ conversationId: 5, id: 4 }, messages)).toBe('Deuxième question')
    expect(questionBefore({ conversationId: 5, id: 2 }, messages)).toBe('Première question')
    expect(questionBefore({ conversationId: 6, id: 1 }, messages)).toBeNull()
  })

  it('lit les noms d’outils d’une colonne JSON, et rien d’une valeur inattendue', () => {
    expect(coachToolNames([{ name: 'getMatchDebrief', args: {} }, { nom: 'x' }, 'getWeaponStats'])).toEqual(['getMatchDebrief'])
    expect(coachToolNames(null)).toEqual([])
  })
})

describe('coachTestSummary', () => {
  const ok = { ok: true as const, model: 'm', durationMs: 2200, toolCalled: true, codeReturned: true, invented: false, tokensIn: 1, tokensOut: 1, costEur: 0, answer: '4242' }

  it('réussite avec appel d’outil, outil ignoré, chiffres inventés', () => {
    expect(coachTestSummary(ok)).toEqual({ tone: 'pos', text: 'Test réussi · 2,2 s · appel d’outil OK' })
    expect(coachTestSummary({ ...ok, codeReturned: false })).toMatchObject({ tone: 'warn', text: expect.stringContaining('code non repris') })
    expect(coachTestSummary({ ...ok, toolCalled: false, codeReturned: false, invented: true })).toMatchObject({ tone: 'neg', text: expect.stringContaining('chiffres inventés') })
    expect(coachTestSummary({ ...ok, toolCalled: false, codeReturned: false })).toMatchObject({ tone: 'warn', text: expect.stringContaining('sans appel d’outil') })
  })

  it('échec : cause lisible et message du fournisseur', () => {
    expect(coachTestSummary({ ok: false, model: 'm', durationMs: 300, code: 'unauthorized', message: '403 — API key not valid' })).toEqual({
      tone: 'neg',
      text: 'Test échoué · clé refusée ou accès limité — 403 — API key not valid',
    })
  })
})

// Onglets Outils et Questions difficiles (2026-10-30).
const answer = (id: number, overrides: Partial<CoachAnswerRow> = {}): CoachAnswerRow => ({
  id,
  conversationId: 1,
  content: 'Réponse',
  toolCalls: null,
  unverified: false,
  feedbackScore: null,
  createdAt: new Date('2026-10-28T20:00:00.000Z'),
  clanTag: '47R',
  contextLabel: null,
  ...overrides,
})

describe('buildCoachToolsReport', () => {
  const labels = { getSessions: 'Je fais le bilan des soirées…', getDropZones: 'Je compte les largages…', reportMissingData: 'Je signale…' }

  it('compte appels, réponses, part, échecs et votes « Inexact » ; garde les outils jamais appelés, jamais la lacune', () => {
    const report = buildCoachToolsReport({
      days: 30,
      toolLabels: labels,
      answers: [
        answer(10, { toolCalls: [{ name: 'getSessions', args: {} }, { name: 'getSessions', args: {} }], feedbackScore: -1 }),
        answer(11, { toolCalls: [{ name: 'getSessions', args: {}, failed: 'exception' }], createdAt: new Date('2026-10-29T20:00:00.000Z') }),
        answer(12, { toolCalls: [{ name: 'reportMissingData', args: { topic: 'coéquipiers par partie' } }], unverified: true }),
        answer(13, { toolCalls: [{ name: 'reportMissingData', args: { topic: 'Coéquipiers, par partie' } }] }),
        answer(14),
      ],
    })
    expect(report).toMatchObject({ days: 30, answers: 5, withoutTool: 3, unverified: 1, withFailure: 1 })
    expect(report.tools.map((tool) => tool.name)).toEqual(['getSessions', 'getDropZones'])
    expect(report.tools[0]).toMatchObject({ calls: 3, answers: 2, share: 0.4, inaccurate: 1, failures: [{ code: 'exception', count: 1 }], lastUsedAt: '2026-10-29T20:00:00.000Z' })
    expect(report.tools[1]).toMatchObject({ calls: 0, answers: 0, lastUsedAt: null, label: 'Je compte les largages…' })
    // Deux écritures de la même lacune (casse, ponctuation) : une ligne, une formulation.
    expect(report.gaps).toEqual([{ text: 'coéquipiers par partie', count: 2, variants: 1 }])
  })
})

describe('buildCoachDifficultAnswers', () => {
  const question = (id: number, content: string, at: string, conversationId = 1) => ({ id, conversationId, content, createdAt: new Date(at) })

  it('retient les réponses marquées par un signal, les plus marquées d’abord, avec question, outils et lacunes', () => {
    const difficult = buildCoachDifficultAnswers(
      [
        answer(2, { createdAt: new Date('2026-10-28T20:00:00.000Z') }),
        answer(4, { conversationId: 2, unverified: true, feedbackScore: -1, toolCalls: [{ name: 'getSessions', args: {}, failed: 'exception' }], createdAt: new Date('2026-10-28T21:00:00.000Z') }),
        answer(6, { conversationId: 3, toolCalls: [{ name: 'reportMissingData', args: { topic: 'coéquipiers' } }], createdAt: new Date('2026-10-28T22:00:00.000Z') }),
      ],
      [
        question(1, 'Bonjour', '2026-10-28T19:59:00.000Z'),
        question(3, 'Combien de Top 1 samedi ?', '2026-10-28T20:59:00.000Z', 2),
        question(5, 'Avec qui je gagne ?', '2026-10-28T21:59:00.000Z', 3),
      ]
    )
    expect(difficult.map((row) => row.messageId)).toEqual([4, 6])
    expect(difficult[0]).toMatchObject({ question: 'Combien de Top 1 samedi ?', signals: ['inaccurate', 'unverified', 'tool_failed'], failures: ['getSessions : exception'], tools: ['getSessions'] })
    expect(difficult[1]).toMatchObject({ signals: ['gap'], gapTopics: ['coéquipiers'], tools: [] })
    expect(JSON.stringify(difficult)).not.toMatch(/userId/)
  })

  it('« question reposée » : la suivante du même fil, dans les 10 minutes, avec assez de mots-clés communs', () => {
    const answers = [answer(2, { createdAt: new Date('2026-10-28T20:00:00.000Z') })]
    const rephrased = buildCoachDifficultAnswers(answers, [
      question(1, 'Quelle est ma meilleure arme ?', '2026-10-28T19:59:00.000Z'),
      question(3, 'Ma meilleure arme, stp ?', '2026-10-28T20:03:00.000Z'),
    ])
    expect(rephrased[0]?.signals).toEqual(['rephrased'])
    // Trop tard, ou une autre question : rien.
    expect(buildCoachDifficultAnswers(answers, [question(1, 'Quelle est ma meilleure arme ?', '2026-10-28T19:59:00.000Z'), question(3, 'Ma meilleure arme ?', '2026-10-28T20:30:00.000Z')])).toEqual([])
    expect(buildCoachDifficultAnswers(answers, [question(1, 'Quelle est ma meilleure arme ?', '2026-10-28T19:59:00.000Z'), question(3, 'Et sur Miramar ?', '2026-10-28T20:02:00.000Z')])).toEqual([])
  })
})
