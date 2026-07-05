# Plan de développement — Application mobile

Ce document évalue les options pour une application mobile compagnon au site PUBG Clan Site, et propose un plan de développement. Contrairement aux autres docs de `docs/`, ceci ne décrit **pas** du code existant mais une feuille de route pour du code à venir.

**Statut :** proposition, aucun développement mobile démarré à ce jour.

---

## 1. Contexte : ce que le projet actuel permet de réutiliser

Le site est une application Next.js 16 « full-stack » : les pages web (React 19, Client Components) consomment des routes API (`src/app/api/**/route.ts`) via des hooks custom (`useLeaderboard`, `usePlayerStats`, `useSelectedClan`, etc. — voir [Structure du code](code-structure.md)). Ce découplage hooks ↔ API est la meilleure carte en main pour un projet mobile : une app React Native peut appeler les **mêmes endpoints**, avec les mêmes contrats de données, sans toucher au backend.

Ce qui se réutilise directement :
- Toute la logique métier serveur (Prisma, `stats-calculator.ts`, `cron-jobs.ts`, pipeline télémétrie) — elle ne bouge pas, le mobile ne fait que l'appeler en HTTP.
- Les types TypeScript partagés (`src/types/`).
- Le pattern hook (`fetch` + état loading/error + `AbortController`) est transposable quasi tel quel en React Native — seul le rendu change (`<View>`/`<Text>` au lieu de `<div>`/`<span>`).

Ce qui ne se réutilise **pas** :
- Toute l'UI (composants `.app-panel`, tokens CSS, classes Tailwind remappées par thème — voir [Thèmes](../ui/themes.md)). React Native n'a pas de CSS ; il faut soit repartir sur des styles natifs, soit adopter NativeWind pour garder une syntaxe proche.
- Le cookie de session httpOnly (voir section 3 ci-dessous) — la transport doit changer, mais pas la logique de validation.

La liste complète des ~99 routes API existantes, avec leur authentification et leur pertinence pour le mobile (pertinent / admin web uniquement / interne-dev), est disponible dans [Référence API](api-reference.md) — c'est le point de départ pour choisir quels endpoints consommer en priorité.

---

## 2. Flutter vs React Native — recommandation

