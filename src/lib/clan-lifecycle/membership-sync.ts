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
} from '@/lib/clan-lifecycle/config'
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

  const [mode, confirmationsRequired, maxRatioPercent] = await Promise.all([
    getClanLifecycleMode(),
    getConfirmationsRequired(),
    getMaxMovesRatioPercent(),
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

      let target: { id: number; tag: string | null; pubgClanId: string | null } | undefined
      let movementSource: PlayerClanChangeSource = PLAYER_CLAN_CHANGE_SOURCES.autoDemotion

      if (
        destination.shouldAct &&
        destination.confirmedState?.kind === 'has_clan' &&
        discrepancy.targetKind === 'tracked'
      ) {
        target = clanByPubgId.get(`${member.platformShard}:${destination.confirmedState.clanId}`)
        if (target) {
          movementSource = PLAYER_CLAN_CHANGE_SOURCES.autoTransfer
        }
      }

      if (!target) {
        // Destination instable, clan non suivi, ou joueur sans clan : le parking.
        // Le chantier 2 proposera la creation du clan detecte quand il se stabilisera.
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
