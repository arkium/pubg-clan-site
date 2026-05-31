# Pilotage cron clan (`/clans/[clanId]/settings/cron`)

Ce document explique la page Owner `/clans/[clanId]/settings/cron` :

- qui peut l'utiliser,
- quelles actions cron existent,
- ce que chaque action calcule,
- sur quel perimetre (un clan ou tous les clans),
- comment lire la sante, la configuration et l'historique.

## Resume rapide

- La page UI est `src/app/clans/[clanId]/settings/cron/page.tsx`.
- L'API de pilotage est `src/app/api/clans/[clanId]/cron-control/route.ts`.
- Acces reserve au role `Owner` du clan cible.
- Les actions manuelles portent sur le clan courant (`clanId` de l'URL).
- Les crons planifies tournent pour tous les clans actifs (`Clan.isActive = true`).
- L'observabilite est geree via la table `CronExecution` (`startCronExecution` / `finishCronExecution`).

## Fichiers principaux

- UI page: `src/app/clans/[clanId]/settings/cron/page.tsx`
- API control: `src/app/api/clans/[clanId]/cron-control/route.ts`
- Scheduler: `src/lib/cron-jobs.ts`
- Checks + historique: `src/lib/cron-observability.ts`
- Sync metier clan: `src/lib/clan-service.ts`
- Recalcul stats: `src/lib/stats-calculator.ts`
- Generation rapports: `src/lib/report-generator.ts`
- Sync matchs PUBG: `src/app/api/clans/[clanId]/sync-matches/route.ts`

## Qui peut lancer quoi

### Acces page et API

La route `GET/POST /api/clans/[clanId]/cron-control` applique `requireRole(['Owner'])` avec verification d'appartenance au clan.

En pratique:

- un membre non connecte -> `401`
- un membre non Owner / hors clan -> `403`
- un Owner du clan -> acces autorise

### Scope des executions

- Actions manuelles (boutons de la page): 1 clan (celui de l'URL)
- Jobs planifies automatiques: tous les clans actifs

## Actions manuelles (boutons de la page)

Les 4 boutons visibles declenchent `POST /api/clans/[clanId]/cron-control` avec `action`.

### 1) `sync_matches` ("Sync matchs")

But:

- importer les nouveaux matchs PUBG des membres actifs du clan,
- detecter les squads via `analyzeMatchForSquads`,
- enrichir la base locale.

Technique:

- appelle l'endpoint interne `POST /api/clans/[clanId]/sync-matches`
- pour chaque membre actif:
  - resolution `pubgAccountId` si manquant,
  - recuperation des matchs recents PUBG,
  - import incremental des matchs non deja presents,
  - upsert des lignes `Match`,
  - detection squad (`SquadMatch`/`SquadMember`) par analyse de match.

Resultat:

- `success` ou `partial` (si certaines erreurs membre/match),
- details: `importedMatches`, `errorsCount`, apercu d'erreurs.
- garde-fous post-import:
  - import `partial` -> recalcul des stats ignore (on conserve les stats existantes),
  - import `success` avec `0` nouveau match -> recalcul ignore,
  - import `success` avec nouveaux matchs -> recalcul stats automatique (`syncTrackedClanStats`),
  - echec du recalcul apres import -> execution marquee `partial` avec details.

Pour qui:

- membres actifs du clan cible.

### 2) `sync_stats` ("Sync stats")

Note UI:

- cette action n'est plus exposee par bouton dans la page,
- le recalcul est declenche automatiquement apres `sync_matches` uniquement si l'import est complet et avec de nouveaux matchs,
- l'endpoint reste disponible pour usage technique/admin si necessaire.

But:

- recalculer les stats de performance du clan a partir des squads,
- mettre a jour les badges et les agrégats clan.

Technique:

- appelle `syncTrackedClanStats(clanId)`:
  - `recalculateStatsForClan(clanId)` pour periodes `week`, `month`, `all`:
    - stats par joueur (`playerStats`),
    - attribution badges (`top_killer`, `top_damage`, `best_wr`, `mvp`),
    - purge stats anciennes > 12 mois (hors all-time),
  - calcul d'un resume clan agrégé (`clan.clanStats`) avec tops.

Pour qui:

- tous les membres actifs du clan cible (periode week/month/all).

### 3) `sync_lifetime_stats` ("Sync stats lifetime")

But:

- rafraichir les statistiques PUBG lifetime (carriere) de chaque membre actif.

Technique:

- appelle `syncClanLifetimeStats(clanId)`:
  - resolution account PUBG si necessaire,
  - appel API PUBG lifetime,
  - upsert `memberLifetimeStats` (combat/victory/support/vehicle/movement/other),
  - `lastRefreshedAt` mis a jour.

Resultat:

- `success` ou `partial` avec compteurs:
  - `refreshedCount`, `skippedCount`, `membersTotal`, `errors`.

Pour qui:

- tous les membres actifs du clan cible.

### 4) `generate_weekly_report` ("Rapport hebdo")

But:

- generer un rapport hebdomadaire sur la derniere semaine complete.

Technique:

- calcule `weekStart` = lundi de la semaine precedente,
- appelle `generateWeeklyReport(clanId, weekStart)`:
  - calcule highlights/charts/progression/recommandations,
  - persiste `Report` + `ReportSection`,
  - notifie les membres actifs du clan via `notifyReportReady`.

Pour qui:

- rapport du clan cible,
- notifications pour les membres actifs de ce clan.

### 5) `generate_monthly_report` ("Rapport mensuel")

But:

- generer un rapport mensuel sur le mois precedent complet.

Technique:

- calcule `monthStart` = premier jour du mois precedent,
- appelle `generateMonthlyReport(clanId, monthStart)`
- meme pipeline de persistence/notification que l'hebdo.

Pour qui:

- rapport du clan cible,
- notifications pour les membres actifs de ce clan.

## Crons planifies automatiques

Les taches planifiees sont initialisees dans `initCronJobs()` (`src/lib/cron-jobs.ts`) si le worker est autorise.

### Conditions d'activation

- `ENABLE_CRON_JOBS=true` sur le worker cron
- `ENABLE_CRON_JOBS=false` (ou absent) sur le worker web en mode 2 workers
- timezone: `CLAN_MATCH_SYNC_TIMEZONE` (default `UTC`)

### Schedules (defaults)

- `CLAN_MATCH_SYNC_CRON`: `0 2 * * *` (sync matchs)
- `CLAN_STATS_RECALC_CRON`: `0 3 * * *` (recalcul stats)
- `CLAN_LIFETIME_STATS_SYNC_CRON`: `0 4 * * *` (lifetime)
- `WEEKLY_REPORT_GENERATION_CRON`: `0 8 * * 1` (rapport hebdo auto)
- `MONTHLY_REPORT_GENERATION_CRON`: `0 8 1 * *` (rapport mensuel auto)
- `CLAN_ONLINE_REMINDER_CRON`: `0 18 * * *` (rappels notif clan online)
- `WEEKLY_REPORT_REMINDER_CRON`: `0 9 * * *` (rappels notif rapport)
- challenge processing: `0 0 * * *` (minuit, quotidien)

### Ce que calculent les jobs auto

- `daily_sync`:
  - lance `sync-matches` pour chaque clan actif,
  - retry par clan (max 3 tentatives),
  - applique les memes garde-fous que le mode manuel:
    - import partiel -> status `partial`, recalcul stats ignore,
    - import sans nouveaux matchs -> recalcul ignore,
    - import complet avec nouveaux matchs -> recalcul stats automatique,
  - historise succes/partiel/echec par clan.
- `daily_stats_recalc`:
  - recalcule stats week/month/all pour chaque clan actif,
  - assigne badges + purge stats anciennes.
- `daily_lifetime_stats_sync`:
  - rafraichit stats lifetime pour chaque clan actif.
- `weekly_report_auto` / `monthly_report_auto`:
  - genere les rapports automatiques pour chaque clan actif,
  - notifie les membres actifs du clan.

Notes:

- Les actions `challenge_processing` et reminders existent dans le scheduler.
- Dans l'etat actuel, le traitement challenge n'ecrit pas d'entree `CronExecution` (pas de `start/finish` dans `processChallenges`).

## Sante, checks et historique (ce que montre la page)

### Bloc sante

La page agrège via `getCronOverview(clanId)`:

- taux de succes recent,
- nombre d'executions recentes,
- jobs en cours,
- echecs recents,
- dernier sync lifetime.

### Bloc configuration

`getCronConfigurationChecks()` controle:

- variables runtime (`ENABLE_CRON_JOBS`, `ENABLE_CRON_BOOTSTRAP`, `DATABASE_URL`, etc.),
- integrite des expressions cron,
- hints de remediation.

### Bloc runtime cron worker

`cron-control` sonde un endpoint interne securise:

- `GET /api/internal/cron/status`
- header `x-cron-bootstrap-secret`

Si `CRON_BOOTSTRAP_SECRET` manque cote web worker:

- la verification runtime est marquee "non configuree" (warning attendu).

### Historique

La table "Historique des cron" lit `CronExecution`:

- action,
- statut (`running`, `success`, `partial`, `failed`),
- debut, duree,
- source (`manual`, `scheduler`, `system`),
- message.

## Reponse a la question "calcul quoi, pour qui ?"

Synthese rapide:

- Sync matchs: importe les matchs PUBG + detecte squads, pour les membres actifs du clan cible (ou tous les clans en auto).
- Sync stats: recalcule stats week/month/all + badges + agrégats clan, pour les membres actifs du clan cible (ou tous les clans en auto).
- Sync lifetime: rafraichit les stats lifetime PUBG, pour les membres actifs du clan cible (ou tous les clans en auto).
- Rapports hebdo/mensuel: calcule highlights/charts/progression et persiste report, pour le clan cible; notifications aux membres actifs du clan.

## Bonnes pratiques d'exploitation

- Activer `ENABLE_CRON_JOBS=true` sur un seul worker dedie cron.
- Garder `INTERNAL_APP_URL` local (ex: `http://127.0.0.1:3000`) pour les appels internes.
- Surveiller les `partial` et les echec repetes dans l'historique.
- Ajuster `CLAN_MATCH_SYNC_TIMEZONE` (ex: `Europe/Paris`) si les horaires metier ne sont pas UTC.
- Traiter les warnings de configuration avant de considerer la supervision comme fiable.
