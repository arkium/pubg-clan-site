# Stratégie de synchronisation télémétrie - Mode manuel & batch robuste

## Analyse de l'état actuel

### ✅ Points forts
- Queue persistante basée sur `CronExecution` (pas de perte de jobs)
- Worker dédié en process séparé (isole les charges lourdes)
- Déduplication (même match pas reenfilé)
- Gestion des erreurs avec statuts (queued → running → success/failed)

### ❌ Points faibles
1. **Pas de mode manuel interactif** : UI affiche les boutons mais retour au client peu informatif
2. **Pas de monitoring en temps réel** : l'utilisateur ne sait pas ce qui se passe
3. **Pas de limite mémoire** : worker traite job par job sans GC
4. **Pas de retry intelligent** : un job échoué reste en failed
5. **Agrégats recalculés 1 fois/match** : inefficace si plusieurs matches changent
6. **Pas de batch groupé** : idéal pour cold-start après ajout d'agrégats

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
