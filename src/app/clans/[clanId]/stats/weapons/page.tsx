'use client'

import { Crosshair } from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { DockingToolbar } from '@/components/ui/DockingToolbar'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { SortReminder } from '@/components/ui/SortableTh'
import ArmoryCategoryPager, { ALL_ARSENAL_LABEL } from '@/components/weapons/ArmoryCategoryPager'
import { ArmoryCategoryBrief, ArmoryFeats, ArmoryLoadout, ArmoryRack } from '@/components/weapons/ArmoryPanels'
import ArmoryRanking from '@/components/weapons/ArmoryRanking'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useTableSort } from '@/hooks/useTableSort'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'
import { resolveWeaponName } from '@/lib/pubg-assets'
import {
  ARMORY_SORT_LABELS,
  aggregateWeapons,
  armoryCategories,
  buildLoadout,
  categoryKills,
  computeFeats,
  formatCount,
  parseArmoryCategory,
  rankArmoryRows,
  rowCategory,
  signatureWeapon,
  weaponRack,
  type ArmoryRow,
  type ArmorySortKey,
} from '@/lib/weapons/armory'
import { WEAPON_CATEGORY_LABELS, type WeaponCategory } from '@/lib/weapons/weapon-categories'
import { WEAPON_CATEGORY_INFO } from '@/lib/weapons/weapon-category-info'

type ClanWeaponsResponse = {
  ok: boolean
  clanId: number
  period: StandardPeriod
  periodKey: string
  count: number
  matchCount?: number
  rows: ArmoryRow[]
  note: string | null
}

/** Paramètre d'URL de la catégorie affichée (`?cat=SR`) ; absent = « Tout l'arsenal ». */
const CATEGORY_QUERY_PARAM = 'cat'
const ALL_PLAYERS = 'Tous'

