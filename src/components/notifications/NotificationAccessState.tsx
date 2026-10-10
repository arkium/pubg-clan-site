'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'

export type NotificationAccess = 'ok' | 'signed-out' | 'forbidden'

/**
 * Refus d'accès des pages personnelles d'un membre (notifications, préférences), gardées par `requireOwnMember` :
 * 401 → invitation à se connecter ; 403 → données d'un autre joueur, avec un lien vers les siennes.
 * `section` : fin de l'adresse (`notifications` ou `notification-preferences`).
 */
export function NotificationAccessState({
  access,
  memberId,
  section,
}: {
  access: Exclude<NotificationAccess, 'ok'>
  memberId: number
  section: 'notifications' | 'notification-preferences'
}) {
  const { activeMemberId } = useAuthSession()
  const ownHref = activeMemberId && activeMemberId !== memberId ? `/members/${activeMemberId}/${section}` : null

  return (
    <section className="app-panel flex flex-col items-center gap-3 p-8 text-center">
      <Lock className="h-8 w-8 text-gray-500" aria-hidden="true" />
      {access === 'signed-out' ? (
        <>
          <p className="t-card-title">Réservé aux membres connectés</p>
          <p className="t-meta max-w-md">Les notifications sont personnelles : connecte-toi pour consulter les tiennes.</p>
          <Link href={`/login?redirect=/members/${memberId}/${section}`} className="app-btn app-btn--primary app-btn--md">
            Se connecter
          </Link>
        </>
      ) : (
        <>
          <p className="t-card-title">Données personnelles</p>
          <p className="t-meta max-w-md">
            Les notifications et leurs préférences ne sont visibles que par le joueur lui-même.
          </p>
          {ownHref ? (
            <Link href={ownHref} className="app-btn app-btn--secondary app-btn--md">
              Voir les miennes
            </Link>
          ) : null}
        </>
      )}
    </section>
  )
}
