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
  ArrowUpDown,
  Filter,
  Swords,
} from 'lucide-react'

import SegmentedControl from '@/components/ui/SegmentedControl'
import { ComparatorSectionHeader, SlotBadge, comparatorSlot, slotTint } from '@/components/comparator/ComparatorUi'

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
  /** Clan technique du site (parking des joueurs sans clan) — voir chantier 0. */
  isSystem?: boolean
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

const SORT_FIELDS: Array<{ value: SortField; label: string }> = [
  { value: 'activity', label: 'Dernière activité' },
  { value: 'name', label: 'Nom (A-Z)' },
  { value: 'members', label: 'Effectif (Membres)' },
  { value: 'matches', label: 'Volume de matchs' },
]

const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000

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

/** Tri du catalogue : menu maison (charte : jamais de `<select>` natif), déclencheur aux couleurs du rail. */
function SortMenu({ value, onChange }: { value: SortField; onChange: (value: SortField) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const current = SORT_FIELDS.find((option) => option.value === value) ?? SORT_FIELDS[0]
  return (
    // Étiré à la hauteur de la ligne : même hauteur que le segmented voisin.
    <div ref={rootRef} className="relative flex shrink-0 self-stretch">
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Trier les clans : ${current.label}`}
        className="app-menu-trigger"
      >
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden text-gray-500 sm:inline">Tri :</span>
        {current.label}
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Trier les clans" className="app-menu absolute right-0 top-full z-50 mt-1.5 w-[220px]">
          {SORT_FIELDS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className={`app-menu__item ${option.value === value ? 'app-menu__item--active' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
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
  // Instant de référence de la visite (« actifs récents » = match dans les 30 derniers jours) : lu une fois, pas
  // pendant le rendu.
  const [now] = useState(() => Date.now())
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

    for (const c of clans) {
      if (c.lastMatchAt) {
        const time = new Date(c.lastMatchAt).getTime()
        if (now - time <= THIRTY_DAYS_MS) recent++
      }
      if ((c.membersCount ?? 0) >= 10) large++
    }

    return { all: clans.length, recent, large }
  }, [clans, now])

  // Filtered and sorted clans
  const displayedClans = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

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
        return now - time <= THIRTY_DAYS_MS
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
  }, [clans, searchQuery, activeCategory, sortField, selectedClanIds, now])

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
      {/* 1. Arène : titre, actions rapides, slots P1 / P2 / P3 séparés par le badge VS, bascule du catalogue. */}
      <div className="app-panel relative flex flex-col gap-4 p-4 sm:p-5">
        <ComparatorSectionHeader
          icon={Swords}
          title="Arène de confrontation"
          subtitle={`Sélectionne jusqu'à ${maxClans} clans à confronter (${selectedClanIds.length}/${maxClans})`}
        >
          <div className="flex w-full items-center justify-center gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={handleRandomSelect}
              className="app-btn app-btn--secondary app-btn--xs gap-1.5"
              title="Sélectionner 3 clans au hasard"
            >
              <Dices className="h-4 w-4" aria-hidden="true" />
              <span>Aléatoire</span>
            </button>

            {selectedClanIds.length > 0 && (
              <button
                type="button"
                onClick={onClearSelection}
                className="app-btn app-btn--danger app-btn--xs gap-1.5"
                title="Vider la sélection"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Effacer ({selectedClanIds.length})</span>
              </button>
            )}
          </div>
        </ComparatorSectionHeader>

        {/* Les slots, séparés par le badge VS (maquette #trading-cards : arène à 3 slots). */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {Array.from({ length: maxClans }).map((_, slotIndex) => {
            const clanId = selectedClanIds[slotIndex]
            const clan = clanId ? clanMap.get(clanId) : undefined
            const slot = comparatorSlot(slotIndex)
            const isLast = slotIndex === maxClans - 1
            const slotName = `Slot ${slotIndex + 1} (${slot.colorName})`

            return (
              <React.Fragment key={`slot-container-${slotIndex}`}>
                <div className="min-w-0 flex-1">
                  {clan ? (
                    <div
                      className="group relative flex items-center justify-between gap-3 rounded-[10px] border p-3.5 transition-all sm:p-4"
                      style={{
                        borderColor: slotTint(slot, 50),
                        backgroundColor: slotTint(slot, 8),
                        boxShadow: `0 0 12px ${slotTint(slot, 20)}`,
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <SlotBadge slot={slot} size="arena" />
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-mono text-base font-black tracking-wide text-gray-900 sm:text-lg">
                              [{clan.tag}]
                            </span>
                            <span className="truncate text-xs font-semibold text-gray-700 sm:text-sm">{clan.name}</span>
                          </div>
                          <div className="t-meta mt-0.5 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {clan.membersCount ?? 0} membres
                            </span>
                            <span aria-hidden="true">•</span>
                            <span className="truncate font-semibold">{slotName}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleClan(clan.id)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-50 hover:text-[var(--theme-ui-negative)]"
                        title={`Retirer ${clan.name}`}
                        aria-label={`Retirer ${clan.name}`}
                      >
                        <X className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    // Slot vide (état vide de la charte : bordure pointillée) : ouvre le catalogue.
                    <button
                      type="button"
                      onClick={() => setIsExpanded(true)}
                      className="group flex w-full cursor-pointer items-center justify-between rounded-[10px] border border-dashed border-gray-200 p-3.5 text-left transition hover:bg-gray-50 sm:p-4"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-gray-200 text-xs font-bold text-gray-500 transition group-hover:text-gray-900 sm:h-10 sm:w-10 sm:text-sm">
                          P{slotIndex + 1}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-gray-500 transition group-hover:text-gray-900 sm:text-sm">
                            {slotName}
                          </div>
                          <div className="t-meta">+ Choisir un clan rival</div>
                        </div>
                      </div>
                    </button>
                  )}
                </div>

                {/* Badge VS entre deux slots (maquette #slots-esport) : neutre, aux couleurs du thème. */}
                {!isLast && (
                  <div className="flex shrink-0 items-center justify-center py-1 sm:py-0">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-[11px] font-black italic tracking-widest text-gray-700 sm:h-8 sm:w-8 sm:text-xs">
                      VS
                    </span>
                  </div>
                )}
              </React.Fragment>
            )
          })}
        </div>

        {/* Bascule du catalogue des clans. */}
        <div className="flex justify-center border-t border-gray-200 pt-3">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="app-btn app-btn--secondary app-btn--sm gap-2"
            aria-expanded={isExpanded}
            title={isExpanded ? 'Réduire le catalogue de clans' : 'Développer le catalogue de clans'}
          >
            <span>
              {isExpanded ? 'Masquer le catalogue des clans' : `Choisir / Modifier les clans (${clans.length})`}
            </span>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* 2. Catalogue des clans (cartes de sélection), déplié à la demande. */}
      {isExpanded && (
        <div className="app-panel flex flex-col gap-3 p-4 animate-in fade-in duration-200 sm:p-5">
          {/* Contrôles : catégories (passent à la ligne, jamais de défilement horizontal), recherche et tri à la
              hauteur du rail segmented. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-stretch justify-between gap-2">
              <SegmentedControl<FilterCategory>
                options={[
                  { value: 'all', label: `Tous (${statsCounts.all})` },
                  { value: 'recent', label: `Actifs récents (${statsCounts.recent})`, icon: <Flame className="h-3.5 w-3.5" aria-hidden="true" /> },
                  { value: 'large', label: `Effectifs 10+ (${statsCounts.large})`, icon: <Users className="h-3.5 w-3.5" aria-hidden="true" /> },
                  ...(selectedClanIds.length > 0
                    ? [{ value: 'selected' as const, label: `Sélectionnés (${selectedClanIds.length})`, icon: <Check className="h-3.5 w-3.5" aria-hidden="true" /> }]
                    : []),
                ]}
                value={activeCategory}
                onChange={setActiveCategory}
                wrap
                className="max-w-full"
              />

              <div className="ml-auto flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen((prev) => {
                      const next = !prev
                      if (!next && searchQuery) setSearchQuery('')
                      return next
                    })
                  }}
                  aria-expanded={isSearchOpen}
                  className={`app-menu-trigger ${isSearchOpen || searchQuery ? 'app-menu-trigger--active' : ''}`}
                  title={isSearchOpen ? 'Masquer la recherche' : 'Rechercher un clan'}
                >
                  <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">Recherche</span>
                  <span className="sr-only sm:hidden">Rechercher un clan</span>
                  {searchQuery && <span className="flex h-2 w-2 rounded-full bg-[var(--theme-ui-accent)]" aria-hidden="true" />}
                </button>

                <SortMenu value={sortField} onChange={setSortField} />
              </div>
            </div>

            {/* Champ de recherche (habillage du rail, anneau d'accent au focus). */}
            {(isSearchOpen || searchQuery) && (
              <label className="app-toolbar-search w-full max-w-md animate-in fade-in slide-in-from-top-1 duration-150">
                <Search className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
                <span className="sr-only">Rechercher un clan</span>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrer par nom ou tag ([RAF], BOFS)..."
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setIsSearchOpen(false)
                  }}
                  className="rounded-md p-0.5 text-gray-500 transition hover:text-gray-900"
                  title="Fermer la recherche"
                  aria-label="Fermer la recherche"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </label>
            )}
          </div>

          {/* Cartes des clans */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="h-36 animate-pulse rounded-md bg-gray-100" />
              ))}
            </div>
          ) : error ? (
            <div className="py-6 text-center text-sm text-[var(--theme-ui-negative)]">{error}</div>
          ) : displayedClans.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-0.5 py-10 text-center">
              <Filter className="mb-1.5 h-8 w-8 text-gray-400" aria-hidden="true" />
              <p className="t-body text-gray-900">Aucun clan trouvé</p>
              <p className="t-meta">Essaie de modifier tes critères de recherche ou ton filtre actif.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {displayedClans.map((clan) => {
                const selectedIndex = selectedClanIds.indexOf(clan.id)
                const isSelected = selectedIndex !== -1
                const disabled = !isSelected && selectedClanIds.length >= maxClans
                const slot = isSelected ? comparatorSlot(selectedIndex) : null

                return (
                  <button
                    key={clan.id}
                    type="button"
                    onClick={() => onToggleClan(clan.id)}
                    disabled={disabled}
                    aria-pressed={isSelected}
                    className={`group relative flex flex-col justify-between overflow-hidden rounded-[14px] border p-3.5 text-left transition-all duration-200 sm:p-4 ${
                      slot
                        ? 'motion-safe:-translate-y-1'
                        : disabled
                          ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-45'
                          : 'cursor-pointer border-gray-200 bg-gray-50 hover:bg-gray-50 hover:shadow-md motion-safe:hover:-translate-y-1'
                    }`}
                    style={
                      slot
                        ? {
                            borderColor: slotTint(slot, 60),
                            backgroundColor: slotTint(slot, 8),
                            boxShadow: `0 0 0 2px ${slotTint(slot, 45)}, 0 0 12px ${slotTint(slot, 20)}`,
                          }
                        : undefined
                    }
                  >
                    {/* Tag du clan à gauche, slot à droite */}
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="font-mono text-lg font-black tracking-wide text-gray-900 sm:text-xl">[{clan.tag}]</span>

                      {slot ? (
                        <SlotBadge slot={slot} size="sm">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          {slot.name}
                        </SlotBadge>
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-gray-200 transition group-hover:border-[var(--theme-ui-accent-ring)]" />
                      )}
                    </div>

                    {/* Nom du clan */}
                    <div className="my-1 flex min-h-[2.25rem] items-center">
                      <div
                        className="line-clamp-2 text-xs font-bold text-gray-700 transition group-hover:text-gray-900 sm:text-sm"
                        title={clan.name}
                      >
                        {clan.name}
                      </div>
                    </div>

                    {/* Effectif, matchs, dernière activité */}
                    <div className="t-meta mt-3 flex flex-col gap-1.5 border-t border-gray-200 pt-2.5">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                          <span>{clan.membersCount ?? 0} membres</span>
                        </span>
                        {(clan.matchesCount ?? 0) > 0 && (
                          <span className="t-num flex items-center gap-1 font-semibold text-gray-700">
                            <Gamepad2 className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                            <span>{clan.matchesCount}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 truncate">
                        <Clock className="h-3 w-3 shrink-0 text-gray-400" aria-hidden="true" />
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
