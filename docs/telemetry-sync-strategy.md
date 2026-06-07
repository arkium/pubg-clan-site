# Stratégie de synchronisation télémétrie - Mode manuel & batch robuste

**Statut**: ✅ Phase 1, 2, 3 COMPLÉTÉES (commit Phase 3: 33cc613)

## Analyse de l'état initial (résolu)

### ✅ Points forts (implémentés)
- Queue persistante basée sur `CronExecution` ✅
- Worker dédié en process séparé ✅
- Déduplication (même match pas reenfilé) ✅
- Gestion des erreurs avec statuts ✅

### ✅ Points faibles (RÉSOLUS)

#### Phase 1 ✅ FAIT
- ✅ Mode manuel interactif avec UI
- ✅ Monitoring en temps réel via API
- ✅ Endpoint POST /sync-batch-manual
- ✅ Status query en temps réel
- ✅ CLI batch processor

#### Phase 2 ✅ FAIT
- ✅ Protection mémoire: MemoryMonitor + BackpressureController
- ✅ GC configuration (opt-in avec TELEMETRY_WORKER_GC_ENABLED)
- ✅ Dead letter queue pour jobs définitifs
- ✅ Worker health monitoring
- ✅ Retry logic avec backoff exponentiel

#### Phase 3 ✅ FAIT
- ✅ Dashboard monitoring en temps réel
- ✅ Erreurs browsable et filtrable
- ✅ Queue cleanup endpoint (reorder, stale cleanup)
- ✅ Batch size tuning automatique
- ✅ Metrics export (JSON + Prometheus)

## Architecture implémentée

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERFACE WEB                             │
├─────────────────────────────────────────────────────────────┤
│  [Batch manual]  [Monitor]  [Errors]  [Cleanup]             │
│  /telemetry/sync-batch-manual                               │
│  /telemetry/dashboard                                       │
│  /telemetry/errors                                          │
└──────────────────────────┬────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│              API ENDPOINTS (Phase 1-3)                       │
│  • POST /sync-batch-manual      (enqueue + status)          │
│  • GET  /sync-batch-manual      (query status)              │
│  • POST /dead-letter            (dead letter management)    │
│  • POST /recalc-aggregates-batch (batch recalc)             │
│  • POST /queue-cleanup          (priority, cleanup, cancel) │
│  • GET  /metrics                (JSON + Prometheus)         │
└──────────────────────────┬────────────────────────────────────┘
                           │ CronExecution table
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    QUEUE PERSISTANTE                         │
│  Statuts: queued → running → success/failed → dead-letter  │
│  Memory monitoring: MemoryMonitor + BackpressureController │
└──────────────────────────┬────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   [Worker Loop]    [Worker Once]     [Batch Cleanup]
   (continuous)     (one-shot mode)   (priority/stale)
   (memory-safe)    (via npm run)     (queue mgmt)
```

## Phases implémentées

### ✅ Phase 1: Mode manuel avec monitoring (COMPLÈTE)

**Fichiers créés:**
- `src/app/api/clans/[clanId]/telemetry/sync-batch-manual/route.ts` ✅
- `src/app/clans/[clanId]/telemetry/sync-batch-manual/page.tsx` ✅
- `scripts/telemetry-batch.ts` ✅
- `src/lib/pubg-telemetry/resync-queue.ts` ✅

**Flux:**
```
POST /api/clans/1/telemetry/sync-batch-manual
  → enqueue jobs atomiquement
  → retour JSON avec jobIds
  → GET status en polling 30s
  → Dashboard affiche progression
```

**Commandes:**
```bash
npm run telemetry:batch -- --clan 1
npm run telemetry:batch -- --check --clan 1
npm run telemetry:worker:once
```

### ✅ Phase 2: Protection mémoire (COMPLÈTE)

**Fichiers créés:**
- `src/lib/pubg-telemetry/memory-monitor.ts` ✅
- `src/lib/pubg-telemetry/worker-backpressure.ts` ✅
- `src/lib/pubg-telemetry/worker-health.ts` ✅
- `src/app/api/clans/[clanId]/telemetry/dead-letter/route.ts` ✅

**Features:**
- Memory monitoring: track heap % usage
- Backpressure: pause if heap > 80%, critical if > 95%
- GC integration: optional explicit GC after jobs
- Health tracking: jobs/success/fail/duration/peak memory
- Dead letter queue: failed jobs >1h old

**Env vars:**
```bash
TELEMETRY_WORKER_GC_ENABLED=true
TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT=80
TELEMETRY_WORKER_MEMORY_CRITICAL_PCT=95
```

### ✅ Phase 3: Dashboard & Queue Management (COMPLÈTE)

**Fichiers créés:**
- `src/app/clans/[clanId]/telemetry/dashboard/page.tsx` ✅
- `src/app/clans/[clanId]/telemetry/errors/page.tsx` ✅
- `src/app/api/clans/[clanId]/telemetry/queue-cleanup/route.ts` ✅
- `src/app/api/clans/[clanId]/telemetry/metrics/route.ts` ✅
- `src/lib/pubg-telemetry/queue-priority.ts` ✅
- `src/lib/pubg-telemetry/batch-tuner.ts` ✅
- `src/lib/pubg-telemetry/stale-cleanup.ts` ✅

**Features:**
- Dashboard: queue stats, success/failure rates, quick actions
- Errors page: browse failed jobs, time filtering, manual retry
- Queue cleanup: reorder by priority, delete stale jobs
- Batch tuning: auto-adjust batch size under pressure
- Metrics export: JSON + Prometheus formats

## Configuration d'environnement (implémentée)

```env
# Worker settings (Phase 1-2)
TELEMETRY_RESYNC_WORKER_POLL_MS=2000
TELEMETRY_RESYNC_WORKER_ID=worker-prod-1

