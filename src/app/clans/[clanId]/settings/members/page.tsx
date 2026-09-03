'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Users } from 'lucide-react'

import RoleAssignment from '@/components/RoleAssignment'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import ClanSyncPanel from '@/components/settings/ClanSyncPanel'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useClanOverview } from '@/hooks/useClanOverview'
import { useAuthSession } from '@/hooks/useAuthSession'

type ClanRole = {
  id: number
  name: string
}

type MemberRole = {
  roleId: number
  name: string
}

type ClanMemberWithRole = {
  id: number
  name: string
  role: string
  roles: MemberRole[]
  permissions: string[]
  joinedAt: string
  hasAccount: boolean
  isSuperUser: boolean
  avatarUrl?: string | null
  pendingInvite: {
    id: string
    email: string
    expiresAt: string
  } | null
  recentInvites: Array<{
    id: string
    email: string
    createdAt: string
    expiresAt: string
    acceptedAt: string | null
    revokedAt: string | null
  }>
}

type EmailDeliveryStatus = {
  ready?: boolean
}

type InviteCreationResponse = {
  success?: boolean
  inviteId?: string
  expiresAt?: string
  activationUrl?: string
  error?: string
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function getRoleBadgeClass(roleName: string) {
  const normalizedRole = roleName.trim().toLowerCase()

  switch (normalizedRole) {
    case 'owner':
      return 'member-role-badge member-role-badge--owner'
    case 'admin':
      return 'member-role-badge member-role-badge--admin'
    case 'moderator':
      return 'member-role-badge member-role-badge--moderator'
    case 'member':
      return 'member-role-badge member-role-badge--member'
    default:
      return 'member-role-badge member-role-badge--default'
  }
}

function isTechnicalInviteEmail(email: string) {
  return email.trim().toLowerCase().endsWith('@local.invalid')
}

function getDisplayInviteEmail(email: string) {
  return isTechnicalInviteEmail(email) ? '' : email
}

function getAvatarInitials(name: string) {
  const initials = name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .flatMap((part) => part.match(/[\p{L}\p{N}]/gu) ?? [])
    .filter((character) => /[\p{L}]/u.test(character))
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return initials || name.trim().slice(0, 2).toUpperCase() || '??'
}

export default function ClanMembersSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const { data: overviewData } = useClanOverview(clanId)
  const { isSuperUser } = useAuthSession()

  const [members, setMembers] = useState<ClanMemberWithRole[]>([])
  const [roles, setRoles] = useState<ClanRole[]>([])
  const [nameSortOrder, setNameSortOrder] = useState<'az' | 'za'>('az')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [memberActionLoading, setMemberActionLoading] = useState<
    { memberId: number; action: 'email' | 'discord' | 'reset' } | null
  >(null)
  const [inviteDraftMemberId, setInviteDraftMemberId] = useState<number | null>(null)
  const [inviteEmailDraft, setInviteEmailDraft] = useState('')
  const [isEmailDeliveryReady, setIsEmailDeliveryReady] = useState(false)
  const [emailStatusLoaded, setEmailStatusLoaded] = useState(false)
  const [copiedDiscordMemberId, setCopiedDiscordMemberId] = useState<number | null>(null)
  const [copyToast, setCopyToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const copyToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [inviteToast, setInviteToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const inviteToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [memberInlineToast, setMemberInlineToast] = useState<
    { memberId: number; message: string; tone: 'success' | 'error' } | null
  >(null)
  const memberInlineToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sortedMembers = useMemo(() => {
    return [...members].sort((left, right) => {
      const comparison = left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' })
      return nameSortOrder === 'az' ? comparison : comparison * -1
    })
  }, [members, nameSortOrder])

  function showCopyToast(message: string, tone: 'success' | 'error' = 'success') {
    setCopyToast({ message, tone })

    if (copyToastTimeoutRef.current !== null) {
      clearTimeout(copyToastTimeoutRef.current)
    }

    copyToastTimeoutRef.current = setTimeout(() => {
      setCopyToast(null)
      copyToastTimeoutRef.current = null
    }, 3200)
  }

  function showInviteToast(message: string, tone: 'success' | 'error' = 'success') {
    setInviteToast({ message, tone })

    if (inviteToastTimeoutRef.current !== null) {
      clearTimeout(inviteToastTimeoutRef.current)
    }

    inviteToastTimeoutRef.current = setTimeout(() => {
      setInviteToast(null)
      inviteToastTimeoutRef.current = null
    }, 3800)
  }

  function showMemberInlineToast(
    memberId: number,
    message: string,
    tone: 'success' | 'error' = 'success'
  ) {
    setMemberInlineToast({ memberId, message, tone })

    if (memberInlineToastTimeoutRef.current !== null) {
      clearTimeout(memberInlineToastTimeoutRef.current)
    }

    memberInlineToastTimeoutRef.current = setTimeout(() => {
      setMemberInlineToast((current) => (current?.memberId === memberId ? null : current))
      memberInlineToastTimeoutRef.current = null
    }, 3200)
  }

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  async function fetchMembersAndRoles(currentClanId: number) {
    const [membersResponse, rolesResponse] = await Promise.all([
      fetch(`/api/clans/${currentClanId}/members`),
      fetch(`/api/clans/${currentClanId}/roles`),
    ])

    const membersData = (await membersResponse.json()) as
      | { members: ClanMemberWithRole[] }
      | { error?: string }
    const rolesData = (await rolesResponse.json()) as
      | { roles: ClanRole[] }
      | { error?: string }

    if (!membersResponse.ok) {
      if (membersResponse.status === 401 || membersResponse.status === 403) {
        throw new Error('AUTH_REQUIRED')
      }
      throw new Error('error' in membersData ? membersData.error : 'Failed to fetch members')
    }

    if (!rolesResponse.ok) {
      if (rolesResponse.status === 401 || rolesResponse.status === 403) {
        throw new Error('AUTH_REQUIRED')
      }
      throw new Error('error' in rolesData ? rolesData.error : 'Failed to fetch roles')
    }

    return {
      members: (membersData as { members: ClanMemberWithRole[] }).members,
      roles: (rolesData as { roles: ClanRole[] }).roles,
    }
  }

  async function fetchEmailDeliveryStatus() {
    const response = await fetch('/api/settings/email-delivery', { cache: 'no-store' })
    const payload = (await response.json().catch(() => null)) as EmailDeliveryStatus | null

    if (response.status === 401) {
      throw new Error('AUTH_REQUIRED')
    }

    if (!response.ok) {
      return false
    }

    return Boolean(payload?.ready)
  }

  useEffect(() => {
    if (!clanId) {
      return
    }
    const currentClanId = clanId

    let cancelled = false

    async function loadMembersSettings() {
      try {
        setError('')
        const [data, emailReady] = await Promise.all([
          fetchMembersAndRoles(currentClanId),
          fetchEmailDeliveryStatus(),
        ])
        if (!cancelled) {
          setMembers(data.members)
          setRoles(data.roles)
          setIsEmailDeliveryReady(emailReady)
          setEmailStatusLoaded(true)
        }
      } catch (loadError) {
        if (!cancelled) {
          if (loadError instanceof Error && loadError.message === 'AUTH_REQUIRED') {
            router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/settings/members`)}`)
            return
          }

          setError(loadError instanceof Error ? loadError.message : 'Failed to load members settings')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setEmailStatusLoaded(true)
        }
      }
    }

    void loadMembersSettings()

    return () => {
      cancelled = true
    }
  }, [clanId, router])

  useEffect(() => {
    return () => {
      if (copyToastTimeoutRef.current !== null) {
        clearTimeout(copyToastTimeoutRef.current)
      }

      if (memberInlineToastTimeoutRef.current !== null) {
        clearTimeout(memberInlineToastTimeoutRef.current)
      }
    }
  }, [])

  async function handleAssign(memberId: number, roleId: number) {
    if (!clanId) {
      throw new Error('Clan introuvable')
    }

    const response = await fetch(`/api/clans/${clanId}/members/${memberId}/role`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ roleId }),
    })

    const payload = (await response.json()) as { error?: string }
    if (!response.ok) {
      if (response.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent(`/clans/${clanId}/settings/members`)}`)
        return
      }

      throw new Error(payload.error ?? 'Failed to assign role')
    }

    const data = await fetchMembersAndRoles(clanId)
    setMembers(data.members)
    setRoles(data.roles)
  }

  async function handleRevokeOwner(memberId: number) {
    if (!clanId) {
      throw new Error('Clan introuvable')
    }

    const response = await fetch(`/api/clans/${clanId}/members/${memberId}/role`, {
      method: 'DELETE',
    })

    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    if (!response.ok) {
      if (response.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent(`/clans/${clanId}/settings/members`)}`)
        return
      }

      throw new Error(payload?.error ?? 'Échec de la révocation du rôle Owner')
    }

    const data = await fetchMembersAndRoles(clanId)
    setMembers(data.members)
    setRoles(data.roles)
  }

  async function handleInvite(
    member: ClanMemberWithRole,
    email: string,
    options?: { sendEmail?: boolean; mode?: 'email' | 'discord' }
  ) {
    if (!clanId) {
      return
    }

    const normalizedEmail = email.trim()
    const shouldSendEmail = options?.sendEmail !== false

    if (shouldSendEmail && !normalizedEmail) {
      showInviteToast('Veuillez renseigner une adresse email valide.', 'error')
      return
    }

    try {
      setError('')
      setMemberActionLoading({ memberId: member.id, action: options?.mode ?? 'email' })
      const response = await fetch(`/api/clans/${clanId}/members/${member.id}/invite`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...(normalizedEmail ? { email: normalizedEmail } : {}),
          sendEmail: shouldSendEmail,
        }),
      })

      const payload = (await response.json().catch(() => null)) as InviteCreationResponse | null
      if (!response.ok) {
        if (response.status === 401) {
          router.replace(`/login?redirect=${encodeURIComponent(`/clans/${clanId}/settings/members`)}`)
          return
        }

        throw new Error(payload?.error ?? 'Failed to send invite')
      }

      if (!payload?.activationUrl) {
        throw new Error('Activation URL manquante dans la reponse')
      }

      const data = await fetchMembersAndRoles(clanId)
      setMembers(data.members)
      setRoles(data.roles)
      setInviteDraftMemberId(null)
      setInviteEmailDraft('')

      return {
        activationUrl: payload.activationUrl,
        expiresAt: payload.expiresAt ?? null,
      }
    } catch (inviteError) {
      showInviteToast(inviteError instanceof Error ? inviteError.message : 'Failed to send invite', 'error')
      return null
    } finally {
      setMemberActionLoading((current) => (current?.memberId === member.id ? null : current))
    }
  }

  async function handleRegenerateAndCopyDiscord(member: ClanMemberWithRole) {
    const result = await handleInvite(member, '', { sendEmail: false, mode: 'discord' })
    if (!result) {
      showInviteToast('Impossible de regenerer le lien pour la copie Discord.', 'error')
      return
    }

    await handleCopyDiscordMessage(member, result.activationUrl, result.expiresAt)
  }

  async function handleInviteAndCopyDiscord(member: ClanMemberWithRole, email: string) {
    const result = await handleInvite(member, email, { sendEmail: false, mode: 'discord' })
    if (!result) {
      return
    }

    await handleCopyDiscordMessage(member, result.activationUrl, result.expiresAt)
  }

  function buildDiscordInviteMessage(memberName: string, activationUrl: string, expiresAt: string | null) {
    const expirationText = expiresAt
      ? new Date(expiresAt).toLocaleDateString()
      : 'dans 48h'

    return [
      `Salut ${memberName},`,
      '',
      `Voici ton lien d'activation PUBG Clan (valide jusqu'au ${expirationText}) :`,
      activationUrl,
      '',
      'Si le lien a expire, demande une nouvelle invitation.',
    ].join('\n')
  }

  async function handleCopyDiscordMessage(member: ClanMemberWithRole, activationUrl: string, expiresAt: string | null) {
    try {
      const message = buildDiscordInviteMessage(member.name, activationUrl, expiresAt)
      await navigator.clipboard.writeText(message)
      setCopiedDiscordMemberId(member.id)
      showCopyToast('Message d invitation copie dans le presse-papiers.', 'success')
      showMemberInlineToast(member.id, 'Message Discord copie dans le presse-papiers.', 'success')
      window.setTimeout(() => {
        setCopiedDiscordMemberId((current) => (current === member.id ? null : current))
      }, 1800)
    } catch {
      showCopyToast('Impossible de copier le message Discord automatiquement.', 'error')
      showMemberInlineToast(member.id, 'Echec de copie du message Discord.', 'error')
    }
  }

  function openInviteDraft(member: ClanMemberWithRole, email: string) {
    setInviteDraftMemberId(member.id)
    setInviteEmailDraft(email)
  }

  function getLatestInvitationEmail(member: ClanMemberWithRole) {
    return member.pendingInvite?.email ?? member.recentInvites[0]?.email ?? ''
  }

  async function resetInviteFlow(member: ClanMemberWithRole) {
    if (!clanId) {
      return
    }

    try {
      setError('')
      setMemberActionLoading({ memberId: member.id, action: 'reset' })

      const response = await fetch(`/api/clans/${clanId}/members/${member.id}/invite`, {
        method: 'DELETE',
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        if (response.status === 401) {
          router.replace(`/login?redirect=${encodeURIComponent(`/clans/${clanId}/settings/members`)}`)
          return
        }

        throw new Error(payload?.error ?? 'Impossible de reinitialiser l invitation')
      }

      const data = await fetchMembersAndRoles(clanId)
      setMembers(data.members)
      setRoles(data.roles)

      showInviteToast('Invitation active invalidee. Le membre revient a "Aucun accès".', 'success')
      showMemberInlineToast(member.id, 'Invitation reinitialisee et token invalide.', 'success')
    } catch (resetError) {
      showInviteToast(
        resetError instanceof Error
          ? resetError.message
          : 'Impossible de reinitialiser l invitation',
        'error'
      )
      showMemberInlineToast(member.id, 'Echec de reinitialisation.', 'error')
    } finally {
      setMemberActionLoading((current) => (current?.memberId === member.id ? null : current))
    }

    setCopiedDiscordMemberId((current) => (current === member.id ? null : current))
    openInviteDraft(member, '')
  }

  function renderMemberAccess(member: ClanMemberWithRole) {
    if (member.hasAccount) {
      return (
        <span className="member-access-badge member-access-badge--active">
          Actif
        </span>
      )
    }

      return (
        <span className="member-access-badge member-access-badge--inactive">
          Aucun accès
        </span>
      )
  }

  function renderMemberActions(
    member: ClanMemberWithRole,
    currentRoleOption: ClanRole | undefined
  ) {
    const isMemberBusy = memberActionLoading?.memberId === member.id
    const isEmailBusy = isMemberBusy && memberActionLoading?.action === 'email'
    const isDiscordBusy = isMemberBusy && memberActionLoading?.action === 'discord'
    const canResetInvitation = member.recentInvites.length > 0 || Boolean(member.pendingInvite)
    const hasInvitationHistory = canResetInvitation
    const canShowInviteControls = isEmailDeliveryReady && (!member.hasAccount || hasInvitationHistory)
    const latestInvitationEmail = getLatestInvitationEmail(member)

    return (
      <div className="flex flex-wrap items-center gap-2">
        {memberInlineToast?.memberId === member.id ? (
          <div
            className={`w-full rounded border px-2 py-1 text-xs font-medium ${
              memberInlineToast.tone === 'success'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-rose-300 bg-rose-50 text-rose-800'
            }`}
            role="status"
            aria-live="polite"
          >
            {memberInlineToast.message}
          </div>
        ) : null}

        {currentRoleOption ? (
          <RoleAssignment
            member={{ id: member.id, name: member.name }}
            currentRole={currentRoleOption}
            availableRoles={roles}
            onAssign={(roleId) => handleAssign(member.id, roleId)}
            onRevokeOwner={() => handleRevokeOwner(member.id)}
            isSuperUser={isSuperUser}
          />
        ) : (
          <span className="text-xs text-gray-500">Aucun rôle</span>
        )}

        {canShowInviteControls ? (
          inviteDraftMemberId === member.id ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={inviteEmailDraft}
                onChange={(event) => setInviteEmailDraft(event.target.value)}
                placeholder="email@exemple.com"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
                disabled={isMemberBusy}
              />
              <button
                type="button"
                onClick={() => void handleInvite(member, inviteEmailDraft)}
                disabled={isMemberBusy}
                title="Envoie une invitation email avec le lien d activation"
                className="app-btn app-btn--xs app-btn--primary"
              >
                {isEmailBusy ? 'Envoi...' : 'Envoyer'}
              </button>
              {canResetInvitation ? (
                <button
                  type="button"
                  onClick={() => void resetInviteFlow(member)}
                  disabled={isMemberBusy}
                  className="app-btn app-btn--xs app-btn--danger"
                >
                  Reinitialiser invitation
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setInviteDraftMemberId(null)
                  setInviteEmailDraft('')
                }}
                disabled={isMemberBusy}
                className="app-btn app-btn--xs app-btn--secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleInviteAndCopyDiscord(member, inviteEmailDraft)}
                disabled={isMemberBusy}
                title="Genere un nouveau token et copie un message pret pour Discord (sans envoi email)"
                className="app-btn app-btn--xs app-btn--secondary"
              >
                {isDiscordBusy ? 'Generation...' : 'Discord'}
              </button>
            </div>
          ) : (
            <>
              {!member.hasAccount ? (
                <button
                  type="button"
                  onClick={() => {
                    openInviteDraft(member, getDisplayInviteEmail(latestInvitationEmail))
                  }}
                  disabled={isMemberBusy}
                  title="Ouvre le formulaire pour saisir ou modifier l adresse email d invitation"
                  className="app-btn app-btn--xs app-btn--primary"
                >
                  Inviter
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleRegenerateAndCopyDiscord(member)}
                disabled={isMemberBusy}
                title="Genere un message Discord pret a copier dans le presse-papiers"
                className="app-btn app-btn--xs app-btn--secondary"
              >
                Discord
              </button>
              {canResetInvitation ? (
                <button
                  type="button"
                  onClick={() => void resetInviteFlow(member)}
                  disabled={isMemberBusy}
                  className="app-btn app-btn--xs app-btn--danger"
                >
                  Reinit invitation
                </button>
              ) : null}
            </>
          )
        ) : null}

        {member.recentInvites.length > 0 ? (
          <div className="w-full rounded border border-gray-200 bg-white p-2 text-xs text-gray-600">
            <p className="font-semibold text-gray-700">5 dernieres invitations</p>
            <div className="mt-1 space-y-1">
              {member.recentInvites.slice(0, 5).map((invite) => {
                const status = invite.acceptedAt
                  ? 'Acceptee'
                  : invite.revokedAt
                    ? 'Revoquee'
                    : new Date(invite.expiresAt) < new Date()
                      ? 'Expiree'
                      : 'En attente'

                return (
                  <p key={invite.id}>
                    {new Date(invite.createdAt).toLocaleDateString()} - {invite.email || 'Invitation Discord'} - {status}
                  </p>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  if (!clanId) {
    return null
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <NavigationTrail
        currentLabel="Joueurs et rôles"
        currentHref={`/clans/${clanId}/settings/members`}
        fallbackParent={{ href: `/clans/${clanId}/settings`, label: 'Paramètres', altHref: '/clans' }}
      />
      <header
        className="relative mb-6 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/banner-members.jpg')`, backgroundPosition: 'center 35%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Users className="h-4 w-4 text-blue-400 sm:h-6 sm:w-6" aria-hidden="true" />
                <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">
                  Membres et rôles
                </h1>
              </div>
              <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
                Cartes premium pour les membres du clan, leurs rôles et leurs invitations.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/members/add" className="app-btn app-btn--sm app-btn--primary shadow-sm hidden sm:inline-flex">Ajouter</Link>
              <Link href="/clans" className="app-btn app-btn--sm bg-white/10 text-white hover:bg-white/20 border-white/20 shadow-sm hidden sm:inline-flex">Changer de clan</Link>
            </div>
          </div>
        </div>
      </header>
      
      <div className="mb-6">
        <ClanSyncPanel clanId={clanId} pubgClanId={overviewData?.clan?.pubgClanId} />
      </div>
      {copyToast ? (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg ${
            copyToast.tone === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
          role="status"
          aria-live="polite"
        >
          {copyToast.message}
        </div>
      ) : null}
      {inviteToast ? (
        <div
          className={`fixed bottom-4 left-4 z-50 rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg ${
            inviteToast.tone === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
          role="status"
          aria-live="polite"
        >
          {inviteToast.message}
        </div>
      ) : null}

      {loading ? <p className="text-sm text-gray-600">Chargement...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && emailStatusLoaded && !isEmailDeliveryReady ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Invitations email desactivees. Effectuez d&apos;abord un test reussi dans{' '}
          <Link href="/settings/email-delivery" className="font-semibold underline">
            Configuration email
          </Link>
          .
        </div>
      ) : null}

      {!loading && !error ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {sortedMembers.length} membre{sortedMembers.length > 1 ? 's' : ''} du clan
            </p>
            <SegmentedControl
              options={[
                { value: 'az', label: 'Alpha' },
                { value: 'za', label: 'Inverse' },
              ]}
              value={nameSortOrder}
              onChange={setNameSortOrder}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedMembers.map((member) => {
              const currentRole =
                member.roles.find((role) => role.name === member.role) ?? member.roles[0]
              const currentRoleOption =
                roles.find((role) => role.id === currentRole?.roleId) ??
                roles.find((role) => role.name.toLowerCase() === member.role.toLowerCase()) ??
                roles.find((role) => role.name === 'Member') ??
                roles[0]

              return (
                <article
                  key={member.id}
                  className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.55)]"
                >
                  <div className="bg-gradient-to-r from-slate-950 via-slate-800 to-slate-700 px-5 py-4 text-white">
                    <div className="flex items-start gap-4">
                      <div className="app-avatar flex h-14 w-14 shrink-0">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.name + ' avatar'}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <span className="text-base font-black tracking-wide text-white">
                            {getAvatarInitials(member.name)}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-bold text-white">{member.name}</p>
                        <p className="mt-1 text-sm text-slate-300">
                          Rejoint le {new Date(member.joinedAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getRoleBadgeClass(member.role)}`}>
                          {member.role}
                        </span>
                        {member.isSuperUser ? (
                          <span className="rounded-full bg-violet-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm">
                            ★ SuperUser
                          </span>
                        ) : null}
                        {renderMemberAccess(member)}
                      </div>
                    </div>
                  </div>

                  <div className="p-5">{renderMemberActions(member, currentRoleOption)}</div>
                </article>
              )
            })}
          </div>

          {!sortedMembers.length ? (
            <div className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-600 shadow-sm">
              Aucun membre dans ce clan.
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  )
}
