import { prisma } from '@/lib/prisma'

export type AwardPeriod = 'week' | 'month' | 'all'

export type AwardWinner = {
  memberId: number
  memberName: string
  value: number
}

export type ClanAward = {
  key: string
  label: string
  description: string
  unit: string
  top3: AwardWinner[]
}

export type ClanAwards = {
  clanId: number
  period: AwardPeriod
  periodKey: string
  matchCount: number
  awards: ClanAward[]
}

function getISOWeek(date: Date): number {
  const tmp = new Date(date.getTime())
  tmp.setHours(0, 0, 0, 0)
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7))
  const week1 = new Date(tmp.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  )
}

function getPeriodKey(period: AwardPeriod, now = new Date()): string {
  if (period === 'all') return 'all-time'
  if (period === 'week') {
    return `week-${now.getFullYear()}-${String(getISOWeek(now)).padStart(2, '0')}`
  }
  return `month-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function getPeriodBounds(period: AwardPeriod, now = new Date()): { startDate: Date; endDate: Date } {
  if (period === 'all') {
    return { startDate: new Date(0), endDate: new Date('9999-12-31') }
  }
  if (period === 'week') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    return { startDate: monday, endDate: sunday }
  }
  return {
    startDate: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}

function top3ByTotal(
  rows: Array<{ memberId: number; memberName: string; value: number }>
): AwardWinner[] {
  return rows
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((r) => ({ memberId: r.memberId, memberName: r.memberName, value: r.value }))
}

export async function computeClanAwards(
  clanId: number,
  period: AwardPeriod
): Promise<ClanAwards> {
  const { startDate, endDate } = getPeriodBounds(period)
  const periodKey = getPeriodKey(period)

  const squadMembers = await prisma.squadMember.findMany({
    where: {
      member: { clanId, isActive: true },
      squadMatch: { createdAt: { gte: startDate, lte: endDate } },
    },
    select: {
      memberId: true,
      squadMatchId: true,
      kills: true,
      damage: true,
      rideDistance: true,
      walkDistance: true,
      timeSurvived: true,
      boosts: true,
      heals: true,
      vehicleDestroys: true,
      longestKill: true,
      weaponsAcquired: true,
      roadKills: true,
      member: { select: { displayName: true } },
    },
  })

  type MemberAccumulator = {
    memberId: number
    memberName: string
    kills: number
    damage: number
    rideDistance: number
    walkDistance: number
    timeSurvived: number
    boosts: number
    heals: number
    vehicleDestroys: number
    longestKill: number
    weaponsAcquired: number
    roadKills: number
  }

  const byMember = new Map<number, MemberAccumulator>()

  for (const sm of squadMembers) {
    const existing = byMember.get(sm.memberId)
    if (!existing) {
      byMember.set(sm.memberId, {
        memberId: sm.memberId,
        memberName: sm.member.displayName,
        kills: sm.kills,
        damage: sm.damage,
        rideDistance: sm.rideDistance,
        walkDistance: sm.walkDistance,
        timeSurvived: sm.timeSurvived,
        boosts: sm.boosts,
        heals: sm.heals,
        vehicleDestroys: sm.vehicleDestroys,
        longestKill: sm.longestKill,
        weaponsAcquired: sm.weaponsAcquired,
        roadKills: sm.roadKills,
      })
    } else {
      existing.kills += sm.kills
      existing.damage += sm.damage
      existing.rideDistance += sm.rideDistance
      existing.walkDistance += sm.walkDistance
      existing.timeSurvived += sm.timeSurvived
      existing.boosts += sm.boosts
      existing.heals += sm.heals
      existing.vehicleDestroys += sm.vehicleDestroys
      existing.longestKill = Math.max(existing.longestKill, sm.longestKill)
      existing.weaponsAcquired += sm.weaponsAcquired
      existing.roadKills += sm.roadKills
    }
  }

  const members = Array.from(byMember.values())
  const matchCount = new Set(squadMembers.map((sm) => sm.squadMatchId)).size

  const awards: ClanAward[] = [
    {
      key: 'top_killer',
      label: 'Le croc mort',
      description: 'Plus de kills sur la période',
      unit: 'kills',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: m.kills }))),
    },
    {
      key: 'top_damage',
      label: 'La brute',
      description: 'Plus de dégâts infligés',
      unit: 'dégâts',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: Math.round(m.damage) }))),
    },
    {
      key: 'jacky_tuning',
      label: 'JACKY TUNING',
      description: 'Plus de distance parcourue en véhicule',
      unit: 'm',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: Math.round(m.rideDistance) }))),
    },
    {
      key: 'le_rodeur',
      label: 'Le rôdeur',
      description: 'Plus de distance parcourue à pied',
      unit: 'm',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: Math.round(m.walkDistance) }))),
    },
    {
      key: 'brouteur_herbe',
      label: 'Le brouteur d\'herbe',
      description: 'Temps de survie total le plus long',
      unit: 's',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: m.timeSurvived }))),
    },
    {
      key: 'alcoolique_dimanche',
      label: 'L\'alcoolique du dimanche',
      description: 'Plus de boosts consommés',
      unit: 'boosts',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: m.boosts }))),
    },
    {
      key: 'fou_hopital',
      label: 'Le fou de l\'hôpital',
      description: 'Plus de soins utilisés',
      unit: 'soins',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: m.heals }))),
    },
    {
      key: 'destructeur',
      label: 'Le destructeur',
      description: 'Plus de véhicules détruits',
      unit: 'véhicules',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: m.vehicleDestroys }))),
    },
    {
      key: 'le_sniper',
      label: 'Le sniper',
      description: 'Kill le plus long sur la période',
      unit: 'm',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: Math.round(m.longestKill) }))),
    },
    {
      key: 'collectionneur',
      label: 'Le collectionneur d\'armes',
      description: 'Plus d\'armes ramassées',
      unit: 'armes',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: m.weaponsAcquired }))),
    },
    {
      key: 'brute_metal',
      label: 'La brute de métal',
      description: 'Plus de kills depuis un véhicule',
      unit: 'kills',
      top3: top3ByTotal(members.map((m) => ({ memberId: m.memberId, memberName: m.memberName, value: m.roadKills }))),
    },
  ]

  return { clanId, period, periodKey, matchCount, awards }
}
