# Télémétrie PUBG — Worker

## Architecture du worker séparé

Le pipeline télémétrie utilise deux workers Node.js distincts, tous deux hors du process Next.js :

| Worker | Script | Rôle |
|---|---|---|
| Worker Resync | `scripts/telemetry-resync-worker.ts` | Claim, parse et persist les fichiers capturés |
| Worker Agrégats | `scripts/telemetry-aggregate-worker.ts` | Recalcul des agrégats périodiques après chaque resync |

Les deux workers tournent en boucle infinie indépendante. Ils peuvent aussi être lancés en mode one-shot.

```bash
# Worker Resync
npm run telemetry:worker            # boucle infinie, polling 2 s
npm run telemetry:worker:once       # traite les jobs en attente puis exit
npm run telemetry:worker:gc         # mode one-shot avec --expose-gc
npm run telemetry:worker:monitored  # boucle infinie avec --expose-gc

# Worker Agrégats
npm run telemetry:aggregates:worker       # boucle infinie
npm run telemetry:aggregates:worker:once  # one-shot
```

La séparation des deux workers garantit qu'un resync lourd (fichier 30 Mo) ne bloque pas le recalcul d'agrégats pour d'autres matchs déjà parsés.

---

## Queue de jobs

### Table CronExecution

Les deux workers consomment la table `CronExecution` avec des actions distinctes :

| Action | Worker |
|---|---|
| `telemetry_resync_file` | Worker Resync |
| `telemetry_recalc_aggregates` | Worker Agrégats |

### Etats d'un job

```
queued → running → success
                ↘ failed
```

| Etat | Description |
|---|---|
| `queued` | En attente de traitement |
| `running` | Claim atomique par un worker, traitement en cours |
| `success` | Traitement terminé avec succès |
| `failed` | Echec (erreur applicative, crash worker, timeout) |

Un job reste `failed` jusqu'à ce qu'il soit relancé manuellement. Il n'est pas automatiquement réessayé (sauf via dead letter ou bouton UI).

### Claim atomique

Le claim utilise une mise à jour SQL atomique : `UPDATE CronExecution SET status='running', startedAt=NOW() WHERE status='queued' AND ... LIMIT 1`. Cela garantit qu'un même job ne peut pas être claim par deux workers simultanément.

### Déduplication

Un match déjà `queued` ou `running` n'est pas reenfilé. La vérification se fait par `squadMatchId` avant chaque enqueue.

---

## Démarrage et récupération des jobs bloqués

Au démarrage en mode boucle, le Worker Resync appelle `recoverStuckTelemetryResyncJobs` qui :

1. Cherche tous les jobs avec `status = 'running'` et `startedAt < NOW() - TELEMETRY_RESYNC_STUCK_RECOVERY_MS`
2. Les remet en `status = 'queued'`

La durée minimale pour qu'un job soit considéré bloqué est configurable via `TELEMETRY_RESYNC_STUCK_RECOVERY_MS` (défaut : 120 000 ms soit 2 minutes). Si le worker est relancé moins de 2 minutes après un crash, le job bloqué n'est pas encore récupérable.

Le Worker Agrégats applique le même mécanisme via `recoverStuckTelemetryAggregateRecalcJobs`.

**Important :** `recoverStuckTelemetryResyncJobs` remet les jobs en `queued`, pas en `failed`. Un job qui crashe systématiquement sera reclaim au prochain démarrage du worker et crashera à nouveau (boucle infinie). Voir la section "Boucle infinie crash-recovery" ci-dessous.

---

## Verrou single-instance

Pour éviter les lancements accidentels concurrents (deux terminaux, redémarrage systemd en double), les deux workers utilisent un verrou fichier local :

| Worker | Fichier de verrou |
|---|---|
| Resync | `.telemetry-resync-worker.lock` |
| Agrégats | `.telemetry-aggregate-worker.lock` |

Comportement au démarrage en mode boucle :
1. Le worker tente d'acquérir le verrou.
2. Si un autre process actif détient le verrou, le worker sort proprement.
3. Si le verrou est stale (PID mort ou âge dépassant `TELEMETRY_RESYNC_WORKER_LOCK_STALE_MS`, défaut 30 min), il est nettoyé et réacquis.

