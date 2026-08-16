#!/usr/bin/env node

/**
 * Télécharge les assets visuels depuis pubg/api-assets (raw GitHub).
 *
 * Usages:
 *   npm run sync:pubg-assets                  # armes (+ jetables) + véhicules + items Use
 *   npm run sync:pubg-assets -- --weapons     # armes + jetables (grenades, C4...) uniquement
 *   npm run sync:pubg-assets -- --vehicles    # véhicules uniquement
 *   npm run sync:pubg-assets -- --items       # items Use (soin, boost, fuel, gadget) uniquement
 *   npm run sync:pubg-assets -- --maps        # maps No_Text (heatmaps)
 *   npm run sync:pubg-assets -- --force       # réécrit les fichiers existants
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'fs'
import { join } from 'path'

const GITHUB_API = 'https://api.github.com/repos/pubg/api-assets/contents'

interface GithubEntry {
  name: string
  type: 'file' | 'dir'
  download_url: string | null
}

async function listFolder(path: string): Promise<GithubEntry[]> {
  const url = `${GITHUB_API}/${path}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'pubg-clan-site-sync' },
  })
  if (res.status === 403) {
    throw new Error('GitHub API rate limit atteint. Attendre quelques minutes et réessayer.')
  }
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} pour ${path}`)
  }
  return res.json() as Promise<GithubEntry[]>
}

async function downloadFile(downloadUrl: string, dest: string, force: boolean): Promise<boolean> {
  if (existsSync(dest) && !force) return false
  const res = await fetch(downloadUrl)
  if (!res.ok) throw new Error(`Téléchargement échoué ${res.status}: ${downloadUrl}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return true
}

async function syncFolder(
  apiPath: string,
  destDir: string,
  force: boolean,
  filter?: (name: string) => boolean
): Promise<{ downloaded: number; skipped: number }> {
  mkdirSync(destDir, { recursive: true })
  const entries = await listFolder(apiPath)
  let downloaded = 0
  let skipped = 0

  for (const entry of entries) {
    if (entry.type !== 'file') continue
    if (!entry.name.endsWith('.png')) continue
    if (filter && !filter(entry.name)) continue
    if (!entry.download_url) continue

    const dest = join(destDir, entry.name)
    const wasDownloaded = await downloadFile(entry.download_url, dest, force)
    if (wasDownloaded) {
      downloaded++
      process.stdout.write('.')
    } else {
      skipped++
    }
  }

  return { downloaded, skipped }
}

/**
 * Copie les PNG absents du repo officiel pubg/api-assets (armes trop récentes,
 * pas encore ajoutées par la communauté — ex. JS9) depuis un dossier versionné
 * du projet. Toujours écrasé (contrairement au sync GitHub) : un fichier manuel
 * est sciemment maintenu par le projet, pas un cache à préserver.
 */
function copyManualOverrides(sourceDir: string, destDir: string): number {
  if (!existsSync(sourceDir)) return 0
  mkdirSync(destDir, { recursive: true })
  let copied = 0
  for (const name of readdirSync(sourceDir)) {
    if (!name.endsWith('.png')) continue
    copyFileSync(join(sourceDir, name), join(destDir, name))
    copied++
  }
  return copied
}

const args = process.argv.slice(2)
const force = args.includes('--force')
const flagWeapons = args.includes('--weapons')
const flagVehicles = args.includes('--vehicles')
const flagItems = args.includes('--items')
const flagMaps = args.includes('--maps')
const syncAll = !flagWeapons && !flagVehicles && !flagItems && !flagMaps

const root = process.cwd()
const weaponsDir = join(root, 'public', 'icons', 'pubg', 'weapons')
const vehiclesDir = join(root, 'public', 'icons', 'pubg', 'vehicles')
const itemsDir = join(root, 'public', 'icons', 'pubg', 'items')
const mapsDir = join(root, 'public', 'maps', 'pubg')
const manualWeaponAssetsDir = join(root, 'scripts', 'manual-weapon-assets')

async function main() {
  console.log(`Mode: ${force ? 'force (réécriture)' : 'incrémental (skip existants)'}`)

  if (syncAll || flagWeapons) {
    console.log('\nArmes — Main, Handgun, Melee, Throwable...')
    let total = { downloaded: 0, skipped: 0 }
    for (const sub of ['Weapon/Main', 'Weapon/Handgun', 'Weapon/Melee', 'Equipment/Throwable']) {
      const result = await syncFolder(`Assets/Item/${sub}`, weaponsDir, force)
      total.downloaded += result.downloaded
      total.skipped += result.skipped
    }
    console.log(`\n  ✓ ${total.downloaded} téléchargés, ${total.skipped} déjà présents`)

    const manualCopied = copyManualOverrides(manualWeaponAssetsDir, weaponsDir)
    if (manualCopied > 0) {
      console.log(`  ✓ ${manualCopied} icône(s) manuelle(s) recopiée(s) depuis scripts/manual-weapon-assets/ (absentes du repo officiel)`)
    }
  }

  if (syncAll || flagVehicles) {
    console.log('\nVéhicules...')
    const result = await syncFolder('Assets/Vehicle', vehiclesDir, force)
    console.log(`\n  ✓ ${result.downloaded} téléchargés, ${result.skipped} déjà présents`)
  }

  if (syncAll || flagItems) {
    console.log('\nItems — Heal, Boost, Fuel, Gadget...')
    let total = { downloaded: 0, skipped: 0 }
    for (const sub of ['Heal', 'Boost', 'Fuel', 'Gadget']) {
      const result = await syncFolder(`Assets/Item/Use/${sub}`, itemsDir, force)
      total.downloaded += result.downloaded
      total.skipped += result.skipped
    }
    console.log(`\n  ✓ ${total.downloaded} téléchargés, ${total.skipped} déjà présents`)
  }

  if (flagMaps) {
    console.log('\nMaps (variants No_Text pour heatmaps)...')
    const result = await syncFolder(
      'Assets/Maps',
      mapsDir,
      force,
      (name) => name.includes('No_Text')
    )
    console.log(`\n  ✓ ${result.downloaded} téléchargées, ${result.skipped} déjà présentes`)
  }

  console.log('\nTerminé.')
}

main().catch((err: Error) => {
  console.error(`\nErreur: ${err.message}`)
  process.exit(1)
})
