import RankCell from '@/components/ui/RankCell'
import type { CareerMetricResult } from '@/lib/clan-career'

/**
 * Une statistique de carrière : valeur du clan, ce qu'elle compte (Total, Moyenne, Record, Moins = mieux, Mur de la
 * honte) et les trois joueurs en tête, médailles `RankCell`.
 */
export default function CareerMetricCard({ result }: { result: CareerMetricResult }) {
  const { metric, tag, value, top, missing } = result
  const shame = metric.order === 'shame'
  const reverse = metric.order === 'lower'
  return (
    <article
      className={`app-panel flex flex-col gap-2.5 p-3.5 ${shame ? 'border-rose-400/40!' : ''}`}
      aria-label={metric.label}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-bold text-gray-700">{metric.label}</span>
          <b className="text-[22px] font-black tracking-[-0.02em] tabular-nums text-gray-900">
            {value === null ? '–' : metric.format(value)}
          </b>
          {metric.note && value !== null ? <span className="text-[11px] text-gray-500">{metric.note}</span> : null}
        </span>
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] ${
            shame
              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
              : reverse
                ? 'bg-[var(--theme-ui-accent-soft)] text-[var(--theme-ui-accent-text)]'
                : 'app-panel-muted text-gray-500'
          }`}
        >
          {tag}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-2.5">
        {top.length === 0 ? (
          <span className="text-xs text-gray-500">Disponible après la prochaine synchro PUBG</span>
        ) : (
          top.map((entry, index) => (
            <div key={entry.memberId} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
              <RankCell rank={index + 1} size="xs" />
              <span className={`truncate text-gray-900 ${index === 0 ? 'font-bold' : ''}`}>{entry.displayName}</span>
              <span className="tabular-nums text-gray-700">{metric.format(entry.value)}</span>
            </div>
          ))
        )}
        {missing > 0 && top.length > 0 ? (
          <span className="text-[11px] text-gray-500">
            {missing} joueur{missing > 1 ? 's' : ''} en attente de synchro
          </span>
        ) : null}
      </div>
    </article>
  )
}
