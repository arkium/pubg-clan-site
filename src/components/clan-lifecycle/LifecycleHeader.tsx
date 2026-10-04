'use client'

import { Archive, ArrowRightLeft, Eye, HeartPulse, Hourglass, ShieldAlert, ShieldCheck, SlidersHorizontal, SquareParking, type LucideIcon } from 'lucide-react'
import { useRef } from 'react'

import { Callout, ChoiceMenu, CountPill, plural, type LifecycleCounters, type LifecycleSettings } from '@/components/clan-lifecycle/LifecycleShared'

/**
 * En-tête de la page « Cycle de vie des clans » selon la charte UI (docs/ui/index.html) : bandeau photo à titre Teko,
 * onglets en tuiles (menu sur mobile), compteurs et rappel du mode d'exécution.
 */

export type LifecycleTab = 'mutations' | 'pending' | 'archived' | 'ungrouped' | 'settings' | 'health'

export const LIFECYCLE_TABS: Array<{ value: LifecycleTab; label: string; short: string; icon: LucideIcon }> = [
  { value: 'mutations', label: 'Mutations', short: 'Mutations', icon: ArrowRightLeft },
  { value: 'pending', label: 'Clans en attente', short: 'En attente', icon: Hourglass },
  { value: 'archived', label: 'Clans archivés', short: 'Archivés', icon: Archive },
  // Valeur `ungrouped` gardée pour les liens profonds (`?tab=ungrouped`, annuaire des joueurs) ; libellé lisible.
  { value: 'ungrouped', label: 'Parking', short: 'Parking', icon: SquareParking },
  { value: 'settings', label: 'Paramètres', short: 'Réglages', icon: SlidersHorizontal },
  { value: 'health', label: 'Santé', short: 'Santé', icon: HeartPulse },
]

export function parseLifecycleTab(value: string | null): LifecycleTab {
  return LIFECYCLE_TABS.find((tab) => tab.value === value)?.value ?? 'mutations'
}

/** Compteur de l'onglet ; orange quand il appelle une action (relecture, validation, archivage). */
function tabCounter(tab: LifecycleTab, counters: LifecycleCounters | undefined): { count: number; actionable: boolean } | null {
  if (!counters) return null
  const entry =
    tab === 'mutations'
      ? { count: counters.unacknowledged, actionable: true }
      : tab === 'pending'
        ? { count: counters.pendingClans, actionable: true }
        : tab === 'archived'
          ? { count: counters.archivedClans, actionable: false }
          : tab === 'ungrouped'
            ? { count: counters.archiveCandidates, actionable: true }
            : null
  return entry && entry.count > 0 ? entry : null
}

function tabCount(tab: LifecycleTab, counters: LifecycleCounters | undefined) {
  const counter = tabCounter(tab, counters)
  return counter ? <CountPill count={counter.count} actionable={counter.actionable} /> : null
}

/** Nom accessible complet, même quand la tuile n'affiche que le libellé court. */
function tabName(tab: (typeof LIFECYCLE_TABS)[number], counters: LifecycleCounters | undefined) {
  const counter = tabCounter(tab.value, counters)
  return counter ? `${tab.label} (${counter.count})` : tab.label
}

export const tabId = (tab: LifecycleTab) => `lifecycle-tab-${tab}`
export const panelId = (tab: LifecycleTab) => `lifecycle-panel-${tab}`

export function LifecycleBanner({ settings }: { settings: LifecycleSettings | null }) {
  return (
    // Bandeau d'image (charte, en-têtes) : photo liée au sujet — une escouade, donc un clan —, titre Teko et icône à l'accent.
    <header
      className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
      style={{ backgroundImage: `url('/clan_banner%202.jpg')`, backgroundPosition: 'center 30%' }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
          <h1 className="t-banner-title text-white drop-shadow-md">Cycle de vie des clans</h1>
        </div>
        <p className="text-[13px] text-white/80 drop-shadow-md">
          Changements d’appartenance, clans découverts à valider, parking des joueurs sans clan et réglages de
          l’automatisation — réservé au SuperUser.
        </p>
        {settings ? (
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-white">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5" data-testid="lifecycle-mode-chip">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: settings.mode === 'apply' ? 'var(--game-warn)' : 'var(--game-sky)' }}
                aria-hidden="true"
              />
              {settings.mode === 'apply' ? 'Mode application' : 'Mode observation'}
            </span>
          </div>
        ) : null}
      </div>
    </header>
  )
}

