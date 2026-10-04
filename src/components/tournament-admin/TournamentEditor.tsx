'use client'

import { ChevronDown, Save, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { AdminAlert } from '@/components/tournament-admin/TournamentAdminSections'
import {
  DEFAULT_PLACEMENT_POINTS,
  STATUS_OPTIONS,
  type TournamentFormErrors,
  type TournamentFormState,
} from '@/components/tournament-admin/tournament-form'
import { TOURNAMENT_MODE_ICONS, tournamentModeClass } from '@/components/tournaments/TournamentModeBadge'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { TOURNAMENT_GAME_MODE_OPTIONS, TOURNAMENT_MAP_OPTIONS } from '@/lib/tournament-filters'
import { MIXED_SQUAD_RULE_DESCRIPTIONS, TOURNAMENT_MODE_DESCRIPTIONS } from '@/lib/tournament-guide'

/**
 * Formulaire de création / modification d'un tournoi, selon la charte UI (docs/ui/index.html, Contrôles ›
 * Formulaires) : champs `app-input` (36 px, focus à l'accent, erreur au jeton négatif sous le champ), intitulé
 * au-dessus, aide en `t-meta` ; choix courts en tuiles (statut en segmented, format, mode et escouades mixtes en
 * tuiles radio, choix teinté à l'accent), carte en menu de la charte (11 choix), jamais de `<select>` natif.
 */

const LABEL = 'text-[13px] font-semibold text-gray-700'
const ERROR = 'text-[12px] font-semibold text-[var(--theme-ui-negative)]'

function Field({
  label,
  htmlFor,
  hint,
  error,
  errorId,
  className = '',
  children,
}: {
  label: string
  htmlFor?: string
  hint?: ReactNode
  error?: string
  errorId?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`.trim()}>
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
      </label>
      {children}
      {error ? (
        <span id={errorId} className={ERROR}>
          {error}
        </span>
      ) : hint ? (
        <span className="t-meta">{hint}</span>
      ) : null}
    </div>
  )
}

function FormCard({ step, title, meta, children }: { step: number; title: string; meta: string; children: ReactNode }) {
  const id = useId()
  return (
    <section className="app-panel flex flex-col gap-4 p-4 sm:p-5" aria-labelledby={id}>
      <div className="flex items-start gap-3">
        <span className="t-num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-100 text-[13px] font-extrabold text-gray-700" aria-hidden="true">
          {step}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 id={id} className="t-card-title">
            {title}
          </h3>
          <p className="t-meta">{meta}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

/** Choix exclusif en tuiles radio : la tuile choisie est teintée à l'accent (charte §1.2), avec un point plein. */
function ChoiceTiles<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string
  label: string
  options: Array<{ value: T; label: string; help: string; icon?: LucideIcon; modeClass?: string }>
  value: T
  onChange: (value: T) => void
}) {
  const labelId = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className={LABEL}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = option.value === value
          const Icon = option.icon
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border p-3 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--theme-ui-accent-ring)] ${
                checked
                  ? 'border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {Icon ? (
                // Icône à la couleur du mode (identité documentée, charte › Tournois) ; l'état choisi reste à l'accent.
                <span className={`${option.modeClass ?? ''} grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[var(--tmode-soft)]`} aria-hidden="true">
                  <Icon className="h-[18px] w-[18px] text-[var(--tmode)]" />
                </span>
              ) : null}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={`text-[13px] font-bold ${checked ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-900'}`}>{option.label}</span>
                <span className="t-meta">{option.help}</span>
              </span>
              <span
                className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                  checked ? 'border-[var(--theme-ui-accent)] bg-[var(--theme-ui-accent)]' : 'border-gray-200 bg-white'
                }`}
                aria-hidden="true"
              >
                {checked ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--theme-ui-surface)]" /> : null}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Choix court à libellés longs (format PUBG, 5 options) : tuiles compactes en grille plutôt qu'un segmented qui se
 * replierait sur trois lignes à 375 px. Tuile choisie teintée à l'accent ; la première (« Tous ») prend la ligne sur
 * mobile.
 */
function CompactTiles<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string
  label: string
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (value: T) => void
}) {
  const labelId = useId()
  return (
    <div className="flex flex-col gap-1">
      <span id={labelId} className={LABEL}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {options.map((option) => {
          const checked = option.value === value
          return (
            <label
              key={option.value || 'all'}
              className={`flex min-h-9 cursor-pointer items-center justify-center rounded-[10px] border px-2.5 py-1.5 text-center text-[13px] transition-colors first:col-span-2 sm:first:col-span-1 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--theme-ui-accent-ring)] ${
                checked
                  ? 'border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] font-bold text-[var(--theme-ui-accent-text)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]'
                  : 'border-gray-200 bg-white font-semibold text-gray-700 hover:bg-gray-50'
              }`}
            >
              <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChange(option.value)} className="sr-only" />
              {option.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}

/** Choix dans une liste longue (11 cartes) : menu de la charte, intitulé au-dessus, déclencheur de 36 px pleine largeur. */
function MenuField({
  id,
  label,
  options,
  value,
  onChange,
  hint,
}: {
  id: string
  label: string
  options: Array<{ value: string; label: string }>
  value: string
  onChange: (value: string) => void
  hint?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const current = options.find((option) => option.value === value) ?? options[0]
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div ref={rootRef} className="relative">
        <button
          id={id}
          type="button"
          onClick={() => setOpen((state) => !state)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${label} : ${current.label}`}
          className="app-menu-trigger h-9 w-full justify-between"
        >
          <span className="truncate">{current.label}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {open ? (
          <div role="menu" aria-label={label} className="app-menu absolute inset-x-0 top-full z-20 mt-1.5">
            {options.map((option) => (
              <button
                key={option.value || 'all'}
                type="button"
                role="menuitemradio"
                aria-checked={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className={`app-menu__item ${option.value === value ? 'app-menu__item--active' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Field>
  )
}

const MODE_OPTIONS = TOURNAMENT_MODE_DESCRIPTIONS.map((mode) => ({
  value: mode.value,
  label: mode.label,
  help: mode.help,
  icon: TOURNAMENT_MODE_ICONS[mode.value],
  modeClass: tournamentModeClass(mode.value),
}))

export function TournamentEditor({
  form,
  onChange,
  editing,
  errors,
  submitError,
  saving,
  onSubmit,
  onCancelEdit,
}: {
  form: TournamentFormState
  onChange: (form: TournamentFormState) => void
  /** Modification d'un tournoi existant (sinon création). */
  editing: boolean
  errors: TournamentFormErrors
  submitError: string | null
  saving: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onCancelEdit: () => void
}) {
  const statusLabelId = useId()
  const set = (patch: Partial<TournamentFormState>) => onChange({ ...form, ...patch })

  return (
    // `noValidate` : les erreurs s'affichent sous leur champ, aux couleurs de la charte, plutôt qu'en bulle du navigateur.
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-labelledby="tournament-editor-title" data-testid="tournament-editor">
      <div className="flex flex-col gap-0.5">
        <h2 id="tournament-editor-title" className="t-section-title break-words">
          {editing ? `Modifier : ${form.title || 'tournoi'}` : 'Nouveau tournoi'}
        </h2>
        <p className="t-meta">Cinq étapes : informations, mode, filtres PUBG, barème et diffusion Discord.</p>
      </div>

      <FormCard step={1} title="Informations générales" meta="Ce que les joueurs verront sur la page publique.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Titre" htmlFor="tournament-title" error={errors.title} errorId="tournament-title-error" className="sm:col-span-2">
            <input
              id="tournament-title"
              value={form.title}
              onChange={(event) => set({ title: event.target.value })}
              required
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? 'tournament-title-error' : undefined}
              className="app-input"
            />
          </Field>
          <Field label="Description" htmlFor="tournament-description" className="sm:col-span-2">
            <textarea
              id="tournament-description"
              value={form.description}
              onChange={(event) => set({ description: event.target.value })}
              rows={2}
              className="app-input"
            />
          </Field>
          <Field label="Début" htmlFor="tournament-start" error={errors.startDate} errorId="tournament-start-error">
            <input
              id="tournament-start"
              type="date"
              value={form.startDate}
              onChange={(event) => set({ startDate: event.target.value })}
              required
              aria-invalid={errors.startDate ? true : undefined}
              aria-describedby={errors.startDate ? 'tournament-start-error' : undefined}
              className="app-input t-num"
            />
          </Field>
          <Field label="Fin" htmlFor="tournament-end" error={errors.endDate} errorId="tournament-end-error">
            <input
              id="tournament-end"
              type="date"
              value={form.endDate}
              min={form.startDate}
              onChange={(event) => set({ endDate: event.target.value })}
              required
              aria-invalid={errors.endDate ? true : undefined}
              aria-describedby={errors.endDate ? 'tournament-end-error' : undefined}
              className="app-input t-num"
            />
          </Field>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span id={statusLabelId} className={LABEL}>
              Statut
            </span>
            <div role="group" aria-labelledby={statusLabelId} className="flex">
              <SegmentedControl options={STATUS_OPTIONS} value={form.status} onChange={(status) => set({ status })} fullWidthOnMobile />
            </div>
          </div>
        </div>
      </FormCard>

      <FormCard step={2} title="Mode de tournoi et attribution des points" meta="Le mode décide de ce qui est classé : un clan, une équipe ou un joueur.">
        <ChoiceTiles name="tournament-mode" label="Mode de tournoi" options={MODE_OPTIONS} value={form.mode} onChange={(mode) => set({ mode })} />
        {form.mode === 'inter_clan' ? (
          <ChoiceTiles
            name="mixed-squad-rule"
            label="Escouades mixtes"
            options={MIXED_SQUAD_RULE_DESCRIPTIONS}
            value={form.mixedSquadRule}
            onChange={(mixedSquadRule) => set({ mixedSquadRule })}
          />
        ) : null}
      </FormCard>

      <FormCard step={3} title="Format et filtres PUBG" meta="Seules les manches correspondant à ces filtres entrent dans le classement.">
        <div className="flex flex-col gap-3">
          <CompactTiles name="tournament-game-mode" label="Mode de jeu" options={TOURNAMENT_GAME_MODE_OPTIONS} value={form.gameMode} onChange={(gameMode) => set({ gameMode })} />
          <div className="sm:max-w-xs">
            <MenuField id="tournament-map" label="Carte" options={TOURNAMENT_MAP_OPTIONS} value={form.mapName} onChange={(mapName) => set({ mapName })} />
          </div>
          <p className="t-meta">
            Les parties personnalisées utilisent des modes dédiés (« Squad (partie perso) »). Laissez « Tous les modes » si vous
            n’êtes pas sûr : un filtre trop strict ne retiendrait aucune manche.
          </p>
        </div>
      </FormCard>

      <FormCard step={4} title="Barème de points" meta="Points par place, par kill, bonus de victoire et manches retenues.">
        <ol className="grid grid-cols-5 gap-2 lg:grid-cols-10" aria-label="Points par place">
          {Object.keys(DEFAULT_PLACEMENT_POINTS).map((placement) => (
            <li key={placement} className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`tournament-placement-${placement}`} className={LABEL}>
                Top {placement}
              </label>
              <input
                id={`tournament-placement-${placement}`}
                type="number"
                inputMode="numeric"
                min={0}
                value={form.placementPoints[placement] ?? 0}
                onChange={(event) => set({ placementPoints: { ...form.placementPoints, [placement]: Number(event.target.value) } })}
                className="app-input t-num px-2"
              />
            </li>
          ))}
        </ol>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Points par kill" htmlFor="tournament-kill-points">
            <input
              id="tournament-kill-points"
              type="number"
              inputMode="numeric"
              min={0}
              value={form.killPoints}
              onChange={(event) => set({ killPoints: Number(event.target.value) })}
              className="app-input t-num"
            />
          </Field>
          <Field label="Bonus de victoire" htmlFor="tournament-win-bonus">
            <input
              id="tournament-win-bonus"
              type="number"
              inputMode="numeric"
              min={0}
              value={form.winBonus}
              onChange={(event) => set({ winBonus: Number(event.target.value) })}
              className="app-input t-num"
            />
          </Field>
          <Field label="Meilleures manches retenues" htmlFor="tournament-best-of" hint="Vide : toutes les manches comptent.">
            <input
              id="tournament-best-of"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.bestOfRounds ?? ''}
              placeholder="Toutes"
              onChange={(event) => set({ bestOfRounds: event.target.value ? Number(event.target.value) : null })}
              className="app-input t-num"
            />
          </Field>
        </div>
      </FormCard>

      <FormCard step={5} title="Diffusion Discord" meta="Laisser vide pour utiliser le webhook du clan configuré dans les paramètres Discord.">
        <Field label="Webhook dédié à ce tournoi" htmlFor="tournament-webhook">
          <input
            id="tournament-webhook"
            type="url"
            value={form.discordWebhookUrl}
            onChange={(event) => set({ discordWebhookUrl: event.target.value })}
            placeholder="https://discord.com/api/webhooks/…"
            className="app-input"
          />
        </Field>
      </FormCard>

      {submitError ? <AdminAlert tone="neg">{submitError}</AdminAlert> : null}

      <div className="flex flex-wrap justify-end gap-3">
        {editing ? (
          <button type="button" onClick={onCancelEdit} className="app-btn app-btn--md app-btn--secondary">
            Annuler la modification
          </button>
        ) : null}
        <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary gap-1.5">
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Créer le tournoi'}
        </button>
      </div>
    </form>
  )
}
