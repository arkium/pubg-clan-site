import { Prisma, type Report } from '@prisma/client'

import { notifyReportReady } from '@/lib/notification-service'
import { prisma } from '@/lib/prisma'
import type {
  ReportChartsData,
  ReportDetailResponse,
  ReportFilterType,
  ReportHighlightEntry,
  ReportHighlightsData,
  ReportListResponse,
  ReportPlayerStats,
  ReportProgressionData,
  ReportSectionItem,
  ReportSummary,
  ReportType,
} from '@/types/reports'

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const HEATMAP_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type SquadMatchWithMembers = Awaited<ReturnType<typeof fetchMatchesForPeriod>>[number]
type ReportSectionRecord = {
  id: string
  sectionType: string
  title: string
  content: Prisma.JsonValue
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function endOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function safeDivide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0
}

function roundNumber(value: number, digits = 2) {
  return Number(value.toFixed(digits))
}

function normalizePeriodStart(type: ReportType, referenceDate: Date) {
  if (type === 'weekly') {
    const next = startOfDay(referenceDate)
    const day = next.getDay()
    const diff = day === 0 ? -6 : 1 - day
    next.setDate(next.getDate() + diff)
    return next
  }

  return new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0)
}

function getPeriodEnd(type: ReportType, periodStart: Date) {
  if (type === 'weekly') {
    return endOfDay(addDays(periodStart, 6))
  }

  return new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59, 999)
}

function getPreviousPeriodStart(type: ReportType, periodStart: Date) {
  return type === 'weekly' ? addDays(periodStart, -7) : addMonths(periodStart, -1)
}

function getComparisonLabel(type: ReportType) {
  return type === 'weekly' ? 'vs semaine précédente' : 'vs mois précédent'
}

function getTypeLabel(type: ReportType) {
  return type === 'weekly' ? 'Hebdomadaire' : 'Mensuel'
}

function formatPeriodLabel(start: string, end: string) {
  return `${start.slice(0, 10)} → ${end.slice(0, 10)}`
}

async function fetchMatchesForPeriod(clanId: number, periodStart: Date, periodEnd: Date) {
  return prisma.squadMatch.findMany({
    where: {
      createdAt: {
        gte: periodStart,
        lte: periodEnd,
      },
      members: {
        some: {
          member: {
            clanId,
            isActive: true,
            joinStatus: 'active',
          },
        },
      },
    },
    include: {
      members: {
        include: {
          member: {
            select: {
              id: true,
              displayName: true,
            },
          },
        },
        orderBy: {
          memberId: 'asc',
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  })
}

function calculateMvpScores(players: ReportPlayerStats[]) {
  const maxKills = Math.max(...players.map((player) => player.kills), 1)
  const maxDamage = Math.max(...players.map((player) => player.damage), 1)
  const maxWinRate = Math.max(...players.map((player) => player.winRate), 1)

  for (const player of players) {
    player.mvpScore = roundNumber(
      player.kills / maxKills + player.damage / maxDamage + player.winRate / maxWinRate,
      3
    )
  }
}

function buildPlayerStatsMap(matches: SquadMatchWithMembers[], previousPlayers: ReportPlayerStats[]) {
  const previousByMember = new Map(previousPlayers.map((player) => [player.memberId, player]))
  const aggregates = new Map<number, ReportPlayerStats>()

  for (const match of matches) {
    for (const member of match.members) {
      const player = aggregates.get(member.memberId) ?? {
        memberId: member.memberId,
        displayName: member.member.displayName,
        matches: 0,
        kills: 0,
        damage: 0,
        assists: 0,
        revives: 0,
        wins: 0,
        winRate: 0,
        avgKills: 0,
        avgDamage: 0,
        mvpScore: 0,
        progression: {
          kills: 0,
          damage: 0,
          assists: 0,
          matches: 0,
          winRate: 0,
        },
      }

      player.matches += 1
      player.kills += member.kills
      player.damage += member.damage
      player.assists += member.assists
      player.revives += member.revives
      player.wins += match.placement === 1 ? 1 : 0
      aggregates.set(member.memberId, player)
    }
  }

  const players = Array.from(aggregates.values()).map((player) => {
    const previous = previousByMember.get(player.memberId)
    player.winRate = safeDivide(player.wins, player.matches)
    player.avgKills = safeDivide(player.kills, player.matches)
    player.avgDamage = safeDivide(player.damage, player.matches)
    player.progression = {
      kills: player.kills - (previous?.kills ?? 0),
      damage: roundNumber(player.damage - (previous?.damage ?? 0)),
      assists: player.assists - (previous?.assists ?? 0),
      matches: player.matches - (previous?.matches ?? 0),
      winRate: roundNumber(player.winRate - (previous?.winRate ?? 0), 4),
    }
    return player
  })

  calculateMvpScores(players)

  return players.sort((left, right) => {
    if (right.kills !== left.kills) return right.kills - left.kills
    if (right.damage !== left.damage) return right.damage - left.damage
    return left.displayName.localeCompare(right.displayName)
  })
}

function buildStoredPlayerStats(players: ReportPlayerStats[]) {
  return players.reduce<Record<string, ReportPlayerStats>>((accumulator, player) => {
    accumulator[String(player.memberId)] = player
    return accumulator
  }, {})
}

function readStoredPlayerStats(value: Prisma.JsonValue): ReportPlayerStats[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  return Object.values(value).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return []
    }

    const candidate = entry as Partial<ReportPlayerStats>
    if (typeof candidate.memberId !== 'number' || typeof candidate.displayName !== 'string') {
      return []
    }

    return [
      {
        memberId: candidate.memberId,
        displayName: candidate.displayName,
        matches: candidate.matches ?? 0,
        kills: candidate.kills ?? 0,
        damage: candidate.damage ?? 0,
        assists: candidate.assists ?? 0,
        revives: candidate.revives ?? 0,
        wins: candidate.wins ?? 0,
        winRate: candidate.winRate ?? 0,
        avgKills: candidate.avgKills ?? 0,
        avgDamage: candidate.avgDamage ?? 0,
        mvpScore: candidate.mvpScore ?? 0,
        progression: {
          kills: candidate.progression?.kills ?? 0,
          damage: candidate.progression?.damage ?? 0,
          assists: candidate.progression?.assists ?? 0,
          matches: candidate.progression?.matches ?? 0,
          winRate: candidate.progression?.winRate ?? 0,
        },
      },
    ]
  }).sort((left, right) => {
    if (right.kills !== left.kills) return right.kills - left.kills
    if (right.damage !== left.damage) return right.damage - left.damage
    return left.displayName.localeCompare(right.displayName)
  })
}

