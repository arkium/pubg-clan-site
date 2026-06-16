# Structure du code

## Arborescence complète

```
src/
  app/                          # Pages et routes (Next.js App Router)
  components/                   # Composants React
  hooks/                        # Hooks de fetching côté client
  lib/                          # Services métier et logique
  middleware/                   # Middleware Next.js
  types/                        # Types TypeScript partagés
  instrumentation.ts            # Instrumentation Next.js (init Prisma, crons)
  proxy.ts                      # Proxy interne

scripts/                        # Scripts Node exécutés hors process Next.js
prisma/                         # Schéma et migrations
docs/                           # Documentation technique
```

---

## `src/app/` — Pages et routes

### Pages publiques / auth

```
app/
  page.tsx                   # Redirection vers /clans ou /login selon session
  layout.tsx                 # Layout racine (async Server Component)
  login/                     # Page de connexion
  activate/                  # Activation de compte (lien email)
  reset-password/            # Réinitialisation de mot de passe
  account/                   # Gestion du compte connecté
```

`layout.tsx` est un **async Server Component**. Il lit les cookies (`await cookies()`), vérifie la session, et conditionne l'affichage du shell (navigation + footer) :

```tsx
const cookieStore = await cookies()
const sessionToken = cookieStore.get('pubg_clan_session')?.value ?? null
const session = await getSessionFromToken(sessionToken)
const showAppShell = setupState === 'completed' && Boolean(session)
```

### Pages clan

```
app/clans/
  page.tsx                        # Liste des clans disponibles
  [clanId]/
    overview/                     # Vue d'ensemble du clan
    leaderboard/                  # Classement par période
    matches/                      # Historique des matchs squad
    awards/                       # Palmarès et récompenses
    stats/                        # Stats agrégées
    telemetry/                    # Dashboard télémétrie (positions, armes, zones)
    reports/                      # Rapports hebdo/mensuels
    challenges/                   # Défis de clan
    drop-zones/                   # Zones de drop préférées
    settings/                     # Paramètres du clan
    members/                      # Liste des membres
```

### Pages membre

```
app/members/
  page.tsx                        # Liste des membres
  add/                            # Ajout d'un membre
  manage/                         # Gestion des membres
  [id]/
    dashboard/                    # Dashboard personnel
    stats/                        # Stats individuelles
    matches/                      # Historique des matchs
    weapons/                      # Stats par arme
    heatmap/                      # Heatmap de position
    map-stats/                    # Stats par carte
    drop-zones/                   # Zones de drop du joueur
    notifications/                # Notifications
    notification-preferences/     # Préférences de notification
    rewards/                      # Récompenses
```

### Pages d'administration

```
app/settings/
  cron/                           # Gestion des cron jobs
  email-delivery/                 # Configuration SMTP
  login-welcome/                  # Message de bienvenue
  map-labels/                     # Labels de cartes
  nav-permissions/                # Permissions de navigation
  phase-labels/                   # Labels de phases de jeu
  pubg-api/                       # Configuration API PUBG
  weapon-categories/              # Catégories d'armes
  weapon-labels/                  # Labels d'armes
```

### Routes API

```
app/api/
  auth/                           # Login, logout, session, activation, reset-password
  clans/
    [clanId]/                     # Routes du clan
      overview/
      leaderboard/
      matches/
      members/
      roles/
      squad-analysis/
      sync-matches/               # Déclenchement sync manuelle
      sync-stats/
      pubg-diff/                  # Diff membres PUBG vs BDD
      lifetime-stats/
      awards/
      challenges/
      cron-control/               # Déclenchement/arrêt des crons
      dev/                        # Outils de développement
      reports/
      telemetry/
        [id]/                     # Job de télémétrie unique
        backfill-null-json/
        circles/
        clear-selected/
        dead-letter/
        drop-zones/
        fetch-files-selected/
        heatmap/
        import-file/
        loot/
        metrics/
        observability/
        playstyle/
        positions/
        queue-cleanup/
        recalc-aggregates-batch/
        recoveries/
        resync-files-queue/
        resync-files-selected/
        sync-batch-manual/
        sync-selected/
        synergies/
        vehicles/
        weapons/
  members/
    [id]/                         # Stats, matchs, armes, heatmap, notifications, etc.
  settings/                       # Routes de configuration admin
  setup/                          # Setup initial
  internal/                       # Routes internes (non exposées publiquement)
```

---

## `src/components/` — Composants React

### Composants partagés (racine)

