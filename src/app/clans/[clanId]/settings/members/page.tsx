'use client'

/* eslint-disable @next/next/no-img-element */

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

function isTechnicalInviteEmail(email: string) {
  return email.trim().toLowerCase().endsWith('@local.invalid')
}

function getDisplayInviteEmail(email: string) {
  return isTechnicalInviteEmail(email) ? '' : email
}

export default function ClanMembersSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

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
      setError('Veuillez renseigner une adresse email valide.')
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
      setError(inviteError instanceof Error ? inviteError.message : 'Failed to send invite')
      return null
    } finally {
      setMemberActionLoading((current) => (current?.memberId === member.id ? null : current))
    }
  }

  async function handleRegenerateAndCopyDiscord(member: ClanMemberWithRole) {
    const fallbackEmail = member.pendingInvite?.email?.trim() ?? member.recentInvites[0]?.email?.trim() ?? ''
    const result = await handleInvite(member, fallbackEmail, { sendEmail: false, mode: 'discord' })
    if (!result) {
      showCopyToast('Impossible de regenerer le lien pour la copie Discord.', 'error')
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

      showCopyToast('Invitation active invalidee. Le membre revient a "Aucun acces".', 'success')
      showMemberInlineToast(member.id, 'Invitation reinitialisee et token invalide.', 'success')
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : 'Impossible de reinitialiser l invitation'
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
        <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
          Actif
        </span>
      )
    }

    return <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">Aucun accès</span>
  }

  function renderMemberActions(
    member: ClanMemberWithRole,
    currentRoleOption: ClanRole | undefined
  ) {
    const isMemberBusy = memberActionLoading?.memberId === member.id
    const isEmailBusy = isMemberBusy && memberActionLoading?.action === 'email'
    const isDiscordBusy = isMemberBusy && memberActionLoading?.action === 'discord'

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
                disabled={isMemberBusy}
              />
              <button
                type="button"
                onClick={() => void handleInvite(member, inviteEmailDraft)}
                disabled={isMemberBusy}
                title="Envoie une invitation email avec le lien d activation"
                className="rounded border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEmailBusy ? 'Envoi...' : 'Envoyer'}
              </button>
              <button
                type="button"
                onClick={() => void handleInviteAndCopyDiscord(member, inviteEmailDraft)}
                disabled={isMemberBusy}
                title="Genere un nouveau token et copie un message pret pour Discord (sans envoi email)"
                className="rounded border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDiscordBusy ? 'Generation...' : 'Discord'}
              </button>
              <button
                type="button"
                onClick={() => void resetInviteFlow(member)}
                disabled={isMemberBusy}
                className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reinitialiser invitation
              </button>
              <button
                type="button"
                onClick={() => {
                  setInviteDraftMemberId(null)
                  setInviteEmailDraft('')
                }}
                disabled={isMemberBusy}
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
                  openInviteDraft(member, getDisplayInviteEmail(member.pendingInvite?.email ?? ''))
                }}
                disabled={isMemberBusy}
                title="Ouvre le formulaire pour saisir ou modifier l adresse email d invitation"
                className="rounded border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Inviter
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleRegenerateAndCopyDiscord(member)
                }}
                disabled={isMemberBusy}
                title="Genere un nouveau token et copie un message d invitation pret pour Discord"
                className="rounded border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDiscordBusy ? 'Generation...' : 'Discord'}
              </button>
              <button
                type="button"
                onClick={() => void resetInviteFlow(member)}
                disabled={isMemberBusy}
                className="rounded border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reinit invitation
              </button>
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
          Invitations email desactivees. Effectuez d&apos;abord un test reussi dans{' '}
          <Link href="/settings/email-delivery" className="font-semibold underline">
            Configuration email
          </Link>
          .
        </div>
      ) : null}

      {!loading && !error ? (
        <section className="overflow-hidden rounded border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/60 px-4 py-3">
            <p className="text-xs text-gray-600">Vue cartes sur mobile, tableau detaille sur ecran large.</p>
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setNameSortOrder('az')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  nameSortOrder === 'az'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Alpha
              </button>
              <button
                type="button"
                onClick={() => setNameSortOrder('za')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  nameSortOrder === 'za'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Inverse
              </button>
            </div>
          </div>

          <div className="space-y-3 p-3 md:hidden">
            {sortedMembers.map((member) => {
              const currentRole =
                member.roles.find((role) => role.name === member.role) ?? member.roles[0]
              const currentRoleOption = roles.find((role) => role.id === currentRole?.roleId)

              return (
                <article key={member.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border bg-gray-200">
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.name + ' avatar'}
                          className="h-10 w-10 rounded-full object-cover"
                          onError={(e) => {
                            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <span className="text-xs font-semibold text-gray-700">{member.name.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-gray-900">{member.name}</p>
                      <p className="text-xs text-gray-500">Rejoint le {new Date(member.joinedAt).toLocaleDateString()}</p>
                    </div>

                    <span className={`rounded px-2 py-1 text-xs font-medium ${getRoleBadgeClass(member.role)}`}>
                      {member.role}
                    </span>
                  </div>

                  <div className="mt-3">{renderMemberAccess(member)}</div>
                  <div className="mt-3">{renderMemberActions(member, currentRoleOption)}</div>
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[1040px] divide-y divide-gray-200 text-sm">
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
                {sortedMembers.map((member) => {
                  const currentRole =
                    member.roles.find((role) => role.name === member.role) ?? member.roles[0]
                  const currentRoleOption = roles.find((role) => role.id === currentRole?.roleId)

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
                        {renderMemberAccess(member)}
                      </td>
                      <td className="px-4 py-3">
                        {renderMemberActions(member, currentRoleOption)}
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