/** Rappel permanent du mode : observation (information) ou application (décision qui engage). */
export function ModeCallout({ mode }: { mode: LifecycleSettings['mode'] }) {
  return mode === 'apply' ? (
    <Callout tone="warn" icon={ShieldAlert} title="Mode application" testId="lifecycle-mode">
      Les mouvements confirmés sont appliqués automatiquement, sans validation.
    </Callout>
  ) : (
    <Callout tone="sky" icon={Eye} title="Mode observation" testId="lifecycle-mode">
      Les écarts sont journalisés mais <b className="text-gray-900">aucun membre n’est déplacé</b>, quel que soit le
      nombre de confirmations atteint.
    </Callout>
  )
}

/** Compteurs de la page, au repos seulement dans le bandeau (charte : compteurs et notes ne se dockent pas). */
export function CountersLine({ counters }: { counters: LifecycleCounters }) {
  return (
    <p className="t-meta t-num" data-testid="lifecycle-counters">
      {plural(counters.unacknowledged, 'mouvement')} à relire · {plural(counters.pendingClans, 'clan')} en attente ·{' '}
      {plural(counters.archivedClans, 'clan archivé', 'clans archivés')} · {plural(counters.ungroupedMembers, 'joueur')} au
      parking, dont {plural(counters.archiveCandidates, 'archivable', 'archivables')}
    </p>
  )
}

/**
 * Onglets de la page : tuiles du rail segmented (onglets accessibles, flèches gauche / droite) à partir de 640 px —
 * libellés courts jusqu'à 1 280 px et dans le bandeau docké —, menu de la charte en dessous, où six tuiles ne tiendraient pas sur une ligne.
 * Les affichages responsives sont posés sur des enveloppes : les classes globales l'emportent sur les utilitaires.
 */
export function LifecycleTabs({
  value,
  onChange,
  counters,
  short = false,
}: {
  value: LifecycleTab
  onChange: (tab: LifecycleTab) => void
  counters: LifecycleCounters | undefined
  /** Libellés courts à toutes les largeurs : bandeau docké, où le retour du fil d'Ariane prend la tête de la ligne. */
  short?: boolean
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  return (
    <>
      <div className="flex w-full sm:hidden">
        <ChoiceMenu
          label="Section"
          value={value}
          onChange={onChange}
          testId="lifecycle-tab-menu"
          options={LIFECYCLE_TABS.map((tab) => ({ value: tab.value, label: tab.label, icon: tab.icon, count: tabCount(tab.value, counters) }))}
        />
      </div>
      <div className="hidden sm:block">
        <div role="tablist" aria-label="Sections du cycle de vie" className="app-segmented-control inline-flex border border-gray-200">
          {LIFECYCLE_TABS.map((tab, index) => {
            const active = tab.value === value
            const Icon = tab.icon
            return (
              <button
                key={tab.value}
                ref={(node) => {
                  tabRefs.current[index] = node
                }}
                type="button"
                role="tab"
                id={tabId(tab.value)}
                aria-selected={active}
                aria-controls={panelId(tab.value)}
                aria-label={tabName(tab, counters)}
                tabIndex={active ? 0 : -1}
                onClick={() => onChange(tab.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
                  event.preventDefault()
                  const next = (index + (event.key === 'ArrowRight' ? 1 : LIFECYCLE_TABS.length - 1)) % LIFECYCLE_TABS.length
                  onChange(LIFECYCLE_TABS[next].value)
                  tabRefs.current[next]?.focus()
                }}
                className={`app-segmented-control__item app-segmented-control__item--sm inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-colors ${
                  active ? 'app-segmented-control__item--active' : ''
                }`}
              >
                <Icon className="hidden h-3.5 w-3.5 shrink-0 xl:block" aria-hidden="true" />
                {short ? (
                  <span>{tab.short}</span>
                ) : (
                  <>
                    <span className="xl:hidden">{tab.short}</span>
                    <span className="hidden xl:inline">{tab.label}</span>
                  </>
                )}
                {tabCount(tab.value, counters)}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
