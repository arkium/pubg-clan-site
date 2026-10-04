'use client'

import { Activity, AlertTriangle, CheckCircle2, Clock, History, PhoneCall, type LucideIcon } from 'lucide-react'

import { EmptyState, LifecycleCard, formatDate, plural, type LifecycleOverview, type LifecycleRun, type Tone } from '@/components/clan-lifecycle/LifecycleShared'

/**
 * Onglet « Santé » (docs/features/cycle-de-vie-clan.md §3), selon la charte : dernier passage en tuiles chiffrées
 * (`app-stat-tile`), coût du parking en KPI à chiffre héros, derniers passages en tableau `app-table-shell` — colonnes
 * secondaires masquées sur mobile, jamais de défilement horizontal.
 */

const RUN_STATUS: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  success: { label: 'Réussi', tone: 'pos', icon: CheckCircle2 },
  aborted: { label: 'Interrompu', tone: 'neg', icon: AlertTriangle },
  failed: { label: 'Échec', tone: 'neg', icon: AlertTriangle },
  running: { label: 'En cours', tone: 'warn', icon: Clock },
  skipped: { label: 'Sauté', tone: 'neutral', icon: Clock },
}

const MODE_LABELS: Record<string, string> = { observe: 'Observation', apply: 'Application' }

function runStatus(run: LifecycleRun) {
  // Le coupe-circuit prime : c'est lui qu'il faut voir, quel que soit le statut écrit.
  if (run.circuitBreakerTripped) return { label: 'Coupe-circuit', tone: 'neg' as Tone, icon: AlertTriangle }
  return RUN_STATUS[run.status] ?? { label: run.status, tone: 'neutral' as Tone, icon: Clock }
}

function StatusCell({ run }: { run: LifecycleRun }) {
  const status = runStatus(run)
  const Icon = status.icon
  const color = status.tone === 'neutral' ? 'var(--theme-ui-text-muted)' : `var(--game-${status.tone})`
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color }}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {status.label}
    </span>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="app-stat-tile">
      <span className="app-stat-tile__value text-gray-900">{value}</span>
      <span className="app-stat-tile__label" title={label}>
        {label}
      </span>
    </div>
  )
}

export function HealthSection({ health }: { health: LifecycleOverview['health'] }) {
  const { lastRun, recentRuns, ungroupedDailyApiCalls } = health

  return (
    <div className="flex flex-col gap-[18px]" data-testid="lifecycle-health">
      <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <LifecycleCard
          id="lifecycle-last-run-title"
          icon={Activity}
          title="Dernier passage"
          testId="lifecycle-last-run"
          meta={
            lastRun ? (
              <span className="t-num">
                {formatDate(lastRun.startedAt)} · mode {MODE_LABELS[lastRun.mode]?.toLowerCase() ?? lastRun.mode}
              </span>
            ) : undefined
          }
          aside={lastRun ? <StatusCell run={lastRun} /> : undefined}
        >
          {lastRun ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <StatTile label="Membres" value={lastRun.membersScanned} />
              <StatTile label="Appels PUBG" value={lastRun.apiCalls} />
              <StatTile label="Écarts" value={lastRun.discrepanciesFound} />
              <StatTile label="En attente" value={lastRun.awaitingConfirmation} />
              <StatTile label="Appliqués" value={lastRun.movementsApplied} />
              <StatTile label="Indéterminés" value={lastRun.statesUnknown} />
            </div>
          ) : (
            <EmptyState icon={Activity} title="Aucun passage enregistré" text="Le passage quotidien tourne à 01:45 (heure de Paris)." />
          )}
        </LifecycleCard>

        <section className="app-panel app-kpi" aria-labelledby="lifecycle-parking-cost-title" data-testid="lifecycle-parking-cost">
          <span id="lifecycle-parking-cost-title" className="t-label inline-flex items-center gap-1.5">
            <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
            Coût quotidien du parking
          </span>
          <b className="t-hero t-hero--md text-gray-900">{ungroupedDailyApiCalls}</b>
          <p className="app-kpi__foot">
            {ungroupedDailyApiCalls > 1 ? 'appels' : 'appel'} PUBG par jour, un par joueur au parking, en plus de leur
            synchronisation de matchs. C’est ce que l’archivage réduit.
          </p>
        </section>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="lifecycle-runs-title">
        <h2 id="lifecycle-runs-title" className="t-section-title inline-flex items-center gap-2">
          <History className="h-4 w-4 text-gray-500" aria-hidden="true" />
          Derniers passages
        </h2>
        {recentRuns.length === 0 ? (
          <EmptyState icon={History} title="Aucun passage enregistré" />
        ) : (
          <div className="app-table-shell">
            <table className="w-full table-auto text-[13px]" data-testid="lifecycle-runs">
              <thead className="app-table-head">
                <tr>
                  <th scope="col" className="py-2 pl-3 pr-[9px] text-left">Date</th>
                  <th scope="col" className="px-[9px] py-2 text-left">Statut</th>
                  <th scope="col" className="hidden px-[9px] py-2 text-left sm:table-cell">Mode</th>
                  <th scope="col" className="hidden px-[9px] py-2 text-right sm:table-cell">Membres</th>
                  <th scope="col" className="hidden px-[9px] py-2 text-right md:table-cell">Appels</th>
                  <th scope="col" className="py-2 pl-[9px] pr-3 text-right">Appliqués</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id} className="app-table-row">
                    <td className="t-num whitespace-nowrap py-2 pl-3 pr-[9px] text-gray-700">{formatDate(run.startedAt)}</td>
                    <td className="px-[9px] py-2">
                      <StatusCell run={run} />
                    </td>
                    <td className="hidden px-[9px] py-2 text-gray-700 sm:table-cell">{MODE_LABELS[run.mode] ?? run.mode}</td>
                    <td className="t-num hidden px-[9px] py-2 text-right text-gray-700 sm:table-cell">{run.membersScanned}</td>
                    <td className="t-num hidden px-[9px] py-2 text-right text-gray-700 md:table-cell">{run.apiCalls}</td>
                    <td className="t-num py-2 pl-[9px] pr-3 text-right font-bold text-gray-900">{run.movementsApplied}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="t-meta">{plural(recentRuns.length, 'passage affiché', 'passages affichés')}, dix au plus.</p>
      </section>
    </div>
  )
}
