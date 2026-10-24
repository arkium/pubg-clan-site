/**
 * Ce que dit « Synchroniser PUBG » après un clic — pages d'administration et page d'un tournoi
 * (docs/features/tournois.md, « Synchronisation PUBG : ce que dit le bouton »).
 *
 * Un message pour l'organisateur, pas un rapport technique : combien de manches sont arrivées, et sinon quoi faire.
 * Le cas fréquent un soir de tournoi est « 0 manche » : PUBG publie une partie quelques minutes après sa fin. Le site
 * réessaie alors tout seul chaque minute, 10 fois au plus (`useTournamentAutoSync`) — sans risque, une manche n'est
 * jamais comptée deux fois.
 *
 * Module pur, lisible côté navigateur.
 */
import { tournamentGameModeLabel, tournamentMapLabel } from '@/lib/tournament-filters'
import { formatTournamentPeriod } from '@/lib/tournament-schedule'

/** Réponse de `POST /api/clans/[clanId]/tournaments/[tournamentId]/sync`, champs lus ici. */
export type TournamentSyncPayload = {
  error?: string
  /** Manches entrées au classement grâce à ce clic. */
  newRounds?: number
  /** Manches au classement après le clic. */
  eligibleMatches?: number
  materializationErrors?: string[]
}

export type TournamentSyncTarget = {
  startDate: string
  endDate: string
  gameMode: string | null
  mapName: string | null
}

export type TournamentSyncSummary = {
  /** `waiting` : rien de nouveau pour l'instant. */
  tone: 'success' | 'waiting'
  message: string
  /** Rien de nouveau alors que le tournoi a commencé : un nouvel essai peut ramener la manche. */
  retry: boolean
}

/** Message affiché par les pages : toast de l'administration, encadré de la page d'un tournoi. */
export type TournamentSyncNotice = { tone: 'progress' | 'success' | 'waiting' | 'error'; message: string }

/** Relance automatique quand rien n'arrive : PUBG publie une manche deux ou trois minutes après sa fin. */
export const TOURNAMENT_SYNC_MAX_ATTEMPTS = 10
export const TOURNAMENT_SYNC_RETRY_DELAY_MS = 60_000

/** Sous le bouton « Synchroniser PUBG ». */
export const TOURNAMENT_SYNC_HINT =
  'PUBG publie une manche 2 à 3 minutes après sa fin : clique une fois la manche terminée, le site réessaie seul chaque minute (10 essais).'

const RETRY_IS_SAFE = 'recliquer est sans risque, une manche n’est jamais comptée deux fois'

function rounds(count: number, adjective?: { one: string; many: string }) {
  const noun = count > 1 ? 'manches' : 'manche'
  return adjective ? `${count} ${count > 1 ? adjective.many : adjective.one} ${noun}` : `${count} ${noun}`
}

function filtersSentence(target: TournamentSyncTarget) {
  const filters = [
    target.gameMode ? `format ${tournamentGameModeLabel(target.gameMode)}` : null,
    target.mapName ? `carte ${tournamentMapLabel(target.mapName)}` : null,
  ].filter(Boolean)
  return filters.length > 0 ? ` Le tournoi ne retient que : ${filters.join(', ')}.` : ''
}

/** Pendant un essai ; le numéro d'essai n'apparaît qu'à partir du deuxième. */
export function tournamentSyncProgressMessage(attempt = 1) {
  const suffix = attempt > 1 ? ` (essai ${attempt} sur ${TOURNAMENT_SYNC_MAX_ATTEMPTS})` : ''
  return `Recherche des parties du clan organisateur sur PUBG${suffix}… Cela prend de quelques secondes à une minute.`
}

