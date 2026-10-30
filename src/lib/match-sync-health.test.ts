import { describe, expect, it } from 'vitest'

import {
  clearPending,
  decideMatchSyncAlert,
  emptyMatchSyncHealthState,
  expirePending,
  MAX_PENDING,
  MAX_STORED_DELAYS,
  notePendingFailure,
  parseMatchSyncHealthState,
  pendingRetryIds,
  recordPass,
  recordSkippedTrigger,
  summarizeMatchSyncHealth,
  type MatchSyncHealthState,
  type MatchSyncPassRecord,
  type PubgCallCounts,
} from '@/lib/match-sync-health'

const NOW = new Date('2026-10-30T20:00:00Z')
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)
const iso = (minutes: number) => minutesAgo(minutes).toISOString()

function pass(overrides: Partial<MatchSyncPassRecord> & { endedMinutesAgo?: number; durationMinutes?: number } = {}): MatchSyncPassRecord {
  const ended = overrides.endedMinutesAgo ?? 5
  const duration = overrides.durationMinutes ?? 13
  return {
    startedAt: iso(ended + duration),
    finishedAt: iso(ended),
    clans: 45,
    failedClans: 0,
    importedMatches: 10,
    delays: [],
    catchUps: 0,
    ...overrides,
  }
}

function stateWith(passes: MatchSyncPassRecord[], extra: Partial<MatchSyncHealthState> = {}): MatchSyncHealthState {
  return { ...emptyMatchSyncHealthState(), passes, ...extra }
}

const calls = (overrides: Partial<PubgCallCounts> = {}): PubgCallCounts => ({
  at: iso(5),
  limitedLastHour: 545,
  ceilingPerHour: 600,
  http429Last24h: 0,
  actionLast24h: 0,
  transientLastHour: 0,
  ...overrides,
})

const summarize = (state: MatchSyncHealthState, intervalMinutes: number | null = 30) => summarizeMatchSyncHealth(state, { now: NOW, intervalMinutes })
const reasonKeys = (state: MatchSyncHealthState) => summarize(state).reasons.map((reason) => `${reason.key}:${reason.tone}`)
const delaysOf = (count: number, value: number) => Array.from({ length: count }, () => value)

describe('état glissant de 24 h', () => {
  it('retire les tours et les tours sautés de plus de 24 h', () => {
    let state = stateWith([pass({ endedMinutesAgo: 25 * 60 }), pass({ endedMinutesAgo: 60 })], { skipped: [iso(26 * 60), iso(30)] })
    state = recordPass(state, pass({ endedMinutesAgo: 1 }), NOW)
    expect(state.passes).toHaveLength(2)
    expect(state.skipped).toEqual([iso(30)])
  })

  it('borne les délais gardés : les plus anciens partent d’abord', () => {
    const old = pass({ endedMinutesAgo: 120, delays: delaysOf(MAX_STORED_DELAYS, 99) })
    const state = recordPass(stateWith([old]), pass({ endedMinutesAgo: 1, delays: [10, 11, 12] }), NOW)
    const all = state.passes.flatMap((entry) => entry.delays)
    expect(all).toHaveLength(MAX_STORED_DELAYS)
    expect(state.passes.at(-1)?.delays).toEqual([10, 11, 12])
    expect(old.delays).toHaveLength(MAX_STORED_DELAYS) // l'état d'origine n'est pas modifié
  })

  it('note un tour sauté', () => {
    const state = recordSkippedTrigger(stateWith([], { skipped: [iso(25 * 60)] }), NOW)
    expect(state.skipped).toEqual([NOW.toISOString()])
  })

  it('relit l’état enregistré, et refuse une valeur illisible', () => {
    const state = recordPass(emptyMatchSyncHealthState(), pass({ delays: [12] }), NOW)
    expect(parseMatchSyncHealthState(JSON.stringify(state))).toEqual(state)
    expect(parseMatchSyncHealthState('{pas du json')).toBeNull()
    expect(parseMatchSyncHealthState(JSON.stringify({ version: 2 }))).toBeNull()
  })
})

