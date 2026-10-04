import { Crosshair, Ghost, HeartPulse, type LucideIcon } from 'lucide-react'

import type { RosterRoleId } from '@/lib/member-roster'

/**
 * Badge du style de jeu (Fragger, Medic, Ghost) : icône lucide et libellé en majuscules, à la couleur de jeu du rôle
 * (charte : Fragger `--game-neg`, Medic `--game-sky`, Ghost `--game-pos` — conteneur `.game-ui`, variante sombre sous
 * `.app-on-photo`). Annuaire des clans (style du clan), réutilisable pour un joueur.
 */

const ROLES: Record<RosterRoleId, { label: string; Icon: LucideIcon; color: string; soft: string; ring: string }> = {
  fragger: { label: 'Fragger', Icon: Crosshair, color: 'var(--game-neg)', soft: 'var(--game-neg-soft)', ring: 'color-mix(in srgb, var(--game-neg) 45%, transparent)' },
  medic: { label: 'Medic', Icon: HeartPulse, color: 'var(--game-sky)', soft: 'var(--game-sky-soft)', ring: 'var(--game-sky-ring)' },
  ghost: { label: 'Ghost', Icon: Ghost, color: 'var(--game-pos)', soft: 'var(--game-pos-soft)', ring: 'var(--game-pos-ring)' },
}

export const playstyleLabel = (role: RosterRoleId) => ROLES[role].label

export default function PlaystyleBadge({ role, title, size = 'sm' }: { role: RosterRoleId; title?: string; size?: 'sm' | 'md' }) {
  const { label, Icon, color, soft, ring } = ROLES[role]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-extrabold uppercase tracking-[0.06em] ${size === 'md' ? 'px-2.5 py-0.5 text-xs' : 'px-2 text-[11px]'}`}
      style={{ color, backgroundColor: soft, borderColor: ring }}
      title={title}
      data-testid="playstyle-badge"
      data-role={role}
    >
      <Icon className={size === 'md' ? 'h-3.5 w-3.5' : 'h-[11px] w-[11px]'} aria-hidden="true" />
      {label}
      {title ? <span className="sr-only">{` — ${title}`}</span> : null}
    </span>
  )
}
