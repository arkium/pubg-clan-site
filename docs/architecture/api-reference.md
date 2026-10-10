# Référence API — vue d'ensemble

Ce document liste les ~99 routes `src/app/api/**/route.ts` du projet, avec pour chacune : la méthode HTTP, l'authentification requise, sa pertinence pour le futur développement mobile (voir [Plan application mobile](mobile-app-plan.md)), et une description courte.

**Objectif :** servir de carte unique pour choisir quels endpoints l'app React Native doit consommer, sans avoir à parcourir les 12 docs de features et les 8 docs de télémétrie. Pour les routes déjà documentées ailleurs, ce tableau ne fait que pointer vers le contrat complet (pas de duplication). Pour les routes qui n'avaient encore aucun contrat écrit, le détail complet est donné ici.

**Légende — colonne Pertinence mobile :**

| Symbole | Signification |
|---|---|
| ✅ Pertinent | Utile pour l'app mobile (lecture de stats, auth, notifications, etc.) |
| ⚠️ Admin web uniquement | Gestion/settings qui n'a probablement pas sa place sur mobile |
| ❌ Interne/dev | Jamais appelé depuis un client — routes internes, queue, monitoring worker |

> **Supprimées le 2026-10-07** ([administration.md](../TODO/administration.md), lot 2), aucun appelant : `squad-analysis`,
> `telemetry/loot`, `telemetry/vehicles`, `telemetry/circles`, `members/[id]/telemetry/circles`, et les GET de
> `dead-letter`, `queue-cleanup`, `recalc-aggregates-batch`. `auth/switch-member` est gardée : seule façon de changer
> de membre actif, dont dépend l'accès aux pages d'administration.

**Auth — rappel des mécanismes rencontrés :**
- `Session (cookie)` : `getSessionFromRequest` — un cookie `pubg_clan_session` valide suffit.
- `requireSameClanAsMember` : session valide + l'utilisateur doit être lié au membre ciblé ou SuperUser.
- `requireRole([...])` : rôle clan (`Owner` ou `Member` — Admin et Moderator supprimés le 2026-10-07) sur le clan ciblé.
- `requirePermission(key)` : vérifie une permission fine (`manage_members`, `manage_roles`, `edit_clan`, `view_reports`, `assign_roles`, `manage_settings`) portée par le rôle du membre actif.
- `requireNavPermission(navKey)` : vérifie le rôle configuré pour une entrée de navigation (table `NavItem`/`NavPermission`, éditable depuis `/settings/nav-permissions`) — plus souple qu'un rôle fixe.
- `requireSuperUser` / `isSuperUserSession` : réservé au(x) compte(s) SuperUser (cross-clan).
- **Gardes d'administration** (`src/lib/auth/admin-guards.ts`, depuis le 2026-10-07 — [administration.md](../TODO/administration.md)) :
  jamais ouvertes par le mode visiteur ; le SuperUser passe toujours, même sans membre actif ; sinon le membre
  **actif** doit appartenir au clan de l'adresse. 401 sans session, 403 pour une session refusée.
  - `requirePlatformAdmin` : SuperUser seulement (outils qui agissent sur toute la plateforme).
  - `requireClanAccess(clanId, 'owner' | 'member')` : Owner (ou membre) du clan de l'adresse.
  - `requireClanFeature(clanId, feature)` : Owner du clan de l'adresse, si la fonctionnalité est ouverte aux Owners
    (`src/lib/auth/owner-features.ts` : `clan-members`, `clan-announcements`, `clan-competition`, ouvertes par défaut).
    La télémétrie d'un clan (`telemetry/*`, `settings/data-health*`) n'y figure pas : `requirePlatformAdmin`, jamais
    déléguée (2026-10-08).
- **Journal des actions** (Q10, lot 3c) : chaque écriture d'une route d'administration est exportée enveloppée par
  `withAdminActionLog('<gabarit de la route>', handler)` (`src/lib/admin-action-log.ts`) — une ligne `AdminActionLog`
  par réussite ou erreur ; refus (401, 403) et simulations (`validateOnly`, `dryRun`, `mode: 'preview'`) non notés.
  L'acteur vient de la garde (`src/lib/auth/admin-actor.ts`). Contrôle : `src/lib/admin-action-log-routes.test.ts`.
- `requirePermission`, `requireRole`, `requireNavPermission` testent désormais le SuperUser **en premier** (accepté sans
  membre actif) ; `requireNavPermission` laisse le SuperUser traverser une entrée `hidden`.
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
| POST | `/api/join` | Public (session facultative) | ✅ Pertinent | Demande l'accès à un clan suivi (pending) ou inscrit un nouveau clan (Owner) — voir [Clans](../features/clans.md). **`contactEmail` exigé sans session** (le lien de création du compte y part à l'acceptation, 2026-10-10) **et pour une inscription de clan** ; 3 demandes en attente au plus par adresse (429) |

---

## Clans (core) — `/api/clans*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/clans` | Public | ✅ Pertinent | Liste des clans actifs + comptages — voir [Auth](../features/auth.md) |
| GET | `/api/clans/[clanId]/overview` | `requirePermission('manage_members')` (session requise) | ✅ Pertinent | Vue d'ensemble clan (roster, `clanStats` JSON) — voir [Clans](../features/clans.md) |
| GET | `/api/clans/[clanId]/pubg-diff` | `requirePermission('manage_members')` | ⚠️ Admin web uniquement | Diff membres PUBG officiels vs membres trackés — voir [Clans](../features/clans.md) |
| GET | `/api/clans/[clanId]/roles` | `requirePermission('manage_roles')` | ⚠️ Admin web uniquement | Liste rôles clan + catalogue des permissions — détail ci-dessous |
| GET | `/api/clans/[clanId]/settings/login-welcome` | Public | ✅ Pertinent | Message d'accueil du clan (bannière login) — détail ci-dessous |
| PUT | `/api/clans/[clanId]/settings/login-welcome` | `requireClanFeature('clan-announcements')` | ⚠️ Admin web uniquement | Met à jour le message d'accueil du clan |
| GET | `/api/clans/[clanId]/settings/email-delivery` | `requireClanFeature('clan-members')` | ⚠️ Admin web uniquement | `{ ready }` seulement : les invitations par email marchent-elles ? (la configuration SMTP reste au SuperUser) |
| POST | `/api/clans/[clanId]/sync-stats` | `requirePlatformAdmin` (SuperUser) (bypass si appel cron interne) | ⚠️ Admin web uniquement | Recalcule `clanStats` JSON — voir [Clans](../features/clans.md) |
| GET | `/api/clans/[clanId]/cron-control` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Statut santé cron du clan ; de la configuration, seul le nombre d'erreurs et d'alertes (détail : `/api/settings/site-config`) — voir [Cron](../ops/cron.md) |
| POST | `/api/clans/[clanId]/cron-control` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Déclenche une action cron manuelle — voir [Cron](../ops/cron.md) |
| GET | `/api/clans/[clanId]/dev/runtime-status` | `requirePlatformAdmin` (SuperUser) | ❌ Interne/dev | Infos process Node (pid, uptime, hostname) — détail ci-dessous |
| GET | `/api/clans/[clanId]/lifetime-stats` | `requireNavPermission('clan.stats')` | ✅ Pertinent | Carrière PUBG (lifetime) de tous les membres, sans période — détail ci-dessous |
| GET | `/api/clans/[clanId]/leaderboard` | `requireNavPermission('clan.leaderboard')` | ✅ Pertinent | Classement clan par période/tri — voir [Leaderboard](../features/leaderboard.md) |
| GET | `/api/clans/[clanId]/awards` | `requireRole(['Owner','Admin','Member'])` | ✅ Pertinent | 11 awards fun calculés par période — voir [Awards](../features/awards.md) |

