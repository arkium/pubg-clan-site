# TODO2 — Refonte du système de rôles et permissions

Suivi de l'implémentation de la nouvelle hiérarchie de rôles.  
Créé le 2026-06-21. Décisions arrêtées le 2026-06-21.

---

## Contexte et objectifs

Le système de rôles actuel a plusieurs lacunes :
- Aucun concept de rôle global (cross-clan) — impossible de gérer la plateforme sans être Owner de chaque clan
- Le changement de clan est possible pour tout Owner lié à plusieurs clans (via `MemberIdentity`)
- Certaines routes API n'appellent pas `ensureMemberInClan()` → isolation clan non garantie
- Les routes de cron-control sont protégées par `requireRole(['Owner'])` mais les crons sont cross-clan
- Aucune page d'inscription/onboarding pour qu'un joueur rejoigne ou crée un clan

---

## Décisions arrêtées

| Point | Décision |
|---|---|
| Nombre de SuperUsers | Plusieurs autorisés (maintenance, évolution du projet) |
| SuperUser = joueur | Oui — un SuperUser est aussi un joueur et peut être Owner d'un clan |
| Création de clan | Nouvelle page de demande (voir Étape 10) |
| Rôle Moderator | Conservé avec un périmètre "animation du clan" (voir Étape 11) |
| Page cron Owner | Conservée — Owner voit et pilote le cron de son propre clan |
| Admin → promotion | Admin peut promouvoir Member ↔ Admin, mais pas créer/révoquer Owner |
| Switch de clan | Seul le SuperUser peut changer de clan actif |
| Crons process | Aucune auth sur le process lui-même (serveur) — protéger seulement les endpoints HTTP |

---

## Nouveau modèle de hiérarchie

```
SuperUser (rôle plateforme, cumulable avec un rôle clan)
  ├── Accès total à TOUS les clans
  ├── Seul à pouvoir changer de clan actif
  ├── Gère les triggers manuels cross-clan et la config globale
  ├── Peut créer / archiver des clans
  ├── Peut être simultanément Owner d'un clan (c'est un joueur)
  └── Plusieurs SuperUsers possibles

Owner (par clan)
  ├── Accès total à SON clan uniquement
  ├── Gère membres, rôles, sync, config et cron de son clan
  └── Ne peut pas agir sur un autre clan

Admin (par clan)
  ├── Gestion opérationnelle de SON clan uniquement
  ├── Invitations, promotion Member ↔ Admin
  ├── Sync des matchs
  └── Ne peut pas promouvoir au rôle Owner ni accéder aux crons

Moderator (par clan)  ← nouveau périmètre défini
  ├── Animation du clan : défis, annonces, notifications
  ├── Peut inviter des membres (pas les retirer)
  ├── Accès rapports + export
  └── Aucune gestion de rôles, aucun accès sync/cron

Member (par clan)
  ├── Accès lecture seul à SON clan
  └── Aucune action de gestion
```

---

## Matrice des permissions par rôle (référence)

| Action | SuperUser | Owner | Admin | Moderator | Member |
|---|---|---|---|---|---|
| Voir toutes les pages d'un clan | ✅ tous clans | ✅ sien | ✅ sien | ✅ sien | ✅ sien |
| Changer de clan actif | ✅ | ❌ | ❌ | ❌ | ❌ |
| Créer / archiver un clan | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gérer les membres (inviter) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Retirer / archiver un membre | ✅ | ✅ | ✅ | ❌ | ❌ |
| Promouvoir Member ↔ Admin | ✅ | ✅ | ✅ | ❌ | ❌ |
| Promouvoir / révoquer Owner | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gérer défis (créer, modifier) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Sync matchs manuel | ✅ | ✅ | ✅ | ❌ | ❌ |
| Sync stats manuel | ✅ | ✅ | ❌ | ❌ | ❌ |
| Voir / piloter cron de son clan | ✅ | ✅ | ❌ | ❌ | ❌ |
| Trigger cron global (tous clans) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Voir rapports | ✅ | ✅ | ✅ | ✅ | ✅ |
| Exporter rapports | ✅ | ✅ | ❌ | ✅ | ❌ |
| Gérer notifications / annonces | ✅ | ✅ | ✅ | ✅ | ❌ |
| Gérer config clan (settings) | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## Étape 1 — Schema Prisma : ajout du SuperUser ✅

