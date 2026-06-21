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
- [ ] **À lancer sur le serveur :** `npx prisma migrate deploy && npx prisma generate`

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

- [ ] `GET/POST /api/clans/[clanId]/cron-control` — conserver `requireRole(['Owner'])` + `ensureMemberInClan()`
- [ ] Page `/clans/[clanId]/settings/cron` — conserver accès Owner (son clan uniquement)
- [ ] Si route globale ajoutée (`/api/admin/cron/run-all`) → `requireSuperUser()` obligatoire

---

## Étape 7 — Interface SuperUser ✅

- [x] `isSuperUser` exposé dans `GET /api/auth/session` (champs `isSuperUser` et `user.isSuperUser`)
- [x] `AuthSessionContext` mis à jour avec `isSuperUser`
- [x] `getSessionFromToken` retourne `isSuperUser` depuis `user.isSuperUser`
- [x] `useAuthSession` hook mis à jour — expose `isSuperUser`
- [x] `ClanNavigation.tsx` : `canSwitchClan = isSuperUser` (et non `isOwner`)
- [x] `clans/page.tsx` : `canSwitchClan = isSuperUser`
- [ ] Ajouter un indicateur visuel SuperUser dans la nav (badge discret)

---

## Étape 8 — Bootstrap des comptes SuperUser ✅

- [x] `scripts/make-superuser.ts` créé — usage :
  - `npm run make-superuser -- --grant email@example.com`
  - `npm run make-superuser -- --revoke email@example.com`
  - `npm run make-superuser -- --list`
- [x] Script `make-superuser` ajouté dans `package.json`
- [ ] Documenter la procédure dans `docs/ops/superuser-bootstrap.md`

---

## Étape 9 — Tests et validation

⚠️ **Action requise côté serveur avant de tester :**
```bash
# 1. Appliquer la migration et regénérer le client Prisma
npx prisma migrate deploy
npx prisma generate

# 2. Créer le premier SuperUser
npm run make-superuser -- --grant votre-email@example.com
```

- [ ] Owner du clan A ne peut pas appeler les routes du clan B
- [ ] `POST /api/auth/switch-member` refuse un switch inter-clan pour un non-SuperUser
- [ ] SuperUser peut accéder aux routes de tous les clans sans être membre
- [ ] Admin ne peut pas promouvoir au rôle Owner
- [ ] Moderator ne peut pas accéder aux routes de sync ou cron
- [ ] Crons automatiques continuent de tourner sans session utilisateur

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

### Composants à créer

- [ ] Page `src/app/join/page.tsx` (formulaire nom joueur PUBG)
- [ ] Route `POST /api/join` :
  - Appel `searchPlayerByName()` → résout `pubgAccountId`
  - Appel `fetchPlayerClan()` → résout le `clanId` PUBG du joueur
  - Vérifie si le clan existe en DB (`Clan.pubgClanId`)
  - **Cas 1** : crée `ClanMember` en pending + notifie Owner/Admin
  - **Cas 2** : crée `Clan` + `ClanMember` + `ClanRole` Owner + notifie SuperUser
- [ ] Route `POST /api/clans/[clanId]/members/[memberId]/approve` (Owner/Admin)
  - Met `isActive = true` et assigne le rôle `Member`
- [ ] Entrée de menu ou lien depuis la page de login/home pour accéder à `/join`

### Modèle de données — ajout d'un statut d'adhésion

Envisager d'ajouter `joinStatus` sur `ClanMember` pour distinguer les membres en attente :

```prisma
// Option : champ enum sur ClanMember
joinStatus  String @default("active") // "pending" | "active" | "archived"
```

Ou réutiliser `isActive = false` avec un champ `pendingApproval Boolean @default(false)`.

- [ ] Décider de l'approche (enum vs boolean) et créer la migration

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
