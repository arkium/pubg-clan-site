'use client'

import { AlertTriangle, HeartPulse } from 'lucide-react'

import { useLifecycleResource } from '@/components/clan-lifecycle/LifecycleShared'
import { Callout, EmptyState, ErrorState, SectionCard, Tag, type Tone } from '@/components/ui/CharteKit'
import { MATCH_SYNC_THRESHOLDS, type MatchSyncHealthSummary } from '@/lib/match-sync-health'

type Payload = {
  ok: boolean
  health: MatchSyncHealthSummary | null
  clans: Array<{ id: number; tag: string; name: string }>
}

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
const DAY_TIME = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

function minutesLabel(minutes: number | null) {
  if (minutes === null) return '—'
  if (minutes < 120) return `${Math.round(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`
}

/** Ton d'une tuile : la raison du résumé qui la concerne, sinon « en ordre » (ou neutre sans mesure suffisante). */
function toneOf(health: MatchSyncHealthSummary, keys: string[], fallback: Tone = 'pos'): Tone {
  const reason = health.reasons.find((entry) => keys.includes(entry.key))
  if (!reason) return fallback
  return reason.tone === 'urgent' ? 'neg' : 'warn'
}

function HealthTile({ label, value, detail, tone, testId }: { label: string; value: string; detail: string; tone: Tone; testId: string }) {
  return (
    <article className="app-panel-muted flex flex-col gap-1 px-3.5 py-3" data-testid={testId}>
      <span className="flex items-center justify-between gap-2">
        <span className="t-label">{label}</span>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tone === 'neutral' ? 'var(--theme-ui-border)' : `var(--game-${tone})` }} aria-hidden="true" />
      </span>
      <span className="t-hero t-hero--sm text-gray-900">{value}</span>
      <span className="t-meta">{detail}</span>
    </article>
  )
}

/**
 * Fraîcheur des parties (docs/TODO/fraicheur-des-parties.md) : délai entre la fin d'une partie et son arrivée sur le
 * site, dernier tour de synchronisation, marge sur l'intervalle, tours sautés, parties en attente — le résumé que la
 * synchronisation écrit à chaque tour, sans rien recalculer à l'ouverture de la page.
 */