function toHighlightEntry(
  player: ReportPlayerStats | undefined,
  metric: 'kills' | 'damage' | 'winRate' | 'mvp',
  subtitleBuilder: (entry: ReportPlayerStats) => string
): ReportHighlightEntry | null {
  if (!player) {
    return null
  }

  return {
    memberId: player.memberId,
    displayName: player.displayName,
    value:
      metric === 'winRate'
        ? player.winRate
        : metric === 'damage'
          ? player.damage
          : metric === 'mvp'
            ? player.mvpScore
            : player.kills,
    subtitle: subtitleBuilder(player),
  }
}

function topKillerSubtitle(entry: ReportPlayerStats) {
  return `${entry.kills} kills`
}

function topDamageSubtitle(entry: ReportPlayerStats) {
  return `${Math.round(entry.damage)} dmg`
}

function bestWinRateSubtitle(entry: ReportPlayerStats) {
  return `${(entry.winRate * 100).toFixed(1)}% win rate`
}

function mvpSubtitle(entry: ReportPlayerStats) {
  return `Score ${entry.mvpScore.toFixed(2)}`
}

function buildHighlights(players: ReportPlayerStats[]): ReportHighlightsData {
  const withMatches = players.filter((player) => player.matches > 0)
  const withMinimumMatches = players.filter((player) => player.matches >= 3)

  const topKiller = [...withMatches].sort((left, right) => right.kills - left.kills)[0]
  const topDamage = [...withMatches].sort((left, right) => right.damage - left.damage)[0]
  const bestWinRate = [...(withMinimumMatches.length > 0 ? withMinimumMatches : withMatches)].sort(
    (left, right) => right.winRate - left.winRate
  )[0]
  const mvp = [...withMatches].sort((left, right) => right.mvpScore - left.mvpScore)[0]

  return {
    topKiller: toHighlightEntry(topKiller, 'kills', topKillerSubtitle),
    topDamage: toHighlightEntry(topDamage, 'damage', topDamageSubtitle),
    bestWinRate: toHighlightEntry(bestWinRate, 'winRate', bestWinRateSubtitle),
    mvp: toHighlightEntry(mvp, 'mvp', mvpSubtitle),
  }
}

