# Administration du site — audit et réorganisation

> **Étape 1 — analyse, rédigée le 2026-10-06. En attente de validation.**
> Aucun fichier de code, aucune donnée ni entrée de menu n'a été modifié. La base de `.env` (production) a été lue
> en lecture seule : table `NavItem`, `CronExecution`, `UserSession`, rôles. Lots 1 à 3 : non commencés.

Abréviations des références : `AP` = `src/middleware/auth-permission.ts`, `reg` = `src/lib/nav-permissions-registry.ts`,
`CN` = `src/components/ClanNavigation.tsx`, `S/` = `src/app/settings/`, `A/` = `src/app/api/`,
`T/` = `src/app/api/clans/[clanId]/telemetry/`. Les lignes citées sont celles du dépôt au 2026-10-06.

---

## 0. Ce qu'il faut savoir avant de lire

### Les gardes existantes

| Garde | Ce qu'elle vérifie | Piège |
|---|---|---|
| `requireSuperUser(req)` `AP:19-28` | Session valide et `UserAccount.isSuperUser` | — |
| `requirePermission(p)(req, { clanId? })` `AP:121-156` | Membre actif de la session, puis contournement SuperUser, puis appartenance au clan **seulement si `clanId` est passé**, puis permission | Sans `clanId`, l'admin de n'importe quel clan passe. `allowMissingActor` laisse passer un appel **anonyme** (`:129-132`). Un SuperUser sans membre actif reçoit 401 (le contournement vient après) |
| `requireRole(noms)(req, { clanId? })` `AP:158-193` | Même chose, sur le **nom** du rôle (`Owner`, `Admin`…) | Sans `clanId`, l'Owner de n'importe quel clan passe |
| `requireNavPermission(navKey)` `AP:195-268` | Rôle lu dans `NavItem` (`roleOverride ?? defaultRole`, ligne absente = `none`, `nav-permissions-service.ts:66-70`) | **Ouverte à tous en mode visiteur** (`:199`). Rôle `none` : publique et sans contrôle de clan (`:209-211`). `hidden` : refuse même le SuperUser (`:205-207`) |
| Contrôles écrits à la main | `getMemberPermissionKeys(activeMemberId)` puis `includes('*')` ou `includes('manage_settings')` | Ni clan, ni contournement SuperUser (référentiels, envoi d'email) |

- **« Owner » = rôle `Owner` du clan du membre actif de la session**, pas du clan de l'adresse (`role-service.ts:216-231`).
  Un Owner du clan A est arrêté sur `/api/clans/B/…` seulement si la route passe `{ clanId }`.
- **Production en mode visiteur** (`DISABLE_AUTH_PERMISSIONS=true`, `docs/features/accueil.md:40`,
  `docs/features/clans.md:369-370`) : toutes les routes gardées par `requireNavPermission` sont ouvertes ; les autres
  gardes restent actives (sauf les lectures marquées `readOnly`).
- **Aucune garde côté serveur pour les pages.** Toutes les conditions d'accès sont dans des composants client. Le proxy
  ne vérifie que la **présence** du cookie sur `/settings/*` et `/account` (`src/proxy.ts:113-125`), jamais sa validité,
  et laisse passer `/clans/[clanId]/settings/*` sans cookie en mode visiteur. Les permissions côté client sont celles du
  **membre actif** (`A/auth/session/route.ts:13-15`) ; le clan sélectionné vient du `localStorage`
  (`src/hooks/useSelectedClan.ts:52-77`). Les deux ne sont jamais comparés.
- **Les menus viennent de la table `NavItem`** ; `reg` n'est plus que la graine et le repli (`reg:38` `@deprecated`,
  `src/hooks/useNavPermissions.ts:53-85`). Les trois accueils construisent leurs cartes depuis `NavItem`
  (`src/hooks/useSettingsHubItems.ts:24-125`).

---

## 1. Inventaire

Rôle au menu : `navKey` — rôle du registre → rôle effectif en base (§2). État : *utilisée* (une entrée de menu y mène),
*redirection*, *orpheline* (aucun menu ni lien).

### 1.1 Accueils et `/settings/*`