> **Historique :** `leaderboard`, `lifetime-stats`, `squad-analysis` (supprimée le 2026-10-07, sans appelant) et `matches` (voir domaine Matchs) n'appliquaient auparavant aucun contrôle de rôle (seul un `clanId` numérique valide était vérifié). Un `requireNavPermission` a été ajouté sur chacune (2026-07-05, décision : accès configurable par rôle plutôt qu'un rôle figé, voir [Plan application mobile](mobile-app-plan.md)) — `clan.leaderboard`/`clan.matches` réutilisent les clés nav existantes des pages web correspondantes ; `squad-analysis` et `lifetime-stats` réutilisent `clan.stats` (aucune page dédiée à `squad-analysis` ne consomme encore cette route).

### Détail — `GET /api/clans/[clanId]/roles`

- **Réponse :** `{ roles: ClanRole[], permissions: Permission[] }` — initialise les rôles par défaut du clan si absents (`initializeDefaultRoles`), puis liste le catalogue global des permissions (table `Permission`, triée par `category`/`key`).

### Détail — `GET` / `PUT /api/clans/[clanId]/settings/login-welcome`

Variante **par clan** du réglage global `/api/settings/login-welcome` (voir [Paramètres admin](../ops/settings.md)) — utilisée quand plusieurs clans coexistent.
- **GET :** `{ settings, clanLabel }` (pas d'auth : affiché sur la page de login avant connexion).
- **PUT :** body `{ badge, title, message, imageUrl? }` (validation zod, `imageUrl` doit commencer par `http(s)://` si fourni) → `{ success: true, settings }`.

### Détail — `GET /api/clans/[clanId]/dev/runtime-status`

- **Réponse :** `{ ok: true, clanId, runtime: { pid, nodeVersion, uptimeSec, hostname } }` — outil de diagnostic process, sans intérêt pour un client applicatif.

### Détail — `GET /api/clans/[clanId]/lifetime-stats`

- **Query :** aucun (la période a été retirée le 2026-09-27 : une carrière n'en dépend pas).
- **Réponse :** `{ clan: { id, name, tag }, members: Array<{ memberId, displayName, lastRefreshedAt, stats: LifetimeStats }>, activeMemberCount, lifetimeSync: { expression, timezone, runsPerDay } }` où `LifetimeStats` a la même forme que celle documentée dans [Dashboard membre](../features/member-dashboard.md) (`combat`, `victory`, `support`, `vehicle`, `movement`, `other`). Vue agrégée clan entier (vs la route membre qui ne renvoie qu'un joueur). `stats.other` porte aussi `timeSurvived`, `roundsPlayed` et `daysPlayed` pour les lignes synchronisées depuis le 2026-09-27. `lifetimeSync` décrit la planification de `daily_lifetime_stats_sync`. Page : « Carrière PUBG du clan » — [Statistiques](../features/statistiques.md).

---

## Ligue Inter-Clans — `/api/clans-leaderboard`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/clans-leaderboard?period=week\|month\|all&matchType=official\|competitive\|casual\|custom` | Publique | ✅ Pertinent | Classement au Power score pondéré (type Normal par défaut), rang de la période précédente, clans en qualification et sans partie, fil de la ligue, titres, règles du score en vigueur (`scoring.settings`) ; calculé à la volée, 5 min en mémoire par période, type et réglages — voir [Ligue Inter-Clans](../features/ligue-clans.md) |
| GET | `/api/settings/league` | SuperUser | ❌ | Réglages de la ligue en vigueur, valeurs par défaut, bornes, date et auteur du dernier enregistrement |
| PUT | `/api/settings/league` | SuperUser | ❌ | `{ settings }` : validation stricte (400 + `errors` champ par champ), enregistrement dans `AppConfig` (`league_settings`) |
| POST | `/api/settings/league/preview` | SuperUser | ❌ | `{ settings, period, matchType }` : classement avec les réglages en vigueur et avec le brouillon, parts du score moyen — lecture seule |

---

## Membres — `/api/clans/[clanId]/members*`, `/api/members*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/clans/[clanId]/members` | `requireClanFeature('clan-members')` | ⚠️ Admin web uniquement | Roster complet avec rôles/invitations/permissions — voir [Clans](../features/clans.md) |
| GET | `/api/clans/[clanId]/members/cards` | `requireNavPermission('clan.members')` | ✅ Pertinent | Fiches de l'annuaire : rôle, activité, 30 jours officiels, arme fétiche, médailles ; demandes en attente pour `manage_members` — voir [Membres](../features/membres.md) §2 |
| POST | `/api/clans/[clanId]/members/[memberId]/approve` | `requireClanFeature('clan-members')` | ⚠️ Admin web uniquement | Approuve un membre en attente ; demandeur sans compte : crée son invitation et lui envoie le lien de création du compte (`invitation`, `emailSent`) — voir [Clans](../features/clans.md) |
| POST | `/api/clans/[clanId]/members/[memberId]/invite` | `requireClanFeature('clan-members')` | ⚠️ Admin web uniquement | Crée une invitation d'activation — voir [Clans](../features/clans.md) |
| DELETE | `/api/clans/[clanId]/members/[memberId]/invite` | `requireClanFeature('clan-members')` (session obligatoire depuis le 2026-10-07) | ⚠️ Admin web uniquement | Révoque l'invitation active du membre |
| POST | `/api/clans/[clanId]/members/[memberId]/reject` | `requireClanFeature('clan-members')` | ⚠️ Admin web uniquement | Rejette une demande d'adhésion pending — voir [Clans](../features/clans.md) |
| PATCH | `/api/clans/[clanId]/members/[memberId]/role` | `requirePermission('assign_roles')` (+ SuperUser si rôle Owner impliqué) | ⚠️ Admin web uniquement | Change le rôle d'un membre — voir [Clans](../features/clans.md) |
| GET | `/api/members` | Session (cookie) | ✅ Pertinent | Liste tous les membres (filtre `?clanId=`) + médailles (top 3 par métrique lifetime) — détail ci-dessous |
| POST | `/api/members` | Session ; hors SuperUser : `clanId` requis et `requireClanFeature('clan-members')` sur ce clan, **avant** tout appel PUBG | ⚠️ Admin web uniquement | Ajoute un membre (recherche PUBG + détection clan) — détail ci-dessous |
| GET | `/api/members/[id]` | `requireSameClanAsMember` | ✅ Pertinent | Profil minimal d'un membre (displayName, avatar, pubgPlayerName, clanId) — détail ci-dessous |
| DELETE | `/api/members/[id]` | `requirePermission('manage_members')` | ⚠️ Admin web uniquement | Désactive (soft) ou supprime (`?hard=true`) un membre — détail ci-dessous |
| PATCH | `/api/members/[id]` | `requireSuperUser` | ⚠️ Admin web uniquement | Déplace un membre vers un autre clan — détail ci-dessous |
| GET | `/api/members/[id]/dashboard` | `requireSameClanAsMember` | ✅ Pertinent | Tableau de bord d'une période : chiffres, écart au clan, barres par soirée, meilleure partie, profil de jeu, frères d'armes — voir [Membres](../features/membres.md) §3 |
| GET | `/api/members/[id]/drop-pressure` | `requireSameClanAsMember` | ✅ Pertinent | Pression au drop d'un joueur (période, classement du clan, 8 semaines) — voir [Membres](../features/membres.md) §4 |
| GET | `/api/members/[id]/nemesis` | `requireSameClanAsMember` | ✅ Pertinent | Chasseurs et proies (10, avec `reverseCount`, duel inverse toutes armes), bilan joueurs / bots / zone, death cam, `weaponLabels` ; tous les événements lus (plus de plafond) ; `?period=week\|month` facultatif (sans : tout l'historique suivi), `?weapon=` — voir [Némésis](../features/nemesis.md) §3 |
| GET | `/api/members/[id]/stats` | `requireSameClanAsMember` | ✅ Pertinent | Carrière PUBG (tous modes et par mode), médailles du clan (`clanRanks`, ex æquo partagés), `member` (plaque) — voir [Carrière PUBG d'un joueur](../features/carriere-joueur.md) |
| POST | `/api/members/[id]/stats` | `requireSameClanAsMember` | ✅ Pertinent | Refresh forcé des stats lifetime depuis l'API PUBG — voir [Dashboard membre](../features/member-dashboard.md) |
| GET | `/api/members/[id]/calendar` | `requireSameClanAsMember` | ✅ Pertinent | Parties officielles et top 1 par journée de jeu sur 5 semaines, parties par heure de Paris — voir [Carrière PUBG d'un joueur](../features/carriere-joueur.md) §4 |
| GET | `/api/members/[id]/season-stats` | `requireSameClanAsMember` | ✅ Pertinent | Stats ranked/normal en cache (3 dernières saisons) — voir [Season stats](../features/season-stats.md) |
| POST | `/api/members/[id]/season-stats` | `requireSameClanAsMember` | ✅ Pertinent | Refresh forcé depuis l'API PUBG — voir [Season stats](../features/season-stats.md) |
| GET | `/api/members/[id]/weapon-mastery` | `requireSameClanAsMember` | ✅ Pertinent | Maîtrise armes carrière (cache DB), `weaponLabel` du site par ligne — voir [Armes](../features/weapons.md) et [Armes d'un joueur](../features/armes-joueur.md) |
| GET | `/api/members/[id]/throwables` | `requireSameClanAsMember` | ✅ Pertinent | Lancers par objet ; `?period=week\|month` facultatif (sans : tout) — voir [Armes d'un joueur](../features/armes-joueur.md) |
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
| GET | `/api/clans/[clanId]/matches/[matchId]/telemetry` | `requireNavPermission('clan.matches')` | ✅ Pertinent | Débriefing d'un match (scope clan), `?teamId=` pour une autre escouade — détail ci-dessous |
| GET | `/api/clans/[clanId]/matches/[matchId]/replay` | `requireNavPermission('clan.matches')` | ✅ Pertinent | Replay 2D d'un match (scope clan) — voir [Trajectoires replay](../telemetry/replay-trajectories.md) |
| GET | `/api/tournaments/[tournamentId]/matches/[matchId]/telemetry` | Session (tout utilisateur connecté) + match = manche du tournoi | ✅ Pertinent | Débriefing d'une manche, `?teamId=` ; ajoute `tournament` (manche, points par clan) |
| GET | `/api/tournaments/[tournamentId]/matches/[matchId]/replay` | Session + match = manche du tournoi | ✅ Pertinent | Replay 2D d'une manche, sans clan mis en avant (escouade choisie côté client) |
| GET | `/api/tournaments`, `/api/tournaments/[tournamentId]/standings` | Session (depuis le 2026-09-16 ; auparavant **aucune**) | ✅ Pertinent | Liste des tournois, classement et manches. Depuis le 2026-09-18, `/standings` renvoie aussi le classement adapté au mode (`modeStandings`, `squadBreakdown`, `clanTrophy`), les manches numérotées avec vainqueur et MVP (`rounds`), et le MVP du tournoi — voir [Tournois](../features/tournois.md). Depuis le 2026-09-17, `/api/tournaments` renvoie un résumé par tournoi (`src/lib/tournament-overview.ts`) : état affiché dérivé des dates (`live`, `upcoming`, `finished`, `draft`), libellé de carte, nombre de manches, nombre de clans engagés et vainqueur calculé comme sur la page de classement |
| GET | `/api/members/[id]/matches` | `requireSameClanAsMember` | ✅ Pertinent | Historique matchs membre (`limit=all` : toute la période ; coéquipiers, équipes, état de la télémétrie) ou détection de matchs récents non importés — voir [Matchs d'un joueur](../features/matchs-joueur.md) |
| GET | `/api/matches/[matchId]` | `requireSuperUser` (page d’import SuperUser) | ✅ Pertinent | Détail d'un match PUBG pour import — voir [Matchs](../features/matches.md) |
| POST | `/api/matches/[matchId]` | `requireSuperUser` (page d’import SuperUser) | ✅ Pertinent | Importe un match en base pour un membre — voir [Matchs](../features/matches.md) |

### Détail — `GET /api/clans/[clanId]/matches/[matchId]/telemetry`

Non documenté ailleurs — variante clan-scope du détail télémétrie (à distinguer de `/api/clans/[clanId]/telemetry/*` qui travaille par période/agrégat).

- **Path params :** `clanId`, `matchId` (= `squadMatchId`).
- **Réponse (`buildTelemetrySuccessResponse`) :** `{ success, meta, data: { match: { id, pubgMatchId, gameMode, mapName, placement, createdAt, totalKills/Damage/Assists/Revives, members[] }, telemetry: { status, attemptCount, lastAttemptAt, nextRetryAt, parserVersion, parsedAt, sourceGeneratedAt, contentLength, bytesDownloaded, errorCode, errorMessage, summary, weaponStats, memberStats, positionSamples, trajectorySegments, deathSamples, phaseSnapshots, createdAt, updatedAt }, weaponLabels, phaseLabels, memberIdentityMap }, legacy: <même objet> }`.
- **Erreurs :** `400` clan/match id invalide, `404` (`TELEMETRY_NOT_FOUND`) si aucune télémétrie liée à ce match pour ce clan.
- Implémentation : `loadMatchDebriefPayload` (`src/lib/pubg-telemetry/match-debrief-payload.ts`), partagé avec la route tournoi. Requête SQL brute joignant `SquadMatch`/`SquadMatchTelemetry`, filtrée par appartenance au clan via `SquadMember`/`ClanMember` (`accessClanId`).
- **Équipe mise en avant (2026-09-16)** : tout le débriefing (membres, coéquipiers, drapeaux « escouade » des frags et du Combat Log, zones d'impact) se calcule autour d'une équipe du lobby. Par défaut l'équipe du clan consulté ; `?teamId=` en choisit une autre. Dès qu'une équipe est connue, l'appartenance se juge sur ses **comptes**, pas sur le clan : dans une manche où un clan aligne deux escouades, les frags de l'autre escouade ne comptent pas. `data.match` ajoute `clanTag` (tag de l'équipe mise en avant), `otherTrackedClans`, `teams[]` (`teamId`, `placement`, `placementEstimated`, `kills`, `tag`, `clanName`, `trackedClanId`, `players`) et `focus` (`teamId`, `clanId`, `tag`, `clanName`) ; `placement` et `members` sont ceux de l'équipe mise en avant.
- **Classement des équipes** : `teamPlacement` de la télémétrie (toutes les équipes pour les matchs analysés après le 2026-09-16, voir [Parser](../telemetry/parser.md)), sinon `SquadMember.placement` des membres suivis (API PUBG), sinon estimation d'après l'ordre des éliminations (`placementEstimated: true`).

### Détail — `GET /api/tournaments/[tournamentId]/matches/[matchId]/telemetry`

Même payload que la route clan, sans restriction de clan, plus `data.tournament` : `{ id, title, status, roundNumber, totalRounds, scores[] }` (`scores` = `computeTournamentRoundScores` + `tag`/`name` du clan). Sans `teamId`, l'équipe la mieux classée de la manche est mise en avant.

- **Accès (décision du 2026-09-16)** : tout utilisateur connecté, quel que soit son clan. `401` sans session ; `404` (`TOURNAMENT_ROUND_NOT_FOUND`) si le match n'est pas une manche du tournoi (`loadTournamentRoundContext`, `src/lib/tournament-service.ts`).
- **Pourquoi la session est vérifiée dans la route** : le proxy (`src/proxy.ts`) exclut `/api` de son `matcher` — il ne redirige que les pages. Toute route API qui ne vérifie pas elle-même la session est lisible sans compte (cas de `/api/tournaments` et `/standings` jusqu'au 2026-09-16).

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
| POST | `/api/clans/[clanId]/challenges/[challengeId]/join` | Session (via `getActorMemberId`, membre du clan requis) ; le défi doit appartenir au clan de l’adresse | ✅ Pertinent | Rejoint un défi actif — voir [Défis](../features/challenges.md) |
| GET | `/api/clans/[clanId]/challenges/[challengeId]/leaderboard` | `requireNavPermission('clan.challenges')` | ✅ Pertinent | Classement des participants d'un défi — voir [Défis](../features/challenges.md) |
| GET | `/api/clans/[clanId]/reports` | `requirePermission('view_reports')` | ✅ Pertinent | Liste paginée des rapports (filtre `?type=`) — voir [Rapports](../features/reports.md) |
| GET | `/api/clans/[clanId]/reports/[reportId]` | `requireNavPermission('clan.reports')` | ✅ Pertinent | Détail complet d'un rapport — voir [Rapports](../features/reports.md) |
| GET | `/api/clans/[clanId]/reports/[reportId]/export` | `requireNavPermission('clan.reports')` | ✅ Pertinent | Export HTML/PDF/JSON (`?format=`) — voir [Rapports](../features/reports.md) |

> **Historique :** `challenges` (liste + détail + leaderboard) et `reports` (détail + export) n'appliquaient auparavant aucun contrôle de rôle. Un `requireNavPermission` a été ajouté (2026-07-05), réutilisant les clés nav existantes `clan.challenges` / `clan.reports` des pages web correspondantes.

---

## Cycle de vie des clans — `/api/settings/clan-lifecycle/*`, `/api/clan-lifecycle/*`

Voir [Cycle de vie du clan](../features/cycle-de-vie-clan.md).

| Méthode | Chemin | Auth | Pertinence mobile | Description |
|---|---|---|---|---|
| GET | `/api/clan-lifecycle/mutations` | Session | ✅ Pertinent | Historique public des mouvements (`applied`, `reverted` seulement), paginé |
| GET | `/api/settings/clan-lifecycle` | SuperUser | ❌ | Réglages + santé du dernier passage + compteurs des onglets, en une requête |
| PATCH | `/api/settings/clan-lifecycle` | SuperUser | ❌ | Modifie les réglages. Le webhook n'est jamais renvoyé en clair |
| GET | `/api/settings/clan-lifecycle/mutations` | SuperUser | ❌ | Journal complet, **tous statuts**, filtrable |
| POST | `/api/settings/clan-lifecycle/mutations` | SuperUser | ❌ | `revert` (409 si l'état s'y oppose) ou `acknowledge` — ce dernier est libellé « Marquer comme vu » dans l'UI et ne modifie aucune donnée métier |
| GET | `/api/settings/clan-lifecycle/ungrouped` | SuperUser | ❌ | Effectif du parking. `?thresholdDays=N` simule un autre seuil |
| POST | `/api/settings/clan-lifecycle/ungrouped` | SuperUser | ❌ | `archive` (en masse) ou `reactivate` |
| GET | `/api/settings/clan-lifecycle/pending-clans` | SuperUser | ❌ | Clans en attente avec demandeur, contact et promotions différées |
| POST | `/api/clans/[clanId]/approve` | SuperUser | ❌ | Active le clan **et applique les mouvements en attente** ; Owner demandeur sans compte : invitation et lien de création du compte dans l'email de validation |
| POST | `/api/clans/[clanId]/reject` | SuperUser | ❌ | Refuse la demande, passe le demandeur en `rejected`, clôt les mouvements en attente |

> **`DELETE /api/members/[id]` est passé au SuperUser** le 2026-09-20 (il était ouvert à `manage_members`).
> `PATCH /api/members/[id]` s'ouvre en revanche à un Owner **uniquement** quand la cible est le clan technique
> du même shard.

---

## Settings (admin) — `/api/settings/*`

Toutes ces routes pilotent des pages `/settings/*` réservées Owner/Admin/SuperUser (voir [Paramètres admin](../ops/settings.md) et [Cron](../ops/cron.md)). Les GET de labels (cartes/armes/phases) sont marqués pertinents pour mobile car l'app aura besoin des mêmes libellés d'affichage ; leurs PUT restent admin-only.

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/settings/admin-actions` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Journal des actions d'administration (Q10) : filtres `clanId`, `userId`, `outcome`, `page` (50 par page) ; 503 tant que la migration `add_admin_action_log` n'est pas appliquée — voir [administration.md](../TODO/administration.md) |
| GET | `/api/settings/cron-schedules` | SuperUser | ⚠️ Admin web uniquement | Valeur effective des 9 plannings cron — voir [Cron](../ops/cron.md) |
| PUT | `/api/settings/cron-schedules` | SuperUser | ⚠️ Admin web uniquement | Modifie l'expression d'un planning — voir [Cron](../ops/cron.md) |
| DELETE | `/api/settings/cron-schedules/[key]` | SuperUser | ⚠️ Admin web uniquement | Réinitialise un planning à sa valeur par défaut — voir [Cron](../ops/cron.md) |
| GET | `/api/settings/cron-workers-status` | SuperUser | ⚠️ Admin web uniquement | Statut des workers télémétrie (lock files + queues) — voir [Cron](../ops/cron.md) |
| GET | `/api/settings/site-config` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Configuration du site : réglages du `.env` contrôlés, sans secret en clair — voir [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/email-delivery` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Statut config SMTP — voir [Paramètres admin](../ops/settings.md) |
| POST | `/api/settings/email-delivery` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Envoie un email de test — voir [Paramètres admin](../ops/settings.md) |
| DELETE | `/api/settings/email-delivery` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Révoque la validation email — non détaillé dans [Paramètres admin](../ops/settings.md), même garde d'accès que GET/POST |
| GET | `/api/settings/login-welcome` | Public | ✅ Pertinent | Message d'accueil global (bannière login) — voir [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/map-labels` | `requirePlatformAdmin` (SuperUser) | ✅ Pertinent | Labels lisibles des cartes PUBG — voir [Paramètres admin](../ops/settings.md) |
| PUT | `/api/settings/map-labels` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Met à jour les labels de cartes — voir [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/map-locations` | `requirePlatformAdmin` (SuperUser) | ✅ Pertinent | Villes et périmètres configurés par carte — voir [Paramètres admin](../ops/settings.md) |
| PUT | `/api/settings/map-locations` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Met à jour les villes, centres et rayons des cartes — voir [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/nav-permissions` | Aucun contrôle explicite en lecture | ⚠️ Admin web uniquement | Registre de navigation (items, rôles, positions, labels) — voir [Permissions navigation](../ops/nav-permissions.md) |
| PUT | `/api/settings/nav-permissions` | `requirePlatformAdmin` (SuperUser) ; liens internes seulement, clés de garde non supprimables, `defaultRole` non modifiable | ⚠️ Admin web uniquement | Modifie rôle/position/label/CRUD d'une entrée de nav — voir [Permissions navigation](../ops/nav-permissions.md) |
| GET | `/api/settings/phase-labels` | `requirePlatformAdmin` (SuperUser) | ✅ Pertinent | Labels des phases de jeu — voir [Paramètres admin](../ops/settings.md) |
| PUT | `/api/settings/phase-labels` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Met à jour les labels de phases — voir [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/pubg-api-calls` | Permission `*` | ✅ Pertinent | Historique + totaux + agrégats (catégories, top erreurs, tendance 14j) des appels API PUBG — voir [Paramètres admin](../ops/settings.md) |
| DELETE | `/api/settings/pubg-api-calls` | Permission `*` | ✅ Pertinent | Purge l'historique des appels API PUBG loggés — voir [Paramètres admin](../ops/settings.md) |
| GET | `/api/settings/pubg-api-rate-limit` | Permission `*` | ⚠️ Admin web uniquement | Lit le RPM configuré + bornes — non documenté ailleurs, détail ci-dessous |
| POST | `/api/settings/pubg-api-rate-limit` | Permission `*` | ⚠️ Admin web uniquement | Modifie le RPM (override DB) — détail ci-dessous |
| GET | `/api/settings/weapon-labels` | `requirePlatformAdmin` (SuperUser) | ✅ Pertinent | Labels lisibles des armes — voir [Paramètres admin](../ops/settings.md) |
| PUT | `/api/settings/weapon-labels` | `requirePlatformAdmin` (SuperUser) | ⚠️ Admin web uniquement | Met à jour les labels d'armes — voir [Paramètres admin](../ops/settings.md) |

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
| GET | `/positions` | `requireNavPermission('clan.positions')` | ✅ Pertinent | Échantillons de positions sur carte — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/heatmap` | `requireNavPermission('clan.heatmap-kills')` | ✅ Pertinent | Densité de kills par cellule de carte — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/drop-zones` | `requireNavPermission('clan.drop-zones')` | ✅ Pertinent | Points d'atterrissage + heatmap 40×40 — voir [Télémétrie API](../telemetry/api.md) et [Zones de drop](../features/drop-zones.md) |
| GET | `/item-use` | `requireNavPermission('clan.items')` | ✅ Pertinent | Objets consommés par le clan, par famille, par objet et par membre (`?period=week\|month\|all`) — voir [Objets consommés](../features/objets-consommes.md) |
| GET | `/zone-closures` | `requireNavPermission('clan.zone-closures')` | ✅ Pertinent | Positions d'arrivée à chaque fermeture de cercle (`?period=`, `?map=`, `?memberId=`, `?phase=`) — voir [Fin de zone](../features/fin-de-zone.md) |
| GET | `/sync-batch-manual` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | État de la queue de traitement — voir [Télémétrie API](../telemetry/api.md) |

En dehors de `telemetry/`, le tableau de bord clan lit aussi :

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/clans/[clanId]/city-insights` | `requireNavPermission('clan.overview')` | ✅ Pertinent | Villes et zones de combat du clan (Top 5 par métrique, ville favorite, évolution 8 semaines) — `?period=week\|month\|month-1\|month-2\|all`, `?matchType=`, `?mode=`. Lu dans `PositionMetricCell`, voir [Positions et villes](../features/positions-villes.md) |
| POST | `/sync-batch-manual` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Enqueue/traite des matchs sélectionnés — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/resync-files-queue` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Liste des jobs de resync fichiers capturés — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/resync-files-queue` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Enqueue des jobs de resync fichiers — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/sync-selected` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Sync direct des matchs sélectionnés — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/resync-files-selected` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Resync depuis fichiers capturés — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/clear-selected` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Réinitialise la télémétrie des matchs sélectionnés — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/fetch-files-selected` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Télécharge/capture les fichiers CDN sans parser — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/sync-selected-enqueue` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Poll de progression du mode "Direct Sync" — non documenté ailleurs, détail ci-dessous |
| POST | `/sync-selected-enqueue` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Enqueue des matchs pour sync live — détail ci-dessous |
| POST | `/dead-letter` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Remet des jobs en queue depuis la dead-letter — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/queue-cleanup` | `requirePlatformAdmin` (SuperUser) | ❌ Interne/dev | Actions de maintenance (reorder/cleanup/cancel) — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/metrics` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Métriques queue (JSON ou Prometheus) — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/observability` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Totaux, p95, taux d'échec, alertes — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/recoveries` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Stats de récupération de jobs bloqués — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/recalc-aggregates-batch` | `requirePlatformAdmin` (SuperUser) | ❌ Interne/dev | Recalcule les agrégats périodiques — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/import-file` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Importe un fichier télémétrie manuel — voir [Télémétrie API](../telemetry/api.md) |
| POST | `/backfill-null-json` | `requirePlatformAdmin` (SuperUser ; jamais délégué, 2026-10-08) | ❌ Interne/dev | Backfill des champs JSON manquants — voir [Télémétrie API](../telemetry/api.md) |

> Les 4 routes `weapons`, `positions`, `heatmap` et `drop-zones` utilisent `requireNavPermission(...)`, un contrôle par rôle **configurable** via `/settings/nav-permissions` (clés `clan.stats-weapons`, `clan.positions`, `clan.heatmap-kills`, `clan.drop-zones`) — pas une restriction Owner figée. [Télémétrie API](../telemetry/api.md) et [Zones de drop](../features/drop-zones.md) ont été corrigés en conséquence (2026-07-05).

### Détail — `GET` / `POST /api/clans/[clanId]/telemetry/sync-selected-enqueue`

Non documenté dans [Télémétrie API](../telemetry/api.md) (absent de la liste "Gestion de la queue").

- **Auth :** `requireRole(['Owner'])` sur les deux méthodes.
- **POST — body :** `{ squadMatchIds: string[] }` → enqueue via `enqueueTelemetryForSelectedSquadMatches()` (queue `telemetry_live_sync`, distincte de la queue resync classique). Réponse : `{ ok: true, clanId, ...result }`.
- **GET :** renvoie l'état de la queue live-sync pour polling après enqueue : `{ ok: true, clanId, queue: <TelemetryLiveSyncQueueStats>, recentJobs: Array<{ id, status, message, createdAt, finishedAt }> }` (20 derniers jobs `CronExecution` de type `telemetry_live_sync`).
- Sert le panneau "Direct Sync" de la page `/clans/[clanId]/settings/data/sync` (voir aussi `src/app/clans/[clanId]/settings/data/sync/page.tsx`).

---

## Télémétrie (member-level) — `/api/members/[id]/telemetry/*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/members/[id]/telemetry/weapons` | `requireSameClanAsMember` | ✅ Pertinent | Stats armes du membre — voir [Télémétrie API](../telemetry/api.md) et [Armes](../features/weapons.md) |
| GET | `/api/members/[id]/telemetry/playstyle` | `requireSameClanAsMember` | ✅ Pertinent | Profil de jeu du membre — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/api/members/[id]/telemetry/drop-zones` | `requireSameClanAsMember` | ✅ Pertinent | Points d'atterrissage du membre — voir [Télémétrie API](../telemetry/api.md) |
| GET | `/api/members/[id]/item-use` | `requireSameClanAsMember` | ✅ Pertinent | Objets consommés du membre — voir [Objets consommés](../features/objets-consommes.md) |
| GET | `/api/members/[id]/city-insights` | `requireSameClanAsMember` | ✅ Pertinent | Villes du membre et comparaison avec le clan — voir [Positions et villes](../features/positions-villes.md) |

Contrairement au scope clan, ces routes utilisent uniformément `requireSameClanAsMember` (session + même clan que le membre ciblé, ou SuperUser) — pas de permission nav ni de restriction Owner.

---

## Entraînement au mortier — `/api/mortar/*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| POST | `/api/mortar/series` | Public ; série enregistrée si session avec membre actif | ✅ Pertinent | `{ difficulty }` → `MortarSeriesStart` : graine des dix cibles, tirée par le serveur — détail ci-dessous, voir [Mortier](../features/mortier.md) |
| POST | `/api/mortar/series/[seriesId]/finish` | Session (cookie) + membre actif, propriétaire de la série | ✅ Pertinent | `{ shots }` → `MortarSeriesFinish` : score recalculé par le serveur à partir de la graine, record précédent — détail ci-dessous |
| GET | `/api/mortar/leaderboard?clanId=&difficulty=` | Public ; ligne du lecteur si session | ✅ Pertinent | `MortarLeaderboard` : « Artilleurs du clan », dix premiers + ligne du lecteur — détail ci-dessous |

Contrat partagé par les routes, la page et les tests e2e : `src/lib/mortar/mortar-api.ts` ; règles et calcul du score : `src/lib/mortar/mortar-game.ts` ; service Prisma (table `MortarSeries`) : `src/lib/mortar/mortar-service.ts`. Tests : `src/lib/mortar/mortar-route-contracts.test.ts`.

### Détail — `POST /api/mortar/series`

- **Body :** `{ difficulty: 'easy' | 'medium' | 'hard' }` — `400` sinon.
- **Membre connecté (`activeMemberId`) :** ses séries encore `started` sont supprimées (une seule série ouverte par joueur), une ligne `MortarSeries` est créée avec une graine `crypto` de 10 caractères hexadécimaux → `201` `{ seriesId, seed, difficulty, recorded: true }`.
- **Visiteur (ou compte sans membre actif) :** aucune écriture → `200` `{ seriesId: null, seed, difficulty, recorded: false }` ; la série se joue sans enregistrement.

### Détail — `POST /api/mortar/series/[seriesId]/finish`

- **Body :** `{ shots: Array<{ setting: number, timeMs: number }> }` — exactement dix tirs, réglages entiers de 121 à 700 m, temps de 0,3 s à 5 min (`validateMortarShots`). Tout autre champ (écart, score) est ignoré : le score est recalculé par `scoreMortarSeries(generateMortarTargets(seed, difficulty), shots, difficulty)` avec la graine gardée en base.
- **Réponse :** `{ score, previousBest, isRecord, seriesCount }` — `previousBest` = meilleur `meanError` des séries terminées du joueur à cette difficulté avant celle-ci (`null` = première) ; `isRecord` = pas de précédent ou écart strictement meilleur ; `seriesCount` compte la série reçue.
- **Erreurs** (`{ error, code }`) : `401` sans session ou sans membre actif ; `404` `not_found` série inconnue (remplacée par un départ plus récent, par exemple) ; `403` `forbidden` série d'un autre joueur ; `409` `finished` déjà terminée (aussi pour le second de deux envois simultanés), `expired` commencée il y a plus de 2 h ; `400` `invalid_shots`, ou `implausible_time` quand la somme des `timeMs` dépasse le temps écoulé côté serveur depuis le départ + 5 s.

### Détail — `GET /api/mortar/leaderboard`

- **Query :** `clanId` (entier > 0) et `difficulty` — `400` sinon.
- **Réponse :** `{ clanId, difficulty, rows, viewer }` — membres **actifs** du clan ayant terminé au moins une série à cette difficulté ; par membre `series` (séries terminées) et `best` (meilleur écart moyen, m). Tri : `best` croissant, puis plus de séries, puis nom ; rangs 1..n. `rows` = les 10 premiers (`MORTAR_LEADERBOARD_SIZE`) ; `viewer` = ligne du membre actif de la session, même hors des dix premiers, sinon `null`. Une requête groupée (`groupBy` sur `MortarSeries`) + une lecture des noms.

---

## Lecture de zone — `/api/zone-reading/*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/zone-reading?map=&mode=&period=` | Public | ✅ Pertinent | `ZoneReadingAnalysis` : cartes ayant des parties, compteur, statistiques (ligne de vol / cercles / zone finale), axes compacts, axe par défaut, noms des 64 cases ; cache mémoire 10 min — voir [Lecture de zone](../features/lecture-de-zone.md) |
| POST | `/api/zone-reading/series` | Public ; série enregistrée si session avec membre actif | ✅ Pertinent | `{ map, mode, period, clanId }` → `ZoneReadingSeriesStart` : dix parties tirées par le serveur (complètes pour un visiteur, ligne de vol une partie sur deux et cercle 1 seulement pour un membre) |
| POST | `/api/zone-reading/series/[seriesId]/guess` | Session + membre actif, propriétaire de la série | ✅ Pertinent | `{ round, step, x, y }` (m) → `ZoneReadingGuessResult` : cercle suivant, ou zone finale et écarts calculés par le serveur, et bilan après la dixième partie |
| GET | `/api/zone-reading/leaderboard?clanId=&map=` | Public ; ligne du lecteur si session | ✅ Pertinent | `ZoneReadingLeaderboard` : « Le clan », écart moyen sur toutes les séries de la carte, dix premiers + ligne du lecteur |

Contrat partagé par les routes, la page et les tests e2e : `src/lib/zone-reading/zone-reading-api.ts` ; règles : `zone-reading-game.ts` ; analyse : `zone-reading-analysis.ts` ; service Prisma (tables `ZoneReadingMatch`, `ZoneReadingSeries`) : `zone-reading-service.ts`. Tests : `src/lib/zone-reading/zone-reading-route-contracts.test.ts`.

- **Paramètres :** `mode` = `squad` (défaut) ou `duo` ; `period` = `days-30`, `days-90` ou `all` (défaut) ; `map` inconnue ou sans partie → la carte la plus jouée.
- **Erreurs de série** (`{ error, code }`) : `409` `not_enough_matches` (moins de dix parties), `401` sans membre actif, `404` `not_found`, `403` `forbidden`, `409` `finished`, `expired` (plus de 2 h) ou `out_of_order` (étape inattendue, ou jouée deux fois : verrou optimiste sur `progress`), `400` `invalid_guess`.

---

## Carte des ressources — `/api/resources/*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| GET | `/api/resources?map=` | Public ; propositions du lecteur si session, toutes pour un SuperUser | ✅ Pertinent | `ResourceMapResponse` : points saisis, véhicules observés, état de la carte — détail ci-dessous, voir [Carte des ressources](../features/carte-ressources.md) |
| GET | `/api/resources/drop-zones?clanId=&map=` | `requireNavPermission('clan.drop-zones')` (comme la page « Zones de drop ») | ✅ Pertinent | `ResourceDropZonesResponse` : trois zones de drop les plus fréquentes du clan sur la carte |
| POST | `/api/resources/points` | Session (cookie) | ✅ Pertinent | `{ map, kind, x, y, comment? }` → `201` `ResourceProposalResponse` (proposition en attente) |
| POST | `/api/resources/points/[pointId]/cancel` | Session, auteur | ✅ Pertinent | `{ ok: true }` : l'auteur retire sa proposition en attente (ligne supprimée) |
| POST | `/api/resources/points/[pointId]/confirm` | Session | ✅ Pertinent | `{ point }` : « Toujours là », idempotent |
| POST | `/api/resources/points/[pointId]/reports` | Session | ✅ Pertinent | `{ kind, x?, y?, proposedKind?, comment? }` → `201` `ResourceReportResponse` |
| GET | `/api/resources/admin/queue` | SuperUser (session) | ⚠️ Admin web uniquement | `ResourceQueueResponse` : file de validation toutes cartes, état par carte |
| POST | `/api/resources/admin/decisions` | SuperUser | ⚠️ Admin web uniquement | `{ decisions }` → `ResourceDecisionsResponse` : décisions par lot, résultat par ligne |
| POST | `/api/resources/admin/maps/[map]` | SuperUser | ⚠️ Admin web uniquement | `{ action: 'recheck' \| 'verify' }` → `{ map: ResourceMapSummary }` |
| GET | `/api/resources/admin/history?page=` | SuperUser | ⚠️ Admin web uniquement | `ResourceHistoryResponse` : décisions des 30 derniers jours, pages de 7 |
| POST | `/api/resources/admin/history/[actionId]/undo` | SuperUser | ⚠️ Admin web uniquement | `{ ok: true }` : restaure l'état d'avant si rien n'a changé depuis |

Contrat partagé par les routes, la page et les tests e2e : `src/lib/resources/resource-api.ts` ; règles pures : `src/lib/resources/resource-map.ts` ; services Prisma : `src/lib/resources/resource-service.ts` (joueur), `src/lib/resources/resource-service-admin.ts` (SuperUser), historique pur : `src/lib/resources/resource-history.ts`. Tests : `src/lib/resources/resource-route-contracts.test.ts` (base en mémoire `resource-test-db.ts`, aucun accès à la base), `resource-history.test.ts`.

Erreurs : `{ error, code }` en français — `400` (`unknown_map`, `invalid_kind`, `outside_map`, `comment_too_long`, `invalid_report`, `invalid_body`, `invalid_action`), `401` `unauthorized`, `403` `forbidden`, `404` `not_found`, `409` (`duplicate`, `not_pending`, `not_validated`, `already_reported`, `modified`, `already_undone`, `not_undoable`), `429` `too_many_pending`. Coordonnées en mètres, contrôlées par `insideResourceMap`, arrondies au dixième.

### Détail — `GET /api/resources?map=`

- **Points :** `validated` pour tous (`state` = `validated` ou `to_confirm` selon `ResourceMapState.recheckSince`, `resourcePointState`) ; `pending` : ceux du lecteur (`mine`), tous pour un SuperUser ; jamais `rejected` / `removed`. `comment` seulement pour l'auteur et les SuperUsers. `createdBy` = `{ name, validatedCount }` ; `validatedBy` = nom.
- **Nom affiché :** `UserAccount.displayName`, sinon `displayName` d'un membre lié (`MemberIdentity`, identité principale d'abord), sinon « Joueur » — **jamais l'e-mail**. `validatedCount` = `ResourcePoint` `validated` créés par le joueur + `ResourceReport` `accepted`.
- **Lecteur :** `reportedByMe` (signalement `pending`), `confirmedByMe` (confirmation postérieure à `recheckSince`, toute confirmation s'il n'y en a pas) ; `viewer.queueCount` = lignes de la file pour un SuperUser, `null` sinon.
- **Observés :** `ResourceVehicleSpot` + `ResourceVehicleMapStat` de la carte (cron `resource_vehicle_spots`), filtrés par `isSpotShown`, `share = spotShare`. `counts.observed` par famille (emplacements affichés), `counts.points` par type (points validés). Tables vides → réponse vide cohérente.

### Détail — `GET /api/resources/drop-zones?clanId=&map=`

- Atterrissages du clan sur la carte des **90 derniers jours**, lus dans `DropPressureStat` (une ligne par membre et par partie, déjà calculée pour « Zones de drop » — aucune lecture de télémétrie), rangés par ville (`locationForPoint` sur `getMapLocations()`, lieux activés) ; hors de toute ville : ignorés.
- **Réponse :** `{ clanId, map, centers, radiusMeters: 800 }` — `centers` = trois villes au plus, par atterrissages décroissants puis nom ; `x`, `y` = **moyenne des atterrissages du clan** dans la ville, en mètres.

### Détail — contributions (session requise, `401` sinon)

- **Proposer :** type et carte valides, position dans la carte, commentaire ≤ 280 caractères. `429` au-delà de **20 propositions en attente** par joueur ; `409` `duplicate` si un point du même type, validé ou en attente, est à **moins de 25 m**.
- **Annuler :** l'auteur seul (`403`), proposition encore en attente (`409`) ; la ligne est **supprimée** (rien n'a été validé). Un refus de SuperUser, lui, passe le point en `rejected`.
- **Toujours là :** point `validated` (`409` en attente, `404` refusé / retiré) ; une confirmation par joueur et par période de revérification — un second clic renvoie le point sans écrire ; sinon `ResourceConfirmation` + `lastConfirmedAt = now`, `confirmationCount + 1`.
- **Signaler :** `missing` (position et type envoyés ignorés), `misplaced` (`x`, `y` dans la carte, à plus de 15 m de l'actuelle), `wrong_kind` (`proposedKind` valide ≠ type actuel) ; un seul signalement `pending` par joueur et par point (`409` `already_reported`).

### Détail — SuperUser (`401` sans session, `403` sans `isSuperUser`)

- **File :** une ligne par proposition `pending` (`point:<id>`) et par groupe de signalements `pending` identiques (`report:<pointId>:<kind>`) sur un point encore validé ; `misplaced` → position demandée = moyenne ; `wrong_kind` → type le plus demandé (le premier demandé à égalité). Du plus ancien au plus récent (premier signalement du groupe). `maps` : les cinq cartes, points validés, `verifiedAt`, `recheckSince`.
- **Décisions** (100 au plus par envoi, chacune dans sa transaction, `ok: false` + message sans arrêter le lot) : proposition `validate` / `refuse` (`rejected`) / `edit` (type et/ou position corrigés, puis validation) ; signalements `validate` (`missing` → point `removed` et les autres signalements en attente du point `cancelled` ; `misplaced` → déplacé ; `wrong_kind` → retypé ; signalements `accepted`), `refuse` (`refused`), `edit` (correction donnée appliquée, signalements `accepted`). Chaque décision écrit **une** `ResourceAction` (`before` / `after` = point et signalements touchés, `after.label` = libellés figés) dans la même transaction.
- **Carte :** `recheck` → `recheckSince = now` ; `verify` → `verifiedAt = now`, `recheckSince = null` ; chacune écrit une action annulable.
- **Historique :** actions des 30 derniers jours, plus récentes d'abord, pages de 7 ; `verb` / `object` / `detail` comme la maquette (« a validé » « Station-service · F-L » « Proposée par Vexa ») ; `undoable` = non annulée, pas elle-même une annulation, et lignes encore dans leur état d'après (type, position, statut ; dates de vérification pour une carte).
- **Annuler :** dans une transaction, restaure les champs que la décision avait changés si l'état actuel est encore celui d'après (`409` `modified` sinon) — un « Toujours là » postérieur est gardé ; marque `undoneAt` / `undoneByUserId` et écrit une action « a annulé ». Une annulation ne s'annule pas (`409` `not_undoable`).

---

## Internal / Cron — `/api/internal/cron/*`

| Méthode | Chemin | Auth | Pertinence mobile | Description / lien |
|---|---|---|---|---|
| POST | `/api/internal/cron/bootstrap` | Secret header (`x-cron-bootstrap-secret`) | ❌ Interne/dev | Démarre les crons du worker cron séparé — voir [Cron](../ops/cron.md) et [Déploiement](../ops/deployment.md) |
| GET | `/api/internal/cron/status` | Secret header (`x-cron-bootstrap-secret`) | ❌ Interne/dev | Sonde l'état d'initialisation du worker cron — voir [Cron](../ops/cron.md) et [Déploiement](../ops/deployment.md) |

Ces deux routes ne sont jamais appelées par un client (web ou mobile) : elles servent uniquement à la communication worker-à-worker en production (systemd `ExecStartPost` + dashboard `/clans/[clanId]/settings/cron` qui sonde `status` côté serveur, pas côté client).
