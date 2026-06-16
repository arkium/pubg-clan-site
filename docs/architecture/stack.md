# Stack technique

## Vue d'ensemble

Application web interne de suivi de performances pour clan PUBG. Outil privé, pas de contraintes d'accessibilité publique ni de SEO.

## Technologies et versions

### Next.js 16.2.6

Version avec breaking changes substantiels par rapport aux versions 14/15 couramment documentées en ligne.

Points critiques :
- `params` dans les routes App Router est une **`Promise`** — toujours `await params` avant d'accéder aux segments
- `cookies()` est **async** — `const cookieStore = await cookies()`
- `headers()` est **async**
- Retourner **`Response`** (Web API standard) dans les routes API, pas `NextResponse` — sauf quand on a besoin de `NextResponse.redirect` ou d'un helper spécifique
- `export const dynamic = 'force-dynamic'` sur le layout racine pour éviter le cache statique de la session

Lire `node_modules/next/dist/docs/` avant toute modification de routing ou middleware.

### React 19.2.4

Server Components activés. La quasi-totalité des pages de données sont des Client Components (`'use client'`) pour des raisons de fetching côté client avec état. Les Server Components sont utilisés sur le layout racine (`src/app/layout.tsx`) et les pages statiques (login, setup).

### TypeScript 5 (strict)

Mode strict activé. Pas de `any` implicite. Les types partagés sont dans `src/types/`.

### Tailwind CSS 4

Syntaxe différente des versions 3 et antérieures :

```css
/* globals.css — syntaxe v4 */
@import "tailwindcss";
```

Pas de fichier `tailwind.config.js` au sens traditionnel. PostCSS est configuré via `@tailwindcss/postcss`.

Le thème est implémenté via des variables CSS personnalisées et `data-app-theme` sur `<html>` et `<body>`. Les classes Tailwind standard (`bg-white`, `bg-gray-50`, `text-gray-900`, etc.) sont remappées automatiquement par `globals.css` selon le thème actif — ne pas utiliser `dark:` explicitement dans les composants.

### Prisma 6.19.3

Engine **library** (Rust in-process), pas l'engine binaire. Conséquences :
- Pas de processus `prisma` séparé à démarrer
- Compatible avec le mode standalone de Next.js (les assets Prisma sont copiés par `scripts/copy-standalone-assets.mjs` en post-build)
- Provider : `mysql` (MariaDB en production)

**Migration manuelle obligatoire en production.** Ne pas lancer `prisma migrate dev` ni `prisma migrate deploy` sur le serveur — risque de conflit de checksum sur les migrations déjà appliquées par d'autres moyens. Appliquer les SQL de migration manuellement.

### Node.js 22 LTS

Requis. Node 24 est explicitement bloqué par le script `predev` :

```json
"predev": "node -e \"const major=parseInt(process.versions.node.split('.')[0],10); if(major>=24){console.error('Node 24 detecte. Utilise Node 22.22.3 (voir .nvmrc).'); process.exit(1)}\""
```

Le fichier `.nvmrc` spécifie la version exacte (`22.22.3`). Utiliser `nvm use` ou `fnm use` avant de démarrer.

Raison du blocage Node 24 : incompatibilités non résolues avec certaines dépendances natives au moment du développement.

**Bug `Readable.toWeb()` sur Node 22 :** `Readable.toWeb()` a une fuite mémoire sur les streams séquentiels dans Node 22. Le 2e parse successif déclenche un V8 Fatal Error (exit code 5, non interceptable). Solution : adaptateur manuel dans `src/lib/pubg-telemetry/resync-files.ts`. Ne jamais appeler `Readable.toWeb()` dans ce projet.

