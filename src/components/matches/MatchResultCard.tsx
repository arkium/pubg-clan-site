import Link from 'next/link'

import TeamModeBadge from '@/components/ui/TeamModeBadge'
import MatchTypeBadge from '@/components/ui/MatchTypeBadge'
import { matchDebriefPath, matchTelemetryAuditPath } from '@/lib/match-links'
import { killBars, sessionDateOf, teamModeOf } from '@/lib/match-sessions'
import { mapAssetUrl } from '@/lib/pubg-assets'
import { isTelemetryDataExpiredError } from '@/lib/pubg-telemetry/telemetry-error-presentation'
import type { SquadMatch, SquadPeriod } from '@/types/squad-matches'

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const numberFormat = new Intl.NumberFormat('fr-FR')

function telemetryState(match: SquadMatch): { color: string; label: string; title: string; ready: boolean } {
  const status = match.telemetry?.status ?? 'pending'
  if (status === 'success') {
    return { color: 'var(--game-pos)', label: 'Télémétrie prête', title: 'Télémétrie analysée : débriefing disponible', ready: true }
  }
  if (status === 'failed' && isTelemetryDataExpiredError(match.telemetry?.errorCode, match.telemetry?.errorMessage)) {
    return {
      color: 'var(--theme-ui-text-muted)',
      label: 'Télémétrie expirée',
      title: 'Donnée expirée côté PUBG (rétention d’environ 14 jours) : ce match ne sera plus disponible.',
      ready: false,
    }
  }
  if (status === 'failed') {
    return { color: 'var(--game-neg)', label: 'Télémétrie en erreur', title: 'L’analyse a échoué : détail dans l’audit technique.', ready: false }
  }
  return { color: 'var(--game-warn)', label: 'Télémétrie en attente', title: 'Analyse en cours, revenir plus tard.', ready: false }
}

/**
 * Carte de fin de partie (page d'une soirée) : image de la carte, grande place « #3/26 », tampon « Chicken dinner »,
 * kills par joueur en barres, trois chiffres, état de la télémétrie réduit à un point. Les informations techniques
 * (parser, fichier local, événements) restent dans l'audit et la page de pilotage de la télémétrie.
 */
export default function MatchResultCard({
  clanId,
  period,
  match,
  mapLabel,
  sessionMaxKills,
  selected,
}: {
  clanId: number
  period: SquadPeriod
  match: SquadMatch
  mapLabel: string
  sessionMaxKills: number
  selected: boolean
}) {
  const image = mapAssetUrl(match.mapName)
  const state = telemetryState(match)
  const viewContext = { period, fromDate: sessionDateOf(match.createdAt) }
  const minutes = Math.round(match.durationSeconds / 60)
  const placeColor = match.isWin ? '#fbbf24' : match.placement <= 5 ? '#6ee7b7' : '#fff'

  return (
    <article
      id={`match-${match.id}`}
      className="app-panel flex scroll-mt-28 flex-col overflow-hidden p-0"
      style={
        selected
          ? { borderColor: 'var(--theme-ui-accent-ring)', boxShadow: '0 0 0 3px var(--theme-ui-accent-soft)' }
          : match.isWin
            ? { borderColor: 'var(--game-gold-ring)' }
            : undefined
      }
      aria-label={`${timeFormat.format(new Date(match.createdAt))} · ${mapLabel} · place ${match.placement}`}
    >
      <div
        className="relative h-24 bg-cover bg-center"
        style={{ backgroundColor: '#0b1120', backgroundImage: image ? `url('${image}')` : undefined }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 to-slate-950/15" aria-hidden="true" />
        <div className="absolute inset-x-3 bottom-2.5 flex items-end justify-between text-white">
          <div>
            <p className="text-[11px] text-white/75">
              {timeFormat.format(new Date(match.createdAt))}
              {minutes > 0 ? ` · ${minutes} min` : ''}
            </p>
            <p className="text-[17px] font-extrabold">{mapLabel}</p>
          </div>
          <p className="text-right text-[30px] font-black leading-none tracking-[-0.03em]" style={{ color: placeColor }}>
            #{match.placement}
            {match.teamCount ? <span className="text-[13px] font-semibold text-white/65">/{match.teamCount}</span> : null}
          </p>
        </div>
        {match.isWin && (
          <span className="absolute left-3 top-2.5 -rotate-3 rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.04em] text-amber-950">
            Chicken dinner
          </span>
        )}
        <span className="absolute right-3 top-2.5 flex items-center gap-1">
          <MatchTypeBadge matchType={match.matchType} />
          <TeamModeBadge mode={teamModeOf(match.members.length)} size="xs" />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <ul className="flex flex-col gap-1.5" aria-label="Kills par joueur">
          {killBars(match.members, sessionMaxKills).map((bar) => (
            <li key={bar.name} className="grid items-center gap-2 text-xs [grid-template-columns:1fr_70px_22px]">
              <span className="truncate font-semibold">{bar.name}</span>
              <span className="h-1.5 rounded-full" style={{ background: 'var(--game-track)' }} aria-hidden="true">
                <span className="block h-1.5 rounded-full" style={{ width: `${bar.percent}%`, background: 'var(--game-neg)' }} />
              </span>
              <b className="text-right tabular-nums">{bar.kills}</b>
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-3 gap-1.5 tabular-nums">
          {[
            { label: 'Kills', value: numberFormat.format(match.totalKills) },
            { label: 'Dégâts', value: numberFormat.format(Math.round(match.totalDamage)) },
            { label: 'Réa.', value: numberFormat.format(match.totalRevives) },
          ].map((stat) => (
            <div key={stat.label} className="app-panel-muted px-2 py-1.5">
              <dt className="text-[10px] font-semibold uppercase text-gray-500">{stat.label}</dt>
              <dd className="text-[15px] font-extrabold">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500" title={state.title}>
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: state.color }} aria-hidden="true" />
            {state.label}
          </span>
          {state.ready ? (
            <Link
              href={matchDebriefPath(clanId, match.id, viewContext)}
              className="inline-flex h-[30px] items-center rounded-lg px-3 text-xs font-bold text-white"
              style={{ background: 'var(--theme-ui-accent)' }}
            >
              Débriefing
            </Link>
          ) : (
            <Link
              href={matchTelemetryAuditPath(clanId, match.id, viewContext)}
              className="inline-flex h-[30px] items-center rounded-lg border border-gray-200 px-3 text-xs font-bold text-gray-700 hover:bg-gray-50"
            >
              État
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
