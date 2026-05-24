'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

import type { DashboardMatch, DashboardPeriod } from '@/types/dashboard'

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

function PlacementBadge({ placement }: { placement: number }) {
  const isTop3 = placement <= 3
  const isWin = placement === 1
  const cls = isWin
    ? 'bg-yellow-100 text-yellow-800 font-bold'
    : isTop3
      ? 'bg-green-100 text-green-800'
      : 'text-gray-600'
  return <span className={`rounded px-1.5 py-0.5 text-xs ${cls}`}>#{placement}</span>
}

interface SortKey {
  key: keyof DashboardMatch
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
  loading?: boolean
  memberId: number
  showViewAllLink?: boolean
  title?: string
  subtitle?: string
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
  loading,
  memberId,
  showViewAllLink = true,
  title = 'Historique des matchs',
  subtitle,
}: MatchHistoryProps) {
  const [sortKey, setSortKey] = useState<keyof DashboardMatch>('pubgCreatedAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const periods: DashboardPeriod[] = ['week', 'month', 'all']
  const periodLabels: Record<DashboardPeriod, string> = {
    week: '7 jours',
    month: '30 jours',
    all: 'Tout',
  }

  function handleSort(key: keyof DashboardMatch) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...matches].sort((a, b) => {
    const av = a[sortKey]
    const bv = b[sortKey]
    if (av === bv) return 0
    const cmp = av < bv ? -1 : 1
    return sortDir === 'asc' ? cmp : -cmp
  })

  const pages = Math.ceil(totalCount / limit)
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-gray-200 p-0.5">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onPeriodChange(p)
                  onOffsetChange(0)
                }}
                className={`rounded px-3 py-1 text-xs font-medium ${
                  p === period ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>
          {showViewAllLink ? (
            <Link
              href={`/members/${memberId}/matches`}
              className="rounded border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Voir tout →
            </Link>
          ) : null}
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
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  {SORT_KEYS.map(({ key, label }) => (
                    <th
                      key={key}
                      className="cursor-pointer px-4 py-2 text-left hover:bg-gray-100"
                      onClick={() => handleSort(key)}
                    >
                      {label}
                      {sortKey === key && (
                        <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-left">Carte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sorted.map((m) => {
                  const modeIcon = getModeIcon(m.gameMode)

                  return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                      <div>{formatDate(m.pubgCreatedAt)}</div>
                      <div className="text-xs text-gray-500">{formatTime(m.pubgCreatedAt)}</div>
                    </td>
                    <td className="px-4 py-2 font-semibold text-gray-900">{m.kills}</td>
                    <td className="px-4 py-2 text-gray-700">{Math.round(m.damageDealt)}</td>
                    <td className="px-4 py-2">
                      <PlacementBadge placement={m.placement} />
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
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => onOffsetChange(Math.max(0, offset - limit))}
                  className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  ‹ Précédent
                </button>
                <span className="px-2 py-1 text-xs text-gray-500">
                  {currentPage}/{pages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= pages}
                  onClick={() => onOffsetChange(offset + limit)}
                  className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Suivant ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
