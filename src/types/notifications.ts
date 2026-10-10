export const NOTIFICATION_TYPES = [
  'squad_detected',
  'top_performance',
  'challenge_started',
  'invite_reminder',
  'join_request',
  'clan_creation_request',
  'privacy_request',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** Libellé de chaque type, affiché aux joueurs (filtre et pastille de la page des notifications). */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  squad_detected: 'Partie en escouade',
  top_performance: 'Performance',
  challenge_started: 'Défi lancé',
  invite_reminder: 'Rappel d’invitation',
  join_request: 'Demande d’adhésion',
  clan_creation_request: 'Création de clan',
  privacy_request: 'Demande sur les données',
}

export interface NotificationItem {
  id: string
  memberId: number
  type: NotificationType | string
  title: string
  message: string
  data: unknown
  read: boolean
  readAt: string | null
  createdAt: string
}

export interface NotificationPreferenceItem {
  id: string
  memberId: number
  squadDetected: boolean
  topPerformance: boolean
  challengeStarted: boolean
  inviteReminder: boolean
  emailNotifications: boolean
  pushNotifications: boolean
  inAppNotifications: boolean
  updatedAt: string
}
