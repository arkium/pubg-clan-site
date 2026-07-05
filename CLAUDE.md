@AGENTS.md

# PUBG Clan Site — Guide agent

## Quick Navigation

| Section | Purpose |
|---------|---------|
| [Stack](#stack) | Tech versions & Node.js constraints |
| [Organisation du code](#organisation-du-code) | Folder structure & key files |
| [Patterns de pages](#patterns-de-pages) | Server vs Client components |
| [Thème et UI](#thème-et-ui--règles-pour-nouvelles-pages) | CSS tokens, components, layout |
| [Data Fetching & Session](#data-fetching--session) | Client hooks, API routes, auth |
| [Workers & CLI](#workers--cli-scripts) | Telemetry, batch sync, cron |
| [Environment & Gotchas](#environment--known-issues) | Critical issues & workarounds |
| [Scripts](#scripts-utiles) | Development & deployment commands |
| [Documentation](#documentation) | Project docs index |

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

## Data Fetching & Session

### Client Data Fetching (Majority of Pages)

Pages are `'use client'` and use **custom hooks** to fetch data:

```tsx
'use client'
import { useLeaderboard } from '@/hooks/useLeaderboard'
import { useParams } from 'next/navigation'

export default function LeaderboardPage() {
  const params = useParams<{ clanId: string }>()
  const clanId = Number(params.clanId)
  
  const { data, loading, error } = useLeaderboard(clanId)
  
  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>
  return <div>{data.players.map(p => <div key={p.id}>{p.name}</div>)}</div>
}
```

**Key hooks** (see `src/hooks/`):
- `useSelectedClan()` — Current clan context (localStorage + change events)
- `useAuthSession()` — Session state + logout on 401
- `useLeaderboard()`, `useMatchHistory()`, `usePlayerStats()` — Data fetching with cancellation

**Pattern:**
1. Hook calls `fetch('/api/...', { cache: 'no-store' })`
2. Manages loading/error state internally
3. Cancels requests if component unmounts (`AbortController`)
4. Calls `POST /api/auth/logout` on 401 to purge expired token

### API Routes (Standard Web API)

All under `src/app/api/`. **MUST return standard `Response`, NOT `NextResponse`**.

Pattern:
```typescript
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params  // ← ALWAYS await params (Next.js 16)
  
  try {
    const data = await prisma.clan.findUnique({
      where: { id: Number(clanId) }
    })
    return Response.json({ data })
  } catch (error) {
    console.error('Error:', error)
    return Response.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}
```

**Important:**
- Params is always a `Promise` → must `await` before use
- Return `Response.json()`, not `NextResponse.json()`
- Handle errors with try-catch; log them
- Set proper HTTP status codes (200, 400, 401, 404, 500)

### Session & Auth (Client-Side)

Session is **cookie-based** with server-side validation:

1. **Cookie:** `pubg_clan_session` (HTTP-only, set by auth routes)
2. **Validation:** `src/app/layout.tsx` (async Server Component)
   ```typescript
   const session = await getSessionFromToken(cookies())
   ```
3. **Client Hook:** `useAuthSession()` calls `GET /api/auth/session`
   - Returns `{ user, expires, role }`
   - Auto-logs out on 401 (expired token)

**Auth Flow:**
- `POST /api/auth/login` → validates password → sets cookie → redirects
- `POST /api/auth/logout` → clears cookie
- `POST /api/auth/activate` → sets up SuperUser (first run only)

**Guard Routes:**
- `src/proxy.ts` (edge middleware) redirects based on `setupState`:
  - `first_run` → `/setup`
  - `pending_activation` → `/activate`
  - `completed` → check session cookie → proceed

## Workers & CLI Scripts

### Telemetry Worker (Infinite Loop)

```bash
npm run telemetry:worker     # Runs forever (512 MB memory limit)
npm run telemetry:worker:once  # One pass then exit
```

**What it does:**
1. Fetches jobs from `TelemetryResyncJob` queue (status = `pending`)
2. Downloads match telemetry from PUBG CDN
3. Parses squad members, stats, heatmaps
4. Stores in database (`Match`, `SquadMatch`, `SquadMember`, etc.)
5. Auto-recovers stuck jobs (`running` > 10 min)
6. Pauses on database backpressure (lag detected)

**Known Issue:** Node.js 22 `Readable.toWeb()` memory leak on sequential parses.
**Workaround:** [src/lib/pubg-telemetry/resync-files.ts](src/lib/pubg-telemetry/resync-files.ts) uses manual `ReadableStream` adapter.

### Batch CLI (Enqueue Jobs)

```bash
npm run telemetry:batch -- --clan 1 --all-matches
npm run telemetry:batch -- --all-clans --all-matches
npm run telemetry:batch -- --recalc-aggregates
```

**Flags:**
- `--clan <id>` — Sync matches for one clan
- `--all-clans` — Sync all registered clans
- `--all-matches` — Include old matches (slow)
- `--recalc-aggregates` — Trigger period stats recalculation

### Cron Jobs (Automatic)

Orchestrated by `src/lib/cron-jobs.ts`. Triggered via:
1. Next.js internal API endpoint: `POST /api/internal/cron/trigger`
2. External cron service (Linux systemd timers in production)

**Scheduled Jobs:**
```
0 2 * * *  →  Clan match sync (latest matches from PUBG API)
0 3 * * *  →  Recalc leaderboard & badges (stats-calculator.ts)
0 4 * * *  →  Lifetime stats sync (season averages)
0 5 * * *  →  Ranked season data sync
0 18 * * *  →  Send online reminders (if enabled)
0 8 * * 1  →  Weekly report generation
0 8 1 * *  →  Monthly report generation
```

**Observability:** `/clans/[clanId]/settings/cron` dashboard shows last run time & errors.
**Tracking:** `CronExecution` table stores execution logs.

### Other CLI Scripts

| Script | Purpose |
|--------|---------|
| `npm run make-superuser -- user@example.com` | Grant/revoke SuperUser status |
| `npm run scores:recalc` | Manually recalculate leaderboard positions & badges |
| `npm run sync:pubg-assets` | Fetch weapon/map/phase labels from PUBG API (seeds `Label` table) |

## Environment & Known Issues

### Critical: Environment Variables

| Variable | Used For | Where to Set |
|----------|----------|--------------|
| `DATABASE_URL` | Prisma + scripts | `.env` (Prisma reads this for CLI) or `.env.local` (Next.js) |
| `PUBG_API_KEY` | PUBG API client | `.env` or `.env.local` |
| `AUTH_BOOTSTRAP_SECRET` | SuperUser activation token | `.env` |
| `SMTP_URL` (optional) | Email delivery (reports, notifications) | `.env` |
| `ENABLE_CRON_JOBS` | Toggle cron scheduling | `.env` (default: `true`) |

**Note:** Prisma CLI commands read `.env`, not `.env.local`. Keep `DATABASE_URL` in `.env` for migrations.

### Known Gotchas

#### 1. **Node.js 22 `Readable.toWeb()` Bug**
- **Issue:** Sequential parses trigger V8 fatal error (exit code 5, unrecoverable)
- **Where:** Telemetry file parsing
- **Fix:** Use manual `ReadableStream` adapter in [resync-files.ts](src/lib/pubg-telemetry/resync-files.ts)
- **Consequence:** **NEVER** call `Readable.toWeb()` in this codebase

#### 2. **PUBG API Format Variance**
- **Issue:** `clan.data` returned as object OR array; sometimes `clans.data` vs `clans`
- **Fix:** Parser accepts both formats; fallback to "Ungrouped" clan
- **Impact:** Clan sync may silently downgrade members to ungrouped

#### 3. **Avatar URL Resolution**
- **Issue:** Avatar is on `UserAccount`, NOT `ClanMember`
- **Path:** `ClanMember.identities[0].user.avatarUrl`
- **Gotcha:** API response format may differ; normalize before storing

#### 4. **Prisma in Edge Runtime**
- **Issue:** Prisma imports cause bundling errors in edge middleware
- **Location:** `src/proxy.ts` (no Prisma, no session logic allowed)
- **Fix:** Delegate to `/api/auth/session` for session checks

#### 5. **useSearchParams() SSR Hydration Mismatch**
- **Issue:** Next.js 16 warns if `useSearchParams()` used in Server-rendered page
- **Fix:** Wrap in `<Suspense>` with fallback
- **Pattern:**
  ```tsx
  'use client'
  import { Suspense } from 'react'
  
  function MyComponent() {
    const params = useSearchParams()  // Safe inside Suspense
    return <div>{params.get('q')}</div>
  }
  
  export default function Page() {
    return <Suspense fallback={<div>Loading...</div>}>
      <MyComponent />
    </Suspense>
  }
  ```

#### 6. **Session Cookie Expiry Not Auto-Purged**
- **Issue:** Expired token stays in browser; no logout redirect until next fetch
- **Fix:** `useAuthSession()` hook detects 401 and calls logout + clears cookie
- **Gotcha:** Manual page refresh may show stale data briefly

#### 7. **Theme Flash on Page Load**
- **Fix:** `ThemeInitializer` component runs early to set `data-app-theme` before hydration
- **Gotcha:** If theme reads from wrong source, flash occurs

#### 8. **Rate Limiting Strategy**
- **Setting:** `AppConfig.pubg_api_rate_limit_rpm` (default: 10 RPM)
- **Override via UI:** `/settings/pubg-api-rate-limit` (admin only)
- **Override via CLI:** Set env var `PUBG_API_RATE_LIMIT_RPM` before running worker
- **Fallback:** If DB query fails, reads from env var

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
npm run dev                           # Dev server + webpack watch (8 GB heap required)
npm run dev:turbopack                # Experimental Turbopack dev (faster rebuilds)
npm run telemetry:worker             # Infinite resync worker (512 MB memory limit)
npm run telemetry:worker:once        # Single pass then exit
npm run telemetry:aggregates:worker  # Aggregate period stats from match data
npm run telemetry:batch -- <FLAGS>   # Enqueue sync jobs (see Workers & CLI section)
npm run scores:recalc                # Recalculate leaderboard & badges
npm run make-superuser -- EMAIL      # Grant/revoke SuperUser status
npm run sync:pubg-assets             # Fetch asset labels (weapons, maps, phases)
npm run build                        # Production standalone build
npm run start                        # Run production server (requires .next/standalone)
npm run lint                         # Run ESLint
npm run test:telemetry               # Run Vitest (telemetry parser tests only)
```

### Memory Allocation

- **Dev:** `--max-old-space-size=8192` (webpack cache is memory-intensive)
- **Worker:** Capped at 512 MB (monitor via `ps aux | grep node`)
- **Batch:** Standard (inherits from shell)

### Database Migrations

```bash
# Auto-apply pending migrations (required on deploy)
npx prisma migrate deploy

# Create migration from schema changes
npx prisma migrate dev --name <description>

# Reset DB (WARNING: deletes all data)
npx prisma migrate reset
```

### Production Deployment

1. Apply migrations: `npx prisma migrate deploy`
2. Build: `npm run build`
3. Copy `/.next/standalone` to production
4. Set `.env` (DATABASE_URL, API keys, secrets)
5. Start process: `npm start`
6. Or use systemd: `systemctl restart pubg-clan-site-web`

See [deployment.md](docs/ops/deployment.md) for full Linux/systemd setup.

## Documentation

`docs/sommaire.md` est l'index principal — commencer par là.
Chaque fonctionnalité majeure a son doc dédié dans `docs/`.