function buildCharts(matches: SquadMatchWithMembers[], players: ReportPlayerStats[]): ReportChartsData {
  const timeline = new Map<string, { kills: number; damage: number }>()
  const modeBreakdown = new Map<string, number>()
  const heatmap = new Map<string, number>()

  for (const match of matches) {
    const label = match.createdAt.toISOString().slice(0, 10)
    const currentTimeline = timeline.get(label) ?? { kills: 0, damage: 0 }
    currentTimeline.kills += match.totalKills
    currentTimeline.damage += match.totalDamage
    timeline.set(label, currentTimeline)

    modeBreakdown.set(match.gameMode, (modeBreakdown.get(match.gameMode) ?? 0) + 1)

    const weekdayIndex = match.createdAt.getDay()
    const dayLabel = HEATMAP_DAY_LABELS[(weekdayIndex + 6) % 7] ?? 'Mon'
    const hour = match.createdAt.getHours()
    heatmap.set(`${dayLabel}-${hour}`, (heatmap.get(`${dayLabel}-${hour}`) ?? 0) + 1)
  }

  return {
    timeline: Array.from(timeline.entries()).map(([label, values]) => ({
      label,
      kills: values.kills,
      damage: roundNumber(values.damage),
    })),
    playerComparison: players.slice(0, 6).map((player) => ({
      memberId: player.memberId,
      displayName: player.displayName,
      kills: player.kills,
      damage: roundNumber(player.damage),
    })),
    modeBreakdown: Array.from(modeBreakdown.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value),
    activityHeatmap: HEATMAP_DAY_LABELS.flatMap((day) =>
      Array.from({ length: 24 }, (_, hour) => ({
        day,
        hour,
        count: heatmap.get(`${day}-${hour}`) ?? 0,
      }))
    ),
  }
}

function buildAggregateDelta(
  currentPlayers: ReportPlayerStats[],
  previousPlayers: ReportPlayerStats[],
  currentMatches: SquadMatchWithMembers[],
  previousMatches: SquadMatchWithMembers[]
) {
  const currentDamage = currentPlayers.reduce((sum, player) => sum + player.damage, 0)
  const previousDamage = previousPlayers.reduce((sum, player) => sum + player.damage, 0)
  const currentKills = currentPlayers.reduce((sum, player) => sum + player.kills, 0)
  const previousKills = previousPlayers.reduce((sum, player) => sum + player.kills, 0)
  const currentAssists = currentPlayers.reduce((sum, player) => sum + player.assists, 0)
  const previousAssists = previousPlayers.reduce((sum, player) => sum + player.assists, 0)
  const currentWinRate = safeDivide(
    currentMatches.filter((match) => match.placement === 1).length,
    currentMatches.length
  )
  const previousWinRate = safeDivide(
    previousMatches.filter((match) => match.placement === 1).length,
    previousMatches.length
  )

  return {
    kills: currentKills - previousKills,
    damage: roundNumber(currentDamage - previousDamage),
    assists: currentAssists - previousAssists,
    matches: currentMatches.length - previousMatches.length,
    winRate: roundNumber(currentWinRate - previousWinRate, 4),
    totalMatches: currentMatches.length,
  }
}

function buildProgressionSection(
  currentPlayers: ReportPlayerStats[],
  previousPlayers: ReportPlayerStats[],
  currentMatches: SquadMatchWithMembers[],
  previousMatches: SquadMatchWithMembers[],
  type: ReportType
): ReportProgressionData {
  return {
    comparisonLabel: getComparisonLabel(type),
    aggregateDelta: buildAggregateDelta(currentPlayers, previousPlayers, currentMatches, previousMatches),
    players: currentPlayers,
  }
}

