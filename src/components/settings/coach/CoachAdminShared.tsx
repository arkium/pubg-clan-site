'use client'

import type { ReactNode } from 'react'

/**
 * Pièces communes des onglets de /settings/coach (docs/ui/index.html §44) : formats, KPI, jauge du plafond. Les montants
 * arrivent en euros déjà convertis par le serveur ; les petits montants (coût par question) gardent quatre décimales.
 */

const EUR_2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const EUR_4 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 })
// Pas `style: 'currency'` : Intl écrit « $US » en français, la charte montre « 0,30 $ / M ».
const USD_2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const INT = new Intl.NumberFormat('fr-FR')
export const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
export const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

export function formatEur(value: number, precise = false): string {
  return (precise ? EUR_4 : EUR_2).format(value)
}

/** « 0,30 $ / M » : prix Google par million de tokens. */
export function formatUsdPerM(value: number): string {
  return `${USD_2.format(value)} $ / M`
}

export function Kpi({ value, label, tone, testId }: { value: ReactNode; label: string; tone?: 'pos' | 'warn' | 'neg'; testId?: string }) {
  return (
    <div className="coach-kpi" data-testid={testId}>
      <div className={`t-hero t-hero--md ${tone ? `t-${tone}` : 'text-gray-900'}`}>{value}</div>
      <div className="t-meta">{label}</div>
    </div>
  )
}

/** Jauge d'un budget : remplissage ciel, orange au-delà du repère, rouge au plafond. */
export function BudgetGauge({ percent, warnAt, label }: { percent: number; warnAt: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent))
  const fill = percent >= 100 ? 'coach-gauge-fill coach-gauge-fill--neg' : percent >= warnAt ? 'coach-gauge-fill coach-gauge-fill--warn' : 'coach-gauge-fill'
  return (
    <div className="coach-gauge" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-label={label}>
      <div className={fill} style={{ width: `${clamped}%` }} />
      <span className="coach-gauge-mark" style={{ left: `${warnAt}%` }} title={`Alerte à ${warnAt} %`} />
    </div>
  )
}
