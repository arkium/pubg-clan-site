# Telemetry Capture & Resync Workflow

## Problem: "Captured telemetry file is missing"

When running resync operations, you may see errors like:
```
Status: failed
Error: Captured telemetry file is missing
```

This happens because the resync system **requires two phases**:
1. **Capture Phase**: Download telemetry from PUBG API and save to disk
2. **Resync Phase**: Read captured files and process them into the database

## The Correct Workflow

### Phase 1: Capture Telemetry Files

This step downloads the telemetry JSON files from PUBG API and stores them locally.

**Option A: Via Web UI**

1. Navigate to: `/clans/{clanId}/telemetry/fetch-files-selected`
2. Select match IDs to capture
3. Click "Capturer les fichiers"
4. Wait for completion - files will be saved to `.telemetry-captured/` directory

**Option B: Via API**

```bash
curl -X POST http://localhost:3000/api/clans/1/telemetry/fetch-files-selected \
  -H "Content-Type: application/json" \
  -d '{"squadMatchIds": ["match1", "match2", "match3"]}'
```

Response shows:
```json
{
  "ok": true,
  "captureDirectory": ".telemetry-captured",
  "capturedCount": 3,
  "captureErrorCount": 0,
  "results": [
    {
      "squadMatchId": "match1",
      "status": "success",
      "captureFilePath": ".telemetry-captured/pubg-match1.json",
      "captureEventCount": 245,
      "bytesRead": 2048576
    }
  ]
}
```

### Phase 2: Resync from Captured Files

After files are captured, resync reads them from disk and processes them.

**Option A: Via Web UI (Batch Manual)**

1. Navigate to: `/clans/{clanId}/telemetry/sync-batch-manual`
2. Select the same match IDs (or subset)
3. Configure options:
   - "Reset before sync": Clears existing data first (optional)
   - "Recalculate aggregates": Rebuilds stats after sync (recommended: ON)
4. Click "Sync"

**Option B: Via API**

```bash
curl -X POST http://localhost:3000/api/clans/1/telemetry/resync-files-selected \
  -H "Content-Type: application/json" \
  -d '{
    "squadMatchIds": ["match1", "match2", "match3"],
    "resetBeforeSync": false,
    "recalculateAggregates": true
  }'
```

Response shows:
```json
{
  "ok": true,
  "successCount": 3,
  "failedCount": 0,
  "missingFiles": [],
  "aggregatesRecalculated": true,
  "results": [
    {
      "squadMatchId": "match1",
      "status": "success",
      "positionSamplesCount": 245,
      "trajectorySegmentsCount": 48,
      "deathSamplesCount": 3
    }
  ]
}
```

### Phase 3: Verify Data

Check if telemetry data is available:

```bash
# Via API
curl http://localhost:3000/api/clans/1/telemetry/playstyle?period=week

# Expected response includes:
{
  "ok": true,
  "data": {
    "playstyleSummary": {
      "memberCount": 5,
      "matchCount": 12,
      "totalDeaths": 45,
      "totalPositionSamples": 15234
    }
  }
}
```

## What's Stored Where

### Captured Files (Phase 1)
- **Location**: `.telemetry-captured/` directory (or `TELEMETRY_CAPTURE_FIXTURES_DIR`)
- **Naming**: `{prefix}-{squadMatchId}.json`
- **Size**: ~1-100 MB per file (configurable via `TELEMETRY_CAPTURE_MAX_BYTES`)
- **Purpose**: Backup of raw telemetry data, useful for re-processing
- **Retention**: Keep indefinitely for re-sync capability

### Database Records (Phase 2)
- **Table**: `SquadMatchTelemetry`
- **Fields**: Position samples, trajectories, death data, player stats
- **Processing**: Parsed from captured JSON and aggregated
- **Stats**: Available at `/api/clans/{id}/telemetry/*` endpoints

## Troubleshooting

### "Captured telemetry file is missing"

This error occurs when:
1. Files were never captured (skip Phase 1)
2. `.telemetry-captured/` directory is inaccessible
3. Files were deleted or cleaned up

**Solution**: Run fetch-files-selected first to capture files

### "File exceeds size limit"

Captured file is larger than `TELEMETRY_CAPTURE_MAX_BYTES` (default: 250MB)

**Solution**: 
- Increase limit: `TELEMETRY_CAPTURE_MAX_BYTES_MB=500`
- Or use streaming parser: Already implemented in resync

### "Capture disabled"

```json
{
  "errorCode": "CAPTURE_DISABLED",
  "errorMessage": "Telemetry capture is disabled (TELEMETRY_CAPTURE_FIXTURES=false)"
}
```

**Solution**: Enable capture with `TELEMETRY_CAPTURE_FIXTURES=true`

## Environment Variables

```bash
# Enable/disable capture to disk
TELEMETRY_CAPTURE_FIXTURES=true

# Where to save captured files
TELEMETRY_CAPTURE_FIXTURES_DIR=.telemetry-captured

# Max size per captured file (MB)
TELEMETRY_CAPTURE_MAX_BYTES_MB=250

# Timeout for PUBG API requests (ms)
TELEMETRY_FETCH_TIMEOUT_MS=30000

# Max asset size to download (MB)
TELEMETRY_MAX_ASSET_SIZE_MB=250
```

## Complete Example: Sync 5 Matches

```bash
# Step 1: Capture files from PUBG API
curl -X POST http://localhost:3000/api/clans/1/telemetry/fetch-files-selected \
  -H "Content-Type: application/json" \
  -d '{"squadMatchIds": ["id1", "id2", "id3", "id4", "id5"]}'

# Output: Shows capturedCount: 5

# Step 2: Verify files were saved
ls -lah .telemetry-captured/ | grep "id1\|id2\|id3\|id4\|id5"

# Step 3: Resync from captured files
curl -X POST http://localhost:3000/api/clans/1/telemetry/resync-files-selected \
  -H "Content-Type: application/json" \
  -d '{
    "squadMatchIds": ["id1", "id2", "id3", "id4", "id5"],
    "recalculateAggregates": true
  }'

# Output: Shows successCount: 5, aggregatesRecalculated: true

# Step 4: Verify data in API
curl 'http://localhost:3000/api/clans/1/telemetry/playstyle?period=week'
```

## Performance Notes

- **Capture**: ~2-5 seconds per match (depends on file size)
- **Resync**: ~1-2 seconds per match (disk I/O + parsing)
- **For 48 matches**: ~2-5 minutes total (capture + resync)

## Advanced: Batch Processing

For processing large numbers of matches, use the CLI:

```bash
# Capture + Resync in one command
npm run telemetry:batch -- --clan 1 --all-matches

# What it does:
# 1. Fetches all matches for clan 1
# 2. Captures telemetry from PUBG API
# 3. Resyncs from captured files
# 4. Recalculates aggregates
```

## Key Takeaway

Always follow this order:
1. **fetch-files-selected** (or sync-batch-manual directly) → Capture from PUBG
2. **resync-files-selected** → Read captured files
3. **Verify** → Check data is available in API

Trying to resync without capturing first will fail with "file is missing" errors.
