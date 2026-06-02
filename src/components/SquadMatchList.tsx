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

function formatTelemetryBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) {
    return null
  }

  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} Ko`
  }

  return `${bytes} o`
}

function formatTelemetryMemberLabel(memberKey: string) {
  const normalized = memberKey.trim()
  return normalized.length > 0 ? normalized : 'Joueur inconnu'
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
          const telemetryBytes = formatTelemetryBytes(match.telemetry?.bytesDownloaded)

          return (
            <li
              key={match.id}
              id={`match-${match.id}`}
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

              {match.telemetry?.status === 'success' && match.telemetry.summary ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700">
                      Résumé télémétrie
                    </p>
                    <div className="flex flex-wrap gap-1.5 text-[10px] text-emerald-900">
                      <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 font-medium">
                        {match.telemetry.summary.totalEvents} events
                      </span>
                      {telemetryBytes ? (
                        <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 font-medium">
                          {telemetryBytes}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <dl className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-lg border border-emerald-200 bg-white px-2 py-1">
                      <dt className="text-[9px] uppercase tracking-wide text-emerald-700">Kills</dt>
                      <dd className="text-sm font-semibold text-emerald-950">{match.telemetry.summary.killEvents}</dd>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white px-2 py-1">
                      <dt className="text-[9px] uppercase tracking-wide text-emerald-700">Revives</dt>
                      <dd className="text-sm font-semibold text-emerald-950">{match.telemetry.summary.reviveEvents}</dd>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white px-2 py-1">
                      <dt className="text-[9px] uppercase tracking-wide text-emerald-700">Dégâts</dt>
                      <dd className="text-sm font-semibold text-emerald-950">{match.telemetry.summary.damageEvents}</dd>
                    </div>
                  </dl>

                  {match.telemetry.topWeapons.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-[9px] uppercase tracking-wide text-emerald-700">Top armes parser</p>
                      <ul className="mt-1 space-y-1 text-[11px] text-emerald-950">
                        {match.telemetry.topWeapons.map((weapon) => (
                          <li key={weapon.weaponName} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white px-2 py-1">
                            <span className="truncate">{weapon.weaponName}</span>
                            <span className="shrink-0 font-medium">
                              {weapon.kills} kill{weapon.kills > 1 ? 's' : ''} · {Math.round(weapon.damageDealt)} dmg
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {match.telemetry.memberStats.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-[9px] uppercase tracking-wide text-emerald-700">Stats joueurs parser</p>
                      <ul className="mt-1 space-y-1 text-[11px] text-emerald-950">
                        {match.telemetry.memberStats.map((member) => (
                          <li
                            key={member.memberKey}
                            className="rounded-lg border border-emerald-200 bg-white px-2 py-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-medium">
                                {formatTelemetryMemberLabel(member.memberKey)}
                              </span>
                              <span className="shrink-0 text-[10px] text-emerald-700">
                                {member.kills} K · {Math.round(member.damageDealt)} Dmg · {member.revives} Rev
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-emerald-800">
                              <span className="rounded-full border border-emerald-200 px-1.5 py-0.5">
                                HS {member.headshots}
                              </span>
                              <span className="rounded-full border border-emerald-200 px-1.5 py-0.5">
                                KO {member.knockouts}
                              </span>
                              <span className="rounded-full border border-emerald-200 px-1.5 py-0.5">
                                Deaths {member.deaths}
                              </span>
                              {member.vehicleRideEvents > 0 ? (
                                <span className="rounded-full border border-emerald-200 px-1.5 py-0.5">
                                  Ride {member.vehicleRideEvents}
                                </span>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {match.telemetry?.status === 'failed' && match.telemetry.errorMessage ? (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-900">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-rose-700">Erreur télémétrie</p>
                  <p className="mt-1 line-clamp-3">{match.telemetry.errorMessage}</p>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
