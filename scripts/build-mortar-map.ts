/**
 * Produit le fond de carte de l'entraînement au mortier (`/mortier`, docs/features/mortier.md) : un extrait de
 * 1 000 × 600 m de Sanhok autour de Bootcamp, découpé dans la carte haute définition officielle et calé sur la
 * grille de 100 m du jeu (l'origine de l'extrait est un multiple de 100 m).
 *
 * Source (75 Mo, non versionnée) : https://media.githubusercontent.com/media/pubg/api-assets/master/Assets/Maps/Sanhok_Main_High_Res.png
 * (dépôt officiel github.com/pubg/api-assets) — 8 192 px pour 4 096 m, soit 0,5 m par pixel.
 *
 *   npx tsx scripts/build-mortar-map.ts <chemin/Sanhok_Main_High_Res.png>
 *
 * Sortie : public/maps/mortar/sanhok-bootcamp.webp. Les constantes doivent rester alignées sur `MORTAR_MAP`
 * (src/lib/mortar/mortar-game.ts).
 */
import { mkdirSync } from 'node:fs'
import path from 'node:path'

import sharp from 'sharp'

const SOURCE_MAP_METERS = 4096
const ORIGIN = { x: 1500, y: 1700 }
const SIZE = { width: 1000, height: 600 }
/** 1,4 px par mètre : net sur un écran de 2× à la largeur d'affichage (environ 700 px). */
const OUTPUT_PX_PER_METER = 1.4

async function main() {
  const source = process.argv[2]
  if (!source) throw new Error('Chemin de Sanhok_Main_High_Res.png requis')

  const image = sharp(source, { limitInputPixels: false })
  const { width } = await image.metadata()
  if (!width) throw new Error('Image illisible')
  const pxPerMeter = width / SOURCE_MAP_METERS

  const output = path.join('public', 'maps', 'mortar', 'sanhok-bootcamp.webp')
  mkdirSync(path.dirname(output), { recursive: true })
  const info = await image
    .extract({
      left: Math.round(ORIGIN.x * pxPerMeter),
      top: Math.round(ORIGIN.y * pxPerMeter),
      width: Math.round(SIZE.width * pxPerMeter),
      height: Math.round(SIZE.height * pxPerMeter),
    })
    .resize(Math.round(SIZE.width * OUTPUT_PX_PER_METER), Math.round(SIZE.height * OUTPUT_PX_PER_METER))
    .webp({ quality: 74 })
    .toFile(output)
  console.log(`${output} — ${info.width} × ${info.height} px, ${(info.size / 1024).toFixed(0)} Ko`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