export default function MatchSyncHealthCard({ reloadToken }: { reloadToken: number }) {
  const { data, error, loading } = useLifecycleResource<Payload>('/api/settings/match-sync-health', reloadToken)
  const health = data?.health ?? null
  const clanTags = new Map((data?.clans ?? []).map((clan) => [clan.id, clan.tag]))

  const statusTag = health?.measured ? (
    <Tag tone={health.status === 'urgent' ? 'neg' : health.status === 'todo' ? 'warn' : 'pos'} testId="match-sync-status">
      {health.status === 'urgent' ? 'Urgent' : health.status === 'todo' ? 'À surveiller' : 'En ordre'}
    </Tag>
  ) : null

  return (
    <SectionCard
      id="fraicheur"
      icon={HeartPulse}
      title="Fraîcheur des parties"
      meta="Délai entre la fin d’une partie et son arrivée sur le site, sur 24 h glissantes ; mesuré par la synchronisation à chaque tour."
      aside={statusTag}
      testId="match-sync-health"
    >
      {error && !data ? (
        <ErrorState message={error} />
      ) : loading && !data ? (
        <p className="t-meta m-0">Chargement…</p>
      ) : !health ? (
        <EmptyState icon={AlertTriangle} title="Mesure illisible" text="L’état enregistré ne se lit pas : le prochain tour de synchronisation le réécrira." />
      ) : !health.measured ? (
        <EmptyState icon={HeartPulse} title="Pas encore de mesure" text="Le premier tour de synchronisation des parties remplira ce bloc." testId="match-sync-empty" />
      ) : (
        <div className={`flex flex-col gap-3 ${loading ? 'opacity-60 transition-opacity duration-200' : ''}`}>
          {health.reasons.length > 0 ? (
            <Callout tone="warn" icon={AlertTriangle} title={health.status === 'urgent' ? 'À traiter tout de suite' : 'À surveiller'} testId="match-sync-reasons">
              <ul className="m-0 flex list-disc flex-col gap-0.5 pl-4">
                {health.reasons.map((reason) => (
                  <li key={reason.key}>{reason.text}</li>
                ))}
              </ul>
            </Callout>
          ) : null}

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <HealthTile
              testId="match-sync-delay"
              label="Délai fin → site"
              value={health.delay.median === null ? '—' : `${minutesLabel(health.delay.median)}`}
              detail={
                health.delay.count > 0
                  ? `médiane · 90 % sous ${minutesLabel(health.delay.p90)} · ${health.delay.count} partie(s)${health.delay.catchUps > 0 ? ` · ${health.delay.catchUps} rattrapage(s) à part` : ''}`
                  : 'aucune partie importée en 24 h'
              }
              tone={health.delay.toned ? toneOf(health, ['delay']) : 'neutral'}
            />
            <HealthTile
              testId="match-sync-last-pass"
              label="Dernier tour"
              value={health.lastPass ? TIME.format(new Date(health.lastPass.finishedAt)) : '—'}
              detail={
                health.lastPass
                  ? `${minutesLabel(health.lastPass.durationMinutes)} · ${health.lastPass.clans} clans${health.lastPass.failedClans > 0 ? ` dont ${health.lastPass.failedClans} en échec` : ''} · ${health.lastPass.importedMatches} partie(s)`
                  : '—'
              }
              tone={health.lastPass && health.lastPass.failedClans > 0 ? toneOf(health, ['stale'], 'warn') : toneOf(health, ['stale'])}
            />
            <HealthTile
              testId="match-sync-margin"
              label="Marge"
              value={health.passes.marginRatio === null ? '—' : `${Math.round(health.passes.marginRatio * 100)} %`}
              detail={
                health.intervalMinutes
                  ? `tour médian ${minutesLabel(health.passes.medianDurationMinutes)} (max ${minutesLabel(health.passes.maxDurationMinutes)}) pour ${minutesLabel(health.intervalMinutes)} d’intervalle`
                  : 'intervalle irrégulier'
              }
              tone={
                health.passes.marginRatio !== null && health.passes.marginRatio > MATCH_SYNC_THRESHOLDS.passMarginOk
                  ? toneOf(health, ['margin'], 'warn')
                  : toneOf(health, ['margin'])
              }
            />
            <HealthTile
              testId="match-sync-skipped"
              label="Tours sautés"
              value={String(health.skipped.last24h)}
              detail={`en 24 h · ${health.passes.count} tour(s) terminé(s)`}
              tone={toneOf(health, ['skipped'])}
            />
            <HealthTile
              testId="match-sync-pending"
              label="Parties en attente"
              value={String(health.pending.waiting)}
              detail={
                health.pending.waiting > 0 || health.pending.lost > 0
                  ? `${health.pending.oldestFailedAt ? `depuis ${TIME.format(new Date(health.pending.oldestFailedAt))}` : 'aucune en attente'} · ${health.pending.lost} perdue(s) sur 7 jours`
                  : 'aucune : toutes les lectures ont abouti'
              }
              tone={toneOf(health, ['lost'], health.pending.waiting > 0 ? 'sky' : 'pos')}
            />
          </div>

          {health.calls ? (
            <p className="t-meta m-0" data-testid="match-sync-calls">
              Appels PUBG limités sur la dernière heure :{' '}
              <span className="t-num font-semibold text-gray-900">
                {health.calls.limitedLastHour} / {health.calls.ceilingPerHour}
                {health.calls.quotaRatio !== null ? ` (${Math.round(health.calls.quotaRatio * 100)} %)` : ''}
              </span>{' '}
              · 429 en 24 h : <span className="t-num font-semibold text-gray-900">{health.calls.http429Last24h}</span> · à traiter en 24 h :{' '}
              <span className="t-num font-semibold text-gray-900">{health.calls.actionLast24h}</span> · passagers sur 1 h :{' '}
              <span className="t-num font-semibold text-gray-900">{health.calls.transientLastHour}</span>
            </p>
          ) : null}

          {health.pending.entries.length > 0 ? (
            <details className="app-panel-muted px-3.5 py-2.5" data-testid="match-sync-pending-list">
              <summary className="t-body cursor-pointer font-semibold text-gray-900">
                Parties en attente et perdues ({health.pending.entries.length})
              </summary>
              <p className="t-meta mb-2 mt-1">
                Une partie en échec (404 : pas encore publiée par PUBG ; 5xx : incident passager) est retentée à chaque tour, même
                si PUBG ne la liste plus ; perdue 24 h après son premier échec.
              </p>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {health.pending.entries.map((entry) => (
                  <li key={entry.matchId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="font-mono font-bold text-gray-900">[{clanTags.get(entry.clanId) ?? `#${entry.clanId}`}]</span>
                      <span className="truncate font-mono text-gray-700" title={entry.matchId}>
                        {entry.matchId.slice(0, 8)}…
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="t-meta">
                        {DAY_TIME.format(new Date(entry.firstFailedAt))} · {entry.attempts} essai(s) · {entry.lastStatus ?? 'sans réponse'}
                      </span>
                      <Tag tone={entry.lost ? 'neg' : 'sky'}>{entry.lost ? 'Perdue' : 'En attente'}</Tag>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      )}
    </SectionCard>
  )
}