# Memory protection (Phase 2)
TELEMETRY_WORKER_GC_ENABLED=false          # opt-in
TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT=80
TELEMETRY_WORKER_MEMORY_CRITICAL_PCT=95

# Optional: Node.js
NODE_OPTIONS='--expose-gc'
```

## Commandes disponibles

```bash
# Phase 1: Batch enqueue
npm run telemetry:batch -- --clan 1
npm run telemetry:batch -- --clan 1 --all-matches
npm run telemetry:batch -- --all-clans
npm run telemetry:batch -- --check --clan 1

# Phase 1: Worker
npm run telemetry:worker              # Boucle infini
npm run telemetry:worker:once         # Une seule fois

# Phase 2: Avec monitoring
npm run telemetry:worker:monitored    # GC enabled
npm run telemetry:worker:gc           # --expose-gc

# Phase 2: Dead letter
npm run telemetry:batch -- --dead-letter --clan 1
npm run telemetry:batch -- --retry-dead-letter job-id --clan 1

# Phase 3: Queue management
curl -X POST http://localhost:3000/api/clans/1/telemetry/queue-cleanup \
  -H "Content-Type: application/json" \
  -d '{"action": "reorder-priority"}'

# Phase 3: Metrics
curl http://localhost:3000/api/clans/1/telemetry/metrics
curl 'http://localhost:3000/api/clans/1/telemetry/metrics?format=prometheus'
```

## Test Checklist (VALIDÉ)

- ✅ Phase 1: endpoint sync-batch-manual works
- ✅ Phase 1: CLI batch processor enqueues jobs
- ✅ Phase 1: Status query returns accurate counts
- ✅ Phase 2: MemoryMonitor tracks heap usage
- ✅ Phase 2: BackpressureController pauses on high pressure
- ✅ Phase 2: Dead letter queue collects old failed jobs
- ✅ Phase 3: Dashboard displays queue metrics
- ✅ Phase 3: Errors page filters and retries
- ✅ Phase 3: Queue cleanup reorders and deletes
- ✅ Phase 3: Metrics export works (JSON + Prometheus)
- ✅ Build: All pages compile without errors

## Documentation

- ✅ [TELEMETRY_BATCH_README.md](TELEMETRY_BATCH_README.md) - Overview Phase 1-3
- ✅ [TELEMETRY_PHASE2_GUIDE.md](TELEMETRY_PHASE2_GUIDE.md) - Memory protection details
- ✅ [TELEMETRY_PHASE3_GUIDE.md](TELEMETRY_PHASE3_GUIDE.md) - Dashboard & monitoring
- ✅ [TELEMETRY_PRODUCTION_GUIDE.md](TELEMETRY_PRODUCTION_GUIDE.md) - Deployment strategies


## Problèmes à résoudre

### 1. Mode manuel sans crash
- Besoin: tester télémétrie sans bloquer le serveur web
- Solution: endpoint POST qui enqueue + websocket pour progress

### 2. Protection mémoire
- Problème: `resyncTelemetryFromCapturedFile` charge tout le JSON en mémoire
- Solution: 
  - Streamer le fichier JSON au lieu de charger complètement
  - Forcer GC après N jobs
  - Monitorer RSS et ralentir si seuil dépassé

### 3. Agrégats après ajout de colonnes
- Problème: recalculer pour **tous** les clans après ajout de colonnes
- Solution: endpoint batch qui recalcule tous les agrégats sans avoir besoin de resync

### 4. Batch processing robuste
- Problème: traiter 1 job à la fois est lent pour 100+ matches
- Solution: 
  - Batch de N jobs avec checkpoint toutes les N
  - Retries exponentiels
  - Dead letter queue pour jobs définitifs

## Architecture proposée

```
┌─────────────────────────────────────────────────────────────┐
│                    INTERFACE WEB                             │
├─────────────────────────────────────────────────────────────┤
│  [Resync files]  [Batch manual]  [Recalc aggregates]        │
│  [Monitor queue] [View history]  [Health check]             │
└──────────────────────────┬────────────────────────────────────┘
                           │ enqueue + websocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              POST /api/clans/[id]/telemetry/...              │
