/**
 * Parse une capture télémétrie réelle hors base pour vérifier la ventilation
 * des zones anatomiques et le centre du prochain cercle.
 * Usage: npx tsx scripts/inspect-body-zones.ts [cheminFichier]
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

import { mergeBodyZoneBreakdowns } from '../src/lib/pubg-telemetry/body-zones'
import { parseTelemetrySnapshot } from '../src/lib/pubg-telemetry/parser'

const MAX_FILE_BYTES = 60 * 1024 * 1024

async function resolveTargetFile() {
  const explicit = process.argv[2]
  if (explicit) return explicit

  const dir = path.join(process.cwd(), '.telemetry-captured')
  const files = (await readdir(dir)).filter((name) => name.endsWith('.json'))
  if (files.length === 0) throw new Error('Aucune capture disponible')

  const sized = await Promise.all(
    files.map(async (name) => {
      const full = path.join(dir, name)
      return { full, size: (await stat(full)).size }
    })
  )

  // La plus grosse capture exploitable donne l'échantillon le plus représentatif.
  const usable = sized.filter((entry) => entry.size <= MAX_FILE_BYTES)
  usable.sort((left, right) => right.size - left.size)
  if (usable.length === 0) throw new Error('Toutes les captures dépassent la limite de taille')
  return usable[0].full
}

async function main() {
  const target = await resolveTargetFile()
  const size = (await stat(target)).size
  console.log(`Fichier : ${path.basename(target)} (${(size / 1024 / 1024).toFixed(1)} Mo)`)

  const raw = await readFile(target, 'utf8')
  const events: unknown = JSON.parse(raw)
  const snapshot = parseTelemetrySnapshot(events)

  const withZones = snapshot.memberStats.filter(
    (member) => (member.bodyZonesTaken?.length ?? 0) > 0
  )

  console.log('\n=== ZONES ANATOMIQUES ===')
  console.log({
    membres: snapshot.memberStats.length,
    membresAvecZonesSubies: withZones.length,
    evenementsDegats: snapshot.summary.damageEvents,
  })

  const top = [...snapshot.memberStats]
    .sort((left, right) => right.damageDealt - left.damageDealt)
    .slice(0, 3)

  for (const member of top) {
    console.log(`\n${member.memberKey} — ${Math.round(member.damageDealt)} dmg infliges`)
    console.log('  infliges :', JSON.stringify(member.bodyZonesDealt))
    console.log('  subis    :', JSON.stringify(member.bodyZonesTaken))
  }

  console.log('\n=== AGREGAT LOBBY (degats subis) ===')
  const merged = mergeBodyZoneBreakdowns(snapshot.memberStats.map((member) => member.bodyZonesTaken))
  for (const row of merged) {
    console.log(
      `  ${row.zone.padEnd(7)} ${String(Math.round(row.damage)).padStart(7)} dmg  ${String(
        row.hits
      ).padStart(5)} touches`
    )
  }

  const totalZoneDamage = merged.reduce((sum, row) => sum + row.damage, 0)
  const totalMemberDamage = snapshot.memberStats.reduce((sum, member) => sum + member.damageTaken, 0)
  console.log('\n=== CONTROLE DE COHERENCE ===')
  console.log({
    sommeZones: Math.round(totalZoneDamage),
    sommeDamageTaken: Math.round(totalMemberDamage),
    ecart: Math.round(totalZoneDamage - totalMemberDamage),
  })

  console.log('\n=== CERCLE BLANC (prochaine zone) ===')
  console.log({
    snapshots: snapshot.phaseSnapshots.length,
    avecCentre: snapshot.phaseSnapshots.filter(
      (entry) => typeof entry.poisonGasWarningX === 'number'
    ).length,
    exemple:
      snapshot.phaseSnapshots.find((entry) => typeof entry.poisonGasWarningX === 'number') ?? null,
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
