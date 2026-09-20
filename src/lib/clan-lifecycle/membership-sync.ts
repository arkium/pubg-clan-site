import { prisma } from '@/lib/prisma'
import {
  chunkAccountIds,
  fetchPlayersClanStates,
  PLAYER_IDS_BATCH_LIMIT,
  type ClanIdState,
} from '@/lib/clan-lifecycle/clan-state'
import {
  getClanLifecycleMode,
  getConfirmationsRequired,
  getMaxMovesRatioPercent,
  getUngroupedAutoPromote,
} from '@/lib/clan-lifecycle/config'
import { fetchPubgClanById } from '@/lib/pubg'
import {
  evaluateCircuitBreaker,
  evaluateConfirmations,
  evaluateDepartureConfirmation,
  shouldApplyMovements,
  type LifecycleMode,
} from '@/lib/clan-lifecycle/safety'
import {
  PLAYER_CLAN_CHANGE_SOURCES,
  PLAYER_CLAN_CHANGE_STATUSES,
  recordPlayerClanChange,
  type PlayerClanChangeSource,
} from '@/lib/player-clan-change'

/**
 * Chantier 1 — synchronisation quotidienne de l'appartenance de clan.
 *
 * L'API PUBG ne renvoie pas les rosters de clan (404 mesuré le 2026-09-20), donc la
 * comparaison se fait joueur par joueur, par lots de 10.
 *
 * Aucun mouvement n'est appliqué sur une seule observation : `attributes.clanId`
 * clignote pour environ 5 % des comptes. Un écart doit être confirmé N passages
 * d'affilée (garde-fou A), et le passage entier s'abandonne si la volumétrie
 * dépasse le seuil (coupe-circuit). En mode `observe` — le défaut — rien n'est
 * jamais appliqué.
 */

export type MembershipSyncOptions = {
  source?: 'cron' | 'manual'
  triggeredByUserId?: number | null
  /** Plafond de membres examinés par passage, pour borner la consommation d'API. */
  maxMembers?: number
}

export type PlannedMovement = {
  memberId: number
  memberName: string
  pubgAccountId: string
  platformShard: string
  previousClanId: number | null
  previousClanTag: string | null
  previousPubgClanId: string | null
  targetClanId: number
  targetClanTag: string | null
  targetPubgClanId: string | null
  source: PlayerClanChangeSource
}

export type MembershipSyncSummary = {
  runId: string | null
  status: 'success' | 'aborted' | 'skipped' | 'failed'
  mode: LifecycleMode
  membersScanned: number
  apiCalls: number
  statesHasClan: number
  statesNoClan: number
  statesUnknown: number
  discrepanciesFound: number
  awaitingConfirmation: number
  movementsPlanned: number
  movementsApplied: number
  circuitBreakerTripped: boolean
  movesRatioPercent: number
  /** Clans inconnus detectes et crees en attente de validation SuperUser (chantier 2, cas B). */
  pendingClanRequests: number
  message?: string
  /**
   * Mouvements retenus par le passage. Expose pour que l'appelant puisse notifier
   * sans que le service ait a connaitre Discord : un echec de notification ne peut
   * ainsi pas annuler un mouvement deja ecrit (« Surete d'execution » C).
   */
  movements: PlannedMovement[]
}

type ScannedMember = {
  id: number
  displayName: string
  pubgAccountId: string
  platformShard: string
  clanId: number | null
  clanTag: string | null
  clanPubgId: string | null
  clanIsSystem: boolean
}

/**
 * Compare l'état observé au clan enregistré côté site.
 * `null` signifie « conforme, rien à faire ».
 */
export function describeDiscrepancy(
  member: Pick<ScannedMember, 'clanPubgId' | 'clanIsSystem'>,
  state: ClanIdState
): { targetKind: 'system' | 'tracked'; targetPubgClanId: string | null } | null {
  if (state.kind === 'unknown') {
    return null
  }

  if (state.kind === 'no_clan') {
    // Deja dans le clan technique : c'est l'etat attendu pour un joueur sans clan.
    return member.clanIsSystem ? null : { targetKind: 'system', targetPubgClanId: null }
  }

  if (member.clanPubgId && member.clanPubgId === state.clanId) {
    return null
  }

  return { targetKind: 'tracked', targetPubgClanId: state.clanId }
}

