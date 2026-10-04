'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import type { MortarSeriesFinish, MortarSeriesStart } from '@/lib/mortar/mortar-api'
import {
  MORTAR_DEFAULT_SETTING,
  MORTAR_TARGETS_PER_SERIES,
  clampSetting,
  generateMortarTargets,
  randomMortarSeed,
  scoreMortarSeries,
  type MortarDifficulty,
  type MortarSeriesScore,
  type MortarShotInput,
  type MortarTarget,
} from '@/lib/mortar/mortar-game'
import { aimTime } from '@/lib/mortar/mortar-view'

/**
 * Déroulé d'une série de l'entraînement au mortier (docs/features/mortier.md) :
 *
 * 1. `POST /api/mortar/series` donne la graine ; les dix cibles en découlent (`generateMortarTargets`, mêmes calculs
 *    que le serveur). Sans réponse du serveur : graine locale, série non enregistrée.
 * 2. Chaque cible : réglage remis à 300 m, temps mesuré de son affichage au tir (`aimTime`).
 * 3. Après le dixième tir : `POST …/finish` pour une série enregistrée (le serveur recalcule le score et rend le
 *    record), sinon score calculé sur place.
 *
 * `round` : numéro de la série demandée par la page — il change à chaque changement de difficulté et à « Rejouer ».
 */

/** `recorded` : membre connecté ; `visitor` : le serveur ne garde rien ; `offline` : le serveur n'a pas répondu. */
export type MortarSeriesOrigin = 'recorded' | 'visitor' | 'offline'

type StartedSeries = { seriesId: string | null; seed: string; origin: MortarSeriesOrigin }

export type MortarSeriesSummary = {
  score: MortarSeriesScore
  /** Réponse du serveur (record, nombre de séries) ; `null` pour une série non enregistrée. */
  finish: MortarSeriesFinish | null
  /** La série devait être enregistrée mais la fin de série a échoué : score calculé sur place. */
  finishFailed: boolean
}

export type MortarPhase = 'aiming' | 'result' | 'summary'

export type MortarSeriesState = {
  round: number
  difficulty: MortarDifficulty
  origin: MortarSeriesOrigin
  targets: MortarTarget[]
  /** Cible affichée (0 à 9). */
  index: number
  setting: number
  shots: MortarShotInput[]
  phase: MortarPhase
  /** `performance.now()` à l'affichage de la cible. */
  shownAt: number
  /** Bilan, dès qu'il est connu (tout de suite hors enregistrement, à la réponse du serveur sinon). */
  summary: MortarSeriesSummary | null
  /** Fin de série en cours d'envoi. */
  finishing: boolean
  seriesId: string | null
}

