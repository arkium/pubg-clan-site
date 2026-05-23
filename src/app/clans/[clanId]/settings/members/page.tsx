'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

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
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
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

  useEffect(() => {
    if (!clanId) {
      return
    }
    const currentClanId = clanId

    let cancelled = false

    async function loadMembersSettings() {
      try {
        setError('')
        const data = await fetchMembersAndRoles(currentClanId)
        if (!cancelled) {
          setMembers(data.members)
          setRoles(data.roles)
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
        }
      }
    }

    void loadMembersSettings()

    return () => {
      cancelled = true
    }
  }, [clanId, router])

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

  async function handleInvite(member: ClanMemberWithRole) {
    if (!clanId) {
      return
    }

    const email = window.prompt(`Adresse email pour inviter ${member.name} ?`, member.pendingInvite?.email ?? '')

    if (!email) {
      return
    }

    try {
      setInvitingMemberId(member.id)
      const response = await fetch(`/api/clans/${clanId}/members/${member.id}/invite`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        if (response.status === 401) {
          router.replace(`/login?redirect=${encodeURIComponent(`/clans/${clanId}/settings/members`)}`)
          return
        }

        throw new Error(payload.error ?? 'Failed to send invite')
      }

      const data = await fetchMembersAndRoles(clanId)
      setMembers(data.members)
      setRoles(data.roles)
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Failed to send invite')
    } finally {
      setInvitingMemberId(null)
    }
  }

  if (!clanId) {
    return null
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
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
                  const currentRole = member.roles[0]
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
                        <span className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
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

                          {!member.hasAccount ? (
                            <button
                              type="button"
                              onClick={() => void handleInvite(member)}
                              disabled={invitingMemberId === member.id}
                              className="rounded border border-amber-200 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {invitingMemberId === member.id ? 'Envoi...' : 'Inviter'}
                            </button>
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
