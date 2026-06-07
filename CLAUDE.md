@AGENTS.md

# PUBG Clan Site — Guide agent

## Stack

| Technologie | Version | Notes |
|---|---|---|
| Next.js | 16.2.6 | Breaking changes vs versions antérieures — lire `node_modules/next/dist/docs/` |
| React | 19.2.4 | Server Components activés |
| TypeScript | 5 | Strict mode |
| Tailwind CSS | 4 | Syntaxe `@import "tailwindcss"` dans globals.css |
| Prisma | 6.19.3 | Library engine (Rust in-process), MySQL/MariaDB |
| Node.js | 22 LTS | **Node 24 interdit** (prédev script bloque) |
| Vitest | 2.1.9 | Tests télémétrie uniquement |

## Organisation du code

```
src/
  app/                        # Pages et routes (Next.js App Router)
    api/clans/[clanId]/       # 17+ routes API
    clans/[clanId]/           # Pages par clan
    members/[id]/             # Pages par membre
    settings/                 # Pages admin
  components/                 # Composants React
    ui/                       # Composants UI partagés
  hooks/                      # Hooks React (data fetching côté client)
  lib/                        # Logique métier
    pubg-telemetry/           # Pipeline télémétrie complet
    pubg.ts                   # Client API PUBG
    cron-jobs.ts              # Orchestration cron
    clan-service.ts           # Sync clan PUBG
    stats-calculator.ts       # Agrégats PlayerStats
  types/                      # Types TypeScript partagés

scripts/                      # Scripts Node (worker télémétrie, batch, CLI)
prisma/                       # Schéma et migrations
docs/                         # Documentation technique (sommaire.md → index)
```

## Patterns de pages

### Pages client (la majorité)

Les pages de données actives sont des Client Components avec `'use client'` en tête de fichier.
Elles utilisent des hooks (`useLeaderboard`, `useSquadMatches`, `useSelectedClan`, etc.) pour fetcher via les routes API.

```tsx
'use client'
import { useParams } from 'next/navigation'
import ClanSectionNav from '@/components/ClanSectionNav'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function MyPage() {
  const params = useParams()
  const clanId = parseClanId(params.clanId)
  // ...
}
```

### Pages serveur (auth, layout, setup)

`src/app/layout.tsx` est async server component. Il lit les cookies (`cookies()`) et gère l'affichage conditionnel du shell (nav + footer) selon la session.

### Routes API

Toutes sous `src/app/api/`. Retournent `Response` (Web API standard), pas `NextResponse`.
Pattern type :

```typescript
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params
  // ...
  return Response.json({ data })
}
```

## Thème et UI — Règles pour nouvelles pages

### 1. Structure de base obligatoire

Toute nouvelle page doit utiliser `.app-container` et `.app-main` :

```tsx
<main className="app-container app-main">
  {/* contenu */}
</main>
```

- `.app-container` : largeur max 1024px, centré (variable `--app-content-max-width: 64rem`)
- `.app-main` : padding horizontal et vertical standard (`--app-page-padding-x: 1rem`, `--app-page-padding-y: 2rem`)

### 2. Navigation de section

Inclure `<ClanSectionNav />` en haut de page pour les pages sous `/clans/[clanId]/`.
Équivalent pour les pages membres : composant de nav membre si existant.

### 3. Panneaux et surfaces

| Besoin | Classe à utiliser |
|---|---|
| Panneau principal (blanc/slate en dark) | `.app-panel` |
| Panneau secondaire (fond légèrement teinté) | `.app-panel-muted` |
| Surface de page | variable `--page-surface` via `main.app-page-surface` |

**Ne jamais** hardcoder des couleurs comme `bg-white`, `bg-slate-800`, `border-gray-200`.
Utiliser les tokens CSS ou les classes Tailwind qui sont remappées automatiquement par `globals.css` selon le thème actif.

### 4. Classes Tailwind remappées par le thème

`globals.css` remplace automatiquement ces classes selon `data-app-theme` :

| Classe Tailwind | Remappée vers |
|---|---|
| `bg-white`, `bg-white/90`, etc. | `--theme-ui-surface` |
| `bg-gray-50`, `bg-slate-50`, etc. | `--theme-ui-surface-soft` |
| `bg-gray-100`, `bg-slate-100` | `--theme-ui-surface-strong` |
| `border-gray-200`, `border-slate-200`, etc. | `--theme-ui-border` |
| `text-gray-900`, `text-slate-900` | `--theme-ui-text` |
| `text-gray-700`, `text-slate-600`, etc. | `--theme-ui-text-secondary` |
| `text-gray-500`, `text-slate-500`, etc. | `--theme-ui-text-muted` |
| `hover:bg-gray-50`, `hover:bg-slate-100`, etc. | `--theme-ui-hover` |

