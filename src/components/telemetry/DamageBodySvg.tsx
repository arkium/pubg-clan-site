'use client'

import React, { useState } from 'react'

export type BodyZoneKey = 'head' | 'torso' | 'pelvis' | 'arms' | 'legs'

export type ZoneDamageStats = {
  damage: number
  hits?: number
  percentage?: number
}

export type DamageMap = Partial<Record<BodyZoneKey, number>>
export type HitsMap = Partial<Record<BodyZoneKey, number>>

export interface DamageBodySvgProps {
  damageByZone?: DamageMap
  hitsByZone?: HitsMap
  totalDamage?: number
  size?: 'sm' | 'md' | 'lg' | number
  showLabels?: boolean
  showTooltips?: boolean
  interactive?: boolean
  className?: string
  variant?: 'received' | 'dealt'
}

const ZONE_LABELS: Record<BodyZoneKey, string> = {
  head: 'Tête',
  torso: 'Buste / Torse',
  pelvis: 'Bassin',
  arms: 'Bras',
  legs: 'Jambes',
}

const ZONE_ICONS: Record<BodyZoneKey, string> = {
  head: '🎯',
  torso: '🛡️',
  pelvis: '⚡',
  arms: '💪',
  legs: '🦵',
}

/**
 * Infers anatomical body zones distribution from a PUBG damageReason string.
 */
export function inferHitZones(damageReason?: string): Partial<Record<BodyZoneKey, number>> {
  if (!damageReason) {
    return { torso: 75, pelvis: 25 }
  }
  const reason = damageReason.toLowerCase()
  if (reason.includes('head')) {
    return { head: 100 }
  }
  if (reason.includes('pelvis') || reason.includes('groin')) {
    return { pelvis: 80, torso: 20 }
  }
  if (reason.includes('arm') || reason.includes('hand')) {
    return { arms: 70, torso: 30 }
  }
  if (reason.includes('leg') || reason.includes('foot')) {
    return { legs: 80, pelvis: 20 }
  }
  return { torso: 70, pelvis: 30 }
}

/**
 * Returns stylish gaming colors and glow based on damage intensity.
 */
function getZoneFill(damage: number, maxDamage: number, isHovered: boolean): {
  fill: string
  stroke: string
  glow?: string
  badgeBg: string
} {
  if (!damage || damage <= 0) {
    return {
      fill: isHovered ? 'rgba(148, 163, 184, 0.18)' : 'rgba(30, 41, 59, 0.55)',
      stroke: isHovered ? 'rgba(148, 163, 184, 0.6)' : 'rgba(71, 85, 105, 0.45)',
      badgeBg: '#334155',
    }
  }

  const ratio = Math.min(1, damage / Math.max(1, maxDamage))

  if (ratio > 0.65 || damage >= 70) {
    // Critical / Lethal (Crimson Red / High Neon Glow)
    return {
      fill: isHovered ? 'rgba(239, 68, 68, 0.92)' : 'rgba(220, 38, 38, 0.78)',
      stroke: '#fca5a5',
      glow: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.8))',
      badgeBg: '#b91c1c',
    }
  }

  if (ratio > 0.35 || damage >= 35) {
    // Heavy / Moderate (Vibrant Orange / Amber)
    return {
      fill: isHovered ? 'rgba(249, 115, 22, 0.92)' : 'rgba(234, 88, 12, 0.78)',
      stroke: '#fdba74',
      glow: 'drop-shadow(0 0 6px rgba(249, 115, 22, 0.7))',
      badgeBg: '#c2410c',
    }
  }

  // Light hit (Golden Yellow / Amber)
  return {
    fill: isHovered ? 'rgba(234, 179, 8, 0.9)' : 'rgba(202, 138, 4, 0.72)',
    stroke: '#fef08a',
    glow: 'drop-shadow(0 0 5px rgba(234, 179, 8, 0.55))',
    badgeBg: '#a16207',
  }
}