async function loadScannedMembers(maxMembers: number): Promise<ScannedMember[]> {
  const rows = await prisma.clanMember.findMany({
    where: {
      isActive: true,
      joinStatus: 'active',
      pubgAccountId: { not: null },
      clan: { is: { isActive: true } },
    },
    select: {
      id: true,
      displayName: true,
      pubgAccountId: true,
      platformShard: true,
      clanId: true,
      clan: { select: { tag: true, pubgClanId: true, isSystem: true } },
    },
    orderBy: { id: 'asc' },
    take: maxMembers,
  })

  return rows
    .filter((row): row is typeof row & { pubgAccountId: string } => typeof row.pubgAccountId === 'string')
    .map((row) => ({
      id: row.id,
      displayName: row.displayName,
      pubgAccountId: row.pubgAccountId,
      platformShard: row.platformShard,
      clanId: row.clanId,
      clanTag: row.clan?.tag ?? null,
      clanPubgId: row.clan?.pubgClanId ?? null,
      clanIsSystem: row.clan?.isSystem ?? false,
    }))
}

/**
 * Historique des observations en cours pour un compte : les lignes `observed`
 * consecutives, de la plus ancienne a la plus recente.
 *
 * Choix de stockage (tranche a l'implementation) : on n'ecrit une observation que
 * lorsqu'un ecart est constate. Un passage conforme **clot** la serie en cours, ce
 * qui evite 324 ecritures par jour quand rien ne bouge tout en gardant la remise a
 * zero exigee par le garde-fou A.
 */
async function loadOpenObservations(memberId: number, limit: number) {
  const rows = await prisma.playerClanChange.findMany({
    where: { clanMemberId: memberId, status: PLAYER_CLAN_CHANGE_STATUSES.observed },
    select: { newPubgClanId: true, detectedAt: true },
    orderBy: { detectedAt: 'desc' },
    take: limit,
  })

  return rows.reverse()
}

function observationToState(newPubgClanId: string | null): ClanIdState {
  return newPubgClanId ? { kind: 'has_clan', clanId: newPubgClanId } : { kind: 'no_clan' }
}

/**
 * Cas B du chantier 2 : un clan detecte n'existe pas cote site.
 *
 * On le cree **inactif**, exactement comme `/join` le fait pour une demande de
 * creation : un clan n'entre dans la ligue que sur validation SuperUser. Les
 * membres concernes ne sont PAS deplaces ici — leur mouvement est enregistre en
 * `pending` et sera applique a l'approbation du clan.
 */
async function createPendingClanForDetection(
  request: { pubgClanId: string; shard: string; members: ScannedMember[] },
  runId: string,
  source: string
) {
  // Une demande peut deja exister depuis un passage precedent.
  const existing = await prisma.clan.findFirst({
    where: { pubgClanId: request.pubgClanId, platformShard: request.shard },
    select: { id: true, isActive: true },
  })

  if (existing) {
    return false
  }

  const pubgClan = await fetchPubgClanById(request.pubgClanId, request.shard, {
    source: `clan-lifecycle-${source}`,
  })

  if (!pubgClan) {
    return false
  }

  const created = await prisma.clan.create({
    data: {
      name: pubgClan.name ?? request.pubgClanId,
      tag: pubgClan.tag ?? '???',
      platformShard: request.shard,
      pubgClanId: request.pubgClanId,
      isActive: false,
    },
    select: { id: true, name: true, tag: true },
  })

  // Mouvements differes : appliques quand le SuperUser validera le clan.
  for (const member of request.members) {
    await recordPlayerClanChange(prisma, {
      clanMemberId: member.id,
      pubgAccountId: member.pubgAccountId,
      platformShard: member.platformShard,
      previousClanId: member.clanId,
      previousPubgClanId: member.clanPubgId,
      previousPubgClanTag: member.clanTag,
      newClanId: created.id,
      newPubgClanId: request.pubgClanId,
      newPubgClanTag: created.tag,
      source: PLAYER_CLAN_CHANGE_SOURCES.ungroupedPromotion,
      status: PLAYER_CLAN_CHANGE_STATUSES.pending,
      runId,
    })
  }

  // Notification in-app aux SuperUsers. Import dynamique : `notification-service`
  // tire `server-only` par `email-service`, donc l'import statique casserait les
  // scripts `tsx`. Un echec ici ne doit rien annuler.
  try {
    const { notifyClanCreationRequest } = await import('@/lib/notification-service')
    await notifyClanCreationRequest(
      created.id,
      created.name,
      created.tag,
      request.members[0]?.displayName ?? 'detection automatique'
    )
  } catch (error) {
    console.warn(
      '[ClanLifecycle] Notification de creation de clan indisponible',
      error instanceof Error ? error.message : error
    )
  }

  return true
}

