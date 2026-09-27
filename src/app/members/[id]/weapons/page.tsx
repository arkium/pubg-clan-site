'use client'

import { Crosshair, Gamepad2, Radar } from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import {
  CareerPanel,
  CategoryMenu,
  FavouriteCard,
  LoadoutPanel,
  MasteryHero,
  MasteryList,
  RecordsStrip,
  SiteWeaponList,
  useIsSmall,
} from '@/components/member-weapons/MemberWeaponsSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SyncStatus from '@/components/ui/SyncStatus'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { useCanRefreshMember } from '@/hooks/useCanRefreshMember'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'
import { parseArmoryCategory } from '@/lib/weapons/armory'
import {
  aggregateMemberWeapons,
  categoryCounts,
  favouriteWeapon,
  lastMasteryRefresh,
  loadoutThrows,
  masteryWeapons,
  memberLoadout,
  memberRecords,
  mostMasteredWeapon,
  parseArsenalSource,
  type ArsenalSource,
  type MasteryEntry,
  type MemberWeaponRow,
  type PubgSortKey,
  type SiteSortKey,
} from '@/lib/weapons/member-arsenal'
import type { WeaponCategory } from '@/lib/weapons/weapon-categories'

type ThrowItem = { itemId: string; count: number }

const pickRows = (payload: unknown) => {
  const body = payload as { data?: { rows?: MemberWeaponRow[] }; rows?: MemberWeaponRow[] } | null
  return body?.data?.rows ?? body?.rows ?? null
}
const pickThrows = (payload: unknown) => (payload as { data?: { items?: ThrowItem[] } } | null)?.data?.items ?? null
const pickMastery = (payload: unknown) => (payload as { weapons?: MasteryEntry[] } | null)?.weapons ?? null
const pickProfile = (payload: unknown) => (payload as { displayName?: string; clanId?: number | null } | null) ?? null

