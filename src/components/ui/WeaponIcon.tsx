'use client'
import { useState } from 'react'
import { weaponIconUrl, resolveWeaponName } from '@/lib/pubg-assets'

type Size = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

const sizeClass: Record<Size, string> = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
  '2xl': 'h-16 w-16',
}

type WeaponIconProps = {
  id: string
  label?: string
  size?: Size
  className?: string
}

export default function WeaponIcon({ id, label, size = 'md', className }: WeaponIconProps) {
  const [failed, setFailed] = useState(false)

  if (failed) return null

  const altText = label ?? resolveWeaponName(id)

  return (
    <img
      src={weaponIconUrl(id)}
      alt={altText}
      className={['pubg-icon-filter shrink-0 object-contain', sizeClass[size], className ?? ''].filter(Boolean).join(' ')}
      onError={() => setFailed(true)}
    />
  )
}
