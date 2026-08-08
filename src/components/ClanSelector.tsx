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
}: {
  icon: typeof Users
  value: string
  label: string
  tone: string
  title?: string
}) {
  return (
    <div className="app-panel-muted rounded-lg px-2 py-2 text-center" title={title}>
      <Icon className={`mx-auto h-4 w-4 ${tone}`} aria-hidden="true" />
      <p className="mt-1 text-sm font-bold tabular-nums text-gray-900">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
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
}: ClanSelectorProps) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')

  const filteredClans = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    const matching = normalizedQuery
      ? clans.filter((clan) => `${clan.name} ${clan.tag}`.toLowerCase().includes(normalizedQuery))
      : clans

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
  }, [clans, query, sortKey])

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
              <li
                key={clan.id}
                className={[
                  'app-panel relative overflow-hidden rounded-2xl p-4 transition-shadow hover:shadow-md',
                  isActive ? 'ring-2 ring-blue-600' : '',
                ].join(' ')}
              >
                {isActive ? (
                  <span className="absolute right-3 top-3 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    Actif
                  </span>
                ) : null}

                <div className="min-w-0 pr-14">
                  <p className="truncate text-base font-semibold text-gray-900">{clan.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    [{clan.tag}] · {clan.platformShard}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2">
                  <StatTile icon={Users} value={String(clan.membersCount)} label="Membres" tone="text-blue-500" />
                  <StatTile icon={Swords} value={String(clan.matchesCount)} label="Matchs" tone="text-cyan-500" />
                  <StatTile icon={Timer} value={formatPlaytimeCompact(clan.timePlayedSeconds)} label="Temps" tone="text-indigo-500" title={`${clan.activeDays ?? 0} jours actifs`} />
                  <StatTile
                    icon={Clock}
                    value={formatLastMatchCompact(clan.lastMatchAt)}
                    label="Dernier"
                    tone="text-orange-500"
                    title={formatLastMatchTitle(clan.lastMatchAt)}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => onSelect(clan.id)}
                  className="app-btn app-btn--sm app-btn--primary mt-4 w-full"
                >
                  Consulter
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