| Adresse | Rôle au menu | Condition d'accès de la page | Routes API appelées | Contrôle des routes | Portée | Entrée de menu | État |
|---|---|---|---|---|---|---|---|
| `/settings` | — | **pas de page** (404) | — | — | — | — | absente |
| `/settings/admin` | lien « Paramètres admin » (admin ; SuperUser exclu du lien `CN:354,435`) | `isSuperUser \|\| manage_members \|\| manage_roles \|\| manage_settings` `S/admin/page.tsx:24` | GET `A/settings/nav-permissions` | aucune (publique) `route.ts:19` | menu | barre latérale `CN:1102` | utilisée |
| `/settings/owner` | lien « Paramètres owner » (Owner ; SuperUser exclu `CN:353,436`) | `isSuperUser \|\| '*'` `S/owner/page.tsx:19` | idem | idem | menu | `CN:1103` | utilisée, **vide en production** (§2) |
| `/settings/superuser` | lien « Paramètres SuperUser » | `isSuperUser` `S/superuser/page.tsx:24-29` | idem | idem | menu | `CN:1104` | utilisée |
| `/settings/clan-lifecycle` | `superuser.clan-lifecycle` — superuser | **aucune** ; panneau « réservé » après un 403 de l'API `page.tsx:68-70,138-143` | GET/PATCH `settings/clan-lifecycle`, `…/mutations`, `…/ungrouped`, `…/pending-clans`, `…/archived-clans` ; POST `clans/:id/approve`, `…/reject` ; PATCH `settings/clans/:id` | `requireSuperUser` partout | plateforme | menu SuperUser | utilisée |
| `/settings/cron` | `superuser.cron` « Ops Cron » — superuser | `isSuperUser` `S/cron/page.tsx:548-557` | GET `settings/cron-workers-status` ; GET/PUT `settings/cron-schedules` (+ DELETE `[key]`) ; GET/POST/DELETE `clans/:id/cron-control` (boucle sur tous les clans `:751`) ; GET `clans` | SuperUser ; **`cron-control` : SuperUser ou Owner du clan** `cron-control/route.ts:41-49` | plateforme + chaque clan | menu SuperUser | utilisée |
| `/settings/email-delivery` | `owner.email-delivery` « Test email » — owner → superuser | `'*'` seulement, **sans `isSuperUser`** `S/email-delivery/page.tsx:120` | GET/POST/DELETE `settings/email-delivery` | `'*'` du membre actif, **ni clan ni SuperUser** `route.ts:17-23` | plateforme (SMTP, `AppConfig`) | menu SuperUser ; lien `clans/[clanId]/settings/members/page.tsx:1206` | utilisée |
| `/settings/league` | `superuser.league-settings` — superuser | `isSuperUser` `S/league/page.tsx:64` | GET/PUT `settings/league`, POST `…/preview` | `requireSuperUser` | plateforme | menu SuperUser | utilisée |
| `/settings/map-labels` | `admin.map-labels` — admin → superuser | `'*' \|\| manage_settings`, **sans `isSuperUser`** `S/map-labels/page.tsx:71` | GET/PUT `settings/map-labels`, `settings/map-locations` | `manage_settings` du membre actif, **ni clan ni SuperUser** `map-labels/route.ts:11-24`, `map-locations/route.ts:25-41` | plateforme (`AppConfig`) | menu SuperUser | utilisée |
| `/settings/match-import` | `superuser.match-import` — superuser | `isSuperUser` `S/match-import/page.tsx:80` | GET `members`, GET `members/:id/matches`, **GET + POST `matches/:matchId`**, GET `settings/map-labels` | session ; `requireSameClanAsMember` ; **aucune** `A/matches/[matchId]/route.ts:35,77` ; `manage_settings` (refuse le SuperUser) | plateforme | menu SuperUser | utilisée |
| `/settings/nav-permissions` | `owner.nav-permissions` — owner → superuser **et** `superuser.platform-settings` — superuser | `'*' \|\| isSuperUser` `S/nav-permissions/page.tsx:729-731` | GET (publique) et PUT `settings/nav-permissions` (8 actions) | PUT : SuperUser **ou `requireRole(['Owner'])` sans clan** `route.ts:35-40` | plateforme (menus **et** gardes d'API) | deux entrées | utilisée |
| `/settings/opponents` (+ `layout.tsx`) | `superuser.opponents` « Adversaires » — superuser | `isSuperUser` (layout `:34-51`, page `:194,475`) | `settings/opponents` (+ `recalculate`, `track`, `clans/:id/members`), `settings/opponent-clans/:id` (+ `players`), `settings/players/:id/favorite`, POST `settings/clans`, GET/PATCH `settings/clans/:id` | `requireSuperUser` / `session.isSuperUser` | plateforme | menu SuperUser | utilisée |
| `/settings/opponents/players` | onglet | `isSuperUser` `page.tsx:206,348` | `settings/players`, favori, suivi | `requireSuperUser` | plateforme | onglet `layout.tsx:55` | utilisée |
| `/settings/opponents/resolution` | onglet | `isSuperUser` `page.tsx:50,84` | `settings/encountered-player-resolution` (+ `run`) | `requireSuperUser` | plateforme | onglet `layout.tsx:56` | utilisée |
| `/settings/opponents/triage` | onglet | `isSuperUser` `page.tsx:100,235` | `settings/encountered-players` (+ `[id]/resolve`) | `requireSuperUser` | plateforme | onglet `layout.tsx:57` | utilisée |
| `/settings/phase-labels` | `admin.phase-labels` — admin → superuser | `manage_settings`, **sans `isSuperUser`** `S/phase-labels/page.tsx:46` | GET/PUT `settings/phase-labels` | comme les alias cartes `route.ts:7-20` | plateforme | menu SuperUser | utilisée |
| `/settings/pubg-api` | `owner.pubg-api` — owner → superuser | `isSuperUser` `S/pubg-api/page.tsx:168,334` | GET/DELETE `settings/pubg-api-calls`, POST `settings/pubg-api-rate-limit` | `session.isSuperUser` | plateforme (quota, journal de tous les clans) | menu SuperUser | utilisée |
| `/settings/superuser/database` | `superuser.database` — superuser | `isSuperUser` `page.tsx:159-164` | `superuser/database` (+ `optimize`, `purge-telemetry`) | `session.isSuperUser` | plateforme (base) | menu SuperUser | utilisée |
| `/settings/telemetry-recoveries` | `superuser.telemetry-recoveries` « Telemetrie cross-clans » — superuser | `isSuperUser` `page.tsx:157,311` | `settings/telemetry-recoveries` (+ `status`, `backlog`, `enqueue-backlog`) ; **POST `clans/1/telemetry/recalc-aggregates-batch` `{ scope: 'all-clans' }`** `:275-279` | `session.isSuperUser` ; recalcul : Owner du clan **de l'adresse** ou SuperUser | plateforme | menu SuperUser ; lien depuis la page de récupération du clan `:978-985` | utilisée |
| `/settings/weapon-labels` | `admin.weapon-labels` — admin → superuser | `manage_settings`, **sans `isSuperUser`** `page.tsx:71` | GET/PUT `settings/weapon-labels` | comme les alias cartes | plateforme | menu SuperUser | utilisée |
| `/settings/weapon-categories` | `admin.weapon-categories` (en base seulement) — superuser | — | — | — | — | menu SuperUser | redirection vers `/settings/weapon-labels` (`next.config.ts:20-21`) |

### 1.2 Réglages de clan et membres

| Adresse | Rôle au menu | Condition d'accès de la page | Routes API appelées | Contrôle des routes | Portée | Entrée de menu | État |
|---|---|---|---|---|---|---|---|
| `/clans/[clanId]/settings` | **aucune entrée** | `isSuperUser \|\| '*' \|\| manage_settings` `settings/page.tsx:27-28` ; sous-domaine et suivi si SuperUser `:85-86` | GET/PUT `settings/clans/:id/subdomain` ; GET/PATCH `settings/clans/:id` (via `ClanFollowDangerZone` → `ClanArchiveDialog`) | `requireSuperUser` | un clan + actions plateforme | liens « Retour à Paramètres » seulement (`discord/page.tsx:380,393`, `login-welcome:240`, `members:1150`) | quasi orpheline |
| `/clans/[clanId]/settings/discord` | `admin.discord-notifications` — admin | `isSuperUser \|\| '*' \|\| manage_settings` `discord/page.tsx:126-128` | GET/PUT `clans/:id/settings/discord`, POST `…/test` | `requirePermission('manage_settings', { clanId })` `route.ts:90,117` | un clan | accueil admin | utilisée |
| `/clans/[clanId]/settings/login-welcome` | `admin.login-welcome` — admin → owner | `'*' \|\| manage_settings`, **sans `isSuperUser`** `login-welcome/page.tsx:50` | GET (publique), PUT, POST `…/upload` | GET aucune ; PUT et envoi `manage_settings` + clan `route.ts:63-64`, `upload/route.ts:28-32` | un clan | accueil admin ; lien de la vue d'ensemble `ClanOverviewSections.tsx:96-98` | utilisée |
| `/clans/[clanId]/settings/members` | `admin.players-roles` « Joueurs et rôles » — admin → owner | **aucune** ; un 401/403 renvoie vers `/login` `:295-305,352` | GET `clans/:id/members`, GET `…/roles`, PATCH/DELETE `…/members/:m/role`, POST/DELETE `…/members/:m/invite`, GET `settings/email-delivery`, GET `clans`, PATCH/DELETE `members/:id`, GET `clans/:id/pubg-diff` | `manage_members` + clan ; `manage_roles` ; `assign_roles`/`revoke_roles` ; invitation POST `manage_members`, **DELETE anonyme** (`invite/route.ts:122-133`) ; email `'*'` ; `members/:id` PATCH `manage_members` ou SuperUser, DELETE SuperUser | un clan (+ transfert et arrêt de suivi SuperUser) | accueil admin ; redirection `/members/manage` | utilisée |
| `/clans/[clanId]/settings/tournaments` | `clan.tournaments` — admin → owner | `isSuperUser \|\| '*' \|\| manage_settings` `tournaments/page.tsx:72-73` | tournois (liste, création, modification, suppression, `sync`, `discord`) | `requirePermission('manage_settings', { clanId })` | un clan | accueil admin ; boutons depuis `/tournaments` | utilisée |
| `/clans/[clanId]/members/pending` | `clan.members-pending` — admin (section admin) | `isSuperUser \|\| '*' \|\| manage_members \|\| manage_roles \|\| manage_settings` `pending/page.tsx:59-69` | GET `clans/:id/members?status=pending`, POST `…/approve`, `…/reject` | liste `manage_members` + clan ; validation `requireRole(['Owner','Admin'], { clanId })` | un clan | accueil admin ; lien de l'annuaire du clan `clans/[clanId]/members/page.tsx:154-159` | utilisée |
| `/members/add` | `admin.add-player` — admin | `'*' \|\| manage_members`, **sans `isSuperUser`** `members/add/page.tsx:55-58` ; clan lu dans le `localStorage` | POST `members` (aperçu et création) | `manage_members` **sans clan** ; contrôle du clan **après** la création éventuelle du clan PUBG `A/members/route.ts:35-96` | un clan (peut créer un clan suivi) | accueil admin ; bouton de la page des demandes | utilisée |
| `/members/manage` | — | redirection client vers `/clans/{sélectionné}/settings/members` `members/manage/page.tsx:10-23` | — | — | — | aucun lien | redirection orpheline |
| `/members` | — | redirection client vers `/login` ou `/clans/{sélectionné}/members` `members/page.tsx:11-25` | — | — | — | liens de repli (`CN:406,549`, `account/page.tsx:85`) | redirection |

### 1.3 `clans/[clanId]/telemetry/*`

Aucune de ces pages ne vérifie l'accès. Les actions Owner y sont visibles de tous et échouent en 403.

| Adresse | Rôle au menu | Condition d'accès de la page | Routes API appelées | Contrôle des routes | Portée | Entrée de menu | État |
|---|---|---|---|---|---|---|---|
| `…/telemetry/dashboard` | `owner.telemetry-dashboard` — owner → superuser | aucune ; panneau « Outils (Owner) » si `'*'` `:37-39,108` | GET `T/sync-batch-manual` ; POST `T/queue-cleanup` (`reorder-priority`, `cleanup-stale`) ; GET `T/metrics` | `requireRole(['Owner'], { clanId })` | un clan, **mais** `reorder-priority` place le clan en tête de la file **commune** | menu SuperUser ; palette de commandes | utilisée |
| `…/telemetry/errors` | `owner.telemetry-errors` — owner → superuser | aucune | GET `T/sync-batch-manual` ; POST `T/dead-letter` | Owner + clan | file commune, quota PUBG | menu SuperUser | utilisée, en partie cassée (le GET ne renvoie pas `details`) |
| `…/telemetry/sync-batch-manual` | `owner.telemetry-sync-batch` « Sync batch manuel » — owner → superuser | aucune | POST `T/sync-selected-enqueue`, `T/fetch-files-selected`, GET/POST `T/sync-batch-manual` | Owner + clan | quota PUBG, files communes, disque du serveur | menu SuperUser | utilisée |
| `…/telemetry/recoveries` | `owner.telemetry-recoveries` « Recoveries telemetry » — owner → superuser | aucune ; 401/403 → `/login` `:591-593` | GET `T/recoveries`, `T/observability` ; POST `T/recoveries`, `T/backfill-null-json` | Owner + clan | quota PUBG (rattrapage **synchrone** jusqu'à 150 parties), état du worker commun | menu SuperUser | utilisée |
| `…/telemetry/matches` (« Soirées ») | `owner.telemetry-matches` — owner → superuser | aucune | GET `clans/:id/matches` | `clan.matches` = `none` : publique | un clan | accueil owner | utilisée |
| `…/telemetry/matches/session/[date]` | — (parent `owner.telemetry-matches`) | aucune | GET matchs ; GET `dev/runtime-status` (toutes les 20 s) ; `T/sync-selected-enqueue`, `T/sync-batch-manual`, `T/clear-selected`, `T/resync-files-selected`, `T/resync-files-queue`, `T/queue-cleanup`, `T/fetch-files-selected` | publique / Owner + clan | files communes, quota PUBG, disque | liens depuis « Soirées » | utilisée (liste de matchs **et** panneau d'exploitation) |
| `…/telemetry/matches/[matchId]/telemetry` (« État ») | — | aucune ; boutons d'action visibles de tous `:1217-1248` | GET `clans/:id/matches/:m/telemetry` ; POST `T/sync-selected`, `T/import-file` | publique / Owner + clan | quota PUBG | liens « État » des listes de matchs des joueurs (`MatchResultCard.tsx:130`) | utilisée (diagnostic joueur) |
| `…/telemetry/matches/[matchId]/debrief` | — | aucune | GET `…/matches/:m/telemetry`, `…/replay` | `clan.matches` = `none` : publique | un clan (lecture) | liens partout (débriefing) | utilisée (page joueur) |
| `…/telemetry/opponents` (« Adversaires rencontrés ») | `owner.encountered-opponents` — owner → superuser | aucune ; 401/403 → `/login` `:186-188` | GET `clans/:id/encountered-players` | `requireRole(['Owner','Admin'], { clanId })` | un clan | accueil owner ; palette ; `/settings/opponents` | utilisée |

---

## 2. État réel des menus (table `NavItem`, lue le 2026-10-06)

63 lignes en base, 65 entrées dans le registre.

**Dans le registre, absentes en base**

| Clé | Lien | Effet |
|---|---|---|
| `primary.mortar`, `primary.resources`, `primary.zone-reading` | `/mortier`, `/carte-des-ressources`, `/lecture-de-zone` | Liens écrits en dur dans la barre (`CN:408-427`) : ils s'affichent, mais on ne peut ni les masquer ni les renommer |
| `clan.items` | `/clans/:clanId/stats/items` — **page supprimée** (redirigée, `next.config.ts:27`) | La clé garde encore `T/item-use` (`route.ts:25`) ; ligne absente = rôle `none` = publique |

**En base, absentes du registre**

| Clé | Lien | Effet |
|---|---|---|
| `clan.reports` (masquée) | `/clans/:clanId/reports` — **page absente** | Suppression des rapports décidée (`docs/navigation-arborescence.md`) ; la clé sert encore à `clan-showcase.ts:173` |
| `admin.weapon-categories` (superuser, menu SuperUser) | `/settings/weapon-categories` — **page absente**, redirigée | Doublon de la carte « Alias armes PUBG » dans l'accueil SuperUser |

**Libellés** : seul `clan.stats-weapons` diffère (« Stats armes » en base, surchargé en « L'armurerie du clan », qui est
le libellé du registre). Surcharges de libellé en place : `clan.stats` → « Style de jeu du clan », `member.stats` →
« Carrière PUBG ».

**Rôles et sections surchargés en base** — c'est le constat principal de cette section :

| Section d'origine | Clés | Rôle registre → base | Section → base |
|---|---|---|---|
| owner-menu | `owner.telemetry-dashboard`, `-errors`, `-sync-batch`, `-recoveries`, `owner.email-delivery`, `owner.pubg-api`, `owner.switch-clan` | owner → **superuser** | → superuser-menu |
| owner-menu | `owner.telemetry-matches`, `owner.encountered-opponents`, `owner.nav-permissions` | owner → **superuser** | reste owner-menu |
| admin-menu | `admin.map-labels`, `admin.weapon-labels`, `admin.weapon-categories`, `admin.phase-labels` | admin → **superuser** | → superuser-menu |
| admin-menu | `admin.players-roles`, `admin.login-welcome` | admin → **owner** | — |
| clan-section | `clan.tournaments` | admin → **owner** | — |
| clan-section | `clan.members-pending` | admin | → admin-menu |
| clan-section | `clan.heatmap-kills` | none → **superuser** | — |
| clan-section / member-section | `clan.challenges`, `clan.reports`, `member.rewards`, `member.notification-preferences`, `member.notifications` | → **hidden** | — |

Conséquences :

1. **La politique des menus a déjà été resserrée en base** (pipeline, référentiels, email et API PUBG réservés au
   SuperUser ; membres, accueil login et tournois réservés à l'Owner), **mais les API ne la suivent pas** : leurs gardes
   sont écrites dans le code (`requireRole(['Owner'])`, `manage_settings`, `manage_members`) et ignorent `NavItem`. Un
   Owner ne voit plus ces outils, mais les ouvre par leur adresse et ses appels passent.
2. **L'accueil « Paramètres owner » est vide pour un Owner en production** (toutes les entrées owner-menu exigent
   SuperUser), alors que la barre latérale lui en affiche toujours le lien (`CN:436`).
3. **Deux paires d'entrées mènent à la même page** : `owner.nav-permissions` / `superuser.platform-settings`
   (`/settings/nav-permissions`), `owner.switch-clan` / `superuser.switch-clan` (`/clans`) — plus
   `admin.weapon-categories`, redirigée vers la page d'une autre entrée.
4. **Liens vers des pages absentes** : `clan.reports`, `admin.weapon-categories` (redirigée), `clan.items` (registre).
5. Dernières modifications en base : `superuser.league-settings` le 2026-10-04, `member.playstyle` le 2026-10-03 ; les
   surcharges ont été posées à la main depuis `/settings/nav-permissions`.

---

## 3. Constats

### 3.1 Les constats de l'audit

| # | Constat | Verdict | Preuve |
|---|---|---|---|
| 1 | `PUT /api/settings/nav-permissions` ouvert à l'Owner de n'importe quel clan | **Confirmé, et plus grave** | `A/settings/nav-permissions/route.ts:35-40` : `requireRole(['Owner'])(request, {})`, sans clan. Les rôles servent de garde (`nav-permissions-service.ts:66-70`). En plus : l'action `delete` supprime la ligne, donc rend la route publique ; `hidden` bloque même le SuperUser ; `update` laisse passer `defaultRole` (`nav-permissions-service.ts:204-207`) ; `hrefTemplate` n'est contrôlé que par `startsWith('/')` (`:168,200`), donc `//domaine.tld` place un lien externe dans la barre de tout le monde. *Nuance :* en mode visiteur (production), `requireNavPermission` est court-circuitée : l'effet sur les gardes ne vaut que si l'authentification est réactivée ; l'effet sur les menus vaut tout de suite |
| 2 | Référentiels (`map-labels`, `weapon-labels`, `phase-labels`, `map-locations`) modifiables par l'admin de n'importe quel clan | **Confirmé** | `map-labels/route.ts:11-24`, `weapon-labels:11-24`, `phase-labels:7-20`, `map-locations:25-41` : `includes('*') \|\| includes('manage_settings')` du membre actif, écriture dans `AppConfig` (`map-label-service.ts:69`…). Et aucun contournement SuperUser : un SuperUser sans `manage_settings` est refusé |
| 3 | `recalc-aggregates-batch` `scope: 'all-clans'` contrôlé par le seul rôle Owner du clan ; page qui écrit `/api/clans/1/…` en dur | **Confirmé** | `T/recalc-aggregates-batch/route.ts:29-31` puis `:70-75` (tous les clans ayant des membres, archivés compris) ; `S/telemetry-recoveries/page.tsx:275`. Le recalcul tourne **dans la requête HTTP**, clan après clan (`:82-107`), alors que la page annonce « Job envoyé » |
| 4 | Email de test vers une adresse libre pour tout Owner | **Confirmé** | `A/settings/email-delivery/route.ts:21-23,13-15,135`. En plus : le GET affiche `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM` et les 4 derniers caractères du mot de passe (`:35-48`) ; le DELETE (`:179`) révoque la validation pour **tous** les clans et masque leurs boutons d'invitation |
| 5 | `dev/runtime-status` expose le serveur à un Owner | **Confirmé** | `A/clans/[clanId]/dev/runtime-status/route.ts:26` (Owner + clan), `:36-41` : PID, version de Node, durée de fonctionnement, nom d'hôte. Interrogé toutes les 20 s par la page de soirée (`session/[date]/page.tsx:405`) |
| 6 | `owner.pubg-api` au menu Owner, page et routes SuperUser | **Confirmé, déjà corrigé en base** | `reg:474-481` (`defaultRole: 'owner'`) ; page `S/pubg-api/page.tsx:168,334` ; routes `pubg-api-calls/route.ts:12,49`, `pubg-api-rate-limit/route.ts:20`. En production, l'entrée est surchargée en superuser (§2) |
| 7 | Pages de réglages de clan : permissions de session sans contrôle du clan de l'adresse | **Nuancé** | Vrai pour toutes, mais l'effet varie. `login-welcome` : le formulaire charge les vraies données de l'autre clan (GET public) et l'enregistrement échoue en 403 — le cas exact décrit. `discord` : bandeau d'erreur sur un formulaire vide. `tournaments` : « Impossible de charger les tournois ». `settings/members` : aucune condition, le 403 renvoie vers `/login`. Accueil du clan : les quatre cartes s'affichent |
| 8 | Pages qui oublient `isSuperUser` | **Confirmé, à compléter côté API** | Pages : `S/map-labels/page.tsx:71`, `S/weapon-labels/page.tsx:71`, `S/phase-labels/page.tsx:46`, `clans/[clanId]/settings/login-welcome/page.tsx:50` (il n'y a pas de `/settings/login-welcome`, seulement une ancienne route d'API), `members/add/page.tsx:55-58`, `S/email-delivery/page.tsx:120`. Pour les référentiels et l'email, **les routes non plus** n'ont pas de contournement SuperUser : corriger les pages ne suffit pas |
| 9 | `clan-lifecycle` et les pages de télémétrie sans condition d'accès côté page | **Nuancé** | `clan-lifecycle` : aucune condition, panneau « réservé » seulement après le 403 de l'API (`:138-142`). Télémétrie : aucune des neuf pages ne vérifie ; `recoveries` et `opponents` renvoient vers `/login` sur 403 ; `dashboard` ne masque que son panneau d'outils. Le débriefing et la page « État » sont **volontairement** ouverts aux joueurs |
| 10 | Six pages de pipeline ouvertes aux Owners malgré le quota commun | **Nuancé** | Les six entrées owner-menu de télémétrie : `dashboard`, `errors`, `sync-batch-manual`, `recoveries`, `matches` (avec `session/[date]` et `[matchId]/telemetry`), `opponents`. Celles qui consomment réellement le quota commun (file unique `api-throttle.ts:243-262`) : `sync-batch-manual`, `matches/session/[date]`, `[matchId]/telemetry`, `recoveries`, `errors` (relance). `dashboard` (réordonnancement de la file, nettoyage) et `opponents` (lecture) ne l'entament pas, mais `dashboard` permet de passer devant les autres clans |
| 11 | Deux accueils d'administration de clan | **Nuancé** | `/settings/admin` (dynamique, `useSettingsHubItems('admin-menu')`) ; `/clans/[clanId]/settings` (quatre cartes en dur `:62-81`, aucune `navKey`). Le sous-domaine n'est bien qu'à cet endroit (`ClanSubdomainSettings` utilisé seulement `:85`). **L'arrêt de suivi, non** : `/settings/opponents` monte aussi `ClanArchiveDialog` (`page.tsx:25,1068`) |
| 12 | Trois accueils presque identiques | **Confirmé** | `S/admin|owner|superuser/page.tsx` (100, 95, 94 lignes) : ne diffèrent que par la condition d'accès, la section passée à `useSettingsHubItems`, les textes et l'ordre des grilles. L'accueil SuperUser a une grille « clan » toujours vide (aucune entrée superuser ne contient `:clanId`) |
| 13 | Entrées en double (`nav-permissions`, `switch-clan`) | **Confirmé** | `reg:482-489` et `:516-523` → `/settings/nav-permissions` ; `reg:490-497` et `:508-515` → `/clans`, page ouverte à tous où « Changer de clan » ne change rien pour un Owner (`canSwitchClan = isSuperUser \|\| authDisabled`, `clans/page.tsx:66`) |
| 14 | Gestion des membres sur quatre pages et deux redirections | **Confirmé** | Annuaire `/clans/[clanId]/members`, rôles et invitations `/clans/[clanId]/settings/members` (1 843 lignes), demandes `/clans/[clanId]/members/pending`, ajout `/members/add` ; redirections client `members/page.tsx:24`, `members/manage/page.tsx:18`. Les demandes ont **trois règles** différentes (page, liste, validation — §3.2) |
| 15 | Gestion des clans côté SuperUser sur trois pages, arrêt de suivi en double | **Nuancé** | Trois pages, oui. Mais `ClanFollowDangerZone` **enveloppe** `ClanArchiveDialog` (`ClanFollowDangerZone.tsx:7,147`) : deux points d'entrée, pas deux codes. La **réactivation**, elle, existe à trois endroits (`opponents/page.tsx:1197-1200`, `ClanFollowDangerZone`, `ClanRequestsSections.tsx:205-211`) |
| 16 | `telemetry/loot` et `/vehicles` sans appelant | **Confirmé, et plus large** | Sans appelant aussi : `T/circles`, `A/members/[id]/telemetry/circles`, `A/clans/[clanId]/squad-analysis`, `A/clans/[clanId]/sync-stats`, `A/auth/switch-member`, les GET de `T/dead-letter`, `T/queue-cleanup`, `T/recalc-aggregates-batch` |
| 17 | `clan.items` pointe vers une page supprimée mais garde une API | **Confirmé** | `reg:213-216`, redirection `next.config.ts:27`, garde de `T/item-use/route.ts:25` utilisée par `clans/[clanId]/stats/page.tsx:80`. Masquer l'entrée **casserait** la section Objets de la page Stats (si l'authentification est active). `scripts/seed-item-use-nav.ts:18` sème encore l'ancien lien |
| 18 | `PrivacyRequest` sans page de traitement | **Confirmé** | Seule écriture : `privacy-request-service.ts:17` (+ notification aux SuperUsers `notification-service.ts:312-339`, email à `CONTACT_EMAIL`). Aucune lecture, aucune mise à jour ; `handledAt` n'apparaît que dans le schéma. Traitement en SQL à la main (`docs/features/pages-legales.md:65-74`) |
| 19 | Moderator : des permissions, aucun espace | **Confirmé, et pire** | `role-service.ts:58-62` : `invite_members`, `manage_challenges`, `manage_notifications`, `manage_channels`, `moderate_members` — **aucune n'est vérifiée** par une route (invitations : `manage_members` ; défis : `edit_clan` ; Discord : `manage_settings`). Le PATCH de rôle remplace tous les rôles (`role/route.ts:84-90`) : un Moderator perd le rôle Member, et `awards/route.ts:37` (`['Owner','Admin','Member']`) le refuse. **Un Moderator a moins de droits qu'un Member.** Aucun Moderator ni Admin n'est attribué en production (§4) |
| 20 | Libellés mêlant français et anglais, caractère mal encodé | **Confirmé** | Menu : « Dashboard télémétrie » `reg:421`, « Sync batch manuel » `:437`, « Recoveries telemetry » `:445`, « Test email » `:469`, « Monitoring PUBG API » `:477`, « Permissions nav » `:485`, « Ops Cron » `:503`, « Telemetrie cross-clans » `:527`. Barre : « Paramètres owner », « Paramètres SuperUser » `CN:1103-1104`. Caractère U+FFFD dans « Propri�taire » : `S/email-delivery/page.tsx:309`, `S/pubg-api/page.tsx:340,363` (seuls fichiers concernés). Nombreux accents manquants (« Acces restreint… reservee » sur six pages, « Libelles », « Revoquer ») et anglicismes dans `cron`, `pubg-api`, `telemetry-recoveries` |

### 3.2 Constats manqués par l'audit

Classés par gravité. **Critique** = faille exploitable sans compte ou destruction de données d'un autre clan.

| # | Gravité | Constat | Preuve |
|---|---|---|---|
| M1 | **Critique** | **Révocation d'invitation anonyme** : `DELETE /api/clans/[clanId]/members/[memberId]/invite` passe `allowMissingActor: true` et ne revérifie jamais la session ; n'importe qui révoque l'invitation en attente de n'importe quel membre | `invite/route.ts:122-133` ; `AP:129-132` ; le POST, lui, revérifie (`:68-70`) |
| M2 | **Critique** | **`/api/matches/[matchId]` sans garde** : GET et POST appellent l'API PUBG ; POST écrit `Match`, met à jour `ClanMember.lastMatchAt` et `Clan` pour n'importe quel `memberId` | `A/matches/[matchId]/route.ts:35-75,77-161` ; seul appelant : la page SuperUser d'import |
| M3 | **Critique** | **`/api/fix` et `/api/fix2` sans garde**, encore dans le dépôt : `fix` lance `syncTrackedClanStats(7)` (quota PUBG) ; `fix2` crée des `ClanMember` dans le clan 13 | `A/fix/route.ts:3-5`, `A/fix2/route.ts:7-31` (commit `b593dce`) |
| M4 | **Critique** | **`/api/cron/opponent-stats?force=true` public** : efface puis reconstruit le cache des adversaires ; l'en-tête `x-vercel-cron` est falsifiable | `A/cron/opponent-stats/route.ts:21-22` (« In a real app we'd check auth »), `:62` ; aucun appelant |
| M5 | **Critique** | **Suppression de la télémétrie d'un autre clan** : `resetBeforeSync` supprime `SquadMatchTelemetry` pour **tous** les identifiants reçus, sans vérifier leur clan, dans la route et dans le worker | `T/resync-files-selected/route.ts:139-147` ; `scripts/telemetry-resync-worker.ts:316-322` (alimenté par `sync-batch-manual` et `resync-files-queue`) |
| M6 | Haute | **`POST /api/members` écrit avant d'autoriser** : `ensureTrackedClanForPlayer` crée et active un clan suivi **avant** le contrôle du clan, même en mode aperçu ; n'importe quel admin fait suivre un nouveau clan à la plateforme (réservé au SuperUser par `POST /api/settings/clans`) | `A/members/route.ts:35-38` (`manage_members` sans clan), `:58-61`, `:83-95` ; `clan-service.ts:107` |
| M7 | Haute | **`cron-control` ouvert à l'Owner** : déclenche `sync_matches`, `sync_stats`, `sync_lifetime_stats` (quota PUBG) ; le DELETE **purge l'historique `CronExecution` du clan** (efface les traces) ; le GET expose la configuration et l'état du worker | `A/clans/[clanId]/cron-control/route.ts:41-49,66-110,417-422` |
| M8 | Haute | **Un Owner passe devant tous les clans** : `queue-cleanup` `reorder-priority` réécrit `startedAt` de ses jobs, la file commune les prend dans cet ordre ; `cleanup-stale`/`cleanup-failed` **suppriment** des lignes `CronExecution` | `src/lib/pubg-telemetry/queue-priority.ts:80-91`, `resync-queue.ts:213-228`, `stale-cleanup.ts:86-103` |
| M9 | Haute | **Rôle de menu `none` = API publique et inter-clans**, même authentification active : `requireNavPermission` rend la main avant tout contrôle de clan. Contredit la règle « un membre n'ouvre que son clan » | `AP:209-211` ; `docs/features/clans.md:368-371` ; liste des routes concernées au §0 du rapport, une douzaine de clés `clan.*` |
| M10 | Haute | **Recalcul « tous les clans » dans la requête HTTP** : même boucle `recalculateTelemetryPeriodAggregatesForClan` que celle qui plante au hasard (segfault) lors des rattrapages en masse sur une vingtaine de clans | `T/recalc-aggregates-batch/route.ts:82-107` |
| M11 | Moyenne | **Un Admin ne peut pas inviter depuis l'interface** : la page des membres lit `GET /api/settings/email-delivery` (`'*'` seulement) ; un Admin reçoit 403, les boutons d'invitation sont masqués et un bandeau trompeur « Invitations email désactivées » s'affiche, alors que l'API d'invitation l'accepte | `clans/[clanId]/settings/members/page.tsx:315,322-326,763,795,1203-1211` |
| M12 | Moyenne | **SuperUser sans membre actif refusé** (401) par `requirePermission` et `requireRole`, le contournement SuperUser venant après le contrôle du membre | `AP:127-140,164-177` |
| M13 | Moyenne | **Demandes en attente : trois règles** — page (`manage_members`, `manage_roles` ou `manage_settings`), liste (`manage_members`), validation (noms de rôle `Owner`/`Admin`) | `pending/page.tsx:61-69` ; `A/clans/[clanId]/members/route.ts:73` ; `approve/route.ts:26`, `reject/route.ts:24` |
| M14 | Moyenne | **Ancien `PUT /api/settings/login-welcome`** : `manage_settings` de n'importe quel clan écrit l'écran d'accueil du **plus ancien clan actif** ; aucun appelant | `A/settings/login-welcome/route.ts:49-79` ; `login-welcome-service.ts:115-123` |
| M15 | Moyenne | **La page SuperUser d'import de matchs appelle les alias cartes**, qui refusent le SuperUser sans `manage_settings` (erreur ignorée en silence) | `S/match-import/page.tsx:267-268` |
| M16 | Moyenne | **« Adversaires rencontrés » : menu Owner, API Owner et Admin** | `reg:458-465` ; `A/clans/[clanId]/encountered-players/route.ts:40-42` |
| M17 | Moyenne | **Inscription à un défi d'un autre clan** : la route vérifie le clan de l'adresse, pas celui du défi | `challenges/[cid]/join/route.ts:34` ; `challenge-service.ts:105-123` |
| M18 | Moyenne | **Traçabilité insuffisante** : `CronExecution.triggeredBy` mélange identifiants de membre et de compte ; onze actions d'exploitation n'enregistrent aucun auteur (§4) | `live-sync-queue.ts:141-151` ; `recoveries/route.ts:255` ; `resync-queue.ts:155-165` |
| M19 | Basse | **Barre latérale** : les liens des accueils excluent le SuperUser (`CN:353-354`) ; « Paramètres admin » s'allume sur toute page `/settings/*` (`CN:853-856`) ; code mort `renderCtxSection`, `renderFullCtxSection`, `getFirstSectionHref`, `handleCronAction`, `canViewLeaderboard`, permission inconnue `view_reports` (`CN:348-350,379,711,745,782`) | — |
| M20 | Basse | **Page « État » d'un match** : boutons « Resync ce match » et « Importer fichier » affichés aux joueurs ; la page de soirée mélange liste joueur et panneau d'exploitation | `[matchId]/telemetry/page.tsx:1217-1248` ; `session/[date]/page.tsx` |
| M21 | Basse | **Fuites et références mortes** : `fetch-files-selected` renvoie le chemin du dossier de capture (`:96,119`) ; deux dossiers de capture différents (`clear-selected:22-34` vs `fetch-files-selected:18-23`) ; `sync-batch-manual` renvoie l'adresse d'une route `sync-batch-ws` inexistante (`:119-120`) ; `GET /api/settings/nav-permissions` publique avec les descriptions SuperUser | — |
| M22 | Basse | **`GET /api/members`** renvoie les membres de tous les clans à toute session | `A/members/route.ts:228-246` |
| M23 | Basse | **Palette de commandes** : liens vers les pages de télémétrie Owner sans contrôle de rôle | `src/components/ui/GlobalCommandPalette.tsx:106-115` |
| M24 | Basse | **Documentation des rôles fausse** : `docs/features/clans.md:85-114` promet des pouvoirs au Moderator et refuse les réglages à l'Admin, qui a pourtant `manage_settings` (`role-service.ts:56`) | — |

---

## 4. Usage réel des outils de pipeline (2026-08-07 → 2026-10-06)

Lecture seule de `CronExecution`, `UserSession`, `ClanMemberRole` le 2026-10-06.

**Qui se connecte.** Quatre comptes ont ouvert une session en 60 jours : le **SuperUser** (compte 1, 143 sessions),
**un seul Owner** (compte 9, Owner du clan 7 FR-Alliance-BE, 3 sessions, la dernière le 2026-09-18) et deux membres
simples (comptes 3 et 5, 3 sessions en tout). La plateforme compte **13 Owners dans 13 clans**, **aucun Admin et aucun
Moderator** attribué.

**Déclenchements avec auteur** (`triggeredBy` renseigné) : **tous du SuperUser**. La valeur `1` désigne à la fois le
membre 1 et le compte 1, et les deux sont le SuperUser : l'ambiguïté de la colonne ne change rien ici.

| Action | Déclenchements | Clans | Période |
|---|---|---|---|
| `telemetry_live_sync` (resynchronisation ciblée, rattrapage) | 2 272 | 20 (dont 16, 7, 18, 19, 25, 6, 13, 102, 179…) | 2026-08-08 → 2026-10-01 |
| `sync_matches` (`cron-control`) | 7 | 3 (1, 6, 20) | 2026-08-31 → 2026-09-01 |
| `sync_stats` (`cron-control`) | 1 | 1 (clan 1) | 2026-08-08 |

**Sans auteur** : 147 jobs `telemetry_resync_file` pour le clan 6 (Les-Ratz), tous le 2026-09-01 — le jour où le
SuperUser a lancé trois `sync_matches` sur ce même clan. Très probablement le SuperUser, sans preuve formelle.

**Ce qui n'est pas mesurable.** Onze actions n'enregistrent aucun auteur : `sync-selected`, `backfill-null-json`,
`fetch-files-selected`, `import-file`, `resync-files-selected`, `clear-selected`, `recalc-aggregates-batch` (y compris
« tous les clans »), `queue-cleanup`, `dead-letter`, `runtime-status`, et les mises en file de fichiers. Les routes ne
journalisent qu'en cas d'erreur. Les recalculs d'agrégats ne laissent que la date du dernier passage par clan : aucune
trace d'un recalcul simultané de plusieurs clans.

**Conclusion.** Aucune trace d'utilisation par un Owner sur 60 jours ; le seul Owner connecté n'a laissé aucune action
tracée. Retirer ces outils aux Owners ne supprime **aucun usage observé** — avec la réserve des actions non tracées.

---

## 5. Proposition

### 5.1 La cible tient-elle ?

**Oui, avec sept ajustements.** Deux espaces, chacun avec un seul accueil, c'est la bonne cible : l'usage (§4) montre
qu'en pratique seul le SuperUser administre, et que les Owners ne se servent pas du pipeline.

1. **L'adresse porte le clan** : `/clans/[clanId]/settings` permet enfin de vérifier, **côté serveur**, que l'utilisateur
   appartient au clan de l'adresse (un `layout.tsx` serveur), ce qui règle à la racine le constat 7. Même chose pour
   `/settings` avec un `layout.tsx` serveur réservé au SuperUser.
2. **Pas de « Santé des données » interactive pour l'Owner.** Proposition : un état en **lecture seule** (dernière
   synchronisation, parties sans télémétrie, erreurs) et un seul bouton « Demander une resynchronisation », mis en file
   **à basse priorité**, plafonné par clan (par exemple 50 parties par 24 h), sans appel PUBG direct, sans
   réordonnancement ni suppression. Les outils actuels passent tous côté Plateforme.
