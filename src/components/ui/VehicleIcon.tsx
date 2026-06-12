'use client'
import { useState } from 'react'
import { vehicleIconUrl, resolveVehicleName } from '@/lib/pubg-assets'

type Size = 'sm' | 'md' | 'lg'

const sizeClass: Record<Size, string> = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

type VehicleIconProps = {
  id: string
  label?: string
  size?: Size
  className?: string
}

export default function VehicleIcon({ id, label, size = 'md', className }: VehicleIconProps) {
  const [failed, setFailed] = useState(false)

  if (failed) return null

  const altText = label ?? resolveVehicleName(id)

  return (
    <img
      src={vehicleIconUrl(id)}
      alt={altText}
      className={['pubg-icon-filter shrink-0 object-contain', sizeClass[size], className ?? ''].filter(Boolean).join(' ')}
      onError={() => setFailed(true)}
    />
  )
}
