# Phase 2: Memory Protection & Advanced Queue Management

## What's Implemented

### 1. Memory Monitoring (`src/lib/pubg-telemetry/memory-monitor.ts`)
- Tracks heap usage via `process.memoryUsage()`
- Configurable thresholds: default 80% high pressure, 95% critical
- Optional GC integration with `--expose-gc` flag
- Stores last 20 samples for trend analysis
- Utility methods for formatting memory stats

### 2. Worker Backpressure Controller (`src/lib/pubg-telemetry/worker-backpressure.ts`)
- Pauses job claiming when memory is high (>threshold)
- Critical pause mode when memory >95% 
- Automatic retry with exponential backoff (configurable)
- Wraps job execution with memory checks before/after
- Automatic GC call after successful jobs (if enabled)

### 3. Worker Health Monitor (`src/lib/pubg-telemetry/worker-health.ts`)
- Tracks: jobs processed, succeeded, failed, average duration
- Monitors peak memory and memory trends (stable/rising/falling)
- Health score based on success rate (healthy if <50% failures)
- Persists metrics in memory for dashboard/logging

### 4. Dead Letter Queue API (`src/app/api/clans/[clanId]/telemetry/dead-letter/route.ts`)
- `GET /api/clans/[clanId]/telemetry/dead-letter` - List permanently failed jobs (>1hr old)
- `POST /api/clans/[clanId]/telemetry/dead-letter` - Reset selected jobs to queued status
- Allows manual retry after diagnosing root cause

### 5. Enhanced Worker (`scripts/telemetry-resync-worker.ts`)
- Integrated memory monitoring, backpressure, and health tracking
- Logs metrics every 30 seconds (when running in loop mode)
- Reports health metrics on graceful shutdown
- New environment variables:
  - `TELEMETRY_WORKER_GC_ENABLED` - Enable explicit GC calls
  - `TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT` - High pressure trigger (default: 80%)
  - `TELEMETRY_WORKER_MEMORY_CRITICAL_PCT` - Critical pause trigger (default: 95%)

### 6. Enhanced CLI (`scripts/telemetry-batch.ts`)
- `npm run telemetry:batch -- --dead-letter --clan 1` - List dead letter jobs
- `npm run telemetry:batch -- --retry-dead-letter job-id-1 job-id-2 --clan 1` - Retry jobs
- New error handling for dead letter operations

### 7. New Package Scripts
- `npm run telemetry:worker:gc` - Start worker with `--expose-gc` for manual GC
- `npm run telemetry:worker:monitored` - Start worker with GC enabled and memory monitoring

## How It Works

### Memory Pressure Flow
1. Job processing starts → memory check before claiming job
2. If memory >80% (high pressure) → wait 5s, recheck, skip job if still high
3. If memory >95% (critical) → pause processing, wait 2s, recheck
4. After job completes → optional GC call + memory sample recorded
5. Every 30s → log current metrics and trends

### Dead Letter Queue Flow
1. Jobs fail after multiple retries
2. After 1 hour with no retry attempt → job enters dead letter queue
3. User checks dead letter: `npm run telemetry:batch -- --dead-letter --clan 1`
4. User fixes root cause (e.g., API is back up, permissions restored)
5. User retries: `npm run telemetry:batch -- --retry-dead-letter job-id --clan 1`
6. Job requeued with status='queued', attemptCount reset to 0

### Health Monitoring Flow
1. Worker tracks each job: start→end, success/fail, duration
2. Health monitor calculates running stats: average duration, peak memory, trend
3. Health score: isHealthy=true if failure rate <50%
4. Every 30s, worker logs current health snapshot
5. On shutdown, final metrics reported

## Configuration

```bash
# Production with GC enabled
TELEMETRY_WORKER_GC_ENABLED=true \
TELEMETRY_WORKER_MEMORY_THRESHOLD_PCT=75 \
TELEMETRY_WORKER_MEMORY_CRITICAL_PCT=90 \
npm run telemetry:worker

# Development with verbose monitoring
TELEMETRY_WORKER_GC_ENABLED=true npm run telemetry:worker:monitored

# One-shot with GC introspection
npm run telemetry:worker:gc
```

## Testing Phase 2

### Manual Test: Memory Backpressure
```bash
# Terminal 1: Start worker with monitoring
npm run telemetry:worker:monitored

# Terminal 2: Check worker health (watch every 5s)
watch -n 5 'npm run telemetry:batch -- --check --clan 1'

# Terminal 3: Enqueue large batch
npm run telemetry:batch -- --clan 1 --all-matches --verbose

# Observe: Worker should pause if memory approaches threshold
```

### Manual Test: Dead Letter Queue
```bash
# Enqueue jobs
npm run telemetry:batch -- --clan 1

# Let them process (some will fail if files missing)
sleep 10

# Check dead letter after 1+ hour passes (or simulate with DB)
npm run telemetry:batch -- --dead-letter --clan 1

# Retry specific dead letter job
npm run telemetry:batch -- --retry-dead-letter <job-id> --clan 1
```

### Verify Health Metrics
Worker outputs health every 30 seconds:
```
[TelemetryResyncWorker] metrics {
  jobsProcessed: 12
  jobsSucceeded: 10
  jobsFailed: 2
  avgDurationMs: 4523
  peakMemory: 487654321
  currentMemory: 234567890
  isHealthy: true
  memoryTrend: 'stable'
  pressure: { isPaused: false, isHighPressure: false, ... }
}
```

## Performance Notes

- **Memory overhead**: ~5MB for monitoring (stores 20 metrics)
- **GC performance**: Explicit GC adds ~100-200ms per job (only if enabled)
- **Backpressure latency**: 5-10s per check cycle when high pressure detected
- **Recommended heap**: 1GB for worker (adjust with `--max-old-space-size`)

## Next Phase (Phase 3)

- Dashboard UI for monitoring live worker metrics
- Streaming JSON decompression for very large files
- Automatic batch size reduction under memory pressure
- Queue priority system (recent matches first)
- Worker restart capability on OOM
