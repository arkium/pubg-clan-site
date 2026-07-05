# TODO — Refonte de la page /settings/cron (pilotage cron SuperUser)

Créé le 2026-06-28. Décisions arrêtées le 2026-06-28. **Étapes 1–3 livrées le 2026-06-28.**

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

### Étape 4 — Modification des fréquences depuis l'UI (optionnel, priorité basse)

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
| `challenge_processing` | `challengeProcessingCronTask` | **aucune — hardcodé `'0 0 * * *'`** | `0 0 * * *` | `challenge_processing` |

Points à ne pas oublier :
- `challenge_processing` n'a **pas d'env var aujourd'hui** (contrairement aux 8 autres) — il faut d'abord introduire `CHALLENGE_PROCESSING_CRON` (avec fallback `'0 0 * * *'`) avant de pouvoir le rendre pilotable, sinon il n'y a pas de valeur "par défaut" cohérente à afficher/restaurer.
- `clan_online_reminder` et `weekly_report_reminder` n'écrivent jamais de ligne `CronExecution` : ils sont absents de `KNOWN_ACTIONS` et du tableau "Dernière exécution par action" (Étape 2d). Il faut donc les ajouter explicitement à la section Schedules (2f) même s'ils ne concernent que l'affichage des fréquences, pas l'historique.
- Toutes les tâches partagent aujourd'hui le même fuseau `DAILY_SYNC_TIMEZONE` (dérivé de `CLAN_MATCH_SYNC_TIMEZONE`). Le modèle `CronSchedule` prévoit un champ `timezone` par ligne, mais pour la V1 il est recommandé de **ne pas** l'exposer dans l'UI (garder un fuseau global unique) afin de ne pas complexifier la validation — à documenter comme limitation volontaire.

**4b. Migration Prisma**
- [ ] Créer la table `CronSchedule` :

```prisma
model CronSchedule {
  key        String   @id  // une des 9 clés ci-dessus
  expression String        // ex: '0 2 * * *'
  timezone   String   @default("UTC")
  updatedAt  DateTime @updatedAt
  updatedBy  Int?
}
```

