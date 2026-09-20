'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react'

import SegmentedControl from '@/components/ui/SegmentedControl'

/**
 * Page SuperUser unique « Cycle de vie des clans » — chantier 5.
 *
 * Cinq onglets pour une seule thématique : mutations, clans en attente, parking,
 * paramètres et santé. Le regroupement comble aussi un trou fonctionnel — aucune
 * page ne permettait jusqu'ici de valider un clan en attente.
 */

type TabKey = 'mutations' | 'pending' | 'ungrouped' | 'settings' | 'health'

type Settings = {
  mode: 'observe' | 'apply'
  confirmationsRequired: number
  maxMovesRatioPercent: number
  archiveAfterDays: number
  autoArchive: boolean
  autoPromote: boolean
  webhookUrl: string | null
}

type Counters = {
  unacknowledged: number
  observed: number
  pending: number
  pendingClans: number
  ungroupedMembers: number
  archiveCandidates: number
}

type Run = {
  id: string
  status: string
  mode: string
  startedAt: string
  durationMs: number | null
  membersScanned: number
  apiCalls: number
  statesUnknown: number
  discrepanciesFound: number
  awaitingConfirmation: number
  movementsPlanned: number
  movementsApplied: number
  circuitBreakerTripped: boolean
  movesRatioPercent: number | null
}

type Overview = {
  settings: Settings
  health: { lastRun: Run | null; recentRuns: Run[]; ungroupedDailyApiCalls: number }
  counters: Counters
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
      {count}
    </span>
  )
}

export default function ClanLifecyclePage() {
  const [tab, setTab] = useState<TabKey>('mutations')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [toast, setToast] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadOverview() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch('/api/settings/clan-lifecycle', {
          cache: 'no-store',
          signal: controller.signal,
        })

        if (res.status === 403) throw new Error('Accès réservé au SuperUser.')
        if (!res.ok) throw new Error('Impossible de charger la page.')

        const data = (await res.json()) as Overview
        if (!cancelled) setOverview(data)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadOverview()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [refreshToken])

  function refresh() {
    setRefreshToken((token) => token + 1)
  }

  function showToast(text: string, tone: 'success' | 'error') {
    setToast({ text, tone })
    window.setTimeout(() => setToast(null), 5000)
  }

  const counters = overview?.counters

  const tabs: Array<{ value: TabKey; label: string }> = [
    { value: 'mutations', label: 'Mutations' },
    { value: 'pending', label: 'Clans en attente' },
    { value: 'ungrouped', label: 'Ungrouped' },
    { value: 'settings', label: 'Paramètres' },
    { value: 'health', label: 'Santé' },
  ]

  return (
    <main className="app-container app-main">
      <div className="mb-6">
        <Link
          href="/settings/superuser"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Espace SuperUser
        </Link>
      </div>

      <div className="app-panel rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-slate-900 dark:text-white">
              Cycle de vie des clans
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Détection des changements d’appartenance, validation des clans découverts, parking des
              joueurs sans clan, et réglages de l’automatisation.
            </p>
          </div>
        </div>

        {overview ? (
          <div
            className={`mt-4 rounded-xl border p-3 text-sm ${
              overview.settings.mode === 'apply'
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200'
                : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300'
            }`}
          >
            {overview.settings.mode === 'apply' ? (
              <>
                <strong>Mode application.</strong> Les mouvements confirmés sont appliqués
                automatiquement, sans validation.
              </>
            ) : (
              <>
                <strong>Mode observation.</strong> Les écarts sont journalisés mais{' '}
                <strong>aucun membre n’est déplacé</strong>, quel que soit le nombre de
                confirmations atteint.
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <SegmentedControl
          options={tabs}
          value={tab}
          onChange={setTab}
          size="sm"
          wrap
          fullWidthOnMobile
        />
        {counters ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {counters.unacknowledged} mouvement(s) non acquitté(s)
            <Badge count={counters.unacknowledged} /> · {counters.pendingClans} clan(s) en attente
            <Badge count={counters.pendingClans} /> · {counters.ungroupedMembers} joueur(s) au
            parking, dont {counters.archiveCandidates} archivable(s)
            <Badge count={counters.archiveCandidates} />
          </p>
        ) : null}
      </div>

      {toast ? (
        <div
          className={`mt-4 rounded-xl border p-3 text-sm ${
            toast.tone === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-200'
              : 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/30 dark:text-rose-200'
          }`}
        >
          {toast.text}
        </div>
      ) : null}

      <div className="app-panel mt-4 rounded-2xl p-6">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Chargement…
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" aria-hidden="true" />
            <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
            <button type="button" onClick={refresh} className="app-btn app-btn--md app-btn--secondary mt-4">
              Réessayer
            </button>
          </div>
        ) : !overview ? null : tab === 'settings' ? (
          <SettingsTab settings={overview.settings} onSaved={refresh} onToast={showToast} />
        ) : tab === 'health' ? (
          <HealthTab health={overview.health} />
        ) : tab === 'ungrouped' ? (
          <UngroupedTab onChanged={refresh} onToast={showToast} />
        ) : tab === 'pending' ? (
          <PendingClansTab onChanged={refresh} onToast={showToast} />
        ) : (
          <MutationsTab onChanged={refresh} onToast={showToast} />
        )}
      </div>
    </main>
  )
}

