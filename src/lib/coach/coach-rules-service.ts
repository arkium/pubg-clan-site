import type { CoachSettings } from '@/lib/coach/coach-config'
import {
  COACH_RULE_MAX_ACTIVE,
  coachRulesPromptTokens,
  estimateCoachTokens,
  normalizeCoachRuleText,
  type CoachRulesReport,
  type CoachRuleView,
} from '@/lib/coach/coach-rules'
import { prisma } from '@/lib/prisma'

/**
 * Règles apprises du Coach IA (lot 10) — lectures et écritures Prisma. Les textes actifs sont gardés 30 s en mémoire
 * (comme les réglages) : une question ne coûte pas une lecture de plus. Toute écriture vient d'une route SuperUser
 * enveloppée par `withAdminActionLog` ; `resetCoachRulesCache` après chacune.
 */

const CACHE_TTL_MS = 30_000
let cached: { texts: string[]; expiresAt: number } | null = null

export function resetCoachRulesCache() {
  cached = null
}

/** Textes des règles actives, dans l'ordre d'écriture, bornés à 20 ; une base injoignable rend une liste vide. */
export async function activeCoachRuleTexts(now: number = Date.now()): Promise<string[]> {
  if (cached && cached.expiresAt > now) return cached.texts
  let texts: string[] = []
  try {
    const rows = await prisma.coachRule.findMany({ where: { enabled: true }, orderBy: { createdAt: 'asc' }, take: COACH_RULE_MAX_ACTIVE, select: { text: true } })
    texts = rows.map((row) => row.text)
  } catch (error) {
    console.error('[coach] Règles illisibles, aucune règle injectée :', error)
  }
  cached = { texts, expiresAt: now + CACHE_TTL_MS }
  return texts
}

type RuleRow = { id: number; text: string; enabled: boolean; fromMessageId: number | null; createdAt: Date; updatedAt: Date }

function view(row: RuleRow): CoachRuleView {
  return { id: row.id, text: row.text, enabled: row.enabled, fromMessageId: row.fromMessageId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), tokens: estimateCoachTokens(row.text) }
}

export async function readCoachRulesReport(settings: Pick<CoachSettings, 'rulesEnabled'>): Promise<CoachRulesReport> {
  const rows = await prisma.coachRule.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, text: true, enabled: true, fromMessageId: true, createdAt: true, updatedAt: true } })
  const active = rows.filter((row) => row.enabled)
  return {
    enabled: settings.rulesEnabled,
    rules: rows.map(view),
    activeCount: active.length,
    maxActive: COACH_RULE_MAX_ACTIVE,
    promptTokens: coachRulesPromptTokens(active.map((row) => row.text)),
  }
}

export type CoachRuleWriteResult = { rule: CoachRuleView } | { error: 'invalid' | 'limit' | 'not_found'; message: string }

const LIMIT_MESSAGE = `Au plus ${COACH_RULE_MAX_ACTIVE} règles actives : retire ou désactive une règle avant d’en ajouter une.`

/** Nouvelle règle, active d'emblée ; refusée au-delà de 20 règles actives. `fromMessageId` doit être un message existant. */
export async function createCoachRule(input: { text: unknown; fromMessageId?: number | null; createdById: number | null }): Promise<CoachRuleWriteResult> {
  const normalized = normalizeCoachRuleText(input.text)
  if ('error' in normalized) return { error: 'invalid', message: normalized.error }
  const active = await prisma.coachRule.count({ where: { enabled: true } })
  if (active >= COACH_RULE_MAX_ACTIVE) return { error: 'limit', message: LIMIT_MESSAGE }
  let fromMessageId: number | null = null
  if (input.fromMessageId) {
    const message = await prisma.coachMessage.findUnique({ where: { id: input.fromMessageId }, select: { id: true } })
    fromMessageId = message?.id ?? null
  }
  const row = await prisma.coachRule.create({
    data: { text: normalized.text, fromMessageId, createdById: input.createdById },
    select: { id: true, text: true, enabled: true, fromMessageId: true, createdAt: true, updatedAt: true },
  })
  cached = null
  return { rule: view(row) }
}

/** Texte et/ou interrupteur d'une règle ; réactiver au-delà de 20 actives est refusé. */
export async function updateCoachRule(id: number, patch: { text?: unknown; enabled?: unknown }): Promise<CoachRuleWriteResult> {
  const data: { text?: string; enabled?: boolean } = {}
  if (patch.text !== undefined) {
    const normalized = normalizeCoachRuleText(patch.text)
    if ('error' in normalized) return { error: 'invalid', message: normalized.error }
    data.text = normalized.text
  }
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') return { error: 'invalid', message: 'enabled : vrai ou faux attendu.' }
    data.enabled = patch.enabled
  }
  if (Object.keys(data).length === 0) return { error: 'invalid', message: 'Rien à modifier.' }
  const existing = await prisma.coachRule.findUnique({ where: { id }, select: { id: true, enabled: true } })
  if (!existing) return { error: 'not_found', message: 'Règle introuvable.' }
  if (data.enabled === true && !existing.enabled) {
    const active = await prisma.coachRule.count({ where: { enabled: true } })
    if (active >= COACH_RULE_MAX_ACTIVE) return { error: 'limit', message: LIMIT_MESSAGE }
  }
  const row = await prisma.coachRule.update({ where: { id }, data, select: { id: true, text: true, enabled: true, fromMessageId: true, createdAt: true, updatedAt: true } })
  cached = null
  return { rule: view(row) }
}

export async function deleteCoachRule(id: number): Promise<boolean> {
  const result = await prisma.coachRule.deleteMany({ where: { id } })
  cached = null
  return result.count > 0
}
