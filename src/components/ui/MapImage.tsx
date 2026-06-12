'use client'
import { useState } from 'react'

type MapImageProps = {
  mapKey: string
  alt?: string
  className?: string
}

export default function MapImage({ mapKey, alt, className }: MapImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed) return null

  return (
    <img
      src={`/maps/pubg/${mapKey}.webp`}
      alt={alt ?? mapKey}
      className={['shrink-0 rounded object-cover', className ?? ''].filter(Boolean).join(' ')}
      onError={() => setFailed(true)}
    />
  )
}
