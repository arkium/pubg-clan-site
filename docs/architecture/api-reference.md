# Référence API — vue d'ensemble

Ce document liste les ~99 routes `src/app/api/**/route.ts` du projet, avec pour chacune : la méthode HTTP, l'authentification requise, sa pertinence pour le futur développement mobile (voir [Plan application mobile](mobile-app-plan.md)), et une description courte.

**Objectif :** servir de carte unique pour choisir quels endpoints l'app React Native doit consommer, sans avoir à parcourir les 12 docs de features et les 8 docs de télémétrie. Pour les routes déjà documentées ailleurs, ce tableau ne fait que pointer vers le contrat complet (pas de duplication). Pour les routes qui n'avaient encore aucun contrat écrit, le détail complet est donné ici.

**Légende — colonne Pertinence mobile :**

| Symbole | Signification |
|---|---|
| ✅ Pertinent | Utile pour l'app mobile (lecture de stats, auth, notifications, etc.) |
| ⚠️ Admin web uniquement | Gestion/settings qui n'a probablement pas sa place sur mobile |
| ❌ Interne/dev | Jamais appelé depuis un client — routes internes, queue, monitoring worker |

**Auth — rappel des mécanismes rencontrés :**
- `Session (cookie)` : `getSessionFromRequest` — un cookie `pubg_clan_session` valide suffit.
- `requireSameClanAsMember` : session valide + l'utilisateur doit être lié au membre ciblé ou SuperUser.
- `requireRole([...])` : rôle clan (`Owner`, `Admin`, `Moderator`, `Member`) sur le clan ciblé.
- `requirePermission(key)` : vérifie une permission fine (`manage_members`, `manage_roles`, `edit_clan`, `view_reports`, `assign_roles`, `manage_settings`) portée par le rôle du membre actif.
- `requireNavPermission(navKey)` : vérifie le rôle configuré pour une entrée de navigation (table `NavItem`/`NavPermission`, éditable depuis `/settings/nav-permissions`) — plus souple qu'un rôle fixe.
- `requireSuperUser` / `isSuperUserSession` : réservé au(x) compte(s) SuperUser (cross-clan).
- `Secret header` : routes internes protégées par un secret partagé (`CRON_BOOTSTRAP_SECRET`, `AUTH_BOOTSTRAP_SECRET`), jamais appelées par un client applicatif.
- `Public` : aucune authentification (pages pré-login, health checks).

---

## Auth — `/api/auth/*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/auth/activate/context` | Public (token en query) | ✅ Pertinent | Vérifie un token d'invitation d'activation — voir [Auth](../features/auth.md) |
| POST | `/api/auth/activate` | Public (token dans le body) | ✅ Pertinent | Active un compte + crée la session — voir [Auth](../features/auth.md) |
| POST | `/api/auth/bootstrap-owner-invite` | Secret header (`x-bootstrap-secret`) | ❌ Interne/dev | Crée l'invitation Owner initiale (bootstrap système) — voir [Auth](../features/auth.md) |
| POST | `/api/auth/login` | Public (credentials) | ✅ Pertinent | Authentifie et pose le cookie de session — voir [Auth](../features/auth.md) |
| POST | `/api/auth/logout` | Session (cookie) | ✅ Pertinent | Révoque la session et efface le cookie — voir [Auth](../features/auth.md) |
| POST | `/api/auth/password/forgot` | Public | ✅ Pertinent | Demande un lien de reset mot de passe — voir [Auth](../features/auth.md) |
| GET | `/api/auth/password/reset/context` | Public (token en query) | ✅ Pertinent | Vérifie la validité d'un token de reset — voir [Auth](../features/auth.md) |
| POST | `/api/auth/password/reset` | Public (token dans le body) | ✅ Pertinent | Applique le nouveau mot de passe — voir [Auth](../features/auth.md) |
| PATCH | `/api/auth/password` | Session (cookie) | ✅ Pertinent | Change le mot de passe de l'utilisateur connecté — non documenté ailleurs, détail ci-dessous |
| GET | `/api/auth/profile` | Session (cookie) | ✅ Pertinent | Profil utilisateur + membres liés — voir [Auth](../features/auth.md) |
| PATCH | `/api/auth/profile` | Session (cookie) | ✅ Pertinent | Met à jour email/displayName/avatarUrl — voir [Auth](../features/auth.md) |
| GET | `/api/auth/session` | Session (cookie) | ✅ Pertinent | Session courante, permissions, membres liés — voir [Auth](../features/auth.md) |
| POST | `/api/auth/switch-member` | Session (cookie) | ✅ Pertinent | Change le membre actif (cross-clan réservé SuperUser) — voir [Auth](../features/auth.md) |

### Détail — `PATCH /api/auth/password`

Non documenté ailleurs (à ne pas confondre avec `/api/auth/password/forgot` et `/api/auth/password/reset`, qui gèrent le flux "mot de passe oublié").

