'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

type ClanSummary = {
  id: number
  name: string
  tag: string
}

export default function ClanNavigation() {
  const { clanId, clearClanId, setClanId } = useSelectedClan()
  const { loading, authenticated, email, activeMemberId, members, refresh } = useAuthSession()
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

  async function handleLogout() {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
    })

    if (!response.ok) {
      return
    }

    await refresh()
  }

  async function handleSwitchMember(memberId: number) {
    const response = await fetch('/api/auth/switch-member', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ memberId }),
    })

    if (!response.ok) {
      return
    }

    const selected = members.find((entry) => entry.memberId === memberId)
    if (selected?.clanId) {
      setClanId(selected.clanId)
    }

    await refresh()
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <div className="space-y-1 text-sm text-gray-700" aria-live="polite">
          {clanId && clan ? (
            <span>
              Clan sélectionné: <strong>{clan.name}</strong> [{clan.tag}]
            </span>
          ) : (
            <span>Aucun clan sélectionné</span>
          )}

          {loading ? (
            <p className="text-xs text-gray-500">Vérification de session...</p>
          ) : authenticated ? (
            <p className="text-xs text-emerald-700">Connecté: {email}</p>
          ) : (
            <p className="text-xs text-amber-700">Session non connectée</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {authenticated ? (
            <select
              value={activeMemberId ?? ''}
              onChange={(event) => {
                const memberId = Number(event.target.value)
                if (Number.isInteger(memberId) && memberId > 0) {
                  void handleSwitchMember(memberId)
                }
              }}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
            >
              <option value="" disabled>
                Membre actif
              </option>
              {members.map((member) => (
                <option key={member.memberId} value={member.memberId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          ) : null}

          <Link
            href="/members"
            className="rounded border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            Ajouter / voir joueurs
          </Link>
          {clanId ? (
            <Link
              href={`/clans/${clanId}/members`}
              className="rounded border border-sky-200 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50"
            >
              Joueurs du clan
            </Link>
          ) : null}
          {clanId ? (
            <Link
              href={`/clans/${clanId}/matches`}
              className="rounded border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
            >
              Matchs ensemble
            </Link>
          ) : null}
          {clanId ? (
            <Link
              href={`/clans/${clanId}/leaderboard`}
              className="rounded border border-purple-200 px-3 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-50"
            >
              Classement
            </Link>
          ) : null}
          {clanId ? (
            <Link
              href={`/clans/${clanId}/reports`}
              className="rounded border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              Rapports
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

          {authenticated ? (
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Se déconnecter
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Connexion
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
