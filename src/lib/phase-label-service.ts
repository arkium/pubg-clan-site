import { prisma } from '@/lib/prisma'

const PHASE_LABELS_KEY = 'pubg_phase_labels'
const MAX_LABEL_LENGTH = 40

// Canonical isGame values and their default descriptions.
// isGame 0.1 = pre-game (parachute)
// isGame integer = stable phase (circle stopped)
// isGame x.5 = shrinking transition
export const PHASE_KEYS = [
  '0.1',
  '1',
  '1.5',
  '2',
  '2.5',
  '3',
  '3.5',
  '4',
  '4.5',
  '5',
  '5.5',
  '6',
  '6.5',
  '7',
  '7.5',
  '8',
] as const

export type PhaseKey = (typeof PHASE_KEYS)[number]

export const DEFAULT_PHASE_LABELS: Record<PhaseKey, string> = {
  '0.1': 'Pré-partie (parachute)',
  '1': 'Phase 1 – Cercle stable',
  '1.5': 'Phase 1→2 – Rétrécissement',
  '2': 'Phase 2 – Cercle stable',
  '2.5': 'Phase 2→3 – Rétrécissement',
  '3': 'Phase 3 – Cercle stable',
  '3.5': 'Phase 3→4 – Rétrécissement',
  '4': 'Phase 4 – Cercle stable',
  '4.5': 'Phase 4→5 – Rétrécissement',
  '5': 'Phase 5 – Cercle stable',
  '5.5': 'Phase 5→6 – Rétrécissement',
  '6': 'Phase 6 – Cercle stable',
  '6.5': 'Phase 6→7 – Rétrécissement',
  '7': 'Phase 7 – Cercle stable',
  '7.5': 'Phase 7→8 – Rétrécissement',
  '8': 'Phase 8 – Cercle stable (finale)',
}

function sanitizeLabel(raw: string, fallback: string) {
  const trimmed = raw.trim()
  return trimmed ? trimmed.slice(0, MAX_LABEL_LENGTH) : fallback
}

function parseStoredPhaseLabels(value: string | null): Partial<Record<string, string>> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  } catch {
    return {}
  }
}

export function normalizePhaseLabels(input: Partial<Record<string, string>>) {
  const result: Record<string, string> = {}
  for (const key of PHASE_KEYS) {
    const fallback = DEFAULT_PHASE_LABELS[key]
    result[key] = sanitizeLabel(input[key] ?? '', fallback)
  }
  return result
}

export async function getPhaseLabels(): Promise<Record<string, string>> {
  const config = await prisma.appConfig.findUnique({
    where: { key: PHASE_LABELS_KEY },
    select: { value: true },
  })
  const stored = parseStoredPhaseLabels(config?.value ?? null)
  return normalizePhaseLabels(stored)
}

export async function updatePhaseLabels(input: Record<string, string>) {
  const sanitized = Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => (PHASE_KEYS as readonly string[]).includes(key))
      .map(([key, val]) => [key, sanitizeLabel(val, DEFAULT_PHASE_LABELS[key as PhaseKey] ?? key)])
  )

  await prisma.appConfig.upsert({
    where: { key: PHASE_LABELS_KEY },
    update: { value: JSON.stringify(sanitized) },
    create: { key: PHASE_LABELS_KEY, value: JSON.stringify(sanitized) },
  })

  return normalizePhaseLabels(sanitized)
}

/** Derive a concise display label for a numeric isGame value. Falls back to DEFAULT. */
export function isGameLabel(isGame: number, labels: Record<string, string>): string {
  const key = String(isGame)
  if (labels[key]) return labels[key]
  const defKey = (PHASE_KEYS as readonly string[]).find((k) => Math.abs(Number(k) - isGame) < 0.01)
  if (defKey && labels[defKey]) return labels[defKey]
  if (defKey) return DEFAULT_PHASE_LABELS[defKey as PhaseKey]
  // Fallback: auto-generate
  if (isGame < 1) return `Pré-partie`
  if (Number.isInteger(isGame)) return `Phase ${isGame} – stable`
  return `Phase ${Math.floor(isGame)}→${Math.ceil(isGame)} – rétrécissement`
}
