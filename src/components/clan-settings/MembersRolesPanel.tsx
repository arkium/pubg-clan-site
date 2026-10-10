'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  Loader2,
  LogOut,
  type LucideIcon,
  Mail,
  MessageSquare,
  Search,
  Swords,
  Users,
  UserX,
  X,
} from 'lucide-react'

import RoleAssignment from '@/components/RoleAssignment'
import { MembersSectionHeader } from '@/components/clan-settings/MembersSettingsTabs'
import ClanSyncPanel from '@/components/settings/ClanSyncPanel'
import {
  Callout,
  ChoiceMenu,
  EmptyState,
  ErrorState,
  IconTile,
  ListSkeleton,
  Tag,
  ToastStack,
  toneStyle,
  type Toast,
  type Tone,
} from '@/components/ui/CharteKit'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useClanOverview } from '@/hooks/useClanOverview'
import { useAuthSession } from '@/hooks/useAuthSession'
// Texte copié par l'Owner, rendu côté client : la constante, pas `SITE_NAME` (serveur seulement, src/lib/site-name.ts).
import { SITE_DOMAIN } from '@/lib/legal/legal-info'

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

/** Onglet « Membres et invitations » de /clans/[clanId]/settings/members (ex-page entière, lot 3b). */
export default function MembersRolesPanel() {
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
  const [isPubgDiffModalOpen, setIsPubgDiffModalOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<ClanMemberWithRole | null>(null)
  const [memberToTransfer, setMemberToTransfer] = useState<ClanMemberWithRole | null>(null)
  // Chantier 3 : bascule vers le clan systeme, ouverte aux Owners.
  const [memberToDemote, setMemberToDemote] = useState<ClanMemberWithRole | null>(null)
  const [selectedTargetClanId, setSelectedTargetClanId] = useState<number | null>(null)
  const [availableClans, setAvailableClans] = useState<
    Array<{ id: number; name: string; tag: string; platformShard: string; isSystem: boolean }>
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

  async function fetchEmailDeliveryStatus(targetClanId: number) {
    // Statut en lecture seule : la configuration SMTP (/api/settings/email-delivery) est réservée au SuperUser
    const response = await fetch(`/api/clans/${targetClanId}/settings/email-delivery`, { cache: 'no-store' })
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
          fetchEmailDeliveryStatus(currentClanId),
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
    // Charge aussi pour un Owner : il lui faut le clan systeme de son shard pour
    // proposer la bascule du chantier 3.
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
            isSystem?: boolean
          }>
          if (!cancelled && Array.isArray(data)) {
            setAvailableClans(
              data.map((c) => ({
                id: c.id,
                name: c.name,
                tag: c.tag,
                platformShard: c.platformShard,
                isSystem: Boolean(c.isSystem),
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
  }, [])

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

  async function handleConfirmDemoteMember() {
    if (!memberToDemote || !clanId) return
    const systemClan = availableClans.find(
      (c) => c.isSystem && (!memberToDemote.platformShard || c.platformShard === memberToDemote.platformShard)
    )
    if (!systemClan) {
      showCopyToast("Aucun clan technique n'existe encore pour cette plateforme.", 'error')
      return
    }
    try {
      setActionSubmitting(true)
      const res = await fetch(`/api/members/${memberToDemote.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clanId: systemClan.id }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        throw new Error(data?.error || 'Échec de la bascule vers le clan technique')
      }
      showCopyToast(
        `${memberToDemote.name} a été bascule vers [${systemClan.tag}] ${systemClan.name}. Son suivi PUBG continue.`,
        'success'
      )
      setMemberToDemote(null)
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
      `Voici ton lien pour activer ton compte ${SITE_DOMAIN} (valable jusqu'au ${expirationText}) :`,
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
      showMemberInlineToast(member.id, 'Échec de copie du message Discord.', 'error')
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
      showMemberInlineToast(member.id, 'Échec de reinitialisation.', 'error')
    } finally {
      setMemberActionLoading((current) => (current?.memberId === member.id ? null : current))
    }

    setCopiedDiscordMemberId((current) => (current === member.id ? null : current))
    openInviteDraft(member, '')
  }

  function renderMemberAccess(member: ClanMemberWithRole) {
    return member.hasAccount ? <Tag tone="pos">Accès actif</Tag> : <Tag tone="neutral">Aucun accès</Tag>
  }

  function renderMemberActions(member: ClanMemberWithRole, currentRoleOption: ClanRole | undefined) {
    const isMemberBusy = memberActionLoading?.memberId === member.id
    // Clan technique du shard de ce membre — absent tant qu'aucun joueur sans clan
    // n'a été parqué, auquel cas le bouton de sortie ne s'affiche pas.
    const systemClanForMember = availableClans.find(
      (c) => c.isSystem && (!member.platformShard || c.platformShard === member.platformShard)
    )
    const isEmailBusy = isMemberBusy && memberActionLoading?.action === 'email'
    const isDiscordBusy = isMemberBusy && memberActionLoading?.action === 'discord'
    const canResetInvitation = member.recentInvites.length > 0 || Boolean(member.pendingInvite)
    const canShowInviteControls = isEmailDeliveryReady && (!member.hasAccount || canResetInvitation)
    const latestInvitationEmail = getLatestInvitationEmail(member)
    const isOwner = member.role.toLowerCase() === 'owner'

    return (
      <div className="flex flex-col gap-3">
        {memberInlineToast?.memberId === member.id ? (
          <p
            className={`t-body m-0 rounded-[10px] px-3 py-2 ${memberInlineToast.tone === 'success' ? 't-pos' : 't-neg'}`}
            style={toneStyle(memberInlineToast.tone === 'success' ? 'pos' : 'neg')}
            role="status"
            aria-live="polite"
          >
            {memberInlineToast.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <span className="t-label">Rôle</span>
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
            <span className="t-meta">Aucun rôle</span>
          )}
        </div>

        {canShowInviteControls ? (
          <div className="flex flex-col gap-1.5">
            <span className="t-label">Invitation au site</span>
            {inviteDraftMemberId === member.id ? (
              <div className="flex flex-col gap-2">
                <input
                  type="email"
                  value={inviteEmailDraft}
                  onChange={(event) => setInviteEmailDraft(event.target.value)}
                  placeholder="email@exemple.com"
                  aria-label={`E-mail d’invitation de ${member.name}`}
                  className="app-input"
                  disabled={isMemberBusy}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleInvite(member, inviteEmailDraft)}
                    disabled={isMemberBusy}
                    title="Envoie une invitation par e-mail avec le lien d’activation"
                    className="app-btn app-btn--xs app-btn--primary gap-1"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    {isEmailBusy ? 'Envoi…' : 'Envoyer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInviteAndCopyDiscord(member, inviteEmailDraft)}
                    disabled={isMemberBusy}
                    title="Génère un nouveau lien et copie un message prêt pour Discord, sans e-mail"
                    className="app-btn app-btn--xs app-btn--secondary gap-1"
                  >
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    {isDiscordBusy ? 'Génération…' : 'Discord'}
                  </button>
                  {canResetInvitation ? (
                    <button
                      type="button"
                      onClick={() => void resetInviteFlow(member)}
                      disabled={isMemberBusy}
                      className="app-btn app-btn--xs app-btn--danger"
                    >
                      Réinitialiser
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
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {!member.hasAccount ? (
                  <button
                    type="button"
                    onClick={() => openInviteDraft(member, getDisplayInviteEmail(latestInvitationEmail))}
                    disabled={isMemberBusy}
                    title="Saisir ou modifier l’adresse e-mail d’invitation"
                    className="app-btn app-btn--xs app-btn--primary gap-1"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    Inviter
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleRegenerateAndCopyDiscord(member)}
                  disabled={isMemberBusy}
                  title="Copie un message prêt pour Discord dans le presse-papiers"
                  className="app-btn app-btn--xs app-btn--secondary gap-1"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  Discord
                </button>
                {canResetInvitation ? (
                  <button
                    type="button"
                    onClick={() => void resetInviteFlow(member)}
                    disabled={isMemberBusy}
                    className="app-btn app-btn--xs app-btn--danger"
                  >
                    Réinitialiser l’invitation
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {member.recentInvites.length > 0 ? (
          <div className="app-panel-muted flex flex-col gap-1 px-3 py-2">
            <span className="t-label">Dernières invitations</span>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {member.recentInvites.slice(0, 5).map((invite) => {
                const [label, tone]: [string, Tone] = invite.acceptedAt
                  ? ['Acceptée', 'pos']
                  : invite.revokedAt
                    ? ['Révoquée', 'neutral']
                    : new Date(invite.expiresAt) < new Date()
                      ? ['Expirée', 'warn']
                      : ['En attente', 'sky']
                return (
                  <li key={invite.id} className="t-meta flex flex-wrap items-center gap-1.5">
                    <Tag tone={tone}>{label}</Tag>
                    {new Date(invite.createdAt).toLocaleDateString('fr-FR')} · {invite.email || 'Invitation Discord'}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5 border-t border-gray-200 pt-3">
          <span className="t-label">Gestion du membre</span>
          <div className="flex flex-wrap gap-2">
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
                disabled={isMemberBusy || isOwner}
                title={
                  isOwner
                    ? 'Un Owner ne peut pas être transféré : changez d’abord son rôle.'
                    : 'Transférer ce joueur vers un autre clan compatible'
                }
                className="app-btn app-btn--xs app-btn--secondary gap-1"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                Changer de clan
              </button>
            ) : null}
            {/* Seule action de sortie ouverte à un Owner : le joueur reste suivi, la bascule est tracée. */}
            {systemClanForMember ? (
              <button
                type="button"
                onClick={() => setMemberToDemote(member)}
                disabled={isMemberBusy || isOwner}
                title={
                  isOwner
                    ? 'Un Owner ne peut pas sortir du clan : changez d’abord son rôle.'
                    : `Sortir ce joueur du clan sans arrêter son suivi — il rejoint [${systemClanForMember.tag}] ${systemClanForMember.name}`
                }
                className="app-btn app-btn--xs app-btn--secondary gap-1"
              >
                <LogOut className="h-3.5 w-3.5" style={{ color: 'var(--game-warn)' }} aria-hidden="true" />
                Sortir du clan
              </button>
            ) : null}
            {/* L'arrêt de suivi coupe la synchronisation PUBG : SuperUser seulement. */}
            {isSuperUser ? (
              <button
                type="button"
                onClick={() => setMemberToRemove(member)}
                disabled={isMemberBusy || isOwner}
                title={
                  isOwner
                    ? 'Un Owner ne peut pas être retiré : changez d’abord son rôle.'
                    : 'Arrêter le suivi de ce joueur : la synchronisation PUBG s’arrête'
                }
                className="app-btn app-btn--xs app-btn--danger gap-1"
              >
                <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                Arrêter le suivi
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  const pubgMemberCount = overviewData?.clanStats?.pubg?.memberCount ?? null
  const toasts: Toast[] = [
    ...(copyToast ? [{ id: 1, text: copyToast.message, tone: copyToast.tone }] : []),
    ...(inviteToast ? [{ id: 2, text: inviteToast.message, tone: inviteToast.tone }] : []),
  ]

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter flex flex-col gap-4">
        {clanId ? (
          <MembersSectionHeader
            clanId={clanId}
            active="membres"
            title="Membres et invitations"
            subtitle="Joueurs suivis du clan, leur rôle, leur accès au site et leurs invitations."
            icon={Users}
            pills={[
              <>
                <span className="t-num">{members.length}</span> membre{members.length > 1 ? 's' : ''}
              </>,
              ...(pubgMemberCount !== null ? [<><span className="t-num">{pubgMemberCount}</span> dans le clan PUBG</>] : []),
            ]}
          />
        ) : null}

        {loading ? <ListSkeleton rows={4} /> : null}
        {error ? (
          <section className="app-panel">
            <ErrorState message={error} />
          </section>
        ) : null}
        {!loading && emailStatusLoaded && !isEmailDeliveryReady ? (
          <Callout tone="warn" icon={Mail} title="Invitations par e-mail désactivées">
            {isSuperUser ? (
              <>
                Réussissez d’abord un envoi de test dans{' '}
                <Link href="/settings/email-delivery" className="app-link font-semibold">
                  l’e-mail d’envoi
                </Link>
                . Les invitations par Discord restent possibles.
              </>
            ) : (
              <>L’envoi d’e-mails n’est pas encore configuré sur le site. Les invitations par Discord restent possibles.</>
            )}
          </Callout>
        ) : null}
      </div>

      {!loading && !error ? (
        <>
          <DockingToolbar ariaLabel="Outils de gestion des membres">
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Filtrer par nom de membre</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Filtrer par nom…"
                  className="app-input pl-9"
                />
              </label>
              {/* Un seul menu de tri : le bandeau tient sur une ligne, aussi sur mobile (charte). */}
              <div className="w-40 shrink-0 sm:w-48">
                <ChoiceMenu
                  label="Tri des membres"
                  value={`${sortCriteria}-${sortDirection}`}
                  onChange={(value) => {
                    const [criteria, direction] = value.split('-') as [SortCriteria, SortDirection]
                    setSortCriteria(criteria)
                    setSortDirection(direction)
                  }}
                  options={[
                    { value: 'date-az', label: 'Dernier match, récent' },
                    { value: 'date-za', label: 'Dernier match, ancien' },
                    { value: 'name-az', label: 'Nom, A → Z' },
                    { value: 'name-za', label: 'Nom, Z → A' },
                  ]}
                />
              </div>
            </div>
          </DockingToolbar>

          <div className="app-container app-gutter flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="t-meta">
                {searchQuery.trim()
                  ? `${sortedMembers.length} / ${members.length} membre${members.length > 1 ? 's' : ''}`
                  : `${members.length} membre${members.length > 1 ? 's' : ''} du clan`}
              </span>
              <span className="flex flex-wrap items-center gap-3">
                {overviewData?.clan?.pubgClanId ? (
                  <button
                    type="button"
                    onClick={() => setIsPubgDiffModalOpen(true)}
                    title="Comparer les membres du site avec le clan officiel PUBG"
                    className="app-link inline-flex items-center gap-1 text-xs font-semibold"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Comparer avec PUBG
                  </button>
                ) : null}
                {sortedMembers.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedMemberIds(
                        expandedMemberIds.size === sortedMembers.length ? new Set() : new Set(sortedMembers.map((m) => m.id))
                      )
                    }
                    className="app-link text-xs font-semibold"
                  >
                    {expandedMemberIds.size === sortedMembers.length ? 'Tout replier' : 'Tout déplier'}
                  </button>
                ) : null}
              </span>
            </div>

            <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sortedMembers.map((member) => {
                const currentRole = member.roles.find((role) => role.name === member.role) ?? member.roles[0]
                const currentRoleOption =
                  roles.find((role) => role.id === currentRole?.roleId) ??
                  roles.find((role) => role.name.toLowerCase() === member.role.toLowerCase()) ??
                  roles.find((role) => role.name === 'Member') ??
                  roles[0]
                const isExpanded =
                  expandedMemberIds.has(member.id) ||
                  inviteDraftMemberId === member.id ||
                  memberActionLoading?.memberId === member.id
                const roleName = member.role.trim().toLowerCase()

                return (
                  <article key={member.id} className="app-panel flex flex-col overflow-hidden">
                    <div className="flex items-start gap-3 p-3.5">
                      <Link
                        href={`/members/${member.id}/dashboard`}
                        className="app-avatar flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-gray-100 text-gray-700"
                        title={`Voir le profil de ${member.name}`}
                      >
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(event) => {
                              ;(event.currentTarget as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <span className="text-sm font-black">{getAvatarInitials(member.name)}</span>
                        )}
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Link
                          href={`/members/${member.id}/dashboard`}
                          className="t-card-title truncate hover:underline"
                          title={`Voir le profil de ${member.name}`}
                        >
                          {member.name}
                        </Link>
                        <span
                          className="t-meta flex items-center gap-1.5"
                          title={`Membre depuis le ${new Date(member.joinedAt).toLocaleDateString('fr-FR')}`}
                        >
                          <Swords className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--game-gold)' }} aria-hidden="true" />
                          Dernier match : {formatDaysAgo(member.lastMatchAt)}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`member-role-badge ${roleName === 'owner' ? 'member-role-badge--owner' : roleName === 'member' ? 'member-role-badge--member' : 'member-role-badge--default'}`}
                          >
                            {roleName === 'owner' ? 'Owner' : roleName === 'member' ? 'Membre' : member.role}
                          </span>
                          {member.isSuperUser ? (
                            <span className="member-role-badge member-role-badge--superuser">SuperUser</span>
                          ) : null}
                          {renderMemberAccess(member)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleMemberExpanded(member.id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? `Replier la gestion de ${member.name}` : `Gérer ${member.name}`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                    {isExpanded ? (
                      <div className="border-t border-gray-200 p-3.5">{renderMemberActions(member, currentRoleOption)}</div>
                    ) : null}
                  </article>
                )
              })}
            </div>

            {!sortedMembers.length ? (
              searchQuery.trim() ? (
                <EmptyState
                  icon={Search}
                  title={`Aucun membre ne correspond à « ${searchQuery.trim()} »`}
                  text={
                    <button type="button" onClick={() => setSearchQuery('')} className="app-link font-semibold">
                      Effacer le filtre
                    </button>
                  }
                />
              ) : (
                <EmptyState icon={Users} title="Aucun membre dans ce clan" />
              )
            ) : null}
          </div>
        </>
      ) : null}

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => (id === 1 ? setCopyToast(null) : setInviteToast(null))}
      />

      {memberToRemove ? (
        <PanelModal
          id="remove-member-title"
          icon={UserX}
          tone="neg"
          title={`Arrêter le suivi de ${memberToRemove.name} ?`}
          subtitle="Retrait du joueur de l’effectif actif du clan"
          busy={actionSubmitting}
          onClose={() => setMemberToRemove(null)}
          footer={
            <button
              type="button"
              onClick={() => void handleConfirmRemoveMember()}
              disabled={actionSubmitting}
              className="app-btn app-btn--md app-btn--danger gap-2"
            >
              {actionSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserX className="h-4 w-4" aria-hidden="true" />}
              Arrêter le suivi
            </button>
          }
        >
          <dl className="app-panel-muted m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-3.5 py-3 text-[13px]">
            <dt className="text-gray-500">Joueur</dt>
            <dd className="m-0 font-mono font-bold text-gray-900">{memberToRemove.name}</dd>
            <dt className="text-gray-500">Rôle</dt>
            <dd className="m-0 font-semibold text-gray-900">{memberToRemove.role}</dd>
            <dt className="text-gray-500">Plateforme</dt>
            <dd className="m-0 font-semibold uppercase text-gray-900">{memberToRemove.platformShard || 'steam'}</dd>
          </dl>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            <ConsequenceItem tone="pos" title="Parties passées et télémétrie conservées">
              Les parties, éliminations et statistiques restent enregistrées : l’historique du clan n’est pas effacé.
            </ConsequenceItem>
            <ConsequenceItem tone="warn" title="Effectif et classements recalculés">
              Le joueur sort de l’effectif actif et des classements ; les totaux du clan sont recalculés sans lui.
            </ConsequenceItem>
            <ConsequenceItem tone="neg" title="Collecte PUBG arrêtée">
              Ses prochaines parties ne sont plus importées pour ce clan, et ses accès au clan sont révoqués.
            </ConsequenceItem>
          </ul>
          <Callout tone="warn" icon={AlertTriangle} title="Irréversible sans nouvelle demande">
            Pour réintégrer ce joueur, une nouvelle invitation ou demande d’adhésion sera nécessaire.
          </Callout>
        </PanelModal>
      ) : null}

      {memberToDemote
        ? (() => {
            const systemClan = availableClans.find(
              (c) => c.isSystem && (!memberToDemote.platformShard || c.platformShard === memberToDemote.platformShard)
            )
            return (
              <PanelModal
                id="demote-member-title"
                icon={LogOut}
                tone="warn"
                title={`Sortir ${memberToDemote.name} du clan ?`}
                subtitle="Le joueur reste suivi : il rejoint le clan technique"
                busy={actionSubmitting}
                onClose={() => setMemberToDemote(null)}
                footer={
                  <button
                    type="button"
                    onClick={() => void handleConfirmDemoteMember()}
                    disabled={actionSubmitting || !systemClan}
                    className="app-btn app-btn--md app-btn--primary gap-2"
                  >
                    {actionSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
                    Sortir du clan
                  </button>
                }
              >
                <p className="t-body m-0 text-gray-700">
                  {memberToDemote.name} quitte l’effectif de ce clan et rejoint{' '}
                  <span className="font-bold text-gray-900">
                    [{systemClan?.tag ?? 'UNG'}] {systemClan?.name ?? 'Ungrouped'}
                  </span>
                  , le clan technique des joueurs sans clan que le site continue de suivre.
                </p>
                <div className="app-panel-muted flex flex-col gap-2 px-3.5 py-3">
                  <span className="t-label">Les trois façons de faire sortir un joueur</span>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    <ConsequenceItem tone="warn" title="Sortir du clan (ici)">
                      La synchronisation PUBG continue, le joueur reste visible, la bascule est tracée. Réversible.
                    </ConsequenceItem>
                    <ConsequenceItem tone="sky" title="Changer de clan">
                      Réservé au SuperUser : déplace le joueur vers un autre clan suivi.
                    </ConsequenceItem>
                    <ConsequenceItem tone="neg" title="Arrêter le suivi">
                      Réservé au SuperUser : la synchronisation PUBG s’arrête, le joueur disparaît du site.
                    </ConsequenceItem>
                  </ul>
                </div>
                <Callout tone="warn" icon={AlertTriangle} title="Effet sur les statistiques">
                  Ses parties passées restent en base mais ne comptent plus dans les totaux, classements et récompenses de ce
                  clan, comme pour tout départ.
                </Callout>
              </PanelModal>
            )
          })()
        : null}

      {memberToTransfer
        ? (() => {
            const compatibleClans = availableClans.filter(
              (c) => c.id !== clanId && (!memberToTransfer.platformShard || c.platformShard === memberToTransfer.platformShard)
            )
            const closeTransfer = () => {
              setMemberToTransfer(null)
              setSelectedTargetClanId(null)
            }
            return (
              <PanelModal
                id="transfer-member-title"
                icon={ArrowRightLeft}
                tone="sky"
                title={`Transférer ${memberToTransfer.name}`}
                subtitle={`Vers un autre clan suivi (${memberToTransfer.platformShard || 'steam'})`}
                busy={actionSubmitting}
                onClose={closeTransfer}
                footer={
                  <button
                    type="button"
                    onClick={() => void handleConfirmTransferMember()}
                    disabled={actionSubmitting || !selectedTargetClanId || compatibleClans.length === 0}
                    className="app-btn app-btn--md app-btn--primary gap-2"
                  >
                    {actionSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                    )}
                    Transférer
                  </button>
                }
              >
                <div className="flex flex-col gap-1">
                  <span className="t-label">Clan de destination</span>
                  {compatibleClans.length > 0 ? (
                    <ChoiceMenu
                      label="Clan de destination"
                      value={String(selectedTargetClanId ?? compatibleClans[0].id)}
                      onChange={(value) => setSelectedTargetClanId(Number(value))}
                      options={compatibleClans.map((c) => ({ value: String(c.id), label: `[${c.tag}] ${c.name}` }))}
                    />
                  ) : (
                    <Callout tone="warn" icon={AlertTriangle} title="Aucun clan compatible">
                      Aucun autre clan suivi sur la plateforme {memberToTransfer.platformShard || 'steam'}.
                    </Callout>
                  )}
                </div>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  <ConsequenceItem tone="sky" title="Rôle Membre dans le nouveau clan">
                    Le joueur reçoit le rôle par défaut ; ses permissions actuelles sont révoquées.
                  </ConsequenceItem>
                  <ConsequenceItem tone="pos" title="Historique conservé">
                    Les parties passées restent rattachées à ce clan ; les prochaines vont au nouveau clan.
                  </ConsequenceItem>
                  <ConsequenceItem tone="warn" title="Deux clans recalculés">
                    Les totaux et effectifs de l’ancien et du nouveau clan sont recalculés après le transfert.
                  </ConsequenceItem>
                </ul>
              </PanelModal>
            )
          })()
        : null}

      {isPubgDiffModalOpen ? (
        <PanelModal
          id="pubg-diff-modal-title"
          icon={ArrowRightLeft}
          tone="warn"
          title="Comparaison avec le clan PUBG"
          subtitle="Membres du clan officiel PUBG et joueurs suivis par le site"
          busy={false}
          wide
          onClose={() => setIsPubgDiffModalOpen(false)}
        >
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <ClanSyncPanel clanId={clanId} pubgClanId={overviewData?.clan?.pubgClanId} isModal={true} />
          </div>
        </PanelModal>
      ) : null}
    </div>
  )
}

/** Conséquence d'une action, pastille colorée puis titre et texte (modales de gestion d'un membre). */
function ConsequenceItem({ tone, title, children }: { tone: Exclude<Tone, 'neutral'>; title: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--game-${tone})` }} aria-hidden="true" />
      <span className="flex flex-col">
        <span className="t-body font-semibold text-gray-900">{title}</span>
        <span className="t-meta">{children}</span>
      </span>
    </li>
  )
}

/**
 * Modale de la charte pour les actions sur un membre : voile `app-modal-backdrop`, carte `app-panel`, tuile d'icône,
 * corps, puis Annuler et l'action à droite. Échap ferme (sauf pendant l'action).
 */
function PanelModal({
  id,
  icon,
  tone,
  title,
  subtitle,
  busy,
  wide = false,
  onClose,
  footer,
  children,
}: {
  id: string
  icon: LucideIcon
  tone: Exclude<Tone, 'neutral'>
  title: string
  subtitle: string
  busy: boolean
  wide?: boolean
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
    >
      <div className={`app-panel flex max-h-[90vh] w-full flex-col gap-4 overflow-y-auto p-5 sm:p-6 ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-start gap-3">
          <IconTile icon={icon} tone={tone} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id={id} className="t-section-title m-0">
              {title}
            </h2>
            <p className="t-meta m-0">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="app-btn app-btn--md app-btn--secondary">
            {footer ? 'Annuler' : 'Fermer'}
          </button>
          {footer}
        </div>
      </div>
    </div>
  )
}