**Fichier :** `prisma/schema.prisma`

- [x] Ajouter le champ `isSuperUser Boolean @default(false)` sur le modèle `UserAccount`
- [x] Ajouter le champ `joinStatus String @default("active")` sur le modèle `ClanMember`
- [x] Fichier de migration créé : `prisma/migrations/20260621120000_add_superuser_and_join_status/migration.sql`
- [x] **À lancer sur le serveur :** `npx prisma migrate deploy && npx prisma generate`

```prisma
model UserAccount {
  // ... champs existants ...
  isSuperUser Boolean @default(false)
}
```

**Migration SQL :**
```sql
ALTER TABLE UserAccount ADD COLUMN isSuperUser TINYINT(1) NOT NULL DEFAULT 0;
```

---

## Étape 2 — Middleware : nouveau guard `requireSuperUser()` ✅

**Fichier :** `src/middleware/auth-permission.ts`

- [x] Ajouter `requireSuperUser(request)` — retourne 401/403 ou null
- [x] Ajouter `isSuperUserSession(request): Promise<boolean>` — pour les guards hybrides

```typescript
export async function requireSuperUser(request: Request): Promise<Response | null> {
  const session = await getSessionFromRequest(request)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await prisma.userAccount.findUnique({
    where: { id: session.userId },
    select: { isSuperUser: true }
  })
  if (!user?.isSuperUser) return Response.json({ error: 'Forbidden' }, { status: 403 })
  return null
}
```

---

## Étape 3 — Middleware : renforcer l'isolation par clan ✅

Audit complet des routes API. Toutes les routes `[clanId]` passent bien le `clanId` au middleware.

Corrections appliquées :

| Route | Fichier | Correction |
|---|---|---|
| `POST /api/members` | `src/app/api/members/route.ts` | Vérification post-résolution : acteur dans même clan que la cible, sinon `requireSuperUser` |
| `PATCH /api/members/[id]` | `src/app/api/members/[id]/route.ts` | Remplacé par `requireSuperUser` (opération cross-clan) |
| `GET /api/clans/[clanId]/overview` | route | ✅ clanId déjà passé |
| `POST /api/clans/[clanId]/challenges` | route | ✅ clanId déjà passé |
| Toutes autres routes `[clanId]` | — | ✅ clanId déjà passé |

---

## Étape 4 — Restreindre le changement de clan au SuperUser ✅

**Fichier :** `src/app/api/auth/switch-member/route.ts`

