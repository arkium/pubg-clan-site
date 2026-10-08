'use client'

import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import Link from 'next/link'

import { EmptyState, ListSkeleton } from '@/components/ui/CharteKit'

/** Conteneur d'une page d'administration selon la charte UI (docs/ui/index.html) : `.charte` et jetons de jeu. */
export const ADMIN_PAGE_CLASS = 'app-container app-main game-ui charte flex flex-1 flex-col gap-5'

/** Page d'administration en cours de chargement (session ou premières données). */
export function AdminPageLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className={ADMIN_PAGE_CLASS}>
      <ListSkeleton rows={rows} />
    </div>
  )
}

/** Session valide sans les droits de la page : la garde serveur a laissé passer, la page refuse l'affichage. */
export function AdminPageRestricted({ message = 'Cette page est réservée au SuperUser.' }: { message?: string }) {
  return (
    <div className={ADMIN_PAGE_CLASS}>
      <EmptyState
        icon={ShieldAlert}
        title="Accès restreint"
        text={
          <>
            {message}{' '}
            <Link href="/" className="app-link font-semibold">
              Retour à l’accueil
            </Link>
          </>
        }
      />
    </div>
  )
}

/** Retour d'un enregistrement, à côté du bouton : erreur en rouge, succès en vert (jetons de la charte). */
export function FormFeedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error ? (
        <p className="t-body t-neg m-0 flex items-center gap-2" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="t-body t-pos m-0 flex items-center gap-2" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {success}
        </p>
      ) : null}
    </>
  )
}
