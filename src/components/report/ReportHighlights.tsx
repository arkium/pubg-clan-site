import type { ReportHighlightsData } from '@/types/reports'

function HighlightCard({
  label,
  emoji,
  entry,
}: {
  label: string
  emoji: string
  entry: ReportHighlightsData[keyof ReportHighlightsData]
}) {
  return (
    <article className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {entry ? (
        <>
          <p className="text-base font-bold text-gray-900">
            {emoji} {entry.displayName}
          </p>
          <p className="mt-1 text-sm text-blue-700">{entry.subtitle}</p>
        </>
      ) : (
        <p className="text-sm text-gray-500">Aucune donnée</p>
      )}
    </article>
  )
}

export default function ReportHighlights({ highlights }: { highlights: ReportHighlightsData }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-gray-900">Highlights</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HighlightCard label="Top Killer" emoji="🔥" entry={highlights.topKiller} />
        <HighlightCard label="Top Damage" emoji="💥" entry={highlights.topDamage} />
        <HighlightCard label="Best Win Rate" emoji="🎯" entry={highlights.bestWinRate} />
        <HighlightCard label="MVP" emoji="🏆" entry={highlights.mvp} />
      </div>
    </section>
  )
}
