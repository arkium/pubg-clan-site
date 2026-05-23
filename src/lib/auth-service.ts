import { prisma } from '@/lib/prisma'
import { PREDEFINED_ROLES, initializeDefaultRoles } from '@/lib/role-service'
import { setSetupState } from '@/lib/setup-service'
import { sendEmail } from '@/lib/email-service'
import {
  generateToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  verifyPassword,
} from '@/lib/auth-crypto'

const INVITE_TTL_MS = 1000 * 60 * 60 * 48

function getPublicBaseUrl() {
  const configuredUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  return 'http://localhost:3000'
}

async function ensureMemberBelongsToClan(memberId: number, clanId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      isActive: true,
      clanId: true,
      displayName: true,
    },
  })

  if (!member || !member.isActive || member.clanId !== clanId) {
    throw new Error('Member not found in clan')
  }

  return member
}

export async function resolveOwnerMemberForClan(clanId: number) {
  await initializeDefaultRoles(clanId)

  const owner = await prisma.clanMember.findFirst({
    where: {
      clanId,
      isActive: true,
      roles: {
        some: {
          role: {
            name: PREDEFINED_ROLES.OWNER.name,
          },
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      displayName: true,
      clanId: true,
      clan: {
        select: {
          id: true,
          name: true,
          tag: true,
        },
      },
    },
  })

  if (owner) {
    return owner
  }

  const firstActiveMember = await prisma.clanMember.findFirst({
    where: {
      clanId,
      isActive: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      displayName: true,
      clanId: true,
      clan: {
        select: {
          id: true,
          name: true,
          tag: true,
        },
      },
    },
  })

  if (!firstActiveMember) {
    throw new Error('No active member found in clan')
  }

  return firstActiveMember
}

export async function resolveOwnerMemberFromPlayerName(params: {
  ownerPlayerName: string
  platformShard?: string
}) {
  const normalizedName = params.ownerPlayerName.trim()
  if (!normalizedName) {
    throw new Error('Owner player name is required')
  }

  const ownerMember = await prisma.clanMember.findFirst({
    where: {
      isActive: true,
      pubgPlayerName: normalizedName,
      ...(params.platformShard ? { platformShard: params.platformShard } : {}),
      roles: {
        some: {
          role: {
            name: PREDEFINED_ROLES.OWNER.name,
          },
        },
      },
      clanId: {
        not: null,
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      displayName: true,
      clanId: true,
      clan: {
        select: {
          id: true,
          name: true,
          tag: true,
        },
      },
    },
  })

  if (!ownerMember || !ownerMember.clanId || !ownerMember.clan) {
    throw new Error('Owner player not found. Verify pseudo and shard, or bootstrap with clanId once.')
  }

  return ownerMember
}

export async function createMemberInvite(params: {
  clanId: number
  memberId: number
  email: string
  invitedByUserId?: number | null
  invitedByMemberId?: number | null
}) {
  await ensureMemberBelongsToClan(params.memberId, params.clanId)

  const email = normalizeEmail(params.email)

  const activeIdentity = await prisma.memberIdentity.findUnique({
    where: { memberId: params.memberId },
    select: { userId: true },
  })

  if (activeIdentity) {
    throw new Error('This player already has an account')
  }

  const now = new Date()

  await prisma.memberInvite.updateMany({
    where: {
      memberId: params.memberId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    data: {
      revokedAt: now,
    },
  })

  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS)

  const invite = await prisma.memberInvite.create({
    data: {
      clanId: params.clanId,
      memberId: params.memberId,
      email,
      tokenHash,
      expiresAt,
      invitedByUserId: params.invitedByUserId ?? null,
      invitedByMemberId: params.invitedByMemberId ?? null,
    },
    include: {
      member: {
        select: { id: true, displayName: true },
      },
      clan: {
        select: { id: true, name: true, tag: true },
      },
    },
  })

  const activationUrl = `${getPublicBaseUrl()}/activate?token=${encodeURIComponent(token)}`

  await sendEmail({
    to: email,
    subject: `Invitation PUBG Clan ${invite.clan.tag}`,
    text: [
      `Bonjour ${invite.member.displayName},`,
      '',
      `Vous avez ete invite a activer votre compte pour le clan ${invite.clan.name} [${invite.clan.tag}].`,
      `Lien d'activation (valide 48h): ${activationUrl}`,
      '',
      'Si vous n\'etes pas concerne, ignorez cet email.',
    ].join('\n'),
  })

  return {
    inviteId: invite.id,
    expiresAt,
    activationUrl,
  }
}

export async function activateMemberInvite(params: {
  token: string
  password: string
  displayName?: string
}) {
  const tokenHash = hashToken(params.token)
  const now = new Date()

  const invite = await prisma.memberInvite.findUnique({
    where: { tokenHash },
    include: {
      member: {
        select: {
          id: true,
          displayName: true,
          isActive: true,
        },
      },
    },
  })

  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= now) {
    throw new Error('Invalid or expired activation token')
  }

  if (!invite.member.isActive) {
    throw new Error('Member is no longer active')
  }

  const email = normalizeEmail(invite.email)
  const passwordHash = await hashPassword(params.password)

  const user = await prisma.userAccount.upsert({
    where: { email },
    update: {
      passwordHash,
      displayName: params.displayName?.trim() || invite.member.displayName,
      status: 'active',
      emailVerifiedAt: now,
    },
    create: {
      email,
      passwordHash,
      displayName: params.displayName?.trim() || invite.member.displayName,
      status: 'active',
      emailVerifiedAt: now,
    },
  })

  const existingIdentity = await prisma.memberIdentity.findUnique({
    where: { memberId: invite.memberId },
    select: { id: true, userId: true },
  })

  if (existingIdentity && existingIdentity.userId !== user.id) {
    throw new Error('This player is already linked to another account')
  }

  await prisma.$transaction([
    prisma.memberIdentity.upsert({
      where: { memberId: invite.memberId },
      update: {
        userId: user.id,
        isPrimary: true,
      },
      create: {
        userId: user.id,
        memberId: invite.memberId,
        isPrimary: true,
      },
    }),
    prisma.memberInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: now,
      },
    }),
  ])

  await setSetupState('completed')

  return {
    userId: user.id,
    memberId: invite.memberId,
    email: user.email,
  }
}

