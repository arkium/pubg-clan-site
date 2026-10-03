'use client'

import { Radar } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useMemo } from 'react'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import {
  PLAYSTYLE_LINK_ICONS,
  PlayerCooperation,
  PlayerRoleCards,
  PlayerThemeCards,
  PlaystyleLinks,
  SectionBlock,
} from '@/components/player-playstyle/PlayerPlaystyleSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SectionAnchorNav, { type SectionAnchorNavItem } from '@/components/ui/SectionAnchorNav'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import type { ClanPlaystyleRow, CooperationPair } from '@/lib/clan-playstyle'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'
import {
  asPlaystyleRow,
  cooperationPartners,
  playerPlaystyleContext,
  playerRoleComparison,
  type PlayerPlaystyleResponse,
} from '@/lib/player-playstyle'

/** Constante : SectionAnchorNav se réabonne quand ses `items` changent. */
const SECTIONS: SectionAnchorNavItem[] = [
  { id: 'sec-profile', label: 'Profil', icon: 'playstyle' },
  { id: 'sec-themes', label: 'Mobilité', icon: 'support' },
  { id: 'sec-cooperation', label: 'Coopération', icon: 'other' },
]

/** Coopération : parties officielles, tous modes — comme le style de jeu du clan (décision du 2026-09-27). */
const SYNERGY_MATCH_TYPE = 'official' as const

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const pickPlayer = (payload: unknown) => (payload as { data?: PlayerPlaystyleResponse } | null)?.data ?? null
const pickRows = (payload: unknown) => (payload as { rows?: ClanPlaystyleRow[] } | null)?.rows ?? null
const pickPairs = (payload: unknown) => (payload as { rows?: CooperationPair[] } | null)?.rows ?? null

/**
 * Style de jeu d'un joueur — docs/features/membres.md. La télémétrie de ses matchs sur **une seule période** (semaine
 * par défaut), comparée au clan : profil par rôle, mobilité / cercle / survie, coopération avec ses coéquipiers. Le
 * tableau de bord en garde le résumé (carte « Profil de jeu », lien « Détail → »). Écrite selon la charte (`.charte`).
 */
export default function MemberPlaystylePage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  // Période : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')

  const player = usePageData(memberId && ready ? `/api/members/${memberId}/telemetry/playstyle?period=${period}` : null, pickPlayer)
  const clanId = player.data?.member.clanId ?? null
  // Comparaison et coopération : sans accès aux données du clan, la page reste lisible (pas de comparaison).
  const clanBase = clanId && ready ? `/api/clans/${clanId}/telemetry` : null
  const clan = usePageData(clanBase && `${clanBase}/playstyle?period=${period}`, pickRows)
  const cooperation = usePageData(clanBase && `${clanBase}/synergies?period=${period}&matchType=${SYNERGY_MATCH_TYPE}&mode=all`, pickPairs)

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-[var(--theme-ui-negative)]">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  const name = player.data?.member.displayName ?? null
  const stats = player.data?.stats ?? null
  const row = stats && name ? asPlaystyleRow(memberId, name, stats) : null
  const clanRows = clan.data
  const roles = row ? playerRoleComparison(row, clanRows) : []
  const partners = cooperation.data ? cooperationPartners(cooperation.data, memberId) : null
  const fading = (loading: boolean) => `flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter space-y-4">
        <NavigationTrail
          currentLabel="Style de jeu"
          currentHref={`/members/${memberId}/playstyle`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: name ?? 'Tableau de bord', altHref: '/members' }}
        />
        <MemberPageHeader
          title={name ? `Style de jeu de ${name}` : 'Style de jeu'}
          subtitle={`Ce que mesure la télémétrie de ses matchs ${PERIOD_WHEN_LABELS[period]}, comparé au clan.`}
          showBackButton={false}
          backgroundImage="/clan-stats.jpg"
          icon={<Radar className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />}
        />
      </div>

      <DockingToolbar ariaLabel="Filtres du style de jeu du joueur">
        {({ isSticky, compact }) => (
          <div className="flex w-full flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
              {!isSticky && player.data ? (
                <span className="t-meta" data-testid="playstyle-context">
                  {playerPlaystyleContext(stats, clanRows)}
                </span>
              ) : null}
            </div>
            {/* Ancres : seconde ligne du bandeau, jamais un second élément collant (sticky.md §4.B). */}
            {!compact && row ? <SectionAnchorNav ariaLabel="Sections du style de jeu" items={SECTIONS} /> : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-6 pb-8">
        {player.error ? <p className="app-panel p-3 text-sm text-[var(--theme-ui-negative)]">{player.error}</p> : null}
        {!player.data && player.loading ? <CardSkeleton /> : null}

        {player.data && !row ? (
          <p className="app-panel t-body p-6 text-center text-gray-500">
            Aucune partie de {name ?? 'ce joueur'} analysée par la télémétrie {PERIOD_WHEN_LABELS[period]}. Essaie une période plus longue.
          </p>
        ) : null}

        {row ? (
          <>
            <SectionBlock id="sec-profile" title="Profil de jeu" subtitle="Un score par rôle, la moyenne des joueurs du clan mesurés et son rang parmi eux.">
              <div aria-busy={player.loading || clan.loading} className={fading(player.loading || clan.loading)}>
                <PlayerRoleCards roles={roles} />
              </div>
            </SectionBlock>

            <SectionBlock id="sec-themes" title="Mobilité, cercle et survie" subtitle="Moyennes par match du joueur, et celles du clan en regard.">
              <div aria-busy={player.loading || clan.loading} className={fading(player.loading || clan.loading)}>
                <PlayerThemeCards player={row} clanRows={clanRows} />
              </div>
            </SectionBlock>

            <SectionBlock
              id="sec-cooperation"
              title="Coopération"
              subtitle="Entraide avec chaque coéquipier du clan en parties officielles : réanimations, éliminations à deux (co-kills) et rappels de squad (recalls)."
            >
              {cooperation.loading && !partners ? <CardSkeleton /> : null}
              {partners ? (
                <div aria-busy={cooperation.loading} className={fading(cooperation.loading)}>
                  <PlayerCooperation key={period} partners={partners} />
                </div>
              ) : !cooperation.loading ? (
                <p className="app-panel t-body p-6 text-center text-gray-500">La coopération du clan n’est pas disponible.</p>
              ) : null}
            </SectionBlock>
          </>
        ) : null}

        {player.data ? (
          <section aria-label="Aller plus loin">
            <PlaystyleLinks
              links={[
                { href: `/members/${memberId}/items`, title: 'Objets consommés', text: 'Soins, boosts, carburant et gadgets utilisés en match.', icon: PLAYSTYLE_LINK_ICONS.items },
                { href: `/members/${memberId}/map-stats#compositions`, title: 'Compositions d’équipe', text: 'Ses meilleurs duo, trio et squad.', icon: PLAYSTYLE_LINK_ICONS.compositions },
                { href: `/members/${memberId}/stats`, title: 'Carrière PUBG', text: 'Ses cumuls officiels, toutes saisons.', icon: PLAYSTYLE_LINK_ICONS.career },
              ]}
            />
          </section>
        ) : null}
      </div>
    </div>
  )
}