export function summarizeTournamentSync(
  payload: TournamentSyncPayload | null,
  target: TournamentSyncTarget,
  now: Date = new Date()
): TournamentSyncSummary {
  const total = payload?.eligibleMatches ?? 0
  const newRounds = payload?.newRounds
  const unreadable = payload?.materializationErrors?.[0]
  const unreadableSentence = unreadable ? ` Une partie n’a pas pu être lue : ${unreadable}.` : ''

  if (newRounds === undefined) {
    // Réponse d'un serveur antérieur au décompte des nouvelles manches.
    return { tone: 'success', retry: false, message: `Synchronisation terminée : ${rounds(total)} au classement.${unreadableSentence}` }
  }

  if (newRounds > 0) {
    return {
      tone: 'success',
      retry: false,
      message:
        `${rounds(newRounds, { one: 'nouvelle', many: 'nouvelles' })} ${newRounds > 1 ? 'ajoutées' : 'ajoutée'} — ${rounds(total)} au total. ` +
        'Le classement est à jour ; le replay de la manche suit dans quelques secondes, le temps d’analyser la télémétrie.' +
        unreadableSentence,
    }
  }

  if (now.getTime() < new Date(target.startDate).getTime()) {
    return {
      tone: 'waiting',
      retry: false,
      message: `Le tournoi n’a pas commencé (${formatTournamentPeriod(target.startDate, target.endDate)}) : aucune partie ne peut encore compter.`,
    }
  }

  if (total > 0) {
    return {
      tone: 'waiting',
      retry: true,
      message: `Aucune nouvelle manche pour l’instant — ${rounds(total)} déjà au classement.${unreadableSentence}`,
    }
  }

  return {
    tone: 'waiting',
    retry: true,
    message:
      'Aucune manche trouvée pour l’instant. Seules comptent les parties personnalisées jouées par au moins un joueur ' +
      `du clan organisateur pendant le tournoi (${formatTournamentPeriod(target.startDate, target.endDate)}).` +
      filtersSentence(target) +
      unreadableSentence,
  }
}

/**
 * Message d'un essai sans nouvelle manche : le prochain essai automatique et son compte à rebours, ou, au dernier essai
 * (ou si les essais ont été arrêtés), quoi vérifier avant de recliquer.
 */
export function tournamentSyncWaitingNotice(
  summary: TournamentSyncSummary,
  input: { attempt: number; secondsLeft: number | null }
): TournamentSyncNotice {
  if (!summary.retry) return { tone: summary.tone, message: summary.message }
  if (input.secondsLeft !== null && input.attempt < TOURNAMENT_SYNC_MAX_ATTEMPTS) {
    return {
      tone: 'waiting',
      message:
        `${summary.message} PUBG publie une manche 2 à 3 minutes après sa fin : le site réessaie seul. ` +
        `Prochain essai dans ${Math.max(0, input.secondsLeft)} s (essai ${input.attempt + 1} sur ${TOURNAMENT_SYNC_MAX_ATTEMPTS}).`,
    }
  }
  const stopped =
    input.attempt >= TOURNAMENT_SYNC_MAX_ATTEMPTS
      ? `Toujours rien après ${TOURNAMENT_SYNC_MAX_ATTEMPTS} essais.`
      : 'Essais automatiques arrêtés.'
  return {
    tone: 'waiting',
    message:
      `${summary.message} ${stopped} Vérifie que la manche est terminée et qu’un joueur du clan organisateur l’a jouée ` +
      `(un observateur seul n’apparaît pas chez PUBG), puis reclique : ${RETRY_IS_SAFE}.`,
  }
}

/**
 * Message d'échec. `status` vaut `null` quand la requête n'a pas abouti (réseau coupé) ; `payload` est `null` quand la
 * réponse n'était pas du JSON — une page d'erreur du proxy après un délai dépassé : le serveur continue alors peut-être.
 */
export function tournamentSyncFailureMessage(status: number | null, payload: TournamentSyncPayload | null): string {
  if (status === null) {
    return 'La connexion a été coupée pendant la synchronisation. Recharge la page dans une minute : si la manche manque encore, reclique.'
  }
  if (status === 401) return 'Ta session a expiré : reconnecte-toi, puis reclique.'
  if (!payload) {
    return 'La synchronisation a dépassé le délai d’attente, mais elle continue peut-être sur le serveur. Recharge la page dans une minute avant de recliquer.'
  }
  if (status === 403 && (!payload.error || payload.error === 'Forbidden')) {
    return 'Tu n’as pas le droit de synchroniser ce tournoi : réservé à l’Owner du clan organisateur et au SuperUser.'
  }
  const reason = payload.error ?? 'La synchronisation a échoué.'
  return status >= 500 ? `${reason} Réessaie dans une minute : ${RETRY_IS_SAFE}.` : reason
}