describe('parties en attente', () => {
  const failure = (matchId: string, memberId = 7, at = minutesAgo(30)) => ({ matchId, clanId: 25, memberId, status: 404, at })

  it('ajoute un échec, compte les essais suivants, et retente la partie pour ce membre seulement', () => {
    let pending = notePendingFailure([], failure('m1'))
    pending = notePendingFailure(pending, { ...failure('m1'), status: 502, at: minutesAgo(1) })
    expect(pending).toEqual([
      expect.objectContaining({ matchId: 'm1', attempts: 2, lastStatus: 502, firstFailedAt: iso(30), lastFailedAt: iso(1), lostAt: null }),
    ])
    expect(pendingRetryIds(pending, 7)).toEqual(['m1'])
    expect(pendingRetryIds(pending, 8)).toEqual([])
  })

  it('sort une partie importée', () => {
    const pending = notePendingFailure(notePendingFailure([], failure('m1')), failure('m1', 8))
    expect(clearPending(pending, 7, 'm1')).toEqual([expect.objectContaining({ memberId: 8 })])
  })

  it('perd une partie après 24 h ou 6 essais, ne la retente plus, l’oublie après 7 jours', () => {
    let pending = notePendingFailure([], failure('vieille', 7, minutesAgo(24 * 60)))
    pending = notePendingFailure(pending, failure('essais'))
    for (let attempt = 0; attempt < 5; attempt += 1) pending = notePendingFailure(pending, failure('essais'))
    pending = notePendingFailure(pending, failure('recente'))
    pending = expirePending(pending, NOW)

    expect(pending.filter((entry) => entry.lostAt).map((entry) => entry.matchId)).toEqual(['vieille', 'essais'])
    expect(pendingRetryIds(pending, 7)).toEqual(['recente'])
    expect(expirePending(pending, new Date(NOW.getTime() + 7 * 24 * 3_600_000)).map((entry) => entry.matchId)).toEqual(['recente'])
  })

  it('borne la liste : les perdues les plus anciennes partent d’abord', () => {
    let pending = expirePending(notePendingFailure([], failure('perdue', 7, minutesAgo(25 * 60))), NOW)
    for (let index = 0; index < MAX_PENDING; index += 1) pending = notePendingFailure(pending, failure(`m${index}`))
    expect(pending).toHaveLength(MAX_PENDING)
    expect(pending.some((entry) => entry.matchId === 'perdue')).toBe(false)
  })
})

