'use client'

import { AlertTriangle, Minus, Plus } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import Pagination from '@/components/ui/Pagination'
import RankCell from '@/components/ui/RankCell'
import { LEAGUE_MATCH_TYPE_OPTIONS, type LeagueSettings } from '@/lib/clan-league'
import { LEAGUE_SETTINGS_BOUNDS, type LeaguePreview, type LeagueSettingsError } from '@/lib/league-settings'
import { paginate } from '@/lib/pagination'
import { PERIOD_LABELS, STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'

/**
 * Blocs de la page SuperUser « Réglages de la ligue » (/settings/league, docs/features/ligue-clans.md §5), selon la
 * charte UI (docs/ui/index.html) : panneaux `app-panel`, titres de rôle, chiffres tabulaires, couleurs par jetons.
 */

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const percent = (value: number) => `${integer.format(Math.round(value * 100))} %`
const ordinal = (place: number) => `${place}${place === 1 ? 're' : 'e'}`

/** Champ numérique de la charte : intitulé au-dessus, 36 px, erreur au jeton négatif sous le champ. */
const INPUT =
  't-num h-9 w-full rounded-[10px] border border-gray-200 bg-white px-2.5 text-[13px] font-semibold text-gray-900 outline-none transition focus:border-[var(--theme-ui-accent-ring)] focus:ring-2 focus:ring-[var(--theme-ui-accent-soft)] aria-[invalid=true]:border-[var(--theme-ui-negative)]'

export type FieldErrors = Record<string, string>

export function errorsByField(errors: readonly LeagueSettingsError[]): FieldErrors {
  return Object.fromEntries(errors.map((error) => [error.field, error.message]))
}

const parseInput = (value: string) => (value.trim() === '' ? Number.NaN : Number(value.replace(',', '.')))
const shown = (value: number) => (Number.isFinite(value) ? String(value) : '')

function NumberField({
  label,
  value,
  onChange,
  error,
  hint,
  step = 1,
  testId,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  error?: string
  hint?: ReactNode
  step?: number
  testId?: string
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-semibold text-gray-700">{label}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        value={shown(value)}
        onChange={(event) => onChange(parseInput(event.target.value))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={INPUT}
        data-testid={testId}
      />
      {error ? (
        <span id={`${id}-error`} className="text-[11px] font-semibold text-[var(--theme-ui-negative)]">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[11px] text-gray-500">{hint}</span>
      ) : null}
    </label>
  )
}

function Card({ title, meta, children, id }: { title: string; meta: string; children: ReactNode; id: string }) {
  return (
    <section className="app-panel flex flex-col gap-3 p-4" aria-labelledby={id}>
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="t-card-title">{title}</h2>
        <span className="t-meta">{meta}</span>
      </div>
      {children}
    </section>
  )
}

// ── Barème ──────────────────────────────────────────────────────────────────────────────────────

export function PlacementScaleCard({ points, errors, onChange }: { points: number[]; errors: FieldErrors; onChange: (points: number[]) => void }) {
  const top = Math.max(1, ...points.filter(Number.isFinite))
  const { places } = LEAGUE_SETTINGS_BOUNDS
  return (
    <Card id="league-scale-title" title="Points de placement" meta="Points gagnés à chaque partie selon la place finale ; au-delà de la dernière place, 0.">
      <ol className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4" aria-label="Barème de placement">
        {points.map((value, index) => (
          <li key={index} className="flex flex-col gap-1">
            <NumberField
              label={`${ordinal(index + 1)} place`}
              value={value}
              onChange={(next) => onChange(points.map((current, position) => (position === index ? next : current)))}
              error={errors[`placementPoints.${index}`]}
              testId={`placement-point-${index + 1}`}
            />
            <span className="h-[5px] overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
              <span className="block h-full rounded-full bg-[var(--theme-ui-accent)]" style={{ width: `${Number.isFinite(value) ? Math.max(0, (value / top) * 100) : 0}%` }} />
            </span>
          </li>
        ))}
      </ol>
      {errors.placementPoints ? <span className="text-[11px] font-semibold text-[var(--theme-ui-negative)]">{errors.placementPoints}</span> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="app-btn app-btn--secondary app-btn--sm gap-1.5"
          onClick={() => onChange([...points, 0])}
          disabled={points.length >= places.max}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Ajouter la {ordinal(points.length + 1)} place
        </button>
        <button
          type="button"
          className="app-btn app-btn--secondary app-btn--sm gap-1.5"
          onClick={() => onChange(points.slice(0, -1))}
          disabled={points.length <= places.min}
        >
          <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          Retirer la {ordinal(points.length)} place
        </button>
      </div>
    </Card>
  )
}

// ── Score brut ──────────────────────────────────────────────────────────────────────────────────

const SHARE_STYLE = {
  placement: { label: 'Placement', color: 'var(--theme-ui-accent)' },
  damage: { label: 'Dégâts', color: 'var(--game-warn)' },
  kills: { label: 'Kills', color: 'var(--game-neg)' },
  knocks: { label: 'Knocks', color: 'var(--game-sky)' },
} as const

/** Coefficient du placement qui donnerait 40 % du score moyen de la ligue (arrondi à 5) ; `null` sans données. */
export function placementWeightFor40(league: LeaguePreview['draft']['league'], settings: LeagueSettings) {
  if (league.matches === 0 || league.avgPlacementPoints <= 0) return null
  const rest = league.avgDamage * settings.damageWeight + league.avgKills * settings.killWeight + league.avgKnocks * settings.knockWeight
  return Math.max(0, Math.round((0.4 * rest) / (0.6 * league.avgPlacementPoints) / 5) * 5)
}

export function WeightsCard({
  settings,
  errors,
  onChange,
  preview,
}: {
  settings: LeagueSettings
  errors: FieldErrors
  onChange: (changes: Partial<LeagueSettings>) => void
  preview: LeaguePreview | null
}) {
  const shares = preview?.draft.shares ?? null
  const placementShare = shares?.placement ?? 0
  const inTarget = placementShare >= 0.35 && placementShare <= 0.45
  const suggested = preview ? placementWeightFor40(preview.draft.league, settings) : null
  return (
    <Card id="league-weights-title" title="Score brut" meta="Moyennes par partie du clan, multipliées par leur coefficient.">
      <code className="font-mono text-[13px] text-gray-900" data-testid="raw-score-formula">
        points × {shown(settings.placementWeight) || '?'} + dégâts × {shown(settings.damageWeight) || '?'} + kills × {shown(settings.killWeight) || '?'} + knocks ×{' '}
        {shown(settings.knockWeight) || '?'}
      </code>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumberField label="Placement" value={settings.placementWeight} onChange={(value) => onChange({ placementWeight: value })} error={errors.placementWeight} testId="weight-placement" />
        <NumberField label="Dégâts" value={settings.damageWeight} step={0.1} onChange={(value) => onChange({ damageWeight: value })} error={errors.damageWeight} testId="weight-damage" />
        <NumberField label="Kills" value={settings.killWeight} onChange={(value) => onChange({ killWeight: value })} error={errors.killWeight} testId="weight-kills" />
        <NumberField label="Knocks" value={settings.knockWeight} onChange={(value) => onChange({ knockWeight: value })} error={errors.knockWeight} testId="weight-knocks" />
      </div>
      {shares ? (
        <div className="flex flex-col gap-2 border-t border-gray-200 pt-3" data-testid="score-shares">
          <span className="t-label">Part de chaque terme dans le score moyen de la ligue</span>
          <span className="flex h-3 overflow-hidden rounded-[6px] bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
            {(Object.keys(SHARE_STYLE) as Array<keyof typeof SHARE_STYLE>).map((key) =>
              shares[key] > 0 ? <span key={key} style={{ width: `${shares[key] * 100}%`, backgroundColor: SHARE_STYLE[key].color }} /> : null
            )}
          </span>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {(Object.keys(SHARE_STYLE) as Array<keyof typeof SHARE_STYLE>).map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SHARE_STYLE[key].color }} aria-hidden="true" />
                <span className="text-gray-700">{SHARE_STYLE[key].label}</span>
                <b className="t-num text-gray-900">{percent(shares[key])}</b>
              </li>
            ))}
          </ul>
          <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] ${inTarget ? 't-pos' : 't-warn'}`} data-testid="placement-target">
            {inTarget ? 'Placement dans la cible (35 à 45 %).' : `Placement hors de la cible de 35 à 45 % (${percent(placementShare)}).`}
            {!inTarget && suggested !== null && suggested !== settings.placementWeight ? (
              <button type="button" className="app-link font-semibold" onClick={() => onChange({ placementWeight: suggested })}>
                Coefficient pour 40 % : {integer.format(suggested)} — appliquer
              </button>
            ) : null}
          </p>
        </div>
      ) : null}
    </Card>
  )
}

// ── Pondération ─────────────────────────────────────────────────────────────────────────────────

export function PriorCard({ priorMatches, error, onChange }: { priorMatches: number; error?: string; onChange: (value: number) => void }) {
  const examples = [5, 15, 50]
  return (
    <Card id="league-prior-title" title="Pondération par le volume" meta="Parties fictives au niveau moyen de la ligue ajoutées à chaque clan.">
      <NumberField
        label="Parties fictives (M)"
        value={priorMatches}
        onChange={onChange}
        error={error}
        hint="0 : pas de pondération, le Power score égale le score brut."
        testId="prior-matches"
      />
      {Number.isFinite(priorMatches) && priorMatches >= 0 ? (
        <ul className="grid grid-cols-3 gap-2" aria-label="Poids du propre score d’un clan">
          {examples.map((matches) => (
            <li key={matches} className="app-panel-muted flex flex-col px-3 py-2">
              <span className="text-[11px] text-gray-500">Clan à {matches} parties</span>
              <b className="t-num text-[13px] text-gray-900">{percent(matches / (matches + priorMatches))} de son score</b>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  )
}

// ── Seuils ──────────────────────────────────────────────────────────────────────────────────────

export function ThresholdsCard({
  minMatches,
  errors,
  onChange,
}: {
  minMatches: LeagueSettings['minMatches']
  errors: FieldErrors
  onChange: (minMatches: LeagueSettings['minMatches']) => void
}) {
  const set = (type: keyof LeagueSettings['minMatches'], period: StandardPeriod, value: number) =>
    onChange({ ...minMatches, [type]: { ...minMatches[type], [period]: value } })
  const firstError = LEAGUE_MATCH_TYPE_OPTIONS.flatMap((option) => STANDARD_PERIODS.map((period) => errors[`minMatches.${option.value}.${period}`])).find(Boolean)
  return (
    <Card id="league-thresholds-title" title="Seuils de qualification" meta="Parties minimum pour être classé ; en dessous, le clan est « En qualification ».">
      <div className="app-table-shell">
        <table className="w-full table-auto text-[13px]">
          <thead className="app-table-head">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">Type</th>
              {STANDARD_PERIODS.map((period) => (
                <th key={period} scope="col" className="px-[9px] py-2 text-left">{PERIOD_LABELS[period]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LEAGUE_MATCH_TYPE_OPTIONS.map((option) => (
              <tr key={option.value} className="app-table-row">
                <th scope="row" className="px-3 py-1.5 text-left font-semibold text-gray-900">{option.short}</th>
                {STANDARD_PERIODS.map((period) => {
                  const field = `minMatches.${option.value}.${period}`
                  return (
                    <td key={period} className="px-[9px] py-1.5">
                      <input
                        type="number"
                        inputMode="numeric"
                        aria-label={`Seuil ${option.label}, ${PERIOD_LABELS[period].toLowerCase()}`}
                        value={shown(minMatches[option.value][period])}
                        onChange={(event) => set(option.value, period, parseInput(event.target.value))}
                        aria-invalid={errors[field] ? true : undefined}
                        className={`${INPUT} max-w-[84px]`}
                        data-testid={`threshold-${option.value}-${period}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {firstError ? <span className="text-[11px] font-semibold text-[var(--theme-ui-negative)]">{firstError}</span> : null}
    </Card>
  )
}

