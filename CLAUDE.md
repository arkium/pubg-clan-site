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
| Vitest | 2.1.9 | 234 tests — **tout `src/lib/**/*.test.ts`**, pas seulement la télémétrie |

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
    discord/                  # Aperçu d'embed + modale de diffusion tournoi
  hooks/                      # Hooks React (data fetching côté client)
  lib/                        # Logique métier
    pubg-telemetry/           # Pipeline télémétrie complet
    discord/                  # Webhooks Discord (alertes Top 1, résultats de tournoi)
    admin-alerts/             # Alertes du SuperUser dans le salon Discord d'administration
    admin-inbox/              # Boîte « À traiter » de l'accueil Plateforme (et veille Discord du matin)
    clan-onboarding/          # Checklist de mise en route d'un clan (/settings/clans/[clanId]/mise-en-route)
    pubg.ts                   # Client API PUBG
    cron-jobs.ts              # Orchestration cron
    clan-service.ts           # Sync clan PUBG
    stats-calculator.ts       # Agrégats PlayerStats
  types/                      # Types TypeScript partagés

scripts/                      # Tous les scripts Node / TypeScript (worker télémétrie, batch, CLI, tests ad-hoc, backfills)
                              # ⚠️ RÈGLE STRICTE : Tous les scripts utilitaires, de maintenance, de debug et de test
                              # DOIVENT obligatoirement être créés et stockés dans ce dossier `scripts/` (jamais à la racine du projet).
prisma/                       # Schéma et migrations
docs/                         # Documentation technique (sommaire.md → index)
archive/                      # Pages remplacées par la refonte, gardées pour mémoire — ignoré par git, exclu de tsc et ESLint
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

**Page à filtres (bandeau collant)** — le shell fournit déjà `<main>` : la page ouvre un `div` pleine largeur pour que
le bandeau docké couvre toute la colonne ; ses blocs internes portent `app-container app-gutter`.

```tsx
<div className="app-main-flush flex-1">
  <div className="app-container app-gutter">{/* fil d'Ariane, en-tête — sans marge basse finale */}</div>
  <DockingToolbar ariaLabel="Filtres de …">{({ isSticky, compact }) => (/* contrôles */)}</DockingToolbar>
  <div className="app-container app-gutter">{/* contenu */}</div>
</div>
```

