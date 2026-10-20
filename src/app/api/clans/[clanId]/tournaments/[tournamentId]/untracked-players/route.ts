import { z } from 'zod'

import { POST as createMember } from '@/app/api/members/route'
import { withAdminActionLog } from '@/lib/admin-action-log'
import { requireClanFeature } from '@/lib/auth/admin-guards'
import { getSessionFromRequest } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'
import { getTournamentForClan, getTournamentMatches, materializeTournamentCustomMatches } from '@/lib/tournament-service'
import { listTournamentUntrackedPlayers } from '@/lib/tournament-untracked-players'

/**
 * Joueurs non suivis d'un tournoi (demande du 2026-10-11) — docs/features/tournois.md, « Joueurs non suivis ».
 *
 * GET : les joueurs du lobby que le site ne suit pas, d'après la télémétrie de chaque manche.
 * POST `{ accountId }` : ajoute le joueur au site avec les règles d'« Ajouter un joueur » (`POST /api/members`, appelé
 * tel quel pour ne pas dupliquer ses règles), puis le rattache aux manches (`materializeTournamentCustomMatches`) : le
 * classement se recalcule aussitôt. Le SuperUser l'ajoute au clan qui suit son clan PUBG, inscrit sur le site au besoin
 * (décision du 2026-10-11) ; un Owner seulement dans son propre clan.
 */

const AddSchema = z.object({ accountId: z.string().trim().min(1).max(191) })

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function guard(
  request: Request,
  clanIdParam: string,
  tournamentId: string
): Promise<{ ok: false; error: Response } | { ok: true; clanId: number }> {
  const clanId = parseClanId(clanIdParam)
  if (!clanId) return { ok: false, error: Response.json({ error: 'Invalid clan id' }, { status: 400 }) }
  const denied = await requireClanFeature(request, clanId, 'clan-competition')
  if (denied) return { ok: false, error: denied }
  const tournament = await getTournamentForClan(clanId, tournamentId)
  if (tournament.organizerClanId !== clanId) {
    return { ok: false, error: Response.json({ error: 'Only the organizer can manage this tournament' }, { status: 403 }) }
  }
  return { ok: true, clanId }
}

export async function GET(request: Request, { params }: { params: Promise<{ clanId: string; tournamentId: string }> }) {
  try {
    const { clanId, tournamentId } = await params
    const checked = await guard(request, clanId, tournamentId)
    if (!checked.ok) return checked.error
    return Response.json(await listTournamentUntrackedPlayers(tournamentId))
  } catch (error) {
    console.error('Tournament untracked players failed:', error)
    return Response.json({ error: 'Impossible de lister les joueurs non suivis.' }, { status: 500 })
  }
}

async function handlePost(request: Request, { params }: { params: Promise<{ clanId: string; tournamentId: string }> }) {
  try {
    const { clanId, tournamentId } = await params
    const checked = await guard(request, clanId, tournamentId)
    if (!checked.ok) return checked.error

    const validated = AddSchema.safeParse(await request.json().catch(() => null))
    if (!validated.success) return Response.json({ error: 'Joueur manquant' }, { status: 400 })

    const report = await listTournamentUntrackedPlayers(tournamentId)
    const player = report.players.find((entry) => entry.accountId === validated.data.accountId)
    if (!player) {
      return Response.json({ error: 'Ce joueur est déjà suivi ou n’a pas joué ce tournoi.' }, { status: 404 })
    }
    if (!player.name) {
      return Response.json(
        { error: 'Pseudo inconnu du site : ajoute ce joueur à la main depuis « Ajouter un joueur ».' },
        { status: 422 }
      )
    }

    // Un Owner n'ajoute que dans son propre clan : un joueur d'un autre clan PUBG passe par le SuperUser, seul à pouvoir
    // inscrire ce clan sur le site.
    const session = await getSessionFromRequest(request)
    if (!session?.isSuperUser && player.siteClan?.id !== checked.clanId) {
      return Response.json(
        {
          error: `${player.name} n’est pas un joueur de ton clan : seul le SuperUser peut l’ajouter, avec son clan PUBG.`,
        },
        { status: 403 }
      )
    }

    const created = await createMember(
      new Request(new URL('/api/members', request.url), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie')! } : {}),
        },
        body: JSON.stringify({
          displayName: player.name,
          pubgPlayerName: player.name,
          platformShard: player.platformShard,
          mode: 'create',
          // SuperUser : pas de clan imposé, le joueur rejoint le clan qui suit son clan PUBG (inscrit au besoin).
          ...(session?.isSuperUser ? {} : { clanId: checked.clanId }),
        }),
      }),
      undefined as never
    )
    const member = (await created.json().catch(() => null)) as
      | { id?: number; error?: string; clan?: { name: string; tag: string | null } | null }
      | null
    if (!created.ok) {
      return Response.json({ error: member?.error ?? 'Ajout du joueur impossible.' }, { status: created.status })
    }

    // Rattachement aux manches : la ligne de chaque partie reçoit le nouveau joueur, le classement suit.
    const materialization = await materializeTournamentCustomMatches(tournamentId)
    const clanLabel = member?.clan ? `${member.clan.tag ? `[${member.clan.tag}] ` : ''}${member.clan.name}` : 'son clan'
    // Manches réellement rattachées : un clan inactif (en attente de validation) n'est pas suivi, son joueur non plus.
    const matchIds = (await getTournamentMatches(tournamentId)).map((match) => match.id)
    const attached = member?.id
      ? await prisma.squadMember.count({ where: { memberId: member.id, squadMatchId: { in: matchIds } } })
      : 0
    return Response.json({
      ok: true,
      message:
        attached > 0
          ? `${player.name} ajouté à ${clanLabel} et rattaché à ${attached} manche${attached > 1 ? 's' : ''}.`
          : `${player.name} ajouté à ${clanLabel}, mais rattaché à aucune manche : ce clan n’est pas actif sur le site.`,
      attachedRounds: attached,
      materializedMatches: materialization.materializedCount,
      materializationErrors: materialization.errors.slice(0, 3),
    })
  } catch (error) {
    console.error('Tournament untracked player add failed:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Ajout du joueur impossible.' },
      { status: 500 }
    )
  }
}

export const POST = withAdminActionLog('clans/[clanId]/tournaments/[tournamentId]/untracked-players', handlePost)