async function requestSeries(difficulty: MortarDifficulty): Promise<StartedSeries> {
  try {
    const response = await fetch('/api/mortar/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty }),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error('Série refusée')
    const payload = (await response.json()) as Partial<MortarSeriesStart> | null
    if (!payload || typeof payload.seed !== 'string' || payload.seed.length === 0) throw new Error('Graine absente')
    const recorded = payload.recorded === true && typeof payload.seriesId === 'string' && payload.seriesId.length > 0
    return { seriesId: recorded ? (payload.seriesId as string) : null, seed: payload.seed, origin: recorded ? 'recorded' : 'visitor' }
  } catch {
    return { seriesId: null, seed: randomMortarSeed(), origin: 'offline' }
  }
}

/**
 * Série demandée et pas encore jouée : un nouveau montage de la page dans les secondes qui suivent la reprend au lieu
 * d'en demander une autre. Le shell remonte la page quand la session arrive, et le mode strict du développement rejoue
 * les effets : sans cela, chaque visite d'un membre enregistrerait une série abandonnée de plus. Oubliée au premier tir.
 */
let unplayedStart: { difficulty: MortarDifficulty; at: number; promise: Promise<StartedSeries> } | null = null
const UNPLAYED_REUSE_MS = 15_000

function startSeries(difficulty: MortarDifficulty) {
  const now = Date.now()
  if (unplayedStart && unplayedStart.difficulty === difficulty && now - unplayedStart.at < UNPLAYED_REUSE_MS) return unplayedStart.promise
  const promise = requestSeries(difficulty)
  unplayedStart = { difficulty, at: now, promise }
  return promise
}

function markSeriesPlayed() {
  unplayedStart = null
}

async function requestFinish(seriesId: string, shots: MortarShotInput[]): Promise<MortarSeriesFinish | null> {
  try {
    const response = await fetch(`/api/mortar/series/${encodeURIComponent(seriesId)}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shots }),
      cache: 'no-store',
    })
    if (!response.ok) return null
    const payload = (await response.json()) as MortarSeriesFinish | null
    return payload && payload.score && Array.isArray(payload.score.results) ? payload : null
  } catch {
    return null
  }
}

export function useMortarSeries(difficulty: MortarDifficulty, round: number, onRecorded: () => void) {
  const [series, setSeries] = useState<MortarSeriesState | null>(null)
  // Horloge du chronomètre (performance.now()), avancée par un intervalle pendant la visée.
  const [now, setNow] = useState(0)
  // Une seule demande de série par `round` (voir aussi `startSeries`, entre deux montages).
  const pendingStart = useRef<{ round: number; promise: Promise<StartedSeries> } | null>(null)
  const finishSent = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    if (pendingStart.current?.round !== round) pendingStart.current = { round, promise: startSeries(difficulty) }
    void pendingStart.current.promise.then((started) => {
      if (cancelled) return
      const shownAt = performance.now()
      setSeries({
        round,
        difficulty,
        origin: started.origin,
        seriesId: started.seriesId,
        targets: generateMortarTargets(started.seed, difficulty),
        index: 0,
        setting: MORTAR_DEFAULT_SETTING,
        shots: [],
        phase: 'aiming',
        shownAt,
        summary: null,
        finishing: false,
      })
      setNow(shownAt)
    })
    return () => {
      cancelled = true
    }
  }, [round, difficulty])

  const current = series && series.round === round ? series : null
  const aiming = current?.phase === 'aiming'

  useEffect(() => {
    if (!aiming) return
    const timer = window.setInterval(() => setNow(performance.now()), 250)
    return () => window.clearInterval(timer)
  }, [aiming])

  // Fin d'une série enregistrée : envoyée une fois, le bilan du serveur remplace l'attente.
  useEffect(() => {
    if (!series || !series.finishing || !series.seriesId || finishSent.current === series.round) return
    finishSent.current = series.round
    const { round: finishedRound, seriesId, shots, targets, difficulty: level } = series
    void requestFinish(seriesId, shots).then((finish) => {
      setSeries((state) =>
        state && state.round === finishedRound
          ? {
              ...state,
              finishing: false,
              summary: finish
                ? { score: finish.score, finish, finishFailed: false }
                : { score: scoreMortarSeries(targets, shots, level), finish: null, finishFailed: true },
            }
          : state
      )
      if (finish) onRecorded()
    })
  }, [series, onRecorded])

  const setSetting = useCallback((value: number) => {
    setSeries((state) => (state && state.phase === 'aiming' ? { ...state, setting: clampSetting(value) } : state))
  }, [])

  const nudge = useCallback((delta: number) => {
    setSeries((state) => (state && state.phase === 'aiming' ? { ...state, setting: clampSetting(state.setting + delta) } : state))
  }, [])

  const fire = useCallback(() => {
    const firedAt = performance.now()
    markSeriesPlayed()
    setSeries((state) => {
      if (!state || state.phase !== 'aiming') return state
      const shots = [...state.shots, { setting: state.setting, timeMs: aimTime(state.shownAt, firedAt) }]
      if (shots.length < MORTAR_TARGETS_PER_SERIES) return { ...state, shots, phase: 'result' }
      const recorded = state.origin === 'recorded' && state.seriesId !== null
      return {
        ...state,
        shots,
        phase: 'result',
        finishing: recorded,
        summary: recorded ? null : { score: scoreMortarSeries(state.targets, shots, state.difficulty), finish: null, finishFailed: false },
      }
    })
    setNow(firedAt)
  }, [])

  const next = useCallback(() => {
    const shownAt = performance.now()
    setSeries((state) => {
      if (!state || state.phase !== 'result') return state
      if (state.shots.length >= MORTAR_TARGETS_PER_SERIES) return { ...state, phase: 'summary' }
      return { ...state, phase: 'aiming', index: state.index + 1, setting: MORTAR_DEFAULT_SETTING, shownAt }
    })
    setNow(shownAt)
  }, [])

  /** Temps de visée cumulé de la série (chronomètre) : tirs faits, plus la cible en cours. */
  const elapsedMs = current
    ? current.shots.reduce((sum, shot) => sum + shot.timeMs, 0) + (current.phase === 'aiming' ? Math.max(0, now - current.shownAt) : 0)
    : 0

  return {
    /** Série affichée : celle demandée, ou la précédente (estompée) pendant le chargement de la suivante. */
    series,
    loading: current === null,
    elapsedMs,
    setSetting,
    nudge,
    fire,
    next,
  }
}
