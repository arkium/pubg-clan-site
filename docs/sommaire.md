# Documentation PUBG Clan Site

Index de toute la documentation technique du projet. Chaque doc décrit le comportement réel du code actuel.

**Mise à jour :** 2026-06-16 | **Stack :** Next.js 16.2.6 · React 19.2.4 · TypeScript 5 · Prisma 6.19.3 · Node 22 LTS

---

## Architecture

| Document | Contenu |
|---|---|
| [Stack](architecture/stack.md) | Tech stack, contraintes Node 22 / Next 16.x, gotchas critiques, variables d'environnement, commandes npm |
| [Data model](architecture/data-model.md) | 31 modèles Prisma par domaine, relations clés, champs métier importants, stratégie de périodes |
| [Structure du code](architecture/code-structure.md) | Organisation des dossiers, patterns page / hook / route API / service, conventions de nommage |

---

## Features

### Gestion du clan et des membres

| Document | Contenu |
|---|---|
| [Auth](features/auth.md) | Connexion, activation par invitation, reset mot de passe, bootstrap Owner, switch de membre |
| [Clans](features/clans.md) | Structure clan, rôles, sync PUBG, overview, permissions par route, crons liés |
| [Leaderboard](features/leaderboard.md) | Calcul classement interne, périodes, periodKey, progression, badges Top performers |
| [Matchs](features/matches.md) | Modèles Match/SquadMatch/SquadMember, détection squad, sessions, stats des 13 champs API, synergies |
| [Dashboard membre](features/member-dashboard.md) | Sections dashboard, PlayerStats vs MemberLifetimeStats, progression, squads fréquents, heatmap |

### Stats avancées et télémétrie

| Document | Contenu |
|---|---|
| [Awards](features/awards.md) | 11 awards fun, logique de calcul top 3, contrat API complet, formatage des valeurs |
| [Armes](features/weapons.md) | Stats armes télémétrie (MemberWeaponStats) + Weapon Mastery carrière (MemberWeaponMastery) |
| [Season stats](features/season-stats.md) | Stats ranked/normal par saison, tier, cron daily, contrats GET/POST |
| [Zones de drop](features/drop-zones.md) | LogParachuteLanding, grille 40×40, normalisation xPct/yPct, contrat API, limitation backfill |

### Fonctionnalités sociales

| Document | Contenu |
|---|---|
| [Défis](features/challenges.md) | Modèles Challenge/Participant/Reward, 5 types, cycle de vie, routes API |
| [Rapports](features/reports.md) | Modèles Report/ReportSection, 7 types de sections, pipeline de génération, export HTML/PDF/JSON |
| [Notifications](features/notifications.md) | 5 types, préférences, 3 canaux (in-app/email/push), NotificationBell, routes API |

---

## Télémétrie

