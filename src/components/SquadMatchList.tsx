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
    return 'bg-amber-100 text-amber-800'
  }

  if (placement <= 5) {
    return 'bg-yellow-100 text-yellow-800'
  }

  if (placement <= 10) {
    return 'bg-orange-100 text-orange-800'
  }

  return 'bg-gray-100 text-gray-700'
}

export default function SquadMatchList({ clanId, period, matches, mapLabels }: SquadMatchListProps) {
  const latestMatches = matches.slice(0, 10)

  if (latestMatches.length === 0) {
    return (
      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-gray-900">Derniers matchs ensemble</h2>
        <p className="text-sm text-gray-600">
          Aucun match en squad pour le clan #{clanId} sur la période {period === 'week' ? 'semaine' : 'mois'}.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Derniers matchs ensemble</h2>
      <ul className="space-y-3">
        {latestMatches.map((match) => {
          const team = getTeamSizeMeta(match.members.length)

          return (
            <li key={match.id} className="rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{formatMatchDate(match.createdAt)}</p>
                  <p className="text-xs text-gray-600">
                    {mapLabels[match.mapName] ?? match.mapName} · {match.gameMode}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${team.tone}`}>
                    <Image src={team.iconPath} alt={`${team.label} icon`} width={16} height={16} className="squad-mode-icon" />
                    <span>{team.label}</span>
                  </span>
                  <span className={`rounded px-2 py-1 text-xs font-medium ${placementTone(match.placement)}`}>
                    Placement #{match.placement}
                  </span>
                  <span
                    className={`rounded px-2 py-1 text-xs font-semibold ${
                      match.isWin ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {match.isWin ? 'Victoire' : 'Défaite'}
                  </span>
                </div>
              </div>

              <p className="mt-2 text-xs text-gray-600">
                Membres présents: {match.members.map((member) => member.displayName).join(', ')}
              </p>

              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700 sm:grid-cols-4">
                <p>Éliminations: {match.totalKills}</p>
                <p>Dégâts: {Math.round(match.totalDamage)}</p>
                <p>Aides: {match.totalAssists}</p>
                <p>Durée: {Math.round(match.durationSeconds / 60)} min</p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