// ── Zones et titres ─────────────────────────────────────────────────────────────────────────────

export function ZonesCard({
  zoneEnd,
  titleMinMatches,
  errors,
  onChange,
}: {
  zoneEnd: number
  titleMinMatches: number
  errors: FieldErrors
  onChange: (changes: Partial<LeagueSettings>) => void
}) {
  return (
    <Card id="league-zones-title" title="Zones et titres" meta="Découpage du classement et titres de la période.">
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Dernier rang « Dans la zone »"
          value={zoneEnd}
          onChange={(value) => onChange({ zoneEnd: value })}
          error={errors.zoneEnd}
          hint={Number.isFinite(zoneEnd) ? `Podium 1 à 3, zone 4 à ${zoneEnd}, blue zone au-delà.` : undefined}
          testId="zone-end"
        />
        <NumberField
          label="Parties pour un titre"
          value={titleMinMatches}
          onChange={(value) => onChange({ titleMinMatches: value })}
          error={errors.titleMinMatches}
          hint="Plus gros dégâts, machine à knocks."
          testId="title-min-matches"
        />
      </div>
    </Card>
  )
}

// ── Aperçu ──────────────────────────────────────────────────────────────────────────────────────

const PREVIEW_PAGE_SIZE = 12

function Movement({ before, after }: { before: number | null; after: number | null }) {
  if (after === null) return <span className="text-[11px] text-gray-500">—</span>
  if (before === null) return <span className="text-[11px] font-extrabold t-pos">classé</span>
  const delta = before - after
  if (delta === 0) return <span className="text-[11px] font-extrabold text-gray-500">=</span>
  return (
    <span className="t-num text-[11px] font-extrabold" style={{ color: delta > 0 ? 'var(--theme-ui-positive)' : 'var(--theme-ui-negative)' }}>
      {delta > 0 ? `▲${delta}` : `▼${-delta}`}
    </span>
  )
}

