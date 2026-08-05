# Pages de paramètres admin

## Organisation

Les pages de paramètres sont regroupées sous `/settings/`. Chacune est accessible via la navigation `SettingsSectionNav` (section `admin-menu` ou `owner-menu`). L'accès est contrôlé par le rôle défini dans le registre de navigation : les pages admin requièrent la permission `manage_settings` (ou `*`), les pages owner requièrent `*`.

Chaque page utilise la structure standard :

```tsx
<main className="app-container app-main flex-1">
  <SettingsSectionNav section="admin-menu" />
  {/* contenu */}
</main>
```

---

## `/settings/pubg-api` — Monitoring PUBG API

Accès : Owner (`owner.pubg-api`, permission `*`).

### Catégorisation des appels

Toutes les requêtes PUBG passent par `queuedPubgGet` ([pubg.ts](../../src/lib/pubg.ts)) avec `source` toujours égal à `'pubg-lib'` et `endpoint` toujours égal au chemin REST brut (ex. `/shards/steam/players/{id}/weapon_mastery`). Le module partagé [pubg-api-call-category.ts](../../src/lib/pubg-api-call-category.ts) (`categorizePubgApiCall`) classe chaque appel par **forme du chemin REST**, pas par nom de job cron — une version antérieure basée sur des mots-clés type `sync-matches`/`weekly`/`challenge` ne matchait quasiment jamais et faisait tomber presque tous les appels dans "Autre". Catégories actuelles, une par point d'appel existant de `pubg.ts` :

| Catégorie | Endpoint réel |
|---|---|
| Recherche joueur | `/players?filter[playerNames]=...` |
| Détail joueur | `/players/{id}` |
| Maîtrise armes | `/players/{id}/weapon_mastery` |
| Stats lifetime | `/players/{id}/seasons/lifetime` |
| Stats ranked | `/players/{id}/seasons/{id}/ranked` |
| Stats saison | `/players/{id}/seasons/{id}` |
| Liste des saisons | `/seasons` |
| Membres du clan | `/clans/{id}/members` |
| Clan | `/clans` ou `/clans/{id}` |
| Détail match | `/matches/{id}` |
| Autre | tout chemin non reconnu (ne devrait plus apparaître en pratique) |

Ce module est importé à la fois par le service serveur (agrégation) et par la page (badges), une seule source de vérité pour la catégorisation.

### Données affichées

- **RPM actuel** : requêtes par minute mesurées sur une fenêtre glissante configurable.
- **Bornes RPM** : valeurs min, max et défaut de la limite PUBG API.
- **Snapshot rate-limit** : `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `observedAt` — issu du dernier appel PUBG enregistré.
- **Jauge de quota** : barre de progression du quota consommé (`limit - remaining`), teinte verte/ambre/rouge selon le pourcentage (seuils `70 %` / `90 %`).
- **Badge de cohérence RPM** : bandeau d'alerte ambre si le RPM configuré (`AppConfig.pubg_api_rate_limit_rpm`) dépasse la limite `X-RateLimit-Limit` réellement observée côté PUBG.
- **Totaux fenêtre (24 h)** : total d'appels, succès, rate-limiteds (429), erreurs, retries totaux, durée moyenne.
- **Heatmap 24 h** : grille par tranche de 30 min (repart à zéro chaque minuit), ventilation succès/erreur/rate-limited, légende dédiée.
- **Tendance 14 jours** : mini graphique en barres (volume par jour), teinte rouge/ambre/verte selon présence d'erreurs/429 ce jour-là.
- **Répartition par type d'appel** : panneau agrégé (appels, succès, erreurs, 429, latence moyenne) par catégorie, fenêtre 24 h.
- **Top erreurs** : messages d'erreur regroupés par occurrence (top 5), fenêtre 24 h.
- **Tableau historique** : appels récents avec pagination, filtre `errorsOnly`, filtre texte (endpoint/source) et filtre `clanId`.
- **Légende des codes statut** : `2xx` succès (vert), `429` limite de débit (ambre), `4xx/5xx/n-a` erreur (rouge).

### Colonnes du tableau historique

`startedAt`, `statusCode` (badge coloré, tooltip = `errorMessage`), `durationMs`, `retryCount`, `rateLimitRemaining`, **Type** (badge de catégorie + `actorLabel` — clan ou membre concerné — + endpoint complet affiché en clair sous le badge, plus au survol uniquement).

### Filtres

- `errorsOnly` : réduit l'historique aux appels en erreur (non-2xx, 429 ou `errorMessage` non nul).
- Recherche texte (`q`) : `contains` sur `endpoint` OU `source`.
- `clanId` : filtre exact.
- Taille de page : `15` (défaut), `25` ou `50`.

### Route API

`GET /api/settings/pubg-api-calls?page&pageSize&errorsOnly&q&clanId` — retourne `{ rpm, bounds, windowMinutes, totals: { total, success, rateLimited, errors, retriesTotal, avgDurationMs }, series, dailySeries, byCategory, topErrors, latestRateLimit, historyPagination, history }`.

`DELETE /api/settings/pubg-api-calls` — purge intégrale de l'historique (irréversible, confirmation UI requise).

`POST /api/settings/pubg-api-rate-limit` — met à jour le RPM configuré, corps `{ rpm: number }`.

### Impact sur l'app

Permet de surveiller la consommation de l'API PUBG, détecter les 429, identifier quelle ressource PUBG (joueur/clan/saison/arme/match) consomme le plus de quota, repérer les erreurs récurrentes, vérifier que les garde-fous de la queue API sont actifs, et diagnostiquer les erreurs d'import de matchs.

---

## `/settings/email-delivery` — Livraison email

Accès : Owner (`owner.email-delivery`).

### Données configurées

Affiche la configuration SMTP active (lue depuis les variables d'environnement, non modifiable depuis l'UI) :
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_FROM`.

