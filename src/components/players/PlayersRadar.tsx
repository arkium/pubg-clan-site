'use client'

import { comparatorSlot } from '@/components/comparator/ComparatorUi'
import { PLAYER_ROLES, type PlayerRoles } from '@/lib/players-ranking'

/**
 * Profil par rôle du comparateur de joueurs (docs/features/joueurs.md) : un axe par rôle (Fragger, Medic, Ghost, Tireur à
 * distance), score de 0 à 100. Chaque élément comparé garde la couleur de son slot (P1 bleu, P2 orange, P3 émeraude —
 * docs/ui/index.html#comparateur) et un trait distinct (plein, tirets, pointillés) lisible sans la couleur.
 * Grilles en `--theme-ui-border`, étiquettes en 11 px au moins (charte §5g).
 */

export const SLOT_DASHES = ['', '7 5', '2 4'] as const

// Marge à gauche pour « à distance » (ancré à droite), à droite pour « Medic ».
const CX = 175
const CY = 128
const RADIUS = 92

function point(index: number, count: number, scale: number) {
  const angle = ((360 / count) * index - 90) * (Math.PI / 180)
  return { x: CX + RADIUS * scale * Math.cos(angle), y: CY + RADIUS * scale * Math.sin(angle) }
}

const path = (points: Array<{ x: number; y: number }>) => `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} Z`

export default function PlayersRadar({ slots }: { slots: Array<{ key: string; name: string; roles: PlayerRoles }> }) {
  const count = PLAYER_ROLES.length
  return (
    <svg viewBox="0 0 340 256" className="h-auto w-full max-w-[340px] shrink-0 select-none" role="img" aria-label="Profil par rôle des éléments comparés">
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <path key={scale} d={path(PLAYER_ROLES.map((_, index) => point(index, count, scale)))} fill="none" stroke="var(--theme-ui-border)" strokeWidth="1" />
      ))}
      {PLAYER_ROLES.map((role, index) => {
        const end = point(index, count, 1)
        const label = point(index, count, 1.2)
        const anchor = Math.abs(label.x - CX) < 4 ? 'middle' : label.x > CX ? 'start' : 'end'
        return (
          <g key={role.id}>
            <line x1={CX} y1={CY} x2={end.x} y2={end.y} stroke="var(--theme-ui-border)" strokeWidth="1" />
            {/* « Tireur à distance » sur deux lignes : sur l'axe de gauche, il sortirait du dessin. */}
            <text x={label.x} y={label.y + (role.id === 'sniper' ? -3 : 4)} textAnchor={anchor} fontSize="12" fontWeight="700" fill="var(--theme-ui-text-secondary)">
              {role.id === 'sniper' ? (
                <>
                  <tspan x={label.x}>Tireur</tspan>
                  <tspan x={label.x} dy="14">à distance</tspan>
                </>
              ) : (
                role.label
              )}
            </text>
          </g>
        )
      })}
      {slots.map((slot, slotIndex) => {
        const slotStyle = comparatorSlot(slotIndex)
        const points = PLAYER_ROLES.map((role, index) => point(index, count, Math.max(0, Math.min(100, slot.roles[role.id] ?? 0)) / 100))
        return (
          <path
            key={slot.key}
            d={path(points)}
            fill={`color-mix(in srgb, ${slotStyle.hex} 14%, transparent)`}
            stroke={slotStyle.hex}
            strokeWidth="2.25"
            strokeDasharray={SLOT_DASHES[slotIndex] || undefined}
            strokeLinejoin="round"
          >
            <title>{`${slot.name} : ${PLAYER_ROLES.map((role) => `${role.label} ${slot.roles[role.id] ?? '—'}`).join(' · ')}`}</title>
          </path>
        )
      })}
    </svg>
  )
}
