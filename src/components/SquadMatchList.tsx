import Image from 'next/image'

import type { SquadMatch, SquadPeriod } from '@/types/squad-matches'

interface SquadMatchListProps {
  clanId: number
  period: SquadPeriod
  matches: SquadMatch[]
  mapLabels: Record<string, string>
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

function getTeamSizeMeta(memberCount: number) {
  if (memberCount <= 2) {
    return {
      label: 'Duo',
      iconPath: '/icons/squads/duo.svg',
      tone: 'bg-sky-100 text-sky-700',
    }
  }

  if (memberCount === 3) {
    return {
      label: 'Trio',
      iconPath: '/icons/squads/trio.svg',
      tone: 'bg-violet-100 text-violet-700',
    }
  }

  return {
    label: 'Squad',
    iconPath: '/icons/squads/squad.svg',
    tone: 'bg-emerald-100 text-emerald-700',
  }
}

function placementTone(placement: number) {
  if (placement <= 1) {
    return 'border-amber-200 bg-amber-100 text-amber-900'
  }

  if (placement <= 5) {
    return 'border-yellow-200 bg-yellow-100 text-yellow-900'
  }

  if (placement <= 10) {
    return 'border-orange-200 bg-orange-100 text-orange-900'
  }

  return 'border-slate-200 bg-slate-100 text-slate-700'
}

function resultTone(isWin: boolean) {
  return isWin
    ? 'border-emerald-200 bg-emerald-100 text-emerald-900'
    : 'border-rose-200 bg-rose-100 text-rose-900'
}

function teamTone(teamSize: ReturnType<typeof getTeamSizeMeta>) {
  return `border ${teamSize.tone} shadow-sm`
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  return `${minutes}m`
}

export default function SquadMatchList({ clanId, period, matches, mapLabels }: SquadMatchListProps) {
  const latestMatches = matches.slice(0, 10)

  if (latestMatches.length === 0) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Derniers matchs ensemble</h2>
        <p className="text-sm text-gray-600">
          Aucun match en squad pour le clan #{clanId} sur la période {period === 'week' ? 'semaine' : 'mois'}.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Derniers matchs ensemble</h2>
          <p className="mt-0.5 text-xs text-gray-600">
            Cartes synthétiques des 10 dernières parties détectées pour le clan #{clanId}.
          </p>
        </div>
        <p className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-gray-600 shadow-sm">
          {latestMatches.length} match{latestMatches.length > 1 ? 's' : ''}
        </p>
      </div>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {latestMatches.map((match) => {
          const team = getTeamSizeMeta(match.members.length)
          const memberNames = match.members.map((member) => member.displayName)

          return (
            <li
              key={match.id}
              className="flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
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
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${teamTone(team)}`}>
                    <Image src={team.iconPath} alt={`${team.label} icon`} width={14} height={14} className="squad-mode-icon" />
                    <span>{team.label}</span>
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${resultTone(match.isWin)}`}>
                    {match.isWin ? 'Victoire' : 'Défaite'}
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
                  <dd className={`mt-0.5 text-base font-bold ${placementTone(match.placement)}`}>#{match.placement}</dd>
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
                    <span
                      key={memberName}
                      className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 shadow-sm"
                    >
                      {memberName}
                    </span>
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
