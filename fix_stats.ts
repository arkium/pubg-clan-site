import { syncTrackedClanStats } from './src/lib/clan-service'

async function fix() {
  console.log("Synchronisation manuelle du clan 7...")
  await syncTrackedClanStats(7)
  console.log("Terminé !")
}

fix()
