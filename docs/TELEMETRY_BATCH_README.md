# Télémétrie - Mode manuel et batch robuste

**Statut**: Phase 2 implémentée (mode manuel + batch CLI + memory protection)

## Quick Start

### 1. Mode web interactif (UI)
```bash
# Page dédiée batch:
1. Aller à /clans/1/telemetry/sync-batch-manual
2. Ajouter les match IDs
3. Configurer options (reset/recalc)
4. Cliquer "Enqueue sync"
5. Cliquer "Check status" pour voir progression
```

### 2. Mode CLI (batch script)
```bash
# Sync clan spécifique (matches récents)
npm run telemetry:batch -- --clan 1

# Sync clan (ALL matches qui manquent télémétrie)
npm run telemetry:batch -- --clan 1 --all-matches

# Sync tous les clans
npm run telemetry:batch -- --all-clans

# Recalc agrégats après ajout de colonnes
npm run telemetry:batch -- --clan 1 --recalc-aggregates-only

# Vérifier le status de la queue
npm run telemetry:batch -- --check --clan 1

# Lister les jobs en dead letter queue (Phase 2)
npm run telemetry:batch -- --dead-letter --clan 1

# Relancer un job depuis dead letter (Phase 2)
npm run telemetry:batch -- --retry-dead-letter job-id-1 job-id-2 --clan 1
```

### 3. Worker (process séparé)
```bash
# Mode boucle (polling toutes les 2s, avec monitoring mémoire)
npm run telemetry:worker

# Mode une seule fois
npm run telemetry:worker:once

# Mode avec GC explicitee (Phase 2)
TELEMETRY_WORKER_GC_ENABLED=true npm run telemetry:worker:monitored

# Mode avec --expose-gc pour introspection
npm run telemetry:worker:gc
```

## Architecture

```
┌─────────────────────────────────────┐
│   Interface utilisateur             │
│  • Page /clans/[id]/telemetry/sync-batch-manual
│  • API endpoints                    │
└──────────────┬──────────────────────┘
               │
               ├─→ POST /api/.../sync-batch-manual
               │   (enqueue + get status)
               │
               ├─→ GET /api/.../sync-batch-manual
               │   (query queue status)
               │
               ├─→ GET/POST /api/.../dead-letter
               │   (manage permanently failed jobs)
               │
               └─→ POST /api/.../recalc-aggregates-batch
                   (recalc one/all clans)
                   
               ↓
         
         CronExecution table (queue)
         Status: queued → running → success/failed
         Dead letter: jobs > 1hr old with no retry
         
               ↓
               
    ┌─────────────────────────────────┐
    │  Worker Process (séparé)        │
    │  • MemoryMonitor (Phase 2)      │
    │  • BackpressureController (P2)  │
    │  • WorkerHealthMonitor (Phase 2)|
    │  • Claim 1 job atomiquement     │
    │  • Process 1 match              │
    │  • Retry with backoff           │
    │  • Recalc aggregates            │
    └─────────────────────────────────┘
```

## Endpoints disponibles

### Sync batch manuel
```bash
POST /api/clans/{clanId}/telemetry/sync-batch-manual

Request:
{
  "squadMatchIds": ["match1", "match2"],
  "resetBeforeSync": false,           # Reset télémétrie avant resync
  "recalculateAggregates": true,      # Recalc après sync
  "batchLabel": "Manual sync June 7"
}

Response:
{
  "ok": true,
  "batchId": "uuid",
  "enqueue": {
    "queuedCount": 2,
    "alreadyQueuedCount": 0
  },
  "queue": {
    "pendingCount": 5,      # Total en attente
    "successCount": 42,
    "failedCount": 1
  },
  "wsUrl": "/api/clans/1/telemetry/sync-batch-ws"
}
```

