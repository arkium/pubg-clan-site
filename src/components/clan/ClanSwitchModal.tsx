'use client'

/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search, Shield, Users, X } from 'lucide-react'

export interface ClanItem {
  id: number
  name: string
  tag: string
  platformShard?: string
  membersCount?: number
  _count?: {
    members?: number
  }
  clanConfigs?: Array<{
    value?: string | null
  }>
}

export interface ClanSwitchModalProps {
  isOpen: boolean
  onClose: () => void
  currentClanId: number | null
  onSelectClan: (clanId: number) => void
}

export function ClanSwitchModal({
  isOpen,
  onClose,
  currentClanId,
  onSelectClan,
}: ClanSwitchModalProps) {
  const [clans, setClans] = useState<ClanItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Chargement des clans lors de l'ouverture de la modale
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    async function loadClans() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/clans', { cache: 'no-store' })
        if (!response.ok) {
          throw new Error('Impossible de charger la liste des clans')
        }
        const data = await response.json()
        if (!cancelled) {
          setClans(Array.isArray(data) ? data : [])
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

    void loadClans()

    // Focus sur la recherche à l'ouverture
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 50)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen])

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

  // Filtrage par recherche
  const filteredClans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return clans

    return clans.filter((clan) => {
      const matchName = clan.name.toLowerCase().includes(q)
      const matchTag = clan.tag.toLowerCase().includes(q)
      return matchName || matchTag
    })
  }, [clans, searchQuery])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clan-switch-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-blue-500/20 bg-blue-500/10 text-blue-500">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 id="clan-switch-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                Changer de clan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sélectionnez le clan à afficher et explorer
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
              placeholder="Rechercher par nom ou tag de clan..."
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

        {/* Liste des clans scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent text-blue-500" />
              <p className="mt-3">Chargement des clans...</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-center text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-400">
              {error}
            </div>
          ) : filteredClans.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400">
              Aucun clan ne correspond à votre recherche &ldquo;{searchQuery}&rdquo;.
            </div>
          ) : (
            <ul className="space-y-2" role="listbox">
              {filteredClans.map((c) => {
                const isCurrent = c.id === currentClanId
                const memberCount = c.membersCount ?? c._count?.members ?? 0
                const imageUrl = c.clanConfigs?.[0]?.value?.trim() || '/pubg.png'

                return (
                  <li key={c.id} role="option" aria-selected={isCurrent}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectClan(c.id)
                        onClose()
                      }}
                      className={`group flex w-full items-center justify-between gap-3 rounded-2xl border p-3 text-left transition-all ${
                        isCurrent
                          ? 'border-blue-500/40 bg-blue-50/70 dark:border-blue-500/30 dark:bg-blue-950/30'
                          : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <img
                          src={imageUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-xl object-cover bg-slate-900"
                          onError={(e) => {
                            ;(e.currentTarget as HTMLImageElement).src = '/pubg.png'
                          }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-bold text-slate-900 dark:text-white">
                              {c.name}
                            </span>
                            <span className="inline-flex rounded-lg border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              [{c.tag}]
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {memberCount} membre{memberCount > 1 ? 's' : ''}
                            </span>
                            {c.platformShard ? (
                              <span className="capitalize">{c.platformShard}</span>
                            ) : null}
                          </div>
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
            {filteredClans.length} clan{filteredClans.length > 1 ? 's' : ''} disponible{filteredClans.length > 1 ? 's' : ''}
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
