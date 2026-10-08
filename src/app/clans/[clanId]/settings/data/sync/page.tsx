'use client'

import { Check, HardDriveDownload, ListPlus, RefreshCw, Terminal, Workflow, X, type LucideIcon } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useState } from 'react'

import DataSectionHeader from '@/components/clan-settings/DataSectionHeader'

/**
 * Synchronisation manuelle de la télémétrie de parties choisies (onglet de « Données », SuperUser seul), selon la
 * charte UI (docs/ui/index.html) : trois modes — mise en file pour le worker, capture des fichiers seule, traitement des
 * fichiers capturés — puis exécution. Les identifiants sont ceux des parties du clan (`squadMatchId`).
 */

type SyncMode = 'direct' | 'capture' | 'queue'

type ModeDefinition = {
  mode: SyncMode
  title: string
  pill: string
  description: string
  points: string[]
  next: string
  icon: LucideIcon
  action: string
  busy: string
}

const MODES: ModeDefinition[] = [
  {
    mode: 'direct',
    title: 'Mise en file directe',
    pill: 'Worker',
    description: 'Met les parties en file pour le worker de télémétrie, qui télécharge et traite en arrière-plan.',
    points: ['Ne bloque pas le site, quelle que soit la taille', 'Aucun fichier local', 'Agrégats recalculés après succès'],
    next: 'Recommandé dans la plupart des cas',
    icon: Workflow,
    action: 'Mettre en file',
    busy: 'Mise en file…',
  },
  {
    mode: 'capture',
    title: 'Capture seule',
    pill: 'Stockage',
    description: 'Télécharge et conserve les fichiers de télémétrie, sans les traiter.',
    points: ['Fichiers conservés au-delà des 14 jours du CDN PUBG', 'Traitement rejouable à tout moment'],
    next: 'Ensuite : « Traiter les fichiers capturés »',
    icon: HardDriveDownload,
    action: 'Capturer les fichiers',
    busy: 'Capture en cours…',
  },
  {
    mode: 'queue',
    title: 'Traiter les fichiers capturés',
    pill: 'Worker',
    description: 'Met en file le traitement des fichiers déjà capturés, repris par le worker.',
    points: ['Ne bloque pas le site', 'Reprise automatique en cas d’arrêt'],
    next: 'Prérequis : fichiers capturés',
    icon: RefreshCw,
    action: 'Mettre en file le traitement',
    busy: 'Mise en file…',
  },
]

const SELECTED_TILE_STYLE = {
  borderColor: 'var(--theme-ui-accent-ring)',
  backgroundColor: 'var(--theme-ui-accent-soft)',
  boxShadow: '0 0 0 1px var(--theme-ui-accent-ring)',
}

