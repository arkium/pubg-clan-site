# Télémétrie PUBG — Pipeline détaillé

## Architecture générale

```
┌──────────────────────────────────────────────────────┐
│  Interface Web                                        │
│  /clans/[id]/telemetry/matches/session/[date]         │
│  /clans/[id]/telemetry/dashboard                      │
│  /clans/[id]/telemetry/errors                         │
└────────────────────────┬─────────────────────────────┘
                         │
┌──────────────────────────────────────────────────────┐
│  Routes API                                           │
│  POST /sync-selected           (Direct Sync)          │
│  POST /fetch-files-selected    (Capture seule)        │
│  POST /resync-files-queue      (Queue Resync)         │
│  GET  /sync-batch-manual       (statut file)          │
│  POST /queue-cleanup           (maintenance)          │
│  GET  /metrics                 (JSON + Prometheus)    │
└────────────────────────┬─────────────────────────────┘
                         │ table CronExecution
                         ▼
┌──────────────────────────────────────────────────────┐
│  File persistante (CronExecution)                     │
│  queued → running → success / failed                  │
└────────────────────────┬─────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
┌───────────────────────┐  ┌──────────────────────────┐
│  Worker Resync        │  │  Worker Agrégats          │
│  telemetry-resync-    │  │  telemetry-aggregate-     │
│  worker.ts            │  │  worker.ts                │
│  • claim 1 job        │  │  • claim 1 job            │
│  • parse fichier      │  │  • recalcul week/month/   │
│  • persist DB         │  │    all                    │
│  • enqueue agrégats   │  │  • persist par batches    │
└───────────────────────┘  └──────────────────────────┘
```

---

## Pipeline étape par étape

### Etape 1 — Récupération de l'URL télémétrie

La fonction `fetchMatchDetailsWithTelemetryAsset` (`src/lib/pubg.ts`) appelle `GET /shards/{shard}/matches/{matchId}`. La réponse inclut un tableau `included` contenant les assets du match. L'asset de type `"asset"` porte l'URL télémétrie dans son champ `attributes.URL`.

Cette URL pointe vers le CDN `assets.pubg.com`. Elle est disponible pendant 14 jours après le match.

La fonction retourne :
- `telemetryAssetUrl` — URL directe du fichier JSON gzip
- `telemetryGeneratedAt` — horodatage de génération du fichier

### Etape 2 — Téléchargement CDN en streaming

La fonction `downloadTelemetryFromAsset` (`src/lib/pubg-telemetry/client.ts`) :

1. Effectue un `fetch` sur l'URL CDN avec un timeout configurable (`TELEMETRY_FETCH_TIMEOUT_MS`, défaut 30 s)
2. Vérifie le `Content-Length` pour rejeter les fichiers dépassant `TELEMETRY_MAX_ASSET_SIZE_MB`
3. Retourne un `ReadableStream<Uint8Array>` et la taille effective

Le fichier est en format JSON gzip. La décompression est gérée par le `DecompressionStream('gzip')` intégré à la plateforme Web Streams (disponible en Node.js 18+). Aucune dépendance externe n'est requise pour ce step.

Si la capture locale est activée (`TELEMETRY_CAPTURE_FIXTURES=true`), le stream est tee'd : une branche écrit dans `.telemetry-captured/{prefix}-{squadMatchId}.json` et l'autre est passée au parser. Cela garantit que le fichier brut est sauvegardé avant que le parsing commence.

### Etape 3 — Parse du JSON (parser.ts)

La fonction `parseTelemetrySnapshotFromStream` lit le `ReadableStream` en chunks et construit un accumulateur `TelemetryAccumulator` événement par événement.

