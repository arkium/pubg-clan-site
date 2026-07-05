# TODO — Refonte de la page /settings/cron (pilotage cron SuperUser)

Créé le 2026-06-28. Décisions arrêtées le 2026-06-28. **Étapes 1–3 livrées le 2026-06-28.**

**Mise à jour 2026-07-05** (suite au déploiement prod réel) : bug de résolution des lock files en build `standalone` trouvé et corrigé, avec garde-fou de config ajouté pour qu'il ne puisse plus réapparaître silencieusement ; 2 des 3 chemins manuels synchrones migrés vers la file `telemetry_live_sync` (le 3ᵉ, à 1 seul match, reste volontairement synchrone) ; widget de suivi temps réel ajouté au mode "Direct Sync" ; badge "Télémétrie expirée (PUBG)" ajouté sur la carte match de la page session **et** sur la page recoveries pour les 404 dus à la rétention ~14-15 jours de l'API PUBG (détection partagée via `telemetry-error-presentation.ts`) ; reste la classification backend (`errorCode` dédié + exclusion backlog + correction des compteurs résumé) — voir "Suggestions futures" pour le détail complet.

---

## Contexte

Les cron jobs sont **globaux** : chaque job (`daily_sync`, `daily_stats_recalc`, etc.) itère sur tous les clans actifs en base. La route `/clans/[clanId]/settings/cron` est donc un filtre de vue, pas une page de pilotage d'un cron dédié à un clan.

La page `/settings/cron` existait déjà mais n'était qu'une page de redirection vers `/clans/[clanId]/settings/cron`. Elle doit devenir la vraie page de pilotage global, réservée au SuperUser (cohérent avec TODO2 — le SuperUser est le seul à gérer les opérations cross-clan).

---

## Décisions arrêtées

| Point | Décision |
|---|---|
| Route principale | `/settings/cron` — vraie page de pilotage (plus une redirection) |
| Route à supprimer | `/clans/[clanId]/settings/cron/page.tsx` — supprimée |
| Accès | SuperUser uniquement (plus Owner) — cohérent avec l'architecture globale des crons |
| API backend | Inchangée : `GET/POST /api/clans/[clanId]/cron-control` reste pour les actions manuelles (avec le clan actif du SuperUser) |
| Modification des schedules | Étape optionnelle (voir Étape 4) — priorité basse |

---

## Architecture des workers — clarification

Il existe **trois pipelines distincts**, tous indépendants :

| Pipeline | Script | Mécanisme | Actions `CronExecution` |
|---|---|---|---|
| Cron scheduler | `cron-jobs.ts` (dans Next.js) | `node-cron`, schedulé | `daily_sync`, `daily_stats_recalc`, `daily_lifetime_stats_sync`, `daily_season_stats_sync`, `weekly_report_auto`, `monthly_report_auto` |
| Worker télémétrie | `npm run telemetry:worker` | Boucle infinie, poll 2s | `telemetry_resync_file` |
| Worker agrégats | `npm run telemetry:aggregates:worker` | Boucle infinie, poll 3s | `telemetry_recalc_aggregates` |

**Lien cron → télémétrie :** le job `daily_sync` exécute la télémétrie **en-process directement** (pas via les workers) :
```
daily_sync
  ├── syncTelemetryBatchForRecentSquadMatches()        ← télécharge + parse live
  └── recalculateTelemetryPeriodAggregatesForClan()    ← si parsed > 0
```
Les workers servent au **backfill/resync de fichiers capturés** — pipeline déclenché manuellement. Ils partagent la table `CronExecution` mais via des `action` différentes.

**Statut workers aujourd'hui :** aucune exposition API. Les métriques du `WorkerHealthMonitor` (jobs traités, taux d'échec, mémoire, `lastJobAt`) restent en mémoire locale et meurent avec le process. Par contre :
- Les lock fichiers (`.telemetry-resync-worker.lock`, `.telemetry-aggregate-worker.lock`) contiennent `workerId`, `pid`, `acquiredAt` — lisibles depuis l'API si même machine/FS
- La queue est interrogeable directement en base via les rows `CronExecution` avec `action = 'telemetry_resync_file'` / `'telemetry_recalc_aggregates'`

**Stratégie retenue pour le statut workers (sans modifier les scripts) :**
- Lire les lock fichiers depuis l'API → PID vivant ? âge du lock ?
- Lire la queue en base → `queued`, `running`, `success`, `failed` par type de worker
- Afficher la dernière exécution (`lastJobAt` déduit du dernier `CronExecution` en `success`)

### ⚠️ Bug de production découvert et corrigé — 2026-07-05

**Symptôme :** en prod (build `standalone` + systemd), les panneaux `telemetry:worker` et `telemetry:aggregates:worker` de `/settings/cron` affichaient en permanence "Inactif" (PID `-`, "Lock depuis" `-`) alors que les deux services systemd tournaient correctement (confirmé via `systemctl status` + logs `single-instance lock acquired`).