### Status batch
```bash
GET /api/clans/{clanId}/telemetry/sync-batch-manual

Response:
{
  "ok": true,
  "queue": {
    "queued": 3,
    "running": 1,
    "success": 42,
    "failed": 1,
    "total": 47
  },
  "recentJobs": [
    {
      "id": "job-uuid",
      "status": "running",
      "message": "...",
      "duration": 45.2
    }
  ]
}
```

### Dead Letter Queue (Phase 2)
```bash
GET /api/clans/{clanId}/telemetry/dead-letter
# Lists permanently failed jobs (>1hr old)

POST /api/clans/{clanId}/telemetry/dead-letter
# Body: { "jobIds": ["job-id-1", "job-id-2"] }
# Resets jobs to queued status for retry
```

### Recalc agrégats
```bash
POST /api/clans/{clanId}/telemetry/recalc-aggregates-batch

Request (single clan):
{ "scope": "clan" }

Response:
{
  "ok": true,
  "clanId": 1,
  "periodsUpdated": 12,
  "totalRowsUpdated": 456,
  "durationMs": 3200
}
```

## Cas d'usage

### 1. Après ajout de nouvelles colonnes d'agrégats
```bash
# Recalc tous les clans sans resync
npm run telemetry:batch -- --all-clans --recalc-aggregates-only

# Ou via API
curl -X POST http://localhost:3000/api/clans/1/telemetry/recalc-aggregates-batch \
  -H "Content-Type: application/json" \
  -d '{"scope": "all-clans"}'
```

### 2. Test manuel avant production
```bash
# 1. Enqueue pour 1 clan
npm run telemetry:batch -- --clan 1

# 2. Vérifier status
npm run telemetry:batch -- --check --clan 1

# 3. Lancer worker (autre terminal) avec monitoring mémoire
TELEMETRY_WORKER_GC_ENABLED=true npm run telemetry:worker:monitored

# 4. Vérifier résultats
npm run telemetry:batch -- --check --clan 1
```

### 3. Gestion des jobs échoués (Phase 2)
```bash
# Voir les jobs en dead letter queue
npm run telemetry:batch -- --dead-letter --clan 1

# Après avoir fixé le problème (ex: API back up)
npm run telemetry:batch -- --retry-dead-letter job-id-1 job-id-2 --clan 1
```

### 4. Production: Cron toutes les 6h
```bash
# En crontab:
0 */6 * * * cd /app && npm run telemetry:batch -- --all-clans >> /var/log/telemetry-batch.log 2>&1

# Avec monitoring mémoire (Phase 2):
0 */6 * * * cd /app && TELEMETRY_WORKER_GC_ENABLED=true npm run telemetry:worker
```

## Variables d'environnement

```env
# Worker - Phase 1
TELEMETRY_RESYNC_WORKER_POLL_MS=2000      # Poll delay (default: 2000)
TELEMETRY_RESYNC_WORKER_ID=worker-prod-1  # Worker identifier

# Worker - Phase 2 (NEW: Memory Protection)
TELEMETRY_WORKER_GC_ENABLED=true                    # Force explicit GC (default: false)
TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT=80           # High pressure trigger (default: 80)
TELEMETRY_WORKER_MEMORY_CRITICAL_PCT=95            # Critical pause trigger (default: 95)
TELEMETRY_WORKER_HEAP_MAX_MB=1024                  # Max heap size

# Node.js
NODE_OPTIONS='--expose-gc'                          # Expose gc() for manual collection
```

## Statut queue

| Statut | Signification |
|--------|---------------|
| `queued` | En attente d'être traité |
| `running` | Actuellement en cours |
| `success` | Complété avec succès |
| `failed` | Échoué (après retries, peut aller en dead letter) |
| `stale` | Timeout ou abandonné (Phase 3) |

## Monitoring

### Via CLI
```bash
npm run telemetry:batch -- --check
npm run telemetry:batch -- --check --clan 1 --verbose

# Phase 2: voir les metrics du worker (logs toutes les 30s)
npm run telemetry:worker:monitored
```

### Via Web
```bash
# Status endpoint
GET /api/clans/1/telemetry/sync-batch-manual

# Dead letter queue (Phase 2)
GET /api/clans/1/telemetry/dead-letter
```

