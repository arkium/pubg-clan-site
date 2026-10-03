'use client'
import { useState } from 'react'
import { itemIconUrl, resolveItemName } from '@/lib/pubg-assets'

type Size = 'sm' | 'md' | 'lg' | 'xl'

const sizeClass: Record<Size, string> = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
}

type ItemIconProps = {
  id: string
  label?: string
  size?: Size
  className?: string
}

export default function ItemIcon({ id, label, size = 'md', className }: ItemIconProps) {
  const [failed, setFailed] = useState(false)

  if (failed) return null

  const altText = label ?? resolveItemName(id)

  return (
    <img
      src={itemIconUrl(id)}
      alt={altText}
      // Pas de `pubg-icon-filter` : il noircit en thème clair les icônes blanches des armes, mais les icônes d'objets
      // sont des rendus en couleur (« jamais recolorées », docs/ui/index.html) — elles devenaient des silhouettes noires.
      className={['shrink-0 object-contain', sizeClass[size], className ?? ''].filter(Boolean).join(' ')}
      onError={() => setFailed(true)}
    />
  )
}
