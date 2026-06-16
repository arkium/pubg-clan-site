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
| `challenge_processing` | (fixe) | `0 0 * * *` | Traitement des challenges expirés |

La timezone des crons est configurée via `CLAN_MATCH_SYNC_TIMEZONE` (défaut : `UTC`). Toutes les expressions cron utilisent cette même timezone.

---

## Détail des jobs

### `daily_sync` — Sync matchs

Déclenché à 2 h chaque nuit pour tous les clans actifs (`Clan.isActive = true`).

Pour chaque clan :
- Appelle `POST /api/clans/[clanId]/sync-matches` (endpoint interne).
- Pour chaque membre actif : résolution du `pubgAccountId` si absent, récupération des matchs récents PUBG, import incrémental, upsert des lignes `Match`, détection des squads (`SquadMatch` / `SquadMember`).
- Retry par clan : jusqu'à `MAX_SYNC_ATTEMPTS` (3) tentatives.
- Si `TELEMETRY_SYNC_ENABLED=true` : enqueue un batch de jobs de télémétrie après l'import.

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

Déclenché à minuit chaque nuit. Traite les challenges expirés (`endChallenge`). Note : ce job n'écrit pas d'entrée `CronExecution` (pas de `startCronExecution` / `finishCronExecution` dans `processChallenges`).

---

## Actions manuelles (page ops cron clan)

La page `/clans/[clanId]/settings/cron` (Owner uniquement) expose des boutons pour déclencher manuellement les actions sur un seul clan via `POST /api/clans/[clanId]/cron-control`.

| Action | Bouton | Ce qu'elle fait |
|---|---|---|
| `sync_matches` | Sync matchs | Import matchs PUBG + détection squads pour le clan |
| `sync_lifetime_stats` | Sync stats lifetime | Rafraîchit les stats lifetime PUBG pour le clan |
| `generate_weekly_report` | Rapport hebdo | Génère le rapport de la semaine précédente pour le clan |
| `generate_monthly_report` | Rapport mensuel | Génère le rapport du mois précédent pour le clan |

L'action `sync_stats` (recalcul stats) n'est plus exposée en bouton — elle se déclenche automatiquement après un `sync_matches` réussi avec de nouveaux matchs.

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

## Page admin globale `/settings/cron`

Page d'entrée qui redirige automatiquement vers `/clans/[clanId]/settings/cron` du clan actif. Ne contient pas de contenu propre.

---

## Page ops clan `/clans/[clanId]/settings/cron`

Accès : Owner uniquement. Vérifié côté API par `requireRole(['Owner'])`.

Blocs affichés :

### Bloc santé

Agrège via `getCronOverview(clanId)` :
- Taux de succès récent.
- Nombre d'exécutions récentes.
- Jobs en cours (`running`).
- Echecs récents.
- Date du dernier sync lifetime.

### Bloc configuration

`getCronConfigurationChecks()` vérifie les variables d'environnement et leur cohérence. Chaque check retourne un statut `ok`, `warning` ou `error`. Variables vérifiées :

**Runtime cron :** `ENABLE_CRON_JOBS`, `ENABLE_CRON_BOOTSTRAP`, `DATABASE_URL`, `INTERNAL_APP_URL`.

**Télémétrie :** `TELEMETRY_SYNC_ENABLED`, `TELEMETRY_PARSER_VERSION`, `TELEMETRY_MAX_MATCHES_PER_RUN`, `TELEMETRY_SYNC_CONCURRENCY`, `TELEMETRY_RETRY_MAX`, `TELEMETRY_FETCH_TIMEOUT_MS`, `TELEMETRY_MAX_ASSET_SIZE_MB`, `TELEMETRY_CAPTURE_FIXTURES`, `TELEMETRY_CAPTURE_FIXTURES_DIR`, `TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES`.

**Reminders :** `CLAN_ONLINE_REMINDER_CRON`, `WEEKLY_REPORT_REMINDER_CRON`.

**Intégrité :** validité des expressions cron.

### Bloc rate limit PUBG API

Snapshot des headers rate-limit les plus récents observés lors des appels PUBG : `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `observedAt`. Permet de vérifier si les syncs approchent du plafond.

### Bloc runtime cron worker

Sonde `GET /api/internal/cron/status` (header `x-cron-bootstrap-secret` = `CRON_BOOTSTRAP_SECRET`). Confirme si le worker cron est actif et si les jobs sont activés.

### Bloc historique

Liste les dernières entrées `CronExecution` pour ce clan. Colonnes : action, statut, début, durée, source, message.

---

## Routes API internes

| Route | Méthode | Rôle |
|---|---|---|
| `/api/clans/[clanId]/cron-control` | GET | Statut health cron du clan (rate limit, checks, overview, historique) |
| `/api/clans/[clanId]/cron-control` | POST | Déclencher une action manuelle |
| `/api/internal/cron/bootstrap` | POST | Démarrer les crons (header secret requis) |
| `/api/internal/cron/status` | GET | Vérifier si le worker cron est actif (header secret requis) |

---

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `ENABLE_CRON_JOBS` | — | `true` sur le worker cron uniquement |
| `CRON_BOOTSTRAP_SECRET` | — | Secret partagé entre web worker et worker cron |
| `CLAN_MATCH_SYNC_CRON` | `0 2 * * *` | Expression cron sync matchs |
| `CLAN_MATCH_SYNC_TIMEZONE` | `UTC` | Timezone des expressions cron |
| `CLAN_STATS_RECALC_CRON` | `0 3 * * *` | Expression cron recalcul stats |
| `CLAN_LIFETIME_STATS_SYNC_CRON` | `0 4 * * *` | Expression cron lifetime |
| `CLAN_SEASON_STATS_SYNC_CRON` | `0 5 * * *` | Expression cron saison ranked |
| `CLAN_ONLINE_REMINDER_CRON` | `0 18 * * *` | Expression cron rappels online |
| `WEEKLY_REPORT_REMINDER_CRON` | `0 9 * * *` | Expression cron rappels rapport |
| `WEEKLY_REPORT_GENERATION_CRON` | `0 8 * * 1` | Expression cron rapport hebdo |
| `MONTHLY_REPORT_GENERATION_CRON` | `0 8 1 * *` | Expression cron rapport mensuel |
| `INTERNAL_APP_URL` | — | URL interne du web worker (ex : `http://127.0.0.1:3000`) |
| `TELEMETRY_SYNC_ENABLED` | — | `true` pour activer la sync télémétrie dans le cron |

---

## Bonnes pratiques d'exploitation

- Activer `ENABLE_CRON_JOBS=true` sur **un seul** worker dédié cron.
- Garder `INTERNAL_APP_URL` en local (`http://127.0.0.1:3000`) pour les appels internes.
- Surveiller les statuts `partial` et les échecs répétés dans l'historique `CronExecution`.
- Ajuster `CLAN_MATCH_SYNC_TIMEZONE` (ex : `Europe/Paris`) si les horaires métier ne sont pas UTC.
- En cas d'incident télémétrie, désactiver d'abord `TELEMETRY_SYNC_ENABLED` avant toute action plus intrusive.
- Traiter les warnings de configuration dans le bloc checks avant de considérer la supervision comme fiable.
