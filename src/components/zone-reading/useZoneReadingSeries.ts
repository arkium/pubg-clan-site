'use client'

import { useCallback, useEffect, useState } from 'react'

import type {
  ZoneReadingGuessResult,
  ZoneReadingMode,
  ZoneReadingReveal,
  ZoneReadingRoundFull,
  ZoneReadingRoundPublic,
  ZoneReadingSeriesFinish,
  ZoneReadingSeriesStart,
} from '@/lib/zone-reading/zone-reading-api'
import {
  ZONE_READING_ROUNDS,
  ZONE_READING_STEPS,
  roundVerdict,
  scoreZoneReadingRound,
  scoreZoneReadingSeries,
  type ZoneReadingRoundResult,
  type ZoneReadingRoundVerdict,
  type ZoneReadingSeriesScore,
} from '@/lib/zone-reading/zone-reading-game'
import type { Circle, Point } from '@/lib/zone-reading/zone-reading-geometry'

/**
 * Déroulé d'une série « Où finit la zone ? » (docs/features/lecture-de-zone.md) :
 *
 * 1. `POST /api/zone-reading/series` tire dix parties. Membre connecté : seuls la ligne de vol (une partie sur deux)
 *    et le cercle 1 de chaque partie sont connus. Visiteur : tout est connu, la série se joue sur place.
 * 2. Chaque étape envoie la position du marqueur (`POST …/guess`) et reçoit le cercle suivant, puis, après le
 *    cercle 4, la zone finale et les écarts calculés par le serveur.
 * 3. Après la dixième partie : bilan (record et nombre de séries pour un membre).
 *
 * `round` : numéro de la série demandée par la page — il change avec la carte, le mode, la période et « Rejouer ».
 */

export type ZoneReadingOrigin = 'recorded' | 'visitor'

export type ZoneReadingRoundOutcome = ZoneReadingRoundResult & { verdict: ZoneReadingRoundVerdict }

export type ZoneReadingSeriesState = {
  key: string
  origin: ZoneReadingOrigin
  seriesId: string | null
  source: 'clan' | 'site'
  mapName: string
  mapSizeMeters: number
  rounds: Array<ZoneReadingRoundPublic | ZoneReadingRoundFull>
  roundIndex: number
  /** Cercle affiché (1 à 4). */
  step: number
  circles: Circle[]
  guess: Point | null
  guesses: Point[]
  reveal: ZoneReadingReveal | null
  outcomes: ZoneReadingRoundOutcome[]
  summary: { score: ZoneReadingSeriesScore; finish: ZoneReadingSeriesFinish | null } | null
  showSummary: boolean
}

type StartParams = { mapName: string; mode: ZoneReadingMode; period: string; clanId: number | null }

/** Une série demandée il y a moins de 15 s avec les mêmes réglages est réutilisée : le shell remonte la page quand la
 *  session arrive, ce qui ouvrirait sinon une deuxième série (même règle qu'au Mortier). */
const REUSE_WINDOW_MS = 15_000
let lastRequest: { key: string; at: number; promise: Promise<ZoneReadingSeriesStart> } | null = null

async function requestSeries(params: StartParams, key: string): Promise<ZoneReadingSeriesStart> {
  if (lastRequest && lastRequest.key === key && Date.now() - lastRequest.at < REUSE_WINDOW_MS) return lastRequest.promise
  const promise = fetch('/api/zone-reading/series', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ map: params.mapName, mode: params.mode, period: params.period, clanId: params.clanId }),
    cache: 'no-store',
  }).then(async (response) => {
    const payload = (await response.json().catch(() => null)) as (ZoneReadingSeriesStart & { error?: string }) | null
    if (!response.ok || !payload || !Array.isArray(payload.rounds)) {
      throw new Error(payload?.error ?? 'Série indisponible : réessaie dans un instant.')
    }
    return payload
  })
  lastRequest = { key, at: Date.now(), promise }
  promise.catch(() => {
    if (lastRequest?.promise === promise) lastRequest = null
  })
  return promise
}

function isFull(round: ZoneReadingRoundPublic | ZoneReadingRoundFull | undefined): round is ZoneReadingRoundFull {
  return Boolean(round && 'final' in round)
}

function outcomeOf(index: number, withPlane: boolean, score: { you: number; center: number; line: number }): ZoneReadingRoundOutcome {
  return { index, withPlane, you: score.you, center: score.center, line: score.line, verdict: roundVerdict(score) }
}

