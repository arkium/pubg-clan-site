import Link from 'next/link'
import { ChevronRight, Trophy } from 'lucide-react'

import { PlaceCell, SectionTitle } from '@/components/matches/MatchesUi'
import { chronological, formatPlayTime, modeSummaryText, sessionDateParts } from '@/lib/match-sessions'
import type { SessionRecapItem, SquadPeriod } from '@/types/squad-matches'

const numberFormat = new Intl.NumberFormat('fr-FR')

/**
 * Carnet des soirées (page Matchs) : une ligne par soirée — bloc date, une case par partie colorée par la place
 * finale, joueurs, modes et trois chiffres. Remplace l'ancien « Récap par soirée » (pastilles et tableau par mode).
 */
export default function SessionLogbook({
  clanId,
  period,
  gameMode,
  sessions,
}: {
  clanId: number
  period: SquadPeriod
  gameMode?: string
  sessions: SessionRecapItem[]
}) {
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="sessions-title">
      <SectionTitle aside="Chaque case = une partie, colorée par la place finale">
        <span id="sessions-title">Soirées</span>
      </SectionTitle>
      {sessions.length === 0 ? (
        <p className="app-panel p-4 text-sm text-gray-500">Aucune soirée sur la période sélectionnée.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {sessions.map((session) => {
            const params = new URLSearchParams({ period })
            if (gameMode) params.set('gameMode', gameMode)
            const href = `/clans/${clanId}/matches/session/${session.date}?${params.toString()}`
            const { day, weekday, full } = sessionDateParts(session.date)
            const games = chronological(session.matches)
            const wins = games.filter((match) => match.isWin).length
            return (
              <li key={session.date}>
                <Link
                  href={href}
                  aria-label={`Soirée du ${full} : ${games.length} partie${games.length > 1 ? 's' : ''}${wins ? `, ${wins} top 1` : ''}`}
                  className="app-panel grid items-center gap-x-3.5 gap-y-2.5 px-3.5 py-3 transition-colors hover:bg-gray-50 [grid-template-columns:56px_minmax(0,1fr)] sm:[grid-template-columns:56px_minmax(0,1fr)_auto_16px]"
                  style={wins > 0 ? { boxShadow: 'inset 3px 0 0 var(--game-gold)' } : undefined}
                >
                  <span className="app-panel-muted flex h-14 w-14 flex-col items-center justify-center">
                    <span className="text-[22px] font-extrabold leading-none">{day}</span>
                    <span className="text-[11px] font-semibold uppercase text-gray-500">{weekday}</span>
                  </span>
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="text-[15px]">{full}</b>
                      {wins > 0 && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 text-[11px] font-bold"
                          style={{ background: 'var(--game-gold-soft)', borderColor: 'var(--game-gold-ring)', color: 'var(--game-gold)' }}
                        >
                          <Trophy className="h-[11px] w-[11px]" aria-hidden="true" />
                          {wins > 1 ? `${wins} top 1` : 'Top 1'}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap gap-[3px]" aria-hidden="true">
                      {games.map((match, index) => (
                        <PlaceCell key={match.id} place={match.placement} title={`Partie ${index + 1} : #${match.placement}`} />
                      ))}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="flex" aria-hidden="true">
                        {session.members.map((member) => (
                          <span
                            key={member.memberId}
                            title={member.displayName}
                            className="-mr-1.5 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 bg-gray-50 text-[10px] font-bold text-gray-700"
                            style={{ borderColor: 'var(--theme-ui-surface)' }}
                          >
                            {member.displayName.charAt(0).toUpperCase()}
                          </span>
                        ))}
                      </span>
                      <span className="ml-2 truncate text-xs text-gray-500">
                        {session.members.map((member) => member.displayName).join(', ')}
                        {games.length ? ` · ${modeSummaryText(games)}` : ''}
                      </span>
                    </span>
                  </span>
                  <span className="col-start-2 flex gap-4 tabular-nums sm:col-start-auto sm:justify-end sm:gap-5">
                    {[
                      { label: 'Kills', value: numberFormat.format(session.totalKills) },
                      { label: 'Dégâts', value: numberFormat.format(Math.round(session.totalDamage)) },
                      { label: 'Durée', value: formatPlayTime(session.totalDuration) },
                    ].map((stat) => (
                      <span key={stat.label} className="text-left sm:text-right">
                        <span className="block text-base font-bold">{stat.value}</span>
                        <span className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500">{stat.label}</span>
                      </span>
                    ))}
                  </span>
                  <ChevronRight className="hidden h-4 w-4 text-gray-500 sm:block" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
