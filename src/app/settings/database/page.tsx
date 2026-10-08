'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Database,
  HardDrive,
  Info,
  Layers,
  Loader2,
  MapPinOff,
  RefreshCw,
  ShieldCheck,
  Square,
  Trash2,
  Zap,
} from 'lucide-react'

import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import AdminPageBanner, { BANNER_GLASS_BUTTON } from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, AdminPageLoading, FormFeedback } from '@/components/settings/AdminPageStates'
import { Callout, ConfirmDialog, ListSkeleton, SectionCard, Tag } from '@/components/ui/CharteKit'
import SortableTh from '@/components/ui/SortableTh'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

function formatGo(mb: number | null | undefined) {
  if (mb === null || mb === undefined) return '—'
  return `${(mb / 1024).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Go`
}

function formatMo(mb: number, digits = 1) {
  return mb.toLocaleString('fr-FR', { maximumFractionDigits: digits })
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

type TableStats = {
  tableName: string
  rowCount: number
  dataSizeMb: number
  indexSizeMb: number
  totalSizeMb: number
  dataFreeMb: number
}

type GlobalStats = {
  totalDataMb: number
  totalIndexMb: number
  totalSizeMb: number
  totalFreeMb: number
}

type DbStatsResponse = {
  globalStats: GlobalStats
  tables: TableStats[]
}

/**
 * Instantané de comptage publié par le cron `telemetry_geo_purge_count` (une passe nocturne pour
 * tous les seuils : le scan coûte ~4 min, il n'est pas rejouable au fil des clics). Types
 * volontairement redéclarés ici plutôt qu'importés de `@/lib/telemetry-geo-purge`, qui tire Prisma.
 */
type ThresholdCount = {
  cutoff: string | null
  targeted: number
  protectedMatches: number
  purgeable: number
}

type PurgeCounts = {
  computedAt: string
  durationMs: number
  totalRows: number
  totalWithGeo: number
  protectedMatches: number
  byThreshold: Record<string, ThresholdCount | undefined>
}

type PurgeRun = {
  status: 'running' | 'done' | 'cancelled' | 'failed'
  olderThanDays: number | string
  cutoff: string | null
  target: number
  purged: number
  startedAt: string
  updatedAt: string
  finishedAt?: string
  error?: string
  cancelRequested?: boolean
}

type OptimizeAssessment = {
  table: string
  sizes: TableStats | null
  disk: { measured: boolean; path: string | null; freeMb: number | null; totalMb: number | null; reason?: string }
  requiredMb: number
  verdict: 'useful' | 'pointless' | 'blocked_disk' | 'blocked_unknown_disk' | 'running'
  reason: string
}

type OptimizeRun = {
  status: 'running' | 'done' | 'failed'
  table: string
  startedAt: string
  updatedAt: string
  finishedAt?: string
  reclaimedMb?: number
  sizeBeforeMb?: number
  sizeAfterMb?: number
  error?: string
}

type PurgeStatusResponse = {
  counts: PurgeCounts | null
  run: PurgeRun | null
  recounting: boolean
  totalRows: number
}

const AGE_OPTIONS = [
  { value: '14', label: 'Plus de 14 jours', desc: 'Recommandé : garde tous les tracés récents', badge: 'Standard PUBG' },
  { value: '30', label: 'Plus de 30 jours', desc: 'Garde le dernier mois complet', badge: '1 mois' },
  { value: '60', label: 'Plus de 60 jours', desc: 'Garde les deux derniers mois', badge: '2 mois' },
  { value: '90', label: 'Plus de 90 jours', desc: 'Garde le dernier trimestre', badge: '1 trimestre' },
  { value: 'all', label: 'Tous les matchs', desc: 'Purge intégrale, pour libérer le plus d’espace', badge: 'Total' },
]

/** Petite tuile chiffrée de la page (purge, compactage) : libellé, valeur, couleurs facultatives. */
function StatTile({
  label,
  value,
  valueColor,
  icon: Icon,
  iconColor,
}: {
  label: string
  value: React.ReactNode
  valueColor?: string
  icon?: typeof ShieldCheck
  iconColor?: string
}) {
  return (
    <div className="app-panel-muted flex flex-col gap-0.5 px-3 py-2.5">
      <span className="t-label flex items-center gap-1.5">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: iconColor }} aria-hidden="true" /> : null}
        {label}
      </span>
      <span className="t-body t-num font-semibold text-gray-900" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </span>
    </div>
  )
}

/** Bouton discret « Masquer » d'un compte rendu (purge, compactage) : n'annule rien, ne supprime aucune donnée. */
function DismissButton({ onClick, children = 'Masquer' }: { onClick: () => void; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="app-link text-xs font-semibold">
      {children}
    </button>
  )
}

