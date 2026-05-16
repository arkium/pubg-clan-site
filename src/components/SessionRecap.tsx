import type { SessionRecapItem } from '@/types/squad-matches'

interface SessionRecapProps {
  sessions: SessionRecapItem[]
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  return date.toLocaleDateString('fr-FR', { dateStyle: 'full' })
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  if (hours <= 0) {
    return `${minutes} min`
  }

  return `${hours} h ${minutes} min`
}

export default function SessionRecap({ sessions }: SessionRecapProps) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Récap par soirée</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-600">Aucune session sur la période sélectionnée.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => (
            <li key={session.date} className="rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900">{formatDate(session.date)}</p>
                <p className="text-xs text-gray-600">{session.matches.length} matchs</p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {session.members.map((member) => (
                  <span
                    key={member.memberId}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700"
                    title={member.displayName}
                  >
                    {member.displayName.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-700 sm:grid-cols-4">
                <p>Durée: {formatDuration(session.totalDuration)}</p>
                <p>Kills: {session.totalKills}</p>
                <p>Damage: {Math.round(session.totalDamage)}</p>
                <p>Win rate: {(session.winRate * 100).toFixed(1)}%</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
