'use client'

import { AlertTriangle, Coins, Cpu, Users } from 'lucide-react'
import { useState } from 'react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import { BudgetGauge, formatEur, INT, Kpi, MONTH } from '@/components/settings/coach/CoachAdminShared'
import { Callout, EmptyState, ErrorState, ListSkeleton, SectionCard } from '@/components/ui/CharteKit'
import { COACH_ACCOUNT_WARN_PERCENT, COACH_GLOBAL_WARN_PERCENT, type CoachUsageReport } from '@/lib/coach/coach-admin-report'

/**
 * Consommation du Coach IA (docs/TODO/chatbot-ia.md §9, onglet 2) : le mois de Paris en cours — coût, questions,
 * comptes, jauge du plafond global, par modèle, comptes proches de leur budget, erreurs du fournisseur. Lecture seule :
 * GET /api/settings/coach/usage.
 */
export default function CoachUsagePage() {
  const [token, setToken] = useState(0)
  const { data, error, loading } = useLifecycleResource<CoachUsageReport>('/api/settings/coach/usage', token)

  if (error && !data) return <ErrorState message={error} onRetry={() => setToken((value) => value + 1)} testId="coach-usage-error" />
  if (!data) return <ListSkeleton rows={4} />

  const { totals, global, byModel, accountsNearBudget, budgetPerAccountEur, errorsLast24h } = data
  const month = MONTH.format(new Date(data.period.start))

  return (
    <div className={`flex flex-col gap-5 ${loading ? 'opacity-60' : ''}`} data-testid="coach-usage">
      <p className="t-meta m-0">Mois de {month} (heure de Paris) ; une question interrompue compte dans le budget, pas dans les questions répondues.</p>

      <div className="coach-kpis">
        <Kpi value={formatEur(totals.costEur)} label="Coût du mois" testId="coach-usage-cost" />
        <Kpi value={INT.format(totals.questions)} label="Questions répondues" testId="coach-usage-questions" />
        <Kpi value={INT.format(totals.accounts)} label="Comptes actifs" />
        <Kpi value={totals.costPerQuestionEur === null ? '—' : formatEur(totals.costPerQuestionEur, true)} label="Par question" />
        <Kpi value={INT.format(totals.errors)} label="Réponses en erreur" tone={totals.errors > 0 ? 'neg' : undefined} />
        <Kpi value={INT.format(totals.aborted)} label="Interrompues" tone={totals.aborted > 0 ? 'warn' : undefined} />
      </div>

      <SectionCard id="coach-global" icon={Coins} title="Plafond global du mois" meta={`Atteint, le Coach se ferme à tous sauf à toi jusqu’au 1er du mois suivant. Alerte Discord à ${COACH_GLOBAL_WARN_PERCENT} %.`} aside={<span className="t-meta t-num">{formatEur(global.spentEur)} sur {formatEur(global.budgetEur)}</span>}>
        <BudgetGauge percent={global.percent} warnAt={COACH_GLOBAL_WARN_PERCENT} label="Plafond global du mois" />
        <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
          <span className="t-meta" data-testid="coach-global-percent">
            {global.percent} % utilisé · reste {formatEur(global.remainingEur)}
          </span>
          <span className={`t-meta ${global.percent >= 100 ? 't-neg' : global.percent >= COACH_GLOBAL_WARN_PERCENT ? 't-warn' : ''}`}>
            {global.percent >= 100 ? 'Plafond atteint : Coach en pause' : global.percent >= COACH_GLOBAL_WARN_PERCENT ? 'Au-delà du seuil d’alerte' : `Alerte à ${COACH_GLOBAL_WARN_PERCENT} %`}
          </span>
        </div>
      </SectionCard>

      <SectionCard id="coach-by-model" icon={Cpu} title="Par modèle" meta="Questions répondues, tokens et coût de chaque modèle utilisé ce mois-ci.">
        {byModel.length === 0 ? (
          <EmptyState icon={Cpu} title="Aucune question ce mois-ci" />
        ) : (
          <>
            <ul className="flex flex-col gap-2 md:hidden">
              {byModel.map((row) => (
                <li key={row.model} className="app-panel-muted flex flex-col gap-1 px-3 py-2.5">
                  <span className="t-card-title">{row.label}</span>
                  <span className="t-meta">
                    {INT.format(row.questions)} questions · {INT.format(row.tokensIn)} entrée · {INT.format(row.tokensOut)} sortie · {formatEur(row.costEur)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="app-table-shell hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-[9px] py-2 text-left">Modèle</th>
                    <th className="px-[9px] py-2 text-right">Questions</th>
                    <th className="px-[9px] py-2 text-right">Tokens entrée</th>
                    <th className="px-[9px] py-2 text-right">Tokens sortie</th>
                    <th className="px-[9px] py-2 text-right">Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((row) => (
                    <tr key={row.model} className="app-table-row">
                      <td className="px-[9px] py-2">
                        <span className="t-card-title">{row.label}</span> <span className="coach-model-id">{row.model}</span>
                      </td>
                      <td className="t-num px-[9px] py-2 text-right text-gray-900">{INT.format(row.questions)}</td>
                      <td className="t-num px-[9px] py-2 text-right text-gray-700">{INT.format(row.tokensIn)}</td>
                      <td className="t-num px-[9px] py-2 text-right text-gray-700">{INT.format(row.tokensOut)}</td>
                      <td className="t-num px-[9px] py-2 text-right font-semibold text-gray-900">{formatEur(row.costEur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard id="coach-accounts" icon={Users} title="Comptes proches de leur budget" meta={`Au-delà de ${COACH_ACCOUNT_WARN_PERCENT} % du budget par compte (${formatEur(budgetPerAccountEur)} par mois).`}>
        {accountsNearBudget.length === 0 ? (
          <p className="t-meta m-0">Aucun compte au-delà de {COACH_ACCOUNT_WARN_PERCENT} % de son budget.</p>
        ) : (
          <div className="coach-freq" data-testid="coach-accounts-near-budget">
            {accountsNearBudget.map((account) => (
              <div key={account.userId} className="coach-freq-row">
                <span className="t-body text-gray-900">{account.label}</span>
                <span className={`t-meta t-num ${account.percent >= 100 ? 't-neg' : 't-warn'}`}>
                  {formatEur(account.spentEur)} · {account.percent} %
                </span>
                <div className={`coach-freq-bar ${account.percent >= 100 ? 'coach-freq-bar--neg' : 'coach-freq-bar--warn'}`}>
                  <span style={{ width: `${Math.min(100, account.percent)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {errorsLast24h > 0 ? (
        <Callout tone="warn" icon={AlertTriangle} title={`${INT.format(errorsLast24h)} ${errorsLast24h > 1 ? 'réponses en erreur' : 'réponse en erreur'} ces 24 heures`} testId="coach-errors">
          Clé refusée, quota Google ou panne : vérifie le modèle avec « Tester » dans Réglages. Une erreur n’est pas facturée et ne compte pas dans le quota du membre.
        </Callout>
      ) : (
        <p className="t-meta m-0">Aucune réponse en erreur ces 24 heures.</p>
      )}
    </div>
  )
}
