# Télémétrie PUBG — Vue d'ensemble

## Objectif

L'API PUBG expose deux niveaux de données pour chaque match. Le premier niveau, le résumé match (`GET /matches/{matchId}`), est consommé par le cron principal et fournit kills, dégâts, placement, durée et carte. Le second niveau, la télémétrie CDN, est un fichier JSON événementiel de 1 à 35 Mo (parfois davantage) disponible pendant 14 jours après chaque match.

La télémétrie est servie depuis `assets.pubg.com` et n'est pas comptée dans le quota RPM de l'API PUBG (`api.pubg.com`). Elle peut être récupérée sans passer par la queue de throttle.

Le pipeline télémétrie parse ces fichiers pour produire des agrégats persistés en base : statistiques d'armes par joueur, profils de jeu, synergies d'équipe, positions, zones de drop, économie de soins. Ces données alimentent les vues clan et membre de l'application.

---

## Flux de données de bout en bout

```
PUBG API GET /matches/{matchId}
   └── telemetryAssetUrl (dans relationships.assets, type "asset")
          |
          v
CDN assets.pubg.com — fichier JSON gzip, 1–35 Mo
   |
   v
Capture locale (.telemetry-captured/)       ← optionnel, réutilisable
   |
   v
Parser streaming (parser.ts)
   └── ParsedTelemetrySnapshot
          |
          v
Persistence DB (manual-sync.ts + persistence-payload.ts)
   ├── SquadMatchTelemetry      ← snapshot JSON brut des événements clés
   ├── MemberWeaponStats        ← agrégats par arme, par joueur
   └── MemberTelemetryStats     ← agrégats playstyle par joueur
          |
          v
Recalcul agrégats périodiques (period-aggregates.ts)
   └── MemberTelemetryStats par period/periodKey (week / month / all)
          |
          v
ClanSynergyTelemetryStats       ← paires de joueurs, revives croisés, co-kills
```

---

## Les trois modes de sync

### Comparatif

| | Direct Sync | Capture seule | Queue Resync |
|---|---|---|---|
| Bloquant | Oui | Non | Non |
| Fichiers locaux produits | Non (éphémère) | Oui | Requis en entrée |
| Volume recommandé | moins de 50 matchs | Illimité | 100 matchs et plus |
| Worker requis | Non | Non | Oui |
| Résultat | Immédiat | Fichiers sur disque | Asynchrone |

### Mode 1 — Direct Sync

Télécharge depuis l'API PUBG, capture localement et traite en une seule opération HTTP synchrone.

**Flux :** `PUBG API → téléchargement → capture .telemetry-captured/ → parsing → DB → agrégats`

**Endpoint :** `POST /api/clans/{id}/telemetry/sync-selected`

**Quand l'utiliser :** test rapide, développement, debug, moins de 50 matchs.

**Risque :** timeout HTTP si le batch est trop grand ou si les fichiers sont volumineux.

### Mode 2 — Capture seule

Télécharge et sauvegarde les fichiers JSON localement sans les traiter. Les fichiers sont conservés pour un traitement ultérieur.

**Flux :** `PUBG API → téléchargement → .telemetry-captured/   [arrêt]`

**Endpoint :** `POST /api/clans/{id}/telemetry/fetch-files-selected`

**Quand l'utiliser :** archivage, workflow en deux temps, debugging des fichiers bruts, préparation d'un Queue Resync.

### Mode 3 — Queue Resync

Enfile les jobs dans la table `CronExecution`. Le worker les traite en arrière-plan de manière asynchrone.

**Flux :**
```
Vérification fichiers capturés présents
   → enqueue CronExecution (status: queued)
   → retour immédiat à l'appelant

Worker Resync (boucle infinie) :
   claim atomique 1 job → reset DB optionnel → parse → persist
   → enqueue job telemetry_recalc_aggregates

Worker Agrégats :
   claim atomique 1 job → recalcul week/month/all → persist
```

**Endpoint :** `POST /api/clans/{id}/telemetry/resync-files-queue`

**Prérequis :** fichiers déjà capturés sur disque (mode Capture seule en amont).

**Quand l'utiliser :** production, 100 matchs et plus, backfill.

### Guide de décision