Le verrou est libéré à l'arrêt propre du worker (SIGTERM, SIGINT).

---

## Monitoring mémoire

### MemoryMonitor (memory-monitor.ts)

Surveille l'utilisation de la heap Node.js via `process.memoryUsage()` et `v8.getHeapStatistics()`.

Métriques exposées :
- `heapUsed` — mémoire heap actuellement utilisée (octets)
- `heapTotal` — taille totale de la heap allouée
- `heapSizeLimit` — limite maximale de la heap (depuis V8)
- `percentUsed` — `heapUsed / heapSizeLimit * 100`
- `external` — mémoire C++ liée à des objets JS

Le monitor conserve les 20 derniers samples (`maxStoredMetrics = 20`) et expose :
- `getAverageHeapUsedPercent()` — moyenne sur les samples stockés
- `getPeakHeapUsedPercent()` — pic sur les samples stockés
- `getStoredMetrics()` — liste complète des 20 derniers samples

### BackpressureController (worker-backpressure.ts)

Contrôle le rythme de claim des jobs en fonction de la pression mémoire.

Comportement :
- **Haute pression (> 80 %)** : pause de `highPressureDelayMs` (défaut 5 000 ms) avant le prochain claim, jusqu'à 3 tentatives
- **Pression critique (> 95 %)** : pause de `criticalPauseDelayMs` (défaut 2 000 ms) entre chaque tentative, jusqu'à 3 tentatives
- **Si critique après 3 tentatives** : exception levée, job non claim, worker reprend la boucle de polling

Après chaque job traité avec succès, `forceGC()` est appelé si `TELEMETRY_WORKER_GC_ENABLED=true` et si `global.gc` est disponible (`--expose-gc` requis).

---

## Dead letter queue

Un job entre en dead letter lorsqu'il a échoué 3 fois ou qu'il est resté en `failed` plus d'une heure.

### Consultation

```bash
# Via API
GET /api/clans/{id}/telemetry/dead-letter

# Via CLI
npm run telemetry:batch -- --dead-letter --clan 1
```

### Relance

```bash
# Via API
POST /api/clans/{id}/telemetry/dead-letter
# Body : { "jobId": "...", "action": "retry" }

# Via CLI
npm run telemetry:batch -- --retry-dead-letter <jobId> --clan 1
```

---

## WorkerHealthMonitor (worker-health.ts)

Collecte des métriques de santé du worker sur sa durée de vie.

Métriques exposées dans `WorkerMetricsSnapshot` :
- `jobsProcessed` — total de jobs traités
- `jobsSucceeded` — succès
- `jobsFailed` — échecs
- `avgDurationMs` — durée moyenne de traitement
- `peakMemory` — pic mémoire heap observé (octets)
- `currentMemory` — mémoire heap courante
- `lastJobAt` — horodatage du dernier job
- `isHealthy` — `true` si le taux d'échec est inférieur à 50 %

Le monitor conserve les 50 derniers samples mémoire (`maxMemoryMetrics = 50`) et expose une tendance mémoire via `getMemoryTrend()` : `'stable'` / `'rising'` / `'falling'` (basé sur les 3 derniers samples, seuil de 10 Mo de variation).

Les métriques sont émises dans les logs toutes les 30 secondes :
```
[TelemetryResyncWorker] metrics { jobsProcessed, jobsSucceeded, ... }
```

---

## BatchSizeTuner (batch-tuner.ts)

Analyse la pression mémoire et les performances pour recommander une taille de batch.

Logique d'ajustement (cooldown 60 secondes entre deux ajustements) :
- Pression critique → réduire de 2
- Haute pression avec jobs lents (> 10 000 ms en moyenne) → réduire de 1
- Mémoire en baisse et batch actuel inférieur à 5 → augmenter de 1

Le tuner ne modifie pas directement le comportement du worker (qui traite 1 job à la fois). Il produit des recommandations accessibles via le dashboard.

---

## Priorité des jobs (queue-priority.ts)

La fonction `reorderQueueByPriority` réordonne les jobs `queued` par récence du match associé (matchs les plus récents traités en premier). Elle est appelée via l'action `reorder-priority` de l'endpoint `queue-cleanup` ou depuis le dashboard.

