# Tâches cron

## Vue d'ensemble

Les tâches cron sont orchestrées par `src/lib/cron-jobs.ts` via la librairie `node-cron`. Elles ne s'activent que si `ENABLE_CRON_JOBS=true`, ce qui doit être positionné **uniquement sur le worker cron dédié**. Le worker web doit avoir `ENABLE_CRON_JOBS=false` (ou absent).

En développement (`NODE_ENV !== 'production'`), les crons s'activent même sans la variable d'environnement, à moins que `ENABLE_CRON_JOBS=false` ne soit explicitement défini.

---

## Jobs planifiés

| Nom interne | Variable cron | Schedule par défaut | Rôle |
|---|---|---|---|
| `daily_sync` | `CLAN_MATCH_SYNC_CRON` | `0 2 * * *` | Sync matchs PUBG pour tous les clans actifs |
| `daily_stats_recalc` | `CLAN_STATS_RECALC_CRON` | `0 3 * * *` | Recalcul stats week/month/all pour tous les clans actifs |
| `daily_lifetime_stats_sync` | `CLAN_LIFETIME_STATS_SYNC_CRON` | `0 4 * * *` | Rafraîchit les stats lifetime PUBG pour tous les clans |
| `daily_season_stats_sync` | `CLAN_SEASON_STATS_SYNC_CRON` | `0 5 * * *` | Rafraîchit les stats de saison ranked pour tous les clans |
| `clan_online_reminder` | `CLAN_ONLINE_REMINDER_CRON` | `0 18 * * *` | Envoie les rappels "clan en ligne ce soir" |
| `weekly_report_reminder` | `WEEKLY_REPORT_REMINDER_CRON` | `0 9 * * *` | Envoie les rappels de rapport hebdomadaire disponible |
| `weekly_report_auto` | `WEEKLY_REPORT_GENERATION_CRON` | `0 8 * * 1` | Génère le rapport hebdomadaire pour tous les clans actifs |
| `monthly_report_auto` | `MONTHLY_REPORT_GENERATION_CRON` | `0 8 1 * *` | Génère le rapport mensuel pour tous les clans actifs |
| `challenge_processing` | `CHALLENGE_PROCESSING_CRON` | `0 0 * * *` | Traitement des challenges expirés |
| `encountered_player_clan_resolution` | `ENCOUNTERED_PLAYER_CLAN_RESOLUTION_CRON` | `*/30 * * * *` | Résolution du clan PUBG des joueurs croisés (lot configurable) |
| `clan_lifecycle_membership_sync` | `CLAN_LIFECYCLE_MEMBERSHIP_SYNC_CRON` | `45 1 * * *` | Vérifie l'appartenance de clan de chaque membre suivi, joueur par joueur |
| `db_maintenance` | `DB_MAINTENANCE_CRON` | `15 1 * * *` | Clôture des exécutions orphelines restées `running` > 6 h — ne supprime rien |
| `telemetry_geo_purge_count` | `TELEMETRY_GEO_PURGE_COUNT_CRON` | `0 6 * * *` | Compte ce que la purge de géolocalisation retirerait, tous seuils confondus — lecture seule |

La timezone des crons est configurée via `CLAN_MATCH_SYNC_TIMEZONE` (défaut : `UTC`), commune à tous les schedules.

Ces schedules sont éditables sans redémarrage depuis `/settings/cron` (SuperUser) — voir la section "Schedules éditables" ci-dessous. La variable d'environnement reste le fallback si aucune valeur personnalisée n'est enregistrée en base.

---

## Détail des jobs

### `daily_sync` — Sync matchs

Déclenché à 2 h chaque nuit pour tous les clans actifs (`Clan.isActive = true`).