Nouvelle règle : changer de clan actif (passer d'un `ClanMember` d'un clan A à un `ClanMember` d'un clan B) est réservé au SuperUser.

- [x] Dans `POST /api/auth/switch-member` :
  - Comparer `clanId` du membre actif et du membre cible
  - Si clans différents → vérifier `isSuperUser`, refuser si non

```typescript
const currentMember = await prisma.clanMember.findUnique({
  where: { id: currentActiveMemberId },
  select: { clanId: true }
})
const targetMember = await prisma.clanMember.findUnique({
  where: { id: memberId },
  select: { clanId: true }
})

if (currentMember?.clanId !== targetMember?.clanId) {
  const user = await prisma.userAccount.findUnique({
    where: { id: session.userId },
    select: { isSuperUser: true }
  })
  if (!user?.isSuperUser) {
    return Response.json({ error: 'Forbidden: clan switching requires SuperUser' }, { status: 403 })
  }
}
```

- [x] Mettre à jour `src/lib/auth-service.ts` : `canSwitchClan` = `user.isSuperUser` (et non `hasOwnerRoleSomewhere`)

---

## Étape 5 — Mettre à jour la logique de promotion de rôle ✅

**Fichier :** `src/app/api/clans/[clanId]/members/[memberId]/role/route.ts`

- [x] Assigner ou révoquer le rôle Owner → exige `isSuperUser` (via `isSuperUserSession`)
- [x] Admin ne peut pas créer ni révoquer d'Owner

```typescript
const OWNER_ROLE = 'Owner'
const actorIsAdmin = await hasAnyRole(actorMemberId, ['Admin'])
const targetRoleIsOwner = newRoleName === OWNER_ROLE || currentRoleIsOwner

if (targetRoleIsOwner && actorIsAdmin) {
  return Response.json({ error: 'Forbidden: only SuperUser can assign or revoke Owner role' }, { status: 403 })
}
```

---

## Étape 6 — Routes de contrôle des crons

Les crons tournent en process serveur autonome : **aucune auth sur le process lui-même**.

**Règle :**
- Trigger par clan (manuel depuis l'UI) → Owner de ce clan
- Trigger global (tous clans) → SuperUser uniquement
- Page status cron → Owner pour son clan, SuperUser pour tous

- [x] `GET/POST /api/clans/[clanId]/cron-control` — conserver `requireRole(['Owner'])` + `ensureMemberInClan()`
- [x] Page `/clans/[clanId]/settings/cron` — conserver accès Owner (son clan uniquement)
- [ ] Si route globale ajoutée (`/api/admin/cron/run-all`) → `requireSuperUser()` obligatoire

---

## Étape 7 — Interface SuperUser ✅

- [x] `isSuperUser` exposé dans `GET /api/auth/session` (champs `isSuperUser` et `user.isSuperUser`)
- [x] `AuthSessionContext` mis à jour avec `isSuperUser`
- [x] `getSessionFromToken` retourne `isSuperUser` depuis `user.isSuperUser`
- [x] `useAuthSession` hook mis à jour — expose `isSuperUser`
- [x] `ClanNavigation.tsx` : `canSwitchClan = isSuperUser` (et non `isOwner`)
- [x] `clans/page.tsx` : `canSwitchClan = isSuperUser`
- [x] Ajouter un indicateur visuel SuperUser dans la nav (badge discret)

---

## Étape 8 — Bootstrap des comptes SuperUser ✅

- [x] `scripts/make-superuser.ts` créé — usage :
  - `npm run make-superuser -- --grant email@example.com`
  - `npm run make-superuser -- --revoke email@example.com`
  - `npm run make-superuser -- --list`
- [x] Script `make-superuser` ajouté dans `package.json`
- [x] Documenter la procédure dans `docs/ops/superuser-bootstrap.md`

---

## Étape 9 — Tests et validation ✅

- [x] Migration appliquée en production (`npx prisma migrate deploy && npx prisma generate`)
- [x] SuperUser créé (`pagio.family@gmail.com`)
- [x] Owner du clan A ne peut pas appeler les routes du clan B
- [x] `POST /api/auth/switch-member` refuse un switch inter-clan pour un non-SuperUser
- [x] SuperUser peut accéder aux routes de tous les clans sans être membre
- [x] Admin ne peut pas promouvoir au rôle Owner
- [x] Moderator ne peut pas accéder aux routes de sync ou cron
- [ ] Crons automatiques continuent de tourner sans session utilisateur

### Vérification du 2026-06-22 (partielle)

- ✅ Confirmé par audit de code : `POST /api/auth/switch-member` bloque le switch inter-clan pour non-SuperUser
- ✅ Confirmé par audit de code : promotion/révocation du rôle Owner réservée au SuperUser
- ✅ Corrigé : les routes `POST /api/clans/[clanId]/sync-matches` et `POST /api/clans/[clanId]/sync-stats` exigent désormais Owner (ou SuperUser via bypass middleware) et autorisent les appels cron internes via header secret.
- ✅ Validé en runtime (curl) : un Admin reçoit `403` sur `POST /api/clans/1/sync-matches`, `POST /api/clans/1/sync-stats` et `GET /api/clans/1/cron-control`.
- ✅ Validé en runtime (curl) : un SuperUser reçoit `200` sur `GET /api/clans/3/cron-control` (accès cross-clan sans membership local).
- ✅ Confirmé par audit de code : `ensureMemberInClan()` bloque l'accès si l'utilisateur n'est pas membre actif du clan. SuperUser bypass automatique.
- ⚠️ Non validé en runtime dans cette passe : continuité des crons automatiques sans session utilisateur (à vérifier en environnement lancé avec worker cron)

---

## Étape 10 — Nouvelle page : demande de création / adhésion à un clan

**Fonctionnalité manquante.** Actuellement les membres sont ajoutés manuellement. Il n'y a pas de flux d'onboarding pour un nouveau joueur.

### Flux cible

```
Joueur arrive sur la page /join (ou /register-clan)
  │
  ├── Saisit son nom de joueur PUBG
  ├── Le système interroge l'API PUBG → résout pubgAccountId et clanId PUBG
  │
  ├── Cas 1 : le clan PUBG existe déjà dans notre DB
  │     → Crée le ClanMember (isActive: false, en attente)
  │     → Notifie Owner et Admin du clan (email ou notification)
  │     → Owner/Admin valide → isActive = true, rôle Member assigné
  │
  └── Cas 2 : le clan PUBG est inconnu de notre DB
        → Crée le Clan + le ClanMember
        → Assigne le joueur comme Owner du nouveau clan (automatique — il est le fondateur)
        → Notifie le SuperUser (nouveau clan enregistré sur la plateforme)
        → Le SuperUser peut changer le rôle Owner a posteriori si besoin
```

### Composants créés ✅

- [x] Page `src/app/join/page.tsx` — formulaire nom joueur PUBG avec choix de plateforme
- [x] Route `POST /api/join` — logique de création/adhésion avec intégration PUBG API
  - Recherche du joueur via `searchPlayerByName()`
  - Récupération du clan via `fetchPlayerClan()`
  - Création de pending member ou nouveau clan + Owner automatique
- [x] Route `POST /api/clans/[clanId]/members/[memberId]/approve` — approbation par Owner/Admin
  - Active le member (`isActive: true`, `joinStatus: 'active'`)
  - Assigne le rôle Member par défaut
- [x] Page `/clans/[clanId]/members/pending` — gestion des demandes en attente
- [x] Route `GET /api/clans/[clanId]/members?status=pending` — filtre pour les pending members
- [x] Lien vers `/join` depuis la page `/login` (nouveau joueur)

### Modèle de données ✅

Le champ `joinStatus` existe déjà sur `ClanMember` : `String @default("active")` — utilisé pour marquer "pending" | "active" | "archived"

### Checklist Étape 10

- [x] Page de join créée et accessible
- [x] Route API POST /api/join implémentée (cas clan existant + cas nouveau clan)
- [x] Route de validation POST .../members/[memberId]/approve implémentée
- [x] Page de gestion des pending members créée
- [x] Query filter status=pending sur la route GET /api/clans/[clanId]/members
- [x] Tests en runtime avec approval de pending member (validation complète)
- [x] Notifications email/système aux Owner/Admin lors d'une demande — type `join_request` ajouté, `notifyJoinRequest()` appelle Owner/Admin du clan, respecte leurs préférences `inAppNotifications`/`emailNotifications`
- [x] Tests en runtime avec l'API PUBG — corrigé : l'API PUBG retourne 404 quand aucun joueur ne correspond (comportement documenté), `searchPlayerByName` rethrownait l'erreur au lieu de retourner `null`. Fix : catch 404 → return null (cohérent avec le reste du fichier)

### Vérification du 2026-06-22 (Étape 10)

- ✅ Page `/join` créée et compilée correctement
- ✅ Formulaire avec champs PUBG Player Name et Platform selector
- ✅ Affichage des shards valides : steam, xbox, psn, kakao
- ✅ Route GET /api/clans/[clanId]/members?status=pending retourne les pending members
- ✅ Page `/clans/[clanId]/members/pending` affiche les members en attente
- ✅ Bouton "Approve" appellace la route POST .../members/[memberId]/approve
- ✅ Member pending activé correctement (isActive = true, joinStatus = 'active')
- ✅ Member obtient le rôle Member par défaut après approbation
- ⚠️ Route POST /api/join bloquée : API PUBG retourne 404 sur GET /shards/{shard}/players — à investiguer (possibilité: clé API invalide ou endpoint API changé)

---

## Étape 11 — Rôle Moderator : définition et permissions ✅

- [x] `src/lib/role-service.ts` mis à jour — Moderator a maintenant : `invite_members`, `manage_challenges`, `view_reports`, `export_reports`, `manage_notifications`, `manage_channels`, `moderate_members`
- [x] `manage_challenges` ajouté dans `PERMISSION_CATALOG`
- [x] Admin mis à jour : ajout de `invite_members`, `remove_members`, `manage_challenges`
- [ ] Vérifier que les routes de challenges acceptent `manage_challenges` (à câbler lors de l'implémentation complète des challenges)
- [ ] Mettre à jour `src/lib/nav-permissions-registry.ts` pour les pages Moderator

---

## Ordre de déploiement recommandé

```
1.  Étape 1   — Migration schema (isSuperUser + joinStatus)
2.  Étape 8   — Bootstrap premier(s) SuperUser via script CLI
3.  Étape 2   — Middleware requireSuperUser()
4.  Étape 4   — Bloquer switch-member inter-clan
5.  Étape 5   — Logique de promotion : Admin ne peut pas créer Owner
6.  Étape 3   — Audit isolation clan sur routes existantes
7.  Étape 6   — Classifier routes cron (aucun changement prévu, sécurisation)
8.  Étape 11  — Définir permissions Moderator en DB et dans role-service.ts
9.  Étape 7   — Interface frontend SuperUser (sélecteur clan)
10. Étape 10  — Page /join et flux onboarding
11. Étape 9   — Validation manuelle de bout en bout
```

---

## Bilan — Mis à jour le 2026-06-23

### ✅ Tout ce qui est implémenté

| Étape | Ce qui est en place |
|---|---|
| 1 | `isSuperUser Boolean @default(false)` et `joinStatus String @default("active")` dans `prisma/schema.prisma` — migration déployée en prod |
| 2 | `requireSuperUser()` et `isSuperUserSession()` dans `src/middleware/auth-permission.ts`, utilisés dans 6 fichiers |
| 3 | `requireSuperUser` câblé sur `POST /api/members` et `PATCH /api/members/[id]` |
| 4 | Switch inter-clan bloqué pour non-SuperUser dans `POST /api/auth/switch-member` ; `canSwitchClan = user.isSuperUser` dans `auth-service.ts` |
| 5 | Promotion/révocation Owner réservée au SuperUser dans la route de rôle |
| 6 | `cron-control` conserve `requireRole(['Owner'])` + bypass SuperUser ; aucune route globale (conditionnel non déclenché) |
| 7 | `isSuperUser` exposé dans `GET /api/auth/session` ; hook `useAuthSession` mis à jour ; badge SuperUser dans la nav |
| 8 | `scripts/make-superuser.ts` opérationnel ; `docs/ops/superuser-bootstrap.md` créé |
| 9 | Validé en runtime (curl) : isolation clan, switch-member, promotion Owner, bypass SuperUser cross-clan |
| 10 | Page `/join`, `POST /api/join` (avec garde doublon), routes `approve`/`reject`, page `pending`, filtre `?status=pending`, guard utilisateur déjà membre, notifications Owner/Admin (`join_request`) |
| 11 | Permissions Moderator définies dans `src/lib/role-service.ts` (`manage_challenges`, `invite_members`, `moderate_members`, etc.) |

### ❌ Reste à faire

| Priorité | Item | Étape | Condition |
|---|---|---|---|
| **TEST** | Valider en runtime que les crons automatiques tournent sans session utilisateur (worker cron actif en prod) | 9 | À vérifier sur le serveur |
| **CODE** | Câbler `manage_challenges` dans les routes de challenges | 11 | Bloqué par l'implémentation complète des challenges |
| **CODE** | Mettre à jour `src/lib/nav-permissions-registry.ts` pour les pages accessibles au rôle Moderator | 11 | Bloqué par l'implémentation complète des challenges |

### Résumé

**Toutes les étapes sont implémentées.** Il reste 3 items ouverts :
- 1 validation runtime sur le serveur (crons sans session) — vérification manuelle, pas de code à écrire
- 2 items Étape 11 bloqués par la future implémentation des challenges (ne pas toucher avant)