Propose un formulaire de **test d'envoi** : saisie d'une adresse destinataire, envoi d'un email de test. Retourne le résultat (succès ou message d'erreur SMTP).

### Route API

`POST /api/settings/email-delivery/test` — corps `{ to: string }`, retourne `{ success: boolean, error?: string }`.

### Impact sur l'app

Valide que la configuration SMTP est opérationnelle. Utile après un changement de serveur email ou de credentials. N'affecte pas le comportement de l'application en dehors des envois de test.

---

## `/settings/login-welcome` — Message d'accueil

Accès : Admin (`admin.login-welcome`).

### Données configurées

Message affiché sur la page de connexion (`/login`). Peut contenir du texte libre (pas de HTML interprété).

Stocké dans la table `AppConfig` sous une clé dédiée.

### Route API

`GET/PUT /api/settings/login-welcome` — corps PUT `{ message: string }`.

### Impact sur l'app

Le message est lu par la page `/login` et affiché dans l'encart d'accueil. Permet de personnaliser le message selon la saison, un événement ou les informations du clan.

---

## `/settings/map-labels` — Cartes PUBG, labels et villes

Accès : Admin (`admin.map-labels`).

### Données configurées

Noms affichés des cartes PUBG dans l'interface. Pour chaque clé de carte PUBG interne (ex : `Baltic_Main`, `Desert_Main`, `Tiger_Main`, etc.), l'admin peut définir un alias lisible (ex : `Erangel`, `Miramar`, `Taego`).

Cartes configurables : `Baltic_Main`, `Savage_Main`, `Desert_Main`, `DihorOtok_Main`, `Range_Main`, `Summerland_Main`, `Tiger_Main`, `Kiki_Main`, `Chimera_Main`, `Heaven_Main`, `Neon_Main`.

Chaque carte est présentée avec son aperçu image (`MapImage`) et un champ texte pour l'alias.

Stocké dans `AppConfig` sous une clé dédiée (JSON `Record<mapKey, string>`).

La vue **Villes et zones** permet aussi de configurer des périmètres circulaires sur chaque carte disposant d'un asset. Une ville contient un identifiant, un nom, un centre `xPct/yPct`, un `radiusPct` et un statut actif. Le centre peut être placé par clic ou saisi manuellement ; l'interface règle le diamètre de `0,5 %` à `50 %`.

L'éditeur utilise le même viewport moderne que les pages drop zones. Les contrôles superposés proposent un zoom de `1×` à `4×` par pas de `0,5×` et une réinitialisation. La molette zoome sous le curseur sans faire défiler la page ; une carte agrandie se déplace par glisser-déposer, avec des curseurs `grab`/`grabbing` et sans barres de défilement visibles. La sélection ou l'ajout d'une ville passe au minimum à `2×` et centre son périmètre.

