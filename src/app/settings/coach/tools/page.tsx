'use client'

import { HelpCircle, Wrench } from 'lucide-react'
import { useState } from 'react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import { DATE_TIME, INT, Kpi } from '@/components/settings/coach/CoachAdminShared'
import { EmptyState, ErrorState, ListSkeleton, SectionCard, Tag } from '@/components/ui/CharteKit'
import Pagination from '@/components/ui/Pagination'
import type { CoachToolsReport } from '@/lib/coach/coach-admin-report'
import { paginate } from '@/lib/pagination'

/** Données manquantes par page. */
const GAPS_PAGE_SIZE = 10
const PERCENT = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 })

/**
 * Outils du Coach IA (2026-10-30) : sur 30 jours, ce que le modèle appelle — appels, part des réponses, échecs, votes
 * « Inexact » —, les outils jamais appelés (à mieux décrire ou à retirer : au-delà d'une vingtaine, le modèle choisit
 * moins bien) et les données que le Coach dit ne pas pouvoir lire (`reportMissingData`), soit les outils à créer.
 * Lecture seule : GET /api/settings/coach/tools.
 */
export default function CoachToolsPage() {
  const [token, setToken] = useState(0)
  const [gapsPage, setGapsPage] = useState(1)
  const { data, error, loading } = useLifecycleResource<CoachToolsReport>('/api/settings/coach/tools', token)

  if (error && !data) return <ErrorState message={error} onRetry={() => setToken((value) => value + 1)} testId="coach-tools-error" />
  if (!data) return <ListSkeleton rows={4} />

  const maxCalls = Math.max(1, ...data.tools.map((tool) => tool.calls))
  const neverCalled = data.tools.filter((tool) => tool.calls === 0).length
  const gaps = paginate(data.gaps, gapsPage, GAPS_PAGE_SIZE)
  const maxGap = data.gaps[0]?.count ?? 1

  return (
    <div className={`flex flex-col gap-5 ${loading ? 'opacity-60' : ''}`} data-testid="coach-tools">
      <div className="coach-kpis">
        <Kpi value={INT.format(data.answers)} label={`Réponses · ${data.days} j`} />
        <Kpi value={INT.format(data.withoutTool)} label="Sans outil (salutations, aide, refus compris)" testId="coach-tools-without" />
        <Kpi value={INT.format(data.unverified)} label="Chiffres sans outil" tone={data.unverified > 0 ? 'warn' : undefined} />
        <Kpi value={INT.format(data.withFailure)} label="Avec un outil en échec" tone={data.withFailure > 0 ? 'neg' : undefined} />
        <Kpi value={INT.format(neverCalled)} label="Outils jamais appelés" tone={neverCalled > 0 ? 'warn' : undefined} testId="coach-tools-never" />
      </div>

      <SectionCard
        id="coach-tools-usage"
        icon={Wrench}
        title="Usage des outils"
        meta={`${data.days} derniers jours ; part = réponses qui ont appelé l’outil au moins une fois. Un outil jamais appelé est à mieux décrire ou à retirer.`}
      >
        <div className="coach-freq" data-testid="coach-tools-list">
          {data.tools.map((tool) => (
            <div key={tool.name} className={`coach-freq-row ${tool.calls === 0 ? 'opacity-60' : ''}`} data-testid={`coach-tool-${tool.name}`}>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="coach-tool-chip">{tool.name}</span>
                  {tool.calls === 0 ? <Tag tone="warn">Jamais appelé</Tag> : null}
                  {tool.inaccurate > 0 ? <Tag tone="neg">{`${INT.format(tool.inaccurate)} vote${tool.inaccurate > 1 ? 's' : ''} « Inexact »`}</Tag> : null}
                  {tool.failures.map((failure) => (
                    <Tag key={failure.code} tone="neg">{`${failure.code} × ${INT.format(failure.count)}`}</Tag>
                  ))}
                </span>
                <span className="t-meta">
                  {tool.label}
                  {tool.calls > 0 ? ` · ${INT.format(tool.answers)} réponse${tool.answers > 1 ? 's' : ''} (${PERCENT.format(tool.share)})` : ''}
                  {tool.lastUsedAt ? ` · dernier appel ${DATE_TIME.format(new Date(tool.lastUsedAt))}` : ''}
                </span>
              </span>
              <span className="t-hero t-hero--sm text-gray-900">{INT.format(tool.calls)}</span>
              <div className="coach-freq-bar">
                <span style={{ width: `${Math.round((tool.calls / maxCalls) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        id="coach-tools-gaps"
        icon={HelpCircle}
        title="Données manquantes signalées"
        meta="Quand aucun outil ne couvre la question, le Coach le signale en quelques mots ; les sujets proches sont réunis. C’est la liste des outils à créer."
      >
        {data.gaps.length === 0 ? (
          <EmptyState icon={HelpCircle} title="Rien de signalé sur la période" text="Le Coach signale une donnée manquante depuis le 30 octobre 2026." />
        ) : (
          <>
            <div className="coach-freq" data-testid="coach-tools-gaps">
              {gaps.visible.map((gap) => (
                <div key={gap.text} className="coach-freq-row">
                  <span className="t-body text-gray-900">
                    {gap.text}
                    {gap.variants > 1 ? <span className="t-meta"> · {gap.variants} formulations</span> : null}
                  </span>
                  <span className="t-hero t-hero--sm text-gray-900">{INT.format(gap.count)}</span>
                  <div className="coach-freq-bar">
                    <span style={{ width: `${Math.round((gap.count / maxGap) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              page={gaps.current}
              pageCount={gaps.pageCount}
              total={data.gaps.length}
              pageSize={GAPS_PAGE_SIZE}
              onPageChange={setGapsPage}
              ariaLabel="Pages des données manquantes"
              itemLabel="Sujets"
            />
          </>
        )}
      </SectionCard>
    </div>
  )
}
