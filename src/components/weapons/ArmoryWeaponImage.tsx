'use client'

import { useState } from 'react'

import { vehicleIconUrl, weaponIconUrl, weaponWhiteIconUrl } from '@/lib/pubg-assets'
import { isVehicleKey } from '@/lib/pubg-assets/vehicle-detection'

/** Hauteur de la silhouette blanche par emplacement ; la largeur suit la longueur réelle de l'arme. */
const SILHOUETTE_HEIGHT = {
  row: 'h-5',
  showcase: 'h-[52px] lg:h-[60px]',
  rack: 'h-[30%]',
  /** Cadre de hauteur fixe d'une carte ou d'une vitrine compacte (page Armes d'un joueur) : tout suit la hauteur du cadre. */
  card: 'h-[70%]',
} as const

/** Icône carrée (240×240, arme en diagonale) quand l'arme n'a pas de silhouette : mêlée, explosifs, véhicules. */
const SQUARE_SIZE = {
  row: 'h-7 w-14',
  showcase: 'h-[calc(100%-72px)] w-[76%]',
  rack: 'h-[52%] w-[80%]',
  card: 'h-full w-auto',
} as const

type Variant = keyof typeof SILHOUETTE_HEIGHT

/**
 * Icône d'une arme de l'armurerie. D'abord la silhouette blanche (`_w.png`) : à hauteur fixe, un pistolet reste plus
 * court qu'un fusil, dans les proportions du jeu. Sans silhouette, l'icône carrée ; sans icône, rien (pas de cadre vide).
 * `onDark` : sur les vitrines sombres l'icône reste blanche, sinon elle suit le thème (`pubg-icon-filter`, noire en clair).
 * Le composant se centre dans le bloc positionné qui le contient (tableau : une case de largeur fixe).
 */
export default function ArmoryWeaponImage({
  id,
  alt = '',
  onDark = false,
  variant,
}: {
  id: string
  alt?: string
  onDark?: boolean
  variant: Variant
}) {
  const vehicle = isVehicleKey(id)
  const [failed, setFailed] = useState<{ id: string; stage: 'white' | 'square' } | null>(null)
  const failedStage = failed?.id === id ? failed.stage : null
  const stage = failedStage === 'square' ? 'none' : vehicle || failedStage === 'white' ? 'square' : 'white'
  if (stage === 'none') return null

  const src = vehicle ? vehicleIconUrl(id) : stage === 'white' ? weaponWhiteIconUrl(id) : weaponIconUrl(id)
  const size =
    stage === 'white'
      ? `${SILHOUETTE_HEIGHT[variant]} w-auto ${variant === 'row' ? 'max-w-full' : 'max-w-[84%]'} object-contain`
      : `${SQUARE_SIZE[variant]} object-contain`
  const place =
    variant === 'row'
      ? ''
      : `absolute left-1/2 -translate-x-1/2 -translate-y-1/2 ${variant === 'rack' ? 'top-[45%]' : variant === 'card' ? 'top-1/2' : 'top-[48%]'}`
  const shadow = onDark ? 'drop-shadow-[0_6px_10px_rgba(0,0,0,0.5)]' : 'pubg-icon-filter'

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={`${place} ${size} ${shadow}`.trim()}
      onError={() => setFailed({ id, stage: stage === 'white' ? 'white' : 'square' })}
    />
  )
}