function buildRecommendations(
  players: ReportPlayerStats[],
  matches: SquadMatchWithMembers[],
  avgTeamSize: number,
  avgWinRate: number
) {
  const recommendations: string[] = []

  if (matches.length === 0) {
    return [
      'Planifiez une session de clan cette période pour alimenter le prochain rapport.',
      'Relancez les membres inactifs via les notifications pour augmenter la participation.',
    ]
  }

  if (avgTeamSize < 3) {
    recommendations.push('Essayez de former des squads plus stables pour améliorer la coordination.')
  }

  if (avgWinRate < 0.2) {
    recommendations.push('Travaillez les rotations et les fins de partie pour augmenter le win rate.')
  }

  const supportLeader = [...players].sort((left, right) => right.revives - left.revives)[0]
  if (supportLeader && supportLeader.revives > 0) {
    recommendations.push(
      `Capitalisez sur ${supportLeader.displayName} en support : ${supportLeader.revives} revives sur la période.`
    )
  }

  const lowVolumePlayers = players.filter((player) => player.matches > 0 && player.matches <= 2)
  if (lowVolumePlayers.length > 0) {
    recommendations.push(
      `Intégrez davantage ${lowVolumePlayers
        .slice(0, 2)
        .map((player) => player.displayName)
        .join(' et ')} pour équilibrer le temps de jeu du clan.`
    )
  }

  if (recommendations.length < 2) {
    recommendations.push('Continuez sur cette dynamique et surveillez la progression joueur par joueur.')
  }

  return recommendations.slice(0, 3)
}

function getSectionsByType(sections: ReportSectionRecord[]) {
  return new Map(sections.map((section) => [section.sectionType, section]))
}

function buildInsightsFromData(
  report: Pick<Report, 'type' | 'totalKills' | 'totalMatches' | 'avgWinRate' | 'playerStats'>,
  sections: ReportSectionRecord[]
) {
  const players = readStoredPlayerStats(report.playerStats)
  const sectionsByType = getSectionsByType(sections)
  const charts = sectionsByType.get('charts')?.content as ReportChartsData | undefined
  const progression = sectionsByType.get('progression')?.content as ReportProgressionData | undefined

  if (!charts || report.totalMatches === 0) {
    return ['Aucun match squad sur la période, les insights seront disponibles au prochain rapport.']
  }

  const bestDay = [...charts.timeline].sort((left, right) => {
    const totalRight = right.kills + right.damage / 100
    const totalLeft = left.kills + left.damage / 100
    return totalRight - totalLeft
  })[0]
  const dayName = bestDay ? WEEKDAY_LABELS[new Date(bestDay.label).getDay()] ?? bestDay.label : 'N/A'

  const hotHours = [...charts.activityHeatmap]
    .sort((left, right) => right.count - left.count)
    .slice(0, 3)
    .map((entry) => entry.hour)
    .sort((left, right) => left - right)

  const activeHours =
    hotHours.length > 0 ? `${hotHours[0]}h-${hotHours[hotHours.length - 1] + 1}h` : 'N/A'

  const winsByCombo = new Map<string, number>()
  const bestCombo = charts.playerComparison
    .slice(0, 2)
    .map((player) => player.displayName)
    .join(' + ')

  if (bestCombo.length > 0) {
    winsByCombo.set(bestCombo, Math.max(1, Math.round(report.avgWinRate * report.totalMatches)))
  }

  const bestImprovement = [...players].sort((left, right) => {
    const leftBase = left.kills - left.progression.kills
    const rightBase = right.kills - right.progression.kills
    const leftImprovement =
      left.progression.kills > 0 ? left.progression.kills / Math.max(leftBase, 1) : -Infinity
    const rightImprovement =
      right.progression.kills > 0 ? right.progression.kills / Math.max(rightBase, 1) : -Infinity
    return rightImprovement - leftImprovement
  })[0]

  const overallTrend =
    progression && progression.aggregateDelta.kills !== 0
      ? progression.aggregateDelta.kills > 0
        ? `Trend analysis: +${progression.aggregateDelta.kills} kills ${progression.comparisonLabel}.`
        : `Trend analysis: ${progression.aggregateDelta.kills} kills ${progression.comparisonLabel}.`
      : `Trend analysis: rythme stable ${progression?.comparisonLabel ?? getComparisonLabel(report.type as ReportType)}.`

  return [
    `Best week day: ${dayName} (${bestDay?.kills ?? 0} kills cumulés).`,
    `Most active hours: ${activeHours}.`,
    `Best squad combo: ${bestCombo || 'Aucune combinaison gagnante identifiée'} (${winsByCombo.get(bestCombo) ?? 0} wins).`,
    bestImprovement && bestImprovement.progression.kills > 0
      ? `Biggest improvement: ${bestImprovement.displayName} (+${bestImprovement.progression.kills} kills).`
      : 'Biggest improvement: progression homogène sur l’ensemble du roster.',
    overallTrend,
  ]
}

