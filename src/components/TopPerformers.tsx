import Image from 'next/image'

import type { PerformerEntry, TopPerformersData } from '@/types/squad-matches'

interface TopPerformersProps {
  performers: TopPerformersData
}

const MEDAL_ICONS = ['/icons/medal-gold.svg', '/icons/medal-silver.svg', '/icons/medal-bronze.svg']

function medalAlt(index: number) {
  if (index === 0) {
    return 'Medaille or'
  }

  if (index === 1) {
    return 'Medaille argent'
  }

  return 'Medaille bronze'
}

function PerformerList({
  title,
  entries,
  value,
}: {
  title: string
  entries: PerformerEntry[]
  value(entry: PerformerEntry): string
}) {
  return (
    <div className="rounded border border-gray-200 p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-600">Aucune donnée disponible.</p>
      ) : (
        <ol className="space-y-2 text-xs">
          {entries.map((entry, index) => (
            <li key={entry.memberId} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium text-gray-900">
                {index < MEDAL_ICONS.length ? (
                  <Image src={MEDAL_ICONS[index]} alt={medalAlt(index)} width={16} height={16} />
                ) : null}
                {entry.displayName}
              </span>
              <span className="text-gray-700">{value(entry)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function TopPerformers({ performers }: TopPerformersProps) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Meilleures performances</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <PerformerList
          title="Top éliminations"
          entries={performers.kills}
          value={(entry) => `${entry.totalKills} éliminations`}
        />
        <PerformerList
          title="Top dégâts"
          entries={performers.damage}
          value={(entry) => `${Math.round(entry.totalDamage)} dégâts`}
        />
        <PerformerList
          title="Top survie"
          entries={performers.survival}
          value={(entry) => `#${entry.averagePlacement.toFixed(2)}`}
        />
      </div>
    </section>
  )
}