export function useZoneReadingSeries(params: StartParams & { round: number; enabled: boolean }) {
  const { mapName, mode, period, clanId, round, enabled } = params
  const key = `${mapName}|${mode}|${period}|${clanId ?? ''}|${round}`
  const [series, setSeries] = useState<ZoneReadingSeriesState | null>(null)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [stepError, setStepError] = useState('')

  useEffect(() => {
    if (!enabled || !mapName) return
    let cancelled = false
    requestSeries({ mapName, mode, period, clanId }, key)
      .then((start) => {
        if (cancelled) return
        const recorded = start.recorded && typeof start.seriesId === 'string'
        setError(null)
        setStepError('')
        setSeries({
          key,
          origin: recorded ? 'recorded' : 'visitor',
          seriesId: recorded ? start.seriesId : null,
          source: start.source,
          mapName: start.mapName,
          mapSizeMeters: start.mapSizeMeters,
          rounds: start.rounds,
          roundIndex: 0,
          step: 1,
          circles: start.rounds[0]?.circles.slice(0, 1) ?? [],
          guess: null,
          guesses: [],
          reveal: null,
          outcomes: [],
          summary: null,
          showSummary: false,
        })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError({ key, message: caught instanceof Error ? caught.message : 'Série indisponible.' })
      })
    return () => {
      cancelled = true
    }
  }, [enabled, key, mapName, mode, period, clanId])

  const current = series && series.key === key ? series : null

  const place = useCallback((point: Point) => {
    setSeries((state) => (state && !state.reveal ? { ...state, guess: point } : state))
  }, [])

  const applyResult = useCallback((state: ZoneReadingSeriesState, guess: Point, result: ZoneReadingGuessResult): ZoneReadingSeriesState => {
    const guesses = [...state.guesses, guess]
    if (result.kind === 'circle') {
      return { ...state, guesses, step: result.step, circles: [...state.circles, result.circle] }
    }
    const roundInfo = state.rounds[state.roundIndex]
    const outcomes = [...state.outcomes, outcomeOf(state.roundIndex, roundInfo?.withPlane ?? true, result.reveal.score)]
    const summary =
      state.roundIndex === ZONE_READING_ROUNDS - 1
        ? { score: result.finish?.score ?? scoreZoneReadingSeries(outcomes), finish: result.finish }
        : null
    return { ...state, guesses, circles: result.reveal.circles, reveal: result.reveal, outcomes, summary }
  }, [])

  /** Valide l'étape : cercle suivant, ou zone finale après le cercle 4. */
  const advance = useCallback(async () => {
    const state = current
    if (!state || !state.guess || state.reveal || pending) return
    const guess = state.guess
    setStepError('')

    if (state.origin === 'visitor') {
      const roundData = state.rounds[state.roundIndex]
      if (!isFull(roundData)) return
      let result: ZoneReadingGuessResult
      if (state.step < ZONE_READING_STEPS) {
        result = { kind: 'circle', round: state.roundIndex, step: state.step + 1, circle: roundData.circles[state.step] }
      } else {
        const score = scoreZoneReadingRound(roundData, [...state.guesses, guess])
        result = {
          kind: 'reveal',
          reveal: { round: state.roundIndex, line: roundData.line, circles: roundData.circles, final: roundData.final, score },
          finish: null,
        }
      }
      setSeries(applyResult(state, guess, result))
      return
    }

    setPending(true)
    try {
      const response = await fetch(`/api/zone-reading/series/${state.seriesId}/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round: state.roundIndex, step: state.step, x: guess.x, y: guess.y }),
        cache: 'no-store',
      })
      const payload = (await response.json().catch(() => null)) as (ZoneReadingGuessResult & { error?: string }) | null
      if (!response.ok || !payload || (payload.kind !== 'circle' && payload.kind !== 'reveal')) {
        throw new Error(payload?.error ?? 'Le serveur n’a pas répondu : réessaie.')
      }
      setSeries((latest) => (latest && latest.key === state.key ? applyResult(latest, guess, payload) : latest))
    } catch (caught) {
      setStepError(caught instanceof Error ? caught.message : 'Le serveur n’a pas répondu : réessaie.')
    } finally {
      setPending(false)
    }
  }, [current, pending, applyResult])

  /** Partie suivante, ou bilan après la dixième. */
  const next = useCallback(() => {
    setSeries((state) => {
      if (!state || !state.reveal) return state
      if (state.roundIndex >= ZONE_READING_ROUNDS - 1) return { ...state, showSummary: true }
      const roundIndex = state.roundIndex + 1
      return {
        ...state,
        roundIndex,
        step: 1,
        circles: state.rounds[roundIndex]?.circles.slice(0, 1) ?? [],
        guess: null,
        guesses: [],
        reveal: null,
      }
    })
  }, [])

  return {
    series: current,
    loading: enabled && !current && (!error || error.key !== key),
    error: error && error.key === key ? error.message : '',
    stepError,
    pending,
    place,
    advance,
    next,
  }
}
