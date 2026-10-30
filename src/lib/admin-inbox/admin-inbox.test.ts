import { describe, expect, it } from 'vitest'

import {
  actionableInboxItems,
  buildAdminInbox,
  LIFECYCLE_STALE_HOURS,
  PENDING_CLAN_URGENT_DAYS,
  type AdminInboxFacts,
} from '@/lib/admin-inbox/build'

/**
 * Boîte « À traiter » (src/lib/admin-inbox/build.ts) : ce qui apparaît, avec quel ton, et ce qui ne doit jamais
 * apparaître — une file vide, une source illisible comptée à zéro, un incident du cycle de vie hors production.
 */

const NOW = new Date('2026-10-19T09:00:00.000Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 60 * 60 * 1000)

function facts(overrides: Partial<AdminInboxFacts> = {}): AdminInboxFacts {
  return {
    pendingClans: [],
    onboardingClans: [],
    orphanJoinRequests: [],
    privacyDeadlines: [],
    resourceQueue: 0,
    unacknowledgedMoves: 0,
    archiveCandidates: 0,
    lastLifecycleRun: { status: 'success', startedAt: hoursAgo(7), circuitBreakerTripped: false },
    cronJobsExpected: true,
    telemetry: { workerAlive: true, queueRemaining: 0, urgentBacklog: 0 },
    cronFailures: [],
    configErrors: 0,
    coachInaccurateVotes: 0,
    matchSync: { status: 'ok', reasons: [] },
    ...overrides,
  }
}

const keys = (inbox: ReturnType<typeof buildAdminInbox>) => inbox.items.map((item) => item.key)

describe('boîte vide', () => {
  it('ne montre rien quand toutes les files sont vides et que tout tourne', () => {
    const inbox = buildAdminInbox(facts(), NOW)
    expect(inbox.items).toEqual([])
    expect(inbox.unavailable).toEqual([])
    expect(inbox.generatedAt).toBe(NOW.toISOString())
  })
})

describe('clans en attente', () => {
  it('nomme le plus ancien et passe en urgent au-delà d’une semaine', () => {
    const recent = buildAdminInbox(facts({ pendingClans: [{ id: 1, tag: 'NEW', name: 'Neuf', createdAt: daysAgo(2) }] }), NOW)
    expect(recent.items[0]).toMatchObject({ key: 'pending_clans', tone: 'todo', count: 1, detail: 'Le plus ancien, [NEW], attend depuis 2 jours.' })

    const old = buildAdminInbox(
      facts({
        pendingClans: [
          { id: 1, tag: 'NEW', name: 'Neuf', createdAt: daysAgo(1) },
          { id: 2, tag: 'FYB', name: 'FackYourBird', createdAt: daysAgo(PENDING_CLAN_URGENT_DAYS + 5) },
        ],
      }),
      NOW
    )
    expect(old.items[0]).toMatchObject({ tone: 'urgent', count: 2, detail: 'Le plus ancien, [FYB], attend depuis 12 jours.' })
    expect(old.items[0].href).toBe('/settings/clans/lifecycle?tab=pending')
  })

  it('arrivé aujourd’hui : pas de « depuis 0 jour »', () => {
    const inbox = buildAdminInbox(facts({ pendingClans: [{ id: 3, tag: 'TDY', name: 'Today', createdAt: hoursAgo(3) }] }), NOW)
    expect(inbox.items[0].detail).toBe('[TDY] est arrivé aujourd’hui.')
  })
})

describe('clans en cours de mise en route', () => {
  it('donne l’avancement et l’étape suivante de chaque clan, avec un lien par clan', () => {
    const inbox = buildAdminInbox(
      facts({
        onboardingClans: [
          { clan: { id: 427, tag: 'BAN', name: 'BanAndNotorious' }, nextStep: 'Au moins deux joueurs suivis', done: 4, total: 7 },
          { clan: { id: 416, tag: 'SNAX', name: 'SNAX-GAMING' }, nextStep: 'Télémétrie analysée', done: 5, total: 7 },
        ],
      }),
      NOW
    )
    expect(inbox.items[0]).toMatchObject({
      key: 'onboarding',
      tone: 'todo',
      count: 2,
      detail: '[BAN] 4/7 — Au moins deux joueurs suivis · [SNAX] 5/7 — Télémétrie analysée',
      href: '/settings/clans/427/mise-en-route',
    })
    expect(inbox.items[0].links?.[1]).toEqual({ label: '[SNAX]', href: '/settings/clans/416/mise-en-route' })
  })
})

describe('demandes d’adhésion sans Owner', () => {
  it('regroupe par clan, mène au premier, et ajoute un lien par clan quand il y en a plusieurs', () => {
    const one = buildAdminInbox(facts({ orphanJoinRequests: [{ playerName: 'papy_0', clan: { id: 17, tag: 'OCD', name: 'OCD' } }] }), NOW)
    expect(one.items[0]).toMatchObject({ key: 'orphan_join_requests', count: 1, detail: 'papy_0 → [OCD]', href: '/clans/17/settings/members?tab=demandes' })
    expect(one.items[0].links).toBeUndefined()

    const many = buildAdminInbox(
      facts({
        orphanJoinRequests: [
          { playerName: 'A', clan: { id: 17, tag: 'OCD', name: 'OCD' } },
          { playerName: 'B', clan: { id: 19, tag: 'XYZ', name: 'XYZ' } },
          { playerName: 'C', clan: { id: 17, tag: 'OCD', name: 'OCD' } },
        ],
      }),
      NOW
    )
    expect(many.items[0].detail).toBe('A, C → [OCD] · B → [XYZ]')
    expect(many.items[0].links).toEqual([
      { label: '[OCD]', href: '/clans/17/settings/members?tab=demandes' },
      { label: '[XYZ]', href: '/clans/19/settings/members?tab=demandes' },
    ])
  })
})

describe('demandes de confidentialité', () => {
  it('donne l’échéance la plus proche, urgente à moins d’une semaine ou dépassée', () => {
    const far = buildAdminInbox(facts({ privacyDeadlines: [new Date('2026-11-18T10:00:00.000Z'), new Date('2026-11-02T10:00:00.000Z')] }), NOW)
    expect(far.items[0]).toMatchObject({ key: 'privacy_requests', tone: 'todo', count: 2, detail: 'Échéance la plus proche : 2 novembre.' })

    const soon = buildAdminInbox(facts({ privacyDeadlines: [daysAgo(-3)] }), NOW)
    expect(soon.items[0].tone).toBe('urgent')

    const overdue = buildAdminInbox(facts({ privacyDeadlines: [daysAgo(1), daysAgo(-20)] }), NOW)
    expect(overdue.items[0]).toMatchObject({ tone: 'urgent', detail: '1 demande au-delà de l’échéance légale d’un mois.' })
  })
})

describe('cycle de vie des clans', () => {
  it('signale un coupe-circuit, un échec, un arrêt prolongé ou une absence de passage', () => {
    const tripped = buildAdminInbox(facts({ lastLifecycleRun: { status: 'success', startedAt: hoursAgo(7), circuitBreakerTripped: true } }), NOW)
    expect(tripped.items[0]).toMatchObject({ key: 'lifecycle', tone: 'urgent', label: 'Dernier passage du cycle de vie abandonné' })

    const failed = buildAdminInbox(facts({ lastLifecycleRun: { status: 'failed', startedAt: hoursAgo(7), circuitBreakerTripped: false } }), NOW)
    expect(failed.items[0].label).toBe('Dernier passage du cycle de vie en échec')

    const stale = buildAdminInbox(
      facts({ lastLifecycleRun: { status: 'success', startedAt: hoursAgo(LIFECYCLE_STALE_HOURS + 20), circuitBreakerTripped: false } }),
      NOW
    )
    expect(stale.items[0]).toMatchObject({ label: 'Cycle de vie des clans à l’arrêt', detail: 'Aucun passage depuis 50 heures.' })

    expect(keys(buildAdminInbox(facts({ lastLifecycleRun: undefined }), NOW))).toEqual(['lifecycle'])
  })

  it('hors production (crons coupés), un passage ancien ou absent n’est pas un incident', () => {
    const offline = { cronJobsExpected: false }
    expect(buildAdminInbox(facts({ ...offline, lastLifecycleRun: { status: 'success', startedAt: daysAgo(10), circuitBreakerTripped: false } }), NOW).items).toEqual([])
    expect(buildAdminInbox(facts({ ...offline, lastLifecycleRun: undefined }), NOW).items).toEqual([])
  })
})

describe('télémétrie, tâches planifiées, configuration', () => {
  it('worker arrêté seulement s’il laisse une file en plan ; parties qui expirent', () => {
    expect(buildAdminInbox(facts({ telemetry: { workerAlive: false, queueRemaining: 0, urgentBacklog: 0 } }), NOW).items).toEqual([])

    const inbox = buildAdminInbox(facts({ telemetry: { workerAlive: false, queueRemaining: 12, urgentBacklog: 5 } }), NOW)
    expect(keys(inbox)).toEqual(['telemetry_worker', 'telemetry_expiring'])
    expect(inbox.items[0]).toMatchObject({ tone: 'urgent', count: 12, detail: '12 analyses en file n’avancent plus.' })
    expect(inbox.items[1]).toMatchObject({ tone: 'todo', count: 5 })
    expect(inbox.items[1].detail).toContain('12 analyses en file en ce moment.')
  })

  it('regroupe les échecs de cron par tâche, avec les clans touchés', () => {
    const inbox = buildAdminInbox(
      facts({
        cronFailures: [
          { label: 'Sync quotidien clans', clanTag: 'GFG' },
          { label: 'Sync quotidien clans', clanTag: 'FR' },
          { label: 'Sync quotidien clans', clanTag: 'GFG' },
          { label: 'Recalcul stats quotidien', clanTag: null },
        ],
      }),
      NOW
    )
    expect(inbox.items[0]).toMatchObject({
      key: 'cron_failures',
      tone: 'urgent',
      count: 4,
      detail: 'Sync quotidien clans : [GFG], [FR] · Recalcul stats quotidien',
    })
  })

  it('erreurs de configuration', () => {
    expect(buildAdminInbox(facts({ configErrors: 2 }), NOW).items[0]).toMatchObject({ key: 'config_errors', tone: 'urgent', count: 2, href: '/settings/configuration' })
  })
})

describe('ordre, sources illisibles et veille', () => {
  it('urgent, puis à traiter, puis à relire ; une source illisible est listée, jamais comptée à zéro', () => {
    const inbox = buildAdminInbox(
      facts({
        unacknowledgedMoves: 45,
        archiveCandidates: 1,
        resourceQueue: 3,
        configErrors: 1,
        telemetry: null,
        cronFailures: null,
      }),
      NOW
    )
    expect(keys(inbox)).toEqual(['config_errors', 'resource_queue', 'unacknowledged_moves', 'archive_candidates'])
    expect(inbox.unavailable).toEqual(['télémétrie', 'tâches planifiées'])
    expect(actionableInboxItems(inbox).map((item) => item.key)).toEqual(['config_errors', 'resource_queue'])
  })
})

describe('synchronisation des parties (docs/TODO/fraicheur-des-parties.md)', () => {
  const reason = (key: string, tone: 'todo' | 'urgent', text: string) => ({ key, tone, text })

  it('rien en ordre ; à traiter ou urgent selon le résumé, la première raison en détail, vers la fraîcheur des parties', () => {
    expect(keys(buildAdminInbox(facts(), NOW))).toEqual([])

    const todo = buildAdminInbox(facts({ matchSync: { status: 'todo', reasons: [reason('lost', 'todo', '1 partie perdue')] } }), NOW)
    expect(todo.items).toEqual([
      { key: 'match_sync', tone: 'todo', count: 1, label: 'Synchronisation des parties', detail: '1 partie perdue', href: '/settings/cron#fraicheur' },
    ])

    const urgent = buildAdminInbox(
      facts({
        matchSync: {
          status: 'urgent',
          reasons: [reason('stale', 'urgent', 'Aucun tour terminé depuis 2 h 10'), reason('lost', 'todo', 'x'), reason('quota', 'todo', 'y')],
        },
      }),
      NOW
    )
    expect(urgent.items[0]).toMatchObject({ tone: 'urgent', count: 3, detail: 'Aucun tour terminé depuis 2 h 10 (et 2 autres)' })
  })

  it('hors production (crons coupés), rien ; source illisible signalée, jamais un zéro', () => {
    const degraded = { status: 'urgent' as const, reasons: [reason('stale', 'urgent', 'Aucun tour')] }
    expect(keys(buildAdminInbox(facts({ cronJobsExpected: false, matchSync: degraded }), NOW))).toEqual([])
    expect(buildAdminInbox(facts({ matchSync: null }), NOW).unavailable).toEqual(['synchronisation des parties'])
  })
})

describe('Coach IA', () => {
  it('liste les votes « Inexact » à relire, pour information, vers l’onglet Questions', () => {
    const inbox = buildAdminInbox(facts({ coachInaccurateVotes: 3 }), NOW)
    expect(inbox.items).toEqual([
      expect.objectContaining({ key: 'coach_inaccurate_votes', tone: 'info', count: 3, href: '/settings/coach/questions' }),
    ])
    expect(actionableInboxItems(inbox)).toEqual([])
  })

  it('signale la source quand elle est illisible, sans afficher de zéro', () => {
    const inbox = buildAdminInbox(facts({ coachInaccurateVotes: null }), NOW)
    expect(inbox.items).toEqual([])
    expect(inbox.unavailable).toEqual(['Coach IA'])
  })
})
