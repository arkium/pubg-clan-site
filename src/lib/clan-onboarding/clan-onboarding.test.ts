import { describe, expect, it } from 'vitest'

import { buildClanOnboarding, type ClanOnboardingFacts } from '@/lib/clan-onboarding/build'

/**
 * Mise en route d'un clan (src/lib/clan-onboarding/build.ts) : l'état de chaque étape et l'action proposée, sur les
 * cas rencontrés en production le 2026-10-19 — clan en attente, clan d'un seul joueur, Owner invité ou sans compte,
 * télémétrie à lancer, clan sans clan PUBG.
 */

const NOW = new Date('2026-10-19T12:00:00.000Z')

function facts(overrides: Partial<ClanOnboardingFacts> = {}): ClanOnboardingFacts {
  return {
    clan: {
      id: 430,
      name: 'Geniuses',
      tag: 'GENI',
      pubgClanId: 'clan.geni',
      isActive: true,
      archivedAt: null,
      archivedReason: null,
      subdomain: 'geni',
      createdAt: new Date('2026-10-18T17:48:13.000Z'),
    },
    owners: [{ playerName: 'Bremstyle', active: true, hasAccount: true, invite: null }],
    activeMembers: 9,
    pendingJoinRequests: 0,
    detectedCandidates: 0,
    matches: { individual: 900, squads: 108, officialSquads: 104, lastSquadAt: new Date('2026-10-18T21:00:00.000Z') },
    lastMatchSync: { status: 'success', startedAt: new Date('2026-10-19T00:00:00.000Z') },
    telemetry: { toQueue: 0, urgent: 0, inQueue: 0, completionRate: 100 },
    statsReady: true,
    ...overrides,
  }
}

const statuses = (onboarding: ReturnType<typeof buildClanOnboarding>) =>
  Object.fromEntries(onboarding.steps.map((step) => [step.key, step.status]))
const step = (onboarding: ReturnType<typeof buildClanOnboarding>, key: string) => onboarding.steps.find((entry) => entry.key === key)!

describe('clan entièrement en route', () => {
  it('sept étapes faites, rien à faire', () => {
    const onboarding = buildClanOnboarding(facts(), NOW)
    expect(onboarding.done).toBe(7)
    expect(onboarding.total).toBe(7)
    expect(onboarding.nextTodo).toBeNull()
    expect(onboarding.clan).toMatchObject({ state: 'active', subdomain: 'geni', createdAt: '2026-10-18T17:48:13.000Z' })
    expect(step(onboarding, 'validation').detail).toBe('Clan suivi, sous-domaine « geni ».')
    expect(step(onboarding, 'telemetry').detail).toBe('Parties analysées (100 %).')
  })
})

describe('clan en attente ou archivé', () => {
  it('en attente : seule la validation est à faire, la suite est bloquée', () => {
    const onboarding = buildClanOnboarding(
      facts({ clan: { ...facts().clan, isActive: false, subdomain: null }, matches: { individual: 0, squads: 0, officialSquads: 0, lastSquadAt: null }, telemetry: null, statsReady: false }),
      NOW
    )
    expect(statuses(onboarding)).toEqual({
      validation: 'todo',
      owner: 'blocked',
      members: 'blocked',
      matches: 'blocked',
      telemetry: 'blocked',
      stats: 'blocked',
      league: 'waiting',
    })
    expect(onboarding.nextTodo?.key).toBe('validation')
    expect(step(onboarding, 'validation').actions).toEqual([{ kind: 'link', label: 'Clans en attente', href: '/settings/clans/lifecycle?tab=pending' }])
  })

  it('refusé : bloqué, avec la date', () => {
    const onboarding = buildClanOnboarding(
      facts({ clan: { ...facts().clan, isActive: false, archivedAt: new Date('2026-10-10T10:00:00.000Z'), archivedReason: 'rejected' } }),
      NOW
    )
    expect(step(onboarding, 'validation')).toMatchObject({ status: 'blocked', detail: 'Demande refusée le 10 octobre.' })
    expect(onboarding.clan.state).toBe('archived')
  })
})