export function PreviewCard({ preview, loading, invalid, periodLabel, typeLabel }: { preview: LeaguePreview | null; loading: boolean; invalid: boolean; periodLabel: string; typeLabel: string }) {
  const [page, setPage] = useState(1)
  const rows = preview?.rows ?? []
  const { current, pageCount, visible } = paginate(rows, page, PREVIEW_PAGE_SIZE)
  return (
    <section className="app-panel flex flex-col gap-3 p-4" aria-labelledby="league-preview-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="league-preview-title" className="t-section-title">Aperçu du classement</h2>
        <span className="t-meta">
          {typeLabel} · {periodLabel} — réglages en vigueur, puis avec vos modifications. Rien n’est enregistré.
        </span>
      </div>
      {invalid ? (
        <p className="app-panel-muted flex items-center gap-2 px-3 py-2 text-[13px] text-gray-700">
          <AlertTriangle className="t-warn h-4 w-4 shrink-0" aria-hidden="true" />
          Corrigez les champs en erreur pour voir l’aperçu.
        </p>
      ) : null}
      {preview ? (
        <div className={`flex flex-col gap-3 transition-opacity ${loading || invalid ? 'opacity-60' : ''}`} aria-busy={loading} data-testid="league-preview">
          <p className="t-num text-[13px] text-gray-700" data-testid="preview-summary">
            En vigueur : <b className="text-gray-900">{preview.current.ranked} classés</b>, {preview.current.qualifying} en qualification (seuil {preview.current.minMatches}) ·
            avec vos réglages : <b className="text-gray-900">{preview.draft.ranked} classés</b>, {preview.draft.qualifying} en qualification (seuil {preview.draft.minMatches})
          </p>
          {rows.length > 0 ? (
            <div className="app-table-shell">
              <table className="w-full table-auto text-[13px]">
                <thead className="app-table-head">
                  <tr>
                    <th scope="col" className="w-12 py-2 pl-3 pr-[9px] text-left">Rang</th>
                    <th scope="col" className="px-[9px] py-2 text-left">Clan</th>
                    <th scope="col" className="hidden px-[9px] py-2 text-right sm:table-cell">Parties</th>
                    <th scope="col" className="px-[9px] py-2 text-right">Avant</th>
                    <th scope="col" className="px-[9px] py-2 text-right">Écart</th>
                    <th scope="col" className="hidden px-[9px] py-2 text-right sm:table-cell">Score avant</th>
                    <th scope="col" className="py-2 pl-[9px] pr-3 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.clanId} className="app-table-row">
                      <td className="py-1.5 pl-3 pr-[9px]">{row.draft.rank !== null ? <RankCell rank={row.draft.rank} size="xs" /> : <span className="t-warn text-[11px] font-bold">qualif.</span>}</td>
                      <td className="max-w-[160px] truncate px-[9px] py-1.5 font-semibold text-gray-900">{row.name}</td>
                      <td className="t-num hidden px-[9px] py-1.5 text-right text-gray-700 sm:table-cell">{row.matches}</td>
                      <td className="t-num px-[9px] py-1.5 text-right text-gray-700">{row.current.rank ?? (row.current.qualifying ? 'qualif.' : '—')}</td>
                      <td className="px-[9px] py-1.5 text-right"><Movement before={row.current.rank} after={row.draft.rank} /></td>
                      <td className="t-num hidden px-[9px] py-1.5 text-right text-gray-500 sm:table-cell">{row.current.powerScore !== null ? integer.format(row.current.powerScore) : '—'}</td>
                      <td className="t-num py-1.5 pl-[9px] pr-3 text-right font-bold text-gray-900">{row.draft.powerScore !== null ? integer.format(row.draft.powerScore) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[13px] text-gray-500">Aucun clan n’a joué sur cette période et ce type de partie.</p>
          )}
          <Pagination page={current} pageCount={pageCount} total={rows.length} pageSize={PREVIEW_PAGE_SIZE} onPageChange={setPage} ariaLabel="Pages de l’aperçu du classement" />
        </div>
      ) : !invalid ? (
        <div className="app-panel-muted h-24 animate-pulse" aria-busy="true" />
      ) : null}
    </section>
  )
}