| Document | Contenu |
|---|---|
| [Vue d'ensemble](telemetry/overview.md) | Architecture, 3 modes de sync, flux de données, tables DB produites, variables d'env, statut phases |
| [Pipeline](telemetry/pipeline.md) | 5 étapes CDN→parse→persist, différence v1/v2, CLI batch, gestion erreurs, fichiers clés |
| [Parser](telemetry/parser.md) | 15 événements parsés, 5 non parsés, champs partiellement utilisés, distinction JSON brut vs agrégats |
| [Worker](telemetry/worker.md) | Worker séparé, queue, mémoire 512 Mo, backpressure, dead letter, **bug Readable.toWeb() Node 22** |
| [API — contrats](telemetry/api.md) | Contrats JSON des 30+ routes (clan analytics, queue management, member scope) |
| [Dashboard monitoring](telemetry/dashboard.md) | Pages dashboard/errors, métriques Prometheus, pages annexes télémétrie, améliorations restantes |
| [API PUBG](telemetry/pubg-api.md) | 11 endpoints consommés, endpoints non consommés, dictionnaires pubg-assets, contraintes CDN |
| [Ops production](telemetry/ops.md) | Migration SQL manuelle, rollout TEL-403, backfill v1→v2, auto-cleanup, variables d'env, systemd |

---

## UI

| Document | Contenu |
|---|---|
| [Thèmes](ui/themes.md) | Tokens CSS, remapping automatique Tailwind, ThemeInitializer, règles absolues, classes utilitaires |
| [Composants](ui/components.md) | Catalogue des 10 composants UI, composants navigation, composants dashboard — props et exemples |
| [Patterns](ui/patterns.md) | Checklist nouvelle page, structure obligatoire, pattern fetch, parseurs URL, gestion états |
| [Tableaux](ui/tables.md) | Inventaire des tableaux de l'app, contrôles disponibles, patterns de tri, classes CSS partagées |

---

## Ops

| Document | Contenu |
|---|---|
| [Dev setup](ops/dev-setup.md) | Installation Windows/VSCode, Node 22 via nvm-windows, extensions VSCode, .env, multi-terminaux, problèmes courants |
| [Déploiement production](ops/deployment.md) | Variables d'env, build, 4 processus à démarrer, units systemd, migration DB, rollback, healthchecks |
| [Cron](ops/cron.md) | 9 jobs planifiés, actions manuelles, table CronExecution, pages de pilotage, variables d'env |
| [Paramètres admin](ops/settings.md) | 7 pages /settings/* — PUBG API, email, welcome, labels cartes/armes/phases, catégories armes |
| [Permissions navigation](ops/nav-permissions.md) | Registre NavItemDef, rôles, couleurs, ordre drag & drop, page owner /settings/nav-permissions |

---

## TODO

| Document | Contenu |
|---|---|
| [Points à faire](TODO/todo.md) | Tâches restantes classées P1/P2/P3 — backfill, pages manquantes, fonctionnalités incomplètes |
| [Suggestions](TODO/suggestions.md) | Stats intéressantes à mettre en place, nouvelles fonctionnalités, axes d'amélioration |

---

## Archive

Les 37 fichiers de l'ancienne documentation sont conservés dans [archive/](archive/) et ne sont plus maintenus. Ils servent de référence historique uniquement.

---

## Parcours de lecture recommandés

### Nouveau développeur sur le projet
1. [Stack](architecture/stack.md) — comprendre les contraintes techniques
2. [Structure du code](architecture/code-structure.md) — savoir où trouver quoi
3. [Data model](architecture/data-model.md) — comprendre les données
4. [Patterns UI](ui/patterns.md) — savoir comment créer une page

### Comprendre une feature
- Classement → [Leaderboard](features/leaderboard.md)
- Matchs clan → [Matchs](features/matches.md) puis [Dashboard membre](features/member-dashboard.md)
- Armes / Précision → [Armes](features/weapons.md) + [Parser](telemetry/parser.md)
- Awards → [Awards](features/awards.md)
- Season ranked → [Season stats](features/season-stats.md)

### Travailler sur la télémétrie
1. [Vue d'ensemble](telemetry/overview.md) — architecture générale
2. [Pipeline](telemetry/pipeline.md) — comment les données circulent
3. [Parser](telemetry/parser.md) — quels événements sont exploités
4. [Worker](telemetry/worker.md) — comment le worker tourne et ses contraintes mémoire
5. [API](telemetry/api.md) — contrats des routes

### Mettre en production
1. [Ops production](telemetry/ops.md) — migration SQL, rollout, backfill
2. [Déploiement](ops/deployment.md) — variables, processus, systemd
3. [Dashboard monitoring](telemetry/dashboard.md) — surveiller après déploiement

### Mettre en place l'environnement de développement
1. [Dev setup](ops/dev-setup.md) — Node 22, VSCode, MySQL local, .env, multi-terminaux

### Ajouter un composant / une page
1. [Composants](ui/components.md) — vérifier si le composant existe déjà
2. [Patterns](ui/patterns.md) — structure obligatoire et checklist
3. [Thèmes](ui/themes.md) — règles de couleurs et tokens

---

## Points critiques à ne jamais oublier

- **Node 24 interdit** — le script `predev` bloque, utiliser Node 22 LTS
- **`Readable.toWeb()` interdit** — bug V8 Fatal Error sur Node 22, voir [Worker](telemetry/worker.md)
- **`params` est une Promise** dans Next.js 16 — toujours `await params`
- **Ne pas lancer `prisma migrate deploy`** en production — risque de conflit de checksum
- **Ne jamais hardcoder `bg-white` ou `border-gray-200`** — passer par les tokens CSS
- **Migrations SQL manuelles** sur `smk.arkium.group:3306` — runbook dans [Ops production](telemetry/ops.md)