| Critère | React Native (+ Expo) | Flutter |
|---|---|---|
| Réutilisation de code | Hooks, types, logique métier réutilisables tels quels | Aucune passerelle — réécriture complète en Dart |
| Courbe d'apprentissage | Faible si l'équipe connaît déjà React | Nouveau langage (Dart) + nouveau paradigme (widgets) |
| Écosystème de départ | Expo Router (routing par fichiers, proche de l'App Router Next.js) | Standard Flutter, très guidé mais isolé du reste du stack |
| Performance graphique | Bonne, suffisante pour ce cas d'usage (listes, stats, dashboards) | Supérieure sur animations complexes — non nécessaire ici |

**Recommandation : React Native via Expo.**

Raison : le projet n'a pas besoin d'animations graphiques poussées (c'est un dashboard de stats de clan, pas un jeu). Le gain principal de Flutter (rendu graphique sur-mesure) n'apporte rien ici, alors que le coût principal de React Native (devoir reconstruire l'UI) est de toute façon incompressible des deux côtés. Expo Router, en plus, a une philosophie de routing par fichiers proche de ce que l'équipe connaît déjà avec l'App Router Next.js — ce qui réduit la friction d'onboarding.

---

## 3. Point d'attention majeur : l'authentification

C'est le vrai chantier d'architecture du projet, pas un détail.

**Situation actuelle** (voir [Auth](../features/auth.md)) :
- Le cookie `pubg_clan_session` (httpOnly) est créé au login/activation.
- Il référence un `UserSession` en base, dont le `token` est stocké **hashé** (jamais en clair), avec `expiresAt`.
- `GET /api/auth/session` valide le cookie et renvoie l'utilisateur courant, ses permissions, `activeMemberId`, `defaultClanId`.
- `src/proxy.ts` (edge middleware) redirige selon le `setupState` puis délègue la validation de session à l'API (pas de Prisma en edge).

**Problème pour le mobile :** une app React Native n'a pas de navigateur — pas de gestion automatique de cookie httpOnly cross-origin fiable. L'approche standard est un token porté en header `Authorization: Bearer <token>`, stocké côté mobile dans un stockage sécurisé (`expo-secure-store`).

**Bonne nouvelle :** le modèle `UserSession` (token hashé + `expiresAt` + révocation) est déjà conçu comme un token opaque côté serveur — il n'y a **pas besoin de réécrire la logique de session**, seulement d'ajouter un second mode de transport :
1. Les routes `/api/auth/login`, `/api/auth/activate` etc. continuent de poser le cookie pour le web, **et** renvoient en plus le token en clair dans le corps JSON de la réponse si un header (ex. `X-Client: mobile`) est présent.
2. Un middleware d'auth API (probablement à extraire dans une fonction partagée, ex. `getSessionFromRequest(req)`) accepte la session soit via cookie, soit via header `Authorization: Bearer`.
3. Le mobile stocke ce token dans `expo-secure-store` et l'envoie sur chaque requête.

Ce changement est localisé (quelques routes auth + une fonction de résolution de session) et ne casse pas le flux web existant.

---

## 4. Ce qui ne se transporte pas : l'UI

Le système de thème actuel (`data-app-theme`, classes Tailwind remappées, composants `SegmentedControl`/`PlacementBadge`/`TeamModeBadge`) est spécifique au DOM/CSS et ne fonctionne pas en React Native. Deux options :

- **NativeWind** : permet d'écrire des classes Tailwind-like dans du JSX React Native, compilées vers du style natif. Rapproche la syntaxe du web sans être un vrai partage de code UI.
- **Styles React Native natifs (`StyleSheet`)** : plus de contrôle, mais aucune familiarité de syntaxe avec le CSS actuel.

Dans les deux cas, chaque écran (leaderboard, dashboard membre, matchs, armes, awards...) doit être reconstruit — seule la donnée qui l'alimente (via les hooks/API) est partagée.

---

## 5. Organisation des dossiers

Une proposition courante consiste à séparer le repo en trois projets — `backend-node/`, `frontend-web/`, `frontend-mobile/`. **Ce schéma ne s'applique pas ici** : il part du principe qu'il existe déjà un backend Node séparé et un frontend React séparé, alors que Next.js fusionne les deux (les routes API et les pages React vivent ensemble dans `src/app/`, un seul `package.json`, un seul cycle de build). Suivre ce schéma à la lettre imposerait d'extraire les routes API dans un serveur Express/Fastify autonome — une réécriture lourde et risquée, pour un bénéfice nul : le mobile n'a besoin que d'appeler les endpoints HTTP existants, peu importe qu'ils tournent sous Next.js ou sous Express.

**Recommandation : ne pas toucher au projet Next.js existant.** Ajouter un dossier frère à la racine du repo :

```
pubg-clan-site/          <-- inchangé (web + API Next.js, déploiement systemd existant)
mobile/                  <-- nouveau projet Expo / React Native
```

Points clés de ce choix :
- **Pas de monorepo lourd (pnpm workspaces / Turborepo) dans un premier temps.** Le volume de code réellement partageable (quelques types TypeScript des réponses API) ne justifie pas l'outillage. Dupliquer/copier les types utiles dans `mobile/` au fil de l'eau est suffisant ; si la duplication devient pénible, envisager un petit package interne (`@pubg-clan/shared-types`) publié en interne — mais seulement à ce moment-là, pas en préventif.
- **Ne pas déplacer l'app Next.js dans un sous-dossier** (type `apps/web/`). Le déploiement actuel (service systemd, copie de `.next/standalone`, voir [Déploiement](../ops/deployment.md)) dépend de chemins précis ; déplacer l'app casserait ces scripts pour un gain nul.
- **Cycles de vie indépendants.** Le web continue de se déployer via le pipeline systemd existant ; le mobile se distribue via EAS/App Store/Play Store. Ne pas coupler les deux dans un même processus de build ou de CI.

---

## 6. Plan de développement proposé

### Phase 0 — Préparation (avant tout code mobile)
- [ ] Extraire une fonction de résolution de session commune (cookie **ou** bearer token) utilisable par toutes les routes API protégées.
- [ ] Ajouter le mode de retour "token en clair" sur les routes `login`/`activate` pour les clients mobiles.
- [ ] Auditer les routes API existantes pour confirmer qu'elles sont toutes indépendantes du rendu web (pas de logique HTML/cookie web-only mélangée dans la réponse).

### Phase 1 — Socle de l'app mobile
- [ ] Bootstrap Expo + Expo Router, TypeScript strict (aligné avec le reste du projet).
- [ ] Écran de login (réutilise l'endpoint `/api/auth/login` avec le token bearer).
- [ ] Stockage sécurisé du token (`expo-secure-store`) + intercepteur HTTP (ajout automatique du header `Authorization`).
- [ ] Sélection de clan (équivalent mobile de `useSelectedClan`).
- [ ] Gestion 401 → déconnexion automatique (équivalent mobile de `useAuthSession`).

### Phase 2 — Fonctionnalités cœur (par ordre de valeur perçue)
1. Leaderboard clan (`useLeaderboard` → écran liste + badges de placement).
2. Dashboard membre (stats principales, progression).
3. Historique de matchs (`useMatchHistory`).
4. Notifications push (le modèle `Notification` existe déjà côté serveur avec un canal "push" prévu — voir [Notifications](../features/notifications.md) — il reste à brancher Expo Push Notifications côté mobile et un provider FCM/APNs côté serveur).

### Phase 3 — Fonctionnalités avancées
- Awards, stats d'armes, zones de drop (probablement en lecture seule, moins prioritaires sur mobile qu'un dashboard condensé).
- Défis (`Challenge`) si l'aspect social est jugé prioritaire pour l'usage mobile.

### Phase 4 — Distribution
- Build EAS (Expo Application Services) pour iOS/Android.
- Configuration des stores (Apple Developer, Google Play Console).
- OTA updates via Expo pour les correctifs mineurs sans repasser par la validation store.

---

## 7. Alternative à considérer avant de se lancer

Si le besoin réel est surtout "accès rapide depuis mobile" plutôt que fonctionnalités natives (accès matériel, notifications push fiables sur iOS, etc.), une **PWA** (Progressive Web App) sur le site Next.js existant peut couvrir une bonne partie du besoin sans écrire une seule ligne de code mobile : le thème clair/sombre et le responsive existent déjà, il suffirait d'ajouter un manifest + service worker pour l'installation sur écran d'accueil. À évaluer selon si les notifications push et l'usage hors-ligne sont réellement nécessaires — si oui, React Native reste la bonne réponse.

---

## 8. Résumé des conseils

- **Techno : React Native + Expo**, pas Flutter — le projet n'a pas de besoin graphique qui justifie le coût de réécriture complète en Dart.
- **Organisation : `mobile/` en dossier frère**, pas de split `backend-node/frontend-web` — Next.js fusionne déjà backend et frontend, inutile de le désosser pour ajouter un client mobile.
- **Chantier réel n°1 : l'authentification** — passer d'un cookie httpOnly à un token bearer, mais sans réécrire le modèle `UserSession` (juste ajouter un second mode de transport).
- **Chantier réel n°2 : l'UI** — aucune réutilisation possible du CSS/Tailwind actuel ; prévoir NativeWind si on veut garder une syntaxe familière.
- **Ce qui est déjà acquis** : toute la logique métier serveur, les contrats API, les types TypeScript, et le pattern hook (fetch + loading/error) qui se transpose presque sans modification.
- **Alternative à ne pas négliger** : une PWA peut suffire si le besoin est surtout "accès mobile rapide" sans fonctionnalités natives poussées.