### Logs
```bash
tail -f logs/telemetry-*.log
# Ou: journalctl -u telemetry-worker -f
```

## Troubleshooting

### Worker ne traite pas les jobs
```bash
# Vérifier que le worker tourne
ps aux | grep "telemetry:worker"

# Vérifier le polling
npm run telemetry:worker

# Vérifier la queue DB
SELECT * FROM CronExecution 
WHERE action='telemetry_resync_file' 
ORDER BY createdAt DESC LIMIT 10;
```

### Mémoire qui augmente (Phase 2 fix)
```bash
# Vérifier les metrics du worker (logs toutes les 30s si enabled)
TELEMETRY_WORKER_GC_ENABLED=true npm run telemetry:worker:monitored

# Forcer GC après 1 batch
npm run telemetry:worker:gc

# Si mémoire toujours haute: réduire batch size
TELEMETRY_RESYNC_BATCH_SIZE=2 npm run telemetry:worker
```

### Dead letter queue empile (Phase 2)
```bash
# Lister les jobs échoués
npm run telemetry:batch -- --dead-letter --clan 1

# Vérifier les erreurs dans DB
SELECT id, message, details FROM CronExecution 
WHERE clanId=1 
AND action='telemetry_resync_file' 
AND status='failed'
AND finishedAt < NOW() - INTERVAL 1 HOUR
ORDER BY finishedAt DESC;

# Après résoudre le problème, relancer
npm run telemetry:batch -- --retry-dead-letter job-id --clan 1
```

## Roadmap

### ✅ Phase 1 (TERMINÉ)
- [x] Endpoint sync-batch-manual
- [x] Endpoint recalc-aggregates-batch
- [x] CLI telemetry-batch
- [x] Status query
- [x] Web UI for manual sync

### ✅ Phase 2 (TERMINÉ)
- [x] MemoryMonitor (heap tracking)
- [x] BackpressureController (pause on high memory)
- [x] WorkerHealthMonitor (metrics tracking)
- [x] Dead letter queue (failed jobs > 1hr)
- [x] Dead letter CLI + API
- [x] Retry functionality
- [x] Memory metrics logging

### 📋 Phase 3 (EN COURS)
- [ ] Dashboard monitoring UI
- [ ] Queue cleanup endpoint
- [ ] TTL pour jobs stale (>24h)
- [ ] Detailed error logs page
- [ ] Metrics export (Prometheus)
- [ ] Queue priority system (recent first)
- [ ] Automatic batch size tuning under pressure

## Documentation additionnelle

- [TELEMETRY_PHASE2_GUIDE.md](TELEMETRY_PHASE2_GUIDE.md) - Guide complet Phase 2
- [TELEMETRY_PRODUCTION_GUIDE.md](TELEMETRY_PRODUCTION_GUIDE.md) - Déploiement production
- [telemetry-sync-strategy.md](telemetry-sync-strategy.md) - Architecture et stratégie

## Notes techniques

- Queue utilise `CronExecution` existante (réutilisation)
- Worker se claim atomiquement 1 job à la fois (pas de race condition)
- Agrégats recalculés **après** chaque sync si demandé
- Phase 2: Memory monitoring active par défaut, GC opt-in
- Phase 2: Backpressure ralentit job claiming si mémoire haute
- Phase 2: Dead letter queue filtre jobs >1hr sans retry


## Quick Start

### 1. Mode web interactif (UI)
```bash
# Depuis la page session d'un match:
1. Cliquer "Queue worker" pour enfiler les matches
2. Aller à /clans/1/telemetry/sync-batch-manual
3. Voir le status en temps réel
```