/** Même mécanique que la période (usePagePeriod) : l'URL suit, sans entrée d'historique ni rendu serveur. */
function writeCategoryToUrl(category: WeaponCategory | null) {
  const query = new URLSearchParams(window.location.search)
  if (category) query.set(CATEGORY_QUERY_PARAM, category)
  else query.delete(CATEGORY_QUERY_PARAM)
  const search = query.toString()
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`)
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * L'armurerie du clan — docs/features/weapons.md §7. Une seule page pour les armes du clan : la catégorie vit dans
 * l'URL (`?cat=`), `…/stats/weapons/categories` y redirige. « Tout l'arsenal » montre le loadout du clan, une catégorie
 * sa fiche et son râtelier ; hauts faits et classement suivent la sélection.
 */
export default function ClanArmoryPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [category, setCategoryState] = useState<WeaponCategory | null>(() =>
    parseArmoryCategory(searchParams.get(CATEGORY_QUERY_PARAM))
  )
  const [activePlayer, setActivePlayer] = useState(ALL_PLAYERS)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<ClanWeaponsResponse | null>(null)
  // Tri par les en-têtes (docs/TODO/refonte-ui.md §4.B) ; joueur et arme commencent de A à Z.
  const { sortKey, sortDir, onSort, colTint } = useTableSort<ArmorySortKey>('kills', 'desc', (key) =>
    key === 'player' || key === 'weapon' ? 'asc' : 'desc'
  )

  // Lien saisi à la main (`?cat=sr`, code inconnu) : l'URL reprend la forme canonique de la catégorie affichée.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get(CATEGORY_QUERY_PARAM)
    if (raw !== null && raw !== category) writeCategoryToUrl(category)
    // Au montage seulement : ensuite, setCategory écrit l'URL lui-même.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!clanId || !periodReady) {
      return
    }

    let cancelled = false

    async function loadWeapons() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/clans/${clanId}/telemetry/weapons?period=${period}`, {
          cache: 'no-store',
        })
        const data = (await response.json()) as ClanWeaponsResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in data && data.error ? data.error : "Impossible de charger les armes du clan")
        }

        if (!cancelled) {
          setPayload(data as ClanWeaponsResponse)
        }
      } catch (loadError) {
        if (!cancelled) {
          setPayload(null)
          setError(loadError instanceof Error ? loadError.message : "Impossible de charger les armes du clan")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadWeapons()

    return () => {
      cancelled = true
    }
  }, [clanId, period, periodReady])

  const allRows = useMemo(() => payload?.rows ?? [], [payload?.rows])

  const players = useMemo(
    () => [...new Set(allRows.map((row) => row.displayName))].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
    [allRows]
  )
  // Un joueur absent de la nouvelle période ramène à « Tous » plutôt qu'à une page vide.
  const player = players.includes(activePlayer) ? activePlayer : ALL_PLAYERS

  const playerRows = useMemo(
    () => (player === ALL_PLAYERS ? allRows : allRows.filter((row) => row.displayName === player)),
    [allRows, player]
  )
  const scopedRows = useMemo(
    () => (category ? playerRows.filter((row) => rowCategory(row) === category) : playerRows),
    [playerRows, category]
  )

  const categories = useMemo(() => armoryCategories(allRows), [allRows])
  const killsByCategory = useMemo(() => categoryKills(playerRows), [playerRows])
  const totalKills = useMemo(() => playerRows.reduce((sum, row) => sum + row.kills, 0), [playerRows])

  const weapons = useMemo(() => aggregateWeapons(playerRows, resolveWeaponName), [playerRows])
  const signature = useMemo(() => signatureWeapon(weapons), [weapons])
  const loadout = useMemo(() => buildLoadout(weapons), [weapons])
  const rack = useMemo(() => (category ? weaponRack(weapons, category) : []), [weapons, category])
  const feats = useMemo(() => computeFeats(scopedRows), [scopedRows])
  const ranked = useMemo(() => rankArmoryRows(scopedRows, sortKey, sortDir), [scopedRows, sortKey, sortDir])

  const weaponCount = category ? rack.length : weapons.filter((weapon) => weapon.kills > 0).length
  const periodWhen = PERIOD_WHEN_LABELS[period]
  const categoryLabel = category ? WEAPON_CATEGORY_LABELS[category] : ALL_ARSENAL_LABEL

  function setCategory(next: WeaponCategory | null) {
    setCategoryState(next)
    setPage(1)
    writeCategoryToUrl(next)
  }

  function selectPlayer(next: string) {
    setActivePlayer(next)
    setPage(1)
  }

  function sortBy(key: ArmorySortKey) {
    onSort(key)
    setPage(1)
  }

  if (!clanId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Clan invalide.</p>
      </div>
    )
  }

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush game-ui flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="L'armurerie du clan"
          currentHref={`/clans/${clanId}/stats/weapons`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/banner-weapons.jpg')`, backgroundPosition: 'center 40%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5 sm:bg-gradient-to-r sm:from-black/90 sm:via-black/45 sm:to-black/10" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Crosshair className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">L&apos;armurerie du clan</h1>
            </div>
            {payload ? (
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-white">
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5">
                  {formatCount(totalKills)} kills {periodWhen}
                </span>
                {signature ? (
                  <span className="rounded-full border border-amber-400/60 bg-amber-400/20 px-2.5 py-0.5 text-amber-200">
                    Arme signature : {signature.name}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>
      </div>

      <DockingToolbar
        ariaLabel="Filtres de l'armurerie"
        dockedAside={
          <span className="flex items-center gap-3">
            <span className="whitespace-nowrap text-xs font-semibold text-gray-700">{categoryLabel}</span>
            <SortReminder label={ARMORY_SORT_LABELS[sortKey]} sortDir={sortDir} />
          </span>
        }
      >
        {({ isSticky, compact }) => (
          <div className="flex w-full flex-wrap items-center gap-3">
            <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
            {!compact ? (
              <MobileDropdownNav
                id="weapon-player-dropdown"
                label="Joueur"
                variant="compact"
                currentLabel={player}
                visibilityClass="block"
                className="min-w-[12rem]"
                items={[ALL_PLAYERS, ...players].map((name) => ({
                  key: name,
                  label: name,
                  active: name === player,
                  onSelect: () => selectPlayer(name),
                }))}
              />
            ) : null}
            {!isSticky && payload?.matchCount !== undefined ? (
              <p className="ml-auto text-xs text-gray-500">
                <b className="text-gray-900">{formatCount(payload.matchCount)}</b> match{payload.matchCount > 1 ? 's' : ''} pris en compte
              </p>
            ) : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter">
        {loading && !payload ? <p className="text-sm text-gray-600">Chargement de l&apos;armurerie…</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {/* Rechargement : les résultats précédents restent affichés, estompés (la page ne se replie pas). */}
        {!error && payload ? (
          <div aria-busy={loading} className={`flex flex-col gap-[18px]${loading ? ' opacity-60' : ''}`}>
            {payload.note ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{payload.note}</p>
            ) : null}

            <ArmoryCategoryPager
              categories={categories}
              value={category}
              onChange={setCategory}
              kills={killsByCategory}
              totalKills={totalKills}
              weaponCount={weaponCount}
            />

            {category ? (
              <>
                <ArmoryCategoryBrief
                  info={WEAPON_CATEGORY_INFO[category]}
                  sharePercent={totalKills > 0 ? Math.round((killsByCategory[category] / totalKills) * 100) : 0}
                />
                <ArmoryRack weapons={rack} />
              </>
            ) : (
              <ArmoryLoadout slots={loadout} onOpen={(weapon) => setCategory(weapon.category)} />
            )}

            <ArmoryFeats feats={feats} scope={`${category ? WEAPON_CATEGORY_LABELS[category] : 'Toutes armes'} · ${periodWhen}`} />

            <ArmoryRanking
              rows={ranked}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={sortBy}
              colTint={colTint}
              page={page}
              onPageChange={setPage}
              showCategory={!category}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
