import type { HeadToHeadStats } from '@/lib/head-to-head-service'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'
import { Swords, Trophy, Crosshair, Calendar, Minus, Skull } from 'lucide-react'
import Link from 'next/link'
import { resolveMapName } from '@/lib/pubg-assets'
import { matchDebriefPath } from '@/lib/match-links'
import MapImage from '@/components/ui/MapImage'
import { SlotBadge, comparatorSlot, slotInk, slotTint, type ComparatorSlot } from '@/components/comparator/ComparatorUi'

type Props = {
  h2h: HeadToHeadStats
  clanA: ClanComparatorEntry
  clanB: ClanComparatorEntry
  selectedClanIds?: number[]
}

/** Score d'un duel : le camp en tête prend l'encre de son slot, l'autre reste neutre (chiffres héros Teko). */
function DuelScore({ left, right, leftLeads, rightLeads, slotLeft, slotRight }: {
  left: number
  right: number
  leftLeads: boolean
  rightLeads: boolean
  slotLeft: ComparatorSlot
  slotRight: ComparatorSlot
}) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <b className={`t-hero t-hero--md ${leftLeads ? '' : 'text-gray-900'}`} style={leftLeads ? { color: slotInk(slotLeft) } : undefined}>
        {left}
      </b>
      <Minus className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      <b className={`t-hero t-hero--md ${rightLeads ? '' : 'text-gray-900'}`} style={rightLeads ? { color: slotInk(slotRight) } : undefined}>
        {right}
      </b>
    </div>
  )
}

