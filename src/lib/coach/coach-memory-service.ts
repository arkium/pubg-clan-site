import {
  baselineInToolResults,
  COACH_MEMORY_MAX,
  COACH_MEMORY_RETENTION_DAYS,
  COACH_MEMORY_TOOL_DECLARATION,
  isCoachMemoryKey,
  normalizeForMatch,
  parseCoachMemoryArgs,
  type CoachMemoryBaseline,
  type CoachMemoryView,
} from '@/lib/coach/coach-memory'
import type { CoachToolCall, CoachToolDeclaration } from '@/lib/coach/coach-provider'
import { prisma } from '@/lib/prisma'

/**
 * Mémoire personnelle du Coach IA (lot 11) — lectures et écritures Prisma, et l'outil `rememberAboutMe` lié à la
 * question en cours. Tout est rangé par compte (`userId`) : jamais un autre compte, jamais le SuperUser.
 */

const DAY_MS = 24 * 60 * 60 * 1000

type MemoryRow = { id: number; key: string; text: string; baseline: unknown; updatedAt: Date; expiresAt: Date }

function view(row: MemoryRow): CoachMemoryView {
  const baseline = row.baseline && typeof row.baseline === 'object' ? (row.baseline as CoachMemoryBaseline) : null
  return {
    id: row.id,
    key: isCoachMemoryKey(row.key) ? row.key : 'note',
    text: row.text,
    baseline: baseline && typeof baseline.value === 'number' && typeof baseline.metric === 'string' ? baseline : null,
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }
}

const SELECT = { id: true, key: true, text: true, baseline: true, updatedAt: true, expiresAt: true } as const

/** Lignes vivantes du compte, les plus récentes d'abord, au plus 8. */
export async function listCoachMemories(userId: number, now: Date = new Date()): Promise<CoachMemoryView[]> {
  const rows = await prisma.coachMemory.findMany({ where: { userId, expiresAt: { gt: now } }, orderBy: { updatedAt: 'desc' }, take: COACH_MEMORY_MAX, select: SELECT })
  return rows.map(view)
}

export type RememberInput = {
  userId: number
  memberId: number | null
  clanId: number | null
  key: string
  text: string
  baseline: Omit<CoachMemoryBaseline, 'at'> | null
  now?: Date
}

/**
 * Retient une ligne : même clé et même texte (à la casse et aux accents près) = mise à jour de la date ; sinon, au-delà
 * de 8 lignes, la plus ancienne (dernière mise à jour) laisse la place. Renvoie la ligne et le total du compte.
 */
export async function rememberCoachMemory(input: RememberInput): Promise<{ memory: CoachMemoryView; total: number; replaced: string | null }> {
  const now = input.now ?? new Date()
  const expiresAt = new Date(now.getTime() + COACH_MEMORY_RETENTION_DAYS * DAY_MS)
  const baseline = input.baseline ? { ...input.baseline, at: now.toISOString() } : undefined
  const existing = await prisma.coachMemory.findMany({ where: { userId: input.userId }, orderBy: { updatedAt: 'asc' }, select: { ...SELECT, memberId: true, clanId: true } })
  const same = existing.find((row) => row.key === input.key && normalizeForMatch(row.text) === normalizeForMatch(input.text))
  if (same) {
    const row = await prisma.coachMemory.update({
      where: { id: same.id },
      data: { text: input.text, expiresAt, ...(baseline ? { baseline } : {}), memberId: input.memberId, clanId: input.clanId },
      select: SELECT,
    })
    return { memory: view(row), total: existing.length, replaced: null }
  }
  let replaced: string | null = null
  if (existing.length >= COACH_MEMORY_MAX) {
    const oldest = existing[0]
    await prisma.coachMemory.delete({ where: { id: oldest.id } })
    replaced = oldest.text
  }
  const row = await prisma.coachMemory.create({
    data: { userId: input.userId, memberId: input.memberId, clanId: input.clanId, key: input.key, text: input.text, baseline, source: 'player', expiresAt },
    select: SELECT,
  })
  const total = Math.min(COACH_MEMORY_MAX, existing.length + 1)
  return { memory: view(row), total, replaced }
}

/** Efface une ligne du compte ; faux si elle n'est pas à lui (404 côté route, son existence n'est pas révélée). */
export async function deleteCoachMemory(id: number, userId: number): Promise<boolean> {
  const result = await prisma.coachMemory.deleteMany({ where: { id, userId } })
  return result.count > 0
}

/** « Tout oublier » : toutes les lignes du compte. */
export async function clearCoachMemories(userId: number): Promise<number> {
  const result = await prisma.coachMemory.deleteMany({ where: { userId } })
  return result.count
}

export type CoachMemoryToolScope = {
  userId: number
  memberId: number | null
  clanId: number | null
  /** La question du joueur : le texte retenu doit en être une partie. */
  message: string
  /** Résultats des outils déjà appelés dans cette réponse : une `baseline` doit y figurer. */
  toolResults: () => readonly unknown[]
  now?: Date
}

/** Outil `rememberAboutMe`, lié au compte et à la question en cours (le modèle ne passe que `key`, `text`, `baseline`). */
export function createCoachMemoryTool(scope: CoachMemoryToolScope): { declaration: CoachToolDeclaration; run: (call: CoachToolCall) => Promise<unknown> } {
  return {
    declaration: COACH_MEMORY_TOOL_DECLARATION,
    async run(call) {
      const parsed = parseCoachMemoryArgs(call.args ?? {}, scope.message)
      if ('error' in parsed) return parsed
      if (parsed.baseline && !baselineInToolResults(parsed.baseline, scope.toolResults())) {
        return { error: 'baseline_unverified', message: 'La mesure de départ doit venir d’un outil appelé dans cette réponse : retiens l’objectif sans baseline, ou appelle d’abord l’outil.' }
      }
      const result = await rememberCoachMemory({ userId: scope.userId, memberId: scope.memberId, clanId: scope.clanId, key: parsed.key, text: parsed.text, baseline: parsed.baseline, now: scope.now })
      return { remembered: true, key: result.memory.key, text: result.memory.text, baseline: result.memory.baseline, total: result.total, max: COACH_MEMORY_MAX, replaced: result.replaced, keptDays: COACH_MEMORY_RETENTION_DAYS }
    },
  }
}
