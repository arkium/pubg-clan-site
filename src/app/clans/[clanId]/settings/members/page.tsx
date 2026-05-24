'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import RoleAssignment from '@/components/RoleAssignment'
import { useSelectedClan } from '@/hooks/useSelectedClan'

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

type EmailDeliveryMeta = {
  delivered: boolean
  mode: 'smtp' | 'stub'
  to: string
  subject: string
  from: string | null
  messageId?: string
  accepted?: string[]
  rejected?: string[]
  reason?: string
}

type InviteCreationResponse = {
  success?: boolean
  inviteId?: string
  expiresAt?: string
  activationUrl?: string
  delivery?: EmailDeliveryMeta
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
      return 'bg-rose-100 text-rose-700'
    case 'admin':
      return 'bg-sky-100 text-sky-700'
    case 'moderator':
      return 'bg-amber-100 text-amber-700'
    case 'member':
      return 'bg-emerald-100 text-emerald-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

export default function ClanMembersSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [members, setMembers] = useState<ClanMemberWithRole[]>([])
  const [roles, setRoles] = useState<ClanRole[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [invitingMemberId, setInvitingMemberId] = useState<number | null>(null)
  const [inviteDraftMemberId, setInviteDraftMemberId] = useState<number | null>(null)
  const [inviteEmailDraft, setInviteEmailDraft] = useState('')
  const [isEmailDeliveryReady, setIsEmailDeliveryReady] = useState(false)
  const [emailStatusLoaded, setEmailStatusLoaded] = useState(false)
  const [copiedInviteMemberId, setCopiedInviteMemberId] = useState<number | null>(null)
  const [inviteResultByMemberId, setInviteResultByMemberId] = useState<
    Record<
      number,
      {
        activationUrl: string
        expiresAt: string | null
        delivery: EmailDeliveryMeta | null
      }
    >
  >({})
  const [copiedDiscordMemberId, setCopiedDiscordMemberId] = useState<number | null>(null)
  const [copyToast, setCopyToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)
  const copyToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  function getInviteStorageKey(currentClanId: number) {
    return `clan_member_invite_links_${currentClanId}`
  }

  function readStoredInviteResults(currentClanId: number) {
    try {
      const raw = window.localStorage.getItem(getInviteStorageKey(currentClanId))
      if (!raw) {
        return {}
      }

      const parsed = JSON.parse(raw) as Record<
        string,
        {
          activationUrl?: string
          expiresAt?: string | null
          delivery?: EmailDeliveryMeta | null
        }
      >

      const normalized: Record<
        number,
        {
          activationUrl: string
          expiresAt: string | null
          delivery: EmailDeliveryMeta | null
        }
      > = {}

      for (const [memberId, value] of Object.entries(parsed)) {
        if (!value?.activationUrl) {
          continue
        }

        const parsedMemberId = Number(memberId)
        if (!Number.isInteger(parsedMemberId) || parsedMemberId <= 0) {
          continue
        }

        normalized[parsedMemberId] = {
          activationUrl: value.activationUrl,
          expiresAt: value.expiresAt ?? null,
          delivery: value.delivery ?? null,
        }
      }

      return normalized
    } catch {
      return {}
    }
  }

  function persistInviteResults(currentClanId: number, value: Record<number, {
    activationUrl: string
    expiresAt: string | null
    delivery: EmailDeliveryMeta | null
  }>) {
    try {
      window.localStorage.setItem(getInviteStorageKey(currentClanId), JSON.stringify(value))
    } catch {
      // Ignore storage errors silently.
    }
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
    if (!clanId) {
      return
    }

    const stored = readStoredInviteResults(clanId)
    setInviteResultByMemberId(stored)
  }, [clanId])

  useEffect(() => {
    if (!clanId) {
      return
    }

    persistInviteResults(clanId, inviteResultByMemberId)
  }, [clanId, inviteResultByMemberId])

  useEffect(() => {
    return () => {
      if (copyToastTimeoutRef.current !== null) {
        clearTimeout(copyToastTimeoutRef.current)
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

  async function handleInvite(member: ClanMemberWithRole, email: string) {
    if (!clanId) {
      return
    }

    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setError('Veuillez renseigner une adresse email valide.')
      return
    }

    try {
      setError('')
      setInvitingMemberId(member.id)
      const response = await fetch(`/api/clans/${clanId}/members/${member.id}/invite`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: normalizedEmail }),
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
      setInviteResultByMemberId((current) => ({
        ...current,
        [member.id]: {
          activationUrl: payload.activationUrl as string,
          expiresAt: payload.expiresAt ?? null,
          delivery: payload.delivery ?? null,
        },
      }))
      setInviteDraftMemberId(null)
      setInviteEmailDraft('')

      return {
        activationUrl: payload.activationUrl,
        expiresAt: payload.expiresAt ?? null,
      }
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Failed to send invite')
      return null
    } finally {
      setInvitingMemberId(null)
    }
  }

  async function handleRegenerateAndCopyDiscord(member: ClanMemberWithRole) {
    const fallbackEmail = member.pendingInvite?.email?.trim() ?? ''
    if (!fallbackEmail) {
      showCopyToast('Aucun email d\'invitation disponible pour ce membre.', 'error')
      return
    }

    const result = await handleInvite(member, fallbackEmail)
    if (!result) {
      showCopyToast('Impossible de regenerer le lien pour la copie Discord.', 'error')
      return
    }

    await handleCopyDiscordMessage(member, result.activationUrl, result.expiresAt)
  }

  async function handleInviteAndCopyDiscord(member: ClanMemberWithRole, email: string) {
    const result = await handleInvite(member, email)
    if (!result) {
      return
    }

    await handleCopyDiscordMessage(member, result.activationUrl, result.expiresAt)
  }

  async function handleCopyActivationUrl(memberId: number, activationUrl: string) {
    try {
      await navigator.clipboard.writeText(activationUrl)
      setCopiedInviteMemberId(memberId)
      showCopyToast('Lien d\'activation copie dans le presse-papiers.', 'success')
      window.setTimeout(() => {
        setCopiedInviteMemberId((current) => (current === memberId ? null : current))
      }, 1800)
    } catch {
      showCopyToast('Impossible de copier le lien automatiquement.', 'error')
    }
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
      showCopyToast('Message Discord copie dans le presse-papiers.', 'success')
      window.setTimeout(() => {
        setCopiedDiscordMemberId((current) => (current === member.id ? null : current))
      }, 1800)
    } catch {
      showCopyToast('Impossible de copier le message Discord automatiquement.', 'error')
    }
  }

  if (!clanId) {
    return null
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des membres & rôles</h1>
          <p className="text-sm text-gray-600">Clan #{clanId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/members/manage"
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Membres
          </Link>
          <Link
            href="/clans"
            className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Changer de clan
          </Link>
        </div>
      </div>

      {loading ? <p className="text-sm text-gray-600">Chargement...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!loading && emailStatusLoaded && !isEmailDeliveryReady ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Invitations email desactivees. Effectuez d'abord un test reussi dans{' '}
          <Link href="/settings/email-delivery" className="font-semibold underline">
            Configuration email
          </Link>
          .
        </div>
      ) : null}

      {!loading && !error ? (
        <section className="overflow-hidden rounded border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Avatar</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Nom</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Rôle</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Accès</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((member) => {
                  const currentRole =
                    member.roles.find((role) => role.name === member.role) ?? member.roles[0]
                  const currentRoleOption = roles.find((role) => role.id === currentRole?.roleId)
                  const latestInvite = inviteResultByMemberId[member.id]

                  return (
                    <tr key={member.id}>
                      <td className="px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 overflow-hidden border">
                          {member.avatarUrl ? (
                            <img
                              src={member.avatarUrl}
                              alt={member.name + ' avatar'}
                              className="w-9 h-9 object-cover rounded-full"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : (
                            <span className="text-xs font-semibold text-gray-700">{member.name.slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold text-gray-900">{member.name}</p>
                          <p className="text-xs text-gray-500">
                            Rejoint le {new Date(member.joinedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-1 text-xs font-medium ${getRoleBadgeClass(member.role)}`}
                        >
                          {member.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {member.hasAccount ? (
                          <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                            Actif
                          </span>
                        ) : member.pendingInvite ? (
                          <div className="space-y-1 text-xs text-amber-700">
                            <p>Invitation: {member.pendingInvite.email}</p>
                            <p>
                              Expire le{' '}
                              {new Date(member.pendingInvite.expiresAt).toLocaleDateString()}
                            </p>
                          </div>
                        ) : (
                          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                            Aucun accès
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {currentRoleOption ? (
                            <RoleAssignment
                              member={{ id: member.id, name: member.name }}
                              currentRole={currentRoleOption}
                              availableRoles={roles}
                              onAssign={(roleId) => handleAssign(member.id, roleId)}
                            />
                          ) : (
                            <span className="text-xs text-gray-500">Aucun rôle</span>
                          )}

                          {!member.hasAccount && isEmailDeliveryReady ? (
                            inviteDraftMemberId === member.id ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="email"
                                  value={inviteEmailDraft}
                                  onChange={(event) => setInviteEmailDraft(event.target.value)}
                                  placeholder="email@exemple.com"
                                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                                  disabled={invitingMemberId === member.id}
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleInvite(member, inviteEmailDraft)}
                                  disabled={invitingMemberId === member.id}
                                  className="rounded border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {invitingMemberId === member.id ? 'Envoi...' : 'Envoyer'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleInviteAndCopyDiscord(member, inviteEmailDraft)}
                                  disabled={invitingMemberId === member.id}
                                  className="rounded border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {invitingMemberId === member.id ? 'Envoi...' : 'Envoyer + Discord'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInviteDraftMemberId(null)
                                    setInviteEmailDraft('')
                                  }}
                                  disabled={invitingMemberId === member.id}
                                  className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInviteDraftMemberId(member.id)
                                    setInviteEmailDraft(member.pendingInvite?.email ?? '')
                                  }}
                                  disabled={invitingMemberId === member.id}
                                  className="rounded border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Inviter
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (member.pendingInvite?.email) {
                                      void handleRegenerateAndCopyDiscord(member)
                                      return
                                    }

                                    setInviteDraftMemberId(member.id)
                                    setInviteEmailDraft('')
                                    showCopyToast('Renseigne un email puis clique "Envoyer + Discord".', 'success')
                                  }}
                                  disabled={invitingMemberId === member.id}
                                  className="rounded border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Discord
                                </button>
                              </>
                            )
                          ) : null}

                          {latestInvite ? (
                            <div className="w-full rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                              <p>
                                Invitation creee
                                {latestInvite.expiresAt
                                  ? ` (expire le ${new Date(latestInvite.expiresAt).toLocaleDateString()})`
                                  : ''}
                                .
                              </p>
                              <p>
                                Envoi:{' '}
                                {latestInvite.delivery?.mode === 'smtp'
                                  ? latestInvite.delivery.delivered
                                    ? 'SMTP confirme'
                                    : 'SMTP en echec'
                                  : 'Simulation locale'}
                                {latestInvite.delivery?.messageId
                                  ? ` - messageId: ${latestInvite.delivery.messageId}`
                                  : ''}
                              </p>
                              {latestInvite.delivery?.reason ? (
                                <p className="text-rose-700">Detail: {latestInvite.delivery.reason}</p>
                              ) : null}
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleCopyActivationUrl(member.id, latestInvite.activationUrl)}
                                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                >
                                  {copiedInviteMemberId === member.id ? 'Lien copie' : 'Copier lien activation'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopyDiscordMessage(
                                      member,
                                      latestInvite.activationUrl,
                                      latestInvite.expiresAt
                                    )
                                  }
                                  className="rounded border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                                >
                                  {copiedDiscordMemberId === member.id
                                    ? 'Message Discord copie'
                                    : 'Copier message Discord'}
                                </button>
                                <a
                                  href={latestInvite.activationUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded border border-sky-200 bg-white px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
                                >
                                  Ouvrir lien
                                </a>
                              </div>
                            </div>
                          ) : null}

                          {member.pendingInvite && !latestInvite ? (
                            <div className="w-full rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                              <p>
                                Lien non disponible dans cette session. Vous pouvez le regenerer et le copier pour
                                Discord en un clic.
                              </p>
                              <button
                                type="button"
                                onClick={() => void handleRegenerateAndCopyDiscord(member)}
                                disabled={invitingMemberId === member.id}
                                className="mt-2 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {invitingMemberId === member.id
                                  ? 'Regeneration...'
                                  : 'Regenerer lien + copier Discord'}
                              </button>
                            </div>
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
                                      {new Date(invite.createdAt).toLocaleDateString()} - {invite.email} - {status}
                                    </p>
                                  )
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  )
}
