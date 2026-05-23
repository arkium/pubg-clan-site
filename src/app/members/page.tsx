'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Member {
  id: number
  displayName: string
  pubgPlayerName: string
  pubgAccountId: string | null
  platformShard: string
  createdAt: string
  avatarUrl?: string | null
  clan: {
    id: number
    name: string
    tag: string
    pubgClanId: string | null
  } | null
}

const PLATFORM_OPTIONS = [
  { value: 'steam', label: 'Steam' },
  { value: 'console', label: 'Console' },
  { value: 'kakao', label: 'Kakao' },
]

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingMemberId, setDeletingMemberId] = useState<number | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [pubgPlayerName, setPubgPlayerName] = useState('')
  const [platformShard, setPlatformShard] = useState('steam')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Charger les membres au démarrage
  useEffect(() => {
    fetchMembers()
  }, [])

  // Récupérer la liste des membres
  async function fetchMembers() {
    try {
      const res = await fetch('/api/members')
      const data = await res.json()
      setMembers(data)
    } catch (err) {
      console.error('Error fetching members:', err)
    }
  }

  // Ajouter un membre
  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName,
          pubgPlayerName,
          platformShard,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add member')
      }

      setSuccess('Member added successfully!')
      setDisplayName('')
      setPubgPlayerName('')
      setPlatformShard('steam')
      await fetchMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteMember(member: Member) {
    const confirmed = window.confirm(
      `Stop tracking ${member.displayName} (${member.pubgPlayerName})?`
    )

    if (!confirmed) {
      return
    }

    setError('')
    setSuccess('')
    setDeletingMemberId(member.id)

    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete member')
      }

      setSuccess('Member removed from tracking successfully!')
      await fetchMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDeletingMemberId(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Clan Members</h1>

        {/* Formulaire d'ajout */}
        <div className="bg-white rounded shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Add Member</h2>
          <form onSubmit={handleAddMember} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g., John"
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                PUBG Player Name
              </label>
              <input
                type="text"
                value={pubgPlayerName}
                onChange={(e) => setPubgPlayerName(e.target.value)}
                placeholder="e.g., ProGamer123"
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Platform
              </label>
              <select
                value={platformShard}
                onChange={(e) => setPlatformShard(e.target.value)}
                className="w-full px-3 py-2 border rounded"
              >
                {PLATFORM_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <div className="text-red-600 text-sm">{error}</div>}
            {success && <div className="text-green-600 text-sm">{success}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Add Member'}
            </button>
          </form>
        </div>

        {/* Liste des membres - version responsive et moderne */}
        <div className="bg-white rounded shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Members ({members.length})
          </h2>
          {members.length === 0 ? (
            <p className="text-gray-500">No members yet</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col h-full border rounded-lg bg-gray-50 p-4 shadow-sm"
                >
                  <div className="flex items-center gap-4 mb-3">
                    {/* Avatar (avatarUrl si dispo, sinon fallback SVG) */}
                    <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden border">
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.displayName + ' avatar'}
                          className="w-14 h-14 object-cover rounded-full"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="20" cy="20" r="20" fill="#CBD5E1" />
                          <text x="50%" y="55%" textAnchor="middle" fill="#64748B" fontSize="18" fontFamily="Arial" dy=".3em">
                            {member.displayName.charAt(0).toUpperCase()}
                          </text>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{member.displayName}</p>
                      <p className="text-sm text-gray-600 truncate">{member.pubgPlayerName}</p>
                      <p className="text-xs text-gray-500 truncate">ID: {member.pubgAccountId}</p>
                      {member.clan ? (
                        <p className="text-xs text-gray-500 truncate">
                          Clan: {member.clan.name} [{member.clan.tag}]
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 truncate">Clan: no PUBG clan detected</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    <span className="inline-block text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 font-medium">
                      {member.platformShard}
                    </span>
                    <Link
                      href={`/members/${member.id}/dashboard`}
                      className="flex-1 min-w-[120px] rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 text-center"
                    >
                      Dashboard
                    </Link>
                    <Link
                      href={`/members/${member.id}/matches`}
                      className="flex-1 min-w-[120px] rounded border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 text-center"
                    >
                      View matches
                    </Link>
                    <Link
                      href={`/members/${member.id}/notifications`}
                      className="flex-1 min-w-[120px] rounded border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 text-center"
                    >
                      Notifications
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDeleteMember(member)}
                      disabled={deletingMemberId === member.id}
                      className="flex-1 min-w-[120px] rounded border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 text-center"
                    >
                      {deletingMemberId === member.id ? 'Removing...' : 'Stop tracking'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
