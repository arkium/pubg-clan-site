import Image from 'next/image'

export type TeamMode = 'solo' | 'duo' | 'trio' | 'squad'

type TeamModeBadgeProps = {
  mode: TeamMode
  label?: string
  size?: 'xxs' | 'xs' | 'sm'
  className?: string
}

function modeLabel(mode: TeamMode) {
  if (mode === 'solo') {
    return 'Solo'
  }

  if (mode === 'duo') {
    return 'Duo'
  }

  if (mode === 'trio') {
    return 'Trio'
  }

  return 'Squad'
}

function modeIconPath(mode: TeamMode) {
  if (mode === 'solo') {
    return '/icons/squads/solo.svg'
  }

  if (mode === 'duo') {
    return '/icons/squads/duo.svg'
  }

  if (mode === 'trio') {
    return '/icons/squads/trio.svg'
  }

  return '/icons/squads/squad.svg'
}

export function teamModeFromMemberCount(memberCount: number): TeamMode {
  if (memberCount <= 2) {
    return 'duo'
  }

  if (memberCount === 3) {
    return 'trio'
  }

  return 'squad'
}

export default function TeamModeBadge({ mode, label, size = 'xs', className }: TeamModeBadgeProps) {
  const sizeClass =
    size === 'sm'
      ? 'app-team-mode-badge--sm'
      : size === 'xxs'
        ? 'app-team-mode-badge--xxs'
        : 'app-team-mode-badge--xs'
  const resolvedLabel = label ?? modeLabel(mode)

  return (
    <span
      className={[
        'app-team-mode-badge',
        `app-team-mode-badge--${mode}`,
        sizeClass,
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={resolvedLabel}
    >
      <Image src={modeIconPath(mode)} alt={`Logo ${resolvedLabel}`} width={16} height={16} className="squad-mode-icon" />
      {size === 'xxs' ? <span className="sr-only">{resolvedLabel}</span> : <span>{resolvedLabel}</span>}
    </span>
  )
}