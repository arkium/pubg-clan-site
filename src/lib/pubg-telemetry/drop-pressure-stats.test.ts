import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dropPressureStat: {
      findMany: mocks.findMany,
    },
  },
}))

import { getDropPressureTimeline } from '@/lib/drop-pressure-stats'

const timelineSelect = {
  matchDate: true,
  nearbyPlayerCount250m: true,
  nearbyOpponentCount250m: true,
  pressureLevel: true,
}

describe('drop pressure stats service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-05T12:00:00.000Z'))
    mocks.findMany.mockReset()
    mocks.findMany.mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clamps a member timeline to at least one week', async () => {
    const timeline = await getDropPressureTimeline({ memberId: 42, weekCount: 0 })

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        memberId: 42,
        matchDate: { gte: new Date('2027-01-04T00:00:00.000Z') },
      },
      select: timelineSelect,
    })
    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({ period: '2027-01-04', label: 'S1' })
  })

  it('clamps a clan timeline to 52 weeks and filters inactive members', async () => {
    const timeline = await getDropPressureTimeline({ clanId: 7, weekCount: 100 })

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        member: { clanId: 7, isActive: true },
        matchDate: { gte: new Date('2026-01-12T00:00:00.000Z') },
      },
      select: timelineSelect,
    })
    expect(timeline).toHaveLength(52)
    expect(timeline.at(-1)).toMatchObject({ period: '2027-01-04', label: 'S1' })
  })
})