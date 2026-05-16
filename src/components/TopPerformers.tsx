import type { PerformerEntry, TopPerformersData } from '@/types/squad-matches'

interface TopPerformersProps {
  performers: TopPerformersData
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
          {entries.map((entry) => (
            <li key={entry.memberId} className="flex items-center justify-between gap-2">
              <span className="font-medium text-gray-900">{entry.displayName}</span>
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
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Top performers</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <PerformerList
          title="Top Kills"
          entries={performers.kills}
          value={(entry) => `${entry.totalKills} kills`}
        />
        <PerformerList
          title="Top Damage"
          entries={performers.damage}
          value={(entry) => `${Math.round(entry.totalDamage)} dmg`}
        />
        <PerformerList
          title="Top Survie"
          entries={performers.survival}
          value={(entry) => `Placement moyen ${entry.averagePlacement.toFixed(2)}`}
        />
      </div>
    </section>
  )
}
