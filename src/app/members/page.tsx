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
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [pubgPlayerName, setPubgPlayerName] = useState('')
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
          platformShard: 'steam',
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to add member')
      }

      setSuccess('Member added successfully!')
      setDisplayName('')
      setPubgPlayerName('')
      await fetchMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
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

        {/* Liste des membres */}
        <div className="bg-white rounded shadow p-6">
          <h2 className="text-xl font-semibold mb-4">
            Members ({members.length})
          </h2>
          {members.length === 0 ? (
            <p className="text-gray-500">No members yet</p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="border rounded p-4 flex justify-between items-center"
                >
                  <div>
                    <p className="font-semibold">{member.displayName}</p>
                    <p className="text-sm text-gray-600">
                      {member.pubgPlayerName}
                    </p>
                    <p className="text-xs text-gray-500">
                      ID: {member.pubgAccountId}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-gray-500">
                      {member.platformShard}
                    </div>
                    <Link
                      href={`/members/${member.id}/matches`}
                      className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      View matches
                    </Link>
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