export async function runMembershipSyncPass(
  options: MembershipSyncOptions = {}
): Promise<MembershipSyncSummary> {
  const source = options.source ?? 'cron'
  const maxMembers = options.maxMembers ?? 1000

  const empty: MembershipSyncSummary = {
    runId: null,
    status: 'skipped',
    mode: 'observe',
    membersScanned: 0,
    apiCalls: 0,
    statesHasClan: 0,
    statesNoClan: 0,
    statesUnknown: 0,
    discrepanciesFound: 0,
    awaitingConfirmation: 0,
    movementsPlanned: 0,
    movementsApplied: 0,
    circuitBreakerTripped: false,
    movesRatioPercent: 0,
    pendingClanRequests: 0,
    movements: [],
  }

  // Garde-fou D : verrou en base, pas un booleen en memoire — le web et le worker
  // sont deux process distincts.
  const running = await prisma.clanLifecycleRun.findFirst({
    where: { status: 'running' },
    select: { id: true, startedAt: true },
  })

  if (running) {
    return {
      ...empty,
      message: `Un passage est deja en cours (${running.id}, demarre le ${running.startedAt.toISOString()}).`,
    }
  }

  const [mode, confirmationsRequired, maxRatioPercent, autoPromote] = await Promise.all([
    getClanLifecycleMode(),
    getConfirmationsRequired(),
    getMaxMovesRatioPercent(),
    getUngroupedAutoPromote(),
  ])

  const run = await prisma.clanLifecycleRun.create({
    data: { source, mode, status: 'running', triggeredByUserId: options.triggeredByUserId ?? null },
    select: { id: true, startedAt: true },
  })

  const summary: MembershipSyncSummary = { ...empty, runId: run.id, mode, status: 'success' }

  try {
    const members = await loadScannedMembers(maxMembers)
    summary.membersScanned = members.length

    const byAccount = new Map(members.map((m) => [m.pubgAccountId, m]))

    // Les lots sont par shard : filter[playerIds] est scope au shard de l'URL.
    const byShard = new Map<string, string[]>()
    for (const member of members) {
      const list = byShard.get(member.platformShard) ?? []
      list.push(member.pubgAccountId)
      byShard.set(member.platformShard, list)
    }

    const states = new Map<string, ClanIdState>()
    for (const [shard, accountIds] of byShard) {
      for (const chunk of chunkAccountIds(accountIds, PLAYER_IDS_BATCH_LIMIT)) {
        const chunkStates = await fetchPlayersClanStates(chunk, shard, {
          source: `clan-lifecycle-${source}`,
        })
        summary.apiCalls += 1
        for (const [accountId, state] of chunkStates) {
          states.set(accountId, state)
        }
      }
    }

    // Clans suivis actifs, pour resoudre la cible d'un transfert.
    const clans = await prisma.clan.findMany({
      where: { isActive: true },
      select: { id: true, tag: true, pubgClanId: true, isSystem: true, platformShard: true },
    })
    const clanByPubgId = new Map(
      clans.filter((c) => c.pubgClanId).map((c) => [`${c.platformShard}:${c.pubgClanId}`, c])
    )
    const systemClanByShard = new Map(
      clans.filter((c) => c.isSystem).map((c) => [c.platformShard, c])
    )

    const planned: PlannedMovement[] = []
    // Chantier 2, cas B : clans detectes mais absents de la base. Dedupliques par
    // identifiant PUBG — plusieurs membres peuvent partir vers le meme clan.
    const pendingClanRequests = new Map<string, { pubgClanId: string; shard: string; members: ScannedMember[] }>()

    for (const [accountId, state] of states) {
      const member = byAccount.get(accountId)
      if (!member) continue

      if (state.kind === 'unknown') summary.statesUnknown += 1
      else if (state.kind === 'no_clan') summary.statesNoClan += 1
      else summary.statesHasClan += 1

      const discrepancy = describeDiscrepancy(member, state)

      if (!discrepancy) {
        // Conforme : on clot la serie d'observations en cours, s'il y en a une.
        await prisma.playerClanChange.updateMany({
          where: { clanMemberId: member.id, status: PLAYER_CLAN_CHANGE_STATUSES.observed },
          data: { status: PLAYER_CLAN_CHANGE_STATUSES.ignored },
        })
        continue
      }

      summary.discrepanciesFound += 1

      const observedPubgClanId = state.kind === 'has_clan' ? state.clanId : null

      // Nouvelle observation de l'ecart.
      await recordPlayerClanChange(prisma, {
        clanMemberId: member.id,
        pubgAccountId: member.pubgAccountId,
        platformShard: member.platformShard,
        previousClanId: member.clanId,
        previousPubgClanId: member.clanPubgId,
        previousPubgClanTag: member.clanTag,
        newPubgClanId: observedPubgClanId,
        source: PLAYER_CLAN_CHANGE_SOURCES.playerSync,
        status: PLAYER_CLAN_CHANGE_STATUSES.observed,
        runId: run.id,
      })

      const history = await loadOpenObservations(member.id, confirmationsRequired)
      const observations = history.map((row) => observationToState(row.newPubgClanId))

      // Decision en DEUX niveaux — voir evaluateDepartureConfirmation.
      // Niveau 1 : le depart du clan actuel est-il confirme ? C'est binaire et
      // stable meme pour les comptes qui clignotent.
      const departure = evaluateDepartureConfirmation(
        observations,
        member.clanPubgId,
        confirmationsRequired
      )

      if (!departure.shouldAct) {
        summary.awaitingConfirmation += 1
        continue
      }

      // Niveau 2 : la destination est-elle elle aussi stable ? Si non, le joueur va
      // au parking plutot que vers une cible tiree au sort par le dernier appel.
      const destination = evaluateConfirmations(observations, confirmationsRequired)

      const destinationPubgClanId =
        destination.shouldAct && destination.confirmedState?.kind === 'has_clan'
          ? destination.confirmedState.clanId
          : null

      let target: { id: number; tag: string | null; pubgClanId: string | null } | undefined
      let movementSource: PlayerClanChangeSource = PLAYER_CLAN_CHANGE_SOURCES.autoDemotion

      if (destinationPubgClanId) {
        const trackedTarget = clanByPubgId.get(`${member.platformShard}:${destinationPubgClanId}`)

        if (trackedTarget) {
          // Cas A du chantier 2 : la cible est deja suivie et validee, le risque
          // d'introduire un clan indesirable est nul.
          target = trackedTarget
          movementSource = member.clanIsSystem
            ? PLAYER_CLAN_CHANGE_SOURCES.ungroupedPromotion
            : PLAYER_CLAN_CHANGE_SOURCES.autoTransfer
        } else {
          // Cas B : clan inconnu. On ne cree jamais un clan actif automatiquement —
          // ce serait contourner la validation SuperUser de `/join`. On enregistre
          // une demande, traitee apres la boucle.
          const existing = pendingClanRequests.get(destinationPubgClanId)
          if (existing) {
            existing.members.push(member)
          } else {
            pendingClanRequests.set(destinationPubgClanId, {
              pubgClanId: destinationPubgClanId,
              shard: member.platformShard,
              members: [member],
            })
          }
        }
      }

      // Promotion depuis le parking : gouvernee par son propre interrupteur, pour
      // pouvoir laisser les joueurs dans UNG sans couper la detection.
      if (target && member.clanIsSystem && !autoPromote) {
        continue
      }

      if (!target) {
        // Destination instable, clan non suivi, ou joueur sans clan : le parking.
        target = systemClanByShard.get(member.platformShard)
        movementSource = PLAYER_CLAN_CHANGE_SOURCES.autoDemotion
      }

      if (!target || target.id === member.clanId) {
        // Pas de clan technique sur ce shard, ou deja au bon endroit : rien a faire.
        continue
      }

      planned.push({
        memberId: member.id,
        memberName: member.displayName,
        pubgAccountId: member.pubgAccountId,
        platformShard: member.platformShard,
        previousClanId: member.clanId,
        previousClanTag: member.clanTag,
        previousPubgClanId: member.clanPubgId,
        targetClanId: target.id,
        targetClanTag: target.tag,
        targetPubgClanId: target.pubgClanId,
        source: movementSource,
      })
    }

    // --- Chantier 2, cas B : creation des clans detectes, en attente de validation.
    for (const request of pendingClanRequests.values()) {
      try {
        const created = await createPendingClanForDetection(request, run.id, source)
        if (created) {
          summary.pendingClanRequests += 1
        }
      } catch (error) {
        console.warn(
          '[ClanLifecycle] Impossible de creer le clan detecte',
          request.pubgClanId,
          error instanceof Error ? error.message : error
        )
      }
    }

    summary.movementsPlanned = planned.length
    summary.movements = planned

    const breaker = evaluateCircuitBreaker({
      plannedMoves: planned.length,
      trackedTotal: summary.membersScanned,
      maxRatioPercent,
    })
    summary.circuitBreakerTripped = breaker.tripped
    summary.movesRatioPercent = breaker.ratioPercent

    const applying = shouldApplyMovements(mode, breaker)

    if (applying) {
      for (const movement of planned) {
        // Garde-fou C : le mouvement et sa trace dans la meme transaction.
        await prisma.$transaction(async (tx) => {
          await tx.clanMember.update({
            where: { id: movement.memberId },
            data: { clanId: movement.targetClanId },
          })

          await tx.playerClanChange.updateMany({
            where: {
              clanMemberId: movement.memberId,
              status: PLAYER_CLAN_CHANGE_STATUSES.observed,
            },
            data: { status: PLAYER_CLAN_CHANGE_STATUSES.ignored },
          })

          await recordPlayerClanChange(tx, {
            clanMemberId: movement.memberId,
            pubgAccountId: movement.pubgAccountId,
            platformShard: movement.platformShard,
            previousClanId: movement.previousClanId,
            newClanId: movement.targetClanId,
            previousPubgClanId: movement.previousPubgClanId,
            previousPubgClanTag: movement.previousClanTag,
            newPubgClanId: movement.targetPubgClanId,
            newPubgClanTag: movement.targetClanTag,
            source: movement.source,
            status: PLAYER_CLAN_CHANGE_STATUSES.applied,
            runId: run.id,
          })
        })

        summary.movementsApplied += 1
      }
    }

    summary.status = breaker.tripped ? 'aborted' : 'success'

    const finishedAt = new Date()
    await prisma.clanLifecycleRun.update({
      where: { id: run.id },
      data: {
        status: summary.status,
        finishedAt,
        durationMs: finishedAt.getTime() - run.startedAt.getTime(),
        membersScanned: summary.membersScanned,
        apiCalls: summary.apiCalls,
        statesHasClan: summary.statesHasClan,
        statesNoClan: summary.statesNoClan,
        statesUnknown: summary.statesUnknown,
        discrepanciesFound: summary.discrepanciesFound,
        awaitingConfirmation: summary.awaitingConfirmation,
        movementsPlanned: summary.movementsPlanned,
        movementsApplied: summary.movementsApplied,
        circuitBreakerTripped: summary.circuitBreakerTripped,
        movesRatioPercent: summary.movesRatioPercent,
      },
    })

    if (breaker.tripped) {
      summary.message =
        `Coupe-circuit : ${planned.length} mouvements prevus sur ${summary.membersScanned} membres ` +
        `(${breaker.ratioPercent} % > ${maxRatioPercent} %). Aucun mouvement applique.`
    } else if (!applying && planned.length > 0) {
      summary.message = `Mode observation : ${planned.length} mouvement(s) identifie(s), aucun applique.`
    }

    return summary
  } catch (error) {
    const finishedAt = new Date()
    const message = error instanceof Error ? error.message : 'Echec inconnu'

    await prisma.clanLifecycleRun
      .update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt,
          durationMs: finishedAt.getTime() - run.startedAt.getTime(),
          errorMessage: message,
        },
      })
      .catch(() => undefined)

    return { ...summary, status: 'failed', message }
  }
}

/** Ferme les passages restes bloques en `running` — appele par le menage quotidien. */
export async function closeStaleLifecycleRuns(olderThanMinutes = 120) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000)
  const result = await prisma.clanLifecycleRun.updateMany({
    where: { status: 'running', startedAt: { lt: cutoff } },
    data: { status: 'failed', errorMessage: 'Passage interrompu — ferme par le menage.' },
  })
  return result.count
}
