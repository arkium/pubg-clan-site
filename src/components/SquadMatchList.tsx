import PlacementBadge from '@/components/ui/PlacementBadge'
import PlayerNameBadge from '@/components/ui/PlayerNameBadge'
import TeamModeBadge, { teamModeFromMemberCount } from '@/components/ui/TeamModeBadge'

import type { SquadMatch, SquadPeriod } from '@/types/squad-matches'

interface SquadMatchListProps {
  clanId: number
  period: SquadPeriod
  matches: SquadMatch[]
  mapLabels: Record<string, string>
  title?: string
  description?: string
  emptyMessage?: string
  limit?: number
  selectable?: boolean
  selectedMatchIds?: string[]
  onToggleMatchSelection?: (matchId: string) => void
}

function formatMatchDate(value: string) {
  const date = new Date(value)
  return date.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatMatchDay(value: string) {
  const date = new Date(value)
  return date.toLocaleDateString('fr-FR', {
    dateStyle: 'medium',
  })
}

function formatMatchTime(value: string) {
  const date = new Date(value)
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resultTone(isWin: boolean) {
  return isWin
    ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
    : 'border-rose-200 bg-rose-100 text-rose-900'
}

function telemetryTone(status: 'success' | 'failed' | 'pending') {
  if (status === 'success') {
    return 'border-emerald-200 bg-emerald-100 text-emerald-900'
  }

  if (status === 'failed') {
    return 'border-rose-200 bg-rose-100 text-rose-900'
  }

  return 'border-amber-200 bg-amber-100 text-amber-900'
}

function telemetryLabel(status: 'success' | 'failed' | 'pending') {
  if (status === 'success') {
    return 'Télémétrie OK'
  }

  if (status === 'failed') {
    return 'Télémétrie KO'
  }

  return 'Télémétrie en attente'
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

export default function SquadMatchList({
  clanId,
  period,
  matches,
  mapLabels,
  title = 'Derniers matchs ensemble',
  description,
  emptyMessage,
  limit = 10,
  selectable = false,
  selectedMatchIds,
  onToggleMatchSelection,
}: SquadMatchListProps) {
  const latestMatches = matches.slice(0, limit)
  const selectedIds = new Set(selectedMatchIds ?? [])

  if (latestMatches.length === 0) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-600">
          {emptyMessage ?? `Aucun match en squad pour le clan #${clanId} sur la période ${period === 'week' ? 'semaine' : 'mois'}.`}
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-xs text-gray-600">
            {description ?? `Cartes synthétiques des ${latestMatches.length} dernières parties détectées pour le clan #${clanId}.`}
          </p>
        </div>
        <p className="app-meta-pill">
          {latestMatches.length} match{latestMatches.length > 1 ? 's' : ''}
        </p>
      </div>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {latestMatches.map((match) => {
          const teamMode = teamModeFromMemberCount(match.members.length)
          const memberNames = match.members.map((member) => member.displayName)
          const telemetryStatus = match.telemetry?.status ?? 'pending'

          return (
            <li
              key={match.id}
              className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition duration-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {selectable ? (
                    <label className="mb-2 inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedIds.has(match.id)}
                        onChange={() => onToggleMatchSelection?.(match.id)}
                      />
                      Sélectionner ce match
                    </label>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="inline-flex rounded-full border border-gray-200 bg-white px-2.5 py-1 text-sm font-semibold text-gray-900 shadow-sm">
                      {formatMatchDay(match.createdAt)}
                    </span>
                    <span className="inline-flex rounded-full border border-gray-200 bg-white px-2.5 py-1 text-sm font-semibold text-gray-900 shadow-sm">
                      {formatMatchTime(match.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <TeamModeBadge mode={teamMode} className="shadow-sm" />
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${resultTone(match.isWin)}`}>
                    {match.isWin ? 'Victoire' : 'Défaite'}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${telemetryTone(telemetryStatus)}`}>
                    {telemetryLabel(telemetryStatus)}
                  </span>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-2 text-center">
                <p className="mt-0.5 text-sm font-semibold leading-5 text-gray-900">{mapLabels[match.mapName] ?? match.mapName}</p>
                <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">{match.gameMode}</p>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-center">
                  <dt className="text-[9px] uppercase tracking-wide text-gray-500">Éliminations</dt>
                  <dd className="mt-0.5 text-base font-bold text-gray-900">{match.totalKills}</dd>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-center">
                  <dt className="text-[9px] uppercase tracking-wide text-gray-500">Dégâts</dt>
                  <dd className="mt-0.5 text-base font-bold text-gray-900">{Math.round(match.totalDamage)}</dd>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-center">
                  <dt className="text-[9px] uppercase tracking-wide text-gray-500">Aides</dt>
                  <dd className="mt-0.5 text-base font-bold text-gray-900">{match.totalAssists}</dd>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-center">
                  <dt className="text-[9px] uppercase tracking-wide text-gray-500">Réanimations</dt>
                  <dd className="mt-0.5 text-base font-bold text-gray-900">{match.totalRevives}</dd>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-center">
                  <dt className="text-[9px] uppercase tracking-wide text-gray-500">Classement</dt>
                  <dd className="mt-1 flex justify-center">
                    <PlacementBadge placement={match.placement} />
                  </dd>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-center">
                  <dt className="text-[9px] uppercase tracking-wide text-gray-500">Durée</dt>
                  <dd className="mt-0.5 text-base font-bold text-gray-900">{formatDuration(match.durationSeconds)}</dd>
                </div>
              </dl>

              <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-2 text-center">
                <p className="text-[9px] uppercase tracking-wide text-gray-500">Membres présents</p>
                <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
                  {memberNames.map((memberName) => (
                    <PlayerNameBadge key={memberName} name={memberName} />
                  ))}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