export default function HeadToHeadCard({ h2h, clanA, clanB, selectedClanIds }: Props) {
  const slotAIndex = selectedClanIds ? selectedClanIds.indexOf(clanA.clanId) : 0
  const slotBIndex = selectedClanIds ? selectedClanIds.indexOf(clanB.clanId) : 1
  const slotA = comparatorSlot(slotAIndex !== -1 ? slotAIndex : 0)
  const slotB = comparatorSlot(slotBIndex !== -1 ? slotBIndex : 1)

  if (h2h.commonMatchCount === 0) {
    return (
      // État vide (charte §2) : bordure pointillée, rayon 14.
      <article className="flex flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-gray-200 p-8 text-center">
        <Swords className="mb-2 h-10 w-10 text-gray-400" aria-hidden="true" />
        <h3 className="t-card-title">
          {clanA.clanTag} vs {clanB.clanTag}
        </h3>
        <p className="t-body text-gray-700">Aucun match commun trouvé entre ces deux clans pour l&apos;instant.</p>
      </article>
    )
  }

  // Calculate winner
  const winDiff = h2h.matchesWonByA - h2h.matchesWonByB
  const killDiff = h2h.killsAOnB - h2h.killsBOnA
  const killDiffMatch = h2h.mostKillsInMatchA - h2h.mostKillsInMatchB

  // Basic date formatter
  const formatDate = (isoString: string) => {
    const d = new Date(isoString)
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d)
  }

  return (
    <article className="app-panel-muted overflow-hidden">
      {/* En-tête : les deux camps aux couleurs de leur slot, badge VS au centre */}
      <div className="relative flex items-stretch border-b border-gray-200">
        {[
          { clan: clanA, slot: slotA },
          { clan: clanB, slot: slotB },
        ].map(({ clan, slot }) => (
          <div
            key={clan.clanId}
            className="flex min-w-0 flex-1 flex-col items-center justify-center p-5 text-center"
            style={{ backgroundColor: slotTint(slot, 10) }}
          >
            <div className="mb-1.5 flex min-w-0 max-w-full items-center gap-1.5">
              <SlotBadge slot={slot} size="sm" />
              <span className="truncate text-xs font-bold uppercase tracking-widest" style={{ color: slotInk(slot) }}>
                {clan.clanName}
              </span>
            </div>
            <span className="text-3xl font-black text-gray-900 sm:text-4xl">{clan.clanTag}</span>
          </div>
        ))}

        <div className="absolute inset-y-0 left-1/2 flex w-12 -translate-x-1/2 items-center justify-center">
          <div className="z-10 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-sm font-black italic text-gray-500 shadow-md">
            VS
          </div>
        </div>
      </div>

      {/* Scores des trois duels */}
      <div className="grid grid-cols-3 divide-x divide-gray-200 border-b border-gray-200">
        {/* Meilleur placement */}
        <div className="flex flex-col items-center gap-3 p-3 text-center sm:p-4">
          <div className="t-label flex items-center justify-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Meilleur Placement
          </div>
          <DuelScore
            left={h2h.matchesWonByA}
            right={h2h.matchesWonByB}
            leftLeads={winDiff > 0}
            rightLeads={winDiff < 0}
            slotLeft={slotA}
            slotRight={slotB}
          />
          {h2h.ties > 0 && (
            <p className="t-meta">
              {h2h.ties} match{h2h.ties > 1 ? 's' : ''} à égalité
            </p>
          )}
        </div>

        {/* Plus de kills dans un match */}
        <div className="flex flex-col items-center gap-3 p-3 text-center sm:p-4">
          <div className="t-label flex items-center justify-center gap-1.5">
            <Skull className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Plus de Kills
          </div>
          <DuelScore
            left={h2h.mostKillsInMatchA}
            right={h2h.mostKillsInMatchB}
            leftLeads={killDiffMatch > 0}
            rightLeads={killDiffMatch < 0}
            slotLeft={slotA}
            slotRight={slotB}
          />
          {h2h.mostKillsTies > 0 && (
            <p className="t-meta">
              {h2h.mostKillsTies} match{h2h.mostKillsTies > 1 ? 's' : ''} à égalité
            </p>
          )}
        </div>

        {/* Kills directs */}
        <div className="flex flex-col items-center gap-3 p-3 text-center sm:p-4">
          <div className="t-label flex items-center justify-center gap-1.5">
            <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> Kills Directs
          </div>
          <DuelScore
            left={h2h.killsAOnB}
            right={h2h.killsBOnA}
            leftLeads={killDiff > 0}
            rightLeads={killDiff < 0}
            slotLeft={slotA}
            slotRight={slotB}
          />
          <p className="t-meta">
            {h2h.killsAOnB + h2h.killsBOnA === 0
              ? 'Aucun affrontement'
              : killDiff > 0
                ? `Avantage ${clanA.clanTag}`
                : killDiff < 0
                  ? `Avantage ${clanB.clanTag}`
                  : 'Égalité'}
          </p>
        </div>
      </div>

      {/* Derniers croisements */}
      <div className="flex flex-col gap-3 p-5">
        <h4 className="t-label flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Derniers croisements (Total: {h2h.commonMatchCount})
        </h4>
        <div className="flex flex-col gap-3">
          {h2h.matches.slice(0, 3).map((match) => {
            const linkClanId = match.winner === 'B' ? clanB.clanId : clanA.clanId
            return (
              <Link
                key={match.squadMatchId}
                href={matchDebriefPath(linkClanId, match.squadMatchId)}
                className="group relative flex items-center justify-between overflow-hidden rounded-[10px] border border-gray-200 bg-white p-3 transition hover:border-[var(--theme-ui-accent-ring)]"
              >
                {/* Carte en filigrane */}
                <div className="pointer-events-none absolute inset-0 z-0 opacity-10 transition-opacity group-hover:opacity-20">
                  <MapImage mapKey={match.mapName} className="h-full w-full object-cover object-center" />
                </div>

                {/* Carte et date */}
                <div className="relative z-10 flex min-w-0 flex-col">
                  <span className="truncate text-sm font-bold text-gray-900 transition-colors group-hover:text-[var(--theme-ui-accent-text)]">
                    {resolveMapName(match.mapName)}
                  </span>
                  <span className="t-meta">{formatDate(match.createdAt)}</span>
                </div>

                {/* Places et kills de chaque camp */}
                <div className="relative z-10 flex shrink-0 items-center gap-4">
                  {[
                    { side: 'A' as const, slot: slotA, placement: match.bestPlacementA, kills: match.totalKillsA },
                    { side: 'B' as const, slot: slotB, placement: match.bestPlacementB, kills: match.totalKillsB },
                  ].map(({ side, slot, placement, kills }, index) => (
                    <div key={side} className="flex items-center gap-4">
                      {index === 1 ? (
                        <span className="text-sm text-gray-400" aria-hidden="true">
                          -
                        </span>
                      ) : null}
                      <div className="flex flex-col items-center gap-0.5">
                        <b
                          className={`t-hero t-hero--sm ${match.winner === side ? '' : 'text-gray-500'}`}
                          style={match.winner === side ? { color: slotInk(slot) } : undefined}
                        >
                          #{placement ?? '?'}
                        </b>
                        <span className="t-label">{kills ?? 0} Kills</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Link>
            )
          })}
          {h2h.matches.length > 3 && (
            <p className="t-meta pt-2 text-center">+ {h2h.matches.length - 3} autres matchs communs non affichés</p>
          )}
        </div>
      </div>
    </article>
  )
}