Chaque événement est identifié par son champ `_T` (ou `eventType` dans les anciennes versions de l'API). Le parser dispatche vers le handler correspondant selon ce type.

La liste complète des événements parsés et des données extraites est documentée dans `docs/telemetry/parser.md`.

Le parser retourne un `ParsedTelemetrySnapshot` contenant tous les agrégats et samples calculés.

### Etape 4 — Persistence des agrégats

La fonction `syncTelemetryForSquadMatchFromStream` (`src/lib/pubg-telemetry/manual-sync.ts`) orchestre la persistence :

1. Elle appelle le parser pour obtenir le snapshot.
2. Elle applique le cap de sécurité `capParsedSnapshotForDb` : `positionSamples` et `trajectorySegments` sont plafonnés à 2000 entrées par sub-sampling régulier si le parser a produit davantage.
3. Elle construit le payload Prisma via `buildTelemetrySuccessPayloadWithJson` (`persistence-payload.ts`).
4. Elle effectue un `upsert` sur `SquadMatchTelemetry`.

En cas d'erreur Prisma sur les champs JSON (souvent liée à la taille des colonnes JSON selon le moteur MySQL), un fallback SQL direct (`persistence-fallback.ts`) est tenté pour écrire les champs JSON via des requêtes SQL brutes.

### Etape 5 — Recalcul des agrégats périodiques

Après chaque resync réussi, un job `telemetry_recalc_aggregates` est enfilé pour le clan concerné. Le worker agrégats (`scripts/telemetry-aggregate-worker.ts`) le claim et exécute `recalculateTelemetryPeriodAggregatesForClan` (`src/lib/pubg-telemetry/period-aggregates.ts`).

Ce recalcul :
1. Relit tous les `SquadMatchTelemetry` du clan pour la période (`week`, `month`, `all`)
2. Calcule les moyennes et totaux par joueur
3. Effectue un `deleteMany` + `createMany` par batches (`TELEMETRY_AGGREGATES_WRITE_BATCH_SIZE`, défaut 250) pour limiter les pics mémoire
4. Produit les enregistrements `MemberTelemetryStats`, `MemberWeaponStats` et `ClanSynergyTelemetryStats`

---

## Parser v1 vs parser v2

Le champ `parserVersion` dans `SquadMatchTelemetry` indique quelle version du parser a produit les données.

| Champ | Parser v1 | Parser v2 |
|---|---|---|
| kills, headshots, dégâts | Oui | Oui |
| Synergies revives | Oui | Oui |
| Profil de jeu (firstKillPhase, circleDelay) | Oui | Oui |
| Positions x/y | Oui | Oui |
| `landingSamples` (parachute) | Non | Oui |
| `maxVehicleSpeedKph` | Non | Oui |
| `LogHeal` (avgHealsUsed, avgHealAmount, avgBoostsUsed) | Non | Oui |
| `LogWeaponFireCount` (shotsFired) | Non | Oui |
| `shotSamples` / `damageSamples` (clusters spatiaux) | Non | Oui |
| `killSamples`, `knockoutSamples`, `reviveSamples`, `vehicleSamples` | Non | Oui |

Les matchs parsés avec v1 n'ont pas `landingSamples` ni `maxVehicleSpeedKph`. Le backfill v1 → v2 consiste à re-parser ces matchs depuis les fichiers capturés (si encore présents sur disque) en passant par le Queue Resync.

---

## Mode batch — CLI

Le script `scripts/telemetry-batch.ts` permet d'enqueuer des jobs depuis la ligne de commande.

```bash
# Enqueue les matchs récents d'un clan (sans télémétrie déjà parsée)
npm run telemetry:batch -- --clan 1

# Enqueue tous les matchs d'un clan y compris les anciens
npm run telemetry:batch -- --clan 1 --all-matches

# Enqueue tous les clans
npm run telemetry:batch -- --all-clans

# Recalculer les agrégats sans resync des fichiers
npm run telemetry:batch -- --clan 1 --recalc-aggregates-only

# Vérifier l'état de la file
npm run telemetry:batch -- --check --clan 1

# Voir les jobs en dead letter
npm run telemetry:batch -- --dead-letter --clan 1

# Relancer un job depuis dead letter
npm run telemetry:batch -- --retry-dead-letter <jobId> --clan 1
```

Le CLI vérifie pour chaque match que le fichier capturé est présent avant d'enqueuer le job. Un match déjà `queued` ou `running` n'est pas reenfilé (déduplication par `squadMatchId`).

---

## Gestion des erreurs

### Retry avec backoff

Un job `failed` peut être relancé depuis l'UI (page erreurs) ou le CLI (`--retry-dead-letter`). Chaque tentative incrémente le champ `attemptCount` dans `SquadMatchTelemetry`.

### Dead letter queue

Un job passe en dead letter (visible via `GET /api/clans/{id}/telemetry/dead-letter`) lorsqu'il a échoué 3 fois ou qu'il est resté en `failed` plus d'une heure.

```bash
# Via API
GET  /api/clans/{id}/telemetry/dead-letter
POST /api/clans/{id}/telemetry/dead-letter   # relance un job

# Via CLI
npm run telemetry:batch -- --dead-letter --clan 1
npm run telemetry:batch -- --retry-dead-letter <jobId> --clan 1
```

### Annulation des jobs bloqués

Un job reste en `running` si le worker a crashé en cours de traitement. Pour débloquer :

```bash
# UI : bouton "Annuler jobs bloqués" sur la page session
# API :
curl -X POST http://localhost:3000/api/clans/1/telemetry/queue-cleanup \
  -H "Content-Type: application/json" \
  -d '{"action":"cancel-old","cancelMaxAgeMs":1}'
```

Au prochain démarrage du worker, `recoverStuckTelemetryResyncJobs` remet en `queued` les jobs `running` depuis plus de `TELEMETRY_RESYNC_STUCK_RECOVERY_MS` (défaut 120 000 ms).

---

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/lib/pubg-telemetry/index.ts` | Point d'entrée Direct Sync : orchestration fetch + parse + persist |
| `src/lib/pubg-telemetry/client.ts` | Téléchargement CDN en streaming, décompression gzip |
| `src/lib/pubg-telemetry/parser.ts` | Parse JSON événementiel → `ParsedTelemetrySnapshot` |
| `src/lib/pubg-telemetry/manual-sync.ts` | Sync depuis stream : cap DB + persist |
| `src/lib/pubg-telemetry/persistence-payload.ts` | Construction payload Prisma depuis le snapshot |
| `src/lib/pubg-telemetry/persistence-fallback.ts` | Fallback SQL si Prisma rejette les champs JSON |
| `src/lib/pubg-telemetry/resync-files.ts` | Lecture des fichiers capturés, intervalle adaptatif, adaptateur stream |
| `src/lib/pubg-telemetry/resync-queue.ts` | Gestion de la file CronExecution (enqueue, claim, finish, recover) |
| `src/lib/pubg-telemetry/aggregate-recalc-queue.ts` | File dédiée au recalcul des agrégats |
| `src/lib/pubg-telemetry/period-aggregates.ts` | Recalcul complet des agrégats périodiques pour un clan |
| `src/lib/pubg-telemetry/backlog.ts` | Identification des matchs sans télémétrie pour le batch CLI |
| `scripts/telemetry-resync-worker.ts` | Process worker Resync (boucle infinie ou one-shot) |
| `scripts/telemetry-aggregate-worker.ts` | Process worker Agrégats |
| `scripts/telemetry-batch.ts` | CLI batch : enqueue, check, dead letter |