// ---------------------------------------------------------------- Paramètres

function SettingsTab({
  settings,
  onSaved,
  onToast,
}: {
  settings: Settings
  onSaved: () => void
  onToast: (text: string, tone: 'success' | 'error') => void
}) {
  const [draft, setDraft] = useState(settings)
  const [webhookInput, setWebhookInput] = useState('')
  const [saving, setSaving] = useState(false)

  async function save(patch: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/clan-lifecycle', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Échec de l’enregistrement')
      onToast('Réglage enregistré.', 'success')
      onSaved()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erreur inconnue', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="app-panel-muted rounded-xl p-4">
        <p className="text-sm font-bold text-slate-900 dark:text-white">Mode d’exécution</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          En <strong>observation</strong>, les écarts sont journalisés sans qu’aucun membre ne soit
          déplacé. Passer en <strong>application</strong> est la seule décision qui engage : relisez
          les mouvements confirmés avant de basculer.
        </p>
        <div className="mt-3">
          <SegmentedControl
            options={[
              { value: 'observe', label: 'Observation' },
              { value: 'apply', label: 'Application' },
            ]}
            value={draft.mode}
            onChange={(mode) => {
              setDraft((d) => ({ ...d, mode }))
              void save({ mode })
            }}
            size="sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label="Confirmations exigées"
          hint="Passages quotidiens concordants avant d’agir. Mesuré le 2026-09-20 : 2 aurait déclenché à tort."
          value={draft.confirmationsRequired}
          min={1}
          max={10}
          disabled={saving}
          onCommit={(confirmationsRequired) => {
            setDraft((d) => ({ ...d, confirmationsRequired }))
            void save({ confirmationsRequired })
          }}
        />
        <NumberField
          label="Coupe-circuit (% de l’effectif)"
          hint="Au-delà, le passage s’abandonne sans rien appliquer."
          value={draft.maxMovesRatioPercent}
          min={1}
          max={100}
          disabled={saving}
          onCommit={(maxMovesRatioPercent) => {
            setDraft((d) => ({ ...d, maxMovesRatioPercent }))
            void save({ maxMovesRatioPercent })
          }}
        />
        <NumberField
          label="Archivage du parking (jours)"
          hint="Inactivité au-delà de laquelle un joueur du parking devient archivable."
          value={draft.archiveAfterDays}
          min={1}
          max={3650}
          disabled={saving}
          onCommit={(archiveAfterDays) => {
            setDraft((d) => ({ ...d, archiveAfterDays }))
            void save({ archiveAfterDays })
          }}
        />
      </div>

      <ToggleField
        label="Promotion automatique depuis le parking"
        hint="Sort un joueur du parking dès que son clan est détecté, si ce clan est déjà suivi."
        value={draft.autoPromote}
        onChange={(autoPromote) => {
          setDraft((d) => ({ ...d, autoPromote }))
          void save({ autoPromote })
        }}
      />
      <ToggleField
        label="Archivage automatique du parking"
        hint="Archive sans validation au-delà du seuil. Désactivé, le cron se contente de marquer les candidats."
        value={draft.autoArchive}
        onChange={(autoArchive) => {
          setDraft((d) => ({ ...d, autoArchive }))
          void save({ autoArchive })
        }}
      />

      <div className="app-panel-muted rounded-xl p-4">
        <p className="text-sm font-bold text-slate-900 dark:text-white">
          Salon Discord d’administration
        </p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          Reçoit chaque mouvement automatique. Laisser vide coupe les notifications — ce n’est pas
          une erreur. Webhook global, distinct de celui de chaque clan.
        </p>
        <p className="mt-2 text-xs font-mono text-slate-500 dark:text-slate-400">
          Actuel : {settings.webhookUrl ?? 'non configuré'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="url"
            value={webhookInput}
            onChange={(e) => setWebhookInput(e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void save({ webhookUrl: webhookInput })}
            className="app-btn app-btn--md app-btn--primary inline-flex items-center gap-2"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  disabled?: boolean
  onCommit: (value: number) => void
}) {
  const [local, setLocal] = useState(String(value))

  return (
    <div className="app-panel-muted rounded-xl p-4">
      <label className="text-sm font-bold text-slate-900 dark:text-white">{label}</label>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{hint}</p>
      <div className="mt-2 flex gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={local}
          disabled={disabled}
          onChange={(e) => setLocal(e.target.value)}
          className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
        />
        <button
          type="button"
          disabled={disabled || Number(local) === value}
          onClick={() => onCommit(Number(local))}
          className="app-btn app-btn--md app-btn--secondary disabled:opacity-40"
        >
          Appliquer
        </button>
      </div>
    </div>
  )
}

function ToggleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint: string
  value: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="app-panel-muted flex items-start justify-between gap-4 rounded-xl p-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900 dark:text-white">{label}</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{hint}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        aria-pressed={value}
        className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
          value
            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {value ? 'Activé' : 'Désactivé'}
      </button>
    </div>
  )
}