| Fichier | Rôle |
|---|---|
| `ClanNavigation.tsx` | Navigation principale (sidebar/header) |
| `ClanSectionNav.tsx` | Navigation de section pour les pages clan |
| `MemberSectionNav.tsx` | Navigation de section pour les pages membre |
| `SettingsSectionNav.tsx` | Navigation de section pour les pages settings |
| `ClanSelector.tsx` | Sélecteur de clan actif |
| `Leaderboard.tsx` | Tableau de classement |
| `LeaderboardStats.tsx` | Stats résumées du classement |
| `SquadMatchList.tsx` | Liste des matchs squad |
| `SquadSynergies.tsx` | Visualisation des synergies |
| `TopPerformers.tsx` | Bloc top performeurs |
| `ProgressionChart.tsx` | Graphique de progression |
| `ThemeInitializer.tsx` | Initialisation du thème côté client (évite le flash) |
| `NotificationBell.tsx` | Cloche de notifications |
| `RoleAssignment.tsx` | Assignation de rôles |
| `SessionRecap.tsx` | Récapitulatif de session |
| `FirstRunSetup.tsx` | Écran de premier lancement |
| `HomeRedirect.tsx` | Redirection intelligente depuis `/` |
| `WeaponCategoryPeriodFilter.tsx` | Filtre période + catégorie arme |
| `ChallengeCard.tsx`, `ChallengeCreator.tsx`, `ChallengeLeaderboard.tsx` | Gestion des défis |
| `MemberLifetimeStatsPanel.tsx` | Panel stats lifetime |
| `PendingActivation.tsx` | Écran en attente d'activation |

### `components/ui/` — Composants UI réutilisables

À utiliser en priorité plutôt que de recréer inline.

