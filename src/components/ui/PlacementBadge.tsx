type PlacementBadgeProps = {
  placement: number
  label?: string
  className?: string
}

function getPlacementTone(placement: number) {
  if (placement <= 1) {
    return 'app-placement-badge--winner'
  }

  if (placement <= 5) {
    return 'app-placement-badge--top5'
  }

  if (placement <= 10) {
    return 'app-placement-badge--top10'
  }

  return 'app-placement-badge--default'
}

export default function PlacementBadge({ placement, label, className }: PlacementBadgeProps) {
  const roundedPlacement = Math.max(1, Math.round(placement))
  const toneClass = getPlacementTone(roundedPlacement)

  return <span className={['app-placement-badge', toneClass, className ?? ''].filter(Boolean).join(' ')}>{label ?? `#${roundedPlacement}`}</span>
}