'use client'

import { CalendarDays, Crosshair } from 'lucide-react'
import Link from 'next/link'

import { SectionHeading } from '@/components/clan-stats/PlaystyleSections'
import { SectionBlock } from '@/components/player-playstyle/PlayerPlaystyleSections'
import BodyZonePanel, { bodyZoneSideColor } from '@/components/telemetry/BodyZonePanel'
import { EmptyState, Tag } from '@/components/ui/CharteKit'
import MobileRankList, { type MobileRankRow } from '@/components/ui/MobileRankList'
import RankCell from '@/components/ui/RankCell'
import RankMovement from '@/components/ui/RankMovement'
import SortableTh from '@/components/ui/SortableTh'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePageData } from '@/hooks/usePageData'
import { useTableSort, type SortDirection } from '@/hooks/useTableSort'
import type { ClanBodyZonesMember, ClanBodyZonesReport, MemberBodyZonesReport } from '@/lib/body-zone-service'
import { BODY_ZONE_LABELS, type BodyZoneSide, type BodyZoneSideSummary, type BodyZoneWeek } from '@/lib/body-zone-stats'
import { PERIOD_WHEN_LABELS, type StandardPeriod } from '@/lib/period'

/**
 * Zones d'impact de période (docs/TODO/zones-d-impact.md, lots 3 et 4 ; maquette « Zones-impact » de Claude Design) :
 * sections des pages Style de jeu du joueur et du clan. Les deux panneaux reprennent le bloc du débriefing
 * (`BodyZonePanel`), en touches et en parts ; un taux ne s'affiche qu'à partir de l'échantillon (30 touches pour un
 * joueur, 100 pour le clan), jamais un faux zéro.
 */