3. **La page « État » d'un match reste** pour les joueurs, en lecture ; ses boutons d'action ne s'affichent qu'au
   SuperUser.
4. **« Soirées » de télémétrie** (`/clans/[clanId]/telemetry/matches` et `…/session/[date]`) font double emploi avec les
   pages joueur `/clans/[clanId]/matches` et `/clans/[clanId]/matches/session/[date]` : on redirige vers celles-ci, et le
   panneau d'exploitation de la soirée rejoint Plateforme › Données › Télémétrie, avec un sélecteur de clan.
5. **Ajouter à Plateforme › Données la file de validation de la Carte des ressources** (onglet SuperUser de
   `/carte-des-ressources`), qui est aujourd'hui une autre forme d'administration hors des menus.
6. **Admin et Owner dans « Mon clan »** : aujourd'hui la base réserve « Joueurs et rôles », « Accueil login » et
   « Tournois » à l'Owner, alors que les API les ouvrent à l'Admin. Il faut trancher (question Q4) ; proposition :
   l'Admin gère membres, invitations, demandes, ajout, Discord, accueil, tournois ; l'Owner en plus attribue le rôle
   Admin et voit la santé des données.
7. **« Adversaires rencontrés » rejoint les stats du clan**, mais la question de sa visibilité doit être tranchée
   (noms de joueurs extérieurs au site — Q5).

