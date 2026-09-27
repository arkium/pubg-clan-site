import { Crosshair, House, Swords, Users, type LucideIcon } from 'lucide-react'

import { TOURNAMENT_MODE_DISPLAY } from '@/lib/tournament-mode-display'
import type { TournamentMode } from '@/lib/tournament-service'

/** Icône de chaque mode : épées (inter-clans), groupe (équipes libres), viseur (solo), maison (intra-clan). */
export const TOURNAMENT_MODE_ICONS: Record<TournamentMode, LucideIcon> = {
  inter_clan: Swords,
  custom_teams: Users,
  solo_ffa: Crosshair,
  intra_clan: House,
}

/** Classes qui posent les jetons de couleur d'un mode (`--tmode`, `--tmode-text`, `--tmode-soft`, `--tmode-ring`). */
export function tournamentModeClass(mode: TournamentMode, onImage = false) {
  return `tournament-mode tournament-mode--${mode}${onImage ? ' tournament-mode--on-image' : ''}`
}

/**
 * Badge du mode d'un tournoi : ce qu'il classe se voit avant d'ouvrir le tournoi. `onImage` : sur un bandeau ou une
 * carte illustrée (fond sombre dans les deux thèmes).
 */
export default function TournamentModeBadge({
  mode,
  onImage = false,
  className = '',
}: {
  mode: TournamentMode
  onImage?: boolean
  className?: string
}) {
  const Icon = TOURNAMENT_MODE_ICONS[mode]
  const surface = onImage ? 'bg-slate-950/70 text-white' : 'bg-[var(--tmode-soft)] text-[var(--tmode-text)]'
  return (
    <span
      className={`${tournamentModeClass(mode, onImage)} inline-flex items-center gap-1.5 rounded-md border border-[var(--tmode-ring)] px-2 py-0.5 text-[11px] font-extrabold ${surface} ${className}`.trim()}
    >
      <Icon className="h-3 w-3 text-[var(--tmode)]" aria-hidden="true" />
      {TOURNAMENT_MODE_DISPLAY[mode].label}
    </span>
  )
}
