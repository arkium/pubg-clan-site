'use client'

import { CheckCircle2, RotateCcw, Save, SlidersHorizontal, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'

import { MatchTypeMenu } from '@/components/clan-league/LeagueSections'
import {
  errorsByField,
  PlacementScaleCard,
  PreviewCard,
  PriorCard,
  ThresholdsCard,
  WeightsCard,
  ZonesCard,
} from '@/components/league-settings/LeagueSettingsSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import ToolbarGroup from '@/components/ui/ToolbarGroup'
import { useAuthSession } from '@/hooks/useAuthSession'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { leagueMatchTypeOption, type LeagueMatchType, type LeagueSettings } from '@/lib/clan-league'
import {
  leagueSettingsChanges,
  sameLeagueSettings,
  validateLeagueSettings,
  type LeaguePreview,
  type LeagueSettingsError,
} from '@/lib/league-settings'
import type { LeagueSettingsState } from '@/lib/league-settings-service'
import { PERIOD_OF_LABELS, STANDARD_PERIODS } from '@/lib/period'

type SettingsResponse = LeagueSettingsState & { defaults: LeagueSettings }

const copy = (settings: LeagueSettings): LeagueSettings => JSON.parse(JSON.stringify(settings)) as LeagueSettings
const DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Délai avant de recalculer l'aperçu après une frappe : un appel par pause, pas par touche. */
const PREVIEW_DELAY_MS = 400

function LeagueSettingsContent() {
  const router = useRouter()
  const { loading: sessionLoading, authenticated, isSuperUser } = useAuthSession()
  // Période et type de l'aperçu : la période suit l'URL comme sur la ligue publique.
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'month')
  const [matchType, setMatchType] = useState<LeagueMatchType>('official')

  const [state, setState] = useState<SettingsResponse | null>(null)
  const [draft, setDraft] = useState<LeagueSettings | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErrors, setSaveErrors] = useState<LeagueSettingsError[]>([])
  const [savedChanges, setSavedChanges] = useState<string[] | null>(null)
  const [preview, setPreview] = useState<LeaguePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (!sessionLoading && !authenticated) router.replace('/login?redirect=/settings/league')
  }, [authenticated, router, sessionLoading])

  useEffect(() => {
    if (sessionLoading || !isSuperUser) return
    let cancelled = false
    fetch('/api/settings/league', { cache: 'no-store' })
      .then(async (response) => {
        const payload = (await response.json()) as SettingsResponse & { error?: string }
        if (cancelled) return
        if (!response.ok) {
          setLoadError(payload.error ?? 'Lecture des réglages impossible')
          return
        }
        setState(payload)
        setDraft(copy(payload.settings))
      })
      .catch(() => {
        if (!cancelled) setLoadError('Lecture des réglages impossible')
      })
    return () => {
      cancelled = true
    }
  }, [isSuperUser, sessionLoading])

  const validation = useMemo(() => (draft ? validateLeagueSettings(draft) : null), [draft])
  const fieldErrors = useMemo(
    () => errorsByField([...(validation && !validation.ok ? validation.errors : []), ...saveErrors]),
    [saveErrors, validation]
  )
  const changes = useMemo(() => (state && draft && validation?.ok ? leagueSettingsChanges(state.settings, validation.settings) : []), [draft, state, validation])
  const dirty = Boolean(state && draft && !sameLeagueSettings(state.settings, draft))

  // Aperçu : recalculé après une pause de frappe, seulement pour un brouillon valide ; l'ancien reste affiché, estompé.
  const previewKey = validation?.ok && ready ? JSON.stringify({ settings: validation.settings, period, matchType }) : null
  useEffect(() => {
    if (!previewKey) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setPreviewLoading(true)
      fetch('/api/settings/league/preview', { method: 'POST', body: previewKey, signal: controller.signal, cache: 'no-store' })
        .then(async (response) => {
          if (response.ok) setPreview((await response.json()) as LeaguePreview)
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false)
        })
    }, PREVIEW_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [previewKey])

  function update(changes: Partial<LeagueSettings>) {
    setDraft((current) => (current ? { ...current, ...changes } : current))
    setSaveErrors([])
    setSavedChanges(null)
  }

  async function save() {
    if (!state || !validation?.ok) return
    setSaving(true)
    setSaveErrors([])
    try {
      const response = await fetch('/api/settings/league', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: validation.settings }),
      })
      const payload = (await response.json()) as SettingsResponse & { error?: string; errors?: LeagueSettingsError[] }
      if (!response.ok) {
        setSaveErrors(payload.errors ?? [{ field: 'settings', message: payload.error ?? 'Enregistrement impossible' }])
        return
      }
      setSavedChanges(changes)
      setState(payload)
      setDraft(copy(payload.settings))
    } catch {
      setSaveErrors([{ field: 'settings', message: 'Enregistrement impossible' }])
    } finally {
      setSaving(false)
    }
  }

  if (sessionLoading || (authenticated && isSuperUser && !state && !loadError)) {
    return (
      <div className="app-container app-gutter">
        <CardSkeleton />
      </div>
    )
  }
  if (!isSuperUser) {
    return (
      <div className="app-container app-gutter">
        <p className="app-panel p-4 text-sm text-gray-700" data-testid="league-settings-forbidden">
          Page réservée au SuperUser : les réglages de la ligue s’appliquent à tous les clans.
        </p>
      </div>
    )
  }
  if (loadError || !state || !draft) {
    return (
      <div className="app-container app-gutter">
        <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{loadError || 'Lecture des réglages impossible'}</p>
      </div>
    )
  }

  const generalError = saveErrors.find((error) => error.field === 'settings')?.message

  return (
    <>
      {/* Bandeau : aperçu (période, type) et brouillon (défaut, annuler, enregistrer). Docké sur mobile : la période seule. */}
      <DockingToolbar ariaLabel="Aperçu et enregistrement des réglages de la ligue">
        {({ isSticky, compact }) => (
          <div className="flex w-full flex-wrap items-end gap-3">
            <ToolbarGroup label="Aperçu sur" showLabel={!isSticky}>
              <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
            </ToolbarGroup>
            {!compact ? (
              <ToolbarGroup label="Type de partie" showLabel={!isSticky} className="self-stretch">
                <div className="flex flex-1">
                  <MatchTypeMenu value={matchType} onChange={setMatchType} />
                </div>
              </ToolbarGroup>
            ) : null}
            {!compact ? (
              <ToolbarGroup label="Brouillon" showLabel={!isSticky} className="ml-auto self-stretch">
                <div className="flex flex-1 flex-wrap items-stretch gap-2">
                  <button type="button" className="app-toolbar-btn" onClick={() => update(copy(state.defaults))} disabled={sameLeagueSettings(draft, state.defaults)}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Valeurs par défaut
                  </button>
                  <button type="button" className="app-toolbar-btn" onClick={() => update(copy(state.settings))} disabled={!dirty}>
                    <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Annuler
                  </button>
                  <button type="button" className="app-btn app-btn--primary app-btn--sm gap-1.5" onClick={() => void save()} disabled={!dirty || !validation?.ok || saving}>
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                    {saving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </ToolbarGroup>
            ) : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-[18px] pb-8">
        <p className="t-meta" data-testid="league-settings-stamp">
          {state.isDefault || !state.updatedAt
            ? 'Réglages par défaut (docs/TODO/score.md) : rien n’a encore été modifié.'
            : `Réglages en vigueur enregistrés le ${DATE.format(new Date(state.updatedAt))}${state.updatedBy ? ` par ${state.updatedBy}` : ''}.`}
        </p>
        {dirty ? (
          <section className="app-panel-muted flex flex-col gap-1.5 px-3.5 py-3" aria-label="Modifications non enregistrées" data-testid="league-settings-dirty">
            <b className="t-warn text-[13px]">
              {changes.length > 0 ? `${changes.length} modification${changes.length > 1 ? 's' : ''} non enregistrée${changes.length > 1 ? 's' : ''}` : 'Modifications à corriger avant d’enregistrer'}
            </b>
            {changes.length > 0 ? (
              <ul className="list-disc pl-5 text-[13px] text-gray-700">
                {changes.map((change) => <li key={change}>{change}</li>)}
              </ul>
            ) : null}
          </section>
        ) : null}
        {savedChanges ? (
          <p className="app-panel-muted t-pos flex items-start gap-2 px-3.5 py-3 text-[13px]" role="status" data-testid="league-settings-saved">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Réglages enregistrés : la Ligue Inter-Clans est recalculée avec ces valeurs ({savedChanges.length} modification{savedChanges.length > 1 ? 's' : ''}).
          </p>
        ) : null}
        {generalError ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{generalError}</p> : null}

        <div className="grid items-start gap-[18px] lg:grid-cols-2">
          <PlacementScaleCard points={draft.placementPoints} errors={fieldErrors} onChange={(placementPoints) => update({ placementPoints })} />
          <WeightsCard settings={draft} errors={fieldErrors} onChange={update} preview={preview} />
          <PriorCard priorMatches={draft.priorMatches} error={fieldErrors.priorMatches} onChange={(priorMatches) => update({ priorMatches })} />
          <ThresholdsCard minMatches={draft.minMatches} errors={fieldErrors} onChange={(minMatches) => update({ minMatches })} />
          <ZonesCard zoneEnd={draft.zoneEnd} titleMinMatches={draft.titleMinMatches} errors={fieldErrors} onChange={update} />
        </div>

        <PreviewCard
          preview={preview}
          loading={previewLoading}
          invalid={!validation?.ok}
          periodLabel={PERIOD_OF_LABELS[period]}
          typeLabel={leagueMatchTypeOption(matchType).label}
        />
      </div>
    </>
  )
}

/**
 * Réglages de la Ligue Inter-Clans — page SuperUser (docs/features/ligue-clans.md §5), selon la charte UI
 * (docs/ui/index.html) : barème de placement, coefficients du score brut, pondération par le volume, seuils de
 * qualification par type et par période, zones et titres. Aperçu du classement avant enregistrement.
 */
export default function LeagueSettingsPage() {
  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Réglages de la ligue"
          currentHref="/settings/league"
          fallbackParent={{ href: '/clans-leaderboard', label: 'Ligue Inter-Clans', altHref: '/clans' }}
        />
        <header
          className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/ClanLeaderboardTable.jpg')`, backgroundPosition: 'center 40%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">Réglages de la ligue</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md">
              Barème, coefficients, pondération et seuils du Power score — appliqués à tous les clans, réservé au SuperUser.
            </p>
          </div>
        </header>
      </div>

      {/* `usePagePeriod` lit `?period=` : une route statique exige cette frontière (CLAUDE.md, piège n° 5). */}
      <Suspense fallback={<div className="app-container app-gutter"><CardSkeleton /></div>}>
        <LeagueSettingsContent />
      </Suspense>
    </div>
  )
}

