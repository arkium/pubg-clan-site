export const NOTIFICATION_TYPES = [
  'squad_detected',
  'top_performance',
  'challenge_started',
  'invite_reminder',
  'join_request',
  'clan_creation_request',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

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