│  • sync-batch-manual     (queue + progress websocket)        │
│  • recalc-aggregates     (batch all clans)                   │
│  • queue-status          (monitor jobs)                      │
│  • queue-cleanup         (retry/reset failed)                │
└──────────────────────────┬────────────────────────────────────┘
                           │ CronExecution table
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    QUEUE PERSISTANTE                         │
│  Statuts: queued → running → success/failed/stale           │
│  Checkpoint: chaque job sauvegarde état détaillé            │
└──────────────────────────┬────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   [Worker 1]        [Worker N]        [Batch job]
   (1 job à la       (--once mode)     (100s jobs)
    fois, loop)      (cron trigger)
```

## Implémentation par étapes

### Phase 1: Mode manuel avec monitoring (urgent)
**Fichiers à créer:**
- `src/app/api/clans/[clanId]/telemetry/sync-batch-manual/route.ts` - endpoint POST
- `src/lib/telemetry-sync/batch-processor.ts` - logique batch
- Component pour websocket progress

**Flux:**
```
POST /api/.../sync-batch-manual?squadMatchIds=xxx,yyy,zzz
  → enqueue jobs
  → retour JSON avec jobIds
  → websocket /ws/telemetry-sync/:jobBatchId
    → updates en temps réel (queued → running → done)
```

### Phase 2: Protection mémoire (important)
**Modifications:**
- `resync-files.ts`: streaming JSON au lieu de load complet
- `telemetry-resync-worker.ts`: 
  - Config `BATCH_SIZE` (default 5)
  - Forcer GC toutes les N jobs
  - Monitor RSS, pause si > 80% limit

### Phase 3: Recalc agrégats batch (important)
**Fichiers à créer:**
- `src/app/api/clans/[clanId]/telemetry/recalc-aggregates-batch/route.ts`
  - Recalc pour un clan OU tous les clans
  - Mode "check" pour voir ce qui doit être recalculé

### Phase 4: Dashboard monitoring (nice-to-have)
- Page `/clans/[id]/telemetry/queue-monitor`
- Affiche: jobs actifs, succès/échecs, ETA

## Configuration d'environnement proposée

```env
# Worker settings
TELEMETRY_RESYNC_BATCH_SIZE=5
TELEMETRY_RESYNC_MEMORY_LIMIT_MB=512
TELEMETRY_RESYNC_GC_INTERVAL=5
TELEMETRY_RESYNC_MAX_RETRIES=3
TELEMETRY_RESYNC_RETRY_DELAY_MS=5000

# Manual sync settings
TELEMETRY_MANUAL_SYNC_TIMEOUT_MS=300000
TELEMETRY_MANUAL_SYNC_MAX_JOBS=50

# Aggregate settings
TELEMETRY_AGGREGATES_BATCH_SIZE=10
TELEMETRY_AGGREGATES_CONCURRENT=3
```

## Risques et mitigations

| Risque | Mitigation |
|--------|-----------|
| Worker crash sur gros fichier | Streaming + GC + memory limit |
| Queue infinies | Max retries + dead letter + timeout |
| Mémoire non libérée | GC après N jobs + RSS monitoring |
| Agrégats incohérents | Checkpoint après chaque update |
| Concurrence (2 workers) | Claim atomique avec version + TTL |

## Commandes recommandées

```bash
# Dev: lancer resync 1 fois et exit
npm run telemetry:worker:once

# Dev: lancer worker en boucle (autres terminal)
npm run telemetry:worker

# Production: cron qui trigger batch toutes les 6h
*/360 * * * * npm run telemetry:batch-all-clans

# Monitoring
curl http://localhost:3000/api/clans/1/telemetry/queue-status

# Reset queue (en dernier recours)
curl -X POST http://localhost:3000/api/clans/1/telemetry/queue-cleanup \
  -d '{"resetFailed": true}'
```

## Checklist pour activation

- [ ] Phase 1: endpoint sync-batch-manual + websocket
- [ ] Phase 1: UI pour trigger + progress bar
- [ ] Phase 2: streaming JSON + GC config
- [ ] Phase 2: RSS monitoring + alerts
- [ ] Phase 3: recalc-aggregates-batch endpoint
- [ ] Phase 3: Command CLI pour batch all clans
- [ ] Tests: 100 matches, monitor mémoire, vérifier pas de crash
- [ ] Tests: 1000 matches en batch, vérifier robustesse
- [ ] Docs: runbook pour operators
