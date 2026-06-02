# Assets cartes PUBG (heatmap-kills)

Ce dossier contient les visuels de cartes utilises par la page:

- `/clans/[clanId]/stats/heatmap-kills`

## Format

- format: `.webp`
- resolution recommandee: `1280x720` (16:9)
- poids cible: `<= 250 Ko` par image

## Convention de nommage (obligatoire)

Le nom de fichier doit correspondre exactement au `mapName` PUBG renvoye par l'API, avec extension `.webp`:

- `Baltic_Main.webp` (Erangel)
- `Savage_Main.webp` (Sanhok)
- `Desert_Main.webp` (Miramar)
- `DihorOtok_Main.webp` (Vikendi)
- `Range_Main.webp` (Camp Jackal)
- `Summerland_Main.webp` (Karakin)
- `Tiger_Main.webp` (Taego)
- `Kiki_Main.webp` (Deston)
- `Chimera_Main.webp` (Paramo)
- `Heaven_Main.webp` (Haven)
- `Neon_Main.webp` (Rondo)

## Exemple de chemin final

- `public/maps/pubg/Baltic_Main.webp`
- `public/maps/pubg/Desert_Main.webp`

La page chargera automatiquement les images via:

- `/maps/pubg/<mapName>.webp`
