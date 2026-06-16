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

Accès : Owner (`owner.pubg-api`).

### Données affichées

- **RPM actuel** : requêtes par minute mesurées sur une fenêtre glissante configurable.
- **Bornes RPM** : valeurs min, max et défaut de la limite PUBG API.
- **Snapshot rate-limit** : `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `observedAt` — issu du dernier appel PUBG enregistré.
- **Totaux fenêtre** : total d'appels, succès, rate-limiteds (429), erreurs, durée moyenne.
- **Graphe par minute** : sparkline des appels avec ventilation succès/erreur/rate-limited.
- **Tableau historique** : appels récents avec pagination et filtre `errorsOnly`.

### Colonnes du tableau historique

`source`, `method`, `endpoint`, `shard`, `statusCode`, `retryCount`, `durationMs`, `startedAt`, `actorLabel` (clan ou membre concerné), `errorMessage`, rate-limit headers.

### Filtre

- `errorsOnly` : réduit l'historique aux appels en erreur (non-2xx ou exceptions).
- Taille de page : configurable par l'utilisateur.

### Route API

`GET /api/settings/pubg-api/calls` — retourne `{ rpm, bounds, windowMinutes, totals, latestRateLimit, minutePoints, calls }`.

### Impact sur l'app

Permet de surveiller la consommation de l'API PUBG, détecter les 429, vérifier que les garde-fous de la queue API sont actifs, et diagnostiquer les erreurs d'import de matchs.

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

## `/settings/map-labels` — Labels des cartes PUBG

Accès : Admin (`admin.map-labels`).

### Données configurées

Noms affichés des cartes PUBG dans l'interface. Pour chaque clé de carte PUBG interne (ex : `Baltic_Main`, `Desert_Main`, `Tiger_Main`, etc.), l'admin peut définir un alias lisible (ex : `Erangel`, `Miramar`, `Taego`).

Cartes configurables : `Baltic_Main`, `Savage_Main`, `Desert_Main`, `DihorOtok_Main`, `Range_Main`, `Summerland_Main`, `Tiger_Main`, `Kiki_Main`, `Chimera_Main`, `Heaven_Main`, `Neon_Main`.

Chaque carte est présentée avec son aperçu image (`MapImage`) et un champ texte pour l'alias.

Stocké dans `AppConfig` sous une clé dédiée (JSON `Record<mapKey, string>`).

### Route API

`GET/PUT /api/settings/map-labels` — corps PUT `{ labels: Record<string, string> }`.

### Impact sur l'app

Les labels sont utilisés partout où une carte est affichée : stats par carte, heatmap, drop zones, SessionRecap, filtres.

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
