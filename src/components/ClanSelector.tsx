'use client'

import { BarChart3, Clock, Crosshair, Gamepad2, Search, Shield, Swords, Timer, Trophy, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import SegmentedControl from '@/components/ui/SegmentedControl'

export interface Clan {
  id: number
  name: string
  tag: string
  platformShard: string
  membersCount: number
  matchesCount: number
  killsCount?: number
  winsCount?: number
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
  onHoverClan?: (clan: Clan | null) => void
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
  onHoverClan,
}: ClanSelectorProps) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus()
    }
  }, [isSearchOpen])

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

  const summaryStats = useMemo(() => {
    const tracked = clans.filter((c) => c.name !== 'Ungrouped')
    let totalMembers = 0
    let totalMatches = 0
    let totalPlaytimeSeconds = 0
    let totalKills = 0
    let totalWins = 0

    for (const clan of tracked) {
      totalMembers += clan.membersCount ?? 0
      totalMatches += clan.matchesCount ?? 0
      totalPlaytimeSeconds += clan.timePlayedSeconds ?? 0
      totalKills += clan.killsCount ?? 0
      totalWins += clan.winsCount ?? 0
    }

    return {
      clansCount: tracked.length,
      membersCount: totalMembers,
      matchesCount: totalMatches,
      playtimeHours: Math.floor(totalPlaytimeSeconds / 3600),
      killsCount: totalKills,
      winsCount: totalWins,
    }
  }, [clans])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface)] p-3 sm:p-4">
          <div className="mb-3 h-4 w-44 rounded bg-slate-800 animate-pulse" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-24 rounded-xl bg-slate-800/60 animate-pulse" />
            ))}
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Chargement des clans">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonCard key={index} />
          ))}
        </ul>
      </div>
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
      {/* Section Résumé Global */}
      <section
        aria-label="Statistiques globales des clans"
        className="rounded-2xl border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface)] p-3 sm:p-4 shadow-sm"
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/10 text-blue-400">
              <BarChart3 className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[var(--theme-ui-text)]">
              Statistiques globales
            </h2>
          </div>
          <span className="text-[11px] font-medium text-[var(--theme-ui-text-muted)]">
            Toutes saisons confondues
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="flex flex-col items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 sm:p-3 text-center transition hover:border-blue-500/40">
            <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
              <Shield className="h-4 w-4" />
            </div>
            <span className="font-mono text-base sm:text-lg lg:text-xl font-black text-[var(--theme-ui-text)]">
              {summaryStats.clansCount.toLocaleString('fr-FR')}
            </span>
            <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[var(--theme-ui-text-muted)]">
              Clans suivis
            </span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-2.5 sm:p-3 text-center transition hover:border-cyan-500/40">
            <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
              <Users className="h-4 w-4" />
            </div>
            <span className="font-mono text-base sm:text-lg lg:text-xl font-black text-[var(--theme-ui-text)]">
              {summaryStats.membersCount.toLocaleString('fr-FR')}
            </span>
            <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[var(--theme-ui-text-muted)]">
              Joueurs total
            </span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/5 p-2.5 sm:p-3 text-center transition hover:border-purple-500/40">
            <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
              <Gamepad2 className="h-4 w-4" />
            </div>
            <span className="font-mono text-base sm:text-lg lg:text-xl font-black text-[var(--theme-ui-text)]">
              {summaryStats.matchesCount.toLocaleString('fr-FR')}
            </span>
            <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[var(--theme-ui-text-muted)]">
              Matchs joués
            </span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 sm:p-3 text-center transition hover:border-amber-500/40">
            <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
            <span className="font-mono text-base sm:text-lg lg:text-xl font-black text-[var(--theme-ui-text)]">
              {summaryStats.playtimeHours.toLocaleString('fr-FR')}&nbsp;h
            </span>
            <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[var(--theme-ui-text-muted)]">
              Heures de jeu
            </span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/5 p-2.5 sm:p-3 text-center transition hover:border-rose-500/40">
            <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
              <Crosshair className="h-4 w-4" />
            </div>
            <span className="font-mono text-base sm:text-lg lg:text-xl font-black text-[var(--theme-ui-text)]">
              {summaryStats.killsCount.toLocaleString('fr-FR')}
            </span>
            <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[var(--theme-ui-text-muted)]">
              Kills totaux
            </span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 sm:p-3 text-center transition hover:border-emerald-500/40">
            <div className="mb-1 flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
              <Trophy className="h-4 w-4" />
            </div>
            <span className="font-mono text-base sm:text-lg lg:text-xl font-black text-[var(--theme-ui-text)]">
              {summaryStats.winsCount.toLocaleString('fr-FR')}
            </span>
            <span className="mt-0.5 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-[var(--theme-ui-text-muted)]">
              Victoires (Top 1)
            </span>
          </div>
        </div>
      </section>

      <div className="app-panel sticky top-[calc(10rem+6.5rem)] z-30 flex flex-col gap-2 rounded-xl p-2.5 shadow-sm sm:top-[calc(13rem+6.5rem)]">
        {/* Ligne principale : Filtre à gauche, Bouton Loupe à droite */}
        <div className="flex items-center justify-between gap-3">
          <SegmentedControl options={SORT_OPTIONS} value={sortKey} onChange={setSortKey} />

          <button
            type="button"
            onClick={() => {
              setIsSearchOpen((prev) => {
                const next = !prev
                if (!next && query) setQuery('')
                return next
              })
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs sm:text-sm font-semibold transition cursor-pointer ${
              isSearchOpen || query
                ? 'border-blue-500 bg-blue-500/15 text-blue-400 shadow-sm'
                : 'border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)] text-[var(--theme-ui-text-muted)] hover:text-[var(--theme-ui-text)] hover:bg-[var(--theme-ui-surface-strong)]'
            }`}
            title={isSearchOpen ? 'Masquer la recherche' : 'Rechercher un clan'}
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Recherche</span>
            {query && <span className="flex h-2 w-2 rounded-full bg-blue-400" />}
          </button>
        </div>

        {/* Barre de recherche déroulante */}
        {(isSearchOpen || query) && (
          <div className="relative w-full pt-1 animate-in fade-in slide-in-from-top-1 duration-150">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
            <input
              ref={searchInputRef}
              id="clan-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher par nom ou tag ([RAF], BOFS)..."
              aria-label="Rechercher un clan par nom ou tag"
              className="w-full rounded-xl border border-blue-500/60 bg-[var(--theme-ui-surface-soft)] py-2 pl-9 pr-9 text-xs sm:text-sm text-[var(--theme-ui-text)] placeholder-[var(--theme-ui-text-muted)] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition shadow-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-ui-text-muted)] hover:text-[var(--theme-ui-text)] p-0.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Effacer la recherche"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
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
            const displayImageUrl = clan.imageUrl || '/clans/default_clan.jpg'

            return (
              <li key={clan.id}>
                <button
                  type="button"
                  onClick={() => onSelect(clan.id)}
                  onMouseEnter={() => onHoverClan?.(clan)}
                  onMouseLeave={() => onHoverClan?.(null)}
                  className={[
                    'group app-panel relative w-full overflow-hidden rounded-2xl p-4 text-left transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600',
                    isActive ? 'ring-2 ring-blue-600' : 'hover:border-blue-500/30 hover:bg-slate-50/80 dark:hover:bg-slate-800/50',
                  ].join(' ')}
                >
                  <img
                    src={displayImageUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/20 to-slate-900/80 transition-opacity duration-300 group-hover:opacity-80" />

                  {isActive ? (
                    <span className="absolute right-3 top-3 z-10 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 shadow-sm">
                      Actif
                    </span>
                  ) : null}

                  <div className="relative z-10 min-w-0 pr-14">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-base font-semibold text-white drop-shadow-md">
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
                    <p className="truncate text-xs text-gray-300 drop-shadow-md">
                      [{clan.tag}] · {clan.platformShard}
                    </p>
                  </div>

                  <div className="relative z-10 mt-4 grid grid-cols-4 gap-2">
                    <StatTile icon={Users} value={String(clan.membersCount)} label="Membres" tone="text-blue-500" hasImage={true} />
                    <StatTile icon={Swords} value={String(clan.matchesCount)} label="Matchs" tone="text-cyan-500" hasImage={true} />
                    <StatTile icon={Timer} value={formatPlaytimeCompact(clan.timePlayedSeconds)} label="Temps" tone="text-indigo-500" title={`${clan.activeDays ?? 0} jours actifs`} hasImage={true} />
                    <StatTile
                      icon={Clock}
                      value={formatLastMatchCompact(clan.lastMatchAt)}
                      label="Dernier"
                      tone="text-orange-500"
                      title={formatLastMatchTitle(clan.lastMatchAt)}
                      hasImage={true}
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
