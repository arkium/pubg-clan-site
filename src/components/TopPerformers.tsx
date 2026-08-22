import Image from 'next/image'
import Link from 'next/link'
import { Target, Flame, HeartPulse } from 'lucide-react'
import PlacementBadge from '@/components/ui/PlacementBadge'

import type { PerformerEntry, TopPerformersData } from '@/types/squad-matches'
import type { ReactNode } from 'react'

interface TopPerformersProps {
  performers: TopPerformersData
}

const MEDAL_ICONS = ['/icons/medal-gold.svg', '/icons/medal-silver.svg', '/icons/medal-bronze.svg']

function medalAlt(index: number) {
  if (index === 0) return 'Medaille or'
  if (index === 1) return 'Medaille argent'
  return 'Medaille bronze'
}

function PerformerList({
  title,
  icon: Icon,
  entries,
  value,
  toneClass,
  valueClass,
}: {
  title: string
  icon: any
  entries: PerformerEntry[]
  value(entry: PerformerEntry): ReactNode
  toneClass: string
  valueClass: string
}) {
  return (
    <div className={`app-panel p-3 transition-all hover:shadow-md ${toneClass}`}>
      <div className="mb-3 flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${valueClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs italic text-gray-500">Aucune donnée disponible.</p>
      ) : (
        <ol className="space-y-2 text-sm">
          {entries.map((entry, index) => (
            <li key={entry.memberId} className="flex min-h-6 items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold text-gray-900">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {index < MEDAL_ICONS.length ? (
                    <Image src={MEDAL_ICONS[index]} alt={medalAlt(index)} width={16} height={16} className="drop-shadow-sm" />
                  ) : (
                    <span className="text-xs font-bold text-gray-500">{index + 1}</span>
                  )}
                </span>
                <Link href={`/members/${entry.memberId}/dashboard`} className="hover:text-emerald-500 transition-colors">
                  {entry.displayName}
                </Link>
              </span>
              <span className={`inline-flex items-center font-bold tabular-nums ${valueClass}`}>
                {value(entry)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function TopPerformers({ performers }: TopPerformersProps) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-gray-700">Podium des performances</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PerformerList
          title="Top Éliminations"
          icon={Target}
          entries={performers.kills}
          value={(entry) => entry.totalKills}
          toneClass="hover:border-red-500"
          valueClass="text-red-500 bg-red-500/10"
        />
        <PerformerList
          title="Top Dégâts"
          icon={Flame}
          entries={performers.damage}
          value={(entry) => Math.round(entry.totalDamage).toLocaleString('fr-FR')}
          toneClass="hover:border-orange-500"
          valueClass="text-orange-500 bg-orange-500/10"
        />
        <PerformerList
          title="Top Survie"
          icon={HeartPulse}
          entries={performers.survival}
          value={(entry) => <PlacementBadge placement={entry.averagePlacement} />}
          toneClass="hover:border-emerald-500"
          valueClass="text-emerald-500 bg-emerald-500/10"
        />
      </div>
    </section>
  )
}
