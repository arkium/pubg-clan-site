'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { useSelectedClan } from '@/hooks/useSelectedClan'

type ClanSummary = {
  id: number
  name: string
  tag: string
}

export default function ClanNavigation() {
  const { clanId, clearClanId } = useSelectedClan()
  const [clan, setClan] = useState<ClanSummary | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadClan() {
      if (!clanId) {
        setClan(null)
        return
      }

      try {
        const response = await fetch('/api/clans')
        const data = (await response.json()) as ClanSummary[]

        if (!response.ok) {
          throw new Error('Failed to load clans')
        }

        if (!cancelled) {
          setClan(data.find((item) => item.id === clanId) ?? null)
        }
      } catch {
        if (!cancelled) {
          setClan(null)
        }
      }
    }

    void loadClan()

    return () => {
      cancelled = true
    }
  }, [clanId])

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="text-sm text-gray-700" aria-live="polite">
          {clanId && clan ? (
            <span>
              Clan sélectionné: <strong>{clan.name}</strong> [{clan.tag}]
            </span>
          ) : (
            <span>Aucun clan sélectionné</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {clanId ? (
            <Link
              href={`/clans/${clanId}/matches`}
              className="rounded border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              Matchs ensemble
            </Link>
          ) : null}
          <Link
            href="/clans"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Changer de clan
          </Link>
          {clanId ? (
            <button
              type="button"
              onClick={clearClanId}
              className="rounded border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Effacer
            </button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
