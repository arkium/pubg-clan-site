'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, UserMinus, UserPlus, Users } from 'lucide-react'

import { Callout, Tag, type Tone } from '@/components/ui/CharteKit'

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
    <div className="flex flex-col gap-4">
      {!isModal ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="t-section-title m-0">Comparaison avec le clan PUBG</h2>
            <p className="t-meta m-0">Membres du clan officiel PUBG et joueurs suivis par le site.</p>
          </div>
          {!diff && pubgClanId ? (
            <button type="button" onClick={loadDiff} disabled={diffLoading} className="app-btn app-btn--md app-btn--secondary shrink-0">
              {diffLoading ? 'Chargement…' : 'Comparer'}
            </button>
          ) : null}
        </div>
      ) : null}

      {!pubgClanId ? (
        <p className="t-meta m-0">Le clan n’a pas encore d’identifiant de clan PUBG : synchronisez-le d’abord.</p>
      ) : null}

      {diffLoading ? (
        <div className="flex flex-col items-center gap-1 py-8 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
          <p className="t-body m-0 font-semibold text-gray-900">Interrogation de l’API PUBG…</p>
          <p className="t-meta m-0">Vérification de l’effectif du clan officiel</p>
        </div>
      ) : null}

      {diffError ? (
        <Callout tone="warn" icon={AlertTriangle} title="Comparaison impossible">
          {diffError}
        </Callout>
      ) : null}

      {diff && !diffLoading ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Tag tone="sky">
                <Users className="mr-1 h-3 w-3" aria-hidden="true" />
                {diff.pubgMemberCountFromApi ?? diff.pubgMembersCount} dans PUBG
              </Tag>
              <Tag tone="pos">
                <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                {diff.matched.length} suivis et confirmés
              </Tag>
              {!diff.incompleteRelationships && diff.inSiteOnly.length > 0 ? (
                <Tag tone="neg">
                  <UserMinus className="mr-1 h-3 w-3" aria-hidden="true" />
                  {diff.inSiteOnly.length} ont quitté le clan PUBG
                </Tag>
              ) : null}
              {diff.inPubgOnly.length > 0 ? (
                <Tag tone="warn">
                  <UserPlus className="mr-1 h-3 w-3" aria-hidden="true" />
                  {diff.inPubgOnly.length} absents du site
                </Tag>
              ) : null}
            </div>
            <button
              type="button"
              onClick={loadDiff}
              disabled={diffLoading}
              title="Interroger de nouveau l’API PUBG"
              className="app-btn app-btn--xs app-btn--secondary gap-1"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Rafraîchir
            </button>
          </div>

          {diff.incompleteRelationships ? (
            <Callout tone="warn" icon={AlertTriangle} title="Données partielles de l’API PUBG">
              L’API signale {diff.pubgMemberCountFromApi} membres mais ne fournit que {diff.pubgMembersCount} identifiants
              exploitables : la liste des départs ne peut être établie que partiellement.
            </Callout>
          ) : null}

          {!diff.incompleteRelationships && diff.inSiteOnly.length > 0 ? (
            <DiffList
              tone="neg"
              title={`Ont quitté le clan PUBG (${diff.inSiteOnly.length})`}
              rows={diff.inSiteOnly.map((m) => ({ key: String(m.memberId), name: m.displayName, detail: m.pubgAccountId }))}
            />
          ) : null}

          {diff.inPubgOnly.length > 0 ? (
            <DiffList
              tone="warn"
              title={`Dans le clan PUBG mais pas suivis (${diff.inPubgOnly.length})`}
              rows={diff.inPubgOnly.map((m) => ({ key: m.accountId, name: m.pubgName ?? m.accountId, detail: m.accountId }))}
            />
          ) : null}

          {diff.unverified.length > 0 ? (
            <DiffList
              tone="neutral"
              title={`Compte PUBG non vérifié (${diff.unverified.length})`}
              rows={diff.unverified.map((m) => ({ key: String(m.memberId), name: m.displayName, detail: 'Aucun identifiant PUBG' }))}
            />
          ) : null}

          {diff.matched.length > 0 ? (
            <details className="app-panel-muted group px-3.5 py-3">
              <summary className="t-body flex cursor-pointer items-center justify-between font-semibold text-gray-900">
                Membres confirmés et suivis ({diff.matched.length})
                <ChevronDown className="h-4 w-4 transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
              </summary>
              <ul className="m-0 mt-2 flex max-h-48 list-none flex-col overflow-y-auto border-t border-gray-200 p-0 pt-2">
                {diff.matched.map((m) => (
                  <li key={m.accountId} className="flex items-center justify-between gap-3 py-1 text-xs">
                    <span className="flex items-center gap-2 font-medium text-gray-900">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--game-pos)' }} aria-hidden="true" />
                      {m.displayName}
                    </span>
                    <span className="t-meta font-mono">{m.pubgName ?? m.accountId}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  if (isModal) {
    return content
  }

  return <section className="app-panel p-4 sm:p-5">{content}</section>
}

/** Liste d'écarts entre le clan PUBG et le site : intitulé coloré, puis une ligne par joueur. */
function DiffList({ tone, title, rows }: { tone: Tone; title: string; rows: Array<{ key: string; name: string; detail: string }> }) {
  const color = tone === 'neutral' ? 'var(--theme-ui-text-muted)' : `var(--game-${tone})`
  return (
    <div className="flex flex-col gap-1.5">
      <span className="t-label" style={{ color }}>
        {title}
      </span>
      <ul className="app-panel-muted m-0 flex list-none flex-col p-0">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 border-t border-gray-200 px-3.5 py-2 text-xs first:border-t-0">
            <span className="flex min-w-0 items-center gap-2 font-semibold text-gray-900">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
              <span className="truncate">{row.name}</span>
            </span>
            <span className="t-meta truncate font-mono">{row.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