/** Plusieurs identifiants collés d'un coup : séparés par des espaces, virgules, points-virgules ou retours à la ligne. */
function parseIds(raw: string) {
  return raw
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function StepTitle({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="t-label">Étape {step}</span>
      <h2 className="t-section-title m-0">{children}</h2>
    </div>
  )
}

export default function TelemetrySyncPage() {
  const params = useParams()
  const clanId = typeof params.clanId === 'string' ? params.clanId : ''

  const [squadMatchIds, setSquadMatchIds] = useState<string[]>([])
  const [matchInput, setMatchInput] = useState('')
  const [syncMode, setSyncMode] = useState<SyncMode>('direct')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState('')
  const [resetBefore, setResetBefore] = useState(false)
  const [recalcAgg, setRecalcAgg] = useState(true)

  const current = MODES.find((definition) => definition.mode === syncMode) ?? MODES[0]

  function addMatches() {
    const ids = parseIds(matchInput)
    if (ids.length === 0) return
    setSquadMatchIds((existing) => [...new Set([...existing, ...ids])])
    setMatchInput('')
  }

  async function call(url: string, init?: RequestInit) {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch(url, init)
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) {
        setError(data?.error || `Erreur HTTP ${response.status}`)
        return
      }
      setResult(data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  function run() {
    if (squadMatchIds.length === 0) {
      setError('Ajoutez au moins une partie.')
      return
    }
    const post = (path: string, body: unknown) =>
      call(`/api/clans/${clanId}/telemetry/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    if (syncMode === 'direct') return void post('sync-selected-enqueue', { squadMatchIds })
    if (syncMode === 'capture') return void post('fetch-files-selected', { squadMatchIds })
    return void post('sync-batch-manual', {
      squadMatchIds,
      resetBeforeSync: resetBefore,
      recalculateAggregates: recalcAgg,
      batchLabel: `Batch ${new Date().toISOString().split('T')[0]}`,
    })
  }

  if (!clanId) return null

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <DataSectionHeader
        clanId={clanId}
        title="Synchronisation"
        subtitle="Récupération manuelle de la télémétrie de parties choisies : mise en file, capture ou traitement des fichiers."
        icon={RefreshCw}
        currentHref={`/clans/${clanId}/settings/data/sync`}
        pills={squadMatchIds.length > 0 ? [<><span className="t-num">{squadMatchIds.length}</span> partie(s) choisie(s)</>] : []}
      />

      <section className="app-panel flex flex-col gap-3 p-4 sm:p-5" aria-label="Étape 1 : parties">
        <StepTitle step={1}>Choisir les parties</StepTitle>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            aria-label="Identifiants de parties"
            placeholder="Identifiant de partie (squadMatchId), un ou plusieurs"
            value={matchInput}
            onChange={(event) => setMatchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') addMatches()
            }}
            className="app-input min-w-0 flex-1 basis-[240px]"
          />
          <button type="button" onClick={addMatches} className="app-btn app-btn--md app-btn--secondary gap-2">
            <ListPlus className="h-4 w-4" aria-hidden="true" />
            Ajouter
          </button>
        </div>
        {squadMatchIds.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="t-meta">
                <span className="t-num">{squadMatchIds.length}</span> partie(s) choisie(s)
              </span>
              <button type="button" onClick={() => setSquadMatchIds([])} className="app-link text-xs font-semibold">
                Vider la sélection
              </button>
            </div>
            <ul className="m-0 flex max-h-44 list-none flex-col gap-1 overflow-y-auto p-0">
              {squadMatchIds.map((id) => (
                <li key={id} className="app-panel-muted flex items-center justify-between gap-2 px-3 py-1.5">
                  <code className="min-w-0 truncate text-xs">{id}</code>
                  <button
                    type="button"
                    onClick={() => setSquadMatchIds((existing) => existing.filter((value) => value !== id))}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                    aria-label={`Retirer ${id}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2.5" aria-label="Étape 2 : mode">
        <StepTitle step={2}>Choisir le mode</StepTitle>
        <div className="grid gap-2.5 md:grid-cols-3" role="radiogroup" aria-label="Mode de récupération">
          {MODES.map((definition) => {
            const selected = definition.mode === syncMode
            const Icon = definition.icon
            return (
              <button
                key={definition.mode}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setSyncMode(definition.mode)}
                // Teinte de la tuile choisie en style : les utilitaires perdent contre le fond de `.app-panel`.
                className={`app-panel flex flex-col gap-2 p-3.5 text-left transition-colors ${selected ? '' : 'hover:bg-gray-50'}`}
                style={selected ? SELECTED_TILE_STYLE : undefined}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Icon
                      className={`h-[18px] w-[18px] shrink-0 ${selected ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-500'}`}
                      aria-hidden="true"
                    />
                    <span className="t-card-title">{definition.title}</span>
                  </span>
                  <span className="app-meta-pill shrink-0">{definition.pill}</span>
                </span>
                <span className="t-meta">{definition.description}</span>
                <span className="flex flex-col gap-1">
                  {definition.points.map((point) => (
                    <span key={point} className="t-meta flex items-start gap-1.5">
                      <Check className="t-pos mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {point}
                    </span>
                  ))}
                </span>
                <span className="t-meta mt-auto font-semibold">{definition.next}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="app-panel flex flex-col gap-3 p-4 sm:p-5" aria-label="Étapes 3 et 4 : options et exécution">
        <StepTitle step={3}>Options et exécution</StepTitle>
        {syncMode === 'queue' ? (
          <div className="flex flex-col gap-2">
            <label className="t-body flex items-center gap-2 text-gray-900">
              <input
                type="checkbox"
                checked={resetBefore}
                onChange={(event) => setResetBefore(event.target.checked)}
                className="h-4 w-4 accent-[var(--theme-ui-accent)]"
              />
              Effacer la télémétrie existante avant le traitement
            </label>
            <label className="t-body flex items-center gap-2 text-gray-900">
              <input
                type="checkbox"
                checked={recalcAgg}
                onChange={(event) => setRecalcAgg(event.target.checked)}
                className="h-4 w-4 accent-[var(--theme-ui-accent)]"
              />
              Recalculer les agrégats après le traitement
            </label>
          </div>
        ) : (
          <p className="t-meta m-0">
            {syncMode === 'direct'
              ? 'Aucune option : la mise en file recalcule elle-même les agrégats après succès.'
              : 'Les fichiers sont conservés dans le dossier de capture du serveur (.telemetry-captured/).'}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={run}
            disabled={loading || squadMatchIds.length === 0}
            className="app-btn app-btn--md app-btn--primary gap-2"
          >
            <current.icon className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`} aria-hidden="true" />
            {loading ? current.busy : current.action}
          </button>
          <button
            type="button"
            onClick={() => void call(`/api/clans/${clanId}/telemetry/sync-batch-manual`, { cache: 'no-store' })}
            disabled={loading}
            className="app-btn app-btn--md app-btn--secondary"
          >
            Vérifier l’état de la file
          </button>
        </div>
        {error ? (
          <p className="t-body t-neg m-0 whitespace-pre-wrap" role="alert">
            {error}
          </p>
        ) : null}
        {result ? (
          <div className="flex flex-col gap-1.5">
            <span className="t-label t-pos">Réponse du serveur</span>
            <pre className="app-panel-muted m-0 max-h-96 overflow-auto p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </section>

      <section className="app-panel-muted flex flex-col gap-2 px-3.5 py-3" aria-label="Ligne de commande">
        <p className="t-body m-0 flex items-center gap-2 font-semibold text-gray-900">
          <Terminal className="h-4 w-4 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
          En ligne de commande
        </p>
        <p className="t-meta m-0">Tout le clan en une commande (capture, file et worker) :</p>
        <pre className="app-panel m-0 overflow-auto p-2.5 text-xs">{`npm run telemetry:batch -- --clan ${clanId} --all-matches
npm run telemetry:batch -- --check`}</pre>
      </section>
    </div>
  )
}
