# Télémétrie — « Données » d'un clan

Pages d'exploitation du pipeline de télémétrie d'un clan : onglets de `/clans/[clanId]/settings/data`, réservés au
SuperUser (`AdminAccessGate` Plateforme dans le `layout.tsx` du dossier, routes en `requirePlatformAdmin`), jamais
délégués aux Owners ([administration.md](../TODO/administration.md) Q17, Q20).

> **Trois onglets depuis le 2026-10-11** ([administration.md](../TODO/administration.md) §8) : Santé, Soirées,
> Récupérations. Les anciens onglets État, Erreurs et Synchronisation sont fondus ou supprimés ; leurs adresses sont
> redirigées (`next.config.ts`). Une seule entrée de menu : `superuser.clan-data` (« Données du clan »).

## Deux files, un worker

Le worker (`scripts/telemetry-resync-worker.ts`) consomme deux files distinctes de `CronExecution` :

| File | `action` | Rôle | Alimentée par |
|---|---|---|---|
| Récupération PUBG | `telemetry_live_sync` | télécharge le fichier chez PUBG, puis l'analyse | synchronisation nocturne, mise en file d'une soirée, backlog et urgences de Récupérations, console `/settings/telemetry`, relance d'un échec, synchronisation d'un tournoi |
| Retraitement de fichiers | `telemetry_resync_file` | réanalyse un fichier déjà capturé dans `.telemetry-captured/` | soirée (mode « Traiter les fichiers »), CLI `telemetry:batch` |

Les pages nomment toujours la file dont elles parlent : avant le 2026-10-11, État et Santé affichaient chacun une
« File de traitement », sur deux files différentes.

## Pages

| Adresse | Contenu |
|---|---|
| `/clans/[clanId]/settings/data` | **Santé des données** : couverture, pipeline, files du worker |
| `/clans/[clanId]/settings/data/sessions` | **Soirées** : soirées de la période et part de leurs parties analysées |
| `/clans/[clanId]/settings/data/sessions/[date]` | Panneau d'exploitation d'une soirée |
| `/clans/[clanId]/settings/data/recoveries` | **Récupérations** : couverture et mises en file, échecs, échantillon, historique |

| Ancienne adresse | Redirigée vers |
|---|---|
| `…/settings/data/state`, `/clans/[clanId]/telemetry/dashboard` | `…/settings/data` |
| `…/settings/data/errors`, `/clans/[clanId]/telemetry/errors` | `…/settings/data/recoveries#echecs` |
| `…/settings/data/sync`, `/clans/[clanId]/telemetry/sync-batch-manual` | `…/settings/data/sessions` |
| `/clans/[clanId]/telemetry/recoveries` | `…/settings/data/recoveries` |

Onglets : `dataSectionTabs` (`src/lib/clan-data-section.ts`), rendus par `DataSectionTabs` sous le bandeau
(soulignement accent dès 768 px, menu déroulant en dessous). Liens internes et ancres (`#echecs`, `#couverture`) : même
module. Calculs des deux files : `src/lib/clan-telemetry-view.ts`.

---

## Santé des données — `/clans/[clanId]/settings/data`

Fichier : `src/app/clans/[clanId]/settings/data/page.tsx`. Bouton « Actualiser » du bandeau : relit les trois sources.