function toSectionItems(sections: ReportSectionRecord[]): ReportSectionItem[] {
  return sections.map((section) => ({
    id: section.id,
    sectionType: section.sectionType,
    title: section.title,
    content: section.content,
  }))
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function toJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue
}

function toJsonValue(value: unknown) {
  return value as Prisma.JsonValue
}

function progressLabel(value: number, suffix = '') {
  if (value > 0) return `↑ +${suffix === '%' ? (value * 100).toFixed(1) : Math.round(value)}${suffix}`
  if (value < 0) return `↓ ${suffix === '%' ? (value * 100).toFixed(1) : Math.round(value)}${suffix}`
  return '→ 0'
}

function serializeReportSummary(dbReport: Report & { clan: { name: string } }): ReportSummary {
  const players = readStoredPlayerStats(dbReport.playerStats)
  const highlights = buildHighlights(players)

  return {
    id: dbReport.id,
    clanId: dbReport.clanId,
    clanName: dbReport.clan.name,
    type: dbReport.type as ReportType,
    periodStart: dbReport.periodStart.toISOString(),
    periodEnd: dbReport.periodEnd.toISOString(),
    totalMatches: dbReport.totalMatches,
    totalKills: dbReport.totalKills,
    totalDamage: dbReport.totalDamage,
    avgTeamSize: dbReport.avgTeamSize,
    avgWinRate: dbReport.avgWinRate,
    createdAt: dbReport.createdAt.toISOString(),
    highlights,
  }
}

async function buildReportRecord(clanId: number, type: ReportType, referenceStart: Date) {
  const periodStart = normalizePeriodStart(type, referenceStart)
  const periodEnd = getPeriodEnd(type, periodStart)
  const previousPeriodStart = getPreviousPeriodStart(type, periodStart)
  const previousPeriodEnd = getPeriodEnd(type, previousPeriodStart)

  const [clan, matches, previousMatches] = await Promise.all([
    prisma.clan.findUnique({
      where: { id: clanId },
      select: {
        id: true,
        name: true,
        members: {
          where: { isActive: true, joinStatus: 'active' },
          select: { id: true },
        },
      },
    }),
    fetchMatchesForPeriod(clanId, periodStart, periodEnd),
    fetchMatchesForPeriod(clanId, previousPeriodStart, previousPeriodEnd),
  ])

  if (!clan) {
    throw new Error('Clan not found')
  }

  const previousPlayers = buildPlayerStatsMap(previousMatches, [])
  const currentPlayers = buildPlayerStatsMap(matches, previousPlayers)
  const highlights = buildHighlights(currentPlayers)
  const totalKills = matches.reduce((sum, match) => sum + match.totalKills, 0)
  const totalDamage = matches.reduce((sum, match) => sum + match.totalDamage, 0)
  const avgTeamSize = roundNumber(
    safeDivide(
      matches.reduce((sum, match) => sum + match.members.length, 0),
      matches.length
    )
  )
  const avgWinRate = roundNumber(
    safeDivide(
      matches.filter((match) => match.placement === 1).length,
      matches.length
    ),
    4
  )
  const charts = buildCharts(matches, currentPlayers)
  const progression = buildProgressionSection(
    currentPlayers,
    previousPlayers,
    matches,
    previousMatches,
    type
  )
  const recommendations = buildRecommendations(currentPlayers, matches, avgTeamSize, avgWinRate)

  const reportLike = {
    type,
    totalKills,
    totalMatches: matches.length,
    avgWinRate,
    playerStats: buildStoredPlayerStats(currentPlayers) as unknown as Prisma.JsonValue,
  }

  const sectionsInput = [
    {
      sectionType: 'highlights',
      title: 'Highlights',
      content: toJsonInput(highlights),
    },
    {
      sectionType: 'top_performers',
      title: 'Top performers',
      content: toJsonInput(currentPlayers.slice(0, 5)),
    },
    {
      sectionType: 'stats_table',
      title: 'Stats détaillées',
      content: toJsonInput(currentPlayers),
    },
    {
      sectionType: 'progression',
      title: 'Progression',
      content: toJsonInput(progression),
    },
    {
      sectionType: 'charts',
      title: 'Charts',
      content: toJsonInput(charts),
    },
    {
      sectionType: 'insights',
      title: 'Insights',
      content: toJsonInput(buildInsightsFromData(reportLike, [])),
    },
    {
      sectionType: 'recommendations',
      title: 'Recommandations',
      content: toJsonInput(recommendations),
    },
  ] satisfies Array<{
    sectionType: string
    title: string
    content: Prisma.InputJsonValue
  }>

  const insights = buildInsightsFromData(reportLike, [
    {
      id: 'progression',
      sectionType: 'progression',
      title: 'Progression',
      content: toJsonValue(progression),
    },
    {
      id: 'charts',
      sectionType: 'charts',
      title: 'Charts',
      content: toJsonValue(charts),
    },
  ])

  sectionsInput[5] = {
    ...sectionsInput[5],
    content: toJsonInput(insights),
  }

  return {
    clan,
    periodStart,
    periodEnd,
    currentPlayers,
    highlights,
    totals: {
      totalMatches: matches.length,
      totalKills,
      totalDamage: roundNumber(totalDamage),
      avgTeamSize,
      avgWinRate,
    },
    playerStats: buildStoredPlayerStats(currentPlayers) as unknown as Prisma.InputJsonValue,
    sectionsInput,
  }
}

