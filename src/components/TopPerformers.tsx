import RankCell from '@/components/ui/RankCell'
import Link from 'next/link'
import { useState } from 'react'
import { Crosshair, Flame, HeartPulse, type LucideIcon } from 'lucide-react'
import PlacementBadge from '@/components/ui/PlacementBadge'
import ShowMoreToggle from '@/components/ui/ShowMoreToggle'

import type { PerformerEntry, TopPerformersData } from '@/types/squad-matches'
import type { ReactNode } from 'react'

interface TopPerformersProps {
  performers: TopPerformersData
}

/**
 * Une liste du podium : icône à la couleur de son thème (charte : combat négatif, dégâts accent, survie positif, comme
 * les fiches de carrière), rangs par `RankCell`, valeurs en chiffres tabulaires. Aucune couleur en dur.
 */
function PerformerList({
  title,
  icon: Icon,
  iconClass,
  entries,
  value,
}: {
  title: string
  icon: LucideIcon
  iconClass: string
  entries: PerformerEntry[]
  value(entry: PerformerEntry): ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const visibleEntries = expanded ? entries : entries.slice(0, 3)

  return (
    <section className="app-panel flex flex-col gap-2.5 p-3.5" aria-label={title}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
        <h3 className="t-card-title">{title}</h3>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-gray-500">Aucune donnée disponible.</p>
      ) : (
        <>
          <ol className="flex flex-col">
            {visibleEntries.map((entry, index) => (
              <li key={entry.memberId} className="flex min-h-8 items-center gap-2 border-t border-gray-200 py-1 text-[13px] first:border-t-0">
                <span className="flex w-5 shrink-0 justify-center">
                  <RankCell rank={index + 1} size="xs" />
                </span>
                <Link
                  href={`/members/${entry.memberId}/dashboard`}
                  className={`min-w-0 flex-1 truncate text-gray-900 transition-colors hover:text-[var(--theme-ui-accent-text)] ${index === 0 ? 'font-bold' : ''}`}
                >
                  {entry.displayName}
                </Link>
                <span className="t-num shrink-0 font-bold text-gray-900">{value(entry)}</span>
              </li>
            ))}
          </ol>
          {entries.length > 3 && (
            <ShowMoreToggle expanded={expanded} onToggle={() => setExpanded((prev) => !prev)} />
          )}
        </>
      )}
    </section>
  )
}

export default function TopPerformers({ performers }: TopPerformersProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="t-section-title">Podium des performances</h2>
        <p className="t-meta">
          Classement des membres du clan sur les éliminations, les dégâts infligés et la meilleure survie moyenne.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PerformerList
          title="Top éliminations"
          icon={Crosshair}
          iconClass="t-neg"
          entries={performers.kills}
          value={(entry) => entry.totalKills}
        />
        <PerformerList
          title="Top dégâts"
          icon={Flame}
          iconClass="t-accent"
          entries={performers.damage}
          value={(entry) => Math.round(entry.totalDamage).toLocaleString('fr-FR')}
        />
        <PerformerList
          title="Top survie"
          icon={HeartPulse}
          iconClass="t-pos"
          entries={performers.survival}
          value={(entry) => <PlacementBadge placement={entry.averagePlacement} />}
        />
      </div>
    </div>
  )
}