/**
 * Base de données (SuperUser), selon la charte UI (docs/ui/index.html) : taille des tables, purge des tracés GPS de la
 * télémétrie et compactage InnoDB. Purge et compactage tournent sur le serveur ; la page suit leur avancement et
 * demande confirmation dans la page avant de les lancer.
 */
export default function DatabaseStatsPage() {
  const router = useRouter()
  const { clanId } = useSelectedClan()
  
  const { loading: sessionLoading, authenticated, isSuperUser } = useAuthSession()

  const [stats, setStats] = useState<DbStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Age Threshold Filter
  const [selectedAge, setSelectedAge] = useState<string>('14')

  // Purge state
  const [purgeCounts, setPurgeCounts] = useState<PurgeCounts | null>(null)
  const [purgeRun, setPurgeRun] = useState<PurgeRun | null>(null)
  const [recounting, setRecounting] = useState(false)
  const [purgeStatusError, setPurgeStatusError] = useState('')
  const [loadingPurgeStatus, setLoadingPurgeStatus] = useState(false)
  const [purgeError, setPurgeError] = useState('')

  // Table optimization state
  const [optimizeAssessment, setOptimizeAssessment] = useState<OptimizeAssessment | null>(null)
  const [optimizeRun, setOptimizeRun] = useState<OptimizeRun | null>(null)
  const [optimizeMsg, setOptimizeMsg] = useState('')
  const [optimizeError, setOptimizeError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)

  // Confirmations dans la page (charte) au lieu des boîtes du navigateur.
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false)
  const [optimizeConfirm, setOptimizeConfirm] = useState<{ table: string; gainMb: number; sizeMb: number } | null>(null)

  useEffect(() => {
    if (sessionLoading) return
    if (!authenticated || !isSuperUser) {
      router.replace(clanId ? `/clans/${clanId}/overview` : '/clans')
    }
  }, [authenticated, isSuperUser, clanId, router, sessionLoading])

  const fetchPurgeStatus = useCallback(async () => {
    try {
      setLoadingPurgeStatus(true)
      const res = await fetch('/api/superuser/database/purge-telemetry', { cache: 'no-store' })

      if (!res.ok) {
        // Un statut indisponible reste indisponible : le traduire en « 0 match » ferait croire
        // qu'il n'y a rien à purger.
        setPurgeCounts(null)
        setPurgeStatusError(`Statut de purge indisponible (HTTP ${res.status}).`)
        return
      }

      const data = (await res.json()) as PurgeStatusResponse
      setPurgeCounts(data.counts)
      setPurgeRun(data.run)
      setRecounting(data.recounting)
      setPurgeStatusError('')
    } catch (err) {
      console.error('Erreur lecture statut de purge:', err)
      setPurgeCounts(null)
      setPurgeStatusError(err instanceof Error ? err.message : 'Statut de purge indisponible.')
    } finally {
      setLoadingPurgeStatus(false)
    }
  }, [])

  // La purge et le recomptage tournent côté serveur : on suit leur avancement en relisant l'état,
  // ce qui permet de quitter la page sans les interrompre.
  const isPurging = purgeRun?.status === 'running'
  useEffect(() => {
    if (!isPurging && !recounting) return
    const timer = setTimeout(() => {
      void fetchPurgeStatus()
    }, 2000)
    return () => clearTimeout(timer)
  }, [isPurging, recounting, purgeRun, purgeCounts, fetchPurgeStatus])

  const fetchOptimizeState = useCallback(async () => {
    try {
      const res = await fetch('/api/superuser/database/optimize?table=SquadMatchTelemetry', {
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as { assessment: OptimizeAssessment; run: OptimizeRun | null }
      setOptimizeAssessment(data.assessment)
      setOptimizeRun(data.run)
    } catch (err) {
      console.error('Erreur lecture de l’état de compactage:', err)
    }
  }, [])

  // Le compactage tourne sur le serveur : on suit son avancement en relisant l'état.
  const isOptimizing = optimizeRun?.status === 'running'
  useEffect(() => {
    if (!isOptimizing) return
    const timer = setTimeout(() => {
      void fetchOptimizeState()
    }, 5000)
    return () => clearTimeout(timer)
  }, [isOptimizing, optimizeRun, fetchOptimizeState])

  const fetchStats = async () => {
    try {
      setLoading(true)
      setError('')
      const [statsRes] = await Promise.all([
        fetch('/api/superuser/database'),
        fetchPurgeStatus(),
        fetchOptimizeState(),
      ])
      if (!statsRes.ok) throw new Error('Erreur lors de la récupération des statistiques')
      const data = await statsRes.json()
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authenticated && isSuperUser) {
      void fetchStats()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, isSuperUser])

  // Tous les seuils sont dans l'instantané : changer de seuil n'appelle plus le serveur.
  const handleAgeChange = (newAge: string) => {
    setSelectedAge(newAge)
    setPurgeError('')
  }

  const selectedCount = purgeCounts?.byThreshold?.[selectedAge] ?? null
  /** Le volume à purger n'est exploitable que si un comptage a été publié. */
  const matchesToPurge = selectedCount ? selectedCount.purgeable : null
  const purgeCountKnown = matchesToPurge !== null

  // Sorting
  const [sortField, setSortField] = useState<keyof TableStats>('totalSizeMb')
  const [sortAsc, setSortAsc] = useState(false)

  const sortedTables = useMemo(() => {
    if (!stats) return []
    return [...stats.tables].sort((a, b) => {
      if (a[sortField] < b[sortField]) return sortAsc ? -1 : 1
      if (a[sortField] > b[sortField]) return sortAsc ? 1 : -1
      return 0
    })
  }, [stats, sortField, sortAsc])

  const handleSort = (field: keyof TableStats) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  /** Efface le compte rendu de la dernière purge. N'annule rien, ne supprime aucune donnée. */
  const handleDismissPurgeRun = async () => {
    setPurgeRun(null)
    try {
      await fetch('/api/superuser/database/purge-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
    } catch (err) {
      console.error('Erreur lors du masquage du compte rendu de purge:', err)
    }
  }

  /** Idem pour le compte rendu du dernier compactage. */
  const handleDismissOptimizeRun = async () => {
    setOptimizeRun(null)
    setOptimizeMsg('')
    try {
      await fetch('/api/superuser/database/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
    } catch (err) {
      console.error('Erreur lors du masquage du compte rendu de compactage:', err)
    }
  }

  const handleCancelPurge = async () => {
    try {
      await fetch('/api/superuser/database/purge-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      void fetchPurgeStatus()
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : 'Impossible d’interrompre la purge')
    }
  }

  // Le comptage complet coûte ~4 min de lecture disque : il est normalement produit chaque nuit
  // par le cron, et ce bouton ne sert qu'à le rafraîchir à la demande.
  const handleRecount = async () => {
    setPurgeError('')
    try {
      const res = await fetch('/api/superuser/database/purge-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recount' }),
      })
      if (!res.ok) throw new Error(`Erreur serveur HTTP ${res.status}`)
      setRecounting(true)
      void fetchPurgeStatus()
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : 'Recomptage impossible')
    }
  }

  const handleOptimizeTable = async (
    table: string = 'SquadMatchTelemetry',
    action: 'optimize' | 'analyze' = 'optimize',
    confirmed = false
  ) => {
    setOptimizeMsg('')
    setOptimizeError('')

    // Le verdict affiché ne concerne qu'une table : pour une autre, on laisse le serveur trancher
    // (il réévalue de toute façon avant de lancer quoi que ce soit).
    const assessment = optimizeAssessment?.table === table ? optimizeAssessment : null

    if (action === 'optimize') {
      const verdict = assessment?.verdict
      // Le serveur refusera de toute façon, mais autant ne pas faire cliquer dans le vide.
      if (verdict === 'blocked_disk' || verdict === 'blocked_unknown_disk') {
        setOptimizeError(assessment?.reason ?? 'Compactage impossible dans l’état actuel du serveur.')
        return
      }
      if (!confirmed) {
        setOptimizeConfirm({ table, gainMb: assessment?.sizes?.dataFreeMb ?? 0, sizeMb: assessment?.sizes?.totalSizeMb ?? 0 })
        return
      }
    }

    if (action === 'analyze') setAnalyzing(true)

    try {
      const res = await fetch('/api/superuser/database/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table,
          action,
          // Un compactage jugé « inutile » reste permis sur demande explicite ; un compactage jugé
          // dangereux ne l'est jamais.
          force: action === 'optimize' && assessment?.verdict === 'pointless',
        }),
      })

      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        durationMs?: number
        stats?: TableStats | null
        message?: string
        run?: OptimizeRun
      } | null

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || `Erreur serveur HTTP ${res.status}`)
      }

      if (action === 'analyze') {
        const durSec = payload.durationMs ? (payload.durationMs / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '1'
        setOptimizeMsg(`${payload.message || 'Opération réussie'} en ${durSec} s.`)
      } else {
        setOptimizeMsg(payload.message || 'Compactage lancé sur le serveur.')
        if (payload.run) setOptimizeRun(payload.run)
      }

      void fetchOptimizeState()
      void fetchStats()
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : 'Échec de l’opération de compactage')
    } finally {
      if (action === 'analyze') setAnalyzing(false)
    }
  }

  const handlePurge = async (confirmed = false) => {
    // Statut inconnu ≠ zéro match : sans cette garde, un comptage indisponible annonçait à tort
    // « Aucun match ne correspond au filtre » et la purge sortait sans rien faire.
    if (matchesToPurge === null) {
      setPurgeError(
        purgeStatusError ||
          'Aucun comptage n’a encore été publié pour ce seuil. Lancez un recomptage et attendez son résultat.'
      )
      return
    }

    if (matchesToPurge === 0) {
      setPurgeError('Aucun match ne correspond au filtre sélectionné pour la purge.')
      return
    }

    if (!confirmed) {
      setPurgeConfirmOpen(true)
      return
    }

    setPurgeError('')
    try {
      const res = await fetch('/api/superuser/database/purge-telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', olderThanDays: selectedAge }),
      })
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean
        error?: string
        run?: PurgeRun
      } | null

      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || `Erreur serveur HTTP ${res.status} lors du démarrage de la purge`)
      }

      if (payload.run) setPurgeRun(payload.run)
      void fetchPurgeStatus()
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : 'Erreur inattendue lors de la purge')
    }
  }

  if (sessionLoading) return <AdminPageLoading />
  if (!authenticated || !isSuperUser) return null

  const progressPercent =
    purgeRun && purgeRun.target > 0 ? Math.min(100, Math.round((purgeRun.purged / purgeRun.target) * 100)) : 0

  const ageLabel = selectedAge === 'all' ? 'tout l’historique' : `les matchs de plus de ${selectedAge} jours`
  const thresholdLabel = selectedAge === 'all' ? 'tous les matchs' : `plus de ${selectedAge} jours`
  const optimizeBlocked =
    optimizeAssessment?.verdict === 'blocked_disk' || optimizeAssessment?.verdict === 'blocked_unknown_disk'

  const kpis: Kpi[] = stats
    ? [
        {
          label: 'Données',
          value: formatGo(stats.globalStats.totalDataMb),
          detail: `${formatMo(stats.globalStats.totalDataMb)} Mo de lignes`,
          icon: Database,
          color: 'var(--game-sky)',
        },
        {
          label: 'Index',
          value: formatGo(stats.globalStats.totalIndexMb),
          detail: `${formatMo(stats.globalStats.totalIndexMb)} Mo`,
          icon: Layers,
          color: 'var(--theme-ui-text-muted)',
        },
        {
          label: 'Espace libre',
          value: formatGo(stats.globalStats.totalFreeMb),
          detail: 'récupérable par compactage',
          icon: HardDrive,
          color: 'var(--game-warn)',
        },
        {
          label: 'Taille totale',
          value: formatGo(stats.globalStats.totalSizeMb),
          detail: `${formatMo(stats.globalStats.totalSizeMb)} Mo de fichiers`,
          icon: Database,
          color: 'var(--game-gold)',
        },
      ]
    : []

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Base de données"
        subtitle="Taille des tables, purge des tracés GPS et compactage de la télémétrie, pour anticiper le stockage."
        icon={Database}
        image="/weaponsplayer.jpg"
        currentHref="/settings/database"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          ...(stats
            ? [
                <>
                  <span className="t-num">{formatGo(stats.globalStats.totalSizeMb)}</span>
                </>,
                <>
                  <span className="t-num">{stats.tables.length}</span> tables
                </>,
              ]
            : []),
          'Réservé au SuperUser',
        ]}
        action={
          <button type="button" onClick={fetchStats} disabled={loading || isPurging || isOptimizing} className={BANNER_GLASS_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading || loadingPurgeStatus || isOptimizing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Actualiser
          </button>
        }
      />

      <FormFeedback error={error} />

      {!stats && loading ? <ListSkeleton rows={4} /> : null}

      {stats ? (
        <>
          <KpiGrid items={kpis} className="grid-cols-2 lg:grid-cols-4" />

          <SectionCard
            id="database-tables"
            icon={Layers}
            title="Détail par table"
            meta="Tri par les en-têtes. L’espace libre est l’espace interne d’une table, rendu au disque seulement par un compactage."
            aside={<Tag tone="neutral">{stats.tables.length} tables</Tag>}
          >
            <div className="app-table-shell">
              <table className="w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <SortableTh<keyof TableStats> column="tableName" sortKey={sortField} sortDir={sortAsc ? 'asc' : 'desc'} onSort={handleSort} align="left">
                      Table
                    </SortableTh>
                    <SortableTh<keyof TableStats>
                      column="rowCount"
                      sortKey={sortField}
                      sortDir={sortAsc ? 'asc' : 'desc'}
                      onSort={handleSort}
                      className="hidden sm:table-cell"
                    >
                      Lignes
                    </SortableTh>
                    <SortableTh<keyof TableStats>
                      column="dataSizeMb"
                      sortKey={sortField}
                      sortDir={sortAsc ? 'asc' : 'desc'}
                      onSort={handleSort}
                      className="hidden md:table-cell"
                      title="Données, en Mo"
                    >
                      Données
                    </SortableTh>
                    <SortableTh<keyof TableStats>
                      column="indexSizeMb"
                      sortKey={sortField}
                      sortDir={sortAsc ? 'asc' : 'desc'}
                      onSort={handleSort}
                      className="hidden lg:table-cell"
                      title="Index, en Mo"
                    >
                      Index
                    </SortableTh>
                    <SortableTh<keyof TableStats>
                      column="dataFreeMb"
                      sortKey={sortField}
                      sortDir={sortAsc ? 'asc' : 'desc'}
                      onSort={handleSort}
                      className="hidden sm:table-cell"
                      title="Espace libre interne, en Mo"
                    >
                      Libre
                    </SortableTh>
                    <SortableTh<keyof TableStats>
                      column="totalSizeMb"
                      sortKey={sortField}
                      sortDir={sortAsc ? 'asc' : 'desc'}
                      onSort={handleSort}
                      title="Taille totale, en Mo"
                    >
                      Total
                    </SortableTh>
                    <SortableTh title="Part de la taille totale de la base">Part</SortableTh>
                  </tr>
                </thead>
                <tbody>
                  {sortedTables.map((t) => {
                    const percentage = stats.globalStats.totalSizeMb > 0 ? (t.totalSizeMb / stats.globalStats.totalSizeMb) * 100 : 0
                    const isTelemetry = t.tableName === 'SquadMatchTelemetry'
                    return (
                      <tr
                        key={t.tableName}
                        className="app-table-row"
                        style={isTelemetry ? { backgroundColor: 'color-mix(in srgb, var(--game-warn) 7%, transparent)' } : undefined}
                      >
                        <td className="px-[9px] py-2">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="break-all font-semibold text-gray-900">{t.tableName}</span>
                            {isTelemetry ? (
                              <>
                                <Tag tone="warn">Télémétrie</Tag>
                                <button
                                  type="button"
                                  onClick={() => handleOptimizeTable(t.tableName, 'optimize')}
                                  disabled={isOptimizing || isPurging}
                                  className="app-btn app-btn--xs app-btn--secondary gap-1"
                                  title="Compacter la table et rendre l’espace libre au disque"
                                >
                                  <HardDrive className="h-3 w-3" aria-hidden="true" />
                                  Compacter
                                </button>
                              </>
                            ) : null}
                          </span>
                        </td>
                        <td className="t-num hidden px-[9px] py-2 text-right text-gray-700 sm:table-cell">{t.rowCount.toLocaleString('fr-FR')}</td>
                        <td className="t-num hidden px-[9px] py-2 text-right text-gray-700 md:table-cell">{formatMo(t.dataSizeMb, 2)}</td>
                        <td className="t-num hidden px-[9px] py-2 text-right text-gray-700 lg:table-cell">{formatMo(t.indexSizeMb, 2)}</td>
                        <td className="t-num hidden px-[9px] py-2 text-right sm:table-cell">
                          {t.dataFreeMb > 0 ? <span style={{ color: 'var(--game-warn)' }}>{formatMo(t.dataFreeMb, 0)}</span> : <span className="t-meta">—</span>}
                        </td>
                        <td className="t-num whitespace-nowrap px-[9px] py-2 text-right font-semibold text-gray-900">{formatMo(t.totalSizeMb, 2)}</td>
                        <td className="px-[9px] py-2">
                          <span className="flex items-center justify-end gap-2">
                            <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)] sm:block">
                              <span
                                className="block h-full rounded-full"
                                style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%`, backgroundColor: 'var(--game-sky)' }}
                              />
                            </span>
                            <span className="t-num w-12 text-right text-xs font-semibold text-gray-700">
                              {percentage.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
                            </span>
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            id="database-geo-purge"
            icon={MapPinOff}
            title="Purger les tracés GPS"
            meta={
              <>
                Vide les colonnes <code className="font-mono">positionSamples</code> et <code className="font-mono">trajectorySegments</code> de{' '}
                <code className="font-mono">SquadMatchTelemetry</code>, qui pèsent d’ordinaire plus de 90 % de la base.
              </>
            }
          >
            <Callout tone="warn" icon={AlertTriangle} title="Statistiques préservées">
              Kills, dégâts, recalls, armes et trophées ne sont pas touchés. En revanche, le tracé continu des joueurs sur la carte
              disparaît pour les matchs purgés.
            </Callout>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="t-label flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                  Ancienneté des matchs à purger
                </span>
                <span className="t-meta flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--game-pos)' }} aria-hidden="true" />
                  Replays récents protégés
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {AGE_OPTIONS.map((opt) => {
                  const isSelected = selectedAge === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isPurging}
                      aria-pressed={isSelected}
                      onClick={() => handleAgeChange(opt.value)}
                      className="app-panel-muted flex flex-col gap-1 p-3 text-left transition-colors enabled:hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-45"
                      style={isSelected ? { borderColor: 'var(--theme-ui-accent)', backgroundColor: 'var(--theme-ui-accent-tint)' } : undefined}
                    >
                      <span className="flex w-full items-center justify-between gap-1.5">
                        <span className={`text-xs font-bold ${isSelected ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-900'}`}>{opt.label}</span>
                        <Tag tone="neutral">{opt.badge}</Tag>
                      </span>
                      <span className="t-meta">{opt.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {purgeCounts ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <StatTile
                  label="Matchs avec tracés"
                  value={
                    <>
                      {purgeCounts.totalWithGeo.toLocaleString('fr-FR')}{' '}
                      <span className="t-meta font-normal">sur {purgeCounts.totalRows.toLocaleString('fr-FR')}</span>
                    </>
                  }
                />
                <StatTile
                  label={`À purger (${thresholdLabel})`}
                  value={matchesToPurge === null ? '—' : matchesToPurge.toLocaleString('fr-FR')}
                  valueColor={matchesToPurge === null ? undefined : matchesToPurge > 0 ? 'var(--game-warn)' : 'var(--game-pos)'}
                />
                <StatTile
                  label="Protégés (Top 1, parties personnalisées)"
                  value={selectedCount ? selectedCount.protectedMatches.toLocaleString('fr-FR') : '—'}
                  icon={ShieldCheck}
                  iconColor="var(--game-pos)"
                />
              </div>
            ) : null}

            {/* Fraîcheur du comptage : borne figée à minuit, la journée en cours n'y entre pas */}
            <div className="app-panel-muted flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <p className="t-meta m-0 max-w-2xl">
                {purgeCounts ? (
                  <>
                    Comptage du <span className="font-semibold text-gray-900">{formatDateTime(purgeCounts.computedAt)}</span>
                    {selectedCount?.cutoff ? (
                      <>
                        , arrêté aux matchs antérieurs au{' '}
                        <span className="font-semibold text-gray-900">{formatDateTime(selectedCount.cutoff)}</span> : la journée en
                        cours n’est pas comptée.
                      </>
                    ) : (
                      '.'
                    )}{' '}
                    Recalculé chaque nuit ; un parcours complet de la table prend environ {Math.round(purgeCounts.durationMs / 1000)} s.
                  </>
                ) : (
                  <>
                    Aucun comptage publié pour l’instant. Il est produit chaque nuit ; il peut aussi être lancé maintenant : environ 4
                    minutes, sur le serveur.
                  </>
                )}
              </p>
              <button type="button" onClick={handleRecount} disabled={recounting || isPurging} className="app-btn app-btn--sm app-btn--secondary gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${recounting ? 'animate-spin' : ''}`} aria-hidden="true" />
                {recounting ? 'Comptage en cours…' : 'Recompter maintenant'}
              </button>
            </div>

            {purgeStatusError && !purgeCounts ? (
              <Callout tone="warn" icon={AlertTriangle} title="Volume à purger inconnu">
                {purgeStatusError} La purge reste bloquée tant que ce nombre n’est pas connu : un statut indisponible ne signifie pas
                qu’il n’y a rien à purger.
              </Callout>
            ) : null}

            {/* Purge en cours : pilotée par le serveur, la page ne fait que la suivre */}
            {isPurging && purgeRun ? (
              <div className="app-panel-muted flex flex-col gap-2 px-3.5 py-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="t-body flex items-center gap-2 font-semibold text-gray-900">
                    <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--game-sky)' }} aria-hidden="true" />
                    Purge en cours ({purgeRun.olderThanDays === 'all' ? 'tous les matchs' : `plus de ${purgeRun.olderThanDays} jours`})
                  </span>
                  <span className="t-num font-bold text-gray-900">{progressPercent} %</span>
                </span>
                <span className="h-2 w-full overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]">
                  <span
                    className="block h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%`, backgroundColor: 'var(--game-sky)' }}
                  />
                </span>
                <span className="t-meta t-num flex flex-wrap justify-between gap-2">
                  <span>
                    Nettoyés : {purgeRun.purged.toLocaleString('fr-FR')} / {purgeRun.target.toLocaleString('fr-FR')}
                  </span>
                  <span>Restants : {Math.max(0, purgeRun.target - purgeRun.purged).toLocaleString('fr-FR')}</span>
                </span>
                <p className="t-meta m-0">
                  Elle s’exécute sur le serveur : changer de page ou fermer l’onglet ne l’interrompt pas.{' '}
                  {purgeRun.cancelRequested ? <span className="font-semibold text-gray-900">Interruption demandée, arrêt au prochain lot…</span> : null}
                </p>
                <button
                  type="button"
                  onClick={handleCancelPurge}
                  disabled={purgeRun.cancelRequested}
                  className="app-btn app-btn--sm app-btn--secondary gap-1.5 self-start"
                >
                  <Square className="h-3 w-3" style={{ color: 'var(--game-neg)' }} fill="currentColor" aria-hidden="true" />
                  Interrompre la purge
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              {!isPurging ? (
                <button
                  type="button"
                  onClick={() => void handlePurge()}
                  disabled={!purgeCountKnown || matchesToPurge === 0}
                  className="app-btn app-btn--md app-btn--danger-solid gap-1.5"
                >
                  {purgeCountKnown ? (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Loader2 className={`h-4 w-4 ${recounting ? 'animate-spin' : ''}`} aria-hidden="true" />
                  )}
                  {!purgeCountKnown
                    ? purgeStatusError
                      ? 'Statut indisponible'
                      : recounting
                        ? 'Comptage en cours…'
                        : 'Comptage à lancer'
                    : matchesToPurge === 0
                      ? 'Rien à purger pour ce seuil'
                      : `Purger ${thresholdLabel} (${matchesToPurge.toLocaleString('fr-FR')})`}
                </button>
              ) : null}

              {matchesToPurge === 0 && !isPurging ? (
                <span className="t-body t-pos flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Aucun match à purger pour ce seuil.
                </span>
              ) : null}

              {/* Compte rendu d'une purge terminée : une nouvelle, pas un état permanent. Le
                  serveur cesse de le servir au bout de 24 h, et ce bouton l'efface tout de suite. */}
              {!isPurging && purgeRun?.status === 'done' ? (
                <span className="t-body t-pos flex flex-wrap items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Purge terminée le {formatDateTime(purgeRun.finishedAt ?? purgeRun.updatedAt)} : {purgeRun.purged.toLocaleString('fr-FR')} matchs
                  nettoyés.
                  <DismissButton onClick={handleDismissPurgeRun} />
                </span>
              ) : null}

              {!isPurging && purgeRun?.status === 'cancelled' ? (
                <span className="t-body flex flex-wrap items-center gap-1.5 text-gray-700">
                  <Square className="h-3.5 w-3.5" aria-hidden="true" />
                  Purge interrompue après {purgeRun.purged.toLocaleString('fr-FR')} matchs nettoyés.
                  <DismissButton onClick={handleDismissPurgeRun} />
                </span>
              ) : null}
            </div>

            {!isPurging && purgeRun?.status === 'failed' ? (
              <div className="t-body flex flex-col gap-0.5">
                <p className="t-neg m-0 font-semibold">La purge s’est arrêtée après {purgeRun.purged.toLocaleString('fr-FR')} matchs :</p>
                <p className="t-neg m-0">{purgeRun.error}</p>
                <p className="m-0 text-gray-700">Relancer la purge reprend là où elle s’est arrêtée : rien n’est à défaire.</p>
                <span>
                  <DismissButton onClick={handleDismissPurgeRun}>Masquer ce message</DismissButton>
                </span>
              </div>
            ) : null}

            <FormFeedback error={purgeError} />
          </SectionCard>

          <SectionCard
            id="database-optimize"
            icon={HardDrive}
            title="Compacter la télémétrie"
            meta="Rendre au disque l’espace libéré dans SquadMatchTelemetry, après une purge."
          >
            <Callout tone="sky" icon={Info} title="Pourquoi la taille ne baisse-t-elle pas tout de suite après une purge ?">
              Sous InnoDB, vider des colonnes libère de l’espace à l’intérieur du fichier de données (<code className="font-mono">.ibd</code>)
              sans jamais le réduire. Cet espace est réutilisé par les écritures suivantes : le compactage ne sert qu’à le rendre au
              système de fichiers. Il reconstruit la table entière et exige autant d’espace disque libre qu’elle en occupe ; il ne peut
              donc être ni fractionné ni automatisé.
            </Callout>

            {optimizeAssessment ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <StatTile label="Taille à réécrire" value={formatGo(optimizeAssessment.sizes?.totalSizeMb)} />
                <StatTile label="Récupérable" value={formatGo(optimizeAssessment.sizes?.dataFreeMb)} valueColor="var(--game-warn)" />
                <StatTile
                  label="Disque libre / requis"
                  value={
                    optimizeAssessment.disk.measured
                      ? `${formatGo(optimizeAssessment.disk.freeMb)} / ${formatGo(optimizeAssessment.requiredMb)}`
                      : 'non mesurable'
                  }
                />
              </div>
            ) : null}

            {optimizeAssessment ? (
              optimizeAssessment.verdict === 'useful' ? (
                <p className="t-body t-pos m-0 flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {optimizeAssessment.reason}
                </p>
              ) : optimizeAssessment.verdict === 'running' ? (
                <Callout tone="sky" icon={Loader2} title="Compactage en cours">
                  {optimizeAssessment.reason}
                </Callout>
              ) : (
                <Callout tone="warn" icon={AlertTriangle} title={optimizeBlocked ? 'Compactage impossible' : 'Compactage peu utile'}>
                  {optimizeAssessment.reason}
                </Callout>
              )
            ) : null}

            {isOptimizing && optimizeRun ? (
              <p className="t-body m-0 flex items-start gap-2 text-gray-700">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" style={{ color: 'var(--game-sky)' }} aria-hidden="true" />
                Compactage de {optimizeRun.table} en cours depuis le {formatDateTime(optimizeRun.startedAt)}. Il s’exécute sur le serveur :
                quitter cette page ne l’interrompt pas.
              </p>
            ) : null}

            {!isOptimizing && optimizeRun?.status === 'done' ? (
              <p className="t-body t-pos m-0 flex flex-wrap items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Compactage terminé : {formatGo(optimizeRun.sizeBeforeMb)} → {formatGo(optimizeRun.sizeAfterMb)}, soit{' '}
                {formatGo(optimizeRun.reclaimedMb)} rendus au disque.
                <DismissButton onClick={handleDismissOptimizeRun} />
              </p>
            ) : null}

            {!isOptimizing && optimizeRun?.status === 'failed' ? (
              <p className="t-body t-neg m-0 flex flex-wrap items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {optimizeRun.error}
                <DismissButton onClick={handleDismissOptimizeRun} />
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => handleOptimizeTable('SquadMatchTelemetry', 'optimize')}
                disabled={isOptimizing || isPurging || !optimizeAssessment || optimizeBlocked}
                className="app-btn app-btn--md app-btn--secondary gap-1.5"
              >
                {isOptimizing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <HardDrive className="h-4 w-4" aria-hidden="true" />}
                {isOptimizing ? 'Compactage en cours…' : optimizeBlocked ? 'Compactage indisponible' : 'Compacter (OPTIMIZE)'}
              </button>
              <button
                type="button"
                onClick={() => handleOptimizeTable('SquadMatchTelemetry', 'analyze')}
                disabled={analyzing || isOptimizing || isPurging}
                className="app-btn app-btn--md app-btn--secondary gap-1.5"
                title="Recalculer les statistiques de cardinalité des index (rapide)"
              >
                <Zap className={`h-4 w-4 ${analyzing ? 'animate-pulse' : ''}`} style={{ color: 'var(--game-warn)' }} aria-hidden="true" />
                Analyser la table (ANALYZE)
              </button>
              <FormFeedback error={optimizeError} success={optimizeMsg} />
            </div>
          </SectionCard>
        </>
      ) : null}

      {purgeConfirmOpen && matchesToPurge !== null ? (
        <ConfirmDialog
          icon={Trash2}
          title="Purger les tracés GPS ?"
          confirmLabel={`Purger ${matchesToPurge.toLocaleString('fr-FR')} matchs`}
          tone="danger"
          busy={false}
          onCancel={() => setPurgeConfirmOpen(false)}
          onConfirm={() => {
            setPurgeConfirmOpen(false)
            void handlePurge(true)
          }}
        >
          Les tracés de {ageLabel} ({matchesToPurge.toLocaleString('fr-FR')} matchs) seront effacés définitivement.{' '}
          {(selectedCount?.protectedMatches ?? 0).toLocaleString('fr-FR')} matchs protégés (Top 1 et parties personnalisées) sont conservés.
          La purge tourne sur le serveur : quitter la page ne l’interrompt pas.
        </ConfirmDialog>
      ) : null}

      {optimizeConfirm ? (
        <ConfirmDialog
          icon={HardDrive}
          title={`Compacter ${optimizeConfirm.table} ?`}
          confirmLabel="Compacter"
          tone="danger"
          busy={false}
          onCancel={() => setOptimizeConfirm(null)}
          onConfirm={() => {
            const { table } = optimizeConfirm
            setOptimizeConfirm(null)
            void handleOptimizeTable(table, 'optimize', true)
          }}
        >
          Récupérable : {formatGo(optimizeConfirm.gainMb)}. Réécrit : {formatGo(optimizeConfirm.sizeMb)}. L’opération reconstruit
          entièrement le fichier de données et peut durer plusieurs dizaines de minutes ; elle s’exécute sur le serveur, quitter la
          page ne l’interrompt pas.
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