- [ ] Générer et appliquer la migration
- [ ] Pas de seed initial : la table démarre vide. Tant qu'aucune ligne n'existe pour une clé, le fallback `.env` (ou défaut hardcodé) reste actif. Un `PUT` fait un upsert (crée l'override), un `DELETE` supprime la ligne pour revenir au défaut.

**`src/lib/cron-jobs.ts` — refonte**
- [ ] Remplacer les constantes `*_SCHEDULE` lues directement en tête de fichier par un registre unique (clé → `{ envVar, default, globalKey, taskFactory }`) couvrant les 9 entrées de 4a, y compris l'ajout de `CHALLENGE_PROCESSING_CRON`
- [ ] `initCronJobs()` devient **async** : une requête `prisma.cronSchedule.findMany()` au bootstrap construit une Map clé → expression effective (DB > env > défaut), puis crée les 9 `ScheduledTask` à partir de cette map
- [ ] Exposer `rescheduleJob(key: string, newExpression: string)` : retrouve le `ScheduledTask` courant via le registre, `task.stop()`, recrée un nouveau `ScheduledTask` avec la même factory/timezone, remplace la référence dans `globalForCron`
- [ ] Exposer `getEffectiveCronSchedules()` : retourne pour chacune des 9 clés `{ key, expression, timezone, source: 'db' | 'env' }`, utilisé par l'API de lecture (voir 4d)
- [ ] Mettre à jour l'appelant `src/app/api/internal/cron/bootstrap/route.ts` (`initCronJobs()` → `await initCronJobs()`), seul call site existant

**API**
- [ ] `GET /api/settings/cron-schedules` (SuperUser uniquement) : retourne `getEffectiveCronSchedules()`. Manquait dans la version initiale du plan — sans lecture de l'état courant (valeur + source db/env), l'UI ne peut pas afficher les fréquences actuelles avant modification
- [ ] `PUT /api/settings/cron-schedules` (SuperUser uniquement) : body `{ key, expression }`, valider via `cron.validate()`, upsert `CronSchedule`, appeler `rescheduleJob`
- [ ] `DELETE /api/settings/cron-schedules/[key]` (SuperUser uniquement) : supprime la ligne DB (retour au défaut `.env`/hardcodé), appelle `rescheduleJob` avec la valeur par défaut recalculée

**UI**
- [ ] Dans la section "Schedules" (Étape 2f) : passer d'un affichage statique à un tableau éditable listant les **9** clés de 4a (pas seulement celles visibles dans le tableau "Dernière exécution par action")
- [ ] Badge de source par ligne : `.env` (neutre) vs `personnalisé` (coloré) si une ligne `CronSchedule` existe
- [ ] Champ texte inline + bouton "Appliquer" (`PUT`) + bouton "Réinitialiser" visible seulement si override actif (`DELETE`)
- [ ] Validation côté client de l'expression cron avant envoi
- [ ] Feedback immédiat (succès/erreur) par ligne

**Limite connue à documenter (non bloquante pour la V1)**
- [ ] `initCronJobs()` est gardé par un flag process-local (`clanSyncCronInitialized`). Si l'app tourne sur plusieurs instances Next.js, `rescheduleJob` ne modifie que le `ScheduledTask` de l'instance ayant reçu la requête `PUT` — les autres instances gardent l'ancienne expression jusqu'à leur prochain redémarrage (qui relira alors `CronSchedule` à jour). Aucun mécanisme de synchronisation inter-instances n'est prévu ; à noter dans `docs/ops/cron.md`.

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
| `src/lib/cron-jobs.ts` | Étape 4 seulement — registre des 9 schedules, `initCronJobs` async, `rescheduleJob`, `getEffectiveCronSchedules` | En attente |
| `prisma/schema.prisma` | Étape 4 seulement — modèle `CronSchedule` | En attente |
| `src/app/api/internal/cron/bootstrap/route.ts` | Étape 4 seulement — `await initCronJobs()` | En attente |
| `.env.example` | Étape 4 seulement — ajouter `CHALLENGE_PROCESSING_CRON` | En attente |
| `src/app/api/settings/cron-schedules/route.ts` | Étape 4 seulement — créer (`GET`/`PUT`) | En attente |
| `src/app/api/settings/cron-schedules/[key]/route.ts` | Étape 4 seulement — créer (`DELETE`) | En attente |
| `docs/ops/cron.md` | Étape 4 seulement — documenter la limite multi-instances | En attente |

---

## Suggestions futures (non planifiées)

### Découpler la télémétrie de `daily_sync` — nouvelle file "live sync", 100% stream, aucun fichier sur disque

**Problème :** quand `TELEMETRY_SYNC_ENABLED=true`, `daily_sync` télécharge et parse la télémétrie **en-process** (`syncTelemetryBatchForRecentSquadMatches` puis `recalculateTelemetryPeriodAggregatesForClan`, dans `cron-jobs.ts`), sur le même thread que le serveur HTTP Next.js — pas d'offload `worker_thread`. Le parseur streaming (`parser.ts`) traite chaque chunk réseau de façon synchrone/CPU-bound ; entre deux chunks il rend la main, mais pendant le traitement d'un chunk les autres requêtes du site attendent. Détail dans `docs/ops/cron.md` (section "Bonnes pratiques d'exploitation").

**⚠️ Piste écartée — ne pas router via la queue `telemetry_resync_file` existante.** Cette queue (`enqueueTelemetryResyncJobs` + `telemetry:worker`) ne fait *pas* de téléchargement live : elle rejoue un fichier déjà capturé sur disque (`resyncTelemetryFromCapturedFile`, `src/lib/pubg-telemetry/resync-files.ts`). Si le fichier n'existe pas dans `TELEMETRY_CAPTURE_FIXTURES_DIR`, le job échoue (`status: 'missing'`). Or `TELEMETRY_CAPTURE_FIXTURES` est à `false` par défaut et explicitement "réservé au développement, ne pas activer en production" (`.env.example:111-114`). Router `daily_sync` vers cette queue ferait donc échouer tous les jobs en prod — et l'activer reviendrait à écrire un fichier JSON par match sur disque, ce qu'on veut justement éviter (volume élevé de matchs importés quotidiennement).

**Le chemin qui reste 100% stream (à préserver tel quel) :** `syncTelemetryForSquadMatch` (`src/lib/pubg-telemetry/index.ts:114-190`) — déjà utilisé aujourd'hui par `daily_sync`. `downloadTelemetryFromAsset()` renvoie un `ReadableStream` branché directement sur `parseTelemetrySnapshotFromStream()` : aucune écriture disque, la capture fixture n'est qu'un effet de bord optionnel (`.tee()`) totalement absent de ce chemin. **Ce code ne doit pas changer** — seul son lieu d'exécution doit bouger.

**Proposition :** créer une file **distincte** de la resync-fichier, dédiée au live-sync, et faire exécuter ce même code stream par le worker déjà existant (process séparé, déjà monitoré mémoire/backpressure — cf. mémoire "Phase 2 memory protection complete") au lieu du process Next.js.

- [ ] Nouveau module `src/lib/pubg-telemetry/live-sync-queue.ts`, même pattern que `resync-queue.ts` mais action dédiée `telemetry_live_sync` et `details: { squadMatchId, pubgMatchId, anyPlayerId, shard }` (pas de `resetBeforeSync`/fichier — non pertinent ici)
- [ ] Dans `runTelemetryBatchForClan` (`cron-jobs.ts`) : remplacer l'appel à `syncTelemetryBatchForRecentSquadMatches(...)` par `listSquadMatchesNeedingTelemetry(...)` (lecture Prisma, déjà utilisée par `job.ts`) puis `enqueueTelemetryLiveSyncJobs({ clanId, matches })`
- [ ] Dans `scripts/telemetry-resync-worker.ts` (ou un second claim-loop dans le même process — pas un 3ᵉ script à opérer) : ajouter la prise en charge de l'action `telemetry_live_sync` en appelant **directement** `syncTelemetryForSquadMatch` (le même code stream qu'aujourd'hui, juste déplacé de process) — ne pas passer par `resyncTelemetryFromCapturedFile`
- [ ] Chaînage du recalcul d'agrégats identique à l'existant (`enqueueTelemetryAggregateRecalcJob` une fois le job live-sync terminé avec succès)
- [ ] Supprimer l'appel direct à `recalculateTelemetryPeriodAggregatesForClan` dans `runTelemetryAggregateRefreshForClan` — devenu inutile
- [ ] Adapter le résumé stocké dans `CronExecution` (`action: daily_sync`) : remplacer `parsed`/`failed`/`metrics` par un résumé de mise en queue (`queuedCount`, `alreadyQueuedCount`) — le résultat réel par match est visible dans les lignes `telemetry_live_sync`
- [ ] `TELEMETRY_SYNC_ENABLED` garde le même rôle (active/désactive la télémétrie auto), mais gate désormais une mise en queue rapide plutôt qu'une exécution bloquante
- [ ] Dashboard `/settings/cron` (Étape 2c/2d) : ajouter `telemetry_live_sync` aux actions suivies, à côté de `telemetry_resync_file`

**Effet :** `daily_sync` ne fait plus aucun appel réseau ni parsing CPU-bound — uniquement des lectures/écritures Prisma courtes (quelques ms), bornées par `TELEMETRY_MAX_MATCHES_PER_RUN`. Le téléchargement+parsing reste **100% stream, zéro fichier sur disque**, exactement comme aujourd'hui — seul le process qui l'exécute change. Le risque de blocage de l'event-loop disparaît complètement, sans introduire de dépendance à la capture fixture ni de charge disque supplémentaire.

**Compromis à assumer :**
- La télémétrie n'est plus disponible immédiatement après le cron — elle devient éventuellement cohérente, au rythme du worker (poll `TELEMETRY_RESYNC_WORKER_POLL_MS`, parallélisme à définir pour la nouvelle file — probablement une variable dédiée plutôt que de réutiliser `TELEMETRY_RESYNC_WORKER_MAX_PARALLEL`, pour ne pas faire concurrence aux jobs de resync-fichier).
- Nécessite que le worker tourne en continu — déjà une exigence opérationnelle documentée pour le backfill manuel, mais devient désormais aussi une dépendance du chemin **automatique**. Si le worker est à l'arrêt, les jobs `telemetry_live_sync` s'accumulent en `queued` (visible dans le dashboard) plutôt que d'échouer silencieusement.
- `TELEMETRY_SYNC_CONCURRENCY` (utilisé aujourd'hui par le batch en-process) devient sans effet sur ce chemin — à remplacer par une variable de parallélisme côté worker pour cette nouvelle file, et à documenter clairement dans `docs/ops/cron.md` pour éviter toute confusion avec les variables `TELEMETRY_RESYNC_WORKER_*` existantes (qui restent, elles, spécifiques au fichier capturé).

**Piste secondaire — le 3ᵉ chemin manuel synchrone (hors périmètre initial, à évaluer séparément) :** `syncTelemetryForSelectedSquadMatches` (`src/lib/pubg-telemetry/manual-sync.ts:309-718`) est un **troisième** chemin de sync télémétrie, distinct des deux ci-dessus : il télécharge et parse en stream (comme `daily_sync`), mais de façon **synchrone dans la requête API** elle-même (pas de queue), donc potentiellement bloquant sur le même thread Next.js le temps de traiter les matchs sélectionnés. Impact plus limité que `daily_sync` (déclenché uniquement par un SuperUser, sur un nombre de matchs choisi manuellement), mais le même principe s'applique.

- [ ] Si ce chemin manuel traite parfois des lots significatifs, envisager de le faire passer par la même file `telemetry_live_sync` plutôt que d'exécuter `syncTelemetryForSelectedSquadMatches` en direct dans la route API
- [ ] À ne traiter qu'après validation du chemin `daily_sync` → `telemetry_live_sync` (réutiliser la même file une fois éprouvée, pas la dupliquer)
- [ ] Vérifier au passage si la fonctionnalité de capture fixture (`fetchTelemetryFilesForSelectedSquadMatches`, effet de bord `.tee()`) reste nécessaire sur ce chemin ou si elle peut être découplée

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
