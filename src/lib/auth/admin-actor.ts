/**
 * Acteur d'une requête d'administration (docs/TODO/administration.md Q10).
 *
 * La garde qui laisse passer la requête (`admin-guards.ts`, `requireSuperUser`) le note ici ; le journal des actions
 * (`withAdminActionLog`, `src/lib/admin-action-log.ts`) le relit sans seconde lecture de session. Une requête sans
 * acteur n'est pas journalisée : elle n'est pas passée par une garde d'administration (appel interne du cron, refus).
 */
export type AdminActor = {
  userId: number
  memberId: number | null
  isSuperUser: boolean
}

const actors = new WeakMap<Request, AdminActor>()

export function rememberAdminActor(request: Request, actor: AdminActor): void {
  actors.set(request, actor)
}

export function adminActorOf(request: Request): AdminActor | null {
  return actors.get(request) ?? null
}

/** Pour les routes qui vérifient la session elles-mêmes : à appeler une fois le contrôle passé. */
export function rememberSessionActor(
  request: Request,
  session: { userId: number; activeMemberId: number | null; isSuperUser: boolean }
): void {
  rememberAdminActor(request, {
    userId: session.userId,
    memberId: session.activeMemberId,
    isSuperUser: session.isSuperUser,
  })
}
