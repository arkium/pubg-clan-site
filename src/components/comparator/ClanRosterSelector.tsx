'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Users,
  Flame,
  RotateCcw,
  Dices,
  X,
  Check,
  ChevronDown,
  ChevronUp,
  Gamepad2,
  Clock,
  Sparkles,
  ArrowUpDown,
  Filter,
  Swords,
} from 'lucide-react'

export type ClanSummary = {
  id: number
  name: string
  tag: string
  platformShard?: string
  membersCount?: number
  matchesCount?: number
  lastMatchAt?: string | null
  timePlayedSeconds?: number
  activeDays?: number
  imageUrl?: string | null
}

interface ClanRosterSelectorProps {
  clans: ClanSummary[]
  selectedClanIds: number[]
  onToggleClan: (clanId: number) => void
  onClearSelection: () => void
  onSelectMultiple: (clanIds: number[]) => void
  maxClans?: number
  loading?: boolean
  error?: string
}

type FilterCategory = 'all' | 'recent' | 'large' | 'selected'
type SortField = 'activity' | 'name' | 'members' | 'matches'

const SLOT_CONFIGS = [
  {
    name: 'Slot 1',
    colorName: 'Bleu',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.3)]',
    borderClass: 'border-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.35)] bg-blue-950/30',
    activeSlotClass: 'border-blue-500 text-blue-400',
    ringClass: 'ring-2 ring-blue-500/60',
    accentDot: 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]',
  },
  {
    name: 'Slot 2',
    colorName: 'Orange',
    badgeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-[0_0_8px_rgba(249,115,22,0.3)]',
    borderClass: 'border-orange-500 shadow-[0_0_18px_rgba(249,115,22,0.35)] bg-orange-950/30',
    activeSlotClass: 'border-orange-500 text-orange-400',
    ringClass: 'ring-2 ring-orange-500/60',
    accentDot: 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]',
  },
  {
    name: 'Slot 3',
    colorName: 'Vert',
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
    borderClass: 'border-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.35)] bg-emerald-950/30',
    activeSlotClass: 'border-emerald-500 text-emerald-400',
    ringClass: 'ring-2 ring-emerald-500/60',
    accentDot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
  },
]

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Aucun match'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'Aucun match'
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diffSec < 60) return "À l'instant"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `Il y a ${diffMin} min`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `Il y a ${diffHours} h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Hier'
  if (diffDays < 30) return `Il y a ${diffDays} j`
  const diffMonths = Math.floor(diffDays / 30)
  return `Il y a ${diffMonths} mois`
}

export default function ClanRosterSelector({
  clans,
  selectedClanIds,
  onToggleClan,
  onClearSelection,
  onSelectMultiple,
  maxClans = 3,
  loading = false,
  error = '',
}: ClanRosterSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all')
  const [sortField, setSortField] = useState<SortField>('activity')
  // Replié par défaut au chargement de la page
  const [isExpanded, setIsExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const prevSelectedCountRef = useRef(selectedClanIds.length)

  // Masquer automatiquement la sélection lorsque les clans requis (ex: 3) sont choisis
  useEffect(() => {
    if (prevSelectedCountRef.current < maxClans && selectedClanIds.length >= maxClans) {
      setIsExpanded(false)
    }
    prevSelectedCountRef.current = selectedClanIds.length
  }, [selectedClanIds.length, maxClans])

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus()
    }
  }, [isSearchOpen])

  // Map clan ID to clan object
  const clanMap = useMemo(() => {
    const map = new Map<number, ClanSummary>()
    for (const c of clans) {
      map.set(c.id, c)
    }
    return map
  }, [clans])

  // Count clans for category badges
  const statsCounts = useMemo(() => {
    let recent = 0
    let large = 0
    const now = Date.now()
    const thirtyDaysMs = 30 * 24 * 3600 * 1000

    for (const c of clans) {
      if (c.lastMatchAt) {
        const time = new Date(c.lastMatchAt).getTime()
        if (now - time <= thirtyDaysMs) recent++
      }
      if ((c.membersCount ?? 0) >= 10) large++
    }

    return { all: clans.length, recent, large }
  }, [clans])

  // Filtered and sorted clans
  const displayedClans = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const now = Date.now()
    const thirtyDaysMs = 30 * 24 * 3600 * 1000

    let list = clans.filter((clan) => {
      // Search filter
      if (query) {
        const nameMatch = clan.name.toLowerCase().includes(query)
        const tagMatch = clan.tag.toLowerCase().includes(query)
        const combinedMatch = `[${clan.tag}] ${clan.name}`.toLowerCase().includes(query)
        if (!nameMatch && !tagMatch && !combinedMatch) return false
      }

      // Category filter
      if (activeCategory === 'selected') {
        return selectedClanIds.includes(clan.id)
      }
      if (activeCategory === 'recent') {
        if (!clan.lastMatchAt) return false
        const time = new Date(clan.lastMatchAt).getTime()
        return now - time <= thirtyDaysMs
      }
      if (activeCategory === 'large') {
        return (clan.membersCount ?? 0) >= 10
      }

      return true
    })

    // Sorting
    list = [...list].sort((a, b) => {
      // Prioritize selected items at top if not explicitly sorting
      const aSelected = selectedClanIds.includes(a.id)
      const bSelected = selectedClanIds.includes(b.id)
      if (aSelected && !bSelected && activeCategory !== 'selected') return -1
      if (!aSelected && bSelected && activeCategory !== 'selected') return 1

      if (sortField === 'name') {
        return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
      }
      if (sortField === 'activity') {
        const aTime = a.lastMatchAt ? new Date(a.lastMatchAt).getTime() : 0
        const bTime = b.lastMatchAt ? new Date(b.lastMatchAt).getTime() : 0
        return bTime - aTime
      }
      if (sortField === 'members') {
        return (b.membersCount ?? 0) - (a.membersCount ?? 0)
      }
      if (sortField === 'matches') {
        return (b.matchesCount ?? 0) - (a.matchesCount ?? 0)
      }
      return 0
    })

    return list
  }, [clans, searchQuery, activeCategory, sortField, selectedClanIds])

  // Random selection
  const handleRandomSelect = () => {
    if (clans.length === 0) return
    const activeClans = clans.filter((c) => (c.matchesCount ?? 0) > 0 || c.lastMatchAt)
    const pool = activeClans.length >= maxClans ? activeClans : clans

    const shuffled = [...pool].sort(() => 0.5 - Math.random())
    const picked = shuffled.slice(0, maxClans).map((c) => c.id)
    onSelectMultiple(picked)
    if (picked.length >= maxClans) {
      setIsExpanded(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Header Card with Battle Slots & Centered Chevron Toggle */}
      <div className="relative rounded-2xl border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface)] p-4 sm:p-5 shadow-sm">
        {/* Top bar with Title & Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--theme-ui-border)]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
              <Swords className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--theme-ui-text)]">
                Arène de confrontation
              </h2>
              <p className="text-xs text-[var(--theme-ui-text-muted)]">
                Sélectionne jusqu&apos;à {maxClans} clans à confronter ({selectedClanIds.length}/{maxClans})
              </p>
            </div>
          </div>

          <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={handleRandomSelect}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-ui-text)] hover:bg-[var(--theme-ui-surface-strong)] hover:border-slate-400 transition"
              title="Sélectionner 3 clans au hasard"
            >
              <Dices className="h-4 w-4 text-amber-400" />
              <span>Aléatoire</span>
            </button>

            {selectedClanIds.length > 0 && (
              <button
                type="button"
                onClick={onClearSelection}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 hover:border-red-500/50 transition"
                title="Vider la sélection"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Effacer ({selectedClanIds.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* The 3 Slots with VS Badges in between */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-4">
          {Array.from({ length: maxClans }).map((_, slotIndex) => {
            const clanId = selectedClanIds[slotIndex]
            const clan = clanId ? clanMap.get(clanId) : undefined
            const slotConfig = SLOT_CONFIGS[slotIndex % SLOT_CONFIGS.length]
            const isLast = slotIndex === maxClans - 1

            return (
              <React.Fragment key={`slot-container-${slotIndex}`}>
                {/* Slot Card */}
                <div className="flex-1 min-w-0">
                  {clan ? (
                    <div
                      className={`group relative flex items-center justify-between gap-3 rounded-xl border p-3.5 sm:p-4 transition-all ${slotConfig.borderClass}`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl text-xs sm:text-sm font-black tracking-wider uppercase border ${slotConfig.badgeClass}`}
                        >
                          P{slotIndex + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-base sm:text-lg font-black tracking-wide text-[var(--theme-ui-text)]">
                              [{clan.tag}]
                            </span>
                            <span className="truncate text-xs sm:text-sm font-semibold text-[var(--theme-ui-text-secondary)]">
                              {clan.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--theme-ui-text-muted)] font-medium">
                            <span>👥 {clan.membersCount ?? 0} membres</span>
                            <span>•</span>
                            <span className="font-semibold">{slotConfig.name} ({slotConfig.colorName})</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleClan(clan.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-[var(--theme-ui-text-muted)] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 transition"
                        title={`Retirer ${clan.name}`}
                      >
                        <X className="h-4 w-4 sm:h-5 sm:w-5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsExpanded(true)}
                      className="w-full flex items-center justify-between rounded-xl border-2 border-dashed border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)]/50 p-3.5 sm:p-4 hover:border-slate-400 hover:bg-[var(--theme-ui-surface-soft)] transition cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-[var(--theme-ui-border)] text-xs sm:text-sm font-bold text-[var(--theme-ui-text-muted)] group-hover:text-[var(--theme-ui-text)] transition">
                          P{slotIndex + 1}
                        </span>
                        <div>
                          <div className="text-xs sm:text-sm font-bold text-[var(--theme-ui-text-muted)] group-hover:text-[var(--theme-ui-text)] transition">
                            {slotConfig.name} ({slotConfig.colorName})
                          </div>
                          <div className="text-xs text-[var(--theme-ui-text-muted)]/80 font-medium">
                            + Choisir un clan rival
                          </div>
                        </div>
                      </div>
                    </button>
                  )}
                </div>

                {/* VS Badge between slots */}
                {!isLast && (
                  <div className="flex items-center justify-center shrink-0 py-1 sm:py-0">
                    <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-gradient-to-br from-red-600/30 to-amber-600/20 border border-red-500/50 text-red-400 font-black text-xs sm:text-sm italic tracking-widest shadow-[0_0_12px_rgba(239,68,68,0.35)]">
                      VS
                    </span>
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* Centered Chevron Button to Expand / Collapse Roster Section */}
        <div className="mt-4 pt-3 border-t border-[var(--theme-ui-border)] flex justify-center">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="group inline-flex items-center gap-2 rounded-full border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)] px-5 py-2 text-xs sm:text-sm font-semibold text-[var(--theme-ui-text)] shadow-sm hover:border-blue-500 hover:bg-[var(--theme-ui-surface-strong)] hover:text-blue-400 transition-all duration-200"
            aria-expanded={isExpanded}
            title={isExpanded ? 'Réduire le catalogue de clans' : 'Développer le catalogue de clans'}
          >
            <span>
              {isExpanded ? 'Masquer le catalogue des clans' : `Choisir / Modifier les clans (${clans.length})`}
            </span>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--theme-ui-surface-strong)] group-hover:bg-blue-500/20 transition">
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 text-[var(--theme-ui-text-muted)] group-hover:text-blue-400" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-[var(--theme-ui-text-muted)] group-hover:text-blue-400" />
              )}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Expandable Roster / Trading Cards Section */}
      {isExpanded && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface)] p-4 sm:p-5 shadow-sm animate-in fade-in duration-200">
          {/* Controls: Primary Row (Category Pills + Loupe Button & Sort) + Expandable Search Row */}
          <div className="flex flex-col gap-3">
            {/* Primary Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Category Filter Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
                <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)] p-1">
                  <button
                    type="button"
                    onClick={() => setActiveCategory('all')}
                    className={`rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                      activeCategory === 'all'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-[var(--theme-ui-text-muted)] hover:text-[var(--theme-ui-text)]'
                    }`}
                  >
                    Tous ({statsCounts.all})
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveCategory('recent')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                      activeCategory === 'recent'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-[var(--theme-ui-text-muted)] hover:text-[var(--theme-ui-text)]'
                    }`}
                  >
                    <Flame className="h-3.5 w-3.5" />
                    <span>Actifs récents ({statsCounts.recent})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveCategory('large')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                      activeCategory === 'large'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-[var(--theme-ui-text-muted)] hover:text-[var(--theme-ui-text)]'
                    }`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>Effectifs 10+ ({statsCounts.large})</span>
                  </button>

                  {selectedClanIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveCategory('selected')}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                        activeCategory === 'selected'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-[var(--theme-ui-text-muted)] hover:text-[var(--theme-ui-text)]'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Sélectionnés ({selectedClanIds.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Right Tools: Loupe Search Button + Sort Dropdown */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen((prev) => {
                      const next = !prev
                      if (!next && searchQuery) setSearchQuery('')
                      return next
                    })
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs sm:text-sm font-semibold transition cursor-pointer ${
                    isSearchOpen || searchQuery
                      ? 'border-blue-500 bg-blue-500/15 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.25)]'
                      : 'border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)] text-[var(--theme-ui-text-muted)] hover:text-[var(--theme-ui-text)] hover:bg-[var(--theme-ui-surface-strong)]'
                  }`}
                  title={isSearchOpen ? 'Masquer la recherche' : 'Rechercher un clan'}
                >
                  <Search className="h-4 w-4" />
                  <span className="hidden sm:inline">Recherche</span>
                  {searchQuery && (
                    <span className="flex h-2 w-2 rounded-full bg-blue-400" />
                  )}
                </button>

                {/* Sort Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-[var(--theme-ui-text-muted)] flex items-center gap-1">
                    <ArrowUpDown className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Tri :</span>
                  </span>
                  <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value as SortField)}
                    className="rounded-xl border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)] px-3 py-2 text-xs sm:text-sm font-semibold text-[var(--theme-ui-text)] outline-none focus:border-blue-500 transition cursor-pointer"
                  >
                    <option value="activity">Dernière activité</option>
                    <option value="name">Nom (A-Z)</option>
                    <option value="members">Effectif (Membres)</option>
                    <option value="matches">Volume de matchs</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Expandable Search Input Row */}
            {(isSearchOpen || searchQuery) && (
              <div className="relative w-full max-w-md animate-in fade-in slide-in-from-top-1 duration-150">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrer par nom ou tag ([RAF], BOFS)..."
                  className="w-full rounded-xl border border-blue-500/60 bg-[var(--theme-ui-surface-soft)] py-2 pl-9 pr-9 text-xs sm:text-sm text-[var(--theme-ui-text)] placeholder-[var(--theme-ui-text-muted)] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setIsSearchOpen(false)
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--theme-ui-text-muted)] hover:text-[var(--theme-ui-text)] p-0.5 rounded-lg hover:bg-slate-800 transition"
                  title="Fermer la recherche"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Cards Grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 pt-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="h-36 animate-pulse rounded-xl border border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)]"
                />
              ))}
            </div>
          ) : error ? (
            <div className="py-6 text-center text-sm text-red-500">{error}</div>
          ) : displayedClans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Filter className="h-8 w-8 text-[var(--theme-ui-text-muted)] opacity-50 mb-2" />
              <p className="text-sm font-medium text-[var(--theme-ui-text)]">Aucun clan trouvé</p>
              <p className="text-xs text-[var(--theme-ui-text-muted)] mt-0.5">
                Essaie de modifier tes critères de recherche ou ton filtre actif.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 pt-2">
              {displayedClans.map((clan) => {
                const selectedIndex = selectedClanIds.indexOf(clan.id)
                const isSelected = selectedIndex !== -1
                const disabled = !isSelected && selectedClanIds.length >= maxClans
                const slotConfig = isSelected ? SLOT_CONFIGS[selectedIndex % SLOT_CONFIGS.length] : null

                return (
                  <button
                    key={clan.id}
                    type="button"
                    onClick={() => onToggleClan(clan.id)}
                    disabled={disabled}
                    className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border text-left transition-all duration-200 p-3.5 sm:p-4 ${
                      isSelected && slotConfig
                        ? `${slotConfig.borderClass} ${slotConfig.ringClass} transform -translate-y-1`
                        : disabled
                          ? 'cursor-not-allowed border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)]/40 opacity-40 grayscale-[25%]'
                          : 'cursor-pointer border-[var(--theme-ui-border)] bg-[var(--theme-ui-surface-soft)] hover:-translate-y-1 hover:border-slate-400 hover:shadow-md'
                    }`}
                  >
                    {/* Top status bar in card: Clan Tag on left, Slot indicator on right */}
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span className="font-mono text-lg sm:text-xl font-black tracking-wide text-[var(--theme-ui-text)] group-hover:text-blue-400 transition">
                        [{clan.tag}]
                      </span>

                      {isSelected && slotConfig ? (
                        <span
                          className={`flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-black uppercase tracking-wider border ${slotConfig.badgeClass}`}
                        >
                          <Check className="h-3 w-3" />
                          P{selectedIndex + 1}
                        </span>
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-[var(--theme-ui-border)] group-hover:border-blue-400 transition" />
                      )}
                    </div>

                    {/* Clan Name in center body */}
                    <div className="my-1 min-h-[2.25rem] flex items-center">
                      <div
                        className="text-xs sm:text-sm font-bold text-[var(--theme-ui-text-secondary)] group-hover:text-[var(--theme-ui-text)] transition line-clamp-2"
                        title={clan.name}
                      >
                        {clan.name}
                      </div>
                    </div>

                    {/* Footer Stats / Indicators */}
                    <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--theme-ui-border)] pt-2.5 text-xs text-[var(--theme-ui-text-muted)]">
                      <div className="flex items-center justify-between font-medium">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-slate-400" />
                          <span>{clan.membersCount ?? 0} membres</span>
                        </span>
                        {(clan.matchesCount ?? 0) > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-[var(--theme-ui-text-secondary)]">
                            <Gamepad2 className="h-3.5 w-3.5 text-slate-400" />
                            <span>{clan.matchesCount}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 truncate text-[11px]">
                        <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                        <span className="truncate">{formatRelativeTime(clan.lastMatchAt)}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
