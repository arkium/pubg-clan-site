import type { SquadMatch, SquadPeriod } from '@/types/squad-matches'

interface SquadMatchListProps {
  clanId: number
  period: SquadPeriod
  matches: SquadMatch[]
}

function formatMatchDate(value: string) {
  const date = new Date(value)
  return date.toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function SquadMatchList({ clanId, period, matches }: SquadMatchListProps) {
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
        {latestMatches.map((match) => (
          <li key={match.id} className="rounded border border-gray-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">{formatMatchDate(match.createdAt)}</p>
                <p className="text-xs text-gray-600">
                  {match.mapName} · {match.gameMode}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                  Placement #{match.placement}
                </span>
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold ${
                    match.isWin ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {match.isWin ? 'Win' : 'Loss'}
                </span>
              </div>
            </div>

            <p className="mt-2 text-xs text-gray-600">
              Membres présents: {match.members.map((member) => member.displayName).join(', ')}
            </p>

            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700 sm:grid-cols-4">
              <p>Kills: {match.totalKills}</p>
              <p>Damage: {Math.round(match.totalDamage)}</p>
              <p>Assists: {match.totalAssists}</p>
              <p>Durée: {Math.round(match.durationSeconds / 60)} min</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