const SINCE_LABEL = 'Parties analysées depuis le 13 septembre 2026'
const integer = new Intl.NumberFormat('fr-FR')
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long' })

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value)} %`)

/** « S43 » pour `week-2026-43`. */
function weekLabel(periodKey: string) {
  const week = /week-\d{4}-(\d{2})$/.exec(periodKey)?.[1]
  return week ? `S${Number(week)}` : periodKey
}

/** « vs semaine précédente », « vs septembre » ; rien pour « tous ». */
function previousLabel(period: StandardPeriod, previousKey: string | null) {
  if (!previousKey) return null
  if (period === 'week') return 'vs semaine précédente'
  const match = /month-(\d{4})-(\d{2})$/.exec(previousKey)
  return match ? `vs ${MONTH.format(new Date(Number(match[1]), Number(match[2]) - 1, 1))}` : 'vs période précédente'
}

/** Écart en points arrondi : « +2 pts », « −1 pt », « = » ; et son ton (pour les tirs subis, moins, c'est mieux). */
function pointsOf(points: number, side: BodyZoneSide) {
  const rounded = Math.round(points)
  if (rounded === 0) return { text: '=', color: 'var(--theme-ui-text-muted)', arrow: '=' }
  const better = side === 'dealt' ? rounded > 0 : rounded < 0
  return {
    text: `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} pt${Math.abs(rounded) > 1 ? 's' : ''}`,
    color: better ? 'var(--theme-ui-positive)' : 'var(--theme-ui-negative)',
    arrow: `${rounded > 0 ? '▲' : '▼'} ${Math.abs(rounded)} pt${Math.abs(rounded) > 1 ? 's' : ''}`,
  }
}

// ── Panneau d'un côté ───────────────────────────────────────────────────────────────────────────────

function SidePanel({ side, summary, testId }: { side: BodyZoneSide; summary: BodyZoneSideSummary; testId: string }) {
  const muted = summary.belowSample
  const footerLines: string[] = []
  if (summary.unlocalizedDamage > 0) {
    footerLines.push(
      `+ ${integer.format(Math.round(summary.unlocalizedDamage))} dégâts non localisés${side === 'taken' ? ' (zone, chutes, explosions)' : ''}`
    )
  }
  if (side === 'dealt' && summary.hitsPerMatch !== null) {
    footerLines.push(`${decimal.format(summary.hitsPerMatch)} touches par partie · ${integer.format(summary.matchesMeasured)} partie(s) mesurée(s)`)
  }
  if (side === 'taken' && summary.upperShare !== null && summary.lowerShare !== null) {
    footerLines.push(`Haut du corps ${percent(summary.upperShare)} · bras et jambes ${percent(summary.lowerShare)}`)
  }

  return (
    <BodyZonePanel
      side={side}
      widthBy="hits"
      muted={muted}
      testId={testId}
      bars={summary.zones.map((zone) => ({
        zone: zone.zone,
        label: BODY_ZONE_LABELS[zone.zone],
        hits: zone.hits,
        damage: zone.damage,
        value: `${integer.format(zone.hits)} · ${Math.round(zone.share)} %`,
      }))}
      header={
        <div className="flex flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <b className="text-sm" style={{ color: muted ? 'var(--theme-ui-text-muted)' : bodyZoneSideColor(side) }}>
              {side === 'dealt' ? 'Tirs infligés' : 'Tirs subis'}
            </b>
            {muted ? <Tag tone="warn">Échantillon faible</Tag> : null}
          </span>
          <span className="text-xs text-gray-500">
            {muted
              ? `${integer.format(summary.hits)} touche${summary.hits > 1 ? 's' : ''}, ${summary.minHits} au moins pour un taux`
              : `${integer.format(summary.hits)} touches · ${percent(summary.headRate)} à la tête`}
          </span>
        </div>
      }
      footer={
        footerLines.length > 0 ? (
          <div className="flex flex-col gap-0.5 border-t border-gray-200 pt-1.5 text-[11px] text-gray-500">
            {footerLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        ) : null
      }
    />
  )
}

/** « vs clan » : le taux de tête du joueur, celui du clan, l'écart en points (vert quand il est à l'avantage du joueur). */
function VsClanLine({ side, summary, clanRate }: { side: BodyZoneSide; summary: BodyZoneSideSummary; clanRate: number | null }) {
  if (clanRate === null) return null
  const gap = summary.headRate === null ? null : pointsOf(summary.headRate - clanRate, side)
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 px-1 text-xs text-gray-500" data-testid={`body-zones-vs-clan-${side}`}>
      <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-gray-500">vs clan</span>
      <span>
        Tête : {summary.headRate === null ? 'échantillon faible' : percent(summary.headRate)} · clan {percent(clanRate)}
        {gap ? (
          <>
            {' · '}
            <b className="t-num" style={{ color: gap.color }}>
              {gap.text}
            </b>
          </>
        ) : null}
      </span>
    </p>
  )
}

/**
 * Taux de tête des 8 dernières semaines (tirs infligés), quelle que soit la période choisie : une barre par semaine ISO,
 * la dernière à l'accent ; une semaine sous l'échantillon est dessinée vide (contour en tirets). Échelle d'au moins
 * 20 % : une série presque plate (11 à 13 % pour un clan) reste lisible sans exagérer ses écarts.
 */
function HeadRateWeeksBand({ weeks, evolution, testId }: { weeks: BodyZoneWeek[]; evolution: { points: number | null; label: string | null }; testId: string }) {
  const rates = weeks.map((week) => week.headRate).filter((rate): rate is number => rate !== null)
  const scale = Math.max(20, Math.ceil((Math.max(0, ...rates) * 1.25) / 5) * 5)
  const trend = evolution.points !== null && evolution.label ? pointsOf(evolution.points, 'dealt') : null
  const description = weeks
    .map((week) => `${weekLabel(week.periodKey)} : ${week.headRate === null ? 'échantillon faible' : percent(week.headRate)}`)
    .join(', ')

  return (
    <div className="app-panel-muted flex flex-col gap-2 px-3.5 py-3" data-testid={testId}>
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <b className="text-xs text-gray-700">Taux de tête · {weeks.length} dernières semaines</b>
        {trend ? (
          <b className="t-num text-xs" style={{ color: trend.color }} data-testid={`${testId}-trend`}>
            {trend.arrow} {evolution.label}
          </b>
        ) : null}
      </span>
      <div className="grid h-14 items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }} role="img" aria-label={`Taux de tête par semaine. ${description}`}>
        {weeks.map((week, index) => {
          const last = index === weeks.length - 1
          const title = `${weekLabel(week.periodKey)} · ${week.headRate === null ? `échantillon faible (${integer.format(week.hits)} touches)` : `${percent(week.headRate)} à la tête · ${integer.format(week.hits)} touches`}`
          return week.headRate === null ? (
            <span key={week.periodKey} title={title} className="h-full rounded-[4px] border border-dashed border-gray-200" />
          ) : (
            <span
              key={week.periodKey}
              title={title}
              className="rounded-[4px]"
              style={{
                height: `${Math.max(8, Math.round((week.headRate / scale) * 100))}%`,
                background: last ? 'var(--theme-ui-accent)' : 'color-mix(in srgb, var(--game-sky) 55%, transparent)',
              }}
            />
          )
        })}
      </div>
      <div className="grid gap-1.5 text-center text-[11px] text-gray-500" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.map((week, index) => (
          <span key={week.periodKey} className={index === weeks.length - 1 ? 'font-bold text-gray-900' : ''}>
            {weekLabel(week.periodKey)}
          </span>
        ))}
      </div>
    </div>
  )
}

function SinceNote({ period }: { period: StandardPeriod }) {
  if (period !== 'all') return null
  return (
    <p className="t-meta m-0 flex items-center gap-1.5">
      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
      {SINCE_LABEL}
    </p>
  )
}

function SectionState({ error, loading, empty, period }: { error: string; loading: boolean; empty: boolean; period: StandardPeriod }) {
  if (error) return <p className="app-panel p-3 text-sm text-[var(--theme-ui-negative)]">{error}</p>
  if (loading) return <CardSkeleton />
  if (empty) {
    return (
      <EmptyState
        icon={Crosshair}
        title="Aucune touche localisée sur la période"
        text={`Aucune partie mesurée ${PERIOD_WHEN_LABELS[period]}. Les zones d’impact viennent des parties analysées depuis le 13 septembre 2026.`}
        testId="body-zones-empty"
      />
    )
  }
  return null
}

// ── Style de jeu du joueur ──────────────────────────────────────────────────────────────────────────

const pickMemberReport = (payload: unknown) => (payload as { data?: MemberBodyZonesReport } | null)?.data ?? null

export function MemberBodyZonesSection({ memberId, period }: { memberId: number; period: StandardPeriod }) {
  const { data, loading, error } = usePageData(`/api/members/${memberId}/telemetry/body-zones?period=${period}`, pickMemberReport)

  return (
    <SectionBlock
      id="sec-zones"
      title="Zones d’impact"
      subtitle="Touches localisées par la télémétrie des parties mesurées. Les dégâts qu’un joueur s’inflige ne comptent pas comme infligés."
    >
      <SectionState error={error} loading={loading && !data} empty={Boolean(data && data.matchesMeasured === 0)} period={period} />
      {data && data.matchesMeasured > 0 ? (
        <div aria-busy={loading} className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`} data-testid="body-zones-section">
          <SinceNote period={period} />
          <div className="grid items-start gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <SidePanel side="dealt" summary={data.dealt} testId="body-zones-dealt" />
              <VsClanLine side="dealt" summary={data.dealt} clanRate={data.clan?.dealtHeadRate ?? null} />
              <HeadRateWeeksBand
                weeks={data.weeks}
                evolution={{ points: data.trend.dealtHead, label: previousLabel(period, data.previousKey) }}
                testId="body-zones-weeks"
              />
            </div>
            <div className="flex flex-col gap-2">
              <SidePanel side="taken" summary={data.taken} testId="body-zones-taken" />
              <VsClanLine side="taken" summary={data.taken} clanRate={data.clan?.takenHeadRate ?? null} />
            </div>
          </div>
        </div>
      ) : null}
    </SectionBlock>
  )
}

