import TeamModeBadge, { teamModeFromMemberCount } from '@/components/ui/TeamModeBadge'

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

function modeLabel(memberCount: number) {
  if (memberCount <= 2) {
    return 'Duo'
  }

  if (memberCount === 3) {
    return 'Trio'
  }

  return 'Squad'
}

function modeKeyFromLabel(label: 'Duo' | 'Trio' | 'Squad') {
  if (label === 'Duo') {
    return teamModeFromMemberCount(2)
  }

  if (label === 'Trio') {
    return teamModeFromMemberCount(3)
  }

  return teamModeFromMemberCount(4)
}

function getModeRecap(matches: SessionRecapItem['matches']) {
  const modeStats = {
    Duo: { matches: 0, duration: 0, kills: 0, damage: 0, wins: 0 },
    Trio: { matches: 0, duration: 0, kills: 0, damage: 0, wins: 0 },
    Squad: { matches: 0, duration: 0, kills: 0, damage: 0, wins: 0 },
  }

  for (const match of matches) {
    const label = modeLabel(match.members.length)
    const mode = modeStats[label]
    mode.matches += 1
    mode.duration += match.durationSeconds
    mode.kills += match.totalKills
    mode.damage += match.totalDamage
    mode.wins += match.isWin ? 1 : 0
  }

  const rows = [
    { label: 'Duo', ...modeStats.Duo },
    { label: 'Trio', ...modeStats.Trio },
    { label: 'Squad', ...modeStats.Squad },
  ] as const

  const total = rows.reduce(
    (acc, row) => {
      acc.matches += row.matches
      acc.duration += row.duration
      acc.kills += row.kills
      acc.damage += row.damage
      acc.wins += row.wins
      return acc
    },
    { matches: 0, duration: 0, kills: 0, damage: 0, wins: 0 }
  )

  return {
    rows,
    total,
  }
}

export default function SessionRecap({ sessions }: SessionRecapProps) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Récap par soirée</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-600">Aucune session sur la période sélectionnée.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => {
            const modeRecap = getModeRecap(session.matches)

            return (
              <li key={session.date} className="rounded border border-gray-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-900">{formatDate(session.date)}</p>
                  <p className="app-meta-pill">{session.matches.length} matchs</p>
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

                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-xs text-gray-700">
                    <thead>
                      <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
                        <th className="px-2 py-1 text-left">Mode</th>
                        <th className="px-2 py-1 text-right">Matchs</th>
                        <th className="px-2 py-1 text-right">Durée</th>
                        <th className="px-2 py-1 text-right">Éliminations</th>
                        <th className="px-2 py-1 text-right">Dégâts</th>
                        <th className="px-2 py-1 text-right">Taux de victoire</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modeRecap.rows.map((mode) => {
                        const modeKey = modeKeyFromLabel(mode.label)

                        return (
                        <tr key={mode.label} className="border-b border-gray-100 last:border-b-0">
                          <td className="px-2 py-1 font-medium text-gray-900">
                            <TeamModeBadge mode={modeKey} label={mode.label} className="shadow-none" />
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{mode.matches}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{formatDuration(mode.duration)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{mode.kills}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{Math.round(mode.damage)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {mode.matches > 0 ? `${((mode.wins / mode.matches) * 100).toFixed(1)}%` : '0.0%'}
                          </td>
                        </tr>
                        )
                      })}
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                        <td className="px-2 py-1">Total</td>
                        <td className="px-2 py-1 text-right tabular-nums">{modeRecap.total.matches}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatDuration(modeRecap.total.duration)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{modeRecap.total.kills}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{Math.round(modeRecap.total.damage)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {modeRecap.total.matches > 0
                            ? `${((modeRecap.total.wins / modeRecap.total.matches) * 100).toFixed(1)}%`
                            : '0.0%'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