### 2. Mode CLI (batch script)
```bash
# Sync clan spécifique (matches récents)
npm run telemetry:batch -- --clan 1

# Sync clan (ALL matches qui manquent télémétrie)
npm run telemetry:batch -- --clan 1 --all-matches

# Sync tous les clans
npm run telemetry:batch -- --all-clans

# Recalc agrégats après ajout de colonnes
npm run telemetry:batch -- --clan 1 --recalc-aggregates-only

# Vérifier le status de la queue
npm run telemetry:batch -- --check --clan 1
```

### 3. Worker (process séparé)
```bash
# Mode boucle (polling toutes les 2s)
npm run telemetry:worker

# Mode une seule fois
npm run telemetry:worker:once
```

## Architecture

```
┌─────────────────────────────────────┐
│   Interface utilisateur             │
│  • Page session                     │
│  • Dashboard monitoring             │
└──────────────┬──────────────────────┘
               │
               ├─→ POST /api/.../sync-batch-manual
               │   (enqueue + get status)
               │
               ├─→ GET /api/.../sync-batch-manual
               │   (query queue status)
               │
               └─→ POST /api/.../recalc-aggregates-batch
                   (recalc one/all clans)
                   
               ↓
         
         CronExecution table (queue)
         Status: queued → running → success/failed
         
               ↓
               
    ┌─────────────────────────────┐
    │  Worker Process (séparé)    │
    │  • Claim 1 job              │
    │  • Process 1 match          │
    │  • Retry on error           │
    │  • Recalc aggregates        │
    └─────────────────────────────┘
```

## Endpoints disponibles

### Sync batch manuel
```bash
POST /api/clans/{clanId}/telemetry/sync-batch-manual

Request:
{
  "squadMatchIds": ["match1", "match2"],
  "resetBeforeSync": false,           # Reset télémétrie avant resync
  "recalculateAggregates": true,      # Recalc après sync
  "batchLabel": "Manual sync June 7"
}

Response:
{
  "ok": true,
  "batchId": "uuid",
  "enqueue": {
    "queuedCount": 2,
    "alreadyQueuedCount": 0
  },
  "queue": {
    "pendingCount": 5,      # Total en attente
    "successCount": 42,
    "failedCount": 1
  },
  "wsUrl": "/api/clans/1/telemetry/sync-batch-ws"
}
```

### Status batch
```bash
GET /api/clans/{clanId}/telemetry/sync-batch-manual

Response:
{
  "ok": true,
  "queue": {
    "queued": 3,
    "running": 1,
    "success": 42,
    "failed": 1,
    "total": 47
  },
  "recentJobs": [
    {
      "id": "job-uuid",
      "status": "running",
      "message": "...",
      "duration": 45.2
    }
  ]
}
```

### Recalc agrégats
```bash
POST /api/clans/{clanId}/telemetry/recalc-aggregates-batch

Request (single clan):
{ "scope": "clan" }

Response:
{
  "ok": true,
  "clanId": 1,
  "periodsUpdated": 12,
  "totalRowsUpdated": 456,
  "durationMs": 3200
}

Request (all clans):
{ "scope": "all-clans", "includeEmpty": false }

Response:
{
  "ok": true,
  "clansProcessed": 15,
  "clansSuccess": 14,
  "clansFailed": 1,
  "totalRowsUpdated": 5432,
  "durationMs": 45000,
  "results": [ { clanId: 1, status: "success" }, ... ]
}
```

## Cas d'usage

### 1. Après ajout de nouvelles colonnes d'agrégats
```bash
# Recalc tous les clans sans resync
npm run telemetry:batch -- --all-clans --recalc-aggregates-only

# Ou via API
curl -X POST http://localhost:3000/api/clans/1/telemetry/recalc-aggregates-batch \
  -H "Content-Type: application/json" \
  -d '{"scope": "all-clans"}'
```

### 2. Test manuel avant production
```bash
# 1. Enqueue pour 1 clan
npm run telemetry:batch -- --clan 1

# 2. Vérifier status
npm run telemetry:batch -- --check --clan 1

# 3. Lancer worker (autre terminal)
npm run telemetry:worker:once

# 4. Vérifier résultats
npm run telemetry:batch -- --check --clan 1
```