| Composant | Usage |
|---|---|
| `SegmentedControl` | Filtres/onglets segmentés (période, mode, etc.) |
| `PlacementBadge` | Badge placement (#1, #5, #10) |
| `TeamModeBadge` | Badge mode d'équipe (Solo/Duo/Trio/Squad) |
| `PlayerNameBadge` | Badge nom de joueur |
| `MobileDropdownNav` | Menu dropdown pour navigation mobile |
| `WeaponIcon` | Icône d'arme depuis les assets PUBG |

### `components/dashboard/`

Composants spécifiques au dashboard membre (graphiques, blocs de stats individuels).

### `components/member/`

En-têtes et composants spécifiques aux pages membre.

### `components/report/`

Composants de rendu des rapports périodiques.

### `components/settings/`

En-têtes et composants des pages d'administration.

---

## `src/hooks/` — Hooks de fetching

Tous marqués `'use client'`. Gèrent le fetching via les routes API, avec cache en mémoire (module-level `Map`) pour éviter les requêtes redondantes sur la même session.

| Hook | Route API consommée | Usage |
|---|---|---|
| `useLeaderboard` | `/api/clans/[clanId]/leaderboard` | Classement par période et critère de tri |
| `useSquadMatches` | `/api/clans/[clanId]/matches` | Historique des matchs squad |
| `useSelectedClan` | `localStorage` + `/api/auth/session` | Clan actif de l'utilisateur (persisté en localStorage) |
| `useAuthSession` | `/api/auth/session` | Session utilisateur courante |
| `useClanOverview` | `/api/clans/[clanId]/overview` | Vue d'ensemble du clan |
| `useLeaderboard` | `/api/clans/[clanId]/leaderboard` | Voir ci-dessus |
| `useMatchHistory` | `/api/members/[id]/matches` | Matchs d'un membre |
| `useNavPermissions` | `/api/auth/session` ou config | Permissions de navigation |
| `usePlayerDashboard` | `/api/members/[id]/dashboard` | Dashboard d'un membre |
| `usePlayerStats` | `/api/members/[id]/stats` | Stats d'un membre par période |
| `useReportDetail` | `/api/clans/[clanId]/reports/[id]` | Détail d'un rapport |
| `useReports` | `/api/clans/[clanId]/reports` | Liste des rapports du clan |

### Pattern interne des hooks

```typescript
'use client'

const cache = new Map<string, DataType>()

export function useMyHook(param: number | null) {
  const [data, setData] = useState<DataType>(defaultData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!param) return
    let cancelled = false

    async function fetchData() {
      const cacheKey = `v1:${param}`
      const cached = cache.get(cacheKey)
      if (cached) { setData(cached); return }

      setLoading(true)
      try {
        const res = await fetch(`/api/.../${param}`)
        const payload = await res.json()
        if (!res.ok) throw new Error(payload.error)
        cache.set(cacheKey, payload)
        if (!cancelled) setData(payload)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchData()
    return () => { cancelled = true }
  }, [param])

  return { data, loading, error }
}
```

---

## `src/lib/` — Services métier

### Services applicatifs

| Fichier | Rôle |
|---|---|
| `prisma.ts` | Singleton Prisma client (évite les connexions multiples en dev) |
| `auth-service.ts` | Login, logout, création de compte, activation |
| `auth-session.ts` | Lecture/écriture de session (cookies) |
| `auth-crypto.ts` | Génération et vérification de tokens |
| `clan-service.ts` | Synchronisation des membres depuis l'API PUBG |
| `stats-calculator.ts` | Calcul des agrégats `PlayerStats` depuis les matchs |
| `squad-detector.ts` | Détection des matchs en équipe entre membres du clan |
| `awards-service.ts` | Calcul des palmarès et badges |
| `report-generator.ts` | Génération des rapports périodiques |
| `challenge-service.ts` | Gestion des défis de clan |
| `challenge-types.ts` | Types des défis |
| `notification-service.ts` | Création et envoi de notifications |
| `email-service.ts` | Envoi d'emails via SMTP (nodemailer) |
| `email-delivery-config-service.ts` | Configuration de la livraison email |
| `role-service.ts` | Gestion des rôles et permissions |
| `setup-service.ts` | État du premier lancement |
| `nav-permissions-service.ts` | Résolution des permissions de navigation |
| `nav-permissions-registry.ts` | Registre des routes et leurs permissions |
| `login-welcome-service.ts` | Message de bienvenue configurable |
| `cron-jobs.ts` | Orchestration de tous les cron jobs (39 Ko — fichier central) |
| `cron-observability.ts` | Monitoring et journalisation des crons |
| `pubg.ts` | Client API PUBG (axios) |
| `internal-api.ts` | Client HTTP interne (appels server-to-server) |
| `pubg-api-call-log-service.ts` | Journalisation des appels API PUBG |
| `pubg-rate-limit-config-service.ts` | Configuration du rate limiting API PUBG |
| `api-throttle.ts` | Throttling des appels API |
| `distinction-badges.ts` | Logique des badges de distinction |
| `survival-title-service.ts` | Titres de survie |

### Services de labels (internationalisation UI)

| Fichier | Rôle |
|---|---|
| `damage-type-label-service.ts` | Labels des types de dégâts |
| `game-mode-label-service.ts` | Labels des modes de jeu |
| `map-label-service.ts` | Labels des cartes |
| `medal-name-service.ts` | Noms des médailles |
| `phase-label-service.ts` | Labels des phases de jeu |
| `vehicle-label-service.ts` | Labels des véhicules |
| `weapon-label-service.ts` | Labels des armes |
| `weapon-category-service.ts` | Catégories d'armes |

### `lib/pubg-assets/`

Dictionnaires officiels PUBG (JSON) synchronisés via `npm run sync:pubg-assets`. Contient armes, véhicules, cartes, enums, et les titres de survie. Référence pour les lookups de noms et icônes.

### `lib/pubg-domain/`

Abstraction domaine PUBG : client domaine, types métier PUBG.

### `lib/weapons/`

Définitions des catégories d'armes pour le filtrage et l'affichage.

### `lib/pubg-telemetry/`

Pipeline complet de traitement de la télémétrie (22 fichiers) :

| Fichier | Rôle |
|---|---|
| `index.ts` | Point d'entrée, exports publics |
| `api-contract.ts` | Contrats d'API (types entrée/sortie) |
| `client.ts` | Client de téléchargement des fichiers télémétrie |
| `parser.ts` | Parser principal des événements télémétrie PUBG |
| `job.ts` | Modèle de job de traitement |
| `resync-queue.ts` | File de resync (lecture/écriture) |
| `resync-files.ts` | Téléchargement et traitement des fichiers (contient l'adaptateur stream) |
| `manual-sync.ts` | Déclenchement manuel |
| `batch-tuner.ts` | Ajustement dynamique de la taille des batches |
| `backlog.ts` | Gestion du backlog de jobs |
| `period-aggregates.ts` | Calcul des agrégats par période |
| `aggregate-recalc-queue.ts` | File de recalcul des agrégats |
| `persistence-payload.ts` | Payload de persistance (transformation parse → DB) |
| `persistence-fallback.ts` | Fallback si la persistance échoue |
| `position-heatmap.ts` | Génération des données de heatmap |
| `queue-priority.ts` | Priorité des jobs dans la queue |
| `stale-cleanup.ts` | Nettoyage des jobs périmés |
| `memory-monitor.ts` | Monitoring de la mémoire du worker |
| `worker-backpressure.ts` | Backpressure pour limiter la charge mémoire |
| `worker-health.ts` | Santé du worker |

---

## `src/types/` — Types partagés

Types TypeScript utilisés entre les hooks, les routes API et les composants. Évite la duplication de définitions entre client et serveur.

---

## Couches et flux de données

```
Page (Client Component)
  └── Hook (useXxx)
        └── fetch('/api/...')
              └── Route API (app/api/.../route.ts)
                    ├── Prisma (lib/prisma.ts)  →  Base de données
                    └── Service (lib/xxx-service.ts)
                          └── Prisma ou API PUBG externe
```

Les pages ne font **jamais** d'appels directs à Prisma ni aux services métier. Les services sont appelés depuis les routes API ou les scripts. Les hooks sont appelés depuis les pages client.

---

## Ajouter une nouvelle page

### 1. Créer le fichier page

```tsx
// src/app/clans/[clanId]/ma-page/page.tsx
'use client'
import { useParams } from 'next/navigation'
import { useMemo } from 'react'
import ClanSectionNav from '@/components/ClanSectionNav'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function MaPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  if (!clanId) return null

  return (
    <main className="app-container app-main">
      <ClanSectionNav clanId={clanId} />
      <div className="app-panel">
        {/* contenu */}
      </div>
    </main>
  )
}
```

Points obligatoires :
- `'use client'` en tête de fichier
- Utiliser `useParams()` pour les segments dynamiques (pas `params` en prop sur les pages client)
- Valider et parser le `clanId` avec la fonction helper
- Structure `app-container` + `app-main` pour le layout
- `ClanSectionNav` pour la navigation de section
- Pas de couleurs hardcodées (`bg-white` est acceptable car remappé par le thème, pas `bg-[#fff]`)

### 2. Créer le hook si besoin

```typescript
// src/hooks/useMonDonnee.ts
'use client'
import { useEffect, useState } from 'react'

const cache = new Map<string, MonType>()

export function useMonDonnee(clanId: number | null) {
  const [data, setData] = useState<MonType | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clanId) return
    let cancelled = false
    // ... fetch avec cache
    return () => { cancelled = true }
  }, [clanId])

  return { data, loading, error }
}
```

### 3. Ajouter la route API

```typescript
// src/app/api/clans/[clanId]/ma-route/route.ts
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId } = await params  // ← toujours await params

  const parsed = Number(clanId)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const data = await prisma.clan.findUnique({ where: { id: parsed } })
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 })

  return Response.json({ data })
}
```

Points obligatoires :
- `await params` avant d'accéder aux segments
- Retourner `Response.json()` (Web API standard), pas `NextResponse.json()`
- Valider les inputs

---

## Ajouter un service dans `src/lib/`

Convention de nommage : `[domaine]-service.ts` ou `[domaine]-[sous-domaine].ts`.

Structure minimale :

```typescript
// src/lib/mon-service.ts
import { prisma } from '@/lib/prisma'

export async function getMonDonnee(id: number): Promise<MonType | null> {
  return prisma.monModele.findUnique({ where: { id } })
}

export async function createMonDonnee(data: CreateInput): Promise<MonType> {
  return prisma.monModele.create({ data })
}
```

Les services ne doivent pas importer de composants React ni des hooks. Ils peuvent importer d'autres services et Prisma.

---

## Convention de nommage des fichiers

| Contexte | Convention | Exemple |
|---|---|---|
| Pages Next.js | `page.tsx` | `app/clans/[clanId]/leaderboard/page.tsx` |
| Routes API | `route.ts` | `app/api/clans/[clanId]/leaderboard/route.ts` |
| Composants React | PascalCase | `ClanSectionNav.tsx` |
| Hooks | camelCase préfixé `use` | `useLeaderboard.ts` |
| Services | kebab-case suffixé `-service` | `clan-service.ts` |
| Scripts Node | kebab-case | `telemetry-resync-worker.ts` |
| Types | kebab-case | `leaderboard.ts` dans `src/types/` |

Les segments dynamiques Next.js utilisent les crochets : `[clanId]`, `[id]`.

---

## Points d'attention

### Singleton Prisma en développement

`src/lib/prisma.ts` utilise `globalThis` pour éviter de créer un nouveau client Prisma à chaque hot reload :

```typescript
// pattern attendu
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### `useSelectedClan` — clan actif

Le clan actif est persisté en `localStorage` sous la clé `selectedClanId`. `useSelectedClan` hydrate depuis le localStorage au montage, et interroge `/api/auth/session` en fallback si rien n'est stocké. Un événement personnalisé `selected-clan-changed` synchronise les onglets ouverts.

### `instrumentation.ts`

Fichier Next.js chargé une seule fois au démarrage du serveur. Utilisé pour initialiser Prisma et démarrer les cron jobs si `ENABLE_CRON_JOBS=true`. Ne pas y mettre de logique de requête.

### Middleware

`src/middleware/` contient le middleware Next.js pour la protection des routes (vérification de session sur les routes protégées avant que la page ne soit rendue).
