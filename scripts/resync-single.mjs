import { createReadStream } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { syncTelemetryForSquadMatchFromStream } from '../src/lib/pubg-telemetry/manual-sync.js'

const SQUAD_MATCH_ID = 'cmpufzh12008l04q437bfkmww'
const CLAN_ID = 1
const CAPTURE_DIR = path.resolve(process.cwd(), '.telemetry-captured')

import { readdir, stat } from 'node:fs/promises'

const files = await readdir(CAPTURE_DIR)
const suffix = `-${SQUAD_MATCH_ID}.json`
const candidates = files.filter(f => f.endsWith(suffix))

if (candidates.length === 0) {
  console.error('No capture file found for', SQUAD_MATCH_ID)
  process.exit(1)
}

// Pick most recent
let best = null
for (const f of candidates) {
  const fp = path.join(CAPTURE_DIR, f)
  const s = await stat(fp)
  if (!best || s.mtimeMs > best.mtimeMs) best = { filePath: fp, size: s.size, mtimeMs: s.mtimeMs }
}

console.log('Using file:', best.filePath, `(${(best.size / 1024 / 1024).toFixed(1)} Mo)`)

const nodeStream = createReadStream(best.filePath)
const webStream = Readable.toWeb(nodeStream)

const result = await syncTelemetryForSquadMatchFromStream({
  clanId: CLAN_ID,
  squadMatchId: SQUAD_MATCH_ID,
  stream: webStream,
  contentLength: best.size,
})

console.log(JSON.stringify({
  status: result.status,
  positionSamplesCount: result.positionSamplesCount,
  trajectorySegmentsCount: result.trajectorySegmentsCount,
  deathSamplesCount: result.deathSamplesCount,
}, null, 2))
