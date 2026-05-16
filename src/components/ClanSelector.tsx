'use client'

import { useMemo, useState } from 'react'

export interface Clan {
  id: number
  name: string
  tag: string
  platformShard: string
  membersCount: number
  matchesCount: number
}

interface ClanSelectorProps {
  onSelect(clanId: number): void
  clans: Clan[]
  loading: boolean
  error?: string
}

export default function ClanSelector({ onSelect, clans, loading, error }: ClanSelectorProps) {
  const [query, setQuery] = useState('')

  const filteredClans = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return clans
    }

    return clans.filter((clan) => {
      const searchable = `${clan.name} ${clan.tag}`.toLowerCase()
      return searchable.includes(normalizedQuery)
    })
  }, [clans, query])

  if (loading) {
    return <p className="text-sm text-gray-600">Chargement des clans...</p>
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  return (
    <div className="space-y-4">
      <label htmlFor="clan-search" className="sr-only">
        Rechercher un clan
      </label>
      <input
        id="clan-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher par nom ou tag..."
        aria-label="Rechercher un clan par nom ou tag"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
      />

      {filteredClans.length === 0 ? (
        <p className="text-sm text-gray-600">Aucun clan trouvé.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Liste des clans disponibles">
          {filteredClans.map((clan) => (
            <li key={clan.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="space-y-2">
                <p className="text-lg font-semibold text-gray-900">
                  {clan.name} <span className="text-gray-500">[{clan.tag}]</span>
                </p>
                <p className="text-sm text-gray-600">Membres: {clan.membersCount}</p>
                <p className="text-sm text-gray-600">Matchs: {clan.matchesCount}</p>
                <p className="text-sm text-gray-600">Plateforme: {clan.platformShard}</p>
                <button
                  type="button"
                  onClick={() => onSelect(clan.id)}
                  className="mt-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Consulter
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
