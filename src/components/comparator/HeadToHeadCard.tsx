import type { HeadToHeadStats } from '@/lib/head-to-head-service'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'
import { Swords, Trophy, Crosshair, Calendar, Minus, Skull } from 'lucide-react'
import Link from 'next/link'
import { resolveMapName } from '@/lib/pubg-assets'
import MapImage from '@/components/ui/MapImage'

type Props = {
  h2h: HeadToHeadStats
  clanA: ClanComparatorEntry
  clanB: ClanComparatorEntry
  selectedClanIds?: number[]
}

const SLOT_STYLES = [
  {
    name: 'P1',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.3)]',
    bgTint: 'bg-blue-500/10',
    textTint: 'text-blue-500/80',
    textColor: 'text-blue-500',
  },
  {
    name: 'P2',
    badgeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-[0_0_8px_rgba(249,115,22,0.3)]',
    bgTint: 'bg-orange-500/10',
    textTint: 'text-orange-500/80',
    textColor: 'text-orange-500',
  },
  {
    name: 'P3',
    badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
    bgTint: 'bg-emerald-500/10',
    textTint: 'text-emerald-500/80',
    textColor: 'text-emerald-500',
  },
]

export default function HeadToHeadCard({ h2h, clanA, clanB, selectedClanIds }: Props) {
  const slotAIndex = selectedClanIds ? selectedClanIds.indexOf(clanA.clanId) : 0
  const slotBIndex = selectedClanIds ? selectedClanIds.indexOf(clanB.clanId) : 1
  const slotA = SLOT_STYLES[slotAIndex !== -1 ? slotAIndex % SLOT_STYLES.length : 0]
  const slotB = SLOT_STYLES[slotBIndex !== -1 ? slotBIndex % SLOT_STYLES.length : 1]

  if (h2h.commonMatchCount === 0) {
    return (
      <article className="app-panel-muted flex flex-col items-center justify-center rounded-xl p-8 text-center border border-[var(--theme-ui-border)]">
        <Swords className="mb-3 h-10 w-10 text-[var(--theme-ui-text-muted)] opacity-50" />
        <h3 className="mb-1 font-bold text-[var(--theme-ui-text)]">
          {clanA.clanTag} vs {clanB.clanTag}
        </h3>
        <p className="text-sm text-[var(--theme-ui-text-secondary)]">
          Aucun match commun trouvé entre ces deux clans pour l&apos;instant.
        </p>
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
    <article className="app-panel-muted overflow-hidden rounded-xl border border-[var(--theme-ui-border)] shadow-sm">
      {/* Header with VS and Slot Badges */}
      <div className="relative flex items-stretch border-b border-[var(--theme-ui-border)]">
        <div className={`flex flex-1 flex-col items-center justify-center ${slotA.bgTint} p-5 text-center`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`flex h-5 px-1.5 items-center justify-center rounded text-[11px] font-black uppercase border ${slotA.badgeClass}`}>
              {slotA.name}
            </span>
            <span className={`text-xs font-bold uppercase tracking-widest ${slotA.textTint}`}>
              {clanA.clanName}
            </span>
          </div>
          <span className="text-3xl sm:text-4xl font-black text-[var(--theme-ui-text)]">
            {clanA.clanTag}
          </span>
        </div>
        
        <div className="absolute inset-y-0 left-1/2 flex w-12 -translate-x-1/2 items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--theme-bg-base)] text-sm font-black text-[var(--theme-ui-text-muted)] shadow-md border border-[var(--theme-ui-border)] z-10">
            VS
          </div>
        </div>

        <div className={`flex flex-1 flex-col items-center justify-center ${slotB.bgTint} p-5 text-center`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className={`flex h-5 px-1.5 items-center justify-center rounded text-[11px] font-black uppercase border ${slotB.badgeClass}`}>
              {slotB.name}
            </span>
            <span className={`text-xs font-bold uppercase tracking-widest ${slotB.textTint}`}>
              {clanB.clanName}
            </span>
          </div>
          <span className="text-3xl sm:text-4xl font-black text-[var(--theme-ui-text)]">
            {clanB.clanTag}
          </span>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-3 divide-x divide-[var(--theme-ui-border)] border-b border-[var(--theme-ui-border)] bg-[var(--theme-bg-base)]">
        {/* Placement Wins */}
        <div className="p-4 text-center">
          <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--theme-ui-text-muted)]">
            <Trophy className="h-4 w-4" /> Meilleur Placement
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className={winDiff > 0 ? `text-3xl font-black ${slotA.textColor}` : "text-3xl font-bold text-[var(--theme-ui-text)]"}>{h2h.matchesWonByA}</span>
            <Minus className="h-4 w-4 text-[var(--theme-ui-text-secondary)] opacity-50" />
            <span className={winDiff < 0 ? `text-3xl font-black ${slotB.textColor}` : "text-3xl font-bold text-[var(--theme-ui-text)]"}>{h2h.matchesWonByB}</span>
          </div>
          {h2h.ties > 0 && (
            <p className="mt-2 text-xs font-medium text-[var(--theme-ui-text-muted)]">
              {h2h.ties} match{h2h.ties > 1 ? 's' : ''} à égalité
            </p>
          )}
        </div>

        {/* Most Kills Match */}
        <div className="p-4 text-center">
          <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--theme-ui-text-muted)]">
            <Skull className="h-4 w-4" /> Plus de Kills
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className={killDiffMatch > 0 ? `text-3xl font-black ${slotA.textColor}` : "text-3xl font-bold text-[var(--theme-ui-text)]"}>{h2h.mostKillsInMatchA}</span>
            <Minus className="h-4 w-4 text-[var(--theme-ui-text-secondary)] opacity-50" />
            <span className={killDiffMatch < 0 ? `text-3xl font-black ${slotB.textColor}` : "text-3xl font-bold text-[var(--theme-ui-text)]"}>{h2h.mostKillsInMatchB}</span>
          </div>
          {h2h.mostKillsTies > 0 && (
            <p className="mt-2 text-xs font-medium text-[var(--theme-ui-text-muted)]">
              {h2h.mostKillsTies} match{h2h.mostKillsTies > 1 ? 's' : ''} à égalité
            </p>
          )}
        </div>

        {/* Direct Kills */}
        <div className="p-4 text-center">
          <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--theme-ui-text-muted)]">
            <Crosshair className="h-4 w-4" /> Kills Directs
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className={killDiff > 0 ? `text-3xl font-black ${slotA.textColor}` : "text-3xl font-bold text-[var(--theme-ui-text)]"}>{h2h.killsAOnB}</span>
            <Minus className="h-4 w-4 text-[var(--theme-ui-text-secondary)] opacity-50" />
            <span className={killDiff < 0 ? `text-3xl font-black ${slotB.textColor}` : "text-3xl font-bold text-[var(--theme-ui-text)]"}>{h2h.killsBOnA}</span>
          </div>
          <p className="mt-2 text-xs font-medium text-[var(--theme-ui-text-secondary)]">
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

      {/* Match History */}
      <div className="p-5">
        <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--theme-ui-text-muted)]">
          <Calendar className="h-4 w-4" /> Derniers croisements (Total: {h2h.commonMatchCount})
        </h4>
        <div className="space-y-3">
          {h2h.matches.slice(0, 3).map((match) => {
            const linkClanId = match.winner === 'B' ? clanB.clanId : clanA.clanId
            return (
              <Link
                key={match.squadMatchId}
                href={`/clans/${linkClanId}/matches/${match.squadMatchId}/telemetry`}
                className="group relative flex items-center justify-between overflow-hidden rounded-lg bg-[var(--theme-bg-base)] p-3 shadow-sm border border-[var(--theme-ui-border)] transition-all hover:border-blue-500/50"
              >
                {/* Background Map Image */}
                <div className="absolute inset-0 z-0 opacity-10 transition-opacity group-hover:opacity-20 pointer-events-none">
                  <MapImage mapKey={match.mapName} className="h-full w-full object-cover object-center" />
                </div>
                
                {/* Left Side: Map & Date */}
                <div className="relative z-10 flex items-center gap-3">
                  <div>
                    <div className="text-sm font-bold text-[var(--theme-ui-text)] group-hover:text-blue-500 transition-colors">
                      {resolveMapName(match.mapName)}
                    </div>
                    <div className="text-xs font-medium text-[var(--theme-ui-text-secondary)]">
                      {formatDate(match.createdAt)}
                    </div>
                  </div>
                </div>
                
                {/* Right Side: Placements & Kills */}
                <div className="relative z-10 flex items-center gap-4 text-lg font-black tracking-tight">
                  <div className="flex flex-col items-center">
                    <span className={match.winner === 'A' ? 'text-blue-500' : 'text-[var(--theme-ui-text-muted)] opacity-70'}>
                      #{match.bestPlacementA ?? '?'}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--theme-ui-text-muted)] mt-0.5">
                      {match.totalKillsA ?? 0} Kills
                    </span>
                  </div>
                  
                  <span className="text-[var(--theme-ui-text-muted)] opacity-30 text-sm mb-4">-</span>
                  
                  <div className="flex flex-col items-center">
                    <span className={match.winner === 'B' ? 'text-orange-500' : 'text-[var(--theme-ui-text-muted)] opacity-70'}>
                      #{match.bestPlacementB ?? '?'}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--theme-ui-text-muted)] mt-0.5">
                      {match.totalKillsB ?? 0} Kills
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
          {h2h.matches.length > 3 && (
            <p className="pt-2 text-center text-xs font-medium text-[var(--theme-ui-text-muted)] opacity-80">
              + {h2h.matches.length - 3} autres matchs communs non affichés
            </p>
          )}
        </div>
      </div>
    </article>
  )
}
