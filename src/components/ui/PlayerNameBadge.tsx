type PlayerNameBadgeProps = {
  name: string
  className?: string
  title?: string
}

export default function PlayerNameBadge({ name, className, title }: PlayerNameBadgeProps) {
  return (
    <span
      className={['app-player-name-badge', className ?? ''].filter(Boolean).join(' ')}
      title={title ?? name}
    >
      {name}
    </span>
  )
}