// ── Style de jeu du clan ────────────────────────────────────────────────────────────────────────────

const pickClanReport = (payload: unknown) => (payload as { data?: ClanBodyZonesReport } | null)?.data ?? null

function KeyFigure({ label, value, detail, trend, testId }: { label: string; value: string; detail: string; trend?: { text: string; color: string } | null; testId: string }) {
  return (
    <article className="app-panel-muted flex flex-col gap-1 px-3.5 py-3" data-testid={testId}>
      <span className="t-label">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="t-hero t-hero--sm text-gray-900">{value}</span>
        {trend ? (
          <b className="t-num text-xs" style={{ color: trend.color }}>
            {trend.text}
          </b>
        ) : null}
      </span>
      <span className="t-meta">{detail}</span>
    </article>
  )
}

type MemberSortKey = 'head' | 'torso' | 'lowerTaken' | 'matches' | 'hits'

const MEMBER_SORTS: Array<{ value: MemberSortKey; label: string }> = [
  { value: 'head', label: 'Tête %' },
  { value: 'torso', label: 'Torse %' },
  { value: 'lowerTaken', label: 'Bras + jambes subis' },
  { value: 'matches', label: 'Parties' },
  { value: 'hits', label: 'Touches' },
]

const torsoShare = (member: ClanBodyZonesMember) => member.dealt.zones.find((zone) => zone.zone === 'torso')?.share ?? 0
const SORT_VALUE: Record<MemberSortKey, (member: ClanBodyZonesMember) => number> = {
  head: (member) => member.dealt.headRate ?? -1,
  torso: torsoShare,
  lowerTaken: (member) => member.taken.lowerShare ?? -1,
  matches: (member) => member.matchesMeasured,
  hits: (member) => member.dealt.hits,
}
const SORT_TEXT: Record<MemberSortKey, (member: ClanBodyZonesMember) => string> = {
  head: (member) => percent(member.dealt.headRate),
  torso: (member) => (member.dealt.belowSample ? '—' : percent(torsoShare(member))),
  lowerTaken: (member) => percent(member.taken.lowerShare),
  matches: (member) => integer.format(member.matchesMeasured),
  hits: (member) => integer.format(member.dealt.hits),
}