La priorité est implémentée en manipulant `startedAt` des enregistrements `CronExecution` : une valeur plus ancienne de `startedAt` = priorité plus haute (orderBy `startedAt asc`).

---

## Nettoyage stale (stale-cleanup.ts)

La fonction `cleanupStaleJobs` supprime ou fait expirer les jobs obsolètes :

| Opération | Condition | Action |
|---|---|---|
| Suppression stale queued | `status='queued'` et `createdAt < NOW() - 24h` | `DELETE` |
| Suppression old failed | `status='failed'` et `createdAt < NOW() - 7j` | `DELETE` |
| Timeout running | `status='running'` et `startedAt < NOW() - 4h` | Passage en `failed` |

Déclenchement : via l'action `cleanup-stale` de l'endpoint `queue-cleanup`, ou depuis le dashboard.

```bash
# Via API
curl -X POST http://localhost:3000/api/clans/1/telemetry/queue-cleanup \
  -H "Content-Type: application/json" \
  -d '{"action":"cleanup-stale","maxAgeHours":24}'
```

---

## Bug critique — Readable.toWeb() sur Node.js 22

### Symptôme

Le worker crashe avec exit code 5 (V8 Fatal Error) après 1 à 2 jobs traités, sans aucun message d'erreur visible dans les logs. Le crash est silencieux car il se produit dans la VM V8, en dehors des handlers JavaScript (`uncaughtException`, `unhandledRejection` ne sont pas déclenchés).

### Cause

`Readable.toWeb()` (méthode officielle Node.js pour convertir un stream Node en Web ReadableStream) a une fuite mémoire sur les streams séquentiels dans Node.js 22. Le second appel successif à `Readable.toWeb()` dans le même process déclenche une corruption interne V8 non interceptable.

Ce bug affecte spécifiquement le scénario du worker qui traite les fichiers capturés en séquence : le premier job passe, le second crashe systématiquement.

### Solution appliquée

Un adaptateur manuel remplace `Readable.toWeb()` dans `src/lib/pubg-telemetry/resync-files.ts` :

```typescript
function nodeReadableToWebStream(readable: Readable): ReadableStream<Uint8Array> {
  const toUint8Array = (chunk: unknown): Uint8Array => {
    if (chunk instanceof Uint8Array) return chunk
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(chunk)) {
      return new Uint8Array(chunk)
    }
    if (typeof chunk === 'string') {
      return new TextEncoder().encode(chunk)
    }
    throw new Error(`Unsupported stream chunk type: ${typeof chunk}`)
  }

  let closed = false
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null

  const cleanup = () => {
    readable.off('readable', onReadable)
    readable.off('end', onEnd)
    readable.off('error', onError)
  }

  const onError = (err: unknown) => {
    if (closed) return
    closed = true
    cleanup()
    controllerRef?.error(err)
    controllerRef = null
  }

  const onEnd = () => {
    if (closed) return
    closed = true
    cleanup()
    controllerRef?.close()
    controllerRef = null
  }

  const drain = () => {
    const controller = controllerRef
    if (!controller || closed) return
    try {
      while ((controller.desiredSize ?? 1) > 0) {
        const chunk = readable.read() as unknown
        if (chunk === null) break
        controller.enqueue(toUint8Array(chunk))
      }
    } catch (err) {
      onError(err)
    }
  }

  const onReadable = () => {
    drain()
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
      readable.on('readable', onReadable)
      readable.on('end', onEnd)
      readable.on('error', onError)
      drain()
    },
    pull() {
      drain()
    },
    cancel() {
      closed = true
      cleanup()
      controllerRef = null
      readable.destroy()
    },
  })
}
```

**Règle absolue :** ne jamais utiliser `Readable.toWeb()` dans ce projet. Toute conversion de stream Node en Web ReadableStream doit passer par l'adaptateur `nodeReadableToWebStream` de `resync-files.ts`.

---

## Boucle infinie crash-recovery

### Symptôme

Chaque démarrage du worker crashe sur le même match. Le job est remis en `queued` après 2 minutes par `recoverStuckTelemetryResyncJobs`, puis reclaim, puis crashe à nouveau.

### Cause possible

- Fichier capturé corrompu
- Fichier trop volumineux causant un OOM dans le Prisma Library Engine (Rust in-process) lors de l'upsert des champs JSON
- Bug applicatif spécifique à ce match