### 5.2 Page par page

| Page actuelle | Décision | Adresse cible | Rôle requis | Lot |
|---|---|---|---|---|
| `/settings` (absente) | **créer** l'accueil Plateforme (Clans, Joueurs, Données, Référentiels, Site) | `/settings` | SuperUser | 3 |
| `/settings/superuser` | **fusionner** dans l'accueil Plateforme | `/settings` | SuperUser | 3 |
| `/settings/admin`, `/settings/owner` | **supprimer** (redirection vers l'accueil Mon clan du clan du membre actif — Q11) | `/clans/[clanId]/settings` | Admin / Owner du clan | 3 |
| `/clans/[clanId]/settings` | **garder**, devient l'accueil Mon clan (Membres, Apparence et annonces, Compétition, Santé des données) ; le sous-domaine et l'arrêt de suivi en sortent | même adresse | Admin du clan de l'adresse | 3 |
| `/clans/[clanId]/settings/members` | **garder**, en onglets : Membres, Rôles, Invitations, Demandes, Ajout | même adresse, `?tab=` | Admin (rôle Admin : Owner) | 3 |
| `/clans/[clanId]/members/pending` | **fusionner** (onglet Demandes) | `/clans/[clanId]/settings/members?tab=demandes` | Admin | 3 |
| `/members/add` | **fusionner** (onglet Ajout, dans le clan de l'adresse uniquement ; créer un nouveau clan suivi reste au SuperUser) | `/clans/[clanId]/settings/members?tab=ajout` | Admin | 3 |
| `/members/manage` | **supprimer** (redirection) | `/members` | — | 2 |
| `/clans/[clanId]/settings/login-welcome`, `…/discord` | **garder** (Apparence et annonces) | mêmes adresses | Admin | 3 |
| `/clans/[clanId]/settings/tournaments` | **garder** (Compétition) ; défis : Q7 | même adresse | Admin | 3 |
| Santé des données | **créer** (lecture seule + demande plafonnée) | `/clans/[clanId]/settings/data` | Owner | 3 |
| `…/telemetry/dashboard`, `errors`, `sync-batch-manual`, `recoveries` | **déplacer** vers la console Télémétrie | `/settings/telemetry?clan=…&tab=…` | SuperUser | 3 |
| `/settings/telemetry-recoveries` | **fusionner** (vue « tous les clans » de la console) | `/settings/telemetry` | SuperUser | 3 |
| `…/telemetry/matches`, `…/matches/session/[date]` | **rediriger** vers les pages joueur ; panneau d'exploitation → console | `/clans/[clanId]/matches`, `…/matches/session/[date]` | — | 3 |
| `…/telemetry/matches/[matchId]/telemetry` | **garder** en lecture ; actions SuperUser | même adresse | public / SuperUser pour les actions | 1 (actions), 3 |
| `…/telemetry/matches/[matchId]/debrief` | **garder** | même adresse | public | — |
| `…/telemetry/opponents` | **déplacer** dans les stats du clan | `/clans/[clanId]/stats/opponents` | Q5 | 3 |
| `/settings/opponents` + `/settings/clan-lifecycle` + sous-domaine et arrêt de suivi | **fusionner** : Clans (suivis, demandes, archivés, mutations, non groupés ; fiche de clan avec sous-domaine et arrêt de suivi) | `/settings/clans` | SuperUser | 3 |
| `/settings/opponents/players`, `resolution`, `triage` | **déplacer** : Joueurs (annuaire, résolution, triage) | `/settings/players?tab=…` | SuperUser | 3 |
| `/settings/cron`, `/settings/match-import`, `/settings/pubg-api` | **garder** (Données) | mêmes adresses | SuperUser | — |
| `/settings/superuser/database` | **déplacer** (Données) | `/settings/database` | SuperUser | 3 |
| `/settings/map-labels`, `weapon-labels`, `phase-labels`, `league` | **garder** (Référentiels) | mêmes adresses | SuperUser | 1 (droits) |
| `/settings/nav-permissions` | **garder** (Site), entrée Owner retirée | même adresse | SuperUser | 1, 2 |
| `/settings/email-delivery` | **garder** (Site) ; une route de **statut** en lecture seule (« l'email est prêt ») pour les Admins | même adresse | SuperUser (statut : Admin) | 1 |
| Demandes de confidentialité | **créer** (liste, traitement, `handledAt`) | `/settings/privacy-requests` | SuperUser | 3 |
| `/settings/weapon-categories` | redirection **gardée** ; entrée de menu supprimée | → `/settings/weapon-labels` | — | 2 |
| Espace Moderator | **créer** si Q6 le confirme | Q6 | Moderator | 3 |

---

## 6. Plan en trois lots

Chaque lot est livré séparément, après accord. À la fin de chaque lot, ce document est mis à jour (fait, reste à faire,
écarts au plan), ainsi que `docs/architecture/api-reference.md` et `docs/ops/nav-permissions.md`.

### Lot 1 — Droits

Fermer les accès trop larges sans rien déplacer : gardes d'API d'abord, conditions d'accès des pages ensuite.

**Deux gardes partagées** (nouveau module `src/lib/auth/admin-guards.ts`, appelé par les routes) :

- `requireClanAccess(request, clanId, { permission } | { role })` : session valide obligatoire, **jamais ouverte par le
  mode visiteur** ; SuperUser accepté même sans membre actif ; sinon l'utilisateur doit avoir un membre **actif dans le
  clan de l'adresse** (Q14 : membre actif seulement, ou n'importe lequel de ses membres liés) qui porte la permission ou
  le rôle.
- `requirePlatformAdmin(request)` : session valide et SuperUser, rien d'autre.

**Routes à corriger** (une ligne par route dans le plan d'exécution) :

| Garde cible | Routes |
|---|---|
| `requirePlatformAdmin` | PUT `settings/nav-permissions` (+ validation : `hrefTemplate` interne uniquement, pas de `//` ; refus de supprimer ou masquer une clé utilisée comme garde ; `defaultRole` non modifiable) ; GET/PUT `settings/map-labels`, `weapon-labels`, `phase-labels`, `map-locations` (écriture ; la lecture reste ouverte aux services) ; GET/POST/DELETE `settings/email-delivery` ; `T/recalc-aggregates-batch` ; `clans/[id]/cron-control` (les trois méthodes) ; `clans/[id]/dev/runtime-status` ; `T/queue-cleanup` ; outils de pipeline `T/backfill-null-json`, `clear-selected`, `dead-letter`, `fetch-files-selected`, `import-file`, `metrics`, `observability`, `recoveries`, `resync-files-queue`, `resync-files-selected`, `sync-batch-manual`, `sync-selected`, `sync-selected-enqueue` (Q1) ; `clans/[id]/sync-stats` ; `matches/[matchId]` GET et POST ; `cron/opponent-stats` (ou secret cron, comme `internal/cron/*`) |
| `requireClanAccess` | DELETE `…/members/[mid]/invite` (fin de `allowMissingActor`) ; POST `members` (autorisation **avant** tout effet, clan de l'adresse, création de clan réservée au SuperUser) ; `…/members/[mid]/approve`, `reject` et la liste des demandes (une seule règle : `manage_members`) ; `encountered-players` (rôle à fixer, Q5) ; `challenges/[cid]/join` (vérifier `challenge.clanId`) ; nouvelle route GET `settings/email-delivery/status` (Admin du clan) |
| Contrôle d'appartenance des données | `resetBeforeSync` (route et worker) : ne supprimer que la télémétrie des parties du clan |
| Supprimer | `A/fix`, `A/fix2` ; ancien PUT `settings/login-welcome` (Q12) |

**Pages** : un `layout.tsx` **serveur** pour `src/app/settings/` (SuperUser, sauf les pages encore ouvertes à l'Owner
jusqu'au lot 3) et pour `src/app/clans/[clanId]/settings/` (appartenance au clan de l'adresse + rôle) ; ajout de
`isSuperUser` aux conditions oubliées ; masquage des boutons d'action de la page « État » ; barre latérale : liens des
accueils pour le SuperUser.

**Fichiers touchés** : `src/middleware/auth-permission.ts`, `src/lib/auth/admin-guards.ts` (nouveau), une trentaine de
routes listées ci-dessus, `src/app/settings/layout.tsx` et `src/app/clans/[clanId]/settings/layout.tsx` (nouveaux),
`S/map-labels|weapon-labels|phase-labels|email-delivery/page.tsx`, `clans/[clanId]/settings/*/page.tsx`,
`members/add/page.tsx`, `clans/[clanId]/telemetry/matches/[matchId]/telemetry/page.tsx`, `CN`,
`scripts/telemetry-resync-worker.ts`, `src/lib/pubg-telemetry/telemetry-file-resync` (réinitialisation).

**Migrations de données** : aucune. **Redirections** : aucune (rien n'est déplacé).

**Tests** (Vitest, dans `src/lib/` — seul dossier collecté) : `src/lib/auth/admin-guards.test.ts` (les deux gardes,
mode visiteur compris) et `src/lib/auth/admin-route-guards.test.ts` : **un test par route corrigée**, qui vérifie le
refus pour **un Owner d'un autre clan** (et, pour les routes Plateforme, pour un Owner de n'importe quel clan),
l'acceptation pour le SuperUser, y compris sans membre actif, et le refus sans session. Plus : invitation anonyme
refusée, `members` sans effet avant autorisation, `resetBeforeSync` limité au clan. E2E : un Admin du clan A sur
`/clans/B/settings` voit le refus serveur.

### Lot 2 — Doublons et pages mortes

- **Menus (script `scripts/cleanup-admin-nav.ts`, simulation par défaut, `--apply` pour écrire)** : supprimer
  `owner.nav-permissions`, `owner.switch-clan`, `superuser.switch-clan`, `admin.weapon-categories`, `clan.reports` ;
  corriger les libellés (`label` en base quand il n'y a pas de surcharge) ; ajouter `primary.mortar`,
  `primary.resources`, `primary.zone-reading` ; aligner `reg`.
- **`clan.items`** : la route `T/item-use` passe sur la clé `clan.stats`, puis l'entrée est retirée du registre et de
  `scripts/seed-item-use-nav.ts`.
- **Routes sans appelant supprimées** : `T/loot`, `T/vehicles`, `T/circles`, `A/members/[id]/telemetry/circles`,
  `clans/[id]/squad-analysis`, `auth/switch-member` (après vérification), GET de `dead-letter`, `queue-cleanup`,
  `recalc-aggregates-batch` ; adresse `sync-batch-ws` retirée ; code mort de `CN`.
- **Accueils** : les trois fichiers d'accueil deviennent un seul composant paramétré (en attendant le lot 3).
- **Libellés et encodage** : remplacer les U+FFFD, remettre les accents, franciser « Dashboard », « Sync batch
  manuel », « Recoveries », « Ops Cron », « Test email », « Monitoring », « Permissions nav », « owner », « SuperUser »
  dans les libellés visibles (proposition : « État de la télémétrie », « Synchronisation manuelle », « Récupérations »,
  « Tâches planifiées », « Email d'envoi », « API PUBG », « Navigation », « Propriétaire », « Plateforme »).
- **Redirections `next.config.ts`** : `/members/manage` → `/members` (la page `members/manage` est supprimée).
- **Migrations de données** : le script ci-dessus (pas de migration Prisma).
- **Tests** : un test qui vérifie que chaque lien du registre mène à une page existante ou à une redirection de
  `next.config.ts` ; ajout à `src/lib/ui-conformance.test.ts` d'une règle « aucun U+FFFD » et d'une liste de libellés
  anglais interdits dans `src/app/settings/` ; test du script en simulation.

### Lot 3 — Réorganisation

- **Accueil Plateforme** `/settings` (Clans, Joueurs, Données, Référentiels, Site) et **accueil Mon clan**
  `/clans/[clanId]/settings` (Membres, Apparence et annonces, Compétition, Santé des données), chacun derrière son
  `layout.tsx` serveur.
- **Nouvelles pages** : `/settings/clans`, `/settings/players`, `/settings/telemetry`, `/settings/database`,
  `/settings/privacy-requests` (+ routes `GET/PATCH /api/settings/privacy-requests`), `/clans/[clanId]/settings/data`,
  `/clans/[clanId]/stats/opponents` ; onglets de `/clans/[clanId]/settings/members` ; espace Moderator si confirmé.
- **Menus** : nouvelles clés par section, suppression des anciennes (`admin-menu`, `owner-menu`, `superuser-menu`
  regroupés en `clan-admin` et `platform`), par un script dans `scripts/`.
- **Redirections `next.config.ts` (308)** :
  `/settings/superuser` → `/settings` ;
  `/settings/opponents` → `/settings/clans` ;
  `/settings/opponents/players` → `/settings/players` ;
  `/settings/opponents/resolution` → `/settings/players?tab=resolution` ;
  `/settings/opponents/triage` → `/settings/players?tab=triage` ;
  `/settings/clan-lifecycle` → `/settings/clans?tab=demandes` ;
  `/settings/superuser/database` → `/settings/database` ;
  `/settings/telemetry-recoveries` → `/settings/telemetry` ;
  `/clans/:c/telemetry/{dashboard,errors,sync-batch-manual,recoveries}` → `/settings/telemetry?clan=:c&tab=…` ;
  `/clans/:c/telemetry/matches` → `/clans/:c/matches` ;
  `/clans/:c/telemetry/matches/session/:date` → `/clans/:c/matches/session/:date` ;
  `/clans/:c/telemetry/opponents` → `/clans/:c/stats/opponents` ;
  `/clans/:c/members/pending` → `/clans/:c/settings/members?tab=demandes`.
  `/settings/admin`, `/settings/owner` et `/members/add` n'ont pas le clan dans l'adresse : redirection **serveur**
  vers le clan du membre actif (Q11).
- **Tests** : chaque ancienne adresse répond 308 vers sa cible (test des redirections de `next.config.ts`) ; e2e des
  deux accueils (clair, sombre, mobile) ; contrats des routes des demandes de confidentialité ; ajout des nouvelles
  pages à `ui-conformance.test.ts` si elles ont un bandeau.
- **Documentation** : `docs/navigation-arborescence.md`, `docs/features/clans.md` (rôles), `docs/ops/nav-permissions.md`,
  `docs/features/pages-legales.md` (traitement des demandes).

---

## 7. Questions ouvertes

**À trancher avant le lot 1**

- **Q1 — Outils de pipeline retirés aux Owners.** Le lot 1 réserve au SuperUser : état de la télémétrie, erreurs,
  synchronisation manuelle, récupérations, panneau d'exploitation des soirées, actions de la page « État »,
  déclenchement des crons d'un clan (`cron-control`), réordonnancement de la file. Aucun usage par un Owner observé en
  60 jours (§4). D'accord ?
- **Q2 — Référentiels retirés aux Admins** (alias cartes, armes, phases, lieux de carte). Déjà masqués aux Admins dans
  le menu de production. D'accord ?
- **Q3 — Retirés aux Owners** : navigation, email d'envoi (test et configuration), carte « API PUBG ». Les Admins
  gardent un statut en lecture seule pour savoir si les invitations par email marchent. D'accord ?
- **Q9 — Mode visiteur en production.** La documentation dit `DISABLE_AUTH_PERMISSIONS=true` sur le serveur ;
  confirmes-tu ? Les nouvelles gardes ne seront jamais ouvertes par ce mode.
- **Q12 — Routes de débogage** `/api/fix`, `/api/fix2`, ancien PUT `settings/login-welcome` : suppression au lot 1
  (recommandé) ou simple garde SuperUser ?
- **Q14 — Utilisateur lié à plusieurs membres** : l'accès à un clan se juge sur le membre **actif** de la session (comme
  aujourd'hui) ou sur n'importe lequel de ses membres liés dans ce clan ?

**À trancher avant les lots 2 et 3**

- **Q4 — Partage Admin / Owner dans Mon clan.** La base réserve aujourd'hui « Joueurs et rôles », « Accueil login » et
  « Tournois » à l'Owner ; les API les ouvrent à l'Admin. Proposition au §5.1 (6). Aucun Admin n'est attribué en
  production aujourd'hui.
- **Q5 — « Adversaires rencontrés » dans les stats du clan** : visible par qui (Admin, membres du clan, visiteurs) ? La
  page nomme des joueurs extérieurs au site.
- **Q6 — Moderator.** Ses permissions ne sont vérifiées nulle part et il a moins de droits qu'un Member ; aucun n'est
  attribué. Supprimer le rôle (proposition) ou lui créer un espace (lequel : demandes, défis, annonces Discord) ?
- **Q7 — Défis et rapports.** `clan.challenges` est masqué en production ; les rapports sont abandonnés. Les défis
  rejoignent-ils « Compétition » ou restent-ils masqués ? On supprime définitivement `clan.reports` ?
- **Q8 — APIs de lecture des clans en rôle `none`** : publiques et inter-clans même hors mode visiteur. On les garde
  ainsi (cohérent avec le mode visiteur) ou on les limite aux membres du clan quand l'authentification est active ?
- **Q10 — Journal des actions d'administration** : une table qui enregistre qui a fait quoi (migration Prisma), et la
  correction de `triggeredBy` (membre ou compte, mais pas les deux) ? Au lot 1 ou plus tard ?
- **Q11 — `/settings/admin`, `/settings/owner`, `/members/add`** : leur adresse ne porte pas le clan, une redirection de
  `next.config.ts` ne peut pas le deviner. Une petite page serveur qui lit la session et redirige vers le clan du
  membre actif te convient-elle ?
- **Q13 — Recalcul « tous les clans »** : on le garde dans l'interface SuperUser sous forme de tâche du worker (au lieu
  d'une requête HTTP qui boucle sur tous les clans), ou on le réserve à la ligne de commande ?
- **Q15 — Ajouter un joueur depuis Mon clan** : uniquement dans le clan de l'adresse ; faire suivre un nouveau clan
  PUBG reste au SuperUser. D'accord ?
- **Q16 — `GET /api/members`** renvoie les membres de tous les clans à toute session connectée : voulu ?
- **Q17 — Santé des données pour l'Owner** : rien, lecture seule, ou lecture seule + demande de resynchronisation
  plafonnée (proposition) ? Quel plafond ?
