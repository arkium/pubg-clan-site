/**
 * Mesure, sur la télémétrie brute capturée en local (`.telemetry-captured/`, aucune base), le comptage des véhicules
 * de la cartographie tactique (docs/features/positions.md §4.3) :
 *  - personnes par véhicule pris (vérité : `fellowPassengers`) ;
 *  - le parseur (`teammateAboard`) recopie-t-il bien cette vérité ;
 *  - la déduction de `vehicleTripFlags` sans `teammateAboard` (cas de l'historique) : justesse événement par événement
 *    et nombre de véhicules comptés, équipe par équipe.
 *
 *   npx tsx scripts/measure-vehicle-passengers.ts 10 [décalage]
 * Par lots d'une dizaine de fichiers (34 Mo chacun) : au-delà, Node plante (erreur de segmentation).
 */
import fs from 'node:fs'
import path from 'node:path'

import { parseTelemetrySnapshot } from '@/lib/pubg-telemetry/parser'
import { countsAsPositionVehicle, vehicleTripFlags } from '@/lib/vehicle-trips'

type RawEvent = {
  _T: string
  character?: { accountId?: string; name?: string; teamId?: number }
  fellowPassengers?: Array<{ accountId?: string; teamId?: number }>
}

function load(file: string): RawEvent[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (Array.isArray(parsed)) return parsed as RawEvent[]
  const found = Object.values(parsed as Record<string, unknown>).find(Array.isArray)
  return (found ?? []) as RawEvent[]
}

function main() {
  const limit = Number(process.argv[2] ?? 10)
  const offset = Number(process.argv[3] ?? 0)
  const dir = path.resolve('.telemetry-captured')
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().slice(offset, offset + limit)
  const totals = { files: 0, rides: 0, takes: 0, leaves: 0, lastOut: 0, parserMismatch: 0, guessOk: 0, guessKo: 0, guessTakes: 0, guessLastOut: 0 }

  for (const name of files) {
    const events = load(path.join(dir, name))
    // Vérité : pour chaque montée / descente au sol, dans l'ordre, un coéquipier est-il à bord ?
    const truth: boolean[] = []
    const teamOf = new Map<string, number>()
    for (const event of events) {
      const character = event.character
      if (character?.accountId && typeof character.teamId === 'number') teamOf.set(character.accountId, character.teamId)
    }
    const snapshot = parseTelemetrySnapshot(events)
    const ground = snapshot.vehicleSamples.filter((sample) => countsAsPositionVehicle(sample.vehicleType))
    const rawGround = events.filter((event) =>
      (event._T === 'LogVehicleRide' || event._T === 'LogVehicleLeave') &&
      countsAsPositionVehicle((event as { vehicle?: { vehicleType?: string } }).vehicle?.vehicleType) &&
      Boolean(event.character?.accountId))
    for (const event of rawGround) {
      const team = event.character?.teamId
      truth.push((event.fellowPassengers ?? []).some((other) => other.teamId === team && other.accountId !== event.character?.accountId))
    }
    if (truth.length !== ground.length) {
      console.log(`${name} : ${truth.length} événements bruts pour ${ground.length} échantillons parsés — ignoré`)
      continue
    }
    totals.files += 1

    ground.forEach((sample, index) => {
      if (sample.teammateAboard !== truth[index]) totals.parserMismatch += 1
      if (sample.action === 'ride') {
        totals.rides += 1
        if (!truth[index]) totals.takes += 1
      } else {
        totals.leaves += 1
        if (!truth[index]) totals.lastOut += 1
      }
    })

    // Déduction équipe par équipe, comme pour une escouade dont on connaît les membres, sans la vérité.
    for (const team of new Set(teamOf.values())) {
      const legacy = ground.map((sample) => ({ ...sample, teammateAboard: undefined }))
      const flags = vehicleTripFlags(legacy, (memberKey) => (teamOf.get(memberKey) === team ? memberKey : null))
      legacy.forEach((sample, index) => {
        if (teamOf.get(sample.memberKey) !== team) return
        const counted = flags[index]
        if (counted === !truth[index]) totals.guessOk += 1
        else totals.guessKo += 1
        if (counted && sample.action === 'ride') totals.guessTakes += 1
        if (counted && sample.action === 'leave') totals.guessLastOut += 1
      })
    }
  }

  console.log(`${totals.files} fichiers · véhicules au sol, tout le lobby`)
  console.log(`Montées ${totals.rides} · véhicules pris ${totals.takes} → ${(totals.rides / Math.max(1, totals.takes)).toFixed(2)} personne(s) par véhicule`)
  console.log(`Descentes ${totals.leaves} · derniers à sortir ${totals.lastOut}`)
  console.log(`Parseur (teammateAboard) différent de la vérité : ${totals.parserMismatch}`)
  const accuracy = (totals.guessOk / Math.max(1, totals.guessOk + totals.guessKo)) * 100
  console.log(`Déduction (historique) : ${accuracy.toFixed(1)} % d'événements bien classés · pris ${totals.guessTakes} (vrai ${totals.takes}) · laissés ${totals.guessLastOut} (vrai ${totals.lastOut})`)
}

main()
