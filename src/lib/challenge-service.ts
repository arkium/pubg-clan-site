import { prisma } from '@/lib/prisma'
import { notifyChallengeStarted } from '@/lib/notification-service'

export const CHALLENGE_TYPES = {
  KILL_RACE: {
    key: 'kill_race',
    name: 'Kill Race',
    description: 'Who can get the most kills?',
    metric: 'kills',
    icon: '🔫',
  },
  DAMAGE_RACE: {
    key: 'damage_race',
    name: 'Damage Race',
    description: 'Highest damage dealer wins!',
    metric: 'damage',
    icon: '💥',
  },
  WIN_STREAK: {
    key: 'win_streak',
    name: 'Win Streak',
    description: 'Most squad wins',
    metric: 'squadWins',
    icon: '🏆',
  },
  SQUAD_SYNERGY: {
    key: 'squad_synergy',
    name: 'Squad Synergy',
    description: 'Best 3-member squad performance',
    metric: 'squadStats',
    icon: '👥',
  },
  SURVIVAL_EXPERT: {
    key: 'survival_expert',
    name: 'Survival Expert',
    description: 'Best placement average',
    metric: 'placementAverage',
    icon: '🎖️',
  },
} as const

export type ChallengeType = (typeof CHALLENGE_TYPES)[keyof typeof CHALLENGE_TYPES]['key']
export type ChallengeDuration = 'daily' | 'weekly' | 'monthly'
export type ChallengeStatus = 'pending' | 'active' | 'ended'

export type ChallengeRewards = {
  '1st'?: number
  '2nd'?: number
  '3rd'?: number
  [key: string]: number | undefined
}

export type CreateChallengeInput = {
  title: string
  description?: string
  type: string
  duration: ChallengeDuration
  target?: number
  rewards: ChallengeRewards
  criteria?: Record<string, unknown>
}

function computeStartEnd(duration: ChallengeDuration, from: Date = new Date()) {
  const startDate = new Date(from)
  startDate.setHours(0, 0, 0, 0)

  const endDate = new Date(startDate)

  if (duration === 'daily') {
    endDate.setDate(endDate.getDate() + 1)
  } else if (duration === 'weekly') {
    endDate.setDate(endDate.getDate() + 7)
  } else {
    endDate.setMonth(endDate.getMonth() + 1)
  }

  return { startDate, endDate }
}

export async function createChallenge(clanId: number, data: CreateChallengeInput) {
  const { startDate, endDate } = computeStartEnd(data.duration)

  const challenge = await prisma.challenge.create({
    data: {
      clanId,
      title: data.title,
      description: data.description ?? null,
      type: data.type,
      startDate,
      endDate,
      duration: data.duration,
      target: data.target ?? null,
      criteria: (data.criteria ?? {}) as object,
      rewards: data.rewards as object,
      topReward: data.rewards['1st'] ?? null,
      status: 'pending',
    },
  })

  return challenge
}

export async function activateChallenge(challengeId: string) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      clan: {
        select: {
          members: {
            where: { isActive: true },
            select: { id: true },
          },
        },
      },
    },
  })

  if (!challenge) {
    throw new Error('Challenge not found')
  }

  const updated = await prisma.challenge.update({
    where: { id: challengeId },
    data: { status: 'active' },
  })

  await Promise.all(
    challenge.clan.members.map((member) =>
      prisma.challengeParticipant.upsert({
        where: { challengeId_memberId: { challengeId, memberId: member.id } },
        update: {},
        create: { challengeId, memberId: member.id, progress: 0 },
      })
    )
  )

  await notifyChallengeStarted(challengeId, challenge.clanId)

  return updated
}

export async function joinChallenge(challengeId: string, memberId: number) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    select: { id: true, status: true },
  })

  if (!challenge) {
    throw new Error('Challenge not found')
  }

  if (challenge.status !== 'active') {
    throw new Error('Challenge is not active')
  }

  const participant = await prisma.challengeParticipant.upsert({
    where: { challengeId_memberId: { challengeId, memberId } },
    update: {},
    create: { challengeId, memberId, progress: 0 },
  })

  return participant
}

export async function updateParticipantProgress(participantId: string, newProgress: number) {
  const participant = await prisma.challengeParticipant.update({
    where: { id: participantId },
    data: { progress: newProgress },
  })

  return participant
}

export async function endChallenge(challengeId: string) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      participants: {
        include: { member: { select: { id: true, displayName: true } } },
        orderBy: { progress: 'desc' },
      },
    },
  })

  if (!challenge) {
    throw new Error('Challenge not found')
  }

  const rewards = challenge.rewards as ChallengeRewards
  const now = new Date()

  const rankKeys: Array<'1st' | '2nd' | '3rd'> = ['1st', '2nd', '3rd']

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < challenge.participants.length; i += 1) {
      const participant = challenge.participants[i]
      const rank = i + 1
      const rewardKey = rankKeys[i] as keyof ChallengeRewards | undefined
      const rewardPoints = rewardKey ? (rewards[rewardKey] ?? 0) : 0

      await tx.challengeParticipant.update({
        where: { id: participant.id },
        data: { rank, reward: rewardPoints, finishedAt: now },
      })

      if (rewardPoints > 0) {
        await tx.playerRewards.upsert({
          where: { memberId: participant.memberId },
          update: {
            totalPoints: { increment: rewardPoints },
          },
          create: {
            memberId: participant.memberId,
            totalPoints: rewardPoints,
            badges: [],
          },
        })
      }
    }

    await tx.challenge.update({
      where: { id: challengeId },
      data: { status: 'ended' },
    })
  })

  return { challengeId, participantsProcessed: challenge.participants.length }
}

export async function getLeaderboard(challengeId: string) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      participants: {
        include: {
          member: { select: { id: true, displayName: true } },
        },
        orderBy: { progress: 'desc' },
      },
    },
  })

  if (!challenge) {
    throw new Error('Challenge not found')
  }

  const rewards = challenge.rewards as ChallengeRewards
  const rankKeys: Array<'1st' | '2nd' | '3rd'> = ['1st', '2nd', '3rd']

  const leaderboard = challenge.participants.map((participant, index) => {
    const rank = participant.rank ?? index + 1
    const rewardKey = rankKeys[index] as keyof ChallengeRewards | undefined
    const potentialReward = rewardKey ? (rewards[rewardKey] ?? 0) : 0

    return {
      rank,
      memberId: participant.memberId,
      displayName: participant.member.displayName,
      progress: participant.progress,
      reward: participant.reward ?? potentialReward,
      joinedAt: participant.joinedAt,
    }
  })

  return { challenge, leaderboard }
}
