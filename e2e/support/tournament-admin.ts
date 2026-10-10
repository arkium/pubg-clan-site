import type { Page } from '@playwright/test'

import type { ApiMock } from './api'
import { CLAN_ID } from './data'

import { buildTournamentRoundWebhookPayload } from '@/lib/discord/discord-tournament-embed'

/**
 * Administration des tournois d'un clan (e2e/tournament-admin.spec.ts) : organisateur connecté (`manage_settings`),
 * tournois fictifs du clan, création, modification, suppression, synchronisation et diffusion Discord simulées. Les
 * corps des requêtes sont gardés pour vérifier ce que la page envoie — rien n'atteint la base ni Discord.
 */

export const ADMIN_PATH = `/clans/${CLAN_ID}/settings/tournaments`
export const ACTIVE_TOURNAMENT_ID = 'coupe-automne'
export const DRAFT_TOURNAMENT_ID = 'hiver-brouillon'
export const FINISHED_TOURNAMENT_ID = 'solo-showdown'

const DAY = 86_400_000
const at = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()
const ORGANIZER = { id: CLAN_ID, name: 'Clan Démo' }

export type AdminTournament = {
  id: string
  title: string
  description: string | null
  status: string
  startDate: string
  endDate: string
  gameMode: string | null
  mapName: string | null
  rules: unknown
  discordWebhookUrl: string | null
  organizerClan: { id: number; name: string } | null
}

const RULES = {
  placementPoints: { '1': 15, '2': 12, '3': 10, '4': 8, '5': 6, '6': 4, '7': 2, '8': 1, '9': 1, '10': 1 },
  killPoints: 1,
  winBonus: 5,
  bestOfRounds: null,
}

export function adminTournaments(): AdminTournament[] {
  return [
    {
      id: ACTIVE_TOURNAMENT_ID,
      title: 'Coupe d’automne',
      description: 'Quatre clans, cinq soirées, une seule couronne.',
      status: 'active',
      startDate: at(-3 * DAY),
      endDate: at(2 * DAY),
      gameMode: 'normal-squad',
      mapName: 'Baltic_Main',
      rules: { ...RULES, mode: 'inter_clan', mixedSquadRule: 'prorata' },
      discordWebhookUrl: null,
      organizerClan: ORGANIZER,
    },
    {
      // Valeurs héritées d'avant le 2026-09-18 (« Erangel », « squad ») : le formulaire les ramène aux valeurs des matchs.
      id: DRAFT_TOURNAMENT_ID,
      title: 'Coupe d’hiver',
      description: null,
      status: 'draft',
      startDate: at(20 * DAY),
      endDate: at(27 * DAY),
      gameMode: 'squad',
      mapName: 'Erangel',
      rules: { ...RULES, mode: 'custom_teams', mixedSquadRule: 'full_share', bestOfRounds: 3 },
      discordWebhookUrl: 'https://discord.com/api/webhooks/123/abc',
      organizerClan: ORGANIZER,
    },
    {
      id: FINISHED_TOURNAMENT_ID,
      title: 'Solo Showdown',
      description: 'Chacun pour soi, sur Miramar.',
      status: 'finished',
      startDate: at(-20 * DAY),
      endDate: at(-14 * DAY),
      gameMode: 'normal-solo',
      mapName: 'Desert_Main',
      rules: { ...RULES, mode: 'solo_ffa', mixedSquadRule: 'full_share' },
      discordWebhookUrl: null,
      organizerClan: ORGANIZER,
    },
  ]
}

// ── Sessions ────────────────────────────────────────────────────────────────────────────────────────