describe('Owner', () => {
  it('invitation en cours : en cours ; expirée ou absente : à faire, mais facultative', () => {
    const invited = buildClanOnboarding(facts({ owners: [{ playerName: 'Bremstyle', active: true, hasAccount: false, invite: { expiresAt: new Date('2026-10-21T16:55:00.000Z') } }] }), NOW)
    expect(step(invited, 'owner')).toMatchObject({ status: 'waiting', optional: true, detail: 'Invitation envoyée à Bremstyle, valable jusqu’au 21 octobre à 18:55.' })

    const expired = buildClanOnboarding(facts({ owners: [{ playerName: 'Bremstyle', active: true, hasAccount: false, invite: { expiresAt: new Date('2026-10-01T00:00:00.000Z') } }] }), NOW)
    expect(step(expired, 'owner').status).toBe('todo')
    expect(step(expired, 'owner').detail).toContain('a expiré')
    // Facultative : un Owner sans compte ne fait pas du clan un clan « à suivre ».
    expect(expired.nextTodo).toBeNull()

    const none = buildClanOnboarding(facts({ owners: [] }), NOW)
    expect(step(none, 'owner').detail).toContain('Aucun Owner')
    expect(step(none, 'owner').actions[0]).toEqual({ kind: 'link', label: 'Membres du clan', href: '/clans/430/settings/members' })
  })
})

describe('joueurs, parties, télémétrie', () => {
  it('un seul joueur : membres à faire, avec demandes et candidats ; parties sans escouade', () => {
    const onboarding = buildClanOnboarding(
      facts({
        activeMembers: 1,
        pendingJoinRequests: 2,
        detectedCandidates: 5,
        matches: { individual: 40, squads: 0, officialSquads: 0, lastSquadAt: null },
        telemetry: null,
        statsReady: false,
      }),
      NOW
    )
    expect(onboarding.nextTodo?.key).toBe('members')
    expect(step(onboarding, 'members').actions.map((action) => action.label)).toEqual([
      'Demandes d’adhésion (2)',
      'Candidats détectés (5)',
      'Ajouter un joueur',
    ])
    expect(step(onboarding, 'matches')).toMatchObject({ status: 'todo', actions: [{ kind: 'sync_matches', label: 'Synchroniser les matchs' }] })
    expect(step(onboarding, 'matches').detail).toContain('40 parties importées, aucune jouée à deux membres suivis')
    expect(statuses(onboarding)).toMatchObject({ telemetry: 'blocked', stats: 'blocked', league: 'waiting' })
  })

  it('aucune partie : synchronisation proposée, avec la dernière tentative en échec', () => {
    const onboarding = buildClanOnboarding(
      facts({
        matches: { individual: 0, squads: 0, officialSquads: 0, lastSquadAt: null },
        lastMatchSync: { status: 'failed', startedAt: new Date('2026-10-19T00:00:00.000Z') },
        telemetry: null,
        statsReady: false,
      }),
      NOW
    )
    expect(onboarding.nextTodo?.key).toBe('matches')
    expect(step(onboarding, 'matches').detail).toContain('Dernière synchronisation : 19 octobre à 02:00 (en échec).')
  })

  it('télémétrie : à mettre en file (avec urgences), en file, ou faite', () => {
    const toQueue = buildClanOnboarding(facts({ telemetry: { toQueue: 30, urgent: 4, inQueue: 0, completionRate: 40 }, statsReady: false }), NOW)
    expect(step(toQueue, 'telemetry')).toMatchObject({ status: 'todo', detail: '30 parties à mettre en file, dont 4 qui expirent sous 7 jours.' })
    expect(step(toQueue, 'telemetry').actions[0]).toEqual({ kind: 'enqueue_telemetry', label: 'Mettre en file' })
    expect(step(toQueue, 'stats').status).toBe('waiting')

    const queued = buildClanOnboarding(facts({ telemetry: { toQueue: 0, urgent: 0, inQueue: 12, completionRate: 60 } }), NOW)
    expect(step(queued, 'telemetry')).toMatchObject({ status: 'waiting', detail: '12 analyses en file : le worker les traite.' })
  })
})

describe('ligue', () => {
  it('sans clan PUBG : bloqué pour de bon', () => {
    const onboarding = buildClanOnboarding(facts({ clan: { ...facts().clan, pubgClanId: null } }), NOW)
    expect(step(onboarding, 'league').status).toBe('blocked')
    expect(onboarding.done).toBe(6)
  })
})
