import Image from 'next/image'

export type TeamMode = 'duo' | 'trio' | 'squad'

type TeamModeBadgeProps = {
  mode: TeamMode
  label?: string
  size?: 'xs' | 'sm'
  className?: string
}

function modeLabel(mode: TeamMode) {
  if (mode === 'duo') {
    return 'Duo'
  }

  if (mode === 'trio') {
    return 'Trio'
  }

  return 'Squad'
}

function modeIconPath(mode: TeamMode) {
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
  const sizeClass = size === 'sm' ? 'app-team-mode-badge--sm' : 'app-team-mode-badge--xs'

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
    >
      <Image src={modeIconPath(mode)} alt={`Logo ${modeLabel(mode)}`} width={14} height={14} className="squad-mode-icon" />
      <span>{label ?? modeLabel(mode)}</span>
    </span>
  )
}