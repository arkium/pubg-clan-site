'use client'

import type { ReactNode } from 'react'

import { DamageBodySvg, type BodyZoneKey } from '@/components/telemetry/DamageBodySvg'

/** Une zone du corps, prête à dessiner : touches, dégâts et la valeur affichée en bout de barre. */
export type BodyZonePanelBar = { zone: BodyZoneKey; label: string; hits: number; damage: number; value: string }

export type BodyZonePanelSide = 'dealt' | 'taken'

/** Couleur d'un côté (charte, couleurs de jeu) : vert pour les tirs infligés, rouge pour les tirs subis. */
export function bodyZoneSideColor(side: BodyZonePanelSide) {
  return side === 'dealt' ? 'var(--game-pos)' : 'var(--game-neg)'
}

/**
 * Bloc « Tirs infligés / Tirs subis » (docs/ui/components.md, `BodyZonePanel`) : silhouette de 92 px à gauche (masquée
 * sous 640 px), une barre par zone (libellé 62 px · barre · valeur de 72 px au moins, sur une ligne), un en-tête et
 * un pied fournis par l'appelant. Le débriefing d'une partie (touches · dégâts, barres au prorata des dégâts) et la
 * section « Zones d'impact » du Style de jeu (touches · part, barres au prorata des touches) le partagent. `muted` :
 * échantillon faible, silhouette et barres en gris.
 */
export default function BodyZonePanel({
  side,
  bars,
  widthBy = 'damage',
  header,
  footer,
  muted = false,
  testId,
}: {
  side: BodyZonePanelSide
  bars: BodyZonePanelBar[]
  widthBy?: 'damage' | 'hits'
  header: ReactNode
  footer?: ReactNode
  muted?: boolean
  testId?: string
}) {
  const color = muted ? 'var(--theme-ui-text-muted)' : bodyZoneSideColor(side)
  const max = Math.max(0, ...bars.map((bar) => bar[widthBy]))
  const record = (field: 'damage' | 'hits') =>
    Object.fromEntries(bars.map((bar) => [bar.zone, bar[field]])) as Record<BodyZoneKey, number>

  return (
    <div className="app-panel-muted flex gap-3.5 px-3.5 py-3" data-testid={testId}>
      <div className={`hidden w-[92px] shrink-0 sm:block ${muted ? 'opacity-60 grayscale' : ''}`}>
        <DamageBodySvg
          damageByZone={record('damage')}
          hitsByZone={record('hits')}
          size="sm"
          variant={side === 'dealt' ? 'dealt' : 'received'}
          showLabels={false}
          showValues={false}
          showTooltips
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {header}
        {bars.map((bar) => (
          <div key={bar.zone} className="grid items-center gap-2 text-xs tabular-nums [grid-template-columns:62px_minmax(0,1fr)_auto]">
            <span className="text-gray-700">{bar.label}</span>
            <div className="h-2 rounded-full" style={{ background: 'var(--game-track)' }}>
              <div className="h-2 rounded-full" style={{ width: `${max > 0 ? Math.round((bar[widthBy] / max) * 100) : 0}%`, background: color }} />
            </div>
            <span className="min-w-[72px] whitespace-nowrap text-right text-gray-500">{bar.value}</span>
          </div>
        ))}
        {footer}
      </div>
    </div>
  )
}
