'use client'

import { Skull } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import { DeathCam, FaceOff, HuntersAndPrey, Tally, TrackedClans, WeaponMenu, weaponLabelOf, type NemesisPayload } from '@/components/nemesis/NemesisSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { STANDARD_PERIODS } from '@/lib/period'

const pickNemesis = (payload: unknown) => (payload as { data?: NemesisPayload } | null)?.data ?? null
const pickName = (payload: unknown) => (payload as { displayName?: string } | null)?.displayName ?? null

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Némésis d'un joueur — des comptes à régler (maquette « Némésis », 2026-09-27 ; docs/features/nemesis.md). Face-à-face
 * némésis / proie favorite et revanche, bilan sur une ligne, chasseurs et proies paginés (onglets sur mobile), death
 * cam. Période et arme dans le bandeau, qui colle aussi sur mobile.
 */
export default function MemberNemesisPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  // Période : URL, puis mémoire de la visite, puis « Tous » (les duels sont rares sur une semaine).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'all')
  const [weapon, setWeapon] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  const query = new URLSearchParams({ period })
  if (weapon) query.set('weapon', weapon)
  const { data, loading, error } = usePageData(memberId && ready ? `/api/members/${memberId}/nemesis?${query.toString()}` : null, pickNemesis)
  const name = usePageData(memberId ? `/api/members/${memberId}` : null, pickName).data

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-[var(--theme-ui-negative)]">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  const weaponLabel = weapon ? weaponLabelOf(data?.weaponLabels, weapon) : null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Némésis"
          currentHref={`/members/${memberId}/nemesis`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: name ?? 'Tableau de bord', altHref: '/members' }}
        />
        <header
          className="bg-photo-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/nemesis.jpg')`, backgroundPosition: 'center 40%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
            <div className="flex items-center gap-2">
              <Skull className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">{name ? `Némésis de ${name}` : 'Némésis'}</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md">Qui te chasse, qui tu chasses, et les comptes à régler.</p>
          </div>
        </header>
      </div>

      {/*
        Exception à sticky.md §2 (décision du 2026-09-27, maquette « Némésis ») : docké sur mobile, le bandeau garde la
        période et la pastille d'arme, sur une ligne.
      */}
      <DockingToolbar ariaLabel="Filtres du némésis">
        <div className="flex w-full flex-nowrap items-center gap-2">
          <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} size="xs" className="map-toolbar-period" />
          <WeaponMenu weapons={data?.availableWeapons ?? []} value={weapon} onChange={setWeapon} labels={data?.weaponLabels} />
        </div>
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-4 pb-8 sm:gap-[18px]">
        {error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}
        {!data && loading ? <CardSkeleton /> : null}
        {data ? (
          <div className={`flex flex-col gap-4 transition-opacity sm:gap-[18px] ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <FaceOff payload={data} now={now} weaponLabel={weaponLabel} />
            <Tally payload={data} />
            <HuntersAndPrey payload={data} now={now} weaponLabel={weaponLabel} />
            {/* Death cam et clans suivis côte à côte (2026-10-03) : toutes armes, même avec un filtre. */}
            <div className="grid items-stretch gap-4 md:grid-cols-2">
              <DeathCam weapons={data.topDeathWeapons} labels={data.weaponLabels} />
              <TrackedClans duels={data.trackedDuels} now={now} labels={data.weaponLabels} />
            </div>
            <p className="t-meta">
              Bots, morts sans tueur (zone, chute, noyade) et suicides exclus des classements, comptés à part dans le bilan. Un joueur jamais
              relevé dans un lobby apparaît comme « Joueur inconnu ».
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
