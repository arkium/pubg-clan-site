'use client'

/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search, User, UserX, Users, X } from 'lucide-react'

export interface RosterMemberItem {
  id: number
  displayName: string
  pubgPlayerName: string
  role?: string
  avatarUrl?: string | null
}

export interface PlayerSwitchModalProps {
  isOpen: boolean
  onClose: () => void
  clanId: number | null
  clanName?: string
  currentMemberId: number | null
  onSelectMember: (memberId: number | null) => void
}

export function PlayerSwitchModal({
  isOpen,
  onClose,
  clanId,
  clanName,
  currentMemberId,
  onSelectMember,
}: PlayerSwitchModalProps) {
  const [members, setMembers] = useState<RosterMemberItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Chargement des membres du clan actuel
  useEffect(() => {
    if (!isOpen || !clanId) {
      setMembers([])
      return
    }

    let cancelled = false
    async function loadMembers() {
      setLoading(true)
      setError(null)
      try {
        // Tentative via la route overview qui fournit le roster public
        const response = await fetch(`/api/clans/${clanId}/overview`, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Impossible de charger les membres du clan')
        }
        const data = await response.json()
        const roster = (data?.roster ?? data?.members ?? []) as RosterMemberItem[]

        if (!cancelled) {
          setMembers(roster)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur inconnue')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadMembers()

    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 50)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, clanId])

  // Fermeture sur Escape
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Filtrage par nom ou pseudo
  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return members

    return members.filter((m) => {
      const matchName = m.displayName.toLowerCase().includes(q)
      const matchPubg = m.pubgPlayerName?.toLowerCase().includes(q)
      return matchName || matchPubg
    })
  }, [members, searchQuery])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-switch-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-500">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 id="player-switch-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                Sélectionner un joueur
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {clanName ? `Membres du clan ${clanName}` : 'Membres du clan actif'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Fermer la fenêtre"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barre de recherche */}
        <div className="border-b border-slate-200/80 px-6 py-3.5 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par pseudo ou nom de joueur..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 py-2 pl-10 pr-10 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800/80 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Effacer la recherche"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Liste des joueurs */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 space-y-2">
          {/* Option: Aucun joueur / Vue globale */}
          <button
            type="button"
            onClick={() => {
              onSelectMember(null)
              onClose()
            }}
            className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all ${
              currentMemberId === null
                ? 'border-blue-500/40 bg-blue-50/70 dark:border-blue-500/30 dark:bg-blue-950/30'
                : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                <UserX className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  Aucun joueur sélectionné
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Vue globale du clan (pas de joueur ciblé)
                </p>
              </div>
            </div>
            {currentMemberId === null ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-400">
                <Check className="h-3 w-3" />
                Actif
              </span>
            ) : null}
          </button>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent text-blue-500" />
              <p className="mt-3">Chargement des membres...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
              {error}
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              Aucun joueur trouvé pour &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            <ul className="space-y-2 pt-1" role="listbox">
              {filteredMembers.map((m) => {
                const isCurrent = m.id === currentMemberId
                const initial = (m.displayName || m.pubgPlayerName || '?').charAt(0).toUpperCase()

                return (
                  <li key={m.id} role="option" aria-selected={isCurrent}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectMember(m.id)
                        onClose()
                      }}
                      className={`group flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all ${
                        isCurrent
                          ? 'border-blue-500/40 bg-blue-50/70 dark:border-blue-500/30 dark:bg-blue-950/30'
                          : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {m.avatarUrl ? (
                          <img
                            src={m.avatarUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-xl object-cover bg-slate-800"
                            onError={(e) => {
                              ;(e.currentTarget as HTMLElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10 text-sm font-bold text-blue-500">
                            {initial}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
                              {m.displayName}
                            </span>
                            {m.pubgPlayerName && m.pubgPlayerName !== m.displayName ? (
                              <span className="truncate text-xs text-slate-400">
                                ({m.pubgPlayerName})
                              </span>
                            ) : null}
                          </div>
                          {m.role ? (
                            <div className="mt-0.5">
                              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                Rôle : {m.role}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-400">
                            <Check className="h-3 w-3" />
                            Actif
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-blue-400">
                            Choisir →
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200/80 px-6 py-4 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {filteredMembers.length} joueur{filteredMembers.length > 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="app-btn app-btn--md app-btn--secondary"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
