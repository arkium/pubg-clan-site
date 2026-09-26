import Image from 'next/image'
import Link from 'next/link'

import RankCell from '@/components/ui/RankCell'
import { DISTINCTION_BADGE_META, type DistinctionBadgeKey } from '@/lib/distinction-badges'

export type PodiumEntry = {
  key: string | number
  name: string
  href?: string
  avatarUrl?: string | null
  /** Sous-ligne : « 30 matchs · 2,00 K/M ». */
  subline: string
  /** Valeur du critère trié, déjà formatée. */
  value: string
  distinctions?: DistinctionBadgeKey[]
}

function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?'
}

/**
 * Top 3 du critère trié (docs/ui/composants-refonte.md, `PodiumCards`). Masqué sur mobile : la liste porte
 * déjà le rang.
 */
export default function PodiumCards({ entries, metricLabel }: { entries: PodiumEntry[]; metricLabel: string }) {
  if (entries.length === 0) return null

  return (
    <div className="hidden gap-3 md:grid md:grid-cols-3">
      {entries.slice(0, 3).map((entry, index) => (
        <article key={entry.key} className="app-panel flex flex-col gap-3.5 px-[18px] py-4">
          <div className="flex items-center justify-between gap-2">
            <RankCell rank={index + 1} size="md" />
            <span className="flex items-center gap-1">
              {(entry.distinctions ?? []).map((key) => (
                <Image
                  key={key}
                  src={DISTINCTION_BADGE_META[key].iconPath}
                  alt={DISTINCTION_BADGE_META[key].shortLabel}
                  title={DISTINCTION_BADGE_META[key].shortLabel}
                  width={20}
                  height={20}
                />
              ))}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="app-avatar flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold">
              {entry.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatars externes (Steam, Discord)
                <img src={entry.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(entry.name)
              )}
            </span>
            <div className="min-w-0">
              {entry.href ? (
                <Link href={entry.href} className="block truncate text-[15px] font-bold text-gray-900 hover:underline">
                  {entry.name}
                </Link>
              ) : (
                <p className="truncate text-[15px] font-bold text-gray-900">{entry.name}</p>
              )}
              <p className="mt-0.5 truncate text-xs text-gray-500">{entry.subline}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-2xl font-bold leading-none tabular-nums text-gray-900">{entry.value}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--theme-ui-accent)]">
                {metricLabel}
              </p>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
