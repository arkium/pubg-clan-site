'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, UserMinus, UserPlus, Users } from 'lucide-react'

export type DiffResult = {
  pubgClanId: string
  shard: string
  pubgMembersCount: number
  pubgMemberCountFromApi: number | null
  usedFallback: boolean
  incompleteRelationships: boolean
  matched: Array<{ accountId: string; pubgName: string | null; memberId: number; displayName: string }>
  inPubgOnly: Array<{ accountId: string; pubgName: string | null }>
  inSiteOnly: Array<{ memberId: number; displayName: string; pubgAccountId: string }>
  unverified: Array<{ memberId: number; displayName: string }>
}

export default function ClanSyncPanel({
  clanId,
  pubgClanId,
  isModal = false,
}: {
  clanId: number | null
  pubgClanId: string | null | undefined
  isModal?: boolean
}) {
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState('')

  async function loadDiff() {
    if (!clanId || diffLoading) return
    try {
      setDiffLoading(true)
      setDiffError('')
      const response = await fetch(`/api/clans/${clanId}/pubg-diff`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'Erreur lors du chargement du diff')
      setDiff(payload.diff as DiffResult)
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : 'Erreur lors du chargement du diff')
    } finally {
      setDiffLoading(false)
    }
  }

  useEffect(() => {
    if (isModal && pubgClanId && !diff && !diffLoading) {
      void loadDiff()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModal, pubgClanId])

  const content = (
    <div className="space-y-4">
      {!isModal && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Comparaison PUBG vs site</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Rapprochement entre les membres du clan PUBG officiel et ceux trackés sur le site.
            </p>
          </div>
          {!diff && pubgClanId && (
            <button
              onClick={loadDiff}
              disabled={diffLoading}
              className="app-btn app-btn--md app-btn--secondary shrink-0"
            >
              {diffLoading ? 'Chargement…' : 'Comparer'}
            </button>
          )}
        </div>
      )}

      {!pubgClanId && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Le clan n&apos;a pas encore de PUBG Clan ID — effectuez une synchronisation d&apos;abord.
        </p>
      )}

      {diffLoading && (
        <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500 dark:text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-2" />
          <p className="text-xs font-semibold">Interrogation de l&apos;API PUBG en cours...</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Vérification de l&apos;effectif du clan officiel</p>
        </div>
      )}

      {diffError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-200">
          {diffError}
        </div>
      )}

      {diff && !diffLoading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/80 px-2.5 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Users className="h-3.5 w-3.5 text-blue-500" />
                {diff.pubgMemberCountFromApi ?? diff.pubgMembersCount} dans PUBG
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100/80 px-2.5 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                {diff.matched.length} trackés et confirmés
              </span>
              {!diff.incompleteRelationships && diff.inSiteOnly.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50/80 px-2.5 py-1 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
                  <UserMinus className="h-3.5 w-3.5 text-rose-500" />
                  {diff.inSiteOnly.length} ont quitté PUBG
                </span>
              )}
              {diff.inPubgOnly.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/80 px-2.5 py-1 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300">
                  <UserPlus className="h-3.5 w-3.5 text-amber-500" />
                  {diff.inPubgOnly.length} absents du site
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={loadDiff}
              disabled={diffLoading}
              title="Rafraîchir les données de l'API PUBG"
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Rafraîchir</span>
            </button>
          </div>

          {diff.incompleteRelationships && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <strong className="font-semibold">Données partielles de l&apos;API PUBG :</strong>
                <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                  L&apos;API PUBG signale <strong>{diff.pubgMemberCountFromApi}</strong> membres mais ne fournit que{' '}
                  <strong>{diff.pubgMembersCount}</strong> identifiants exploitables. La liste des départs ne peut être établie que partiellement.
                </p>
              </div>
            </div>
          )}

          {!diff.incompleteRelationships && diff.inSiteOnly.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Ont quitté le clan PUBG ({diff.inSiteOnly.length})
              </p>
              <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {diff.inSiteOnly.map((m) => (
                  <div key={m.memberId} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                      <span className="font-bold text-slate-900 dark:text-white">{m.displayName}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">{m.pubgAccountId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.inPubgOnly.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Dans le clan PUBG mais non trackés ({diff.inPubgOnly.length})
              </p>
              <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {diff.inPubgOnly.map((m) => (
                  <div key={m.accountId} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                      <span className="font-bold text-slate-900 dark:text-white">{m.pubgName ?? m.accountId}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">{m.accountId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.unverified.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                Compte PUBG non vérifié ({diff.unverified.length})
              </p>
              <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                {diff.unverified.map((m) => (
                  <div key={m.memberId} className="flex items-center justify-between gap-3 px-3.5 py-2 text-xs opacity-70">
                    <span className="text-slate-700 dark:text-slate-300">{m.displayName}</span>
                    <span className="text-[11px] text-slate-400">Aucun accountId</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.matched.length > 0 && (
            <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white flex items-center justify-between">
                <span>Membres confirmés et trackés ({diff.matched.length})</span>
                <span className="text-[11px] text-blue-500 group-open:hidden">▸ Afficher</span>
                <span className="text-[11px] text-blue-500 hidden group-open:inline">▾ Masquer</span>
              </summary>
              <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 pt-2 dark:divide-slate-800/80 dark:border-slate-800/80 max-h-48 overflow-y-auto">
                {diff.matched.map((m) => (
                  <div key={m.accountId} className="flex items-center justify-between py-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="font-medium text-slate-800 dark:text-slate-200">{m.displayName}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">{m.pubgName ?? m.accountId}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )

  if (isModal) {
    return content
  }

  return (
    <section className="app-panel p-6">
      {content}
    </section>
  )
}
