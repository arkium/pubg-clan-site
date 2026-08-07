'use client'

import Link from 'next/link'
import { useState } from 'react'

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
}: {
  clanId: number | null
  pubgClanId: string | null | undefined
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

  return (
    <section className="app-panel p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Comparaison PUBG vs site</h2>
          <p className="mt-0.5 text-xs text-gray-500">
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

      {!pubgClanId && (
        <p className="text-sm text-gray-500">
          Le clan n&apos;a pas encore de PUBG Clan ID — sync stats d&apos;abord.
        </p>
      )}

      {diffError && <p className="text-sm text-rose-600">{diffError}</p>}

      {diff && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-gray-700">
              <span className="h-2 w-2 rounded-full bg-gray-400" />
              {diff.pubgMemberCountFromApi ?? diff.pubgMembersCount} dans le clan PUBG
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-gray-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {diff.matched.length} trackés et confirmés
            </span>
            {!diff.incompleteRelationships && diff.inSiteOnly.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-rose-600">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                {diff.inSiteOnly.length} ont quitté le clan PUBG
              </span>
            )}
            {diff.inPubgOnly.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-amber-600">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                {diff.inPubgOnly.length} dans PUBG, absents du site
              </span>
            )}
            {diff.unverified.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-gray-500">
                <span className="h-2 w-2 rounded-full bg-gray-400" />
                {diff.unverified.length} compte PUBG non vérifié
              </span>
            )}
            {diff.incompleteRelationships && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-gray-500"
                title={`L'API PUBG indique ${diff.pubgMemberCountFromApi} membres mais ne fournit que ${diff.pubgMembersCount} IDs via relationships — comparaison partielle, départs non fiables`}
              >
                données partielles ({diff.pubgMembersCount}/{diff.pubgMemberCountFromApi} IDs)
              </span>
            )}
          </div>

          {diff.incompleteRelationships && (
            <p className="text-xs text-gray-500">
              L&apos;API PUBG indique {diff.pubgMemberCountFromApi} membres dans le clan mais
              ne fournit que {diff.pubgMembersCount} identifiants via ses données de
              relationship. La liste des départs ne peut pas être établie de manière fiable.
            </p>
          )}

          {!diff.incompleteRelationships && diff.inSiteOnly.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-600">
                Ont quitté le clan PUBG ({diff.inSiteOnly.length}) — à archiver
              </p>
              <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                {diff.inSiteOnly.map((m) => (
                  <div key={m.memberId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                    <span className="flex-1 text-sm font-medium text-gray-900">
                      {m.displayName}
                    </span>
                    <span className="text-xs text-gray-500">{m.pubgAccountId}</span>
                    <Link
                      href={`/clans/${clanId}/settings/members`}
                      className="text-xs text-gray-500 underline hover:text-gray-700"
                    >
                      Gérer →
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.inPubgOnly.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
                Dans le clan PUBG mais non trackés ({diff.inPubgOnly.length}) — à ajouter
              </p>
              <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                {diff.inPubgOnly.map((m) => (
                  <div key={m.accountId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    <span className="flex-1 text-sm font-medium text-gray-900">
                      {m.pubgName ?? m.accountId}
                    </span>
                    <span className="font-mono text-xs text-gray-500">{m.accountId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.unverified.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Compte PUBG non vérifié ({diff.unverified.length})
              </p>
              <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                {diff.unverified.map((m) => (
                  <div key={m.memberId} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-gray-400" />
                    <span className="flex-1 text-sm text-gray-700">{m.displayName}</span>
                    <span className="text-xs text-gray-500">Aucun pubgAccountId</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.matched.length > 0 && (
            <details className="group">
              <summary className="mb-2 cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700">
                Membres confirmés ({diff.matched.length})
                <span className="ml-1 text-gray-400 group-open:hidden">▸ afficher</span>
                <span className="ml-1 text-gray-400 hidden group-open:inline">▾ masquer</span>
              </summary>
              <div className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200">
                {diff.matched.map((m) => (
                  <div key={m.accountId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <span className="flex-1 text-sm text-gray-700">{m.displayName}</span>
                    <span className="text-xs text-gray-500">{m.pubgName ?? m.accountId}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  )
}
