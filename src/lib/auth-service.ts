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
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30

function isTechnicalInviteEmail(email: string) {
  return email.trim().toLowerCase().endsWith('@local.invalid')
}

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
  email?: string
  invitedByUserId?: number | null
  invitedByMemberId?: number | null
  sendEmail?: boolean
}) {
  await ensureMemberBelongsToClan(params.memberId, params.clanId)

  const shouldSendEmail = params.sendEmail !== false
  const fallbackDiscordEmail = `discord-member-${params.memberId}@local.invalid`
  const email = shouldSendEmail
    ? normalizeEmail(params.email ?? '')
    : normalizeEmail(params.email?.trim() ? params.email : fallbackDiscordEmail)

  const activeIdentity = await prisma.memberIdentity.findUnique({
    where: { memberId: params.memberId },
    select: { userId: true },
  })

  if (activeIdentity && shouldSendEmail) {
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

  const delivery = await (async () => {
    if (!shouldSendEmail) {
      return {
        delivered: false,
        mode: 'stub' as const,
        to: email,
        subject: `Invitation PUBG Clan ${invite.clan.tag}`,
        from: process.env.SMTP_FROM?.trim() || null,
        reason: 'email_not_sent_discord_flow',
      }
    }

    try {
      return await sendEmail({
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email send failed'

      return {
        delivered: false,
        mode: 'smtp' as const,
        to: email,
        subject: `Invitation PUBG Clan ${invite.clan.tag}`,
        from: process.env.SMTP_FROM?.trim() || null,
        reason: message,
      }
    }
  })()

  return {
    inviteId: invite.id,
    expiresAt,
    activationUrl,
    delivery,
  }
}

export async function revokeActiveMemberInvite(params: {
  clanId: number
  memberId: number
}) {
  await ensureMemberBelongsToClan(params.memberId, params.clanId)

  const now = new Date()

  const result = await prisma.memberInvite.updateMany({
    where: {
      clanId: params.clanId,
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

  return {
    revokedCount: result.count,
  }
}

export async function activateMemberInvite(params: {
  token: string
  password: string
  displayName?: string
  loginEmail?: string
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

  const inviteEmail = isTechnicalInviteEmail(invite.email) ? '' : invite.email.trim()
  const providedLoginEmail = params.loginEmail?.trim() ?? ''

  if (!inviteEmail && !providedLoginEmail) {
    throw new Error('Aucun email trouve sur l\'invitation. Saisissez votre email de connexion.')
  }

  const email = normalizeEmail(inviteEmail || providedLoginEmail)
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

export async function getActivationInviteContext(token: string) {
  const normalizedToken = token.trim()
  if (!normalizedToken) {
    return null
  }

  const tokenHash = hashToken(normalizedToken)
  const invite = await prisma.memberInvite.findUnique({
    where: { tokenHash },
    include: {
      member: {
        select: {
          isActive: true,
        },
      },
    },
  })

  if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) {
    return null
  }

  if (!invite.member.isActive) {
    return null
  }

  return {
    requiresLoginEmail: invite.email.trim().length === 0 || isTechnicalInviteEmail(invite.email),
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
              roles: {
                select: {
                  role: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
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
  const canSwitchClan = user.identities.some((identity) => {
    if (!identity.member.isActive) {
      return false
    }

    return identity.member.roles.some((entry) => entry.role.name.toLowerCase() === 'owner')
  })
  return {
    userId: user.id,
    email: user.email,
    identities: user.identities,
    defaultMemberId: activeIdentity?.memberId ?? null,
    defaultClanId: activeIdentity?.member.clanId ?? null,
    canSwitchClan,
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

export async function changeUserPassword(params: {
  userId: number
  currentPassword: string
  newPassword: string
}) {
  const user = await prisma.userAccount.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      passwordHash: true,
      status: true,
      emailVerifiedAt: true,
    },
  })

  if (!user || user.status !== 'active' || !user.emailVerifiedAt) {
    throw new Error('Account is not active')
  }

  const validCurrentPassword = await verifyPassword(params.currentPassword, user.passwordHash)
  if (!validCurrentPassword) {
    throw new Error('Mot de passe actuel incorrect')
  }

  const sameAsCurrentPassword = await verifyPassword(params.newPassword, user.passwordHash)
  if (sameAsCurrentPassword) {
    throw new Error('Le nouveau mot de passe doit etre different')
  }

  const nextPasswordHash = await hashPassword(params.newPassword)

  await prisma.userAccount.update({
    where: { id: params.userId },
    data: {
      passwordHash: nextPasswordHash,
    },
  })
}

export async function requestPasswordReset(emailInput: string) {
  const email = normalizeEmail(emailInput)
  const now = new Date()

  const user = await prisma.userAccount.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      displayName: true,
      status: true,
      emailVerifiedAt: true,
    },
  })

  if (!user || user.status !== 'active' || !user.emailVerifiedAt) {
    return {
      requested: false,
    }
  }

  await prisma.passwordResetToken.updateMany({
    where: {
      userId: user.id,
      usedAt: null,
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
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS)

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  })

  const resetUrl = `${getPublicBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`

  try {
    await sendEmail({
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe PUBG Clan',
      text: [
        `Bonjour ${user.displayName?.trim() || 'joueur'},`,
        '',
        'Vous avez demandé la réinitialisation de votre mot de passe.',
        `Lien de réinitialisation (valide 30 minutes): ${resetUrl}`,
        '',
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
      ].join('\n'),
    })
  } catch (error) {
    console.error('Password reset email error:', error)
  }

  return {
    requested: true,
  }
}

export async function getPasswordResetContext(tokenInput: string) {
  const normalizedToken = tokenInput.trim()
  if (!normalizedToken) {
    return null
  }

  const tokenHash = hashToken(normalizedToken)
  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          status: true,
          emailVerifiedAt: true,
        },
      },
    },
  })

  if (!token || token.usedAt || token.revokedAt || token.expiresAt <= new Date()) {
    return null
  }

  if (!token.user || token.user.status !== 'active' || !token.user.emailVerifiedAt) {
    return null
  }

  return {
    valid: true,
  }
}

export async function resetPasswordWithToken(params: {
  token: string
  newPassword: string
}) {
  const now = new Date()
  const tokenHash = hashToken(params.token.trim())

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id: true,
          status: true,
          emailVerifiedAt: true,
          passwordHash: true,
        },
      },
    },
  })

  if (!resetToken || resetToken.usedAt || resetToken.revokedAt || resetToken.expiresAt <= now) {
    throw new Error('Lien de réinitialisation invalide ou expiré')
  }

  if (!resetToken.user || resetToken.user.status !== 'active' || !resetToken.user.emailVerifiedAt) {
    throw new Error('Compte invalide')
  }

  const sameAsCurrentPassword = await verifyPassword(params.newPassword, resetToken.user.passwordHash)
  if (sameAsCurrentPassword) {
    throw new Error('Le nouveau mot de passe doit être différent')
  }

  const nextPasswordHash = await hashPassword(params.newPassword)

  await prisma.$transaction([
    prisma.userAccount.update({
      where: { id: resetToken.user.id },
      data: {
        passwordHash: nextPasswordHash,
      },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: {
        usedAt: now,
      },
    }),
    prisma.passwordResetToken.updateMany({
      where: {
        userId: resetToken.user.id,
        id: {
          not: resetToken.id,
        },
        usedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
      },
    }),
    prisma.userSession.updateMany({
      where: {
        userId: resetToken.user.id,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      data: {
        revokedAt: now,
      },
    }),
  ])
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
