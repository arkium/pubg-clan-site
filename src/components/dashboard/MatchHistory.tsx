'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import SegmentedControl from '@/components/ui/SegmentedControl'
import PlacementBadge from '@/components/ui/PlacementBadge'
import TeamModeBadge from '@/components/ui/TeamModeBadge'

import type {
  DashboardMatch,
  DashboardMatchSortDirection,
  DashboardMatchSortKey,
  DashboardPeriod,
} from '@/types/dashboard'

const MAP_LABELS: Record<string, string> = {
  Baltic_Main: 'Erangel',
  Savage_Main: 'Sanhok',
  Desert_Main: 'Miramar',
  DihorOtok_Main: 'Vikendi',
  Range_Main: 'Camp Jackal',
  Summerland_Main: 'Karakin',
  Tiger_Main: 'Taego',
  Kiki_Main: 'Deston',
  Chimera_Main: 'Paramo',
  Heaven_Main: 'Haven',
}

const MODE_LABELS: Record<string, string> = {
  squad: 'Squad',
  'squad-fpp': 'Squad FPP',
  duo: 'Duo',
  'duo-fpp': 'Duo FPP',
  solo: 'Solo',
  'solo-fpp': 'Solo FPP',
}

function formatMapName(name: string): string {
  return MAP_LABELS[name] ?? name
}

function formatMode(mode: string): string {
  return MODE_LABELS[mode] ?? mode
}

function clanModeLabel(mode: DashboardMatch['clanMode']) {
  if (mode === 'solo') return 'Solo'
  if (mode === 'duo') return 'Duo'
  if (mode === 'trio') return 'Trio'
  return 'Squad'
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const remaining = total % 60
  return `${minutes}m ${remaining.toString().padStart(2, '0')}s`
}