export function DamageBodySvg({
  damageByZone = {},
  hitsByZone = {},
  totalDamage,
  size = 'md',
  showLabels = false,
  showTooltips = true,
  interactive = true,
  className = '',
  variant = 'received',
}: DamageBodySvgProps) {
  const [hoveredZone, setHoveredZone] = useState<BodyZoneKey | null>(null)

  const computedTotal =
    totalDamage ??
    Object.values(damageByZone).reduce((sum, d) => sum + (Number(d) || 0), 0)

  // Pixel dimensions for SVG
  let width = 110
  let height = 220
  if (typeof size === 'number') {
    width = size
    height = Math.round(size * 2)
  } else if (size === 'sm') {
    width = 85
    height = 170
  } else if (size === 'lg') {
    width = 140
    height = 280
  }

  // Find maximum damage zone for scaling
  const maxZoneDamage = Math.max(
    100,
    ...Object.values(damageByZone).map((v) => Number(v) || 0)
  )

  const headDmg = Number(damageByZone.head) || 0
  const torsoDmg = Number(damageByZone.torso) || 0
  const armsDmg = Number(damageByZone.arms) || 0
  const pelvisDmg = Number(damageByZone.pelvis) || 0
  const legsDmg = Number(damageByZone.legs) || 0

  const renderZoneProps = (zone: BodyZoneKey) => {
    const dmg = Number(damageByZone[zone]) || 0
    const hits = Number(hitsByZone[zone]) || 0
    const isHovered = hoveredZone === zone
    const { fill, stroke, glow } = getZoneFill(dmg, maxZoneDamage, isHovered)

    return {
      fill,
      stroke,
      strokeWidth: isHovered ? 2.5 : 1.4,
      style: {
        filter: glow,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: interactive ? 'pointer' : 'default',
      },
      onMouseEnter: () => interactive && setHoveredZone(zone),
      onMouseLeave: () => interactive && setHoveredZone(null),
      'data-zone': zone,
      'data-damage': dmg,
      'data-hits': hits,
      'aria-label': `${ZONE_LABELS[zone]}: ${dmg.toFixed(0)} dégâts`,
    }
  }

  const activeZoneInfo = hoveredZone
    ? {
        key: hoveredZone,
        label: ZONE_LABELS[hoveredZone],
        damage: Number(damageByZone[hoveredZone]) || 0,
        hits: Number(hitsByZone[hoveredZone]) || 0,
        percent:
          computedTotal > 0
            ? Math.round(((Number(damageByZone[hoveredZone]) || 0) / computedTotal) * 100)
            : 0,
      }
    : null

  return (
    <div className={`relative flex flex-col items-center select-none w-full ${className}`}>
      {/* --- Tactical Operator Canvas --- */}
      <div className="relative flex items-center justify-center p-2">
        <svg
          viewBox="0 0 100 200"
          width={width}
          height={height}
          className="overflow-visible"
          role="img"
          aria-label={`Silhouette anatomique PUBG des dégâts ${variant === 'received' ? 'subis' : 'infligés'}`}
        >
          <defs>
            {/* Holographic grid pattern */}
            <pattern id="tactical-hex" width="10" height="10" patternUnits="userSpaceOnUse">
              <path
                d="M 5 0 L 10 5 L 5 10 L 0 5 Z"
                fill="none"
                stroke="rgba(59, 130, 246, 0.05)"
                strokeWidth="0.5"
              />
            </pattern>

            {/* Neon Glow Filter */}
            <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* --- TACTICAL RADAR BACKGROUND --- */}
          <g id="tactical-hud-bg" pointerEvents="none">
            {/* Corner Targeting Reticles */}
            <path d="M 6 16 L 6 6 L 16 6" fill="none" stroke="rgba(59, 130, 246, 0.35)" strokeWidth="1" />
            <path d="M 84 6 L 94 6 L 94 16" fill="none" stroke="rgba(59, 130, 246, 0.35)" strokeWidth="1" />
            <path d="M 6 184 L 6 194 L 16 194" fill="none" stroke="rgba(59, 130, 246, 0.35)" strokeWidth="1" />
            <path d="M 84 194 L 94 194 L 94 184" fill="none" stroke="rgba(59, 130, 246, 0.35)" strokeWidth="1" />

            {/* Concentric Radar Rings */}
            <circle cx="50" cy="78" r="42" stroke="rgba(59, 130, 246, 0.12)" strokeWidth="0.8" strokeDasharray="3,3" fill="none" />
            <circle cx="50" cy="78" r="68" stroke="rgba(59, 130, 246, 0.07)" strokeWidth="0.6" strokeDasharray="4,4" fill="none" />

            {/* Crosshair Axes */}
            <line x1="50" y1="4" x2="50" y2="196" stroke="rgba(59, 130, 246, 0.1)" strokeWidth="0.6" strokeDasharray="2,3" />
            <line x1="4" y1="78" x2="96" y2="78" stroke="rgba(59, 130, 246, 0.1)" strokeWidth="0.6" strokeDasharray="2,3" />
          </g>

          {/* --- 1. HEAD (PUBG Lv.3 Military Helmet & Visor) --- */}
          <g id="zone-head">
            {/* Main Helmet Shell */}
            <path
              d="M 50 8 
                 C 37 8 34 18 34 26 
                 C 34 37 40 44 50 44 
                 C 60 44 66 37 66 26 
                 C 66 18 63 8 50 8 Z"
              {...renderZoneProps('head')}
            />

            {/* Ear Guard Plates */}
            <rect x="31" y="24" width="4" height="12" rx="1.5" fill="rgba(30,41,59,0.8)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" pointerEvents="none" />
            <rect x="65" y="24" width="4" height="12" rx="1.5" fill="rgba(30,41,59,0.8)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" pointerEvents="none" />

            {/* Tactical Helmet Visor Slit */}
            <path
              d="M 40 22 Q 50 25 60 22 L 59 28 Q 50 31 41 28 Z"
              fill={headDmg > 50 ? '#f43f5e' : 'rgba(15,23,42,0.9)'}
              stroke={headDmg > 50 ? '#fda4af' : 'rgba(96,165,250,0.6)'}
              strokeWidth="0.9"
              className={headDmg > 50 ? 'animate-pulse' : ''}
              pointerEvents="none"
            />
          </g>

          {/* --- 2. TORSO (Tactical Kevlar Plate Carrier Vest) --- */}
          <g id="zone-torso">
            {/* Vest Silhouette */}
            <path
              d="M 44 45 
                 L 32 49 
                 L 30 89 
                 L 38 95 
                 L 62 95 
                 L 70 89 
                 L 68 49 
                 L 56 45 
                 Z"
              {...renderZoneProps('torso')}
            />

            {/* Shoulder Straps & Buckles */}
            <rect x="35" y="47" width="6" height="8" rx="1" fill="rgba(15,23,42,0.7)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" pointerEvents="none" />
            <rect x="59" y="47" width="6" height="8" rx="1" fill="rgba(15,23,42,0.7)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" pointerEvents="none" />

            {/* Ballistic Chest Armor Plate */}
            <path
              d="M 37 57 L 63 57 L 60 84 L 50 88 L 40 84 Z"
              fill="rgba(0,0,0,0.22)"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="0.8"
              pointerEvents="none"
            />

            {/* Tactical Molle Seams */}
            <line x1="42" y1="65" x2="58" y2="65" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7" strokeDasharray="2,2" pointerEvents="none" />
            <line x1="43" y1="73" x2="57" y2="73" stroke="rgba(255,255,255,0.3)" strokeWidth="0.7" strokeDasharray="2,2" pointerEvents="none" />
          </g>

          {/* --- 3. ARMS (Tactical Sleeves, Elbow Guards & Gloves) --- */}
          <g id="zone-arms">
            {/* Left Arm */}
            <path
              d="M 30 50 
                 L 19 53 
                 L 14 80 
                 L 10 110 
                 L 16 114 
                 L 22 90 
                 L 28 65 
                 Z"
              {...renderZoneProps('arms')}
            />
            {/* Left Elbow Guard */}
            <circle cx="16" cy="80" r="3.5" fill="rgba(15,23,42,0.6)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" pointerEvents="none" />

            {/* Right Arm */}
            <path
              d="M 70 50 
                 L 81 53 
                 L 86 80 
                 L 90 110 
                 L 84 114 
                 L 78 90 
                 L 72 65 
                 Z"
              {...renderZoneProps('arms')}
            />
            {/* Right Elbow Guard */}
            <circle cx="84" cy="80" r="3.5" fill="rgba(15,23,42,0.6)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" pointerEvents="none" />
          </g>

          {/* --- 4. PELVIS (Tactical Combat Duty Belt & Holster) --- */}
          <g id="zone-pelvis">
            <path
              d="M 37 96 
                 L 33 118 
                 L 47 127 
                 L 53 127 
                 L 67 118 
                 L 63 96 
                 Z"
              {...renderZoneProps('pelvis')}
            />
            {/* Tactical Utility Belt Line */}
            <rect x="36" y="96" width="28" height="4" rx="1" fill="rgba(15,23,42,0.85)" stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" pointerEvents="none" />
            {/* Duty Belt Buckle */}
            <rect x="47.5" y="95" width="5" height="6" rx="1" fill="#cbd5e1" stroke="#475569" strokeWidth="0.5" pointerEvents="none" />
          </g>

          {/* --- 5. LEGS (Combat Cargo Pants, Knee Pads & Boots) --- */}
          <g id="zone-legs">
            {/* Left Leg */}
            <path
              d="M 33 120 
                 L 30 152 
                 L 26 186 
                 L 24 195 
                 L 35 195 
                 L 39 184 
                 L 44 153 
                 L 47 126 
                 Z"
              {...renderZoneProps('legs')}
            />
            {/* Left Knee Pad */}
            <path d="M 32 150 L 40 150 L 38 160 L 30 160 Z" fill="rgba(15,23,42,0.7)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" pointerEvents="none" />

            {/* Right Leg */}
            <path
              d="M 67 120 
                 L 70 152 
                 L 74 186 
                 L 76 195 
                 L 65 195 
                 L 61 184 
                 L 56 153 
                 L 53 126 
                 Z"
              {...renderZoneProps('legs')}
            />
            {/* Right Knee Pad */}
            <path d="M 60 150 L 68 150 L 70 160 L 62 160 Z" fill="rgba(15,23,42,0.7)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" pointerEvents="none" />
          </g>

          {/* ================================================================= */}
          {/* IN-ZONE DIRECT HUD DATA CHIPS (Always visible right on the body)  */}
          {/* ================================================================= */}

          {/* Head Chip */}
          {headDmg > 0 && (
            <g transform="translate(50, 27)" pointerEvents="none">
              <rect
                x="-18"
                y="-7"
                width="36"
                height="14"
                rx="4"
                fill="rgba(15, 23, 42, 0.95)"
                stroke={headDmg >= 70 ? '#f43f5e' : '#fb923c'}
                strokeWidth="1.2"
                className="drop-shadow-md"
              />
              <text
                x="0"
                y="3.5"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="8"
                fontWeight="900"
                fontFamily="monospace"
              >
                {headDmg >= 100 ? '💥 100' : `${Math.round(headDmg)}`}
              </text>
            </g>
          )}

          {/* Torso Chip */}
          {torsoDmg > 0 && (
            <g transform="translate(50, 71)" pointerEvents="none">
              <rect
                x="-19"
                y="-7.5"
                width="38"
                height="15"
                rx="4"
                fill="rgba(15, 23, 42, 0.95)"
                stroke={torsoDmg >= 70 ? '#f43f5e' : torsoDmg >= 35 ? '#fb923c' : '#facc15'}
                strokeWidth="1.2"
                className="drop-shadow-md"
              />
              <text
                x="0"
                y="3.8"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="8.5"
                fontWeight="900"
                fontFamily="monospace"
              >
                🛡️ {Math.round(torsoDmg)}
              </text>
            </g>
          )}

          {/* Arms Chip */}
          {armsDmg > 0 && (
            <g transform="translate(82, 80)" pointerEvents="none">
              <rect
                x="-15"
                y="-6.5"
                width="30"
                height="13"
                rx="3.5"
                fill="rgba(15, 23, 42, 0.95)"
                stroke={armsDmg >= 70 ? '#f43f5e' : '#fb923c'}
                strokeWidth="1"
                className="drop-shadow-md"
              />
              <text
                x="0"
                y="3.2"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="7.5"
                fontWeight="900"
                fontFamily="monospace"
              >
                {Math.round(armsDmg)}
              </text>
            </g>
          )}

          {/* Pelvis Chip */}
          {pelvisDmg > 0 && (
            <g transform="translate(50, 110)" pointerEvents="none">
              <rect
                x="-16"
                y="-6.5"
                width="32"
                height="13"
                rx="3.5"
                fill="rgba(15, 23, 42, 0.95)"
                stroke={pelvisDmg >= 70 ? '#f43f5e' : '#fb923c'}
                strokeWidth="1"
                className="drop-shadow-md"
              />
              <text
                x="0"
                y="3.2"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="7.5"
                fontWeight="900"
                fontFamily="monospace"
              >
                {Math.round(pelvisDmg)}
              </text>
            </g>
          )}

          {/* Legs Chip */}
          {legsDmg > 0 && (
            <g transform="translate(50, 156)" pointerEvents="none">
              <rect
                x="-16"
                y="-6.5"
                width="32"
                height="13"
                rx="3.5"
                fill="rgba(15, 23, 42, 0.95)"
                stroke={legsDmg >= 70 ? '#f43f5e' : '#fb923c'}
                strokeWidth="1"
                className="drop-shadow-md"
              />
              <text
                x="0"
                y="3.2"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="7.5"
                fontWeight="900"
                fontFamily="monospace"
              >
                {Math.round(legsDmg)}
              </text>
            </g>
          )}
        </svg>

        {/* Dynamic Hover Tooltip */}
        {showTooltips && activeZoneInfo && (
          <div className="absolute z-30 pointer-events-none px-3.5 py-2 rounded-xl bg-slate-900/95 border border-slate-700 text-white text-xs shadow-2xl backdrop-blur-md -top-12 whitespace-nowrap animate-in fade-in zoom-in-95 duration-150">
            <div className="font-bold text-amber-400 flex items-center gap-1.5">
              <span>{ZONE_ICONS[activeZoneInfo.key]}</span>
              <span>{activeZoneInfo.label}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-200 text-xs font-mono mt-0.5">
              <span className="font-bold text-rose-300">{activeZoneInfo.damage.toFixed(0)} dmg</span>
              {activeZoneInfo.hits > 0 && (
                <span>• {activeZoneInfo.hits} touché{activeZoneInfo.hits > 1 ? 's' : ''}</span>
              )}
              {activeZoneInfo.percent > 0 && (
                <span className="text-slate-400">({activeZoneInfo.percent}%)</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- TACTICAL BREAKDOWN PANEL (No overflow, responsive full width) --- */}
      {showLabels && (
        <div className="mt-3 w-full flex flex-col gap-1.5 min-w-[170px] max-w-full">
          {(['head', 'torso', 'pelvis', 'arms', 'legs'] as BodyZoneKey[]).map((zone) => {
            const dmg = Number(damageByZone[zone]) || 0
            if (dmg <= 0) return null
            const pct = computedTotal > 0 ? Math.round((dmg / computedTotal) * 100) : 0
            const icon = ZONE_ICONS[zone]
            const isHovered = hoveredZone === zone
            return (
              <div
                key={zone}
                onMouseEnter={() => interactive && setHoveredZone(zone)}
                onMouseLeave={() => interactive && setHoveredZone(null)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                  isHovered
                    ? 'bg-amber-500/20 border-amber-500/60 shadow-sm'
                    : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm shrink-0">{icon}</span>
                  <span className="font-semibold text-slate-200 truncate">{ZONE_LABELS[zone]}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 font-mono">
                  <span className="text-slate-400 text-xs">{pct}%</span>
                  <span className="font-bold text-white bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-xs">
                    {Math.round(dmg)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
