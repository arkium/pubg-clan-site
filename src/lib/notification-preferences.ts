/**
 * Champs des préférences de notifications (`NotificationPreference`) — une seule liste pour la route, le service
 * d'envoi et la page. Module pur (sans Prisma) : la page client l'importe. `notification-preferences.test.ts` vérifie
 * que chaque champ existe dans le modèle Prisma : l'ancien `reportReady`, retiré du schéma le 2026-08-20 mais resté
 * dans la route, faisait échouer chaque lecture et chaque enregistrement.
 */

/** Types qu'un membre peut couper. Les demandes à traiter (adhésion, création de clan, données) arrivent toujours. */
export const PREFERENCE_TYPE_FIELDS = ['squadDetected', 'topPerformance', 'challengeStarted', 'inviteReminder'] as const

/** Canaux d'envoi. `pushNotifications` n'est branché sur aucun service (journal seulement) : la page ne l'affiche pas. */
export const PREFERENCE_CHANNEL_FIELDS = ['inAppNotifications', 'emailNotifications', 'pushNotifications'] as const

export const NOTIFICATION_PREFERENCE_FIELDS = [...PREFERENCE_TYPE_FIELDS, ...PREFERENCE_CHANNEL_FIELDS] as const

export type NotificationPreferenceField = (typeof NOTIFICATION_PREFERENCE_FIELDS)[number]

export type NotificationPreferenceValues = Record<NotificationPreferenceField, boolean>

/** Valeurs à la création — identiques aux `@default` du schéma. */
export const NOTIFICATION_PREFERENCE_DEFAULTS: NotificationPreferenceValues = {
  squadDetected: true,
  topPerformance: true,
  challengeStarted: true,
  inviteReminder: false,
  inAppNotifications: true,
  emailNotifications: false,
  pushNotifications: true,
}

/** Champs booléens connus d'un corps de requête ; tout le reste est ignoré. */
export function pickPreferenceUpdate(body: Record<string, unknown>): Partial<NotificationPreferenceValues> {
  const update: Partial<NotificationPreferenceValues> = {}
  for (const field of NOTIFICATION_PREFERENCE_FIELDS) {
    const value = body[field]
    if (typeof value === 'boolean') update[field] = value
  }
  return update
}
