import Link from 'next/link'

type PlayerNameBadgeProps = {
  name: string
  memberId?: number
  className?: string
  title?: string
}

export default function PlayerNameBadge({ name, memberId, className, title }: PlayerNameBadgeProps) {
  const combinedClassName = ['app-player-name-badge', className ?? ''].filter(Boolean).join(' ')
  
  if (memberId) {
    return (
      <Link href={`/members/${memberId}/dashboard`} className={`${combinedClassName} hover:bg-emerald-100 hover:text-emerald-700 transition-colors`} title={title ?? name}>
        {name}
      </Link>
    )
  }

  return (
    <span
      className={combinedClassName}
      title={title ?? name}
    >
      {name}
    </span>
  )
}