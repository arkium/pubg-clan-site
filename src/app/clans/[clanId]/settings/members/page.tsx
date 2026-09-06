'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowRightLeft, ChevronDown, Loader2, Search, Swords, Users, UserX, X } from 'lucide-react'

import RoleAssignment from '@/components/RoleAssignment'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import ClanSyncPanel from '@/components/settings/ClanSyncPanel'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
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
  lastMatchAt?: string | null
  pubgPlayerName?: string | null
  platformShard?: string | null
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

function getRoleBadgeAbbr(roleName: string) {
  const normalizedRole = roleName.trim().toLowerCase()

  switch (normalizedRole) {
    case 'owner':
      return 'O'
    case 'admin':
      return 'A'
    case 'moderator':
      return 'MOD'
    case 'member':
      return 'M'
    default:
      return roleName.trim().slice(0, 2).toUpperCase()
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

function formatDaysAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Aucun match'
  const matchDate = new Date(dateStr)
  if (isNaN(matchDate.getTime())) return 'Aucun match'

  const now = new Date()
  const startOfNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfMatch = new Date(matchDate.getFullYear(), matchDate.getMonth(), matchDate.getDate()).getTime()
  const diffDays = Math.round((startOfNow - startOfMatch) / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) {
    return 'Aujourd’hui'
  }
  return `-${diffDays}j`
}

type SortCriteria = 'date' | 'name'
type SortDirection = 'az' | 'za'

export default function ClanMembersSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const { data: overviewData } = useClanOverview(clanId)
  const { isSuperUser } = useAuthSession()

  const [members, setMembers] = useState<ClanMemberWithRole[]>([])
  const [roles, setRoles] = useState<ClanRole[]>([])
  const [sortCriteria, setSortCriteria] = useState<SortCriteria>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('az')
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
  const [expandedMemberIds, setExpandedMemberIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isPubgDiffModalOpen, setIsPubgDiffModalOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<ClanMemberWithRole | null>(null)
  const [memberToTransfer, setMemberToTransfer] = useState<ClanMemberWithRole | null>(null)
  const [selectedTargetClanId, setSelectedTargetClanId] = useState<number | null>(null)
  const [availableClans, setAvailableClans] = useState<
    Array<{ id: number; name: string; tag: string; platformShard: string }>
  >([])
  const [actionSubmitting, setActionSubmitting] = useState(false)

  function toggleMemberExpanded(memberId: number) {
    setExpandedMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) {
        next.delete(memberId)
      } else {
        next.add(memberId)
      }
      return next
    })
  }

  const sortedMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = query
      ? members.filter((member) => member.name.toLowerCase().includes(query))
      : members

    return [...filtered].sort((left, right) => {
      if (sortCriteria === 'date') {
        const leftTime = left.lastMatchAt ? new Date(left.lastMatchAt).getTime() : 0
        const rightTime = right.lastMatchAt ? new Date(right.lastMatchAt).getTime() : 0
        if (leftTime !== rightTime) {
          return sortDirection === 'az' ? rightTime - leftTime : leftTime - rightTime
        }
        return left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' })
      }

      const comparison = left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' })
      return sortDirection === 'az' ? comparison : comparison * -1
    })
  }, [members, sortCriteria, sortDirection, searchQuery])

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

  useEffect(() => {
    if (!isSuperUser) return

    let cancelled = false
    async function loadClans() {
      try {
        const res = await fetch('/api/clans')
        if (res.ok) {
          const data = (await res.json()) as Array<{
            id: number
            name: string
            tag: string
            platformShard: string
          }>
          if (!cancelled && Array.isArray(data)) {
            setAvailableClans(
              data.map((c) => ({
                id: c.id,
                name: c.name,
                tag: c.tag,
                platformShard: c.platformShard,
              }))
            )
          }
        }
      } catch (err) {
        console.error('Failed to load clans for transfer', err)
      }
    }
    void loadClans()
    return () => {
      cancelled = true
    }
  }, [isSuperUser])

  async function handleConfirmRemoveMember() {
    if (!memberToRemove || !clanId) return
    try {
      setActionSubmitting(true)
      const res = await fetch(`/api/members/${memberToRemove.id}`, {
        method: 'DELETE',
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        throw new Error(data?.error || 'Échec lors de l’arrêt du suivi')
      }
      showCopyToast(
        `Le suivi de ${memberToRemove.name} a été arrêté avec succès. Les stats du clan ont été actualisées.`,
        'success'
      )
      setMemberToRemove(null)
      const refreshed = await fetchMembersAndRoles(clanId)
      setMembers(refreshed.members)
      setRoles(refreshed.roles)
    } catch (err) {
      showCopyToast(err instanceof Error ? err.message : 'Erreur inconnue', 'error')
    } finally {
      setActionSubmitting(false)
    }
  }

  async function handleConfirmTransferMember() {
    if (!memberToTransfer || !selectedTargetClanId || !clanId) return
    try {
      setActionSubmitting(true)
      const res = await fetch(`/api/members/${memberToTransfer.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clanId: selectedTargetClanId }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        throw new Error(data?.error || 'Échec du transfert de clan')
      }
      const targetClan = availableClans.find((c) => c.id === selectedTargetClanId)
      showCopyToast(
        `${memberToTransfer.name} a été transféré avec succès vers le clan [${targetClan?.tag || ''}] ${targetClan?.name || ''}.`,
        'success'
      )
      setMemberToTransfer(null)
      setSelectedTargetClanId(null)
      const refreshed = await fetchMembersAndRoles(clanId)
      setMembers(refreshed.members)
      setRoles(refreshed.roles)
    } catch (err) {
      showCopyToast(err instanceof Error ? err.message : 'Erreur inconnue', 'error')
    } finally {
      setActionSubmitting(false)
    }
  }

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
        <span className="member-access-badge member-access-badge--active inline-flex h-5 items-center justify-center rounded px-1.5 text-[10px] font-bold leading-none">
          Actif
        </span>
      )
    }

    return (
      <span className="member-access-badge member-access-badge--inactive inline-flex h-5 items-center justify-center rounded px-1.5 text-[10px] font-bold leading-none">
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
          <div className="w-full rounded border border-gray-200 bg-white p-2 text-xs text-gray-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
            <p className="font-semibold text-gray-700 dark:text-slate-200">5 dernieres invitations</p>
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

        <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Gestion du membre
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {isSuperUser ? (
              <button
                type="button"
                onClick={() => {
                  const compatible = availableClans.filter(
                    (c) => c.id !== clanId && (!member.platformShard || c.platformShard === member.platformShard)
                  )
                  setSelectedTargetClanId(compatible[0]?.id ?? null)
                  setMemberToTransfer(member)
                }}
                disabled={isMemberBusy || member.role.toLowerCase() === 'owner'}
                title={
                  member.role.toLowerCase() === 'owner'
                    ? 'Le propriétaire (Owner) ne peut pas être transféré directement. Réassignez d’abord son rôle.'
                    : 'Transférer ce joueur vers un autre clan compatible'
                }
                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
                  member.role.toLowerCase() === 'owner'
                    ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                    : 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-95 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50'
                }`}
              >
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Changer de clan</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setMemberToRemove(member)}
              disabled={isMemberBusy || member.role.toLowerCase() === 'owner'}
              title={
                member.role.toLowerCase() === 'owner'
                  ? 'Le propriétaire (Owner) ne peut pas être retiré sans réassigner son rôle d’abord.'
                  : 'Arrêter le suivi de ce joueur pour ce clan'
              }
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
                member.role.toLowerCase() === 'owner'
                  ? 'cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                  : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-95 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50'
              }`}
            >
              <UserX className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Arrêter le suivi</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  function renderToolbarContent() {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {searchQuery.trim()
                ? `${sortedMembers.length} / ${members.length} membre${members.length > 1 ? 's' : ''}`
                : `${members.length} membre${members.length > 1 ? 's' : ''} du clan`}
            </p>
            {overviewData?.clanStats?.pubg?.memberCount !== null && overviewData?.clanStats?.pubg?.memberCount !== undefined ? (
              <button
                type="button"
                onClick={() => setIsPubgDiffModalOpen(true)}
                title="Cliquer pour afficher la comparaison avec le clan officiel PUBG"
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600 transition hover:bg-amber-500/20 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
              >
                <span>{overviewData.clanStats.pubg.memberCount} dans PUBG</span>
              </button>
            ) : null}
            {sortedMembers.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (expandedMemberIds.size === sortedMembers.length) {
                    setExpandedMemberIds(new Set())
                  } else {
                    setExpandedMemberIds(new Set(sortedMembers.map((m) => m.id)))
                  }
                }}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                {expandedMemberIds.size === sortedMembers.length ? 'Tout replier' : 'Tout déplier'}
              </button>
            ) : null}
          </div>

          {/* Légende des badges */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Rôles :</span>
            <div className="flex items-center gap-1.5" title="Owner (Chef de clan)">
              <span className="member-role-badge member-role-badge--owner inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[10px] font-black">
                O
              </span>
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Owner</span>
            </div>
            <div className="flex items-center gap-1.5" title="Admin">
              <span className="member-role-badge member-role-badge--admin inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[10px] font-black">
                A
              </span>
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Admin</span>
            </div>
            <div className="flex items-center gap-1.5" title="Membre">
              <span className="member-role-badge member-role-badge--member inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[10px] font-black">
                M
              </span>
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Membre</span>
            </div>
            <div className="flex items-center gap-1.5" title="SuperUser (Plateforme)">
              <span className="inline-flex h-5 items-center justify-center rounded bg-violet-500 px-1 text-[10px] font-bold text-white shadow-sm">
                ★ S
              </span>
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">SuperUser</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {overviewData?.clan?.pubgClanId ? (
              <button
                type="button"
                onClick={() => setIsPubgDiffModalOpen(true)}
                title="Comparer les membres du site avec l'API officielle PUBG"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-200 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                <ArrowRightLeft className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" aria-hidden="true" />
                <span>Comparer PUBG</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setIsSearchOpen((prev) => !prev)
                if (isSearchOpen && searchQuery) {
                  setSearchQuery('')
                }
              }}
              aria-expanded={isSearchOpen}
              title={isSearchOpen ? 'Fermer la recherche' : 'Rechercher un membre'}
              className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-semibold transition-all ${
                isSearchOpen || searchQuery
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Rechercher</span>
            </button>

            <div className="flex items-center gap-1.5">
              <SegmentedControl
                options={[
                  { value: 'date', label: 'Date' },
                  { value: 'name', label: 'Nom' },
                ]}
                value={sortCriteria}
                onChange={(val) => setSortCriteria(val as SortCriteria)}
              />
              <SegmentedControl
                options={[
                  { value: 'az', label: 'A-Z' },
                  { value: 'za', label: 'Z-A' },
                ]}
                value={sortDirection}
                onChange={(val) => setSortDirection(val as SortDirection)}
              />
            </div>
          </div>
        </div>

        {/* Barre de recherche déroulante */}
        {isSearchOpen ? (
          <div className="flex items-center gap-3 border-t border-slate-200/80 pt-3 dark:border-slate-800 animate-in fade-in duration-150">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" aria-hidden="true" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrer par nom de membre..."
                autoFocus
                className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-10 pr-10 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                  title="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {searchQuery.trim() ? (
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {sortedMembers.length} résultat{sortedMembers.length > 1 ? 's' : ''}
              </span>
            ) : null}
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className="flex-1 w-full pb-10">
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:pt-8">
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
            </div>
          </div>
        </header>

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
      </div>

      {!loading && !error ? (
        <>
          {/* Bandeau d'outils adaptatif (Composant réutilisable DockingToolbar) */}
          <DockingToolbar>
            {renderToolbarContent()}
          </DockingToolbar>

          <div className="mx-auto w-full max-w-6xl px-4 pt-4 space-y-4">
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedMembers.map((member) => {
              const currentRole =
                member.roles.find((role) => role.name === member.role) ?? member.roles[0]
              const currentRoleOption =
                roles.find((role) => role.id === currentRole?.roleId) ??
                roles.find((role) => role.name.toLowerCase() === member.role.toLowerCase()) ??
                roles.find((role) => role.name === 'Member') ??
                roles[0]
              const isExpanded =
                expandedMemberIds.has(member.id) ||
                inviteDraftMemberId === member.id ||
                memberActionLoading?.memberId === member.id

              return (
                <article
                  key={member.id}
                  className="flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_18px_50px_-30px_rgba(15,23,42,0.55)]"
                >
                  <div
                    onClick={() => toggleMemberExpanded(member.id)}
                    className="group flex flex-1 flex-col justify-center cursor-pointer border-b border-slate-200/80 bg-gradient-to-r from-slate-50 via-slate-100/70 to-slate-50 px-5 py-4 text-slate-900 select-none transition-colors hover:from-slate-100 hover:to-slate-100 dark:border-b-0 dark:from-slate-950 dark:via-slate-800 dark:to-slate-700 dark:text-white dark:hover:from-slate-900 dark:hover:to-slate-600"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleMemberExpanded(member.id)
                      }
                    }}
                    aria-expanded={isExpanded}
                    aria-label={`Gestion du membre ${member.name}`}
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <Link
                        href={`/members/${member.id}/dashboard`}
                        onClick={(e) => e.stopPropagation()}
                        className="app-avatar flex h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-300/80 bg-slate-200/90 text-slate-800 shadow-sm transition-transform hover:scale-105 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-100"
                        title={`Voir le profil de ${member.name}`}
                      >
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
                          <span className="text-base font-black tracking-wide text-current">
                            {getAvatarInitials(member.name)}
                          </span>
                        )}
                      </Link>

                      <div className="min-w-0 flex-1 flex flex-col justify-center space-y-1">
                        {/* Ligne 1 : nom player */}
                        <div className="min-w-0">
                          <Link
                            href={`/members/${member.id}/dashboard`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate text-base sm:text-lg font-bold text-slate-900 transition-colors hover:text-blue-600 hover:underline dark:text-white dark:hover:text-blue-300 block"
                            title={`Voir le profil de ${member.name}`}
                          >
                            {member.name}
                          </Link>
                        </div>

                        {/* Ligne 2 : dernier match avec icone et sa valeur */}
                        <div
                          className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
                          title={
                            member.lastMatchAt
                              ? `Dernier match : ${new Date(member.lastMatchAt).toLocaleString()} (${formatDaysAgo(member.lastMatchAt)}) • Membre depuis le ${new Date(member.joinedAt).toLocaleDateString()}`
                              : `Aucun match enregistré • Membre depuis le ${new Date(member.joinedAt).toLocaleDateString()}`
                          }
                        >
                          <Swords className="h-3.5 w-3.5 shrink-0 text-amber-500 dark:text-amber-400" aria-hidden="true" />
                          <span className="text-slate-500 dark:text-slate-400 text-[11px] font-medium">Dernier match :</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-200 text-xs">
                            {formatDaysAgo(member.lastMatchAt)}
                          </span>
                        </div>

                        {/* Ligne 3 : ensuite le role, status et le chevron */}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              title={`Rôle : ${member.role}`}
                              className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1.5 text-[10px] font-black tracking-wide ${getRoleBadgeClass(member.role)}`}
                            >
                              {getRoleBadgeAbbr(member.role)}
                            </span>

                            {member.isSuperUser ? (
                              <span
                                title="SuperUser (Plateforme)"
                                className="inline-flex h-5 items-center justify-center gap-0.5 rounded bg-violet-500 px-1.5 text-[10px] font-bold text-white shadow-sm"
                              >
                                ★ S
                              </span>
                            ) : null}

                            {renderMemberAccess(member)}
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleMemberExpanded(member.id)
                            }}
                            aria-expanded={isExpanded}
                            aria-label={
                              isExpanded
                                ? `Replier la gestion de ${member.name}`
                                : `Déployer la gestion de ${member.name}`
                            }
                            title={isExpanded ? 'Replier la gestion' : 'Déployer la gestion'}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-200/80 text-slate-700 transition-all hover:bg-slate-300 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/25 dark:hover:text-white"
                          >
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="border-t border-slate-200 bg-white p-5 transition-all dark:border-slate-800 dark:bg-slate-900/90">
                      {renderMemberActions(member, currentRoleOption)}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>

          {!sortedMembers.length ? (
            <div className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-600 shadow-sm">
              {searchQuery.trim() ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="font-semibold text-slate-800">
                    Aucun membre ne correspond à « {searchQuery.trim()} »
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs font-medium text-blue-600 hover:underline cursor-pointer"
                  >
                    Effacer le filtre de recherche
                  </button>
                </div>
              ) : (
                'Aucun membre dans ce clan.'
              )}
            </div>
          ) : null}
        </div>
      </>
    ) : null}

      {/* Modal Arrêter le suivi */}
      {memberToRemove ? (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-member-title"
        >
          <div className="app-modal-card w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
            {/* En-tête de la modale */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  <UserX className="h-6 w-6" />
                </div>
                <div>
                  <h3 id="remove-member-title" className="text-lg font-black text-slate-900 dark:text-white">
                    Arrêter le suivi de {memberToRemove.name} ?
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Retrait du joueur de l&apos;effectif actif du clan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                disabled={actionSubmitting}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Fermer la fenêtre"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Fiche récapitulative des données du joueur */}
            <div className="app-modal-inner-card mt-5 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-xs dark:border-slate-800/80 dark:bg-slate-800/50">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5 dark:border-slate-700/60">
                <span className="text-slate-500 dark:text-slate-400">Joueur concerné :</span>
                <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                  {memberToRemove.name}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5 dark:border-slate-700/60">
                <span className="text-slate-500 dark:text-slate-400">Rôle actuel :</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {memberToRemove.role}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5 dark:border-slate-700/60">
                <span className="text-slate-500 dark:text-slate-400">Plateforme :</span>
                <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                  {memberToRemove.platformShard || 'steam'}
                </span>
              </div>
              <div className="flex items-start justify-between pt-0.5">
                <span className="text-slate-500 dark:text-slate-400">Action à exécuter :</span>
                <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                  Arrêt de suivi (Désactivation clan)
                </span>
              </div>
            </div>

            {/* Explications contextuelles claires */}
            <div className="app-modal-callout mt-4 space-y-2.5 rounded-xl border border-slate-200/80 bg-white/60 p-3.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              <div className="flex items-start gap-2.5">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <div>
                  <strong className="text-slate-900 dark:text-white">Matchs passés &amp; télémétrie conservés :</strong>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                    Toutes les parties passées jouées en squad, les frags et les statistiques restent intégralement enregistrés en base. L&apos;historique du clan n&apos;est pas effacé.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <div>
                  <strong className="text-slate-900 dark:text-white">Statistiques &amp; effectif du clan :</strong>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                    Le joueur est retiré de l&apos;effectif actif et des classements. Le compteur et les totaux globaux du clan sont immédiatement recalculés sans lui.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                <div>
                  <strong className="text-slate-900 dark:text-white">Arrêt de la collecte PUBG :</strong>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-400">
                    Le robot cessera d&apos;importer les futurs matchs de ce joueur pour ce clan. Ses accès au clan sont révoqués.
                  </p>
                </div>
              </div>
            </div>

            {/* Avertissement contextuel rouge */}
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
              <p className="font-semibold text-rose-950 dark:text-rose-100">
                Action irréversible sans nouvelle demande
              </p>
              <p className="mt-1 leading-relaxed text-rose-800 dark:text-rose-300">
                Pour réintégrer ce membre ultérieurement, une nouvelle invitation ou demande d&apos;adhésion sera requise.
              </p>
            </div>

            {/* Boutons d'action */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                disabled={actionSubmitting}
                className="app-btn app-btn--md app-btn--secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRemoveMember()}
                disabled={actionSubmitting}
                className="app-btn app-btn--md bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-lg shadow-rose-900/30 inline-flex items-center gap-2"
              >
                {actionSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Traitement...</span>
                  </>
                ) : (
                  <>
                    <UserX className="h-4 w-4" aria-hidden="true" />
                    <span>Confirmer l&apos;arrêt du suivi</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal Transférer vers un autre clan */}
      {memberToTransfer ? (() => {
        const compatibleClans = availableClans.filter(
          (c) => c.id !== clanId && (!memberToTransfer.platformShard || c.platformShard === memberToTransfer.platformShard)
        )

        return (
          <div
            className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-member-title"
          >
            <div className="app-modal-card w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
              {/* En-tête de la modale */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500 border border-sky-500/20">
                    <ArrowRightLeft className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 id="transfer-member-title" className="text-lg font-black text-slate-900 dark:text-white">
                      Transférer {memberToTransfer.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Déplacement vers un autre clan compatible ({memberToTransfer.platformShard || 'steam'})
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMemberToTransfer(null)
                    setSelectedTargetClanId(null)
                  }}
                  disabled={actionSubmitting}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Fermer la fenêtre"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Sélection du clan de destination */}
              <div className="mt-5 space-y-1.5">
                <label htmlFor="target-clan-select" className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Clan de destination :
                </label>
                {compatibleClans.length > 0 ? (
                  <select
                    id="target-clan-select"
                    value={selectedTargetClanId ?? ''}
                    onChange={(e) => setSelectedTargetClanId(Number(e.target.value))}
                    disabled={actionSubmitting}
                    className="app-modal-select w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {compatibleClans.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{c.tag}] {c.name} ({c.platformShard})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                    Aucun autre clan compatible sur la plateforme <strong>{memberToTransfer.platformShard || 'steam'}</strong> n&apos;a été trouvé.
                  </div>
                )}
              </div>

              {/* Fiche récapitulative des conséquences */}
              <div className="app-modal-inner-card mt-4 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-xs dark:border-slate-800/80 dark:bg-slate-800/50">
                <div className="flex items-start gap-2.5 pb-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  <div>
                    <strong className="text-slate-900 dark:text-blue-300">Rôle dans le nouveau clan :</strong>
                    <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                      Le joueur recevra automatiquement le rôle par défaut <strong>Membre</strong> dans son nouveau clan. Ses permissions actuelles sont révoquées.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 pb-2.5 border-b border-slate-200/60 dark:border-slate-700/60">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <div>
                    <strong className="text-slate-900 dark:text-emerald-300">Historique passé &amp; futurs matchs :</strong>
                    <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                      Les matchs d&apos;escouade passés restent rattachés à ce clan. Les prochaines parties jouées seront collectées pour le nouveau clan.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  <div>
                    <strong className="text-slate-900 dark:text-amber-300">Synchronisation des deux clans :</strong>
                    <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                      Les totaux et effectifs de l&apos;ancien et du nouveau clan seront automatiquement recalculés à l&apos;issue du transfert.
                    </p>
                  </div>
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setMemberToTransfer(null)
                    setSelectedTargetClanId(null)
                  }}
                  disabled={actionSubmitting}
                  className="app-btn app-btn--md app-btn--secondary"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmTransferMember()}
                  disabled={actionSubmitting || !selectedTargetClanId || compatibleClans.length === 0}
                  className="app-btn app-btn--md app-btn--primary inline-flex items-center gap-2"
                >
                  {actionSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Transfert...</span>
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                      <span>Confirmer le transfert</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )
      })() : null}

      {/* Modal Comparaison PUBG vs Site */}
      {isPubgDiffModalOpen ? (
        <div
          className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pubg-diff-modal-title"
        >
          <div className="app-modal-card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
            {/* En-tête de la modale */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-amber-500">
                  <ArrowRightLeft className="h-6 w-6" />
                </div>
                <div>
                  <h3 id="pubg-diff-modal-title" className="text-lg font-black text-slate-900 dark:text-white">
                    Comparaison PUBG vs Site
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Rapprochement entre les membres du clan officiel PUBG et les joueurs trackés
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPubgDiffModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Fermer la fenêtre"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Corps scrollable */}
            <div className="mt-4 flex-1 overflow-y-auto pr-1">
              <ClanSyncPanel
                clanId={clanId}
                pubgClanId={overviewData?.clan?.pubgClanId}
                isModal={true}
              />
            </div>

            {/* Pied de page */}
            <div className="mt-5 flex items-center justify-end border-t border-slate-200/80 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsPubgDiffModalOpen(false)}
                className="app-btn app-btn--md app-btn--secondary"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