### Solution

1. Utiliser le bouton **"Annuler jobs bloqués"** dans l'UI (page session, cadre Queue Resync) — le job passe de `running` à `failed` immédiatement.
2. Relancer le worker — il skip les jobs `failed`.

Si l'UI n'est pas accessible :

```bash
curl -X POST http://localhost:3000/api/clans/1/telemetry/queue-cleanup \
  -H "Content-Type: application/json" \
  -d '{"action":"cancel-old","cancelMaxAgeMs":1}'
```

Si le fichier est corrompu, le supprimer du dossier `.telemetry-captured/` et re-capturer via le mode Capture seule.

---

## Variables d'environnement — Référence complète

| Variable | Défaut | Description |
|---|---|---|
| `TELEMETRY_RESYNC_WORKER_POLL_MS` | `2000` | Délai entre deux polls si queue vide (ms) |
| `TELEMETRY_RESYNC_WORKER_ID` | `pid-{PID}` | Identifiant du worker (utile en multi-workers) |
| `TELEMETRY_RESYNC_STUCK_RECOVERY_MS` | `120000` | Age minimal (ms) d'un job `running` avant récupération au démarrage |
| `TELEMETRY_RESYNC_WORKER_MAX_PARALLEL` | `1` | Nombre max de workers resync autorisés en parallèle |
| `TELEMETRY_RESYNC_WORKER_LOCK_FILE` | `.telemetry-resync-worker.lock` | Chemin du verrou fichier |
| `TELEMETRY_RESYNC_WORKER_LOCK_STALE_MS` | `1800000` | Age max (ms) d'un verrou avant nettoyage automatique |
| `TELEMETRY_WORKER_GC_ENABLED` | `false` | Forcer GC après chaque job (`--expose-gc` requis) |
| `TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT` | `80` | Seuil haute pression mémoire (%) |
| `TELEMETRY_WORKER_MEMORY_CRITICAL_PCT` | `95` | Seuil critique mémoire (%) |
| `TELEMETRY_AGGREGATE_WORKER_POLL_MS` | `3000` | Délai de polling de la queue d'agrégats (ms) |
| `TELEMETRY_AGGREGATE_WORKER_MAX_PARALLEL` | `1` | Nombre max de workers agrégats autorisés |
| `TELEMETRY_AGGREGATE_WORKER_LOCK_FILE` | `.telemetry-aggregate-worker.lock` | Chemin du verrou fichier agrégats |
| `TELEMETRY_AGGREGATE_WORKER_LOCK_STALE_MS` | `1800000` | Age max (ms) d'un verrou agrégats |
| `TELEMETRY_AGGREGATES_WRITE_BATCH_SIZE` | `250` | Taille des lots `createMany` pendant le recalcul |

---

## Logs émis par le Worker Resync

```
[TelemetryResyncWorker] started               { workerId, once, pollDelayMs }
[TelemetryResyncWorker] single-instance lock acquired { lockFile }
[TelemetryResyncWorker] recovered stuck jobs  { recovered }
[TelemetryResyncWorker] job claimed           { jobId, squadMatchId, resetBeforeSync }
[TelemetryResyncWorker] step reset-db         { jobId, squadMatchId }
[TelemetryResyncWorker] step reset-db done
[TelemetryResyncWorker] step resync-start     { jobId, squadMatchId }
[TelemetrySync] capped arrays for DB          { positionSamples: { original, capped } }
[TelemetryResyncWorker] step resync-done      { jobId, status }
[TelemetryResyncWorker] job success           { jobId, durationMs }
[TelemetryResyncWorker] job failed            { jobId, error }
[TelemetryResyncWorker] metrics               { toutes les 30 s }
[TelemetryResyncWorker] single-instance lock released { lockFile }
[Backpressure] HIGH: ...MB / ...MB (xx%). Waiting before next job...
[Backpressure] CRITICAL: ...MB / ...MB (xx%). Worker paused.
```

Le log `step reset-db` / `step resync-start` / `step resync-done` permet de localiser précisément où un crash s'est produit : si aucun log de progression n'apparaît après "job claimed", le crash s'est produit pendant le `deleteMany` initial (rare, problème de connexion DB probable).