- **Auth :** session valide (`getSessionFromRequest`).
- **Body :** `{ currentPassword: string, newPassword: string (min 8) }` — rejeté si `newPassword === currentPassword`.
- **Réponse succès :** `{ success: true, message: string }`.
- **Erreurs :** `401` si pas de session, `400` si mot de passe actuel incorrect ou payload invalide.
- Implémentation : `changeUserPassword()` dans `src/lib/auth-service.ts`.

---

## Setup — `/api/setup/*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| POST | `/api/setup/initialize` | Public (uniquement si `first_run`) | ⚠️ Admin web uniquement | Assistant de premier lancement (crée le premier clan + Owner) — détail ci-dessous |
| GET | `/api/setup/pending-activation` | Public (actif seulement en état `pending_activation`) | ⚠️ Admin web uniquement | Contexte d'accueil pendant l'attente d'activation Owner — détail ci-dessous |
| POST | `/api/setup/pending-activation` | Public (idem) | ⚠️ Admin web uniquement | Renvoie l'invitation Owner en attente |
| GET | `/api/setup/status` | Public | ✅ Pertinent | Expose `setupState` (`first_run`/`pending_activation`/`completed`) — voir [Auth](../features/auth.md) |

### Détail — `POST /api/setup/initialize`

- **Body :** `{ displayName, pubgPlayerName, platformShard? (défaut 'steam'), email }`.
- **Comportement :** refuse avec `409` si le setup est déjà terminé (`isFirstRun()` false). Recherche le joueur sur l'API PUBG, crée le clan + le membre + une invitation Owner via `initializeFirstRun()` (`src/lib/setup-service.ts`).
- **Réponse :** `{ success: true, clan, member: { id, displayName, pubgPlayerName }, invite: { inviteId, expiresAt, activationUrl } }`.
- **Erreurs :** `404` joueur PUBG introuvable, `409` membre déjà existant ou setup déjà fait.

### Détail — `GET` / `POST /api/setup/pending-activation`

- **GET :** renvoie `409` si l'état courant n'est pas `pending_activation`. Sinon `{ settings, clanLabel, invite: { email, expiresAt, displayName } | null }` (settings = message d'accueil configuré pour le clan primaire).
- **POST :** renvoie `409`/`404` selon l'état ; sinon régénère l'invitation Owner via `createOwnerBootstrapInvite()` et renvoie `{ success: true, invite: { email, expiresAt, displayName } }`.

---

## Join — `/api/join`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| POST | `/api/join` | Session (cookie), pas de rôle clan requis | ✅ Pertinent | Rejoint un clan existant (pending) ou en crée un nouveau (Owner) — voir [Clans](../features/clans.md) |

---

## Clans (core) — `/api/clans*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/clans` | Public | ✅ Pertinent | Liste des clans actifs + comptages — voir [Auth](../features/auth.md) |
| GET | `/api/clans/[clanId]/overview` | `requirePermission('manage_members')` (session requise) | ✅ Pertinent | Vue d'ensemble clan (roster, `clanStats` JSON) — voir [Clans](../features/clans.md) |
| GET | `/api/clans/[clanId]/pubg-diff` | `requirePermission('manage_members')` | ⚠️ Admin web uniquement | Diff membres PUBG officiels vs membres trackés — voir [Clans](../features/clans.md) |
| GET | `/api/clans/[clanId]/roles` | `requirePermission('manage_roles')` | ⚠️ Admin web uniquement | Liste rôles clan + catalogue des permissions — détail ci-dessous |
| GET | `/api/clans/[clanId]/settings/login-welcome` | Public | ✅ Pertinent | Message d'accueil du clan (bannière login) — détail ci-dessous |
| PUT | `/api/clans/[clanId]/settings/login-welcome` | `requirePermission('manage_settings')` | ⚠️ Admin web uniquement | Met à jour le message d'accueil du clan |
| POST | `/api/clans/[clanId]/sync-stats` | `requireRole(['Owner'])` (bypass si appel cron interne) | ⚠️ Admin web uniquement | Recalcule `clanStats` JSON — voir [Clans](../features/clans.md) |
| GET | `/api/clans/[clanId]/cron-control` | `requireRole(['Owner'])` ou SuperUser | ⚠️ Admin web uniquement | Statut santé cron du clan — voir [Cron](../ops/cron.md) |
| POST | `/api/clans/[clanId]/cron-control` | `requireRole(['Owner'])` ou SuperUser | ⚠️ Admin web uniquement | Déclenche une action cron manuelle — voir [Cron](../ops/cron.md) |
| GET | `/api/clans/[clanId]/dev/runtime-status` | `requireRole(['Owner'])` | ❌ Interne/dev | Infos process Node (pid, uptime, hostname) — détail ci-dessous |
| GET | `/api/clans/[clanId]/lifetime-stats` | `requireNavPermission('clan.stats')` | ✅ Pertinent | Stats lifetime agrégées de tous les membres du clan — détail ci-dessous |
| GET | `/api/clans/[clanId]/leaderboard` | `requireNavPermission('clan.leaderboard')` | ✅ Pertinent | Classement clan par période/tri — voir [Leaderboard](../features/leaderboard.md) |
| GET | `/api/clans/[clanId]/squad-analysis` | `requireNavPermission('clan.stats')` | ✅ Pertinent | Analyse des compositions squad récurrentes — détail ci-dessous |
| GET | `/api/clans/[clanId]/awards` | `requireRole(['Owner','Admin','Member'])` | ✅ Pertinent | 11 awards fun calculés par période — voir [Awards](../features/awards.md) |

> **Historique :** `leaderboard`, `lifetime-stats`, `squad-analysis` et `matches` (voir domaine Matchs) n'appliquaient auparavant aucun contrôle de rôle (seul un `clanId` numérique valide était vérifié). Un `requireNavPermission` a été ajouté sur chacune (2026-07-05, décision : accès configurable par rôle plutôt qu'un rôle figé, voir [Plan application mobile](mobile-app-plan.md)) — `clan.leaderboard`/`clan.matches` réutilisent les clés nav existantes des pages web correspondantes ; `squad-analysis` et `lifetime-stats` réutilisent `clan.stats` (aucune page dédiée à `squad-analysis` ne consomme encore cette route).

