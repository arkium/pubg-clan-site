'use client'

import { BookOpen, Calendar, ChevronDown, Database, History, Info, Swords, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'

import { usePageData } from '@/hooks/usePageData'
import {
  PAGE_SCOPE_TITLE,
  PAGE_SCOPES,
  pageScopeMethodologyHref,
  pageScopeRows,
  type PageScopeContext,
  type PageScopeData,
  type PageScopeKey,
  type PageScopeRow,
} from '@/lib/page-scope'

const ROW_ICONS: Record<PageScopeRow['id'], LucideIcon> = {
  period: Calendar,
  matches: Swords,
  source: Database,
  since: History,
  notes: BookOpen,
}

function pickCoverage(payload: unknown): NonNullable<PageScopeData> | null {
  if (!payload || typeof payload !== 'object' || !('coverage' in payload)) return null
  const { coverage, pendingAnalyses } = payload as { coverage: NonNullable<PageScopeData>['coverage']; pendingAnalyses?: number }
  return { coverage, pendingAnalyses: typeof pendingAnalyses === 'number' ? pendingAnalyses : 0 }
}

/**
 * « D'où viennent ces chiffres ? » en bas des pages d'un joueur et d'un clan (docs/TODO/aide-des-pages.md) : période,
 * parties comptées, source et dates de départ des données, d'après les filtres de la page. Même barre que « Comment ça
 * marche ? » du Coach (classes `app-help-bar*`) ; repliée par défaut mais **dans le HTML** (`<details>`), liens
 * compris. Les dates ne sont lues qu'à la première ouverture (`GET /api/…/data-coverage`, en cache 5 min) : rien n'est
 * demandé à qui ne l'ouvre pas. Textes : `src/lib/page-scope.ts`, partagés avec la Méthodologie.
 *
 * `children` : un bloc propre à la page, rangé sous les lignes (« En bref » de la vue d'ensemble d'un clan, D6).
 */
export default function PageScopeNote({
  scope,
  id,
  context = {},
  className = '',
  children,
}: {
  scope: PageScopeKey
  /** Identifiant du joueur (`member:…`) ou du clan (`clan:…`) ; `null` tant que la page ne le connaît pas. */
  id: number | null
  context?: PageScopeContext
  /** Marge au-dessus, selon la page (`mt-6` après un contenu sans espacement propre). */
  className?: string
  children?: ReactNode
}) {
  const entry = PAGE_SCOPES[scope]
  const [opened, setOpened] = useState(false)
  const url = opened && id ? `/api/${entry.area === 'member' ? 'members' : 'clans'}/${id}/data-coverage` : null
  const { data, loading, error } = usePageData(url, pickCoverage)
  // Repliée (et dans le HTML du serveur) : les textes généraux. Ouverte : `null` le temps de la lecture (« — »), puis
  // les dates ; une erreur garde les textes généraux.
  const coverage: PageScopeData | undefined = !opened || error ? undefined : loading ? null : data
  const rows = pageScopeRows(entry, context, coverage)

  return (
    <details
      className={`app-help-bar ${className}`.trim()}
      data-testid="page-scope-note"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) setOpened(true)
      }}
    >
      <summary className="app-help-bar-title">
        <Info className="h-5 w-5" aria-hidden="true" />
        <span>{PAGE_SCOPE_TITLE}</span>
        <span className="app-help-bar-toggle">
          <span className="app-help-bar-when-closed">Afficher</span>
          <span className="app-help-bar-when-open">Masquer</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </span>
      </summary>
      <div className="app-help-bar-body">
        <dl className="app-help-bar-rows" data-testid="page-scope-rows">
          {rows.map((row, index) => {
            const Icon = ROW_ICONS[row.id]
            const isOddLast = rows.length % 2 === 1 && index === rows.length - 1
            return (
              <div
                key={row.id}
                className={`app-panel-muted app-help-bar-row ${isOddLast ? 'app-help-bar-row--wide' : ''}`.trim()}
                data-testid={`page-scope-${row.id}`}
              >
                <dt>
                  <Icon className="h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
                  <span>{row.label}</span>
                </dt>
                <dd>
                  {row.text ? <p>{row.text}</p> : null}
                  {row.items ? (
                    <ul>
                      {row.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </dd>
              </div>
            )
          })}
        </dl>
        {error ? <p className="t-meta m-0">Dates indisponibles pour l’instant : réessaie plus tard.</p> : null}
        {children ? <div className="app-help-bar-extra">{children}</div> : null}
        <Link href={pageScopeMethodologyHref(entry)} className="app-help-bar-link">
          Méthodologie : comment le site calcule ses chiffres →
        </Link>
      </div>
    </details>
  )
}
