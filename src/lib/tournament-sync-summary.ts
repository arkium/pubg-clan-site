/**
 * Ce que dit « Synchroniser PUBG » après un clic — pages d'administration et page d'un tournoi
 * (docs/features/tournois.md, « Synchronisation PUBG : ce que dit le bouton »).
 *
 * Un message pour l'organisateur, pas un rapport technique : combien de manches sont arrivées, et sinon quoi faire.
 * Le cas fréquent un soir de tournoi est « 0 manche » : PUBG publie une partie quelques minutes après sa fin, il suffit
 * d'attendre puis de recliquer — sans risque, une manche n'est jamais comptée deux fois.
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
  /** `waiting` : rien de nouveau, l'organisateur doit attendre puis recliquer. */
  tone: 'success' | 'waiting'
  message: string
}

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

export const TOURNAMENT_SYNC_PROGRESS_MESSAGE =
  'Recherche de vos dernières parties sur PUBG… Cela prend quelques secondes.'

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
    return { tone: 'success', message: `Synchronisation terminée : ${rounds(total)} au classement.${unreadableSentence}` }
  }

  if (newRounds > 0) {
    return {
      tone: 'success',
      message:
        `${rounds(newRounds, { one: 'nouvelle', many: 'nouvelles' })} ${newRounds > 1 ? 'ajoutées' : 'ajoutée'} — ${rounds(total)} au total. ` +
        'Le classement est à jour ; le replay de la manche suit dans quelques secondes, le temps d’analyser la télémétrie.' +
        unreadableSentence,
    }
  }

  if (now.getTime() < new Date(target.startDate).getTime()) {
    return {
      tone: 'waiting',
      message: `Le tournoi n’a pas commencé (${formatTournamentPeriod(target.startDate, target.endDate)}) : aucune partie ne peut encore compter.`,
    }
  }

  if (total > 0) {
    return {
      tone: 'waiting',
      message:
        `Aucune nouvelle manche — ${rounds(total)} déjà au classement. Si une manche vient de se terminer, PUBG ne l’a ` +
        `pas encore publiée : attendez deux ou trois minutes, puis recliquez (${RETRY_IS_SAFE}).` +
        unreadableSentence,
    }
  }

  return {
    tone: 'waiting',
    message:
      'Aucune manche trouvée pour l’instant. PUBG publie une partie quelques minutes après sa fin : attendez deux ou ' +
      `trois minutes, puis recliquez (${RETRY_IS_SAFE}). Seules comptent les parties personnalisées que vous avez ` +
      `jouées pendant le tournoi (${formatTournamentPeriod(target.startDate, target.endDate)}).` +
      filtersSentence(target) +
      unreadableSentence,
  }
}

/**
 * Message d'échec. `status` vaut `null` quand la requête n'a pas abouti (réseau coupé) ; `payload` est `null` quand la
 * réponse n'était pas du JSON — une page d'erreur du proxy après un délai dépassé : le serveur continue alors peut-être.
 */
export function tournamentSyncFailureMessage(status: number | null, payload: TournamentSyncPayload | null): string {
  if (status === null) {
    return 'La connexion a été coupée pendant la synchronisation. Rechargez la page dans une minute : si la manche manque encore, recliquez.'
  }
  if (status === 401) return 'Votre session a expiré : reconnectez-vous, puis recliquez.'
  if (!payload) {
    return 'La synchronisation a dépassé le délai d’attente, mais elle continue peut-être sur le serveur. Rechargez la page dans une minute avant de recliquer.'
  }
  if (status === 403 && (!payload.error || payload.error === 'Forbidden')) {
    return 'Vous n’avez pas le droit de synchroniser ce tournoi : réservé à l’Owner du clan organisateur.'
  }
  const reason = payload.error ?? 'La synchronisation a échoué.'
  return status >= 500 ? `${reason} Réessayez dans une minute : ${RETRY_IS_SAFE}.` : reason
}
