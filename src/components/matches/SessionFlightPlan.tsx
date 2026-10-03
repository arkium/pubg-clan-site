'use client'

import { ChevronLeft, ChevronRight, Crown } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'

import PlacementBadge from '@/components/ui/PlacementBadge'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import { mapAssetUrl } from '@/lib/pubg-assets'
import { formatPlayTime, modeBreakdown, type TeamModeKey } from '@/lib/match-sessions'
import { paginate } from '@/lib/pagination'
import type { SquadMatch } from '@/types/squad-matches'

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const MODE_COLORS: Record<TeamModeKey, string> = { duo: 'var(--game-sky)', trio: 'var(--game-violet)', squad: 'var(--game-pos)' }

/** Étapes par page : 4 sous 640 px, 7 jusqu'à 1 023 px, 10 au-delà — une étape garde ~84 px, sa carte et sa place. */
const PAGE_SIZE_QUERIES = [
  { query: '(max-width: 639px)', size: 4 },
  { query: '(max-width: 1023px)', size: 7 },
] as const
const DESKTOP_PAGE_SIZE = 10

function subscribePageSize(onChange: () => void) {
  const queries = PAGE_SIZE_QUERIES.map(({ query }) => window.matchMedia(query))
  queries.forEach((query) => query.addEventListener('change', onChange))
  return () => queries.forEach((query) => query.removeEventListener('change', onChange))
}

function usePageSize() {
  return useSyncExternalStore(
    subscribePageSize,
    () => PAGE_SIZE_QUERIES.find(({ query }) => window.matchMedia(query).matches)?.size ?? DESKTOP_PAGE_SIZE,
    () => DESKTOP_PAGE_SIZE
  )
}

/**
 * Plan de vol de la soirée : une étape par partie, reliées en pointillés comme la trajectoire de l'avion
 * (miniature de carte, heure, place, couronne sur un top 1). Un clic met la partie en avant dans la liste.
 * Jamais de défilement horizontal (charte) : au-delà d'une page, les étapes se paginent par chevrons ‹ ›.
 */
export default function SessionFlightPlan({
  matches,
  mapLabels,
  selectedId,
  onSelect,
  start,
  end,
}: {
  /** Parties dans l'ordre du jeu. */
  matches: SquadMatch[]
  mapLabels: Record<string, string>
  selectedId: string | null
  onSelect: (matchId: string) => void
  start: string | null
  end: string | null
}) {
  const modes = modeBreakdown(matches)
  const totalSeconds = matches.reduce((sum, match) => sum + match.durationSeconds, 0)
  const pageSize = usePageSize()
  const [page, setPage] = useState(1)
  const { current, pageCount, start: first, visible } = paginate(matches, page, pageSize)
  const paged = pageCount > 1
  return (
    <section className="app-panel flex flex-col gap-3 px-4 pb-4 pt-3.5" aria-labelledby="flight-plan-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <h2 id="flight-plan-title" className="t-card-title m-0">
          Plan de vol de la soirée
        </h2>
        <span className="t-meta t-num">
          {start && end ? `${timeFormat.format(new Date(start))} → ${timeFormat.format(new Date(end))} · ` : ''}
          {paged ? `parties ${first + 1}–${first + visible.length} sur ${matches.length}` : 'une étape par partie'}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {paged ? (
          <button
            type="button"
            className="app-pager-button shrink-0"
            onClick={() => setPage(current - 1)}
            disabled={current === 1}
            aria-label="Parties précédentes"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <ol className="relative grid min-w-0 flex-1 gap-1 pb-1" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}>
          <span
            className="absolute top-[37px] border-t-2 border-dashed sm:top-[44px]"
            style={{ left: `${50 / visible.length}%`, right: `${50 / visible.length}%`, borderColor: 'var(--game-track-strong)' }}
            aria-hidden="true"
          />
          {visible.map((match) => {
            const selected = match.id === selectedId
            const image = mapAssetUrl(match.mapName)
            const mapLabel = mapLabels[match.mapName] ?? match.mapName
            return (
              <li key={match.id} className="relative flex min-w-0 justify-center">
                <button
                  type="button"
                  onClick={() => onSelect(match.id)}
                  aria-pressed={selected}
                  aria-label={`${timeFormat.format(new Date(match.createdAt))} · ${mapLabel} · place ${match.placement}${match.isWin ? ' · top 1' : ''}`}
                  className="flex min-w-0 max-w-full flex-col items-center gap-1.5 rounded-lg px-1 py-0.5"
                >
                  <span className="t-num text-[11px] text-gray-500">{timeFormat.format(new Date(match.createdAt))}</span>
                  <span
                    className="bg-photo-fallback relative block h-[34px] w-[34px] rounded-full bg-cover bg-center sm:h-12 sm:w-12"
                    style={{
                      backgroundImage: image ? `url('${image}')` : undefined,
                      boxShadow: `0 0 0 3px ${selected ? 'var(--theme-ui-accent)' : match.isWin ? 'var(--game-gold)' : 'var(--theme-ui-surface)'}${
                        selected ? ', 0 0 0 7px var(--theme-ui-accent-soft)' : ''
                      }`,
                    }}
                  >
                    {match.isWin && (
                      <Crown className="absolute -top-[9px] left-1/2 -ml-2 h-4 w-4" style={{ color: 'var(--game-gold)' }} aria-hidden="true" />
                    )}
                  </span>
                  <PlacementBadge placement={match.placement} />
                  <span className="hidden max-w-full truncate text-[11px] text-gray-700 sm:block">
                    {mapLabel} · {match.totalKills} K
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        {paged ? (
          <button
            type="button"
            className="app-pager-button shrink-0"
            onClick={() => setPage(current + 1)}
            disabled={current === pageCount}
            aria-label="Parties suivantes"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {modes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {modes.map((mode) => (
              <span key={mode.mode} style={{ flex: mode.games, background: MODE_COLORS[mode.mode] }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-gray-700">
            {modes.map((mode) => (
              <li key={mode.mode} className="inline-flex items-center gap-1.5">
                <TeamModeBadge mode={mode.mode} size="xs" />
                <b className="t-num text-gray-900">{mode.games}</b>
                <span className="text-gray-500">
                  · {mode.kills} K · {mode.wins > 0 ? `${mode.wins} top 1` : 'pas de top 1'}
                </span>
              </li>
            ))}
            <li className="t-num ml-auto text-gray-500">{formatPlayTime(totalSeconds)} de jeu</li>
          </ul>
        </div>
      )}
    </section>
  )
}