/** Classés d'abord (tri demandé), puis les membres sous l'échantillon, sans rang, par parties. */
function sortMembers(members: ClanBodyZonesMember[], key: MemberSortKey, direction: SortDirection) {
  const ranked = members.filter((member) => member.rank !== null)
  const unranked = members.filter((member) => member.rank === null).sort((a, b) => b.matchesMeasured - a.matchesMeasured)
  const sign = direction === 'desc' ? -1 : 1
  ranked.sort((a, b) => sign * (SORT_VALUE[key](a) - SORT_VALUE[key](b)) || (a.rank ?? 0) - (b.rank ?? 0))
  return { ranked, unranked }
}

function MemberTable({ members, showMovement }: { members: ClanBodyZonesMember[]; showMovement: boolean }) {
  const { sortKey, sortDir, onSort, colTint } = useTableSort<MemberSortKey>('head')
  const { ranked, unranked } = sortMembers(members, sortKey, sortDir)
  const th = { sortKey, sortDir, onSort }
  const TD = 'px-[9px] py-2 text-right tabular-nums'
  const cell = (key: MemberSortKey) => `${TD} ${key === sortKey ? 'font-bold text-gray-900' : 'text-gray-700'}`
  const tint = (key: MemberSortKey) => ({ backgroundColor: colTint(key) })

  const mobileRows: MobileRankRow[] = ranked.map((member) => ({
    key: member.memberId,
    rank: member.rank ?? 0,
    name: member.displayName,
    href: `/members/${member.memberId}/playstyle`,
    subline: `${integer.format(member.matchesMeasured)} partie(s) · ${integer.format(member.dealt.hits)} touches`,
    value: SORT_TEXT[sortKey](member),
    details: MEMBER_SORTS.map((sort) => ({ label: sort.label, value: SORT_TEXT[sort.value](member) })),
  }))

  return (
    <div className="flex flex-col gap-2.5" data-testid="body-zones-members">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-[15px] font-extrabold text-gray-900">Qui vise la tête ?</h3>
        <span className="text-[13px] text-gray-500">Membres classés par taux de tête, à 30 touches au moins.</span>
      </div>

      <MobileRankList
        rows={mobileRows}
        sortOptions={MEMBER_SORTS}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={onSort}
        metricLabel={MEMBER_SORTS.find((sort) => sort.value === sortKey)?.label ?? ''}
        linkLabel="Voir son style de jeu"
      />
      {unranked.length > 0 ? (
        <p className="t-meta m-0 md:hidden" data-testid="body-zones-unranked">
          Sous l’échantillon : {unranked.map((member) => `${member.displayName} (${integer.format(member.dealt.hits)} touches)`).join(', ')}.
        </p>
      ) : null}

      <div className="app-table-shell hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-[13px]">
            <thead className="app-table-head">
              <tr>
                <SortableTh align="left" className="pl-3" title="Rang au taux de tête">#</SortableTh>
                <SortableTh align="left">Joueur</SortableTh>
                <SortableTh {...th} column="matches">Parties</SortableTh>
                <SortableTh {...th} column="hits" title="Touches localisées infligées">Touches</SortableTh>
                <SortableTh {...th} column="head" title="Touches à la tête sur les touches localisées infligées">Tête %</SortableTh>
                <SortableTh {...th} column="torso" title="Touches au torse sur les touches localisées infligées">Torse %</SortableTh>
                <SortableTh {...th} column="lowerTaken" title="Tirs subis aux bras et aux jambes : des adversaires qui ne touchent que ce qui dépasse de l’abri">
                  Bras + jambes subis
                </SortableTh>
                {showMovement ? <SortableTh className="pr-3" title="Rang au taux de tête contre la période précédente">Évolution</SortableTh> : null}
              </tr>
            </thead>
            <tbody>
              {[...ranked, ...unranked].map((member) => {
                const rank = member.rank
                const rowClass = rank !== null && rank <= 3 ? `app-table-row app-table-row--top${rank}` : 'app-table-row'
                return (
                  <tr key={member.memberId} className={rank === null ? `${rowClass} opacity-60` : rowClass} data-testid="body-zones-member-row">
                    <td className="py-2 pl-3 pr-[9px]">{rank === null ? <span className="pl-1.5 text-gray-500">—</span> : <RankCell rank={rank} />}</td>
                    <td className="whitespace-nowrap px-[9px] py-2 font-semibold text-gray-900">
                      <Link href={`/members/${member.memberId}/playstyle`} className="hover:text-[var(--theme-ui-accent-text)]">
                        {member.displayName}
                      </Link>
                    </td>
                    <td className={cell('matches')} style={tint('matches')}>{SORT_TEXT.matches(member)}</td>
                    <td className={cell('hits')} style={tint('hits')}>{SORT_TEXT.hits(member)}</td>
                    <td className={cell('head')} style={tint('head')}>{SORT_TEXT.head(member)}</td>
                    <td className={cell('torso')} style={tint('torso')}>{SORT_TEXT.torso(member)}</td>
                    <td className={cell('lowerTaken')} style={tint('lowerTaken')}>{SORT_TEXT.lowerTaken(member)}</td>
                    {showMovement ? (
                      <td className="px-[9px] py-2 pr-3 text-right">
                        {rank === null ? (
                          <span className="text-gray-500">—</span>
                        ) : member.isNew || member.previousRank !== null ? (
                          <RankMovement rank={rank} previousRank={member.isNew ? null : member.previousRank} />
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export function ClanBodyZonesSection({ clanId, period }: { clanId: number; period: StandardPeriod }) {
  const { data, loading, error } = usePageData(`/api/clans/${clanId}/telemetry/body-zones?period=${period}`, pickClanReport)
  const trend = data && data.trend.dealtHead !== null ? pointsOf(data.trend.dealtHead, 'dealt') : null

  return (
    <section id="sec-zones" aria-labelledby="sec-zones-title" className="flex flex-col gap-3">
      <SectionHeading
        id="sec-zones-title"
        title="Zones d’impact"
        subtitle="Où les tirs du clan touchent, et où ses joueurs sont touchés : somme des membres actifs, touches localisées par la télémétrie."
      />
      <SectionState error={error} loading={loading && !data} empty={Boolean(data && data.matchesMeasured === 0)} period={period} />
      {data && data.matchesMeasured > 0 ? (
        <div aria-busy={loading} className={`flex flex-col gap-3 transition-opacity ${loading ? 'opacity-60' : ''}`} data-testid="body-zones-section">
          <SinceNote period={period} />
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <KeyFigure
              testId="body-zones-figure-head"
              label="Taux de tête du clan"
              value={percent(data.dealt.headRate)}
              trend={trend && trend.text !== '=' ? { text: trend.arrow, color: trend.color } : null}
              detail={data.dealt.belowSample ? `${integer.format(data.dealt.hits)} touches, ${data.dealt.minHits} au moins` : 'des touches localisées infligées'}
            />
            <KeyFigure testId="body-zones-figure-upper" label="Haut du corps subi" value={percent(data.taken.upperShare)} detail="tête et torse, tirs subis" />
            <KeyFigure testId="body-zones-figure-lower" label="Bras et jambes subis" value={percent(data.taken.lowerShare)} detail="ce qui dépasse de l’abri" />
            <KeyFigure
              testId="body-zones-figure-per-match"
              label="Touches par partie"
              value={data.dealt.hitsPerMatch === null ? '—' : decimal.format(data.dealt.hitsPerMatch)}
              detail="localisées, par joueur et par partie"
            />
          </div>
          <div className="grid items-start gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <SidePanel side="dealt" summary={data.dealt} testId="body-zones-dealt" />
              <HeadRateWeeksBand
                weeks={data.weeks}
                evolution={{ points: data.trend.dealtHead, label: previousLabel(period, data.previousKey) }}
                testId="body-zones-weeks"
              />
            </div>
            <SidePanel side="taken" summary={data.taken} testId="body-zones-taken" />
          </div>
          {data.members.length > 0 ? <MemberTable key={period} members={data.members} showMovement={period !== 'all'} /> : null}
        </div>
      ) : null}
    </section>
  )
}