Un clic simple place le centre de la ville sélectionnée, tandis qu'un mouvement d'au moins `5 px` déplace la carte sans modifier la ville. Les coordonnées restent exprimées par rapport à la carte complète, quel que soit le niveau de zoom ou le défilement du viewport.

Un référentiel initial de 162 villes et zones couvre les 9 cartes dont l'image WebP est disponible. Les actions de préremplissage de la carte courante ou de toutes les cartes fusionnent ces valeurs par identifiant sans écraser les villes déjà personnalisées.

Les villes sont stockées séparément dans `AppConfig` sous la clé `pubg_map_locations`. `Range_Main` et `Heaven_Main` restent indisponibles dans l'éditeur géographique tant que leurs images ne sont pas présentes sous `public/maps/pubg/`.

### Route API

- `GET/PUT /api/settings/map-labels` — corps PUT `{ labels: Record<string, string> }`.
- `GET/PUT /api/settings/map-locations` — corps PUT `{ locations: Record<string, MapLocation[]> }`.

### Impact sur l'app

Les labels sont utilisés partout où une carte est affichée : stats par carte, heatmap, drop zones, SessionRecap, filtres. Les périmètres constituent le référentiel géographique réutilisable pour associer ensuite les positions télémétriques aux villes.

---

## `/settings/weapon-labels` — Labels des armes

Accès : Admin (`admin.weapon-labels`).

### Données configurées

Noms affichés des armes PUBG. Pour chaque identifiant interne d'arme (ex : `WeapAK47_C`), l'admin peut définir un alias court lisible (ex : `AKM`).

La liste couvre toutes les armes connues : fusils d'assaut, fusils de précision, mitrailleuses, SMG, shotguns, pistolets, armes lancées.

Chaque arme est présentée avec son icône (`WeaponIcon`) et un champ texte pour l'alias.

Stocké dans `AppConfig` sous une clé dédiée (JSON `Record<weaponKey, string>`).

### Route API

`GET/PUT /api/settings/weapon-labels`.

### Impact sur l'app

Les labels sont utilisés dans les stats armes, la télémétrie armes, les filtres et les tooltips.

---

## `/settings/weapon-categories` — Catégories d'armes

Accès : Admin (`admin.weapon-categories`).

### Données configurées

Deux niveaux de configuration :

**1. Catégorie de chaque arme** : assigne chaque arme à une catégorie (ex : `assault_rifle`, `sniper`, `smg`, `shotgun`, `dmr`, `lmg`, `pistol`, `other`). Catégories disponibles définies dans `CATEGORY_CODES` de `src/lib/weapon-category-service.ts`.

**2. Labels des catégories** : nom affiché pour chaque catégorie (ex : `assault_rifle` → `Fusils d'assaut`). Valeurs par défaut dans `DEFAULT_CATEGORY_LABELS`.

La page inclut une barre de recherche pour filtrer les armes par nom.

Stocké dans `AppConfig` : deux clés distinctes pour les assignations d'armes et les labels de catégories.

### Route API

`GET/PUT /api/settings/weapon-categories`.

### Impact sur l'app

Les catégories sont utilisées par la page `/clans/[clanId]/stats/weapons/categories` (télémétrie armes par catégorie) et les filtres associés (`WeaponCategoryPeriodFilter`).

---

## `/settings/phase-labels` — Labels des phases de jeu

Accès : Admin (`admin.phase-labels`).

### Données configurées

Noms affichés des phases de jeu PUBG (zones bleue, phases de cercle) dans les analyses de télémétrie.

Stocké dans `AppConfig` (JSON `Record<phaseKey, string>`).

### Route API

`GET/PUT /api/settings/phase-labels`.

### Impact sur l'app

Utilisé dans les pages de télémétrie (positions, heatmap) où les phases sont affichées comme filtres ou légendes.

---

## Navigation entre pages de settings

Toutes les pages de settings partagent `SettingsSectionNav` qui affiche les liens de la section courante (`admin-menu` ou `owner-menu`). L'ordre, les libellés et les rôles de ces liens sont configurables depuis `/settings/nav-permissions` (voir `docs/ops/nav-permissions.md`).

La sidebar affiche un bouton d'entrée unique pointant vers le premier item accessible de chaque section.