### Détail — `GET /api/clans/[clanId]/roles`

- **Réponse :** `{ roles: ClanRole[], permissions: Permission[] }` — initialise les rôles par défaut du clan si absents (`initializeDefaultRoles`), puis liste le catalogue global des permissions (table `Permission`, triée par `category`/`key`).

### Détail — `GET` / `PUT /api/clans/[clanId]/settings/login-welcome`

Variante **par clan** du réglage global `/api/settings/login-welcome` (voir [Paramètres admin](../ops/settings.md)) — utilisée quand plusieurs clans coexistent.
- **GET :** `{ settings, clanLabel }` (pas d'auth : affiché sur la page de login avant connexion).
- **PUT :** body `{ badge, title, message, imageUrl? }` (validation zod, `imageUrl` doit commencer par `http(s)://` si fourni) → `{ success: true, settings }`.

### Détail — `GET /api/clans/[clanId]/dev/runtime-status`

- **Réponse :** `{ ok: true, clanId, runtime: { pid, nodeVersion, uptimeSec, hostname } }` — outil de diagnostic process, sans intérêt pour un client applicatif.

### Détail — `GET /api/clans/[clanId]/lifetime-stats`

- **Réponse :** `{ clan: { id, name, tag }, members: Array<{ memberId, displayName, lastRefreshedAt, stats: LifetimeStats }> }` où `LifetimeStats` a la même forme que celle documentée dans [Dashboard membre](../features/member-dashboard.md) (`combat`, `victory`, `support`, `vehicle`, `movement`, `other`). Vue agrégée clan entier (vs la route membre qui ne renvoie qu'un joueur).

### Détail — `GET /api/clans/[clanId]/squad-analysis`

- **Query :** aucun.
- **Réponse :** `{ clanId, clanName, ...analysis }` où `analysis` provient de `getClanSquadAnalysis()` (`src/lib/squad-detector.ts`) — compositions squad détectées, fréquence, performance par groupe.

---

## Membres — `/api/clans/[clanId]/members*`, `/api/members*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/clans/[clanId]/members` | `requirePermission('manage_members')` | ⚠️ Admin web uniquement | Roster complet avec rôles/invitations/permissions — voir [Clans](../features/clans.md) |
| POST | `/api/clans/[clanId]/members/[memberId]/approve` | `requireRole(['Owner','Admin'])` | ⚠️ Admin web uniquement | Approuve un membre en attente — voir [Clans](../features/clans.md) |
| POST | `/api/clans/[clanId]/members/[memberId]/invite` | `requirePermission('manage_members')` | ⚠️ Admin web uniquement | Crée une invitation d'activation — voir [Clans](../features/clans.md) |
| DELETE | `/api/clans/[clanId]/members/[memberId]/invite` | `requirePermission('manage_members')` | ⚠️ Admin web uniquement | Révoque l'invitation active du membre |
| POST | `/api/clans/[clanId]/members/[memberId]/reject` | `requireRole(['Owner','Admin'])` | ⚠️ Admin web uniquement | Rejette une demande d'adhésion pending — voir [Clans](../features/clans.md) |
| PATCH | `/api/clans/[clanId]/members/[memberId]/role` | `requirePermission('assign_roles')` (+ SuperUser si rôle Owner impliqué) | ⚠️ Admin web uniquement | Change le rôle d'un membre — voir [Clans](../features/clans.md) |
| GET | `/api/members` | Session (cookie) | ✅ Pertinent | Liste tous les membres (filtre `?clanId=`) + médailles (top 3 par métrique lifetime) — détail ci-dessous |
| POST | `/api/members` | `requirePermission('manage_members')` | ⚠️ Admin web uniquement | Ajoute un membre (recherche PUBG + détection clan) — détail ci-dessous |
| GET | `/api/members/[id]` | `requireSameClanAsMember` | ✅ Pertinent | Profil minimal d'un membre (displayName, avatar, pubgPlayerName) — détail ci-dessous |
| DELETE | `/api/members/[id]` | `requirePermission('manage_members')` | ⚠️ Admin web uniquement | Désactive (soft) ou supprime (`?hard=true`) un membre — détail ci-dessous |
| PATCH | `/api/members/[id]` | `requireSuperUser` | ⚠️ Admin web uniquement | Déplace un membre vers un autre clan — détail ci-dessous |
| GET | `/api/members/[id]/dashboard` | `requireSameClanAsMember` | ✅ Pertinent | Stats période + progression + squads fréquents — voir [Dashboard membre](../features/member-dashboard.md) |
| GET | `/api/members/[id]/stats` | `requireSameClanAsMember` | ✅ Pertinent | Stats lifetime + rangs clan — voir [Dashboard membre](../features/member-dashboard.md) |
| POST | `/api/members/[id]/stats` | `requireSameClanAsMember` | ✅ Pertinent | Refresh forcé des stats lifetime depuis l'API PUBG — voir [Dashboard membre](../features/member-dashboard.md) |
| GET | `/api/members/[id]/season-stats` | `requireSameClanAsMember` | ✅ Pertinent | Stats ranked/normal en cache (3 dernières saisons) — voir [Season stats](../features/season-stats.md) |
| POST | `/api/members/[id]/season-stats` | `requireSameClanAsMember` | ✅ Pertinent | Refresh forcé depuis l'API PUBG — voir [Season stats](../features/season-stats.md) |
| GET | `/api/members/[id]/weapon-mastery` | `requireSameClanAsMember` | ✅ Pertinent | Maîtrise armes carrière (cache DB) — voir [Armes](../features/weapons.md) |
| POST | `/api/members/[id]/weapon-mastery` | `requireSameClanAsMember` | ✅ Pertinent | Refresh depuis l'API PUBG — voir [Armes](../features/weapons.md) |
| GET | `/api/members/[id]/rewards` | `requireSameClanAsMember` | ✅ Pertinent | Points et badges de récompense du membre — détail ci-dessous |
| GET | `/api/members/[id]/map-stats` | `requireSameClanAsMember` | ✅ Pertinent | Stats par carte (soi/membre/clan/meilleure comp) — détail ci-dessous |
| GET | `/api/members/[id]/activity-heatmap` | `requireSameClanAsMember` | ✅ Pertinent | Heatmap jour×heure d'activité — voir [Dashboard membre](../features/member-dashboard.md) |

### Détail — `GET /api/members`

- **Query :** `?clanId=<number>` (optionnel — sans lui, tous les clans confondus).
- **Réponse :** tableau de membres actifs avec `avatarUrl`, `clan`, `isOwner`, et `medalCounts: { gold, silver, bronze }` (comptage des top-3 par métrique lifetime clan, calculé sur ~23 métriques `combat`/`victory`/`support`/`vehicle`/`movement`/`other`).

### Détail — `POST /api/members`

- **Body :** `{ displayName, pubgPlayerName, platformShard? ('steam'), clanId?, mode?: 'preview'|'create' }` (zod).
- **Comportement :** résout le joueur via l'API PUBG, détecte automatiquement son clan PUBG (`ensureTrackedClanForPlayer`), sinon utilise `clanId` fourni ou un clan "Ungrouped". Vérifie que l'acteur appartient au clan cible (sauf SuperUser). En mode `preview`, ne persiste rien et renvoie juste l'aperçu joueur/clan détecté.
- **Réponse (mode `create`) :** le `ClanMember` créé (`201`), avec rôle par défaut assigné et `clanStats` resynchronisé.
- **Erreurs :** `404` joueur introuvable, `409` membre déjà existant, `403` clan cible différent de celui de l'acteur.

### Détail — `GET /api/members/[id]`

- **Réponse :** `{ id, displayName, avatarUrl, pubgPlayerName, platformShard }` — `404` si membre inactif/inexistant.

### Détail — `DELETE /api/members/[id]`

- **Query :** `?hard=true` pour suppression définitive (sinon désactivation `isActive: false`).
- **Réponse :** `{ success: true, memberId, deleted: 'hard'|'soft' }`.

### Détail — `PATCH /api/members/[id]`

- **Body :** `{ clanId: number }` (zod).
- **Comportement :** réservé SuperUser (opération cross-clan). Refuse si le membre a le rôle Owner (sauf clan "Ungrouped"), ou si la plateforme (`platformShard`) diffère entre membre et clan cible. Réattribue le rôle par défaut dans le nouveau clan, resynchronise les stats des deux clans (ancien + nouveau).
- **Réponse :** `{ success: true, memberId, clanId, clan: { id, name, tag } }`.

### Détail — `GET /api/members/[id]/rewards`

- **Réponse :** `{ displayName, rewards: { totalPoints, badges: string[] } | null }` — source : `ClanMember.playerRewards` (relation `PlayerRewards`).

### Détail — `GET /api/members/[id]/map-stats`

- **Query :** `?scope=self|member|clan|best` (défaut `self`), `?bestMode=duo|trio|squad`, `?period=week|month|all` (défaut `all`), `?targetMemberId=` (si `scope=member`).
- **Réponse :** `{ scope, scopeLabel, options: { members, bestModes, mapLabels }, selected, totals: { rows, maps }, mapStats: MapStatEntry[], bestCompositions: Array<{ mode, label, teamMembers, matches, wins, winRate, avgPlacement }>, mapLabels }` où `MapStatEntry` contient `mapName`, `mapLabel`, `matches`, `winRate`, `top10Rate`, `avgPlacement`, totaux kills/knockouts/assists/dégâts/headshots/revives, `avgDurationSeconds`.

---

## Matchs — `/api/clans/[clanId]/matches*`, `/api/members/[id]/matches`, `/api/matches/[matchId]`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/clans/[clanId]/matches` | `requireNavPermission('clan.matches')` | ✅ Pertinent | Matchs squad du clan (sessions, synergies, top performers) — voir [Matchs](../features/matches.md) |
| POST | `/api/clans/[clanId]/sync-matches` | `requireRole(['Owner'])` (bypass si appel cron interne) | ⚠️ Admin web uniquement | Sync matchs PUBG pour tous les membres actifs — voir [Matchs](../features/matches.md) |
| GET | `/api/clans/[clanId]/matches/[matchId]/telemetry` | `requireNavPermission('clan.matches')` | ✅ Pertinent | Détail télémétrie d'un match précis (scope clan) — non documenté ailleurs, détail ci-dessous |
| GET | `/api/members/[id]/matches` | `requireSameClanAsMember` | ✅ Pertinent | Historique matchs membre ou détection de matchs récents non importés — voir [Matchs](../features/matches.md) |
| GET | `/api/matches/[matchId]` | Aucun (query `shard`/`playerId` requis) | ✅ Pertinent | Détail d'un match PUBG pour import — voir [Matchs](../features/matches.md) |
| POST | `/api/matches/[matchId]` | Aucun (body `memberId`/`shard`/`playerId`) | ✅ Pertinent | Importe un match en base pour un membre — voir [Matchs](../features/matches.md) |

### Détail — `GET /api/clans/[clanId]/matches/[matchId]/telemetry`

Non documenté ailleurs — variante clan-scope du détail télémétrie (à distinguer de `/api/clans/[clanId]/telemetry/*` qui travaille par période/agrégat).

- **Path params :** `clanId`, `matchId` (= `squadMatchId`).
- **Réponse (`buildTelemetrySuccessResponse`) :** `{ success, meta, data: { match: { id, pubgMatchId, gameMode, mapName, placement, createdAt, totalKills/Damage/Assists/Revives, members[] }, telemetry: { status, attemptCount, lastAttemptAt, nextRetryAt, parserVersion, parsedAt, sourceGeneratedAt, contentLength, bytesDownloaded, errorCode, errorMessage, summary, weaponStats, memberStats, positionSamples, trajectorySegments, deathSamples, phaseSnapshots, createdAt, updatedAt }, weaponLabels, phaseLabels, memberIdentityMap }, legacy: <même objet> }`.
- **Erreurs :** `400` clan/match id invalide, `404` (`TELEMETRY_NOT_FOUND`) si aucune télémétrie liée à ce match pour ce clan.
- Implémentation : requête SQL brute joignant `SquadMatch`/`SquadMatchTelemetry`, filtrée par appartenance au clan via `SquadMember`/`ClanMember`.

---

## Notifications — `/api/members/[id]/notifications*`, `/api/members/[id]/notification-preferences`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/members/[id]/notifications` | `requireSameClanAsMember` | ✅ Pertinent | Liste paginée + `unreadCount` — voir [Notifications](../features/notifications.md) |
| PATCH | `/api/members/[id]/notifications` | `requireSameClanAsMember` | ✅ Pertinent | Marque tout (`all:true`) ou une liste d'ids comme lues — voir [Notifications](../features/notifications.md) |
| PATCH | `/api/members/[id]/notifications/[notifId]` | `requireSameClanAsMember` | ✅ Pertinent | Marque une notification lue/non lue — voir [Notifications](../features/notifications.md) |
| DELETE | `/api/members/[id]/notifications/[notifId]` | `requireSameClanAsMember` | ✅ Pertinent | Supprime une notification — voir [Notifications](../features/notifications.md) |
| GET | `/api/members/[id]/notification-preferences` | `requireSameClanAsMember` | ✅ Pertinent | Préférences (canaux + types), upsert valeurs par défaut — voir [Notifications](../features/notifications.md) |
| PATCH | `/api/members/[id]/notification-preferences` | `requireSameClanAsMember` | ✅ Pertinent | Met à jour un sous-ensemble de préférences — voir [Notifications](../features/notifications.md) |

---

## Défis / Rapports — `/api/clans/[clanId]/challenges*`, `/api/clans/[clanId]/reports*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/clans/[clanId]/challenges` | `requireNavPermission('clan.challenges')` | ✅ Pertinent | Liste défis du clan (filtre `?status=`) — voir [Défis](../features/challenges.md) |
| POST | `/api/clans/[clanId]/challenges` | `requirePermission('edit_clan')` | ⚠️ Admin web uniquement | Crée un défi — voir [Défis](../features/challenges.md) |
| GET | `/api/clans/[clanId]/challenges/[challengeId]` | `requireNavPermission('clan.challenges')` | ✅ Pertinent | Détail d'un défi + participants — voir [Défis](../features/challenges.md) |
| POST | `/api/clans/[clanId]/challenges/[challengeId]/join` | Session (via `getActorMemberId`, membre du clan requis) | ✅ Pertinent | Rejoint un défi actif — voir [Défis](../features/challenges.md) |
| GET | `/api/clans/[clanId]/challenges/[challengeId]/leaderboard` | `requireNavPermission('clan.challenges')` | ✅ Pertinent | Classement des participants d'un défi — voir [Défis](../features/challenges.md) |
| GET | `/api/clans/[clanId]/reports` | `requirePermission('view_reports')` | ✅ Pertinent | Liste paginée des rapports (filtre `?type=`) — voir [Rapports](../features/reports.md) |
| GET | `/api/clans/[clanId]/reports/[reportId]` | `requireNavPermission('clan.reports')` | ✅ Pertinent | Détail complet d'un rapport — voir [Rapports](../features/reports.md) |
| GET | `/api/clans/[clanId]/reports/[reportId]/export` | `requireNavPermission('clan.reports')` | ✅ Pertinent | Export HTML/PDF/JSON (`?format=`) — voir [Rapports](../features/reports.md) |

> **Historique :** `challenges` (liste + détail + leaderboard) et `reports` (détail + export) n'appliquaient auparavant aucun contrôle de rôle. Un `requireNavPermission` a été ajouté (2026-07-05), réutilisant les clés nav existantes `clan.challenges` / `clan.reports` des pages web correspondantes.

---

## Settings (admin) — `/api/settings/*`

Toutes ces routes pilotent des pages `/settings/*` réservées Owner/Admin/SuperUser (voir [Paramètres admin](../ops/settings.md) et [Cron](../ops/cron.md)). Les GET de labels (cartes/armes/phases) sont marqués pertinents pour mobile car l'app aura besoin des mêmes libellés d'affichage ; leurs PUT restent admin-only.

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/settings/cron-schedules` | SuperUser | ⚠️ Admin web uniquement | Valeur effective des 9 plannings cron — voir [Cron](../ops/cron.md) |
| PUT | `/api/settings/cron-schedules` | SuperUser | ⚠️ Admin web uniquement | Modifie l'expression d'un planning — voir [Cron](../ops/cron.md) |
| DELETE | `/api/settings/cron-schedules/[key]` | SuperUser | ⚠️ Admin web uniquement | Réinitialise un planning à sa valeur par défaut — voir [Cron](../ops/cron.md) |
| GET | `/api/settings/cron-workers-status` | SuperUser | ⚠️ Admin web uniquement | Statut des workers télémétrie (lock files + queues) — voir [Cron](../ops/cron.md) |
| GET | `/api/settings/email-delivery` | Permission `*` | ⚠️ Admin web uniquement | Statut config SMTP — voir [Paramètres admin](../ops/settings.md) |
| POST | `/api/settings/email-delivery` | Permission `*` | ⚠️ Admin web uniquement | Envoie un email de test — voir [Paramètres admin](../ops/settings.md) |
| DELETE | `/api/settings/email-delivery` | Permission `*` | ⚠️ Admin web uniquement | Révoque la validation email — non détaillé dans [Paramètres admin](../ops/settings.md), même garde d'accès que GET/POST |
| GET | `/api/settings/login-welcome` | Public | ✅ Pertinent | Message d'accueil global (bannière login) — voir [Paramètres admin](../ops/settings.md) |
| PUT | `/api/settings/login-welcome` | `manage_settings` ou `*` | ⚠️ Admin web uniquement | Met à jour le message d'accueil global — voir [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/map-labels` | `manage_settings` ou `*` | ✅ Pertinent | Labels lisibles des cartes PUBG — voir [Paramètres admin](../ops/settings.md) |
| PUT | `/api/settings/map-labels` | `manage_settings` ou `*` | ⚠️ Admin web uniquement | Met à jour les labels de cartes — voir [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/nav-permissions` | Aucun contrôle explicite en lecture | ⚠️ Admin web uniquement | Registre de navigation (items, rôles, positions, labels) — voir [Permissions navigation](../ops/nav-permissions.md) |
| PUT | `/api/settings/nav-permissions` | SuperUser ou `requireRole(['Owner'])` | ⚠️ Admin web uniquement | Modifie rôle/position/label/CRUD d'une entrée de nav — voir [Permissions navigation](../ops/nav-permissions.md) |
| GET | `/api/settings/phase-labels` | `manage_settings` ou `*` | ✅ Pertinent | Labels des phases de jeu — voir [Paramètres admin](../ops/settings.md) |
| PUT | `/api/settings/phase-labels` | `manage_settings` ou `*` | ⚠️ Admin web uniquement | Met à jour les labels de phases — voir [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/pubg-api-calls` | Permission `*` | ⚠️ Admin web uniquement | Historique + totaux des appels API PUBG — voir [Paramètres admin](../ops/settings.md) (note : le doc mentionne `/api/settings/pubg-api/calls`, le chemin réel du fichier est `pubg-api-calls`) |
| DELETE | `/api/settings/pubg-api-calls` | Permission `*` | ⚠️ Admin web uniquement | Purge l'historique des appels API PUBG loggés — non mentionné dans [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/pubg-api-rate-limit` | Permission `*` | ⚠️ Admin web uniquement | Lit le RPM configuré + bornes — non documenté ailleurs, détail ci-dessous |
| POST | `/api/settings/pubg-api-rate-limit` | Permission `*` | ⚠️ Admin web uniquement | Modifie le RPM (override DB) — détail ci-dessous |
| GET | `/api/settings/weapon-categories` | `manage_settings` ou `*` | ✅ Pertinent | Catégories d'armes + labels — voir [Paramètres admin](../ops/settings.md) |
| PUT | `/api/settings/weapon-categories` | `manage_settings` ou `*` | ⚠️ Admin web uniquement | Met à jour catégories/labels d'armes — voir [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/weapon-labels` | `manage_settings` ou `*` | ✅ Pertinent | Labels lisibles des armes — voir [Paramètres admin](../ops/settings.md) |
| PUT | `/api/settings/weapon-labels` | `manage_settings` ou `*` | ⚠️ Admin web uniquement | Met à jour les labels d'armes — voir [Paramètres admin](../ops/settings.md) |

### Détail — `GET` / `POST /api/settings/pubg-api-rate-limit`

Correspond à la page `/settings/pubg-api-rate-limit` mentionnée dans `CLAUDE.md` (gotcha #8) mais absente de [Paramètres admin](../ops/settings.md).

- **GET :** `{ rpm: number, bounds: { min, max, default } }` (source : `AppConfig`, fallback env `PUBG_API_RATE_LIMIT_RPM`).
- **POST :** body `{ rpm: number (entier positif) }` → `{ success: true, rpm, bounds }`. Valeur bornée par `getPubgApiRateLimitBounds()`.
- **Auth :** permission `*` uniquement (SuperUser/Owner complet) sur les deux méthodes.

---

## Télémétrie (clan-level) — `/api/clans/[clanId]/telemetry/*`

Contrats complets déjà documentés dans [Télémétrie — API](../telemetry/api.md). Toutes les routes de queue/monitoring/recovery sont classées ❌ (outils d'admin télémétrie, jamais appelés depuis un client final) ; les routes de lecture de stats (`weapons`, `synergies`, `playstyle`, `circles`, `positions`, `heatmap`, `loot`, `vehicles`, `drop-zones`) sont ✅ pour un futur écran mobile "stats avancées".

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/weapons` | `requireNavPermission('clan.stats-weapons')` | ✅ Pertinent | Stats armes agrégées par membre — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/synergies` | `requireRole(['Owner'])` | ✅ Pertinent | Revives/co-kills/dégâts partagés par paire — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/playstyle` | `requireRole(['Owner'])` | ✅ Pertinent | Scores agressivité/soutien/discipline de zone — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/circles` | `requireRole(['Owner'])` | ✅ Pertinent | Métriques de gestion des cercles — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/positions` | `requireNavPermission('clan.positions')` | ✅ Pertinent | Échantillons de positions sur carte — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/heatmap` | `requireNavPermission('clan.heatmap-kills')` | ✅ Pertinent | Densité de kills par cellule de carte — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/loot` | `requireRole(['Owner'])` | ✅ Pertinent | Économie de loot (pickups/drops/équipements) — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/vehicles` | `requireRole(['Owner'])` | ✅ Pertinent | Stats véhicules par membre — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/drop-zones` | `requireNavPermission('clan.drop-zones')` | ✅ Pertinent | Points d'atterrissage + heatmap 40×40 — voir [Télémétrie API](../telemetry/api.md) et [Zones de drop](../features/drop-zones.md) |
| GET | `/sync-batch-manual` | `requireRole(['Owner'])` | ❌ Interne/dev | État de la queue de traitement — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/sync-batch-manual` | `requireRole(['Owner'])` | ❌ Interne/dev | Enqueue/traite des matchs sélectionnés — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/resync-files-queue` | `requireRole(['Owner'])` | ❌ Interne/dev | Liste des jobs de resync fichiers capturés — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/resync-files-queue` | `requireRole(['Owner'])` | ❌ Interne/dev | Enqueue des jobs de resync fichiers — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/sync-selected` | `requireRole(['Owner'])` | ❌ Interne/dev | Sync direct des matchs sélectionnés — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/resync-files-selected` | `requireRole(['Owner'])` | ❌ Interne/dev | Resync depuis fichiers capturés — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/clear-selected` | `requireRole(['Owner'])` | ❌ Interne/dev | Réinitialise la télémétrie des matchs sélectionnés — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/fetch-files-selected` | `requireRole(['Owner'])` | ❌ Interne/dev | Télécharge/capture les fichiers CDN sans parser — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/sync-selected-enqueue` | `requireRole(['Owner'])` | ❌ Interne/dev | Poll de progression du mode "Direct Sync" — non documenté ailleurs, détail ci-dessous |
| POST | `/sync-selected-enqueue` | `requireRole(['Owner'])` | ❌ Interne/dev | Enqueue des matchs pour sync live — détail ci-dessous |
| GET | `/dead-letter` | `requireRole(['Owner'])` | ❌ Interne/dev | Jobs en échec définitif — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/dead-letter` | `requireRole(['Owner'])` | ❌ Interne/dev | Remet des jobs en queue depuis la dead-letter — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/queue-cleanup` | `requireRole(['Owner'])` | ❌ Interne/dev | État de la queue + priorités — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/queue-cleanup` | `requireRole(['Owner'])` | ❌ Interne/dev | Actions de maintenance (reorder/cleanup/cancel) — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/metrics` | `requireRole(['Owner'])` | ❌ Interne/dev | Métriques queue (JSON ou Prometheus) — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/observability` | `requireRole(['Owner'])` | ❌ Interne/dev | Totaux, p95, taux d'échec, alertes — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/recoveries` | `requireRole(['Owner'])` | ❌ Interne/dev | Stats de récupération de jobs bloqués — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/recalc-aggregates-batch` | `requireRole(['Owner'])` | ❌ Interne/dev | Compte les agrégats existants (`memberTelemetryRows`, `clanSynergyRows`) avant recalcul — absent de [Télémétrie API](../telemetry/api.md) (seul le POST y est documenté) |
| POST | `/recalc-aggregates-batch` | `requireRole(['Owner'])` | ❌ Interne/dev | Recalcule les agrégats périodiques — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/import-file` | `requireRole(['Owner'])` | ❌ Interne/dev | Importe un fichier télémétrie manuel — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/backfill-null-json` | `requireRole(['Owner'])` | ❌ Interne/dev | Backfill des champs JSON manquants — voir [Télémétrie API](../telemetry/api.md) |

> Les 4 routes `weapons`, `positions`, `heatmap` et `drop-zones` utilisent `requireNavPermission(...)`, un contrôle par rôle **configurable** via `/settings/nav-permissions` (clés `clan.stats-weapons`, `clan.positions`, `clan.heatmap-kills`, `clan.drop-zones`) — pas une restriction Owner figée. [Télémétrie API](../telemetry/api.md) et [Zones de drop](../features/drop-zones.md) ont été corrigés en conséquence (2026-07-05).

### Détail — `GET` / `POST /api/clans/[clanId]/telemetry/sync-selected-enqueue`

Non documenté dans [Télémétrie API](../telemetry/api.md) (absent de la liste "Gestion de la queue").

- **Auth :** `requireRole(['Owner'])` sur les deux méthodes.
- **POST — body :** `{ squadMatchIds: string[] }` → enqueue via `enqueueTelemetryForSelectedSquadMatches()` (queue `telemetry_live_sync`, distincte de la queue resync classique). Réponse : `{ ok: true, clanId, ...result }`.
- **GET :** renvoie l'état de la queue live-sync pour polling après enqueue : `{ ok: true, clanId, queue: <TelemetryLiveSyncQueueStats>, recentJobs: Array<{ id, status, message, createdAt, finishedAt }> }` (20 derniers jobs `CronExecution` de type `telemetry_live_sync`).
- Sert le panneau "Direct Sync" de la page `/clans/[clanId]/telemetry/sync-batch-manual` (voir aussi `src/app/clans/[clanId]/telemetry/sync-batch-manual/page.tsx`).

---

## Télémétrie (member-level) — `/api/members/[id]/telemetry/*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/members/[id]/telemetry/weapons` | `requireSameClanAsMember` | ✅ Pertinent | Stats armes du membre — voir [Télémétrie API](../telemetry/api.md) et [Armes](../features/weapons.md) |
| GET | `/api/members/[id]/telemetry/playstyle` | `requireSameClanAsMember` | ✅ Pertinent | Profil de jeu du membre — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/api/members/[id]/telemetry/circles` | `requireSameClanAsMember` | ✅ Pertinent | Métriques cercles du membre — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/api/members/[id]/telemetry/drop-zones` | `requireSameClanAsMember` | ✅ Pertinent | Points d'atterrissage du membre — voir [Télémétrie API](../telemetry/api.md) |

Contrairement au scope clan, ces 4 routes utilisent uniformément `requireSameClanAsMember` (session + même clan que le membre ciblé, ou SuperUser) — pas de permission nav ni de restriction Owner.

---

## Internal / Cron — `/api/internal/cron/*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| POST | `/api/internal/cron/bootstrap` | Secret header (`x-cron-bootstrap-secret`) | ❌ Interne/dev | Démarre les crons du worker cron séparé — voir [Cron](../ops/cron.md) et [Déploiement](../ops/deployment.md) |
| GET | `/api/internal/cron/status` | Secret header (`x-cron-bootstrap-secret`) | ❌ Interne/dev | Sonde l'état d'initialisation du worker cron — voir [Cron](../ops/cron.md) et [Déploiement](../ops/deployment.md) |

Ces deux routes ne sont jamais appelées par un client (web ou mobile) : elles servent uniquement à la communication worker-à-worker en production (systemd `ExecStartPost` + dashboard `/clans/[clanId]/settings/cron` qui sonde `status` côté serveur, pas côté client).
