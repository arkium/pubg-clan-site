import { Prisma } from '@prisma/client'

import { createOwnerBootstrapInvite } from '@/lib/auth-service'
import {
  ensureTrackedClanForPlayer,
  getOrCreateUngroupedClan,
  syncTrackedClanStats,
} from '@/lib/clan-service'
import { prisma } from '@/lib/prisma'
import { searchPlayerByName } from '@/lib/pubg'
import { assignDefaultMemberRole, initializeDefaultRoles } from '@/lib/role-service'

export type SetupState = 'first_run' | 'pending_activation' | 'completed'

const SETUP_STATE_KEY = 'setup_state'

function isSetupState(value: string): value is SetupState {
  return value === 'first_run' || value === 'pending_activation' || value === 'completed'
}

export async function getSetupState(): Promise<SetupState> {
  const [setupFlag, userCount, memberCount] = await Promise.all([
    prisma.appConfig.findUnique({
      where: { key: SETUP_STATE_KEY },
      select: { value: true },
    }),
    prisma.userAccount.count(),
    prisma.clanMember.count(),
  ])

  const inferredState: SetupState =
    userCount === 0 && memberCount === 0
      ? 'first_run'
      : userCount === 0
        ? 'pending_activation'
        : 'completed'

  if (setupFlag && isSetupState(setupFlag.value) && setupFlag.value === inferredState) {
    return setupFlag.value
  }

  await prisma.appConfig.upsert({
    where: { key: SETUP_STATE_KEY },
    update: { value: inferredState },
    create: {
      key: SETUP_STATE_KEY,
      value: inferredState,
    },
  })

  return inferredState
}

export async function setSetupState(nextState: SetupState) {
  await prisma.appConfig.upsert({
    where: { key: SETUP_STATE_KEY },
    update: { value: nextState },
    create: {
      key: SETUP_STATE_KEY,
      value: nextState,
    },
  })
}

export async function isFirstRun() {
  return (await getSetupState()) === 'first_run'
}

export async function initializeFirstRun(params: {
  displayName: string
  pubgPlayerName: string
  platformShard: string
  email: string
}) {
  if ((await getSetupState()) !== 'first_run') {
    throw new Error('Setup already completed')
  }

  const pubgPlayer = await searchPlayerByName(params.pubgPlayerName, params.platformShard)
  if (!pubgPlayer) {
    throw new Error('PUBG player not found')
  }

  const detectedClan = await ensureTrackedClanForPlayer(pubgPlayer.accountId, params.platformShard)
  const resolvedClanId =
    detectedClan?.clan.id ?? (await getOrCreateUngroupedClan(params.platformShard)).id

  const member = await (async () => {
    try {
      return await prisma.clanMember.create({
        data: {
          displayName: params.displayName,
          pubgPlayerName: pubgPlayer.playerName,
          pubgAccountId: pubgPlayer.accountId,
          platformShard: params.platformShard,
          clanId: resolvedClanId,
        },
        include: {
          clan: {
            select: {
              id: true,
              name: true,
              tag: true,
              pubgClanId: true,
              platformShard: true,
            },
          },
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('Member already exists for this PUBG name and platform')
      }

      throw error
    }
  })()

  await initializeDefaultRoles(resolvedClanId)
  await assignDefaultMemberRole(member.id, resolvedClanId)

  try {
    await syncTrackedClanStats(resolvedClanId)
  } catch (syncError) {
    console.warn('Unable to synchronize clan stats after first-run setup:', syncError)
  }

  const invite = await createOwnerBootstrapInvite({
    clanId: resolvedClanId,
    email: params.email,
  })

  await setSetupState('pending_activation')

  return {
    member,
    invite,
  }
}
