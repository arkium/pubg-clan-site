import { Bell, Flag, Send, ShieldAlert, ShieldPlus, Trophy, UserPlus, Users, type LucideIcon } from 'lucide-react'
import type { CSSProperties } from 'react'

import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPES, type NotificationType } from '@/types/notifications'

/**
 * Identité d'un type de notification — icône et couleur de jeu (`.game-ui`) —, partagée par la page des notifications et
 * celle des préférences. Les demandes à traiter sont en orange (`warn`), jamais en jaune (charte §1.2).
 */
const TYPE_STYLE: Record<NotificationType, { icon: LucideIcon; tone: string | null }> = {
  squad_detected: { icon: Users, tone: 'sky' },
  top_performance: { icon: Trophy, tone: 'gold' },
  challenge_started: { icon: Flag, tone: 'pos' },
  invite_reminder: { icon: Send, tone: null },
  join_request: { icon: UserPlus, tone: 'warn' },
  clan_creation_request: { icon: ShieldPlus, tone: 'warn' },
  privacy_request: { icon: ShieldAlert, tone: 'warn' },
}

function isKnownType(type: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type)
}

/** Libellé d'un type ; un type inconnu (ancienne ligne en base) s'affiche tel quel, sans soulignés. */
export function notificationTypeLabel(type: string) {
  return isKnownType(type) ? NOTIFICATION_TYPE_LABELS[type] : type.replaceAll('_', ' ')
}

/** Couleurs du type (texte + fond doux), pour la tuile et la pastille. */
export function notificationTypeColors(type: string): CSSProperties {
  const tone = isKnownType(type) ? TYPE_STYLE[type].tone : null
  return tone
    ? { color: `var(--game-${tone})`, backgroundColor: `var(--game-${tone}-soft)` }
    : { color: 'var(--theme-ui-text-muted)', backgroundColor: 'var(--theme-ui-surface-strong)' }
}

/** Tuile d'icône du type : 32 px, rayon 10 (tuile de la charte). */
export function NotificationTypeTile({ type }: { type: string }) {
  const Icon = isKnownType(type) ? TYPE_STYLE[type].icon : Bell
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={notificationTypeColors(type)} aria-hidden="true">
      <Icon className="h-4 w-4" />
    </span>
  )
}
