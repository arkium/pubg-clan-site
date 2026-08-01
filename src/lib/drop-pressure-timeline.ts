import type { DropPressureTimelinePoint } from '@/types/drop-pressure'

type DropPressureTimelineRow = {
  matchDate: Date
  nearbyPlayerCount250m: number
  nearbyOpponentCount250m: number | null
  pressureLevel: string
}

function startOfWeek(value: Date) {
  const start = new Date(value)
  const day = start.getUTCDay()
  start.setUTCDate(start.getUTCDate() - (day === 0 ? 6 : day - 1))
  start.setUTCHours(0, 0, 0, 0)
  return start
}

function getIsoWeek(value: Date) {
  const date = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate()
  ))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

export function getDropPressureTimelineStart(now = new Date(), weekCount = 8) {
  const start = startOfWeek(now)
  start.setUTCDate(start.getUTCDate() - (Math.max(1, weekCount) - 1) * 7)
  return start
}

export function buildDropPressureWeeklyTimeline(
  rows: DropPressureTimelineRow[],
  now = new Date(),
  weekCount = 8
): DropPressureTimelinePoint[] {
  const count = Math.max(1, weekCount)
  const timelineStart = getDropPressureTimelineStart(now, count)

  return Array.from({ length: count }, (_, index) => {
    const bucketStart = new Date(timelineStart)
    bucketStart.setUTCDate(timelineStart.getUTCDate() + index * 7)
    const bucketEnd = new Date(bucketStart)
    bucketEnd.setUTCDate(bucketStart.getUTCDate() + 7)
    const bucketRows = rows.filter(
      (row) => row.matchDate >= bucketStart && row.matchDate < bucketEnd
    )
    const opponentRows = bucketRows.filter(
      (row) => row.nearbyOpponentCount250m !== null
    )
    const hotDropCount = bucketRows.filter(
      (row) => row.pressureLevel === 'hot' || row.pressureLevel === 'very_hot'
    ).length

    return {
      period: bucketStart.toISOString().slice(0, 10),
      label: `S${getIsoWeek(bucketStart)}`,
      startDate: bucketStart.toISOString(),
      dropCount: bucketRows.length,
      averageNearbyPlayers250m: bucketRows.length > 0
        ? bucketRows.reduce((sum, row) => sum + row.nearbyPlayerCount250m, 0) / bucketRows.length
        : 0,
      averageNearbyOpponents250m: opponentRows.length > 0
        ? opponentRows.reduce(
            (sum, row) => sum + (row.nearbyOpponentCount250m ?? 0),
            0
          ) / opponentRows.length
        : null,
      hotDropShare: bucketRows.length > 0 ? (hotDropCount / bucketRows.length) * 100 : 0,
    }
  })
}