async function persistReport(clanId: number, type: ReportType, periodStart: Date) {
  const record = await buildReportRecord(clanId, type, periodStart)

  await prisma.report.deleteMany({
    where: {
      clanId,
      type,
      periodStart: record.periodStart,
    },
  })

  const report = await prisma.report.create({
    data: {
      clanId,
      type,
      periodStart: record.periodStart,
      periodEnd: record.periodEnd,
      topKiller: record.highlights.topKiller?.memberId ?? null,
      topDamage: record.highlights.topDamage?.memberId ?? null,
      bestWinRate: record.highlights.bestWinRate?.memberId ?? null,
      mvp: record.highlights.mvp?.memberId ?? null,
      totalMatches: record.totals.totalMatches,
      totalKills: record.totals.totalKills,
      totalDamage: record.totals.totalDamage,
      avgTeamSize: record.totals.avgTeamSize,
      avgWinRate: record.totals.avgWinRate,
      playerStats: record.playerStats,
      sections: {
        create: record.sectionsInput,
      },
    },
    include: {
      clan: {
        select: {
          name: true,
        },
      },
      sections: true,
    },
  })

  await Promise.all(
    record.clan.members.map((member) =>
      notifyReportReady(report.id, member.id, {
        clanId,
        reportType: type,
      })
    )
  )

  return report
}

export async function generateWeeklyReport(clanId: number, weekStart: Date) {
  return persistReport(clanId, 'weekly', weekStart)
}

export async function generateMonthlyReport(clanId: number, monthStart: Date) {
  return persistReport(clanId, 'monthly', monthStart)
}

export async function listReportsForClan(
  clanId: number,
  filterType: ReportFilterType = 'all',
  limit = 10,
  offset = 0
): Promise<ReportListResponse> {
  const where = {
    clanId,
    ...(filterType === 'all' ? {} : { type: filterType }),
  }

  const [reports, totalCount] = await Promise.all([
    prisma.report.findMany({
      where,
      include: {
        clan: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      skip: offset,
    }),
    prisma.report.count({ where }),
  ])

  return {
    reports: reports.map((report) => serializeReportSummary(report)),
    totalCount,
  }
}

export async function getReportDetail(clanId: number, reportId: string): Promise<ReportDetailResponse | null> {
  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      clanId,
    },
    include: {
      clan: {
        select: {
          name: true,
        },
      },
      sections: {
        orderBy: {
          title: 'asc',
        },
      },
    },
  })

  if (!report) {
    return null
  }

  const players = readStoredPlayerStats(report.playerStats)
  const summary = serializeReportSummary(report)
  const sections = toSectionItems(report.sections)
  const insights = calculateReportInsights(report, report.sections)

  return {
    report: {
      ...summary,
      playerStats: players,
    },
    sections,
    insights,
  }
}

export function calculateReportInsights(
  report: Pick<Report, 'type' | 'totalKills' | 'totalMatches' | 'avgWinRate' | 'playerStats'>,
  sections: Array<Pick<ReportSectionRecord, 'id' | 'sectionType' | 'title' | 'content'>> = []
) {
  return buildInsightsFromData(report, sections as ReportSectionRecord[])
}

function getSectionContent<T>(sections: ReportSectionItem[], sectionType: string): T | null {
  const section = sections.find((item) => item.sectionType === sectionType)
  return (section?.content as T | undefined) ?? null
}