export async function authenticateUser(params: {
  email: string
  password: string
}) {
  const email = normalizeEmail(params.email)
  const user = await prisma.userAccount.findUnique({
    where: { email },
    include: {
      identities: {
        include: {
          member: {
            select: {
              id: true,
              displayName: true,
              isActive: true,
              clanId: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
    },
  })

  if (!user || user.status !== 'active' || !user.emailVerifiedAt) {
    return null
  }

  const validPassword = await verifyPassword(params.password, user.passwordHash)
  if (!validPassword) {
    return null
  }

  const activeIdentity = user.identities.find((identity) => identity.member.isActive)
  return {
    userId: user.id,
    email: user.email,
    identities: user.identities,
    defaultMemberId: activeIdentity?.memberId ?? null,
  }
}

export async function listLinkedMembers(userId: number) {
  return prisma.memberIdentity.findMany({
    where: { userId },
    include: {
      member: {
        select: {
          id: true,
          displayName: true,
          clanId: true,
          isActive: true,
          clan: {
            select: {
              id: true,
              name: true,
              tag: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: 'asc',
    },
  })
}

export async function createOwnerBootstrapInvite(params: {
  clanId?: number
  ownerPlayerName?: string
  platformShard?: string
  email: string
}) {
  const ownerMember = params.clanId
    ? await resolveOwnerMemberForClan(params.clanId)
    : await resolveOwnerMemberFromPlayerName({
        ownerPlayerName: params.ownerPlayerName ?? '',
        platformShard: params.platformShard,
      })

  if (!ownerMember.clanId) {
    throw new Error('Owner member has no clan')
  }

  const invite = await createMemberInvite({
    clanId: ownerMember.clanId,
    memberId: ownerMember.id,
    email: params.email,
    invitedByMemberId: ownerMember.id,
  })

  return {
    ...invite,
    ownerMember,
  }
}