| Bloc | Source | Contenu |
|---|---|---|
| Télémétrie des parties | `GET …/settings/data-health` | parties des 30 derniers jours, avec et sans télémétrie (dont expirées chez PUBG), dernière télémétrie. « Mettre en file → » mène à Récupérations › Couverture |
| Pipeline de récupération (`PipelineHealthSection`) | `GET …/telemetry/observability?window=…&limit=200` | jobs live_sync de la période (24 h, 7 j, 30 j, Tout) : nombre, taux de succès et d'échec hors parties expirées, durée p95, alertes de seuil (échec > 5 %, p95 > 15 s) |
| Files du worker pour ce clan (`WorkerQueuesPanel`) | `…/settings/data-health` et `GET …/telemetry/sync-batch-manual` | « Récupération PUBG » : en file, échecs sur 7 jours. « Retraitement de fichiers » : en attente, en cours, réussis, échoués (depuis l'origine) |

Actions du bloc des files, sur la file de retraitement seulement :

| Action | Route | Effet |
|---|---|---|
| Nettoyer la file de retraitement (modale de confirmation) | `POST …/telemetry/queue-cleanup` `{ action: 'cleanup-stale', maxAgeHours: 24 }` | **supprime** les jobs en attente depuis plus de 24 h et les échecs de plus de 7 h, clôt ceux en cours depuis plus de 4 h |
| Exporter les métriques | `GET …/telemetry/metrics?format=prometheus` | fichier texte : compteurs de la file de retraitement du clan |

Retirés le 2026-10-11 : la **resynchronisation rapide** (même sélection que « Mettre en file le backlog », plafond de
50 parties par 24 h pensé pour l'Owner, jamais utilisée), le **réordonnancement** de la file (aucune trace d'usage,
permettait de passer devant les autres clans) et l'actualisation automatique toutes les 30 s. Le 2026-10-12, leurs
routes devenues sans appelant ont été supprimées : `POST …/settings/data-health/resync` (avec son registre de quota
et l'option « basse priorité » de la mise en file), les actions `reorder-priority` et `cleanup-failed` de `queue-cleanup`.

## Soirées — `/clans/[clanId]/settings/data/sessions` et `…/[date]`

Inchangées par la consolidation. La liste montre chaque soirée de la période (bandeau de période docké) et la part de
ses parties analysées. La soirée liste ses parties à cocher et propose trois modes :

| Mode | Route | File |
|---|---|---|
| Mise en file directe | `POST …/telemetry/sync-selected-enqueue` | live_sync ; file suivie en direct toutes les 5 s |
| Capture seule | `POST …/telemetry/fetch-files-selected` | aucune : téléchargement pendant la requête, fichiers gardés sur le serveur |
| Traiter les fichiers | `POST …/telemetry/resync-files-queue` (ou `resync-files-selected`, « Traiter maintenant ») | resync_file ; « Annuler les jobs en cours » (`queue-cleanup` `cancel-old`) |

Plus l'effacement de la télémétrie et des fichiers des parties cochées (`POST …/telemetry/clear-selected`, modale de
confirmation). C'est l'endroit où l'on agit sur une partie précise : Récupérations y renvoie.

## Récupérations — `/clans/[clanId]/settings/data/recoveries`

Fichier : `src/app/clans/[clanId]/settings/data/recoveries/page.tsx`. Sélecteur de clan, lien « Moteur et tous les
clans » vers `/settings/telemetry` (worker, file commune, synchronisation nocturne), lien « Matchs du clan ».

| Bloc | Source | Contenu |
|---|---|---|
| Couverture et backlog (`#couverture`) | `GET …/telemetry/recoveries?limit=150` | toutes les parties du clan : complétées, expirées, récupérables, urgentes (7 à 14 jours), en file. Actions : mettre en file les urgences ou le backlog (`POST …/telemetry/recoveries`, 250 parties par clic), réparer les JSON manquants (`POST …/telemetry/backfill-null-json`, jusqu'à 150 parties retéléchargées chez PUBG pendant la requête). Rappel de la CLI `npm run telemetry:batch -- --clan <id> --all-matches` |
| Échecs (`#echecs`, `TelemetryFailuresSection`) | `GET …/telemetry/observability?limit=300` et `GET …/telemetry/sync-batch-manual` | une liste par file, sur la période choisie. Récupération PUBG : dernier job de chaque partie s'il a échoué hors expiration, lien « État de la partie » ; relance = `POST …/telemetry/sync-selected-enqueue`. Retraitement de fichiers : échecs parmi les 20 derniers jobs ; relance = `POST …/telemetry/dead-letter`. « Tout relancer » : 50 au plus par file. Les échecs par expiration chez PUBG sont comptés, pas relançables |
| Échantillon récent | `…/telemetry/recoveries` | compteurs des 150 dernières lignes de télémétrie du clan |
| Historique des récupérations | `…/telemetry/recoveries` | filtres, tri par en-têtes, export CSV, pagination ; « Soirée » et « Partie » mènent à la soirée des Données (période choisie d'après la date de la partie) |

`GET …/telemetry/recoveries` ne calcule plus que la couverture du clan demandé (`getClanTelemetryBacklog`, 0,3 à
0,55 s mesurées le 2026-10-11 contre 7 s pour l'agrégat de tous les clans) et ne renvoie plus l'état du moteur.

Retirés le 2026-10-11 : le bloc « Moteur et file d'attente » (identique à `/settings/telemetry`), le bloc « Santé de
la télémétrie » (taux recalculés dans le navigateur, taille et délai médians), la liste sans action d'« Observabilité
des jobs » (ses indicateurs sont dans Santé, ses jobs dans Échecs), l'onglet Erreurs (fondu dans Échecs) et l'onglet
Synchronisation (saisie d'identifiants, sans usage tracé : on agit depuis la soirée, la page « État » d'un match ou la
CLI ; son `POST …/telemetry/sync-batch-manual` a été supprimé le 2026-10-12).

---

## Export de métriques — `GET /api/clans/[clanId]/telemetry/metrics`

Fichier : `src/app/api/clans/[clanId]/telemetry/metrics/route.ts`. Compteurs lus dans `CronExecution`, **file de
retraitement de fichiers seulement** (`telemetry_resync_file`) :

```typescript
{
  clanId: number
  timestamp: string
  queue: { queued, running, success, failed, total }
  performance: {
    avgDurationMs: number   // moyenne des 100 derniers jobs réussis
    successRate: number     // success / (success + failed), en %
    recentFailures: number  // échecs de la dernière heure
  }
}
```

`?format=prometheus` renvoie les mêmes valeurs en texte (`telemetry_jobs_queued{clan="…"}`, etc.).

## Pistes

- **Métriques de la file de récupération** : l'export Prometheus ne compte que la file de retraitement, qui ne sert
  plus guère ; l'étendre à `telemetry_live_sync` le rendrait utile.
- **Filtrer les échecs** par code d'erreur ou par joueur, si leur nombre le justifie un jour.
- **Nettoyage automatique** de la file de retraitement : voir `docs/telemetry/ops.md`.