export function formatReportAsHTML(detail: ReportDetailResponse) {
  const { report, sections, insights } = detail
  const charts = getSectionContent<ReportChartsData>(sections, 'charts')
  const progression = getSectionContent<ReportProgressionData>(sections, 'progression')
  const recommendations = getSectionContent<string[]>(sections, 'recommendations') ?? []
  const playerRows = report.playerStats
    .map(
      (player) => `
        <tr>
          <td>${escapeHtml(player.displayName)}</td>
          <td>${player.matches}</td>
          <td>${player.kills}</td>
          <td>${Math.round(player.damage)}</td>
          <td>${player.assists}</td>
          <td>${(player.winRate * 100).toFixed(1)}%</td>
          <td>${escapeHtml(progressLabel(player.progression.kills))}</td>
        </tr>
      `
    )
    .join('')

  const timelineBars = charts?.timeline
    .map((point) => {
      const width = Math.max(
        8,
        Math.round((point.kills / Math.max(...charts.timeline.map((item) => item.kills), 1)) * 100)
      )
      return `<div style="margin:6px 0;"><strong>${escapeHtml(point.label)}</strong><div style="background:#dbeafe;height:10px;border-radius:999px;overflow:hidden;"><div style="width:${width}%;background:#2563eb;height:10px;"></div></div></div>`
    })
    .join('')

  return `
    <!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Rapport ${escapeHtml(getTypeLabel(report.type))} - ${escapeHtml(report.clanName)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          h1, h2 { margin-bottom: 8px; }
          .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; background: #fff; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { padding: 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
          th { background: #f9fafb; }
          ul { padding-left: 20px; }
        </style>
      </head>
      <body>
        <h1>Rapport ${escapeHtml(getTypeLabel(report.type))} — ${escapeHtml(report.clanName)}</h1>
        <p>Période: ${escapeHtml(formatPeriodLabel(report.periodStart, report.periodEnd))}</p>

        <section class="grid">
          <div class="card"><small>Matches</small><div><strong>${report.totalMatches}</strong></div></div>
          <div class="card"><small>Kills</small><div><strong>${report.totalKills}</strong></div></div>
          <div class="card"><small>Damage</small><div><strong>${Math.round(report.totalDamage)}</strong></div></div>
          <div class="card"><small>Win rate</small><div><strong>${(report.avgWinRate * 100).toFixed(1)}%</strong></div></div>
        </section>

        <h2>Insights</h2>
        <ul>${insights.map((insight) => `<li>${escapeHtml(insight)}</li>`).join('')}</ul>

        <h2>Progression</h2>
        <p>${escapeHtml(progression?.comparisonLabel ?? '')} — ${
          progression ? escapeHtml(progressLabel(progression.aggregateDelta.kills)) : 'N/A'
        }</p>

        <h2>Timeline kills</h2>
        <div>${timelineBars ?? '<p>Aucune donnée</p>'}</div>

        <h2>Stats joueurs</h2>
        <table>
          <thead>
            <tr>
              <th>Joueur</th>
              <th>Matches</th>
              <th>Kills</th>
              <th>Damage</th>
              <th>Assists</th>
              <th>WR</th>
              <th>Δ kills</th>
            </tr>
          </thead>
          <tbody>${playerRows}</tbody>
        </table>

        <h2>Recommandations</h2>
        <ul>${recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </body>
    </html>
  `
}

function escapePdfText(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
}

export function generateReportPdf(detail: ReportDetailResponse) {
  const lines = [
    `Rapport ${getTypeLabel(detail.report.type)} - ${detail.report.clanName}`,
    `Periode: ${formatPeriodLabel(detail.report.periodStart, detail.report.periodEnd)}`,
    `Matches: ${detail.report.totalMatches}`,
    `Kills: ${detail.report.totalKills}`,
    `Damage: ${Math.round(detail.report.totalDamage)}`,
    `Win rate: ${(detail.report.avgWinRate * 100).toFixed(1)}%`,
    '',
    'Insights:',
    ...detail.insights.map((item) => `- ${item}`),
  ].slice(0, 24)

  const stream = [
    'BT',
    '/F1 12 Tf',
    '50 790 Td',
    ...lines.flatMap((line, index) =>
      index === 0
        ? [`(${escapePdfText(line)}) Tj`]
        : ['0 -18 Td', `(${escapePdfText(line)}) Tj`]
    ),
    'ET',
  ].join('\n')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += object
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += '0000000000 65535 f \n'
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return Buffer.from(pdf, 'utf8')
}
