export type TacticalPhase = 'all' | 'early' | 'mid' | 'late'

export const TACTICAL_PHASE_OPTIONS: Array<{
  value: TacticalPhase
  label: string
  phases: number[]
}> = [
  { value: 'all', label: 'Toutes les phases', phases: [] },
  { value: 'early', label: 'Début de partie · phases 1–2', phases: [1, 2] },
  { value: 'mid', label: 'Milieu de partie · phases 3–4', phases: [3, 4] },
  { value: 'late', label: 'Fin de partie · phases 5–8', phases: [5, 6, 7, 8] },
]

export function parseTacticalPhase(value: string | null): TacticalPhase {
  return TACTICAL_PHASE_OPTIONS.some((option) => option.value === value)
    ? value as TacticalPhase
    : 'all'
}

export function tacticalPhaseNumbers(value: TacticalPhase): number[] {
  return TACTICAL_PHASE_OPTIONS.find((option) => option.value === value)?.phases ?? []
}

export function tacticalPhaseLabel(value: TacticalPhase): string {
  return TACTICAL_PHASE_OPTIONS.find((option) => option.value === value)?.label
    ?? TACTICAL_PHASE_OPTIONS[0].label
}

export function isInTacticalPhase(phase: number | null, value: TacticalPhase): boolean {
  if (value === 'all') return true
  if (phase === null || !Number.isFinite(phase)) return false
  return tacticalPhaseNumbers(value).includes(Math.trunc(phase))
}