```
Quel volume ?
  Moins de 50 matchs   → Direct Sync (résultat immédiat)
  50 à 100 matchs      → Capture seule + Queue Resync
  100 matchs et plus   → Queue Resync avec worker en arrière-plan

Besoin de rejouer les données plus tard ?
  Oui → toujours passer par Capture seule d'abord
```

---

## Modèles de base de données produits

Le pipeline télémétrie produit et alimente les tables suivantes.

### SquadMatchTelemetry

Table centrale, un enregistrement par match (`@unique squadMatchId`). Contient :

- Les champs de statut : `status` (success/failed), `parserVersion`, `parsedAt`, `attemptCount`
- Les champs de métrique : `contentLength`, `bytesDownloaded`, `errorCode`, `errorMessage`
- Les champs JSON bruts issus du parser (voir `parser.ts` et `persistence-payload.ts`) :
  - `positionSamples` — positions x/y/phase des membres au fil du match, sub-samplé selon la taille du fichier (cap 2000 entrées)
  - `trajectorySegments` — segments de trajectoire reliant deux positions consécutives (cap 2000 entrées)
  - `deathSamples` — positions de mort des membres
  - `landingSamples` — positions de parachutage (depuis `LogParachuteLanding`, parser v2)
  - `killSamples` — positions et phases des kills
  - `shotSamples` — clusters spatiaux de tirs par arme (agrégés par cellule de 50 m)
  - `damageSamples` — clusters spatiaux de dégâts (agrégés par cellule de 30 m)
  - `knockoutSamples` — positions des knockouts donnés et reçus
  - `reviveSamples` — positions des revives
  - `vehicleSamples` — événements véhicule (monte/descend)
  - `memberStats` — agrégats par membre : kills, headshots, dégâts, revives, knockouts, blueZoneHits, healsUsed, boostsUsed, maxVehicleSpeedKph, statistiques d'armes
  - `weaponStats` — agrégats par arme sur l'ensemble du match (kills, headshots, dégâts, shotsFired, hitsLanded)
  - `phaseSnapshots` — snapshots de l'état de la partie (zone, joueurs en vie, phase) à chaque `LogGameStatePeriodically`
  - `summary` — compteurs globaux d'événements parsés

### MemberWeaponStats

Agrégats par arme, par joueur, par période. Champs : `weaponName`, `kills`, `headshots`, `avgDistance`, `shotsFired`, `hitsLanded`, `matchCount`. Clé unique : `(memberId, period, weaponName)`.

### MemberTelemetryStats

Agrégats de playstyle par joueur, par période. Champs : `avgKillsPerGame`, `avgDamageDealt`, `avgRevivesPerGame`, `avgHealsUsed`, `avgHealAmount`, `avgBoostsUsed`, `maxVehicleSpeedKph`, `firstKillPhase`, `blueZoneHitsRate`, `circleDelayPercent`, et plusieurs autres indicateurs de comportement. Clé unique : `(memberId, period, periodKey)`.

### ClanSynergyTelemetryStats

Synergies entre paires de joueurs du clan sur une période. Champs : `memberAId`, `memberBId`, `reviveCount`, `coKillCount`, `matchesTogether`. Clé unique : `(memberAId, memberBId, period, periodKey)`.

### Articulation des modèles

```
SquadMatch (1) ──── (1) SquadMatchTelemetry
                            │
            ┌───────────────┼──────────────────┐
            ↓               ↓                  ↓
   (source pour)    (source pour)       (source pour)
  MemberWeaponStats  MemberTelemetryStats  ClanSynergyTelemetryStats
  (agrégé via        (agrégé via           (agrégé via
  period-aggregates) period-aggregates)    period-aggregates)
```

Le recalcul des agrégats relit tous les `SquadMatchTelemetry` d'un clan sur une période et recalcule intégralement `MemberTelemetryStats` et `ClanSynergyTelemetryStats`. `MemberWeaponStats` est calculé de la même manière.

---

## Configuration — Variables d'environnement

### Capture et parsing

| Variable | Défaut | Description |
|---|---|---|
| `TELEMETRY_CAPTURE_FIXTURES` | `true` | Activer la capture locale des fichiers |
| `TELEMETRY_CAPTURE_FIXTURES_DIR` | `.telemetry-captured` | Répertoire des fichiers capturés |
| `TELEMETRY_CAPTURE_MAX_BYTES` | `250 * 1024 * 1024` | Taille max d'un fichier capturé (250 Mo) |
| `TELEMETRY_FETCH_TIMEOUT_MS` | `30000` | Timeout requête CDN (ms) |
| `TELEMETRY_MAX_ASSET_SIZE_MB` | `250` | Taille max d'asset téléchargé |
| `TELEMETRY_PARSER_VERSION` | `v1` | Version du parser stockée en DB |