/** Onglet (`?source=pubg`) et catégorie (`?cat=AR`) dans l'URL, comme la période : sans entrée d'historique. */
function writeQuery(key: string, value: string | null) {
  const query = new URLSearchParams(window.location.search)
  if (value) query.set(key, value)
  else query.delete(key)
  const search = query.toString()
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`)
}

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Les armes d'un joueur — deux sources, deux onglets (maquette « Armes joueur », 2026-09-27 ; docs/features/armes-joueur.md).
 * « Suivi par le site » : télémétrie de la période (arme de prédilection, loadout, records, râtelier). « Carrière PUBG » :
 * maîtrise d'arme officielle, sans période. Bandeau sur une ligne, qui colle aussi sur mobile.
 */
export default function MemberWeaponsPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  // Période : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E). Onglet Site seulement.
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [source, setSourceState] = useState<ArsenalSource>(() => parseArsenalSource(searchParams.get('source')))
  const [category, setCategoryState] = useState<WeaponCategory | null>(() => parseArmoryCategory(searchParams.get('cat')))
  const [siteSort, setSiteSort] = useState<SiteSortKey>('kills')
  const [pubgSort, setPubgSort] = useState<PubgSortKey>('level')
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [now] = useState(() => new Date())

  const base = memberId ? `/api/members/${memberId}` : null
  const rows = usePageData(base && ready ? `${base}/telemetry/weapons?period=${period}` : null, pickRows)
  const throws = usePageData(base && ready ? `${base}/throwables?period=${period}` : null, pickThrows)
  const mastery = usePageData(base ? `${base}/weapon-mastery${refreshNonce ? `?v=${refreshNonce}` : ''}` : null, pickMastery)
  const profile = usePageData(base, pickProfile).data
  // Rafraîchir la maîtrise : la route exige une session du clan du joueur (ou un SuperUser) ; un visiteur ne voit que la date.
  const canRefresh = useCanRefreshMember(profile?.clanId)
  const small = useIsSmall()

  const siteWeapons = useMemo(() => aggregateMemberWeapons(rows.data ?? []), [rows.data])
  const pubgWeapons = useMemo(() => masteryWeapons(mastery.data ?? []), [mastery.data])

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  const isSite = source === 'site'
  const listed = isSite ? siteWeapons : pubgWeapons
  const counts = categoryCounts(listed)
  const filteredSite = category ? siteWeapons.filter((weapon) => weapon.category === category) : siteWeapons
  const filteredPubg = category ? pubgWeapons.filter((weapon) => weapon.category === category) : pubgWeapons
  const name = profile?.displayName ?? null
  const when = PERIOD_WHEN_LABELS[period]

  function setSource(next: ArsenalSource) {
    setSourceState(next)
    writeQuery('source', next === 'pubg' ? 'pubg' : null)
  }

  function setCategory(next: WeaponCategory | null) {
    setCategoryState(next)
    writeQuery('cat', next)
  }

  async function refreshMastery() {
    setRefreshing(true)
    setRefreshError('')
    try {
      const response = await fetch(`/api/members/${memberId}/weapon-mastery`, { method: 'POST' })
      if (!response.ok) throw new Error()
      setRefreshNonce((current) => current + 1)
    } catch {
      setRefreshError('Rafraîchissement de la maîtrise impossible pour le moment.')
    } finally {
      setRefreshing(false)
    }
  }

  const siteLoading = rows.loading || throws.loading
  const current = isSite ? rows : mastery

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter space-y-4">
        <NavigationTrail
          currentLabel="Armes"
          currentHref={`/members/${memberId}/weapons`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: name ?? 'Tableau de bord', altHref: '/members' }}
        />
        <section>
          <MemberPageHeader
            title={name ? `L'arsenal de ${name}` : "L'arsenal"}
            subtitle={isSite ? 'Tes armes dans les parties suivies par le site.' : 'Maîtrise d’arme officielle PUBG, toute ta carrière.'}
            showBackButton={false}
            backgroundImage="/weaponsplayer2.jpg"
            icon={<Crosshair className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />}
          />
        </section>
      </div>

      {/*
        Exception à sticky.md §2 (décision du 2026-09-27, maquette « Armes joueur ») : docké sur mobile, le bandeau garde
        l'onglet, la commande de l'onglet (période ou synchro) et la catégorie, sur une ligne.
      */}
      <DockingToolbar ariaLabel="Filtres des armes du joueur">
        <div className="flex w-full flex-nowrap items-center gap-1.5 sm:gap-2">
          <SegmentedControl
            options={[
              { value: 'site', label: small ? 'Site' : 'Suivi par le site', icon: small ? undefined : <Radar className="h-3.5 w-3.5" aria-hidden="true" /> },
              { value: 'pubg', label: small ? 'PUBG' : 'Carrière PUBG', icon: small ? undefined : <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" /> },
            ]}
            value={source}
            onChange={setSource}
            size="xs"
            className="shrink-0"
          />
          {isSite ? (
            <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} size="xs" className="map-toolbar-period" />
          ) : (
            <SyncStatus
              lastRefresh={lastMasteryRefresh(mastery.data ?? [])}
              now={now}
              canRefresh={canRefresh}
              refreshing={refreshing}
              onRefresh={() => void refreshMastery()}
              subject="la maîtrise PUBG"
              testId="mastery-sync"
            />
          )}
          <CategoryMenu counts={counts} value={category} onChange={setCategory} />
        </div>
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-3.5 pb-8 sm:gap-[18px]">
        {current.error ? <p className="app-panel p-4 text-sm text-red-600">{current.error}</p> : null}
        {refreshError ? <p className="app-panel p-3 text-sm text-red-600">{refreshError}</p> : null}
        {!current.data && current.loading ? <CardSkeleton /> : null}

        {isSite && rows.data ? (
          <div className={`flex flex-col gap-3.5 transition-opacity sm:gap-[18px] ${siteLoading ? 'opacity-60' : ''}`} aria-busy={siteLoading}>
            <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <FavouriteCard weapon={favouriteWeapon(siteWeapons)} when={when} />
              <LoadoutPanel slots={memberLoadout(siteWeapons)} throws={loadoutThrows(throws.data ?? [])} />
            </div>
            <RecordsStrip records={memberRecords(siteWeapons)} />
            <SiteWeaponList
              weapons={filteredSite}
              subtitle={`${filteredSite.length} arme${filteredSite.length > 1 ? 's' : ''} · ${when}`}
              sort={siteSort}
              onSort={setSiteSort}
              resetKey={`${category ?? 'all'}-${period}`}
            />
            <p className="text-xs text-gray-500">
              Calculé sur les parties que le site a analysées : les parties hors suivi ne comptent pas. Précision = touches ÷ tirs ;
              headshots = kills en headshot. Véhicules, poings et zone ne figurent pas au râtelier.
            </p>
          </div>
        ) : null}

        {!isSite && mastery.data ? (
          <div className={`flex flex-col gap-3.5 transition-opacity sm:gap-[18px] ${mastery.loading ? 'opacity-60' : ''}`} aria-busy={mastery.loading}>
            <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <MasteryHero weapon={mostMasteredWeapon(pubgWeapons)} />
              <CareerPanel weapons={pubgWeapons} />
            </div>
            <MasteryList weapons={filteredPubg} sort={pubgSort} onSort={setPubgSort} resetKey={category ?? 'all'} />
            <p className="text-xs text-gray-500">
              Données officielles de la maîtrise d’arme PUBG, sans période, synchronisées chaque nuit. Headshots = coups à la tête,
              pas kills en headshot. Niveau d’expert : +1 chaque fois que l’arme repasse le niveau 100.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