### 3. Production: Cron toutes les 6h
```bash
# En crontab:
0 */6 * * * cd /app && npm run telemetry:batch -- --all-clans >> /var/log/telemetry-batch.log 2>&1

# Recalc agrégats tous les jours à 2AM
0 2 * * * cd /app && npm run telemetry:batch -- --all-clans --recalc-aggregates-only
```

### 4. Recovery: réessayer les jobs échoués
```bash
# À implémenter: endpoint POST /api/clans/{id}/telemetry/queue-cleanup
# qui peut:
# - Retry failed jobs
# - Reset queue pour un clan
# - Cancel running jobs
```

## Variables d'environnement

```env
# Worker (optionnels, defaults intégrés)
TELEMETRY_RESYNC_WORKER_POLL_MS=2000      # Poll delay
TELEMETRY_RESYNC_WORKER_ID=worker-prod-1  # Worker identifier

# À implémenter en Phase 2:
TELEMETRY_RESYNC_BATCH_SIZE=5              # Jobs par batch
TELEMETRY_RESYNC_MEMORY_LIMIT_MB=512       # RSS max
TELEMETRY_RESYNC_GC_INTERVAL=5             # GC après N jobs
```

## Statut queue

| Statut | Signification |
|--------|---------------|
| `queued` | En attente d'être traité |
| `running` | Actuellement en cours |
| `success` | Complété avec succès |
| `failed` | Échoué (sera loggé) |
| `stale` | Timeout ou abandonné (TODO) |

## Monitoring

### Via CLI
```bash
npm run telemetry:batch -- --check
npm run telemetry:batch -- --check --clan 1 --verbose
```

### Via Web
```
GET /api/clans/1/telemetry/sync-batch-manual
```

### Logs
```bash
tail -f logs/telemetry-*.log
# Ou: journalctl -u telemetry-worker -f
```

## Troubleshooting

### "Server unavailable" dans l'UI
```bash
# Vérifier que le serveur web tourne
ps aux | grep "npm run dev"

# Vérifier les logs
npm run dev 2>&1 | tail -50
```

### Worker ne traite pas les jobs
```bash
# Vérifier que le worker tourne
ps aux | grep "telemetry:worker"

# Vérifier le polling
npm run telemetry:worker --verbose

# Vérifier la queue DB
SELECT * FROM CronExecution 
WHERE action='telemetry_resync_file' 
ORDER BY createdAt DESC LIMIT 10;
```

### Mémoire qui augmente indéfiniment
- Phase 2 devra implémenter:
  - Streaming JSON au lieu de chargement complet
  - GC après N jobs
  - Memory monitoring + pause si dépassé

### Agrégats incohérents
```bash
# Recalc forcer
npm run telemetry:batch -- --clan 1 --recalc-aggregates-only --reset-before
```

## Roadmap

### ✅ Phase 1 (FAIT)
- [x] Endpoint sync-batch-manual
- [x] Endpoint recalc-aggregates-batch
- [x] CLI telemetry-batch
- [x] Status query

### 📋 Phase 2 (TODO)
- [ ] Streaming JSON (memory protection)
- [ ] GC config + memory monitoring
- [ ] RSS alerting
- [ ] Retry intelligent (exponential backoff)
- [ ] Dead letter queue
- [ ] WebSocket progress (nice-to-have)

### 📋 Phase 3 (TODO)
- [ ] Dashboard monitoring
- [ ] Queue cleanup endpoint
- [ ] TTL pour jobs stale
- [ ] Detailed error logs
- [ ] Metrics (Prometheus)

## Notes techniques

- Queue utilise `CronExecution` existante (réutilisation)
- Worker se claim atomiquement 1 job à la fois (pas de race condition)
- Agrégats recalculés **après** chaque sync si demandé
- CLI utilise les mêmes fonctions que le web (pas de duplication)

## Support

Voir: [docs/telemetry-sync-strategy.md](telemetry-sync-strategy.md)
