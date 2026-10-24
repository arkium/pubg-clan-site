'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  TOURNAMENT_SYNC_MAX_ATTEMPTS,
  TOURNAMENT_SYNC_RETRY_DELAY_MS,
  summarizeTournamentSync,
  tournamentSyncFailureMessage,
  tournamentSyncProgressMessage,
  tournamentSyncWaitingNotice,
  type TournamentSyncNotice,
  type TournamentSyncPayload,
  type TournamentSyncSummary,
  type TournamentSyncTarget,
} from '@/lib/tournament-sync-summary'

export type TournamentSyncJob = {
  clanId: number
  tournamentId: string
  target: TournamentSyncTarget
  /** Titre du tournoi, rappelé pendant la recherche (administration, plusieurs tournois à l'écran). */
  label?: string
}

export type TournamentSyncOutcome = { kind: 'synced'; summary: TournamentSyncSummary } | { kind: 'failed'; message: string }

type SyncState =
  | { phase: 'idle' }
  | { phase: 'syncing'; job: TournamentSyncJob; attempt: number }
  | { phase: 'waiting'; job: TournamentSyncJob; attempt: number; summary: TournamentSyncSummary; nextAttemptAt: number }
  | { phase: 'done'; job: TournamentSyncJob; notice: TournamentSyncNotice }

async function requestSync(job: TournamentSyncJob): Promise<TournamentSyncOutcome> {
  let response: Response
  try {
    response = await fetch(`/api/clans/${job.clanId}/tournaments/${job.tournamentId}/sync`, { method: 'POST' })
  } catch {
    return { kind: 'failed', message: tournamentSyncFailureMessage(null, null) }
  }
  const payload = (await response.json().catch(() => null)) as TournamentSyncPayload | null
  if (!response.ok) return { kind: 'failed', message: tournamentSyncFailureMessage(response.status, payload) }
  return { kind: 'synced', summary: summarizeTournamentSync(payload, job.target) }
}

/**
 * « Synchroniser PUBG » avec relance automatique — docs/features/tournois.md, « Synchronisation PUBG ». Tant qu'aucune
 * manche n'arrive (PUBG publie une partie deux ou trois minutes après sa fin), un nouvel essai part chaque minute, 10 au
 * plus ; le message dit le compte à rebours, et l'organisateur peut arrêter. `onOutcome` est appelé après chaque essai.
 */
export function useTournamentAutoSync(onOutcome?: (job: TournamentSyncJob, outcome: TournamentSyncOutcome) => void) {
  const [state, setState] = useState<SyncState>({ phase: 'idle' })
  const [now, setNow] = useState(() => Date.now())
  // Chaque lancement, arrêt ou démontage change de numéro : la réponse d'un essai abandonné est ignorée.
  const runRef = useRef(0)
  const waitRef = useRef<{ timer: ReturnType<typeof setTimeout>; resolve: () => void } | null>(null)
  const onOutcomeRef = useRef(onOutcome)

  useEffect(() => {
    onOutcomeRef.current = onOutcome
  })

  const cancelWait = useCallback(() => {
    if (!waitRef.current) return
    clearTimeout(waitRef.current.timer)
    waitRef.current.resolve()
    waitRef.current = null
  }, [])

  useEffect(
    () => () => {
      runRef.current += 1
      cancelWait()
    },
    [cancelWait]
  )

  // Compte à rebours du prochain essai.
  useEffect(() => {
    if (state.phase !== 'waiting') return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [state.phase])

  const start = useCallback(
    (job: TournamentSyncJob) => {
      runRef.current += 1
      const run = runRef.current
      cancelWait()
      void (async () => {
        for (let attempt = 1; attempt <= TOURNAMENT_SYNC_MAX_ATTEMPTS; attempt += 1) {
          setState({ phase: 'syncing', job, attempt })
          const outcome = await requestSync(job)
          if (runRef.current !== run) return
          onOutcomeRef.current?.(job, outcome)
          if (outcome.kind === 'failed') {
            setState({ phase: 'done', job, notice: { tone: 'error', message: outcome.message } })
            return
          }
          if (!outcome.summary.retry || attempt === TOURNAMENT_SYNC_MAX_ATTEMPTS) {
            setState({ phase: 'done', job, notice: tournamentSyncWaitingNotice(outcome.summary, { attempt, secondsLeft: null }) })
            return
          }
          const nextAttemptAt = Date.now() + TOURNAMENT_SYNC_RETRY_DELAY_MS
          setNow(Date.now())
          setState({ phase: 'waiting', job, attempt, summary: outcome.summary, nextAttemptAt })
          await new Promise<void>((resolve) => {
            waitRef.current = { timer: setTimeout(resolve, TOURNAMENT_SYNC_RETRY_DELAY_MS), resolve }
          })
          waitRef.current = null
          if (runRef.current !== run) return
        }
      })()
    },
    [cancelWait]
  )

  /** Arrête les essais automatiques ; le message dit quoi vérifier avant de recliquer. */
  const stop = useCallback(() => {
    runRef.current += 1
    cancelWait()
    setState((current) => {
      if (current.phase === 'waiting') {
        return {
          phase: 'done',
          job: current.job,
          notice: tournamentSyncWaitingNotice(current.summary, { attempt: current.attempt, secondsLeft: null }),
        }
      }
      // La réponse de l'essai en cours sera ignorée : rien ne doit rester « en cours ».
      return current.phase === 'syncing' ? { phase: 'idle' } : current
    })
  }, [cancelWait])

  /** Ferme le message, et arrête les essais en cours. */
  const dismiss = useCallback(() => {
    runRef.current += 1
    cancelWait()
    setState({ phase: 'idle' })
  }, [cancelWait])

  let notice: TournamentSyncNotice | null = null
  if (state.phase === 'syncing') {
    const progress = tournamentSyncProgressMessage(state.attempt)
    notice = { tone: 'progress', message: state.job.label ? `« ${state.job.label} » : ${progress}` : progress }
  } else if (state.phase === 'waiting') {
    notice = tournamentSyncWaitingNotice(state.summary, {
      attempt: state.attempt,
      secondsLeft: Math.ceil((state.nextAttemptAt - now) / 1000),
    })
  } else if (state.phase === 'done') {
    notice = state.notice
  }

  return {
    notice,
    /** Tournoi dont une requête est en cours. */
    syncingTournamentId: state.phase === 'syncing' ? state.job.tournamentId : null,
    /** Un essai automatique est programmé. */
    waiting: state.phase === 'waiting',
    start,
    stop,
    dismiss,
  }
}