**Cause racine :** le `server.js` généré par Next.js en sortie `standalone` exécute `process.chdir(__dirname)` au démarrage (`node_modules/next/dist/build/utils.js:1085`), où `__dirname` = `<projet>/.next/standalone`. `src/app/api/settings/cron-workers-status/route.ts` résolvait le chemin des fichiers de lock via `join(process.cwd(), filename)` — donc, une fois le web/cron worker démarré, il cherchait `.next/standalone/.telemetry-*.lock` au lieu de `<projet>/.telemetry-*.lock`, là où les workers télémétrie (process séparés, jamais chdir'd) écrivent réellement. Résultat : `ENOENT` → `lock = null` → badge "Inactif", indépendamment de l'état réel des workers.

**Correctif appliqué :**
- `src/app/api/settings/cron-workers-status/route.ts` : résolution du chemin de lock via les mêmes variables d'environnement que les workers (`TELEMETRY_RESYNC_WORKER_LOCK_FILE`, `TELEMETRY_AGGREGATE_WORKER_LOCK_FILE`), avec passage direct si la valeur est un chemin absolu — n'utilise plus `process.cwd()` du process web comme ancre.
- `docs/ops/deployment.md` : les deux variables doivent désormais être définies en **chemin absolu** dans le `.env` partagé de production (ex. `/home/smk/apps/pubg-clan-site/.telemetry-resync-worker.lock`), identique pour le process web/cron et les deux workers.

**Portée :** ce bug affecte **toute** l'Étape 2c ("Statut workers ✅ Résolu" ci-dessus) dans une build `standalone` — le panneau était livré et fonctionnel en `npm run dev` (pas de `chdir`), mais silencieusement cassé en production packagée. À vérifier après toute nouvelle installation prod tant qu'aucun check de config n'alerte dessus (voir suggestion ci-dessous).

---

## État actuel — lacunes identifiées

### Données disponibles dans l'API mais non affichées ✅ Résolu

| Donnée | État après livraison |
|---|---|
| Dernière exécution des 13 actions | ✅ Tableau complet avec toutes les `KNOWN_ACTIONS` |
| Métriques détaillées d'exécution (`details`) | ✅ Lignes expandables dans l'historique |
| Bouton `sync_stats` | ✅ Ajouté avec descriptif |
| Bouton `sync_telemetry_aggregates` | ✅ Ajouté avec descriptif |
| Statut workers télémétrie | ✅ Endpoint `GET /api/settings/cron-workers-status` + 3 panneaux |
| Stats queue telemetry (queued/running/failed) | ✅ Affiché dans les panneaux workers |

### Incohérences ✅ Résolues

- `type CronAction` complet : 6 actions incluant `sync_stats` et `sync_telemetry_aggregates`
- Checks de config partitionnés en 3 groupes (Système & API, Télémétrie, Schedules)
- Expressions cron dans leur propre groupe avec description FR en évidence
- Section statique supprimée
- Historique paginé 10 lignes + filtres Action/Statut + `take: 200` côté API

---

## Structure cible de la page `/settings/cron`

```
┌─────────────────────────────────────────────────────┐
│  En-tête : titre + badge cron worker + badges       │
│            erreurs/warnings config                  │
├─────────────────────────────────────────────────────┤
│  Cards métriques (4) :                              │
│  Taux succès | Total récent | En cours | Échecs     │
├─────────────────────────────────────────────────────┤
│  Statut des workers (3 panneaux côte à côte)        │
│  ┌──────────────────┐ ┌──────────────┐ ┌─────────┐ │
│  │ Cron scheduler   │ │telemetry:    │ │aggreg.: │ │
│  │ (Next.js)        │ │worker        │ │worker   │ │
│  │ initialized: oui │ │PID: 1234     │ │PID: -   │ │
│  │ jobs activés: oui│ │lock âge: 2m  │ │inactif  │ │
│  │                  │ │queue: 3/0/0  │ │queue:0/ │ │
│  └──────────────────┘ └──────────────┘ └─────────┘ │
├─────────────────────────────────────────────────────┤
│  Tableau "Dernière exécution par action"            │
│  Source : latestByAction — une ligne par action     │
│  Colonnes : Action | Statut | Début | Durée | Source│
│  (pas de pagination — 13 actions max, statique)     │
├─────────────────────────────────────────────────────┤
│  Actions manuelles (6 boutons) :                    │
│  sync_matches | sync_stats | sync_telemetry_agg     │
│  sync_lifetime_stats | rapport hebdo | rapport mensuel│
├─────────────────────────────────────────────────────┤
│  Configuration — 3 groupes (accordéons ou onglets) :│
│    • Système & API (NODE_ENV, DATABASE_URL, …)      │
│    • Télémétrie (ENABLE_TELEMETRY_*, …)             │
│    • Schedules cron (expressions + description FR)  │
│  + Rate limit PUBG API (snapshot)                   │
├─────────────────────────────────────────────────────┤
│  Historique — pagination 10 lignes + filtres        │
│  Filtres : Action (select) | Statut (select)        │
│  Colonnes : Action | Statut | Début | Durée |       │
│             Source | Message                        │
│  Ligne expandable → details JSON                    │
│    (importedMatches, telemetrySync.parsed/failed,   │
│     membersTotal, seasonRefreshed, masteryRefreshed)│
└─────────────────────────────────────────────────────┘
```

---

## Étapes d'implémentation

### Étape 1 — Supprimer la route par clan ✅ Livré

- [x] Supprimer `src/app/clans/[clanId]/settings/cron/page.tsx`
- [x] Dans `src/lib/nav-permissions-registry.ts` : entrée `owner.cron` supprimée, entrée `superuser.cron → /settings/cron` créée
- [x] Dans `src/app/settings/cron/page.tsx` : logique de redirection supprimée, remplacée par la vraie page

### Étape 2 — Réécrire `/settings/cron/page.tsx` ✅ Livré

**2a. En-tête**
- [x] Titre "Ops Cron (global)"
- [x] Badge statut cron worker
- [x] Badges erreurs/warnings de la config
- [x] Indicateur du clan actif (#id)

**2b. 4 cards métriques**
- [x] Taux de succès récent, exécutions récentes, en cours, échecs récents

**2c. Statut des workers — 3 panneaux**
- [x] Chapeau explicatif sur les 3 processus indépendants
- [x] Endpoint `GET /api/settings/cron-workers-status` créé (`src/app/api/settings/cron-workers-status/route.ts`)
  - [x] Lecture `.telemetry-resync-worker.lock` (pid, acquiredAt, PID vivant)
  - [x] Lecture `.telemetry-aggregate-worker.lock`
  - [x] Stats queue via `getTelemetryResyncQueueStats()` et `getTelemetryAggregateRecalcQueueStats()`
- [x] `getTelemetryAggregateRecalcQueueStats()` créée dans `aggregate-recalc-queue.ts`
- [x] 3 panneaux affichant : badge vivant/inactif, âge du lock, queued/running/failed/terminés

**2d. Tableau "Dernière exécution par action"**
- [x] Chapeau explicatif (scheduler vs manuel)
- [x] 13 actions affichées via `KNOWN_ACTIONS`, ligne vide si aucune exécution
- [x] Colonnes : Action | Statut | Début | Durée | Source

**2e. Actions manuelles — 6 boutons**
- [x] 6 boutons : sync_matches, sync_stats, sync_telemetry_aggregates, sync_lifetime_stats, rapport hebdo, rapport mensuel
- [x] Descriptif fonctionnel sous chaque bouton
- [x] Type `CronAction` complet

**2f. Configuration — 3 groupes**
- [x] Chapeau explicatif error vs warning
- [x] Groupe "Système & API" (clés hors `telemetry_*` et `_cron`)
- [x] Groupe "Télémétrie" (clés `telemetry_*`)
- [x] Groupe "Schedules cron" (clés `*_cron`)
- [x] Rate limit PUBG API dans panneau séparé

**2g. Historique — pagination + filtres**
- [x] Chapeau explicatif (scheduler + manuel + workers)
- [x] Pagination 10 lignes par page (précédent/suivant + numéro)
- [x] Filtre Action (`<select>` dynamique sur les actions distinctes)
- [x] Filtre Statut (running/success/partial/failed)
- [x] Réinitialisation des filtres + compteur de résultats
- [x] Lignes expandables (chevron) pour afficher `details` (importedMatches, telemetrySync, membersTotal, etc.)
- [x] `getCronOverview` modifié pour accepter `take` — route passe `take: 200`

### Étape 3 — Protéger la route côté auth ✅ Livré

- [x] `src/app/settings/cron/page.tsx` : vérification `isSuperUser` — redirect `/` si non SuperUser, redirect `/login` si non authentifié
- [x] Clan actif manquant → message d'erreur explicite avec lien vers `/clans`
- [x] `src/app/api/settings/cron-workers-status/route.ts` : protégé par `isSuperUserSession`
- [x] `src/lib/nav-permissions-registry.ts` : entrée `owner.cron` supprimée, `superuser.cron` créée

### Étape 4 — Modification des fréquences depuis l'UI ✅ Livré

Aujourd'hui les expressions cron sont lues depuis `process.env` au démarrage — impossible à changer sans redémarrer le serveur.

**Hors périmètre :** cette étape ne concerne que les 9 `ScheduledTask` de `cron-jobs.ts` (le scheduler `node-cron` intégré à Next.js). Les deux workers télémétrie (`telemetry:worker`, `telemetry:aggregates:worker`) sont des process Node.js séparés qui tournent en boucle infinie avec un délai de polling fixe (`TELEMETRY_RESYNC_WORKER_POLL_MS`, etc.), pas une expression cron — ils ne sont donc pas concernés par cette étape et ne le seront pas. Le seul lien entre les deux : le job cron `daily_sync` peut déclencher une synchronisation télémétrie **en-process** (si `TELEMETRY_SYNC_ENABLED=true`), indépendamment des workers.

**4a. Inventaire complet des schedules concernés**

L'exemple initial ne montrait que 2 clés (`daily_sync`, `daily_stats_recalc`) à titre illustratif. `src/lib/cron-jobs.ts` déclare en réalité **9 `ScheduledTask`**, à couvrir intégralement :

| Clé `CronSchedule` | `ScheduledTask` (`globalForCron`) | Env var actuelle | Défaut | Action `CronExecution` associée |
|---|---|---|---|---|
| `daily_sync` | `clanSyncCronTask` | `CLAN_MATCH_SYNC_CRON` | `0 2 * * *` | `daily_sync` |
| `daily_stats_recalc` | `statsRecalcCronTask` | `CLAN_STATS_RECALC_CRON` | `0 3 * * *` | `daily_stats_recalc` |
| `daily_lifetime_stats_sync` | `lifetimeStatsSyncCronTask` | `CLAN_LIFETIME_STATS_SYNC_CRON` | `0 4 * * *` | `daily_lifetime_stats_sync` |
| `daily_season_stats_sync` | `seasonStatsSyncCronTask` | `CLAN_SEASON_STATS_SYNC_CRON` | `0 5 * * *` | `daily_season_stats_sync` |
| `clan_online_reminder` | `clanReminderCronTask` | `CLAN_ONLINE_REMINDER_CRON` | `0 18 * * *` | *(aucune — notification pure, n'apparaît pas dans le tableau "Dernière exécution par action")* |
| `weekly_report_reminder` | `reportReminderCronTask` | `WEEKLY_REPORT_REMINDER_CRON` | `0 9 * * *` | *(aucune — idem)* |
| `weekly_report_auto` | `weeklyReportCronTask` | `WEEKLY_REPORT_GENERATION_CRON` | `0 8 * * 1` | `weekly_report_auto` |
| `monthly_report_auto` | `monthlyReportCronTask` | `MONTHLY_REPORT_GENERATION_CRON` | `0 8 1 * *` | `monthly_report_auto` |
| `challenge_processing` | `challengeProcessingCronTask` | **aucune — hardcodé `'0 0 * * *'`** | `0 0 * * *` | *(listée dans `KNOWN_ACTIONS` mais jamais écrite — voir ci-dessous)* |

Points à ne pas oublier :
- `challenge_processing` n'a **pas d'env var aujourd'hui** (contrairement aux 8 autres) — il faut d'abord introduire `CHALLENGE_PROCESSING_CRON` (avec fallback `'0 0 * * *'`) avant de pouvoir le rendre pilotable, sinon il n'y a pas de valeur "par défaut" cohérente à afficher/restaurer.
- **Bug pré-existant découvert en relecture :** `processChallenges()` (`cron-jobs.ts:1056-1129`) ne fait jamais `startCronExecution`/`finishCronExecution`, contrairement aux 6 autres jobs qui écrivent bien dans `CronExecution` (vérifié : `daily_sync`, `daily_stats_recalc`, `daily_lifetime_stats_sync`, `daily_season_stats_sync`, `weekly_report_auto`, `monthly_report_auto`). Or `challenge_processing` figure dans `KNOWN_ACTIONS` (`page.tsx:116`) — la ligne correspondante dans le tableau "Dernière exécution par action" (Étape 2d) affiche donc toujours "jamais exécuté", même si le job tourne bien chaque nuit. Indépendant de l'Étape 4, mais à corriger en même temps (ajouter le couple `startCronExecution`/`finishCronExecution` dans `processChallenges()`) pour que le schedule devienne réellement observable une fois éditable — sinon aucun moyen de vérifier qu'un changement de fréquence a été pris en compte.
- `clan_online_reminder` et `weekly_report_reminder` n'écrivent jamais de ligne `CronExecution` : ils sont absents de `KNOWN_ACTIONS` et du tableau "Dernière exécution par action" (Étape 2d). Il faut donc les ajouter explicitement à la section Schedules (2f) même s'ils ne concernent que l'affichage des fréquences, pas l'historique.
- Toutes les tâches partagent aujourd'hui le même fuseau `DAILY_SYNC_TIMEZONE` (dérivé de `CLAN_MATCH_SYNC_TIMEZONE`). Le modèle `CronSchedule` prévoit un champ `timezone` par ligne, mais pour la V1 il est recommandé de **ne pas** l'exposer dans l'UI (garder un fuseau global unique) afin de ne pas complexifier la validation — à documenter comme limitation volontaire.

**4b. Migration Prisma**
- [x] Créer la table `CronSchedule` (identique au modèle proposé) — appliquée directement sur la base distante via un diff SQL scopé (`prisma migrate diff` schéma-à-schéma) + `prisma migrate resolve --applied`, pour éviter le `prisma migrate dev`/`db push` qui proposait de reset la base à cause d'un drift préexistant sans rapport (colonnes `SquadMatchTelemetry`, `UserAccount.avatarUrl`)
- [x] Migration trackée : `prisma/migrations/20260705120000_add_cron_schedule/`
- [x] Pas de seed initial : la table démarre vide, fallback `.env`/défaut actif tant qu'aucune ligne n'existe

**`src/lib/cron-jobs.ts` — refonte**
- [x] Registre `CRON_SCHEDULE_DEFINITIONS` (clé → `{ envVar, defaultExpression, globalKey, run }`) couvrant les 9 entrées, y compris `CHALLENGE_PROCESSING_CRON` (ajoutée à `.env.example`)
- [x] `initCronJobs()` async : `prisma.cronSchedule.findMany()` au bootstrap, Map clé → expression effective (DB > env > défaut). Le flag `clanSyncCronInitialized` est posé **avant** le premier `await` pour éviter une double-init en cas d'appel concurrent
- [x] `rescheduleJob(key, newExpression)` exportée
- [x] `getEffectiveCronSchedules()` exportée
- [x] `src/app/api/internal/cron/bootstrap/route.ts` : `await initCronJobs()`

**API**
- [x] `GET /api/settings/cron-schedules` (`isSuperUserSession`) : retourne `getEffectiveCronSchedules()`
- [x] `PUT /api/settings/cron-schedules` : valide via `cron.validate()` (node-cron), upsert `CronSchedule`, appelle `rescheduleJob`
- [x] `DELETE /api/settings/cron-schedules/[key]` : supprime la ligne DB, reschedule sur la valeur par défaut recalculée

**UI**
- [x] Section "Schedules cron" dans `/settings/cron` (remplace l'ancien `CheckGroupTable` statique) : tableau des 9 clés, badge source, champ + bouton Appliquer/Réinitialiser, feedback par ligne
- [x] Validation client basique (5 segments) avant envoi

**Bug pré-existant corrigé au passage**
- [x] `processChallenges()` boucle maintenant sur les clans actifs et écrit une ligne `CronExecution` (`action: challenge_processing`) par clan, avec `details: { refreshed, endedCount, activatedCount }` — la ligne "Dernière exécution par action" est désormais renseignée pour ce job

**Limite connue (documentée, non bloquante)**
- [x] `rescheduleJob` n'affecte que le process ayant reçu la requête `PUT` — documenté dans `docs/ops/cron.md` (section "Schedules éditables")

---

## Fichiers impactés

| Fichier | Action | État |
|---|---|---|
| `src/app/clans/[clanId]/settings/cron/page.tsx` | Supprimer | ✅ Supprimé |
| `src/app/settings/cron/page.tsx` | Réécrire (vraie page SuperUser) | ✅ Livré |
| `src/lib/nav-permissions-registry.ts` | `owner.cron` supprimé, `superuser.cron` ajouté | ✅ Livré |
| `src/app/api/clans/[clanId]/cron-control/route.ts` | `take: 200` dans `getCronOverview` | ✅ Livré |
| `src/app/api/settings/cron-workers-status/route.ts` | Créer (lock fichiers + stats queue) | ✅ Créé |
| `src/lib/cron-observability.ts` | `getCronOverview` accepte `take` | ✅ Livré |
| `src/lib/pubg-telemetry/aggregate-recalc-queue.ts` | Ajout `getTelemetryAggregateRecalcQueueStats` | ✅ Livré |
| `src/lib/cron-jobs.ts` | Registre des 9 schedules, `initCronJobs` async, `rescheduleJob`, `getEffectiveCronSchedules`, fix `processChallenges`, `runTelemetryBatchForClan` → enqueue `telemetry_live_sync` | ✅ Livré |
| `prisma/schema.prisma` + migration `20260705120000_add_cron_schedule` | Modèle `CronSchedule` | ✅ Livré |
| `src/app/api/internal/cron/bootstrap/route.ts` | `await initCronJobs()` | ✅ Livré |
| `.env.example` | Ajout `CHALLENGE_PROCESSING_CRON` | ✅ Livré |
| `src/app/api/settings/cron-schedules/route.ts` | Créé (`GET`/`PUT`) | ✅ Livré |
| `src/app/api/settings/cron-schedules/[key]/route.ts` | Créé (`DELETE`) | ✅ Livré |
| `src/app/settings/cron/page.tsx` | Section Schedules éditable (`ScheduleEditorTable`), panneau worker enrichi (`telemetry_live_sync`) | ✅ Livré |
| `src/lib/pubg-telemetry/live-sync-queue.ts` | Créé — file `telemetry_live_sync` | ✅ Livré |
| `scripts/telemetry-resync-worker.ts` | Second claim-loop `telemetry_live_sync` (même process/lock) | ✅ Livré |
| `src/app/api/settings/cron-workers-status/route.ts` | Ajout stats `telemetry_live_sync` | ✅ Livré |
| `docs/ops/cron.md` | Section "Schedules éditables", limite multi-instances, variables, bloc "risque résolu" | ✅ Livré |
| `src/app/api/settings/cron-workers-status/route.ts` | Fix résolution lock path en mode standalone (`process.cwd()` invalide après `chdir`) → résolution via `TELEMETRY_*_LOCK_FILE` | ✅ Livré (2026-07-05) |
| `docs/ops/deployment.md` | Doc systemd réelle (4 services), variables lock path en chemin absolu, mécanisme bootstrap cron réel | ✅ Livré (2026-07-05) |
| `src/lib/pubg-telemetry/manual-sync.ts` | Ajout `enqueueTelemetryForSelectedSquadMatches` | ✅ Livré (2026-07-05) |
| `src/app/api/clans/[clanId]/telemetry/sync-selected-enqueue/route.ts` | Créé | ✅ Livré (2026-07-05) |
| `src/app/clans/[clanId]/telemetry/matches/session/[date]/page.tsx` | Bouton "Direct Sync" migré vers `sync-selected-enqueue` (non-bloquant) | ✅ Livré (2026-07-05) |

---

## Suggestions futures (non planifiées)

### Découpler la télémétrie de `daily_sync` — nouvelle file "live sync", 100% stream, aucun fichier sur disque ✅ Livré

**Problème :** quand `TELEMETRY_SYNC_ENABLED=true`, `daily_sync` télécharge et parse la télémétrie **en-process** (`syncTelemetryBatchForRecentSquadMatches` puis `recalculateTelemetryPeriodAggregatesForClan`, dans `cron-jobs.ts`), sur le même thread que le serveur HTTP Next.js — pas d'offload `worker_thread`. Le parseur streaming (`parser.ts`) traite chaque chunk réseau de façon synchrone/CPU-bound ; entre deux chunks il rend la main, mais pendant le traitement d'un chunk les autres requêtes du site attendent. Détail dans `docs/ops/cron.md` (section "Bonnes pratiques d'exploitation").

**⚠️ Piste écartée — ne pas router via la queue `telemetry_resync_file` existante.** Cette queue (`enqueueTelemetryResyncJobs` + `telemetry:worker`) ne fait *pas* de téléchargement live : elle rejoue un fichier déjà capturé sur disque (`resyncTelemetryFromCapturedFile`, `src/lib/pubg-telemetry/resync-files.ts`). Si le fichier n'existe pas dans `TELEMETRY_CAPTURE_FIXTURES_DIR`, le job échoue (`status: 'missing'`). Or `TELEMETRY_CAPTURE_FIXTURES` est à `false` par défaut et explicitement "réservé au développement, ne pas activer en production" (`.env.example:111-114`). Router `daily_sync` vers cette queue ferait donc échouer tous les jobs en prod — et l'activer reviendrait à écrire un fichier JSON par match sur disque, ce qu'on veut justement éviter (volume élevé de matchs importés quotidiennement).

**Le chemin qui reste 100% stream (à préserver tel quel) :** `syncTelemetryForSquadMatch` (`src/lib/pubg-telemetry/index.ts:114-190`) — déjà utilisé aujourd'hui par `daily_sync`. `downloadTelemetryFromAsset()` renvoie un `ReadableStream` branché directement sur `parseTelemetrySnapshotFromStream()` : aucune écriture disque, la capture fixture n'est qu'un effet de bord optionnel (`.tee()`) totalement absent de ce chemin. **Ce code ne doit pas changer** — seul son lieu d'exécution doit bouger.

**Proposition :** créer une file **distincte** de la resync-fichier, dédiée au live-sync, et faire exécuter ce même code stream par le worker déjà existant (process séparé, déjà monitoré mémoire/backpressure — cf. mémoire "Phase 2 memory protection complete") au lieu du process Next.js.

- [x] Nouveau module `src/lib/pubg-telemetry/live-sync-queue.ts`, action dédiée `telemetry_live_sync`, `details: { squadMatchId, pubgMatchId, anyPlayerId, shard }`
- [x] `runTelemetryBatchForClan` (`cron-jobs.ts`) : `listSquadMatchesNeedingTelemetry(...)` puis `enqueueTelemetryLiveSyncJobs({ clanId, matches })` — plus d'appel à `syncTelemetryBatchForRecentSquadMatches`
- [x] `scripts/telemetry-resync-worker.ts` : second claim (`processOneLiveSyncJob`) dans la **même** boucle/process, appelant directement `syncTelemetryForSquadMatch`
- [x] Chaînage du recalcul d'agrégats (`enqueueTelemetryAggregateRecalcJob`) sur succès, sans condition (pas de flag `recalculateAggregates` — toujours vrai pour ce chemin)
- [x] `runTelemetryAggregateRefreshForClan` supprimée (et son appel dans `runDailyClanSync`, y compris les champs `telemetryAggregateSync` dans les 4 `details` de `finishCronExecution`)
- [x] Résumé `daily_sync` : `TelemetryCronSyncSummary` remplacé par `{ scanned, queuedCount, alreadyQueuedCount, skippedNoAccount }`
- [x] `TELEMETRY_SYNC_ENABLED` gate désormais une mise en queue rapide plutôt qu'une exécution bloquante
- [x] Dashboard `/settings/cron` : `telemetry_live_sync` ajouté aux stats du panneau `telemetry:worker` (même process/lock que `telemetry_resync_file`, donc pas un panneau séparé)

**Décisions confirmées avec l'utilisateur avant implémentation (remplacent les questions ouvertes ci-dessous) :**
- **Retry** : quotidien simple — un job en échec reste `failed`, le prochain `daily_sync` relit le backlog `SquadMatchTelemetry` et ré-enfile si toujours éligible. Pas de retry+backoff répliqué dans le worker.
- **Priorisation** : FIFO simple (`orderBy startedAt asc`, comme `telemetry_resync_file`). Pas de priorisation `failed > pending > rebuild` répliquée à l'enfilement.
- **Résolution du membre candidat** : déplacée à l'enfilement, dans `runTelemetryBatchForClan` — si aucun membre avec `pubgAccountId`, `upsertFailedTelemetrySnapshot` est appelé immédiatement et le match n'est pas mis en queue.
- **Parallélisme** : pas de nouvelle variable dédiée — le worker traite un job à la fois, en alternant `telemetry_resync_file` puis `telemetry_live_sync` dans la même boucle séquentielle (gouvernée par le même verrou single-instance). `TELEMETRY_SYNC_CONCURRENCY` devient sans effet sur ce chemin (documenté dans `docs/ops/cron.md`).

**Effet :** `daily_sync` ne fait plus aucun appel réseau ni parsing CPU-bound — uniquement des lectures/écritures Prisma courtes (quelques ms), bornées par `TELEMETRY_MAX_MATCHES_PER_RUN`. Le téléchargement+parsing reste **100% stream, zéro fichier sur disque**, exactement comme aujourd'hui — seul le process qui l'exécute change.

**Piste secondaire — le 3ᵉ chemin manuel synchrone — ✅ Livré le 2026-07-05 (2 points d'entrée sur 3 migrés, 1 laissé volontairement)**

`syncTelemetryForSelectedSquadMatches` (`src/lib/pubg-telemetry/manual-sync.ts`) était appelé en synchrone (pas de queue, bloquant le thread Next.js le temps du traitement) depuis **3 points d'entrée** différents. Les deux qui acceptaient un batch de taille arbitraire ont été migrés vers la file `telemetry_live_sync` — sans dupliquer la file existante :

- [x] Nouvelle fonction `enqueueTelemetryForSelectedSquadMatches` (`manual-sync.ts`) — résout les matchs sélectionnés (compte PUBG + shard) et appelle `enqueueTelemetryLiveSyncJobs` (même file que `daily_sync`)
- [x] Nouvelle route `POST /api/clans/[clanId]/telemetry/sync-selected-enqueue` (+ `GET` pour le suivi, voir section suivante)
- [x] Bouton "Direct Sync" de `/clans/[clanId]/telemetry/matches/session/[date]` migré vers cette route — retour immédiat, traitement asynchrone par `telemetry-resync-worker.ts` (claim `telemetry_live_sync`, déjà actif en prod)
- [x] Mode "Direct Sync" de `sync-batch-manual/page.tsx` (outil de dev, batch arbitraire) migré vers la même route — c'était le point d'entrée à risque réel identifié dans le tableau ci-dessous

**Reste synchrone (décision volontaire, pas un oubli) :**

| Fichier | Usage | Risque |
|---|---|---|
| `src/app/clans/[clanId]/telemetry/matches/[matchId]/telemetry/page.tsx` | Bouton resync **1 seul match** (`squadMatchIds: [matchId]`) | Faible — pas de raison de migrer |
| `src/app/clans/[clanId]/matches/[matchId]/telemetry/page.tsx` | Idem, 1 seul match | Faible |

- [ ] Vérifier au passage si la fonctionnalité de capture fixture (`fetchTelemetryFilesForSelectedSquadMatches`, effet de bord `.tee()`) reste nécessaire sur les chemins restants ou si elle peut être découplée

### Garde-fou config pour le bug de lock path (standalone) — ✅ Livré le 2026-07-05

**Contexte :** le bug décrit plus haut ("Bug de production découvert et corrigé — 2026-07-05") est silencieux : si `TELEMETRY_RESYNC_WORKER_LOCK_FILE`/`TELEMETRY_AGGREGATE_WORKER_LOCK_FILE` ne sont pas définis en chemin absolu sur une nouvelle installation `standalone`, le dashboard affichera de nouveau "Inactif" sans qu'aucune erreur n'apparaisse dans les logs — seul un rapprochement manuel avec `systemctl status` permet de le détecter (c'est ainsi qu'il a été trouvé).

- [x] Nouveau check dans `getCronConfigurationChecks()` (`src/lib/cron-observability.ts`, groupe "Télémétrie") : détecte le mode standalone via `process.cwd()` se terminant par `.next/standalone`, passe en `error` si l'une des deux variables n'est pas un chemin absolu dans ce contexte, avec message pointant vers `docs/ops/deployment.md`

### Feedback temps réel pour le mode "Direct Sync" — ✅ Livré le 2026-07-05

**Contexte :** le mode "Queue Resync" affiche un petit widget de suivi en direct (`queueLiveStatus`, poll 5s sur `getTelemetryResyncQueueStats`). Le mode "Direct Sync" n'avait aucun suivi équivalent après le clic.

- [x] `GET /api/clans/[clanId]/telemetry/sync-selected-enqueue` — expose `getTelemetryLiveSyncQueueStats({ clanId })` + les 20 derniers jobs `telemetry_live_sync`
- [x] Widget de suivi en direct ajouté au panneau "Direct Sync" (`directQueueLiveStatus`, poll 5s, même présentation que le widget Queue Resync)

### Classifier les 404 "données PUBG expirées" — ne pas les traiter comme un échec applicatif

**Contexte :** l'API PUBG (matchs comme assets de télémétrie CDN) ne conserve les données que ~14-15 jours. Passé ce délai, un `GET /shards/{shard}/matches/{id}` (ou le téléchargement de l'asset télémétrie) répond 404 — de façon définitive, ce match ne redeviendra jamais disponible.

**Exemple réel observé (2026-07-05) :**

| Champ | Valeur |
|---|---|
| Match | `da088b74-6b79-4123-a2e7-8a73aff2768e` (Squad TPP #2, Chimera_Main) |
| Créé le | 14/06/2026 22:21:55 (~21 jours avant la dernière tentative) |
| Dernière tentative | 05/07/2026 18:01:27 |
| `errorCode` | `TELEMETRY_SYNC_FAILED` (générique) |
| `errorMessage` | `[PUBG] API request failed (404) GET /shards/steam/matches/da088b74-6b79-4123-a2e7-8a73aff2768e` |
| Statut affiché | `failed` — indiscernable d'un vrai bug à corriger |

**Ce qui existe déjà (pas un bug bloquant) :** le système ne boucle pas indéfiniment dessus :
- `listSquadMatchesNeedingTelemetry()` (`src/lib/pubg-telemetry/backlog.ts`) ne réinclut un match en échec dans le backlog que si `attemptCount < TELEMETRY_RETRY_MAX` (défaut 2, plafonné à 5) — passé ce seuil, le match sort définitivement de la file.
- `isRetryableTelemetryFailure()` (`src/lib/pubg-telemetry/job.ts:155-178`) ne retente immédiatement dans un même run que sur timeout/429/500-504 — un 404 n'y figure pas, donc pas de retry en boucle serrée.

**Le vrai problème :** ce 404 est catégorisé avec le même `errorCode: TELEMETRY_SYNC_FAILED` générique que n'importe quelle autre erreur (`src/lib/pubg-telemetry/index.ts:296-312`, catch-all). Conséquences :
1. **Gaspillage de tentatives** — 2 à 5 appels PUBG API consommés (sur plusieurs runs de cron, potentiellement plusieurs jours) sur un match qu'on sait perdu dès la 1ère réponse 404, alors qu'on pourrait l'exclure immédiatement du backlog.
2. **Bruit dans le suivi** — `/clans/[clanId]/telemetry/recoveries` affiche ce cas exactement comme un échec applicatif à corriger, alors que c'est un état normal et attendu (donnée expirée côté PUBG, rien à réparer côté code).

**Proposition :**

1. Détecter spécifiquement le 404 aux deux points d'échec possibles :
   - `fetchMatchDetailsWithTelemetryAsset()` (`src/lib/pubg.ts`) — le match lui-même n'existe plus côté API PUBG (message contient `/matches/` et `(404)`)
   - `downloadTelemetryFromAsset()` (`src/lib/pubg-telemetry/client.ts:89-91`) — le match existe encore mais l'asset CDN a expiré (message `Telemetry asset download failed (404)`)
2. Leur assigner un `errorCode` dédié (`TELEMETRY_DATA_EXPIRED` par ex.) au lieu du générique `TELEMETRY_SYNC_FAILED`, dans `syncTelemetryForSquadMatch()` (`src/lib/pubg-telemetry/index.ts`).
3. Exclure ce statut de `listSquadMatchesNeedingTelemetry()` (`backlog.ts`) — ne plus le réinclure du tout dans le backlog, même sous le seuil `attemptCount < retryMax` (contrairement à un échec transitoire, il n'y a aucune raison de retenter).
4. Distinguer ce cas dans l'UI (`/clans/[clanId]/telemetry/recoveries` et la page session) — badge neutre ("Donnée PUBG expirée", gris/informatif) plutôt que rouge "Échec", pour ne pas laisser croire à un bug à corriger.

**Pas de migration nécessaire :** `SquadMatchTelemetry.status` et `.errorCode` sont des `String` libres en base (pas d'enum Prisma), donc une nouvelle valeur ne casse rien côté schéma — seulement le code de lecture/affichage à mettre à jour pour la reconnaître.

- [ ] Ajouter la détection 404 dédiée (match + asset) et le nouvel `errorCode` côté backend (`syncTelemetryForSquadMatch`)
- [ ] Exclure ce cas de `listSquadMatchesNeedingTelemetry()` (backlog) définitivement, pas seulement au-delà de `retryMax`
- [ ] Adapter l'affichage `/clans/[clanId]/telemetry/recoveries` (page dédiée, rendu indépendant de `SquadMatchList` — pas encore touchée) pour distinguer "expiré" de "échec réel"
- [ ] Vérifier si des matchs déjà en base sont dans ce cas (requête sur `errorMessage LIKE '%(404)%'`) pour les reclasser rétroactivement plutôt que d'attendre leur prochain passage en backlog
- [ ] Une fois l'`errorCode` dédié livré côté backend, simplifier `isTelemetryDataExpiredError()` (voir ci-dessous) pour ne plus se fier qu'à `errorCode === 'TELEMETRY_DATA_EXPIRED'` (la détection par contenu du message devient alors un simple fallback de compatibilité)

**Volet UI — ✅ Livré le 2026-07-05 (page session + page recoveries)**

En attendant la classification backend, un badge visuel neutre a été ajouté sur les deux surfaces qui affichent les échecs télémétrie :

- [x] `isTelemetryDataExpiredError(errorCode, errorMessage)` extraite dans un module partagé `src/lib/pubg-telemetry/telemetry-error-presentation.ts` (évite la duplication entre les deux pages) — détecte dès aujourd'hui les deux formats de message 404 connus (`/matches/... (404)` et `Telemetry asset download failed (404)`), et reconnaîtra aussi le futur `errorCode: 'TELEMETRY_DATA_EXPIRED'` une fois livré côté backend
- [x] `/clans/[clanId]/telemetry/matches/session/[date]` (`SquadMatchList.tsx`) — badge "Parser KO" (rouge) remplacé par "Télémétrie expirée (PUBG)" (gris, neutre) + bloc d'erreur neutre explicatif quand ce cas est détecté
- [x] `/clans/[clanId]/telemetry/recoveries` (`page.tsx`) — badge de statut de ligne "expiré (PUBG)" (gris) au lieu de "failed" (rouge) + cellule Erreur avec message explicatif neutre, même détection réutilisée

**Reste (backend, hors scope UI) :** les compteurs résumé (`payload.summary.failed`, KPI taux de succès/échec, dashboard observability) comptent toujours ces cas dans "failed" — seule la classification backend (`errorCode` dédié + exclusion du backlog, items ci-dessus) corrigera ça au niveau des chiffres, pas seulement de l'affichage ligne par ligne.

### Purge de l'historique cron

**Contexte :** La table `CronExecution` accumule les entrées de deux types distincts :

- **Entrées scheduler** (`daily_sync`, `sync_matches`, etc.) : ~6 lignes × N clans par jour. Volume très faible, pas de pression sur la DB même après plusieurs mois.
- **Entrées télémétrie** (`telemetry_resync_file`, `telemetry_recalc_aggregates`) : une ligne par fichier téléchargé, accumulation rapide. **Déjà couverte** par le cleanup existant dans le dashboard télémétrie via `POST /api/clans/[clanId]/telemetry/queue-cleanup` (actions `cleanup-stale`, `cleanup-failed`).

**Conclusion :** Un bouton de purge dans `/settings/cron` n'est pas nécessaire en l'état. La pression vient des entrées télémétrie qui ont déjà leur mécanisme.

**Si le besoin évolue, deux pistes :**

1. **Lien rapide vers le dashboard télémétrie** depuis le panneau workers de `/settings/cron` — une ligne de code, évite de naviguer manuellement pour déclencher le cleanup.
2. **Purge automatique des entrées scheduler > 90 jours** — à implémenter comme tâche cron dédiée (`cleanup_old_cron_history`) plutôt que comme bouton UI, pour ne pas exposer une opération destructive dans l'interface. Cible : entrées avec `action NOT IN ('telemetry_resync_file', 'telemetry_recalc_aggregates')` et `finishedAt < NOW() - 90 jours`.

---

## Références

- Architecture cron globale : `src/lib/cron-jobs.ts`
- API de contrôle : `src/app/api/clans/[clanId]/cron-control/route.ts`
- Hiérarchie de rôles : `docs/TODO/TODO2.md`
- Documentation cron ops : `docs/ops/cron.md`