// --------------------------------------------------------------------- Santé

function HealthTab({ health }: { health: Overview['health'] }) {
  const { lastRun, recentRuns, ungroupedDailyApiCalls } = health

  return (
    <div className="space-y-5">
      <div className="app-panel-muted rounded-xl p-4">
        <p className="text-sm font-bold text-slate-900 dark:text-white">Dernier passage</p>
        {lastRun ? (
          <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <Stat label="Statut" value={lastRun.status} />
            <Stat label="Mode" value={lastRun.mode} />
            <Stat label="Membres" value={String(lastRun.membersScanned)} />
            <Stat label="Appels PUBG" value={String(lastRun.apiCalls)} />
            <Stat label="Écarts" value={String(lastRun.discrepanciesFound)} />
            <Stat label="En attente" value={String(lastRun.awaitingConfirmation)} />
            <Stat label="Appliqués" value={String(lastRun.movementsApplied)} />
            <Stat label="États indéterminés" value={String(lastRun.statesUnknown)} />
          </dl>
        ) : (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Aucun passage enregistré.</p>
        )}
      </div>

      <div className="app-panel-muted rounded-xl p-4">
        <p className="text-sm font-bold text-slate-900 dark:text-white">Coût quotidien du parking</p>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
          <strong>{ungroupedDailyApiCalls}</strong> appel(s) PUBG par jour, un par joueur au parking,
          en plus de leur synchronisation de matchs. C’est ce que l’archivage réduit.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Derniers passages
        </p>
        <ul className="space-y-2">
          {recentRuns.map((run) => (
            <li
              key={run.id}
              className="app-panel-muted flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-3 text-xs"
            >
              {run.circuitBreakerTripped ? (
                <AlertTriangle className="h-4 w-4 text-rose-500" aria-hidden="true" />
              ) : run.status === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              ) : (
                <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
              )}
              <span className="font-semibold text-slate-900 dark:text-white">{run.status}</span>
              <span className="text-slate-500 dark:text-slate-400">{run.mode}</span>
              <span className="text-slate-500 dark:text-slate-400">
                {run.membersScanned} membres · {run.apiCalls} appels · {run.movementsApplied} appliqué(s)
              </span>
              <span className="ml-auto text-slate-400">{formatDate(run.startedAt)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="font-bold text-slate-900 dark:text-white">{value}</dd>
    </div>
  )
}

// ------------------------------------------------------------------ Ungrouped

type UngroupedMember = {
  memberId: number
  displayName: string
  lastMatchAt: string | null
  inactiveDays: number | null
  eligibleAt: string | null
  isCandidate: boolean
}

function UngroupedTab({
  onChanged,
  onToast,
}: {
  onChanged: () => void
  onToast: (text: string, tone: 'success' | 'error') => void
}) {
  const [members, setMembers] = useState<UngroupedMember[]>([])
  const [thresholdDays, setThresholdDays] = useState(90)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const res = await fetch('/api/settings/clan-lifecycle/ungrouped', { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled && res.ok) {
          setMembers(data.members ?? [])
          setThresholdDays(data.thresholdDays ?? 90)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  const candidates = members.filter((m) => m.isCandidate)

  async function archiveAll() {
    setBusy(true)
    try {
      const res = await fetch('/api/settings/clan-lifecycle/ungrouped', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'archive', memberIds: candidates.map((c) => c.memberId) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Échec')
      onToast(data.message, 'success')
      setToken((t) => t + 1)
      onChanged()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {members.length} joueur(s) au parking · <strong>{candidates.length}</strong> archivable(s)
          au-delà de {thresholdDays} jours
        </p>
        {candidates.length > 0 ? (
          <button
            type="button"
            onClick={() => void archiveAll()}
            disabled={busy}
            className="app-btn app-btn--md inline-flex items-center gap-2 bg-amber-600 font-bold text-white hover:bg-amber-500"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Archiver les {candidates.length} candidat(s)
          </button>
        ) : null}
      </div>

      {members.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Le parking est vide.
        </p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.memberId}
              className="app-panel-muted flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-3 text-sm"
            >
              <span className="font-semibold text-slate-900 dark:text-white">
                {member.displayName}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {member.inactiveDays === null
                  ? 'aucun match connu'
                  : `${member.inactiveDays} j d’inactivité`}
              </span>
              <span className="ml-auto text-xs text-slate-400">
                {member.isCandidate ? (
                  <span className="rounded-md bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    archivable
                  </span>
                ) : (
                  `éligible le ${formatDate(member.eligibleAt)}`
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ------------------------------------------------------------ Clans en attente

type PendingClan = { id: number; name: string; tag: string; platformShard: string; isActive: boolean }

function PendingClansTab({
  onChanged,
  onToast,
}: {
  onChanged: () => void
  onToast: (text: string, tone: 'success' | 'error') => void
}) {
  const [clans, setClans] = useState<PendingClan[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [token, setToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const res = await fetch('/api/clans?all=true', { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled && res.ok && Array.isArray(data)) {
          setClans(data.filter((c: PendingClan) => !c.isActive))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [token])

  async function approve(clanId: number) {
    setBusyId(clanId)
    try {
      const res = await fetch(`/api/clans/${clanId}/approve`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Échec de la validation')
      onToast(data.message, 'success')
      setToken((t) => t + 1)
      onChanged()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
      </div>
    )
  }

  if (clans.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Aucun clan en attente de validation.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {clans.map((clan) => (
        <li
          key={clan.id}
          className="app-panel-muted flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm"
        >
          <span className="font-semibold text-slate-900 dark:text-white">
            [{clan.tag}] {clan.name}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{clan.platformShard}</span>
          <button
            type="button"
            onClick={() => void approve(clan.id)}
            disabled={busyId === clan.id}
            className="app-btn app-btn--md ml-auto inline-flex items-center gap-2 bg-emerald-600 font-bold text-white hover:bg-emerald-500"
          >
            {busyId === clan.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Valider
          </button>
        </li>
      ))}
    </ul>
  )
}

// ----------------------------------------------------------------- Mutations

type LifecycleMutation = {
  id: string
  source: string
  status: string
  detectedAt: string
  acknowledgedAt: string | null
  clanMember: { id: number; displayName: string } | null
  previousClan: { tag: string | null } | null
  newClan: { tag: string | null } | null
}

function MutationsTab({
  onChanged,
  onToast,
}: {
  onChanged: () => void
  onToast: (text: string, tone: 'success' | 'error') => void
}) {
  const [mutations, setMutations] = useState<LifecycleMutation[]>([])
  const [status, setStatus] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [token, setToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const query = status === 'all' ? '' : `?status=${status}`
        const res = await fetch(`/api/settings/clan-lifecycle/mutations${query}`, {
          cache: 'no-store',
        })
        const data = await res.json()
        if (!cancelled && res.ok) setMutations(data.mutations ?? [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [status, token])

  async function act(changeId: string, action: 'revert' | 'acknowledge') {
    setBusyId(changeId)
    try {
      const res = await fetch('/api/settings/clan-lifecycle/mutations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, changeId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Échec')
      onToast(data.message, 'success')
      setToken((t) => t + 1)
      onChanged()
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erreur', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="mb-4">
        <SegmentedControl
          options={[
            { value: 'all', label: 'Tous' },
            { value: 'applied', label: 'Appliqués' },
            { value: 'observed', label: 'En cours de confirmation' },
            { value: 'pending', label: 'En attente de clan' },
            { value: 'reverted', label: 'Annulés' },
          ]}
          value={status}
          onChange={setStatus}
          size="xs"
          wrap
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Chargement…
        </div>
      ) : mutations.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Aucun événement pour ce filtre.
        </p>
      ) : (
        <ul className="space-y-2">
          {mutations.map((mutation) => (
            <li
              key={mutation.id}
              className="app-panel-muted flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl p-3 text-sm"
            >
              <span className="font-semibold text-slate-900 dark:text-white">
                {mutation.clanMember?.displayName ?? '—'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                [{mutation.previousClan?.tag ?? '—'}] → [{mutation.newClan?.tag ?? '—'}]
              </span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {mutation.source}
              </span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {mutation.status}
              </span>
              <span className="text-xs text-slate-400">{formatDate(mutation.detectedAt)}</span>

              <div className="ml-auto flex gap-2">
                {mutation.status === 'applied' ? (
                  <button
                    type="button"
                    onClick={() => void act(mutation.id, 'revert')}
                    disabled={busyId === mutation.id}
                    title="Replacer le membre dans son clan précédent"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Annuler
                  </button>
                ) : null}
                {mutation.acknowledgedAt === null && mutation.status === 'applied' ? (
                  <button
                    type="button"
                    onClick={() => void act(mutation.id, 'acknowledge')}
                    disabled={busyId === mutation.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Acquitter
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
