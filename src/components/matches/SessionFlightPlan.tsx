import { Crown } from 'lucide-react'

import PlacementBadge from '@/components/ui/PlacementBadge'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import { mapAssetUrl } from '@/lib/pubg-assets'
import { formatPlayTime, modeBreakdown, type TeamModeKey } from '@/lib/match-sessions'
import type { SquadMatch } from '@/types/squad-matches'

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const MODE_COLORS: Record<TeamModeKey, string> = { duo: 'var(--game-sky)', trio: 'var(--game-violet)', squad: 'var(--game-pos)' }

/**
 * Plan de vol de la soirée : une étape par partie, reliées en pointillés comme la trajectoire de l'avion
 * (miniature de carte, heure, place, couronne sur un top 1). Un clic met la partie en avant dans la liste.
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
  return (
    <section className="app-panel flex flex-col gap-3 px-4 pb-4 pt-3.5" aria-labelledby="flight-plan-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <h2 id="flight-plan-title" className="m-0 text-base font-bold">
          Plan de vol de la soirée
        </h2>
        <span className="text-xs tabular-nums text-gray-500">
          {start && end ? `${timeFormat.format(new Date(start))} → ${timeFormat.format(new Date(end))} · ` : ''}une étape par partie
        </span>
      </div>

      <div className="overflow-x-auto">
        <ol
          className="relative grid gap-1 pb-1"
          style={{ gridTemplateColumns: `repeat(${matches.length}, minmax(84px, 1fr))`, minWidth: matches.length * 84 }}
        >
          <span
            className="absolute top-[37px] border-t-2 border-dashed sm:top-[44px]"
            style={{ left: `${50 / matches.length}%`, right: `${50 / matches.length}%`, borderColor: 'var(--game-track-strong)' }}
            aria-hidden="true"
          />
          {matches.map((match) => {
            const selected = match.id === selectedId
            const image = mapAssetUrl(match.mapName)
            const mapLabel = mapLabels[match.mapName] ?? match.mapName
            return (
              <li key={match.id} className="relative flex justify-center">
                <button
                  type="button"
                  onClick={() => onSelect(match.id)}
                  aria-pressed={selected}
                  aria-label={`${timeFormat.format(new Date(match.createdAt))} · ${mapLabel} · place ${match.placement}${match.isWin ? ' · top 1' : ''}`}
                  className="flex flex-col items-center gap-1.5 rounded-lg px-1 py-0.5"
                >
                  <span className="text-[11px] tabular-nums text-gray-500">{timeFormat.format(new Date(match.createdAt))}</span>
                  <span
                    className="relative block h-[34px] w-[34px] rounded-full bg-cover bg-center sm:h-12 sm:w-12"
                    style={{
                      backgroundColor: '#0b1120',
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
                  <span className="hidden max-w-[80px] truncate text-[11px] text-gray-700 sm:block">
                    {mapLabel} · {match.totalKills} K
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
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
                <b className="text-gray-900">{mode.games}</b>
                <span className="text-gray-500">
                  · {mode.kills} K · {mode.wins > 0 ? `${mode.wins} top 1` : 'pas de top 1'}
                </span>
              </li>
            ))}
            <li className="ml-auto text-gray-500">{formatPlayTime(totalSeconds)} de jeu</li>
          </ul>
        </div>
      )}
    </section>
  )
}