function getModeIcon(mode: string): { src: string; alt: string } | null {
  const normalized = mode.toLowerCase()

  if (normalized.includes('squad')) {
    return { src: '/icons/squads/squad.svg', alt: 'Mode squad' }
  }

  if (normalized.includes('duo')) {
    return { src: '/icons/squads/duo.svg', alt: 'Mode duo' }
  }

  return null
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function telemetryHref(match: DashboardMatch): string | null {
  if (!match.clanId || !match.squadMatchId) {
    return null
  }
  return `/clans/${match.clanId}/matches/${match.squadMatchId}/telemetry`
}

interface SortKey {
  key: DashboardMatchSortKey
  label: string
}

const SORT_KEYS: SortKey[] = [
  { key: 'pubgCreatedAt', label: 'Date' },
  { key: 'kills', label: 'Kills' },
  { key: 'damageDealt', label: 'Damage' },
  { key: 'placement', label: 'Place' },
]

interface MatchHistoryProps {
  matches: DashboardMatch[]
  totalCount: number
  mapLabels?: Record<string, string>
  period: DashboardPeriod
  onPeriodChange: (p: DashboardPeriod) => void
  limit: number
  offset: number
  onOffsetChange: (o: number) => void
  sortKey: DashboardMatchSortKey
  sortDir: DashboardMatchSortDirection
  onSortChange: (key: DashboardMatchSortKey, direction: DashboardMatchSortDirection) => void
  loading?: boolean
  title?: string
  subtitle?: string
  unframed?: boolean
  /** Filtre sur une date exacte (YYYY-MM-DD) — prioritaire sur `period` quand renseigne. */
  date?: string
  onDateChange?: (date: string) => void
}

export default function MatchHistory({
  matches,
  totalCount,
  mapLabels,
  period,
  onPeriodChange,
  limit,
  offset,
  onOffsetChange,
  sortKey,
  sortDir,
  onSortChange,
  loading,
  title = 'Historique des matchs',
  subtitle,
  unframed = false,
  date,
  onDateChange,
}: MatchHistoryProps) {
  const router = useRouter()
  const periods: DashboardPeriod[] = ['week', 'month', 'all']
  const periodLabels: Record<DashboardPeriod, string> = {
    week: 'Semaine',
    month: 'Mois',
    all: 'Tous',
  }

  function handleSort(key: DashboardMatchSortKey) {
    if (key === sortKey) {
      onSortChange(key, sortDir === 'asc' ? 'desc' : 'asc')
      return
    }

    onSortChange(key, 'desc')
  }

  const pages = Math.ceil(totalCount / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <section className={unframed ? undefined : 'rounded-lg border border-gray-200 bg-white shadow-sm'}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onDateChange ? (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={date ?? ''}
                onChange={(event) => {
                  onDateChange(event.target.value)
                  onOffsetChange(0)
                }}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                aria-label="Filtrer par date exacte"
              />
              {date ? (
                <button
                  type="button"
                  onClick={() => {
                    onDateChange('')
                    onOffsetChange(0)
                  }}
                  className="text-xs text-gray-500 underline hover:text-gray-700"
                >
                  Effacer
                </button>
              ) : null}
            </div>
          ) : null}
          <SegmentedControl
            options={periods.map((p) => ({ value: p, label: periodLabels[p] }))}
            value={period}
            onChange={(nextPeriod) => {
              onPeriodChange(nextPeriod)
              onOffsetChange(0)
            }}
            size="xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : matches.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">
          Aucun match enregistré pour cette période.
        </p>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {matches.map((m) => {
              const modeIcon = getModeIcon(m.gameMode)
              const href = telemetryHref(m)

              const content = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{mapLabels?.[m.mapName] ?? formatMapName(m.mapName)}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatDate(m.pubgCreatedAt)} · {formatTime(m.pubgCreatedAt)}
                      </p>
                    </div>
                    <PlacementBadge placement={m.placement} />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">Kills</p>
                      <p className="text-sm font-semibold text-gray-900">{m.kills}</p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">Dmg</p>
                      <p className="text-sm font-semibold text-gray-900">{Math.round(m.damageDealt)}</p>
                    </div>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      <p className="text-gray-500">Durée</p>
                      <p className="text-sm font-semibold text-gray-900">{formatDuration(m.duration)}</p>
                    </div>
                  </div>

                  <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500">
                    {modeIcon ? (
                      <Image src={modeIcon.src} alt={modeIcon.alt} width={12} height={12} />
                    ) : (
                      <span className="inline-block h-2 w-2 rounded-full bg-gray-400" aria-hidden="true" />
                    )}
                    <span>{formatMode(m.gameMode)}</span>
                    <span>•</span>
                    <TeamModeBadge mode={m.clanMode} label={clanModeLabel(m.clanMode)} size="xs" className="shadow-none" />
                  </div>
                </>
              )

              if (href) {
                return (
                  <Link key={m.id} href={href} className="app-table-shell block p-4 transition hover:bg-gray-50">
                    {content}
                  </Link>
                )
              }

              return (
                <article key={m.id} className="app-table-shell p-4">
                  {content}
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="app-table-head text-xs uppercase tracking-wide">
                <tr>
                  {SORT_KEYS.map(({ key, label }) => (
                    <th
                      key={key}
                      className="cursor-pointer px-4 py-2 text-left"
                      onClick={() => handleSort(key)}
                    >
                      {label}
                      {sortKey === key && (
                        <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-left">Mode clan</th>
                  <th className="px-4 py-2 text-left">Carte</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => {
                  const modeIcon = getModeIcon(m.gameMode)
                  const href = telemetryHref(m)

                  return (
                    <tr
                      key={m.id}
                      className={href ? 'app-table-row cursor-pointer' : 'app-table-row'}
                      onClick={href ? () => router.push(href) : undefined}
                    >
                      <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                        <div>{formatDate(m.pubgCreatedAt)}</div>
                        <div className="text-xs text-gray-500">{formatTime(m.pubgCreatedAt)}</div>
                      </td>
                      <td className="px-4 py-2 font-semibold text-gray-900">{m.kills}</td>
                      <td className="px-4 py-2 text-gray-700">{Math.round(m.damageDealt)}</td>
                      <td className="px-4 py-2">
                        <PlacementBadge placement={m.placement} />
                      </td>
                      <td className="px-4 py-2 text-gray-700">
                        <TeamModeBadge mode={m.clanMode} label={clanModeLabel(m.clanMode)} size="xs" className="shadow-none" />
                      </td>
                      <td className="px-4 py-2 text-gray-600">
                        <div>{mapLabels?.[m.mapName] ?? formatMapName(m.mapName)}</div>
                        <div className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-gray-500">
                          {modeIcon ? (
                            <Image
                              src={modeIcon.src}
                              alt={modeIcon.alt}
                              width={12}
                              height={12}
                            />
                          ) : (
                            <span className="inline-block h-2 w-2 rounded-full bg-gray-400" aria-hidden="true" />
                          )}
                          <span>{formatMode(m.gameMode)}</span>
                          <span>•</span>
                          <span>{formatDuration(m.duration)}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500">
                {offset + 1}–{Math.min(offset + limit, totalCount)} sur {totalCount}
              </p>
              <div className="app-pagination">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => onOffsetChange(Math.max(0, offset - limit))}
                  aria-label="Aller a la page precedente"
                  title="Page precedente"
                  className="app-pagination-button"
                >
                  ←
                </button>
                <span className="app-pagination-label">
                  {currentPage} sur {pages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= pages}
                  onClick={() => onOffsetChange(offset + limit)}
                  aria-label="Aller a la page suivante"
                  title="Page suivante"
                  className="app-pagination-button"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
