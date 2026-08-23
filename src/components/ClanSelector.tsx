'use client'

import { Clock, Swords, Timer, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

import SegmentedControl from '@/components/ui/SegmentedControl'

export interface Clan {
  id: number
  name: string
  tag: string
  platformShard: string
  membersCount: number
  matchesCount: number
  lastMatchAt?: string | null
  timePlayedSeconds?: number
  activeDays?: number
  imageUrl?: string | null
}

interface ClanSelectorProps {
  onSelect(clanId: number): void
  clans: Clan[]
  loading: boolean
  error?: string
  activeClanId?: number | null
  onRetry?: () => void
  pendingClan?: Clan | null
  onConfirmSwitch?: () => void
  onCancelSwitch?: () => void
  isSuperUser?: boolean
}

type SortKey = 'name' | 'members' | 'matches' | 'playtime'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Nom' },
  { value: 'members', label: 'Effectif' },
  { value: 'matches', label: 'Matchs' },
  { value: 'playtime', label: 'Temps' },
]

function formatLastMatchCompact(lastMatchAt: string | null | undefined) {
  if (!lastMatchAt) {
    return '—'
  }

  return new Date(lastMatchAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function formatPlaytimeCompact(seconds: number | null | undefined) {
  if (!seconds) return '0h'
  const hours = Math.floor(seconds / 3600)
  return `${hours}h`
}

function formatLastMatchTitle(lastMatchAt: string | null | undefined) {
  if (!lastMatchAt) {
    return 'Aucun match enregistré'
  }

  return `Dernier match le ${new Date(lastMatchAt).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })}`
}

function SkeletonCard() {
  return (
    <li className="app-panel animate-pulse space-y-4 rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 shrink-0 rounded-2xl bg-gray-200" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-gray-200" />
          <div className="h-3 w-1/2 rounded bg-gray-200" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="h-14 rounded-lg bg-gray-200" />
        <div className="h-14 rounded-lg bg-gray-200" />
        <div className="h-14 rounded-lg bg-gray-200" />
      </div>
      <div className="h-9 w-full rounded-lg bg-gray-200" />
    </li>
  )
}

function StatTile({
  icon: Icon,
  value,
  label,
  tone,
  title,
  hasImage,
}: {
  icon: typeof Users
  value: string
  label: string
  tone: string
  title?: string
  hasImage?: boolean
}) {
  return (
    <div
      className={[
        'rounded-lg px-2 py-2 text-center transition-colors',
        hasImage ? 'bg-black/40 backdrop-blur-sm border border-white/10' : 'app-panel-muted',
      ].join(' ')}
      title={title}
    >
      <Icon className={`mx-auto h-4 w-4 ${tone}`} aria-hidden="true" />
      <p className={`mt-1 text-sm font-bold tabular-nums ${hasImage ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </p>
      <p className={`text-[10px] uppercase tracking-wide ${hasImage ? 'text-gray-300' : 'text-gray-500'}`}>
        {label}
      </p>
    </div>
  )
}

export default function ClanSelector({
  onSelect,
  clans,
  loading,
  error,
  activeClanId,
  onRetry,
  pendingClan,
  onConfirmSwitch,
  onCancelSwitch,
  isSuperUser = false,
}: ClanSelectorProps) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')

  const filteredClans = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    let visibleClans = clans
    if (!isSuperUser) {
      visibleClans = visibleClans.filter((clan) => clan.name !== 'Ungrouped')
    }

    const matching = normalizedQuery
      ? visibleClans.filter((clan) => `${clan.name} ${clan.tag}`.toLowerCase().includes(normalizedQuery))
      : visibleClans

    const sorted = [...matching]
    switch (sortKey) {
      case 'members':
        sorted.sort((a, b) => b.membersCount - a.membersCount)
        break
      case 'matches':
        sorted.sort((a, b) => b.matchesCount - a.matchesCount)
        break
      case 'playtime':
        sorted.sort((a, b) => (b.timePlayedSeconds ?? 0) - (a.timePlayedSeconds ?? 0))
        break
      default:
        sorted.sort((a, b) => a.name.localeCompare(b.name))
    }

    return sorted
  }, [clans, query, sortKey, isSuperUser])

  if (loading) {
    return (
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Chargement des clans">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </ul>
    )
  }

  if (error) {
    return (
      <div className="app-panel space-y-3 rounded-2xl p-4">
        <p className="text-sm text-red-600">{error}</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="app-btn app-btn--sm app-btn--primary">
            Réessayer
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1">
          <label htmlFor="clan-search" className="sr-only">
            Rechercher un clan
          </label>
          <input
            id="clan-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher par nom ou tag..."
            aria-label="Rechercher un clan par nom ou tag"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
          />
        </div>

        <SegmentedControl options={SORT_OPTIONS} value={sortKey} onChange={setSortKey} />
      </div>

      {pendingClan ? (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Changer de clan actif pour <strong>{pendingClan.name}</strong> ? Toutes les pages afficheront ses données.
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={onCancelSwitch} className="app-btn app-btn--sm app-btn--secondary">
              Annuler
            </button>
            <button type="button" onClick={onConfirmSwitch} className="app-btn app-btn--sm app-btn--primary">
              Confirmer
            </button>
          </div>
        </div>
      ) : null}

      {filteredClans.length === 0 ? (
        <p className="text-sm text-gray-600">Aucun clan trouvé.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Liste des clans disponibles">
          {filteredClans.map((clan) => {
            const isActive = clan.id === activeClanId

            return (
              <li key={clan.id}>
                <button
                  type="button"
                  onClick={() => onSelect(clan.id)}
                  className={[
                    'group app-panel relative w-full overflow-hidden rounded-2xl p-4 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                    isActive ? 'ring-2 ring-blue-600' : 'hover:border-blue-500/30 hover:bg-slate-50/80 dark:hover:bg-slate-800/50',
                    !clan.imageUrl && isActive ? 'bg-blue-50/30 dark:bg-blue-900/20' : '',
                  ].join(' ')}
                >
                  {clan.imageUrl ? (
                    <>
                      <img
                        src={clan.imageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/20 to-slate-900/80 transition-opacity duration-300 group-hover:opacity-80" />
                    </>
                  ) : null}

                  {isActive ? (
                    <span className="absolute right-3 top-3 z-10 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 shadow-sm">
                      Actif
                    </span>
                  ) : null}

                  <div className="relative z-10 min-w-0 pr-14">
                    <div className="flex items-center gap-1.5">
                      <p className={['truncate text-base font-semibold', clan.imageUrl ? 'text-white drop-shadow-md' : 'text-gray-900 dark:text-gray-100'].join(' ')}>
                        {clan.name}
                      </p>
                      {clan.name === 'Ungrouped' && (
                        <span
                          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-violet-900 text-[10px] font-bold text-violet-200 ring-1 ring-violet-500"
                          title="Groupe système réservé aux Superusers"
                        >
                          S
                        </span>
                      )}
                    </div>
                    <p className={['truncate text-xs', clan.imageUrl ? 'text-gray-300 drop-shadow-md' : 'text-gray-500'].join(' ')}>
                      [{clan.tag}] · {clan.platformShard}
                    </p>
                  </div>

                  <div className="relative z-10 mt-4 grid grid-cols-4 gap-2">
                    <StatTile icon={Users} value={String(clan.membersCount)} label="Membres" tone="text-blue-500" hasImage={!!clan.imageUrl} />
                    <StatTile icon={Swords} value={String(clan.matchesCount)} label="Matchs" tone="text-cyan-500" hasImage={!!clan.imageUrl} />
                    <StatTile icon={Timer} value={formatPlaytimeCompact(clan.timePlayedSeconds)} label="Temps" tone="text-indigo-500" title={`${clan.activeDays ?? 0} jours actifs`} hasImage={!!clan.imageUrl} />
                    <StatTile
                      icon={Clock}
                      value={formatLastMatchCompact(clan.lastMatchAt)}
                      label="Dernier"
                      tone="text-orange-500"
                      title={formatLastMatchTitle(clan.lastMatchAt)}
                      hasImage={!!clan.imageUrl}
                    />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