```typescript
// Adaptateur à utiliser à la place de Readable.toWeb()
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

### Vitest 2.1.9

Tests unitaires uniquement pour le pipeline télémétrie (`src/lib/pubg-telemetry/`). Pas de tests pour les routes API ni les composants React.

### tsx 4.20.5

Utilisé pour exécuter les scripts TypeScript (`scripts/`) directement via Node sans compilation préalable.

### Dépendances applicatives

| Package | Version | Usage |
|---|---|---|
| `axios` | 1.16.1 | Client HTTP pour l'API PUBG |
| `bcryptjs` | 2.4.3 | Hachage des mots de passe (pur JS, pas de binaire natif) |
| `node-cron` | 3.0.3 | Orchestration des cron jobs in-process |
| `nodemailer` | 8.0.8 | Envoi d'emails (rapports, invitations, notifications) |
| `zod` | 4.4.3 | Validation des schémas (config, inputs API) |
| `dotenv` | 17.4.2 | Chargement des variables d'environnement dans les scripts |

## Moteur de développement

`npm run dev` utilise **webpack** (`--webpack`), pas Turbopack. Raison : Turbopack présentait des instabilités avec certains imports dynamiques dans la version Next.js utilisée. Un script `dev:turbopack` existe mais n'est pas recommandé.

Le flag `--max-old-space-size=8192` est nécessaire en développement : le projet génère une charge mémoire élevée (compilation webpack + Prisma client + hot reload).

## Variables d'environnement

Toutes définies dans `.env` (copier depuis `.env.example`).

### Base de données

```env
DATABASE_URL="mysql://user:password@host:3306/dbname"
```

### API PUBG

```env
PUBG_API_KEY="your-api-key"
PUBG_BASE_URL="https://api.pubg.com"
```

### Application

```env
APP_URL="https://example.com"               # URL publique (liens emails, etc.)
NEXT_PUBLIC_APP_URL="https://example.com"   # Idem, exposée côté client
INTERNAL_APP_URL="http://127.0.0.1:3000"   # URL interne (appels server-to-server)
AUTH_ALLOW_LEGACY_ACTOR_ID="false"
AUTH_BOOTSTRAP_SECRET="..."                 # Secret pour la création du 1er compte admin
```

### Email (SMTP)

```env
SMTP_HOST=""
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="PUBG Clan <no-reply@example.com>"
```

### Cron jobs

```env
ENABLE_CRON_JOBS="false"                          # Activer/désactiver tous les crons
CLAN_MATCH_SYNC_CRON="0 2 * * *"                 # Sync des matchs (quotidien 2h)
CLAN_MATCH_SYNC_TIMEZONE="UTC"
CLAN_STATS_RECALC_CRON="0 3 * * *"               # Recalcul stats (quotidien 3h)
CLAN_ONLINE_REMINDER_CRON="0 18 * * *"           # Rappel soirée (quotidien 18h)
WEEKLY_REPORT_REMINDER_CRON="0 9 * * *"
WEEKLY_REPORT_GENERATION_CRON="0 8 * * 1"        # Rapport hebdo (lundi 8h)
MONTHLY_REPORT_GENERATION_CRON="0 8 1 * *"       # Rapport mensuel (1er du mois 8h)
```

`ENABLE_CRON_JOBS` doit rester à `"false"` en développement local. En production, mettre `"true"` uniquement sur l'instance qui doit exécuter les crons (une seule instance).

## Commandes npm

| Commande | Usage |
|---|---|
| `npm run dev` | Serveur de développement (webpack, heap 8 Go) |
| `npm run dev:turbopack` | Dev avec Turbopack (non recommandé, instable) |
| `npm run build` | Build production Next.js + copie assets standalone |
| `npm run start` | Démarrage production après build |
| `npm run lint` | ESLint sur tout le projet |
| `npm run test:telemetry` | Tests Vitest (télémétrie uniquement) |
| `npm run telemetry:worker` | Worker resync télémétrie (boucle infinie, heap 2 Go) |
| `npm run telemetry:worker:once` | Worker une seule passe puis exit |
| `npm run telemetry:aggregates:worker` | Worker de recalcul des agrégats (boucle infinie) |
| `npm run telemetry:aggregates:worker:once` | Worker agrégats une passe |
| `npm run telemetry:batch` | CLI pour enqueue des jobs de télémétrie en batch |
| `npm run sync:pubg-assets` | Sync des dictionnaires PUBG officiels (armes, véhicules, cartes) |

Les workers de télémétrie tournent hors process Next.js avec `--expose-gc` pour forcer le GC manuel et contrôler la mémoire (512 Mo max recommandé en production).

## Navigateurs cibles

Application interne — pas de contrainte IE/legacy. Les navigateurs modernes récents suffisent. Pas de polyfills configurés.

## Build standalone

`next build` génère un output standalone (`output: 'standalone'` dans la config Next). Le script `postbuild` (`scripts/copy-standalone-assets.mjs`) copie les assets publics et les fichiers Prisma nécessaires dans le dossier `.next/standalone/`.