describe('résumé', () => {
  it('sans tour : pas encore de mesure, rien à signaler', () => {
    const summary = summarize(emptyMatchSyncHealthState())
    expect(summary.measured).toBe(false)
    expect(summary.delay).toMatchObject({ count: 0, median: null, p90: null })
    expect(summary.status).toBe('ok')
  })

  it('calcule médiane, 90 %, part sous 45 min, dernier tour et marge', () => {
    const delays = [...delaysOf(10, 10), ...delaysOf(9, 20), 50]
    const summary = summarize(stateWith([pass({ delays: delays.slice(0, 10), catchUps: 1 }), pass({ endedMinutesAgo: 1, delays: delays.slice(10) })]))
    expect(summary.delay).toEqual({ count: 20, median: 20, p90: 20, underPromiseShare: 1 - 0.1 / 2, catchUps: 1, toned: true })
    expect(summary.lastPass).toMatchObject({ durationMinutes: 13, clans: 45 })
    expect(summary.passes).toMatchObject({ count: 2, medianDurationMinutes: 13, marginRatio: 0.43 })
    expect(summary.status).toBe('ok')
  })

  it('délai à 90 % : en ordre jusqu’à 60 min, à traiter au-delà, urgent au-delà de 120 min — sur 20 parties au moins', () => {
    expect(reasonKeys(stateWith([pass({ delays: delaysOf(20, 60) })]))).toEqual([])
    expect(reasonKeys(stateWith([pass({ delays: delaysOf(20, 61) })]))).toEqual(['delay:todo'])
    expect(reasonKeys(stateWith([pass({ delays: delaysOf(20, 121) })]))).toEqual(['delay:urgent'])
    expect(reasonKeys(stateWith([pass({ delays: delaysOf(19, 300) })]))).toEqual([])
  })

  it('marge : un tour au-delà de 80 % de l’intervalle est à traiter', () => {
    expect(reasonKeys(stateWith([pass({ durationMinutes: 24 })]))).toEqual([])
    expect(reasonKeys(stateWith([pass({ durationMinutes: 25 })]))).toEqual(['margin:todo'])
  })

  it('tours sautés : un en 24 h est à traiter, trois de suite depuis le dernier tour sont urgents', () => {
    const lastPass = pass({ endedMinutesAgo: 5, durationMinutes: 13 })
    expect(reasonKeys(stateWith([lastPass], { skipped: [iso(300)] }))).toEqual(['skipped:todo'])
    expect(reasonKeys(stateWith([lastPass], { skipped: [iso(3), iso(2), iso(1)] }))).toEqual(['skipped:urgent'])
  })

  it('synchronisation arrêtée : aucun tour terminé depuis plus de 2 intervalles + 30 min', () => {
    expect(reasonKeys(stateWith([pass({ endedMinutesAgo: 90 })]))).toEqual([])
    expect(reasonKeys(stateWith([pass({ endedMinutesAgo: 91 })]))).toEqual(['stale:urgent'])
  })

  it('appels PUBG : quota à 95 %, 429, échecs à traiter, échecs passagers', () => {
    const at = (overrides: Partial<PubgCallCounts>) => reasonKeys(stateWith([pass()], { calls: calls(overrides) }))
    expect(at({})).toEqual([])
    expect(at({ limitedLastHour: 569 })).toEqual([])
    expect(at({ limitedLastHour: 570 })).toEqual(['quota:todo'])
    expect(at({ http429Last24h: 1 })).toEqual(['http429:todo'])
    expect(at({ http429Last24h: 20 })).toEqual(['http429:urgent'])
    expect(at({ actionLast24h: 1 })).toEqual(['action:urgent'])
    expect(at({ transientLastHour: 9 })).toEqual([])
    expect(at({ transientLastHour: 10 })).toEqual(['transient:todo'])
    expect(summarize(stateWith([pass()], { calls: calls({ limitedLastHour: 300 }) })).calls?.quotaRatio).toBe(0.5)
  })

  it('parties perdues : à traiter ; en attente : affichées, sans alerte ; une partie compte une fois pour ses membres', () => {
    let pending = notePendingFailure([], { matchId: 'perdue', clanId: 25, memberId: 1, status: 404, at: minutesAgo(25 * 60) })
    pending = notePendingFailure(pending, { matchId: 'attente', clanId: 25, memberId: 1, status: 404, at: minutesAgo(20) })
    pending = notePendingFailure(pending, { matchId: 'attente', clanId: 25, memberId: 2, status: 404, at: minutesAgo(19) })
    const summary = summarize(stateWith([pass()], { pending: expirePending(pending, NOW) }))
    expect(summary.pending).toMatchObject({ waiting: 1, lost: 1, oldestFailedAt: iso(20) })
    expect(summary.reasons.map((reason) => reason.key)).toEqual(['lost'])
    expect(summary.status).toBe('todo')
  })

  it('l’urgent passe devant et fixe l’état', () => {
    const summary = summarize(stateWith([pass({ delays: delaysOf(20, 61) })], { calls: calls({ actionLast24h: 2 }) }))
    expect(summary.reasons.map((reason) => reason.key)).toEqual(['action', 'delay'])
    expect(summary.status).toBe('urgent')
  })
})

describe('décision d’alerte', () => {
  const ok = { status: 'ok' as const, lastAlertAt: null }

  it('prévient à l’entrée dans un état dégradé, puis pas à chaque tour', () => {
    const first = decideMatchSyncAlert(ok, 'todo', NOW)
    expect(first.send).toBe('alert')
    expect(decideMatchSyncAlert(first.alert, 'todo', new Date(NOW.getTime() + 30 * 60_000)).send).toBeNull()
  })

  it('rappelle au plus toutes les 6 h, et tout de suite si l’état s’aggrave', () => {
    const first = decideMatchSyncAlert(ok, 'todo', NOW).alert
    expect(decideMatchSyncAlert(first, 'todo', new Date(NOW.getTime() + 6 * 3_600_000)).send).toBe('alert')
    expect(decideMatchSyncAlert(first, 'urgent', new Date(NOW.getTime() + 60_000)).send).toBe('alert')
  })

  it('annonce une fois le retour à la normale', () => {
    const degraded = decideMatchSyncAlert(ok, 'urgent', NOW).alert
    const recovered = decideMatchSyncAlert(degraded, 'ok', new Date(NOW.getTime() + 60_000))
    expect(recovered.send).toBe('recovered')
    expect(decideMatchSyncAlert(recovered.alert, 'ok', new Date(NOW.getTime() + 120_000)).send).toBeNull()
  })
})