Pour chaque clan :
- Appelle `POST /api/clans/[clanId]/sync-matches` (endpoint interne).
- Pour chaque membre actif : résolution du `pubgAccountId` si absent, récupération des matchs récents PUBG, import incrémental, upsert des lignes `Match`, détection des squads (`SquadMatch` / `SquadMember`).
- Retry par clan : jusqu'à `MAX_SYNC_ATTEMPTS` (3) tentatives.
- Si `TELEMETRY_SYNC_ENABLED=true` : met en file les matchs nécessitant une télémétrie (action `telemetry_live_sync`, voir plus bas) — aucun téléchargement/parsing n'est fait en-process dans `daily_sync` lui-même.

Garde-fous post-import :
- Import `partial` → recalcul des stats ignoré (stats existantes conservées).
- Import `success` avec 0 nouveau match → recalcul ignoré.
- Import `success` avec nouveaux matchs → recalcul stats déclenché automatiquement (`syncTrackedClanStats`).
- Un `404` PUBG sur `/matches/{id}` est traité en `skipped` (non bloquant).

### `daily_stats_recalc` — Recalcul stats

Déclenché à 3 h pour tous les clans actifs.

- `recalculateStatsForClan(clanId)` pour les périodes `week`, `month`, `all`.
- Attribution des badges : `top_killer`, `top_damage`, `best_wr`, `mvp`, `best_kpm`.
- Purge des stats anciennes (> 12 mois, hors all-time).
- Calcul du résumé agrégé clan (`clanStats`).

### `daily_lifetime_stats_sync` — Stats lifetime

Déclenché à 4 h pour tous les clans actifs.

- Appelle `syncClanLifetimeStats(clanId)` pour chaque clan.
- Résolution de l'account PUBG si nécessaire.
- Appel API PUBG lifetime.
- Upsert des lignes `memberLifetimeStats` (combat, victory, support, vehicle, movement, other).
- Met à jour `lastRefreshedAt`.

### `daily_season_stats_sync` — Stats saison ranked

Déclenché à 5 h pour tous les clans actifs.

- Récupère la saison PUBG courante via `fetchCurrentSeason()`.
- Pour chaque membre actif : `fetchPlayerSeasonStats()` et `fetchPlayerRankedStats()`.
- Upsert des lignes de stats saison en base.

### `weekly_report_auto` / `monthly_report_auto` — Rapports automatiques

- Rapport hebdomadaire : lundi à 8 h, sur la semaine précédente complète (lundi N-1 → dimanche N-1).
- Rapport mensuel : 1er du mois à 8 h, sur le mois précédent complet.
- Appelle `generateWeeklyReport(clanId, weekStart)` ou `generateMonthlyReport(clanId, monthStart)`.
- Persiste `Report` + `ReportSection` en base.
- Notifie les membres actifs du clan via `notifyReportReady`.

### `challenge_processing` — Challenges

Déclenché à minuit chaque nuit pour tous les clans actifs. Pour chaque clan : rafraîchit la progression des challenges actifs (si le clan en a), termine les challenges expirés (`endChallenge`), active les challenges `pending` dont la date de début est passée. Écrit une ligne `CronExecution` par clan actif (`details: { refreshed, endedCount, activatedCount }`).

### `encountered_player_clan_resolution` — Clans des joueurs croisés