Ces classes fonctionnent donc en clair **et** en sombre sans aucun `dark:` explicite.

### 5. Espacement et rythme

- Espacement vertical principal : `py-8`
- Entre blocs : `gap-4` à `gap-6`
- Éviter les mélanges `py-6`/`py-10` sans raison contextuelle

### 6. Composants UI partagés — utiliser en priorité

| Besoin | Composant | Fichier |
|---|---|---|
| Filtres / onglets segmentés | `SegmentedControl` | `src/components/ui/SegmentedControl.tsx` |
| Badge placement #1/#5/#10 | `PlacementBadge` | `src/components/ui/PlacementBadge.tsx` |
| Badge mode équipe Duo/Trio/Squad | `TeamModeBadge` | `src/components/ui/TeamModeBadge.tsx` |
| Badge nom de joueur | `PlayerNameBadge` | `src/components/ui/PlayerNameBadge.tsx` |
| Menu dropdown mobile | `MobileDropdownNav` | `src/components/ui/MobileDropdownNav.tsx` |

**Règle :** Ne jamais réécrire ces composants inline dans une page. Ne pas écrire les classes `app-placement-badge*` directement.

### 7. Thème actif

Le thème est stocké sur `data-app-theme` de `<html>` et `<body>` (`'light'` ou `'dark'`).
Il est initialisé côté client par `ThemeInitializer` pour éviter le flash.
Ne jamais lire/écrire le thème directement depuis une page — passer par les tokens CSS.

### 8. Checklist nouvelle page

- [ ] Structure `app-container` + `app-main`
- [ ] Navigation de section incluse (`ClanSectionNav` ou équivalent)
- [ ] Panneaux avec `.app-panel` / `.app-panel-muted` (pas de couleurs hardcodées)
- [ ] Couleurs de texte/fond via classes Tailwind remappées ou tokens CSS
- [ ] Rendu vérifié en thème clair ET sombre
- [ ] Contenu centré et borné à 1024px sur desktop
- [ ] Mobile testé (espacement, overflow, navigation)

## Gotchas connus

### Node.js 22 — `Readable.toWeb()` bug

`Readable.toWeb()` a une fuite mémoire sur les streams séquentiels dans Node.js 22.
Le 2e parse successif déclenche un V8 Fatal Error (exit code 5, non interceptable).

**Solution :** utiliser l'adaptateur manuel dans `src/lib/pubg-telemetry/resync-files.ts` :

```typescript
function nodeReadableToWebStream(readable: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      readable.on('data', (chunk) => {
        controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk))
        readable.pause()
      })
      readable.on('end', () => controller.close())
      readable.on('error', (err) => controller.error(err))
    },
    pull() { readable.resume() },
    cancel() { readable.destroy() },
  })
}
```

Ne jamais utiliser `Readable.toWeb()` dans ce projet.

### Next.js 16.2.6

`params` dans les routes App Router est une `Promise` — toujours `await params` dans les handlers.
`cookies()` est async. `headers()` est async. Voir `node_modules/next/dist/docs/`.

### Worker télémétrie

Le worker `npm run telemetry:worker` tourne hors process Next.js avec une mémoire limitée à 512 Mo.
Il récupère automatiquement les jobs bloqués (`running` > 10 min) au démarrage.
Voir `docs/telemetry-worker-crash-fix.md` pour l'historique du bug et les correctifs.

## Scripts utiles

```bash
npm run dev                    # Dev avec webpack (--max-old-space-size=8192)
npm run telemetry:worker       # Worker résync télémétrie (boucle infinie)
npm run telemetry:worker:once  # Worker une passe puis exit
npm run telemetry:batch        # Enqueue batch de jobs depuis CLI
npm run build                  # Build production (+ copy-standalone-assets)
npm run test:telemetry         # Tests Vitest
npm run lint                   # ESLint
```

## Documentation

`docs/sommaire.md` est l'index principal — commencer par là.
Chaque fonctionnalité majeure a son doc dédié dans `docs/`.