Règles complètes : `docs/ui/index.html#sticky-toolbar` ; décisions : `docs/TODO/sticky.md`.

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
| Zoom d'une carte interactive `[ − \| ⊙ 1× \| + ]` | `MapZoomControl` + `@/lib/map-zoom` | `src/components/ui/MapZoomControl.tsx` — règles dans `docs/ui/index.html#zoom-carte` |
| Bandeau de filtres d'une page (collant sous le header) | `DockingToolbar` | `src/components/ui/DockingToolbar.tsx` — règles dans `docs/ui/index.html#sticky-toolbar` |
| Groupe à intitulé dans ce bandeau (« Période », « Type de match »…, infobulle) | `ToolbarGroup` | `src/components/ui/ToolbarGroup.tsx` |
| Filtre de période (Semaine / Mois / Tous… ; 30 j / 90 j glissants : `ROLLING_PERIODS`) | `PeriodFilter` + `usePagePeriod` | `src/components/ui/PeriodFilter.tsx`, `src/hooks/usePagePeriod.ts`, `src/lib/period.ts` |
| Ancres de section (seconde ligne du bandeau) | `SectionAnchorNav` | `src/components/ui/SectionAnchorNav.tsx` |
| Rang dans un classement (médailles SVG 1 à 3) | `RankCell` | `src/components/ui/RankCell.tsx` |
| Évolution d'un rang ▲N / ▼N / = / « nouv. » (période précédente) | `RankMovement` | `src/components/ui/RankMovement.tsx` |
| Badge du rôle dominant d'un joueur (Fragger / Medic / Ghost, pastille pleine) | `RosterRoleBadge` + `dominantRole` | `src/components/ui/RosterRoleBadge.tsx`, `src/lib/member-roster.ts` |
| Tri d'un tableau par ses en-têtes (+ rappel docké) | `SortableTh`, `SortReminder` + `useTableSort` | `src/components/ui/SortableTh.tsx`, `src/hooks/useTableSort.ts` |
| Top 3 d'un classement | `PodiumCards` | `src/components/ui/PodiumCards.tsx` |
| Podium en marches 2-1-3 (ligue, tournois, joueurs) ; titre en évidence, plaque de score, ligne « parties · Top 1 » | `PodiumSteps`, `ClanLogo`, `PodiumTitle`, `PodiumPlate`, `PodiumStats` | `src/components/ui/PodiumSteps.tsx` |
| Tag de clan en jaune gras (`tone="photo"` : or de jeu sur fond sombre) | `ClanTag` | `src/components/ui/ClanTag.tsx` |
| Pagination numérotée (au lieu d'un défilement horizontal) | `Pagination` + `@/lib/pagination` | `src/components/ui/Pagination.tsx` |
| Rangée de puces / cartes paginée par chevrons sur mobile (au lieu d'un défilement horizontal) | `ChevronPager` | `src/components/ui/ChevronPager.tsx` |
| Bande « Distinctions » | `DistinctionStrip` + `computeDistinctions` | `src/components/ui/DistinctionStrip.tsx`, `src/lib/distinctions.ts` |
| Classement sur mobile (puces « Trier par ») | `MobileRankList` | `src/components/ui/MobileRankList.tsx` |
| Mode d'un tournoi (couleur, icône, libellé) | `TournamentModeBadge`, `tournamentModeClass` + `@/lib/tournament-mode-display` | `src/components/tournaments/TournamentModeBadge.tsx` — docs/features/tournois.md |
| Style de jeu d'un clan (Fragger / Medic / Ghost, icône) | `PlaystyleBadge` + `clanStyleOf` | `src/components/ui/PlaystyleBadge.tsx`, `src/lib/clan-directory.ts` — docs/features/clans.md §6 bis |

**Règle :** Ne jamais réécrire ces composants inline dans une page. Ne pas écrire les classes `app-placement-badge*` directement.

### 6 bis. Refonte UI — règles (`docs/TODO/refonte-ui.md`)

Maquette validée : `docs/ui/refonte/maquettes/Refonte adaptée.html` (dossier ignoré par git). Fiches :
`docs/ui/composants-refonte.md`. Contrôles : `src/lib/ui-conformance.test.ts` (listes d'exceptions à vider phase après phase).

- **Accent** : tout état actif (segmented, en-tête trié, nav active, puces de tri) utilise `--theme-ui-accent` et ses
  dérivés (`-text`, `-soft`, `-tint`, `-ring`). Jamais `bg-blue-600 text-white` ni une teinte en dur.
- **Rangs** : `RankCell` — médailles SVG pour 1 à 3, numéro ensuite. Aucun emoji de médaille, pas de pastille « #1 ».
- **Tri de tableau** : `SortableTh` + `useTableSort`. Pas de segmented de tri au-dessus d'un tableau ; rappel du tri
  dans le bandeau docké par `dockedAside`, jamais un contrôle.
- **Distinctions** : calculées uniquement par `src/lib/distinctions.ts`.
- **Catégories d'armes** : une seule liste, `src/lib/weapons/weapon-categories.ts` (identifiants télémétrie compris).
  L'ancien `weapon-category-service.ts` et `/settings/weapon-categories` sont supprimés (contrôle dans `ui-conformance.test.ts`).
- **Tendances** : ne rien afficher quand la progression est absente (pas de « • »).
- **Colonnes conditionnelles** : une colonne nulle par construction pour le filtre actif n'est pas rendue (Duo/Trio/Squad
  hors mode « Tous »).
- **Tableaux** : `app-table-shell`, `table-layout: auto`, padding horizontal 9 px sur les cellules numériques.
- **Rayons** : bloc bordé = `.app-panel` / `.app-panel-muted` / `.app-table-shell`, jamais `rounded` + `border` à la main.
- **Vocabulaire** : Dégâts, Victoires / Top 1, Win rate, K/M, Temps, Jours actifs, Distinctions.
- **Ton** : **tutoiement partout**, espace compte compris (`/join`, `/login`, `/activate`, messages de leurs API —
  décision du 2026-10-18), e-mails, notifications et Discord compris. `src/lib/tutoiement.test.ts` contrôle tout `src/`
  (« vous / votre / vos », impératifs en « -ez ») ; seule exception, un pluriel adressé à l'escouade. Un seul nom par
  chose : « Ligue des clans », « Power score ».
- **Thème** : les `dark:` existants sont **conservés** ; un nouveau composant passe par les tokens plutôt que d'en ajouter.
- **Hauteurs** : ne jamais modifier la hauteur du bandeau d'image d'une page ni celle du header.

### 7. Thème actif

Le thème est stocké sur `data-app-theme` de `<html>` et `<body>` (`'light'` ou `'dark'`).
Le layout racine le pose **côté serveur** d'après le cookie `pubg_app_theme` (`src/lib/app-theme.ts`, depuis le
2026-10-18) ; `ThemeInitializer` aligne ensuite le document sur la préférence du navigateur et réécrit le cookie.
Ne jamais lire/écrire le thème directement depuis une page — passer par les tokens CSS.

### 8. Checklist nouvelle page

- [ ] Structure `app-container` + `app-main` — ou, si la page a des filtres, `app-main-flush` + `DockingToolbar`
- [ ] Période : `PeriodFilter` + `usePagePeriod` (jamais d'état local ni de libellés propres) ; « Tous » / « Toutes » pour les options sans filtre
- [ ] Changer un filtre ne replie pas la page : résultats précédents gardés, estompés, pendant le rechargement
- [ ] Page ajoutée à la liste de `src/lib/ui-conformance.test.ts` si elle a un bandeau
- [ ] Navigation de section incluse (`ClanSectionNav` ou équivalent)
- [ ] Panneaux avec `.app-panel` / `.app-panel-muted` (pas de couleurs hardcodées)
- [ ] Couleurs de texte/fond via classes Tailwind remappées ou tokens CSS
- [ ] Rangs par `RankCell`, tri de tableau par `SortableTh`, états actifs en accent (§6 bis)
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
- `useLeaderboard()`, `useClanOverview()` — Data fetching with cancellation
- `usePageData(url, pick)` — generic read that keeps the previous response while reloading (filter pages fade it)

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
   - **Starts from what the server knows** (`ShellBootstrapProvider` in the root layout, `src/lib/shell-bootstrap.ts`,
     since 2026-10-18): visitor mode is known at the first render, so the shell (menu, `<main>`) and public pages are
     in the server HTML; a failed `/api/auth/mode` falls back to the server value, never to a redirect to `/login`.
     The **session itself stays `loading` until `/api/auth/session` answers** — guards never conclude "not logged in"
     before (Playwright simulates the session in the browser only). A public page must therefore not wait for
     `loading` in visitor mode (`/clans`: `canView` alone).
   - Returns `{ user, expires, role }`
   - Auto-logs out on 401 (expired token) ; a visitor **without** a session cookie gets `200 { authenticated: false }`
     (no console error, nothing to purge — 2026-10-11)

**Auth Flow:**
- `POST /api/auth/login` → validates password → sets cookie → redirects
- `POST /api/auth/logout` → clears cookie
- `POST /api/auth/activate` → sets up SuperUser (first run only)

**Accueil `/`:** vitrine publique plein écran, sans shell, pour tous (un connecté y trouve « Mon espace » ; entrée
« Accueil » du menu latéral), alimentée par la route publique `GET /api/home/showcase` (cache mémoire 5 min). Elle ne doit jamais exposer le
pseudo ni le compte d'un joueur extérieur au site — voir [accueil.md](docs/features/accueil.md).

**Joueurs `/players`:** classement inter-clans des joueurs (parties officielles **de clan**, mode lu dans le `gameMode`
PUBG, cache 5 min) et comparateur — [joueurs.md](docs/features/joueurs.md). Ses scores Fragger / Medic / Ghost / Tireur à
distance sont des **centiles entre tous les clans** : ne pas les confondre avec le style de jeu d'un joueur, relatif au
meilleur de son clan (`MemberTelemetryStats`).

**Guard Routes:**
- `src/proxy.ts` (edge middleware) redirects based on `setupState`:
  - `first_run` → `/setup`
  - `pending_activation` → `/activate`
  - `completed` → check session cookie → proceed
- Pages légales (`LEGAL_PATHS`, `src/lib/legal/legal-info.ts`) ouvertes sans session — [pages-legales.md](docs/features/pages-legales.md).
- Chaque laissez-passer de page passe par `passThrough()`, qui pose l'en-tête `x-pathname` : **ne jamais revenir à un
  `NextResponse.next()` nu** pour une page, sinon elle perd son titre, sa description et son indexation — et sa CSP.
- **CSP** (2026-10-18, `src/lib/security/csp.ts`) : `passThrough()` pose une CSP à nonce, **bloquante depuis le
  2026-10-23** (observation `Report-Only` avant) ; Next ajoute le nonce à ses propres scripts. Tout script ajouté à la
  main (tiers, `<Script>`) doit recevoir ce nonce, sinon il est bloqué ; pas d'`eval` dans le navigateur (zod y tourne
  sans compilation, `privacy-request.ts`). Un écart ne s'affiche pas dans la
  console de Playwright : la fixture `cspViolations` (`e2e/support/api.ts`) l'écoute par `securitypolicyviolation` et
  fait échouer le test (suite complète sur le build : 0 écart le 2026-10-22). En-têtes de sécurité :
  `SECURITY_HEADERS` de `next.config.ts` (HSTS **sans** `includeSubDomains` tant que le wildcard n'est pas posé).

**Administration (depuis le 2026-10-07, [administration.md](docs/TODO/administration.md)) :** quatre profils — visiteur,
membre, Owner, SuperUser. Toute route d'administration passe par `src/lib/auth/admin-guards.ts` :
`requirePlatformAdmin` (outil qui touche toute la plateforme), `requireClanFeature(clanId, feature)` (outil d'un clan
que le SuperUser peut ouvrir ou fermer aux Owners — catalogue `src/lib/auth/owner-features.ts`) ou `requireClanAccess`.
La télémétrie d'un clan (`/clans/[clanId]/settings/data/**`, routes `telemetry/*`) est `requirePlatformAdmin` : jamais
déléguée aux Owners (décision du 2026-10-08).
Ces gardes ne sont **jamais** ouvertes par le mode visiteur et acceptent le SuperUser sans membre actif. Page
d'administration → `<AdminAccessGate>` (`src/components/settings/AdminAccessGate.tsx`) dans le `layout.tsx` **de son
propre dossier** : un layout parent ne se ré-exécute pas quand on navigue entre ses pages enfants. Elle ne refuse
qu'une session **valide** sans les droits ; sans session valide, la page s'affiche et l'API répond 401 (les tests
Playwright, qui simulent la session dans le navigateur, en dépendent). Ne jamais écrire
de contrôle à la main (`getMemberPermissionKeys(...).includes('*')`) ni de `allowMissingActor` sans revérifier la session.
Toute écriture (POST, PUT, PATCH, DELETE) d'une route d'administration est exportée enveloppée par
`withAdminActionLog('<gabarit de la route>', handler)` (`src/lib/admin-action-log.ts`, journal des actions, Q10) —
`src/lib/admin-action-log-routes.test.ts` échoue sinon. Une route qui vérifie la session elle-même note son acteur par
`rememberSessionActor` (`src/lib/auth/admin-actor.ts`).
**Liens envoyés hors du site** (depuis le 2026-10-20) : un lien vers un match, un tournoi ou un joueur dans un message
Discord ou un e-mail se fabrique **uniquement** par `src/lib/short-links.ts` (`/m/…`, `/t/…`, `/j/…`, résolus par
`src/app/{m,t,j}`) ; la base publique vient de `src/lib/public-base-url.ts`, jamais d'une lecture directe de
`APP_URL` / `NEXT_PUBLIC_APP_URL` — [url-masking.md](docs/TODO/url-masking.md).
**Identité d'un membre** (depuis le 2026-10-20) : toute création ou validation de `ClanMember` appelle
`ensurePlayerLinkForMember` (`src/lib/member-player-link.ts`), qui pose `playerId` sans toucher au clan PUBG du joueur.
`EncounteredPlayer` est en cours de retrait (docs/TODO/inventaire-2026-10-20.md §6) : une **nouvelle** lecture passe par
`Player` / `ClanEncounter`, jamais par `EncounteredPlayer` ; un compteur d'adversaire (rencontres, combats, échecs de
résolution) s'écrit sur `Player` seul — plus aucune écriture vers `EncounteredPlayer` depuis l'étape 4 (2026-10-22).
**Alerte au SuperUser** (depuis le 2026-10-19) : salon Discord d'administration, par `sendAdminAlert` / `fireAdminAlert`
(`src/lib/admin-alerts/`) — un nouvel événement = une entrée de `catalog.ts` (interrupteur et mention viennent seuls),
jamais un `sendDiscordWebhook` direct ; ni adresse e-mail ni donnée d'une demande de confidentialité dans le message
([discord-notifications.md](docs/features/discord-notifications.md), « Salon d'administration »). Une nouvelle file du
SuperUser = une ligne dans `src/lib/admin-inbox/build.ts` (boîte « À traiter » et veille du matin) ; jamais le bilan
complet de télémétrie (~9 s) dans une lecture de page.

**Données personnelles d'un membre** (notifications, préférences — depuis le 2026-10-10) : `requireOwnMember`
(`src/lib/auth/own-member-guard.ts`), le compte lié au membre ou le SuperUser. Jamais `requireSameClanAsMember`, faite
pour les statistiques que tout le clan consulte. Une entrée de menu personnelle va dans `PERSONAL_NAV_KEYS`
(`src/lib/nav-permissions-registry.ts`) — [notifications.md](docs/features/notifications.md).

**SEO :** titres, descriptions, `noindex` et canoniques de **toutes** les pages viennent du layout racine
(`generateMetadata` → `src/lib/seo/page-seo.ts`), pas des pages (presque toutes client). Nouvelle page publique → une
entrée dans `STATIC_PAGES` ; page du menu d'un clan → `CLAN_PAGES`. Pages joueur toujours en `noindex`.
`/sitemap.xml` et `/robots.txt` : `src/app/sitemap.ts`, `src/app/robots.ts` — [seo.md](docs/features/seo.md).
**Ne jamais interdire `/api/` dans robots.txt** : le rendu de Google respecte robots.txt pour chaque `fetch`, et une
page dont le shell ne joint pas `/api/auth/mode` redirige vers /login — elle est blanche chez Google (2026-10-18).

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
*/30 * * * *  →  Encountered players PUBG clan resolution (one `Player` row per identity, priority index) — kill feed names first (« Joueur inconnu »)
45 1 * * *  →  Clan membership sync (per-player clan check — observe mode by default)
15 1 * * *  →  DB maintenance (closes runs stuck in `running` > 6 h ; only deletion: admin action log rows > 12 months)
0 6 * * *  →  Geo-purge count (volume purgeable des tracés GPS, tous seuils, lecture seule — ~247 s)
30 6 * * *  →  Resource map vehicle spots (véhicules observés de la Carte des ressources, 90 derniers jours — docs/features/carte-ressources.md)
0 9 * * *  →  Admin daily digest (boîte « À traiter » vers le Discord d'administration, seulement si une action attend)
*/4 * * * *  →  Home showcase warm (appelle le web pour recalculer la vitrine avant l'expiration de son cache)
```

**Observability:** `/clans/[clanId]/settings/cron` dashboard shows last run time & errors.
**Tracking:** `CronExecution` table stores execution logs.
**Database health:** `npx tsx scripts/db-health.ts status|report` (read-only) — measured state, index review and
pending server recommendations in [database-performance.md](docs/ops/database-performance.md). Measure before adding
or dropping an index: `EncounteredPlayer` already carries 3× more index than data.

### Other CLI Scripts

| Script | Purpose |
|--------|---------|
| `npm run make-superuser -- user@example.com` | Grant/revoke SuperUser status |
| `npm run scores:recalc` | Manually recalculate leaderboard positions & badges |
| `npm run sync:pubg-assets` | Fetch weapon/map/phase labels from PUBG API (seeds `Label` table) |
| `npm run telemetry:zone-reading:backfill` | Lecture de zone : ligne de vol et cercles de chaque partie déjà analysée (`ZoneReadingMatch`, relançable) |

## Environment & Known Issues

### Critical: Environment Variables

| Variable | Used For | Where to Set |
|----------|----------|--------------|
| `DATABASE_URL` | Prisma + scripts | `.env` (Prisma reads this for CLI) or `.env.local` (Next.js) |
| `PUBG_API_KEY` | PUBG API client | `.env` or `.env.local` |
| `AUTH_BOOTSTRAP_SECRET` | Ouvre la route de bootstrap Owner ; refusé s'il vaut l'exemple de `.env.example` ou fait moins de 16 caractères (`src/lib/auth/secrets.ts`) | `.env` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (optional) | Envoi des e-mails ; incomplet = envoi simulé. (`SMTP_URL` n'est lue nulle part) | `.env` |
| `ENABLE_CRON_JOBS` | Toggle cron scheduling | `.env` (default: `true`) |
| `CLAN_SUBDOMAIN_ROOT` (optional) | Sous-domaines de clan (`chickendinner.fr`) ; absente = redirection désactivée | `.env` |
| `SITE_NAME` (optional) | Nom du site dans les e-mails (`src/lib/site-name.ts`) ; défaut `chickendinner.fr`. Serveur seulement, jamais dans un composant client | `.env` |
| `NOTIFICATION_LINK_SECRET` (optional) | Signe le lien « Ne plus recevoir ces e-mails » des notifications ; à défaut `AUTH_BOOTSTRAP_SECRET` | `.env` |

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
- **Sous-domaines de clan:** même règle — le proxy lit la table `sous-domaine → clan` par
  `GET /api/internal/clan-subdomains` et la garde en cache (`src/lib/clan-subdomain-host.ts`) ; tout ce qu'il
  importe doit rester sans Prisma (`src/lib/clan-subdomain.ts` est pur, le service Prisma est à part).

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
- **Fix:** the root layout sets `data-app-theme` server-side from the `pubg_app_theme` cookie (`src/lib/app-theme.ts`);
  `ThemeInitializer` then migrates a preference stored before the cookie existed
- **Gotcha:** only a theme **chosen by the user** is persisted by the shell — persisting the hydration-time value
  would overwrite a stored preference with the server default

#### 8. **Rate Limiting Strategy**
- **Setting:** `AppConfig.pubg_api_rate_limit_rpm` (default: 10 RPM)
- **Override via UI:** `/settings/pubg-api-rate-limit` (admin only)
- **Override via CLI:** Set env var `PUBG_API_RATE_LIMIT_RPM` before running worker
- **Fallback:** If DB query fails, reads from env var

#### 9. **Vitest ne ramasse que `src/lib/**`**
- **Issue:** `vitest.config.ts` déclare `include: ['src/lib/**/*.test.ts']`. Un test posé ailleurs
  (à côté d'une route dans `src/app/`, par exemple) n'est **jamais exécuté**, sans aucun avertissement.
- **Convention:** pour tester une route, placer le test dans `src/lib/` et importer le handler
  depuis `src/app/` — c'est ce que font `pubg-telemetry/route-contracts.test.ts`,
  `pubg-telemetry/drop-pressure-route-contracts.test.ts` et `discord/discord-route-contracts.test.ts`.
  Ne pas élargir le `include` sans raison : la convention existe et fonctionne.
- **Gotcha:** les mocks Prisma de ces tests listent les modèles un par un. Quand une route se met à
  utiliser un nouveau modèle, le mock renvoie `undefined` et le test casse loin de la cause réelle.
- **Base réelle:** trois tests n'ont pas de mock Prisma et écrivent dans la base de `DATABASE_URL` — la production sur
  un poste de dev : `tracked-isolation`, `drop-pressure-match-type`, `matches-cache-match-type`. Depuis le 2026-10-20
  ils sont **ignorés par défaut** (`describe.runIf`) ; `VITEST_DB_WRITES=1` les lance, contre une base de test
  seulement. Un nouveau test sans mock Prisma suit la même règle.

#### 10. **Colonnes JSON compressées — ne jamais les lire directement**
- **Issue:** depuis le 2026-09-25, **toutes** les colonnes JSON volumineuses de `SquadMatchTelemetry` sont
  écrites **compressées** (gzip, ~7 à 9×) dans des colonnes `*Gz` : `positionSamples`, `trajectorySegments`,
  `weaponStats`, `memberStats`, `deathSamples`, `landingSamples`, `phaseSnapshots`, `killSamples`,
  `shotSamples`, `damageSamples`, `knockoutSamples`, `reviveSamples`, `vehicleSamples`, `killFeedSamples`,
  `carePackageSamples`. Liste faisant foi : `COMPRESSED_JSON_COLUMNS` dans
  `src/lib/pubg-telemetry/json-codec.ts`.
- **`summary` reste en clair** : plus aucune route ne l'interroge en SQL depuis la suppression de `telemetry/heatmap`
  (2026-10-23, page Cartes du clan ; `circles`, `loot` et `vehicles` le 2026-10-07), mais elle pèse moins de 10 Mo.
  Avant de la compresser, chercher tout nouveau `JSON_EXTRACT(… summary …)` : un agrégat SQL sur un blob compressé
  tombe à zéro **sans erreur**.
- **Règle de lecture:** sélectionner la colonne `*Gz` en plus de celle en clair, puis passer la ligne à
  **`decodeTelemetryRow(row)`** — un seul appel par requête, qui normalise toutes les colonnes présentes. Lire
  la colonne en clair seule rend `null` sur un match compressé, **sans aucune erreur** : la page s'affiche vide.
- **Prédicats SQL:** un blob compressé est opaque au SQL. Tout `IS NOT NULL` ou `JSON_LENGTH(...) > 0` doit
  couvrir les deux colonnes. Attention en particulier à `telemetry/backfill-null-json`, qui repère les matchs à
  réparer par `weaponStats IS NULL AND memberStats IS NULL` : sans extension aux colonnes `*Gz`, **tout match
  compressé passerait pour un match à réparer** et serait resynchronisé inutilement.
- **Les deux formats coexistent** tant que le rattrapage (`scripts/backfill-json-compression.ts`) n'a pas
  terminé : `decodeTelemetryRow` gère le mélange, ne jamais supposer l'un ou l'autre.
- **Déploiement:** les lectures doivent être vivantes sur les **quatre** services (`web`, `telemetry-worker`,
  `cron`, `telemetry-aggregates` — ce dernier lit `memberStats` via `period-aggregates.ts`) avant toute
  écriture compressée.

#### 11. **Playwright (`e2e/`) — aucun test n'écrit en base**
- **Règle:** chaque test intercepte **tous** les appels `/api/**` du navigateur (`e2e/support/api.ts`) ; un appel sans
  réponse figée est bloqué et fait échouer le test. Une page qui appelle une nouvelle API → ajouter sa réponse dans
  `e2e/support/pages.ts`, jamais laisser passer l'appel.
- **Serveur:** le serveur local de `.env` (mode visiteur, `ENABLE_CRON_JOBS="false"` — à vérifier avant de lancer) ;
  seules les lectures du rendu serveur (état d'installation) atteignent la base.
- **Gotcha:** `locator.click()` ramène d'abord un élément collant à sa position d'origine (le bandeau se dédocke) :
  cliquer dans un bandeau docké avec `clickInPlace` (`e2e/support/layout.ts`). Détails : `docs/ops/tests-e2e.md`.

#### 12. **Soirée = journée de jeu, pas date UTC**
- **Règle:** la date d'une soirée se calcule **uniquement** par `sessionDateOf(createdAt)` (`src/lib/match-sessions.ts`) :
  heure de Paris, journée commençant à 06:00 (une partie de 01:30 compte dans la soirée de la veille). Ne jamais écrire
  `createdAt.slice(0, 10)` pour une soirée : la date UTC range mal les parties de nuit (décision du 2026-09-26).

#### 13. **Shell rendu côté serveur — jamais de stockage du navigateur au premier rendu**
- **Règle:** depuis le 2026-10-18, le shell (`ClanNavigation`) et les pages publiques sont rendus dans le HTML du
  serveur (référencement : `docs/TODO/geo-seo-propositions.md`, lot 1). Un composant rendu à l'hydratation ne lit
  **jamais** `localStorage` / `sessionStorage` dans un initialiseur de `useState` : le HTML du serveur et celui du
  client divergeraient. Passer par `useSyncExternalStore(subscribe, lireLeStockage, () => valeurServeur)` (exemples :
  thème et joueur consulté dans `ClanNavigation`, cache de `useNavPermissions`), ou par `useShellBootstrap()` pour ce
  que le serveur sait déjà.
- **Jamais de faux zéro** pendant un chargement : « — » ou rien, le HTML est lu tel quel par les robots.

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
npm run test:telemetry               # Vitest — nom historique, exécute TOUT src/lib/**/*.test.ts
npm run test:e2e                     # Playwright (e2e/) — serveur local, TOUTES les API du navigateur interceptées
npm run test:e2e:update              # Régénère les captures de référence (docs/ops/tests-e2e.md)
```

### Règle d'emplacement des scripts

> [!IMPORTANT]
> **Tous les scripts doivent obligatoirement être stockés dans le répertoire `scripts/`.**  
> Ne **JAMAIS** créer de scripts de test, de debug, de seed, de backfill ou de maintenance à la racine du projet (`/`).  
> La racine est réservée exclusivement aux fichiers de configuration du projet (`next.config.ts`, `package.json`, `tsconfig.json`, etc.).  
> Pour exécuter un script TypeScript ou JavaScript situé dans `scripts/` :
> ```bash
> npx tsx scripts/<nom-du-script>.ts
> node scripts/<nom-du-script>.js
> ```

### Memory Allocation

- **Dev:** `--max-old-space-size=8192` (webpack cache is memory-intensive)
- **Worker:** V8 heap capped at 2048 MB (`--max-old-space-size=2048`, no systemd `MemoryMax`) — measured 1.1 GB RSS in production on a shared 7.6 GB VM (see `docs/ops/database-performance.md` §4.1)
- **Batch:** Standard (inherits from shell)

### Database Migrations

```bash
# Toujours AVANT d'écrire en base : affiche le SQL qui serait appliqué
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma --script

# Auto-apply pending migrations (required on deploy)
npx prisma migrate deploy

# Create migration from schema changes
npx prisma migrate dev --name <description>

# Reset DB (WARNING: deletes all data)
npx prisma migrate reset
```

> [!IMPORTANT]
> **Lire le `migrate diff` avant tout `db push`.** `db push` ne fait pas qu'ajouter : il aligne la
> base sur le schéma, donc **supprime** tout objet présent en base et absent du fichier. Ce dépôt a
> déjà eu des colonnes et un index vivant uniquement en base — un `db push --accept-data-loss`
> aveugle aurait effacé leurs données au passage.
>
> Le schéma et la base sont alignés depuis le 2026-09-13 : le `migrate diff` ci-dessus doit
> répondre `-- This is an empty migration.`. S'il renvoie autre chose, une dérive s'est réinstallée
> — comprendre d'où elle vient avant d'appliquer quoi que ce soit.
>
> Pour appliquer seulement le DDL voulu sans toucher au reste :
> `npx prisma db execute --schema prisma/schema.prisma --file <fichier.sql>`

### Production Deployment

**Mise à jour courante :** `sudo bash /home/smk/apps/pubg-clan-site/scripts/deploy.sh` (git en root, tout le reste en
`smk`, ne touche jamais au `.env`) — procédure dans [deployment.md](docs/ops/deployment.md), « Mise à jour courante ».

Installation initiale :

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
