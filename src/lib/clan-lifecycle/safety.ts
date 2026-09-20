import { clanStateKey, type ClanIdState } from '@/lib/clan-lifecycle/clan-state'

/**
 * Garde-fous du cron de synchronisation d'appartenance — section « Sûreté
 * d'exécution » (docs/TODO/todo.md, P2). Fonctions volontairement **pures** : elles
 * ne lisent ni la base ni l'API, pour être testables sans mock et réutilisables par
 * le cron comme par l'UI de prévisualisation.
 */

export type ConfirmationVerdict = {
  /** Vrai seulement si les `required` dernières observations sont identiques et certaines. */
  shouldAct: boolean
  /** Longueur de la série identique en fin d'historique. */
  streak: number
  /** Ce qu'il manque encore d'observations concordantes. */
  remaining: number
  /** État confirmé, quand `shouldAct` est vrai. */
  confirmedState: ClanIdState | null
}

/**
 * Décide si une série d'observations suffit à déclencher un mouvement.
 *
 * Mesuré le 2026-09-20 : `attributes.clanId` clignote pour environ 5 % des comptes,
 * en basculant entre « pas de clan » et un clan réel d'un appel à l'autre. Agir sur
 * une seule observation produirait donc des mouvements erronés en continu.
 *
 * Règle retenue : on exige **la stabilité, pas la répétition**. Les `required`
 * dernières observations doivent être identiques entre elles, et aucune ne doit être
 * `unknown` — une incertitude remet la série à zéro plutôt que de la prolonger.
 *
 * `observations` est ordonné du plus ancien au plus récent.
 */
export function evaluateConfirmations(
  observations: ClanIdState[],
  required: number
): ConfirmationVerdict {
  const target = Math.max(1, Math.floor(required))

  if (observations.length === 0) {
    return { shouldAct: false, streak: 0, remaining: target, confirmedState: null }
  }

  const latest = observations[observations.length - 1]

  // Une observation incertaine ne confirme rien et casse la série.
  if (latest.kind === 'unknown') {
    return { shouldAct: false, streak: 0, remaining: target, confirmedState: null }
  }

  const latestKey = clanStateKey(latest)
  let streak = 0
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const state = observations[index]
    if (state.kind === 'unknown' || clanStateKey(state) !== latestKey) {
      break
    }
    streak += 1
  }

  const shouldAct = streak >= target

  return {
    shouldAct,
    streak,
    remaining: Math.max(0, target - streak),
    confirmedState: shouldAct ? latest : null,
  }
}

/**
 * Confirme le DEPART d'un joueur de son clan actuel, independamment de sa destination.
 *
 * Mesure du 2026-09-20 (540 observations) : pour les comptes qui clignotent, la
 * destination est instable mais le depart, lui, est certain. Vvila et pagiotte ont
 * contredit leur clan enregistre **12 fois sur 12**, en alternant seulement entre
 * « KMS » et « aucun clan ».
 *
 * Exiger la stabilite de la destination serait donc a la fois trop strict et
 * arbitraire : selon la valeur sur laquelle tombent les N derniers appels, le meme
 * compte partirait vers KMS ou vers le parking, au hasard. On confirme d'abord le
 * depart — binaire et stable — et la destination n'est utilisee que si elle est elle
 * aussi stable. Sinon le joueur va au parking, qui est precisement fait pour les
 * transitions.
 */
export function evaluateDepartureConfirmation(
  observations: ClanIdState[],
  siteClanPubgId: string | null,
  required: number
): ConfirmationVerdict {
  const target = Math.max(1, Math.floor(required))

  let streak = 0
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const state = observations[index]

    // Une incertitude ne confirme pas un depart.
    if (state.kind === 'unknown') break

    const stillInSiteClan =
      state.kind === 'has_clan' ? state.clanId === siteClanPubgId : siteClanPubgId === null

    if (stillInSiteClan) break

    streak += 1
  }

  const shouldAct = streak >= target

  return {
    shouldAct,
    streak,
    remaining: Math.max(0, target - streak),
    confirmedState: shouldAct ? observations[observations.length - 1] : null,
  }
}

export type CircuitBreakerVerdict = {
  /** Vrai quand le passage doit être abandonné sans rien appliquer. */
  tripped: boolean
  ratioPercent: number
  plannedMoves: number
  trackedTotal: number
  maxRatioPercent: number
}

/**
 * Coupe-circuit de volumétrie : un passage qui voudrait déplacer une part trop grande
 * de l'effectif est presque toujours le symptôme d'une réponse d'API dégradée, pas
 * d'un vrai exode. Il s'abandonne en entier plutôt que d'appliquer.
 *
 * Attention au premier passage réel : le site n'ayant jamais détecté de changement,
 * la dérive accumulée se présente d'un coup et fait légitimement sauter le seuil.
 * C'est le **mode observation** qui absorbe ce rattrapage, pas un seuil plus large.
 */
export function evaluateCircuitBreaker(params: {
  plannedMoves: number
  trackedTotal: number
  maxRatioPercent: number
}): CircuitBreakerVerdict {
  const { plannedMoves, trackedTotal } = params
  const maxRatioPercent = Math.max(0, params.maxRatioPercent)

  const ratioPercent = trackedTotal > 0 ? (plannedMoves / trackedTotal) * 100 : 0

  return {
    // Aucun mouvement prévu ne peut pas déclencher le coupe-circuit, même si
    // l'effectif est nul (division évitée ci-dessus).
    tripped: plannedMoves > 0 && ratioPercent > maxRatioPercent,
    ratioPercent: Number(ratioPercent.toFixed(2)),
    plannedMoves,
    trackedTotal,
    maxRatioPercent,
  }
}

export type LifecycleMode = 'observe' | 'apply'

/**
 * Traduit le mode courant en décision d'application.
 * En `observe`, l'événement est écrit mais aucun `clanId` ne change.
 */
export function shouldApplyMovements(mode: LifecycleMode, breaker: CircuitBreakerVerdict) {
  return mode === 'apply' && !breaker.tripped
}