Toutes les 30 min. Sélectionne un lot d'identités non résolues (`selectPrioritizedEncounteredPlayerIdentities`) puis résout leur clan PUBG ; chaque passage est tracé dans `EncounteredPlayerResolutionRun` (pas dans `CronExecution`). Depuis le 2026-09-15, la sélection se fait en deux paliers — identités avec interaction de combat, puis classement complet mis en cache 6 h — au lieu d'un regroupement de ~560 000 lignes à chaque passage (48 s → 1,8 s). Détail et mesures : [database-performance.md](database-performance.md#32-cron-de-résolution-des-adversaires--sélection-en-deux-paliers-2026-09-15).

### `clan_lifecycle_membership_sync` — Appartenance de clan

Compare, pour chaque `ClanMember` actif, le clan enregistré sur le site au clan renvoyé par l'API PUBG. Documenté en détail dans [Cycle de vie du clan](../features/cycle-de-vie-clan.md).

**Placement à 01 h 45 :** quinze minutes avant `daily_sync` (02 h 00), pour que les mouvements soient appliqués **avant** le recalcul des agrégats du matin — les statistiques partent ainsi du bon clan.

**Coût mesuré le 2026-09-20 :** 346 membres, **35 appels PUBG**, ~255 s. La durée est bornée par le quota partagé de 10 req/min, pas par le traitement. Les lots sont plafonnés à **10 identifiants** : au-delà, l'API renvoie `200 OK` avec seulement 10 joueurs, sans erreur.

**Ce qu'il fait automatiquement**, une fois le mode passé à `apply` :

- bascule vers le clan technique un membre dont le départ est confirmé ;
- transfère entre deux clans suivis quand la destination est stable ;
- crée en attente de validation un clan détecté mais inconnu ;
- marque les membres du parking éligibles à l'archivage.

**Trois garde-fous**, tous configurables depuis `/settings/clan-lifecycle` :

| | |
|---|---|
| Mode `observe` (défaut) | Journalise les écarts, **ne déplace personne** |
| N confirmations | Un écart doit être constaté N passages d'affilée ; `attributes.clanId` clignote pour ~5 % des comptes |
| Coupe-circuit | Au-delà d'une part de l'effectif, le passage est marqué `aborted` et rien n'est appliqué |

**Verrou :** un passage refuse de démarrer si un `ClanLifecycleRun` est encore `running`. Verrou en base, pas en mémoire — le web et le worker sont deux process distincts. Les passages bloqués sont fermés par `db_maintenance`.

**Lancement manuel :** `npx tsx scripts/run-clan-lifecycle-sync.ts` (respecte le mode configuré).

### `db_maintenance` — Maintenance nocturne

À 01:15, avant `daily_sync`. Clôt en `failed` les lignes `CronExecution` et `EncounteredPlayerResolutionRun` restées `running` depuis plus de 6 h (processus arrêté en cours d'exécution), pour que les tableaux de bord ne les affichent plus « en cours ». **Ne supprime aucune donnée** : ni jobs échoués (dead letter), ni jobs en attente, ni captures de télémétrie — voir [database-performance.md](database-performance.md#34-ce-qui-nest-volontairement-pas-automatisé). Journal : `[Cron] DB maintenance — orphaned runs finalized: …`.

### `telemetry_geo_purge_count` — Volume purgeable des tracés GPS

À 06:00, après `daily_season_stats_sync`. Recompte, **en une seule passe et pour tous les seuils**
(7/14/30/60/90 jours et « tous »), les matchs dont `SquadMatchTelemetry.positionSamples` et
`.trajectorySegments` sont encore remplis, et publie le résultat dans `AppConfig`
(clé `telemetry_geo_purge_counts`). **Lecture seule.**

**Pourquoi un cron plutôt qu'un calcul à la demande :** `positionSamples IS NOT NULL` place la colonne
dans le read set, donc InnoDB va chercher les pages externes du blob — le comptage lit les ~22 Go de la
table et prend **247 s mesurées** (2026-09-23). Aucun index ne peut y remédier. Tenu dans le temps d'une
réponse HTTP, il dépassait le `proxy_read_timeout` de Nginx et la page SuperUser en concluait
« aucun match à purger » alors que des milliers de matchs attendaient.

**Borne figée à minuit :** le seuil est « dernier minuit moins N jours », pas « maintenant moins
N jours ». Le nombre annoncé ne bouge pas de la journée, la journée en cours n'entre jamais dans la
cible, et la purge applique exactement la borne affichée.

**Protections :** les matchs **Top 1** (`placement = 1`) et les **parties personnalisées**
(`matchType = 'custom'`, support des tournois) sont comptés à part et jamais purgés. Tous les customs
sont protégés, pas seulement ceux d'un tournoi déjà créé : un tournoi se déclare *après* les parties,
sur une fenêtre de dates.

**Purge elle-même :** elle n'est **pas** automatique. Elle se déclenche depuis
`/settings/superuser/database` et s'exécute côté serveur : son état vit dans `AppConfig`
(`telemetry_geo_purge_run`), la page ne fait que le lire, on peut donc la quitter. Un run dont le
battement de cœur dépasse 10 min est requalifié « interrompu ».

**Diagnostic :** `npx tsx scripts/check-purge-telemetry-status.ts` (volumétrie et durées),
`scripts/check-purge-protections.ts` (poids des protections), `scripts/check-purge-collateral.ts`
(agrégats déjà calculés), `scripts/check-purge-update-cost.ts` (coût d'écriture, transaction annulée).

---

## Actions manuelles (page ops cron SuperUser)

La page `/settings/cron` (SuperUser uniquement) expose des boutons pour déclencher manuellement les actions sur le clan actif via `POST /api/clans/[clanId]/cron-control`.

| Action | Bouton | Ce qu'elle fait |
|---|---|---|
| `sync_matches` | Sync matchs | Import matchs PUBG + détection squads. Déclenche automatiquement `sync_stats` si de nouveaux matchs sont importés. |
| `sync_stats` | Recalcul stats | Recalcul des agrégats stats du clan sans appel API PUBG. |
| `sync_telemetry_aggregates` | Recalcul agrégats télémétrie | Recalcul des périodes d'agrégats télémétrie (positions, armes, synergies). |
| `sync_lifetime_stats` | Sync stats lifetime | Rafraîchit les stats lifetime PUBG pour tous les membres du clan. |
| `generate_weekly_report` | Rapport hebdo | Génère le rapport de la semaine précédente pour le clan. |
| `generate_monthly_report` | Rapport mensuel | Génère le rapport du mois précédent pour le clan. |

---

## Observabilité — Table `CronExecution`

Chaque exécution d'un job (manuel ou automatique) est tracée dans la table `CronExecution` via les fonctions `startCronExecution` / `finishCronExecution` de `src/lib/cron-observability.ts`.

Colonnes clés :

| Colonne | Type | Description |
|---|---|---|
| `action` | string | Nom du job (`daily_sync`, `sync_matches`, etc.) |
| `status` | enum | `running` / `success` / `partial` / `failed` |
| `source` | enum | `manual` / `scheduler` / `system` |
| `startedAt` | datetime | Début de l'exécution |
| `finishedAt` | datetime | Fin de l'exécution |
| `durationMs` | int | Durée en millisecondes |
| `message` | string | Résumé lisible |
| `details` | JSON | Détails structurés (erreurs, stats, etc.) |
| `clanId` | int | Clan concerné (null pour les jobs globaux) |

Pour `sync_matches`, `details` peut contenir :

```json
{
  "importedMatches": 12,
  "errorsCount": 0,
  "skippedCount": 2,
  "skipped": ["match-id-1", "match-id-2"],
  "statsSync": "success"
}
```

`statsSync` peut valoir `"success"`, `"skipped"` ou `"failed"`.

---

## Page ops cron SuperUser `/settings/cron`

Accès : SuperUser uniquement. Vérifié côté client par `useAuthSession().isSuperUser` et côté API par `isSuperUserSession`.

La page opère sur le **clan actif** (sélectionné via `useSelectedClan`). Elle consolide en un seul endroit la supervision des trois pipelines indépendants.

### Bloc santé (4 cards métriques)

Agrège via `GET /api/clans/[clanId]/cron-control` (`take: 200`) :
- Taux de succès récent.
- Total exécutions récentes / terminées.
- Jobs en cours (`running`).
- Échecs récents.

### Bloc statut des workers

Affiche 3 panneaux côte à côte via `GET /api/settings/cron-workers-status` :

| Panneau | Source de données |
|---|---|
| Cron scheduler (Next.js) | `runtime.webWorker` dans la réponse `cron-control` |
| `telemetry:worker` | Lock file `.telemetry-resync-worker.lock` + stats queue `CronExecution` |
| `telemetry:aggregates:worker` | Lock file `.telemetry-aggregate-worker.lock` + stats queue `CronExecution` |

Les lock files sont lus par l'API depuis le filesystem (même machine). La vivacité du process est testée via `process.kill(pid, 0)`.

### Bloc dernière exécution par action

Tableau synthétique : une ligne par action connue (13 actions), source `latestByAction` dans la réponse `cron-control`. Ligne vide si aucune exécution trouvée.

### Bloc actions manuelles

6 boutons avec descriptif fonctionnel. Voir section "Actions manuelles" ci-dessus.

### Bloc configuration

`getCronConfigurationChecks()` vérifie les variables d'environnement et leur cohérence. Chaque check retourne un statut `ok`, `warning` ou `error`. Variables vérifiées :

**Système & API :** `ENABLE_CRON_JOBS`, `ENABLE_CRON_BOOTSTRAP`, `DATABASE_URL`, `INTERNAL_APP_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `PUBG_API_KEY`, `NODE_ENV`.

**Télémétrie :** `TELEMETRY_SYNC_ENABLED`, `TELEMETRY_PARSER_VERSION`, `TELEMETRY_MAX_MATCHES_PER_RUN`, `TELEMETRY_SYNC_CONCURRENCY`, `TELEMETRY_RETRY_MAX`, `TELEMETRY_FETCH_TIMEOUT_MS`, `TELEMETRY_MAX_ASSET_SIZE_MB`, `TELEMETRY_CAPTURE_FIXTURES`, `TELEMETRY_CAPTURE_FIXTURES_DIR`, `TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES`. Note : `TELEMETRY_SYNC_CONCURRENCY` ne s'applique plus qu'à titre historique — le parallélisme réel de `telemetry_live_sync` est celui du worker (voir "Workers télémétrie").

**Schedules :** un tableau éditable (pas juste des checks statiques) — voir la section "Schedules éditables" ci-dessous.

Snapshot rate limit PUBG API en pied de section.

### Schedules éditables

Les 9 schedules du tableau "Jobs planifiés" sont stockés en base dans la table `CronSchedule` (`key`, `expression`, `timezone`, `updatedAt`, `updatedBy`) et pilotables sans redémarrage depuis la section "Schedules cron" de `/settings/cron` :

- La valeur effective est : ligne `CronSchedule` si elle existe, sinon la variable d'environnement, sinon le défaut codé en dur. Badge "personnalisé" (vert) vs `.env` (neutre) selon la source.
- `PUT /api/settings/cron-schedules` (SuperUser) : valide l'expression (`node-cron` `cron.validate`), upsert `CronSchedule`, reprogramme immédiatement la tâche dans le process courant via `rescheduleJob()`.
- `DELETE /api/settings/cron-schedules/[key]` (SuperUser) : supprime l'override, revient à la valeur `.env`/défaut.
- **Limite connue** : `rescheduleJob()` ne modifie que le `ScheduledTask` du process Next.js qui a reçu la requête. Sur une infrastructure multi-instances, les autres instances gardent l'ancienne expression jusqu'à leur prochain redémarrage (qui relira alors `CronSchedule` à jour au bootstrap). Pas de synchronisation inter-instances en temps réel.

### Bloc historique

Dernières 200 entrées `CronExecution` (toutes actions, tous workers). Pagination 10 lignes. Filtres Action et Statut. Lignes expandables pour voir le JSON `details`.

---

## Workers télémétrie

En plus du cron scheduler (dans Next.js), deux workers Node.js séparés gèrent le backfill télémétrie :

| Commande | Action `CronExecution` | Rôle |
|---|---|---|
| `npm run telemetry:worker` | `telemetry_resync_file` | Télécharge et parse les fichiers de télémétrie capturés (backfill manuel, requiert `TELEMETRY_CAPTURE_FIXTURES`) |
| `npm run telemetry:worker` | `telemetry_live_sync` | Téléchargement + parsing **stream** (aucun fichier disque) des matchs mis en file par `daily_sync`. Même process/lock que `telemetry_resync_file` — une seule boucle alterne entre les deux types de job. Sur succès, enfile automatiquement un job `telemetry_recalc_aggregates`. |
| `npm run telemetry:aggregates:worker` | `telemetry_recalc_aggregates` | Recalcule les agrégats de période à partir des données parsées |

Ces workers tournent en boucle infinie (poll toutes les 2–3 s). Ils sont indépendants du scheduler Next.js. Ils utilisent un lock file JSON pour le single-instance et récupèrent automatiquement les jobs bloqués (`running` > seuil) au démarrage.

`telemetry_live_sync` n'a pas de retry immédiat ni de priorisation répliquée dans le worker : un job en échec reste `failed`, et c'est le prochain passage de `daily_sync` qui relira le backlog (`SquadMatchTelemetry.status`) et ré-enfilera l'entrée si elle est toujours éligible.

---

## Routes API

| Route | Méthode | Accès | Rôle |
|---|---|---|---|
| `/api/clans/[clanId]/cron-control` | GET | Owner ou SuperUser | Statut health cron du clan (rate limit, checks, overview, historique — `take: 200`) |
| `/api/clans/[clanId]/cron-control` | POST | Owner ou SuperUser | Déclencher une action manuelle sur le clan |
| `/api/settings/cron-workers-status` | GET | SuperUser | Statut des workers télémétrie (lock files + stats queue, y compris `telemetry_live_sync`) |
| `/api/settings/cron-schedules` | GET | SuperUser | Valeur effective des 9 schedules (expression + source db/env) |
| `/api/settings/cron-schedules` | PUT | SuperUser | Modifier l'expression d'un schedule (upsert `CronSchedule` + reschedule immédiat) |
| `/api/settings/cron-schedules/[key]` | DELETE | SuperUser | Réinitialiser un schedule à sa valeur `.env`/défaut |
| `/api/internal/cron/bootstrap` | POST | Secret header | Démarrer les crons (header `x-cron-bootstrap-secret` requis) |
| `/api/internal/cron/status` | GET | Secret header | Vérifier si le worker cron est actif |

---

## Variables d'environnement

### Scheduler Next.js

| Variable | Défaut | Rôle |
|---|---|---|
| `ENABLE_CRON_JOBS` | `false` | `true` sur le worker cron uniquement |
| `ENABLE_CRON_BOOTSTRAP` | `false` | Active l'endpoint HTTP interne de statut cron |
| `CRON_BOOTSTRAP_SECRET` | — | Secret partagé entre web worker et worker cron |
| `INTERNAL_CRON_STATUS_URL` | `http://127.0.0.1:3001/api/internal/cron/status` | URL sondée par la page ops pour vérifier le cron scheduler |
| `CLAN_MATCH_SYNC_TIMEZONE` | `UTC` | Timezone des expressions cron |
| `CLAN_MATCH_SYNC_CRON` | `0 2 * * *` | Sync matchs |
| `CLAN_STATS_RECALC_CRON` | `0 3 * * *` | Recalcul stats |
| `CLAN_LIFETIME_STATS_SYNC_CRON` | `0 4 * * *` | Stats lifetime |
| `CLAN_SEASON_STATS_SYNC_CRON` | `0 5 * * *` | Stats saison ranked |
| `CLAN_ONLINE_REMINDER_CRON` | `0 18 * * *` | Rappels online |
| `WEEKLY_REPORT_REMINDER_CRON` | `0 9 * * *` | Rappels rapport hebdo |
| `WEEKLY_REPORT_GENERATION_CRON` | `0 8 * * 1` | Génération rapport hebdo |
| `MONTHLY_REPORT_GENERATION_CRON` | `0 8 1 * *` | Génération rapport mensuel |
| `CHALLENGE_PROCESSING_CRON` | `0 0 * * *` | Traitement des challenges |
| `TELEMETRY_GEO_PURGE_COUNT_CRON` | `0 6 * * *` | Comptage du volume purgeable des tracés GPS |

### Télémétrie sync (cron + workers)

| Variable | Défaut | Rôle |
|---|---|---|
| `TELEMETRY_SYNC_ENABLED` | `false` | Active la sync télémétrie dans `daily_sync` |
| `TELEMETRY_MAX_MATCHES_PER_RUN` | `50` | Nombre max de matchs par run de sync |
| `TELEMETRY_SYNC_CONCURRENCY` | `2` | Concurrence de téléchargement |
| `TELEMETRY_RETRY_MAX` | `2` | Tentatives max par fichier |
| `TELEMETRY_FETCH_TIMEOUT_MS` | `30000` | Timeout de téléchargement (ms) |
| `TELEMETRY_MAX_ASSET_SIZE_MB` | `250` | Taille max d'un fichier (Mo) |

### Workers télémétrie

| Variable | Défaut | Rôle |
|---|---|---|
| `TELEMETRY_RESYNC_WORKER_POLL_MS` | `2000` | Délai de polling du worker resync (ms) |
| `TELEMETRY_RESYNC_WORKER_MAX_PARALLEL` | `1` | Parallélisme max du worker resync |
| `TELEMETRY_RESYNC_STUCK_RECOVERY_MS` | `120000` | Délai avant récupération d'un job bloqué |
| `TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT` | `80` | Seuil mémoire déclenchant la backpressure (%) |
| `TELEMETRY_WORKER_MEMORY_CRITICAL_PCT` | `95` | Seuil mémoire critique → arrêt du worker (%) |
| `TELEMETRY_AGGREGATE_WORKER_POLL_MS` | `3000` | Délai de polling du worker agrégats (ms) |
| `TELEMETRY_AGGREGATE_WORKER_MAX_PARALLEL` | `1` | Parallélisme max du worker agrégats |

Voir `.env.example` pour la liste complète des variables disponibles avec leurs valeurs par défaut.

---

## Bonnes pratiques d'exploitation

- Activer `ENABLE_CRON_JOBS=true` sur **un seul** worker dédié cron.
- Garder `INTERNAL_APP_URL` en local (`http://127.0.0.1:3000`) pour les appels internes.
- Surveiller les statuts `partial` et les échecs répétés dans l'historique `CronExecution`.
- Ajuster `CLAN_MATCH_SYNC_TIMEZONE` (ex : `Europe/Paris`) si les horaires métier ne sont pas UTC.
- En cas d'incident télémétrie, désactiver d'abord `TELEMETRY_SYNC_ENABLED` avant toute action plus intrusive.
- Traiter les warnings de configuration dans le bloc checks avant de considérer la supervision comme fiable.
- **Blocage event-loop résolu** : `daily_sync` ne télécharge/parse plus la télémétrie en-process. Quand `TELEMETRY_SYNC_ENABLED=true`, il se contente d'enfiler les matchs éligibles (action `telemetry_live_sync`) ; le téléchargement + parsing stream a lieu dans `npm run telemetry:worker`, un process séparé du serveur HTTP. Ce worker doit tourner pour que la télémétrie automatique progresse — si absent, les jobs s'accumulent en `queued` (visible dans le panneau `telemetry:worker` de `/settings/cron`) sans jamais bloquer le site.
- **Éditer un schedule affecte uniquement le process courant** : si l'app tourne sur plusieurs instances Next.js, `rescheduleJob()` ne touche que celle qui a reçu la requête `PUT` — voir "Schedules éditables" ci-dessus.
