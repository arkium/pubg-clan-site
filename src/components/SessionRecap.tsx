import Link from 'next/link'
import { Clock3, Crosshair, Gamepad2, Trophy, Zap, type LucideIcon } from 'lucide-react'

import PlayerNameBadge from '@/components/ui/PlayerNameBadge'
import TeamModeBadge, { teamModeFromMemberCount } from '@/components/ui/TeamModeBadge'

import type { SessionRecapItem, SquadPeriod } from '@/types/squad-matches'

interface SessionRecapProps {
  clanId: number
  period: SquadPeriod
  gameMode?: string
  sessions: SessionRecapItem[]
}

function SessionSummaryStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone: 'cyan' | 'red' | 'amber' | 'emerald'
}) {
  const toneClasses = {
    cyan: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-500',
    red: 'border-red-500/25 bg-red-500/10 text-red-500',
    amber: 'border-amber-500/25 bg-amber-500/10 text-amber-500',
    emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500',
  }

  return (
    <div className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-2.5 py-1 ${toneClasses[tone]}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <div className="flex items-baseline gap-1">
        <dt className="text-[9px] font-bold uppercase tracking-wide opacity-80">{label}</dt>
        <dd className="text-xs font-bold tabular-nums text-gray-900">{value}</dd>
      </div>
    </div>
  )
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

export default function SessionRecap({ clanId, period, gameMode, sessions }: SessionRecapProps) {
  return (
    <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Récap par soirée</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-600">Aucune session sur la période sélectionnée.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => {
            const modeRecap = getModeRecap(session.matches)
            const params = new URLSearchParams({ period })

            if (gameMode) {
              params.set('gameMode', gameMode)
            }

            const detailHref = `/clans/${clanId}/matches/session/${session.date}?${params.toString()}`

            return (
              <li key={session.date}>
                <Link
                  href={detailHref}
                  className="group block rounded-lg border border-gray-200 bg-white p-3 transition duration-150 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 focus-visible:border-blue-400"
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <p className="text-sm font-semibold text-gray-900">{formatDate(session.date)}</p>
                    <dl className="order-3 flex w-full flex-wrap items-center gap-2 md:order-none md:w-auto md:flex-1 md:justify-end">
                      <SessionSummaryStat
                        label="Durée"
                        value={formatDuration(modeRecap.total.duration)}
                        icon={Clock3}
                        tone="cyan"
                      />
                      <SessionSummaryStat
                        label="Élim."
                        value={modeRecap.total.kills.toLocaleString('fr-FR')}
                        icon={Crosshair}
                        tone="red"
                      />
                      <SessionSummaryStat
                        label="Dégâts"
                        value={Math.round(modeRecap.total.damage).toLocaleString('fr-FR')}
                        icon={Zap}
                        tone="amber"
                      />
                      <SessionSummaryStat
                        label="Victoires"
                        value={modeRecap.total.matches > 0
                          ? `${((modeRecap.total.wins / modeRecap.total.matches) * 100).toFixed(1)}%`
                          : '0.0%'}
                        icon={Trophy}
                        tone="emerald"
                      />
                    </dl>
                    <p className="app-meta-pill gap-1.5">
                      <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {session.matches.length} matchs
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {session.members.map((member) => (
                      <span
                        key={member.memberId}
                        className="contents"
                      >
                        <span
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700 md:hidden"
                          title={member.displayName}
                        >
                          {member.displayName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="hidden md:contents">
                          <PlayerNameBadge name={member.displayName} memberId={member.memberId} />
                        </span>
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
                      </tbody>
                    </table>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