### Echantillonnage positions

| Variable | Défaut | Description |
|---|---|---|
| `TELEMETRY_POSITION_SAMPLE_INTERVAL_SECONDS` | auto | Override de l'intervalle (5–300). Si absent, grille automatique par taille de fichier |
| `TELEMETRY_SHOT_CLUSTER_RADIUS_METERS` | `50` | Rayon de regroupement spatial des tirs |
| `TELEMETRY_DAMAGE_CLUSTER_RADIUS_METERS` | `30` | Rayon de regroupement spatial des dégâts |

### Worker Resync

| Variable | Défaut | Description |
|---|---|---|
| `TELEMETRY_RESYNC_WORKER_POLL_MS` | `2000` | Délai entre deux polls si queue vide |
| `TELEMETRY_RESYNC_WORKER_ID` | `pid-{PID}` | Identifiant du worker |
| `TELEMETRY_RESYNC_STUCK_RECOVERY_MS` | `120000` | Age minimal (ms) pour récupérer un job bloqué en `running` |
| `TELEMETRY_WORKER_GC_ENABLED` | `false` | Forcer GC après chaque job (`--expose-gc` requis) |
| `TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT` | `80` | Seuil haute pression mémoire |
| `TELEMETRY_WORKER_MEMORY_CRITICAL_PCT` | `95` | Seuil critique mémoire |

### Worker Agrégats

| Variable | Défaut | Description |
|---|---|---|
| `TELEMETRY_AGGREGATE_WORKER_POLL_MS` | `3000` | Délai de polling de la queue d'agrégats |
| `TELEMETRY_AGGREGATES_WRITE_BATCH_SIZE` | `250` | Taille des lots `createMany` pendant le recalcul |

---

## Statut des phases

### Phase 1 — Mode manuel avec monitoring (complete)

- Endpoint `POST /sync-batch-manual` : enqueue de jobs depuis l'UI ou le CLI
- CLI `npm run telemetry:batch` : enqueue batch, check statut, dead letter
- Worker dédié hors process Next.js
- Monitoring de la file en temps réel

### Phase 2 — Protection mémoire (complete)

- `MemoryMonitor` : suivi heap Node.js, 20 derniers samples
- `BackpressureController` : pause automatique si heap > 80 %, arrêt critique si > 95 %
- GC optionnel après chaque job (`TELEMETRY_WORKER_GC_ENABLED`)
- Dead letter queue : jobs > 3 tentatives ou > 1h
- `WorkerHealthMonitor` : jobs/success/fail/durée/pic mémoire, taux de succès, tendance mémoire

### Phase 3 — Dashboard et gestion de queue (complete)

- Dashboard `/clans/[id]/telemetry/dashboard` : métriques temps réel, actions rapides
- Page erreurs `/clans/[id]/telemetry/errors` : navigation des jobs échoués, retry manuel
- Endpoint `queue-cleanup` : reorder par priorité, nettoyage stale, annulation running
- Export métriques JSON + Prometheus (`GET /api/clans/{id}/telemetry/metrics`)
- `BatchSizeTuner` : recommandation de taille de batch selon pression mémoire
- `StaleCleanup` : suppression jobs `queued` > 24h, jobs `failed` > 7 jours

---

## Ce qui reste à faire

| Point | Impact | Notes |
|---|---|---|
| Streaming JSON parser | Mémoire | `resync-files.ts` charge encore les fichiers en mémoire complète avant de les parser. Un vrai streaming JSON (ex. `jsonstream`) réduirait l'empreinte mémoire sur les gros fichiers. |
| Backfill v1 → v2 | Données | Les matchs parsés avant la migration v2 n'ont pas `landingSamples` ni `maxVehicleSpeedKph`. Un job de backfill re-parserait ces matchs depuis les fichiers capturés encore présents. |
| Auto-cleanup cron | Ops | Le nettoyage des fichiers `.telemetry-captured/` anciens et des jobs `failed` anciens n'est pas encore déclenché automatiquement par un cron. Il doit être lancé manuellement via `queue-cleanup`. |