function session(permissions: string[]) {
  return {
    authenticated: true,
    user: { id: 7, email: 'organisateur@example.com', isSuperUser: false },
    activeMemberId: 1,
    permissions,
    members: [{ memberId: 1, displayName: 'Joueur Alpha', clanId: CLAN_ID, clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' } }],
    isSuperUser: false,
  }
}

/** Organisateur du clan démo : `manage_settings`, sans être SuperUser. */
export function signInAsOrganizer(api: ApiMock) {
  api
    .on('GET', '/api/auth/mode', { body: { authDisabled: false } })
    .on('GET', '/api/members/1', { body: { id: 1, displayName: 'Joueur Alpha', avatarUrl: null, clanId: CLAN_ID } })
    .on('GET', '/api/auth/session', { body: session(['manage_settings']) })
}

/** Membre connecté sans droit de gestion : la page le renvoie vers la vue d'ensemble du clan. */
export function signInWithoutRights(api: ApiMock) {
  api
    .on('GET', '/api/auth/mode', { body: { authDisabled: false } })
    .on('GET', '/api/members/1', { body: { id: 1, displayName: 'Joueur Alpha', avatarUrl: null, clanId: CLAN_ID } })
    .on('GET', '/api/auth/session', { body: session([]) })
}

// ── Diffusion Discord ───────────────────────────────────────────────────────────────────────────────

const ROUNDS = [1, 2, 3].map((roundNumber) => ({
  squadMatchId: `match-${roundNumber}`,
  roundNumber,
  mapName: 'Baltic_Main',
  gameMode: 'normal-squad',
  playedAt: at(-(4 - roundNumber) * 3_600_000),
  // La manche 2 est déjà partie : la modale prévient avant une seconde publication.
  sentAt: roundNumber === 2 ? at(-2 * 3_600_000) : null,
}))

/** Aperçu calculé par le vrai générateur d'embed (mode inter-clans, prorata). */
function roundPreview(matchId: string) {
  const round = ROUNDS.find((entry) => entry.squadMatchId === matchId) ?? ROUNDS[ROUNDS.length - 1]
  const preview = buildTournamentRoundWebhookPayload({
    tournamentId: ACTIVE_TOURNAMENT_ID,
    tournamentTitle: 'Coupe d’automne',
    roundNumber: round.roundNumber,
    totalRounds: ROUNDS.length,
    squadMatchId: round.squadMatchId,
    telemetryClanId: CLAN_ID,
    mapLabel: 'Erangel',
    gameModeLabel: 'Squad (partie perso)',
    playedAt: new Date(round.playedAt),
    mode: 'inter_clan',
    mixedSquadRule: 'prorata',
    results: [
      { label: '[LMT] La Meute', bestPlacement: 1, totalKills: 9, placementScore: 15, killScore: 9, winBonus: 5, points: 29 },
      { label: '[DEMO] Clan Démo', bestPlacement: 2, totalKills: 6, placementScore: 12, killScore: 6, winBonus: 0, points: 18 },
      { label: '[RATZ] Les Ratz', bestPlacement: 5, totalKills: 4, placementScore: 6, killScore: 4, winBonus: 0, points: 10 },
    ],
    mvp: { displayName: 'Wolfy', clanLabel: '[LMT] La Meute', kills: 7, damage: 912 },
    standings: [
      { label: '[LMT] La Meute', totalPoints: 58, totalKills: 18 },
      { label: '[DEMO] Clan Démo', totalPoints: 52.5, totalKills: 21 },
      { label: '[RATZ] Les Ratz', totalPoints: 41, totalKills: 12 },
    ],
    mention: '@here',
    siteUrl: 'https://chickendinner.example',
  })
  return {
    preview,
    roundNumber: round.roundNumber,
    totalRounds: ROUNDS.length,
    usesTournamentOverride: false,
    alreadySentAt: round.sentAt,
  }
}

// ── Mock complet ────────────────────────────────────────────────────────────────────────────────────

export type TournamentAdminCalls = {
  creates: Record<string, unknown>[]
  updates: Array<{ id: string; body: Record<string, unknown> }>
  deletes: string[]
  syncs: string[]
  broadcasts: Array<{ id: string; body: Record<string, unknown> }>
}

/**
 * Toutes les API de la page, avec une liste qui suit les écritures simulées (création, modification, suppression) :
 * le rechargement après un enregistrement montre ce qu'un vrai serveur renverrait. `DELETE` n'est pas géré par
 * `ApiMock` : une route Playwright dédiée, enregistrée après lui, le prend et laisse passer le reste.
 */
export async function mockTournamentAdmin(api: ApiMock, page: Page): Promise<TournamentAdminCalls> {
  const calls: TournamentAdminCalls = { creates: [], updates: [], deletes: [], syncs: [], broadcasts: [] }
  let tournaments = adminTournaments()
  const base = `/api/clans/${CLAN_ID}/tournaments`

  api
    .on('GET', base, () => ({ body: { tournaments, clan: { id: CLAN_ID, name: 'Clan Démo', tag: 'DEMO' } } }))
    .on('POST', base, (_url, request) => {
      const body = request.postDataJSON() as Record<string, unknown>
      calls.creates.push(body)
      const created = { id: `cree-${calls.creates.length}`, organizerClan: ORGANIZER, ...body } as AdminTournament
      tournaments = [created, ...tournaments]
      return { status: 201, body: { tournament: created } }
    })

  for (const tournament of adminTournaments()) {
    const path = `${base}/${tournament.id}`
    api
      .on('PATCH', path, (_url, request) => {
        const body = request.postDataJSON() as Record<string, unknown>
        calls.updates.push({ id: tournament.id, body })
        tournaments = tournaments.map((entry) => (entry.id === tournament.id ? ({ ...entry, ...body } as AdminTournament) : entry))
        return { body: { tournament: tournaments.find((entry) => entry.id === tournament.id) } }
      })
      .on('POST', `${path}/sync`, () => {
        calls.syncs.push(tournament.id)
        // Premier clic : une manche arrive. Clics suivants : PUBG n'a rien publié de plus.
        const first = calls.syncs.filter((id) => id === tournament.id).length === 1
        return {
          body: {
            importedMatches: first ? 2 : 0,
            sourceCustomRows: 12,
            sourceCustomMatches: 3,
            sourceMissingAccounts: 0,
            materializedMatches: 3,
            materializationErrors: [],
            eligibleMatches: 3,
            newRounds: first ? 1 : 0,
            telemetryQueued: 3,
          },
        }
      })
      .on('GET', `${path}/discord`, (url) => {
        const matchId = url.searchParams.get('matchId')
        return { body: matchId ? roundPreview(matchId) : { rounds: ROUNDS } }
      })
      .on('POST', `${path}/discord`, (_url, request) => {
        const body = request.postDataJSON() as Record<string, unknown>
        calls.broadcasts.push({ id: tournament.id, body })
        const round = ROUNDS.find((entry) => entry.squadMatchId === body.matchId)
        return { body: { success: true, message: `Manche #${round?.roundNumber ?? '?'} publiée sur Discord.` } }
      })
  }

  await page.route(`**${base}/*`, (route) => {
    const request = route.request()
    if (request.method() !== 'DELETE') return route.fallback()
    const id = new URL(request.url()).pathname.split('/').pop() ?? ''
    calls.deletes.push(id)
    tournaments = tournaments.filter((entry) => entry.id !== id)
    return route.fulfill({ status: 200, json: { success: true } })
  })

  return calls
}
