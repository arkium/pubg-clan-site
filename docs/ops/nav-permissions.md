# Système de permissions de navigation

## Vue d'ensemble

Chaque bouton de navigation (sections clan/membre, menus admin/owner/superuser, navigation principale) est géré par un système de permissions stocké en base de données. L'owner peut modifier les rôles requis, l'ordre, le libellé, l'URL et la section d'un item depuis `/settings/nav-permissions` — sans toucher au code, sans redéploiement.

---

## Fichiers impliqués

| Rôle | Fichier |
|---|---|
| Types et fallback statique (déprécié) | `src/lib/nav-permissions-registry.ts` |
| Service DB (CRUD table NavItem) | `src/lib/nav-permissions-service.ts` |
| API REST | `src/app/api/settings/nav-permissions/route.ts` |
| Hook client (cache sessionStorage) | `src/hooks/useNavPermissions.ts` |
| Navigation sidebar | `src/components/ClanNavigation.tsx` |
| Page de gestion owner/superuser | `src/app/settings/nav-permissions/page.tsx` |

---

## Table `NavItem` (source de vérité)

```prisma
model NavItem {
  id              Int      @id @default(autoincrement())
  navKey          String   @unique
  section         String                     // NavSection native (en DB)
  label           String
  hrefTemplate    String
  defaultRole     String                     // NavRole de base
  description     String   @default("")
  sortOrder       Int      @default(0)       // ordre d'affichage dans la section effective
  sectionOverride String?                    // si non-null : section d'affichage différente de section
  roleOverride    String?                    // remplace defaultRole au runtime
  labelOverride   String?                    // remplace label au runtime
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

Peuplée via `prisma/seed-nav-items.ts` (idempotent, `upsert` sur `navKey`).

---

## Section d'affichage effective

La section où un item s'affiche est calculée par `getDisplaySection()` dans le service et `getEffectiveDisplaySection()` dans la page. La logique (dans cet ordre de priorité) :

1. **Role-based** : si le rôle effectif est `admin` → `admin-menu`, `owner` → `owner-menu`, `superuser` → `superuser-menu`
2. **`sectionOverride`** : si non-null et qu'aucun rôle ne redirige → section d'affichage = `sectionOverride`
3. **`section`** native : sinon, l'item s'affiche dans sa section DB

Le `sortOrder` est global : il positionne l'item dans sa section d'affichage effective, qu'il soit natif ou promu par rôle/override.

---

## Structure d'un item retourné par l'API

```typescript
type NavItemDef = {
  navKey: string         // clé unique, ex: 'clan.stats-weapons'
  section: NavSection    // sectionOverride ?? section (native)
  label: string          // labelOverride ?? label
  hrefTemplate: string   // ex: '/clans/:clanId/stats/weapons'
  defaultRole: NavRole   // roleOverride ?? defaultRole
  description: string
}
```

---

## Les six rôles

| Rôle | Qui peut voir | Redirige vers |
|---|---|---|
| `none` | Tous les utilisateurs | — |
| `member` | Utilisateurs avec session valide | — |
| `admin` | Permission `manage_*` ou `*` | `admin-menu` |
| `owner` | Permission wildcard `*` | `owner-menu` |
| `superuser` | Flag `isSuperUser` uniquement | `superuser-menu` |
| `hidden` | Personne — bouton invisible | — |

Les rôles `admin`, `owner` et `superuser` déplacent automatiquement l'item vers le menu latéral correspondant.

---

## Service `nav-permissions-service.ts`

### Fonctions de lecture

| Fonction | Rôle |
|---|---|
| `getAllNavItems()` | Tous les items actifs (overrides appliqués) — `section` = effective |
| `getNavPermissions()` | `[{ navKey, role }]` — rôle effectif par item |
| `getNavItemRole(navKey)` | Rôle effectif d'un item |
| `getNavPositions()` | `{ section: navKey[] }` — items groupés par section d'affichage réelle, triés par `sortOrder` |
| `getNavLabels()` | `{ navKey: label }` — libellés overridés uniquement |
| `getNavPermissionOverrides()` | `{ navKey: role }` — items avec `roleOverride` |

### Fonctions d'écriture

| Fonction | Rôle |
|---|---|
| `setNavPermission(navKey, role)` | Met `roleOverride` (null si retour au défaut) |
| `setNavLabel(navKey, label)` | Met `labelOverride` (null si retour au défaut) |
| `setNavSectionOrder(section, orderedKeys)` | Bulk update `sortOrder` — accepte tous les items de la section d'affichage (natifs + role-promus + sectionOverride) |
| `createNavItem(data)` | Crée un nouvel item avec `sortOrder` max+1 |
| `updateNavItem(navKey, patch)` | Patch label de base, hrefTemplate, description |
| `deleteNavItem(navKey)` | Supprime l'item |
| `moveToSection(navKey, targetSection)` | Met `sectionOverride` (null si retour à la section native) |

---

## API REST

Route : `src/app/api/settings/nav-permissions/route.ts`

### GET `/api/settings/nav-permissions`

Public. Retourne les définitions complètes + états effectifs :

```json
{
  "items": [
    { "navKey": "clan.matches", "section": "clan-section", "label": "Matchs",
      "hrefTemplate": "/clans/:clanId/matches", "defaultRole": "none", "description": "..." }
  ],
  "roles":             { "clan.stats-weapons": "owner" },
  "positions":         { "clan-section": ["clan.matches", "clan.stats", "..."],
                         "admin-menu": ["clan.overview", "admin.add-player", "..."] },
  "promotedPositions": { "admin-menu": ["clan.overview"] },
  "labels":            { "clan.matches": "Parties" }
}
```

> `positions` contient **tous** les items par section d'affichage réelle (natifs + role-promus), triés par `sortOrder`.

### PUT `/api/settings/nav-permissions` — Owner/SuperUser requis

```json
// Changer le rôle effectif (roleOverride)
{ "action": "role", "navKey": "clan.stats-weapons", "role": "member" }

// Réordonner tous les items d'une section (flat, natifs + promus mélangés)
{ "action": "position", "section": "admin-menu", "orderedKeys": ["clan.overview", "admin.add-player", "..."] }

// Renommer le label (labelOverride)
{ "action": "label", "navKey": "clan.matches", "label": "Parties" }

// Créer un nouvel item
{ "action": "create", "data": { "navKey": "clan.new-page", "section": "clan-section",
  "label": "Ma page", "hrefTemplate": "/clans/:clanId/ma-page",
  "defaultRole": "none", "description": "..." } }

// Modifier les champs de base d'un item (label de base, hrefTemplate, description)
{ "action": "update", "navKey": "clan.matches",
  "patch": { "hrefTemplate": "/clans/:clanId/matches-v2", "description": "Nouveau texte" } }

// Supprimer un item
{ "action": "delete", "navKey": "clan.new-page" }

// Déplacer vers une autre section (sectionOverride)
{ "action": "move-section", "navKey": "clan.overview", "targetSection": "admin-menu" }
```

---

## Hook client `useNavPermissions`

- Initialise avec `NAV_REGISTRY` comme fallback pendant le chargement de l'API.
- Cache `sessionStorage` TTL 5 min (clé `nav_permissions_cache`).
- Retourne `{ items, roles, positions, promotedPositions, labels }`.
- `items` contient les définitions complètes depuis la DB dès que l'API répond.
- `invalidateNavPermissionsCache()` : vide le cache (appeler après tout PUT réussi).

---

## Page de gestion `/settings/nav-permissions`

Accès : Owner ou SuperUser.

### Fonctionnalités

| Action | Comment |
|---|---|
| **Créer** | Bouton "Ajouter un item" → modal : navKey, section, label, hrefTemplate, defaultRole, description |
| **Modifier** | Bouton ▷ sur chaque item → modal : section, label (de base), hrefTemplate, description |
| **Renommer** | Crayon inline sur le label → input → sauvegarde au blur/Entrée (écrit `labelOverride`) |
| **Changer le rôle** | Sélecteur inline → sauvegarde immédiate (écrit `roleOverride`) |
| **Réordonner** | Drag & drop libre dans la même section — aucune restriction natif/promu |
| **Changer de section** | Glisser un item vers une autre carte de section |
| **Supprimer** | Icône poubelle → confirmation inline → suppression |

### Distinction label de base vs renommage inline

- Le **modal Modifier** édite le `label` de base en DB (`updateNavItem`). Le `labelOverride` reste intact et continue de prévaloir si présent.
- Le **crayon inline** écrit le `labelOverride`. C'est lui qui s'affiche dans la navigation.
- Pour effacer un renommage inline : cliquer le bouton "reset" (flèche circulaire) à côté du crayon.

### Distinction defaultRole vs rôle effectif

- Le **modal Modifier** (champ section) change la section via `sectionOverride` (`move-section`).
- Le **sélecteur de rôle inline** écrit le `roleOverride`. Changer le rôle peut déplacer l'item dans une autre section d'affichage (ex : passer à `admin` le met dans `admin-menu`).
- Pour revenir au `defaultRole`, cliquer le bouton correspondant (badge ✦ = valeur par défaut).

### Architecture frontend

- `displayOrder: Record<NavSection, string[]>` : liste plate ordonnée par section d'affichage, initialisée depuis `data.positions`.
- `displaySections` : memo qui mappe `displayOrder[s]` → `NavItemDef[]`.
- Drag & drop : reorder plat de `displaySections[section]` entier → update `displayOrder` → `PUT { action: 'position' }`.
- Badge bordure pointillée : items dont `item.section` (côté client = `sectionOverride ?? section`) ≠ section affichée (role-promus).

### Affichage

- Un panneau (`app-panel`) par section dans l'ordre `nav-primary → clan → member → admin → owner → superuser`.
- Items "role-promus" : bordure pointillée dans leur section d'affichage.
- Badge ✦ sur le bouton de rôle correspondant au `defaultRole`.
- Badge "Modifié" si `roleOverride` actif. Badge "Renommé" si `labelOverride` actif.

---

## Ajouter un nouveau bouton de navigation

Depuis l'UI : page `/settings/nav-permissions` → bouton **"Ajouter un item"**.

Aucune modification de code requise. L'item est immédiatement visible dans la navigation après création.

---

## `NAV_REGISTRY` — statut déprécié

`NAV_REGISTRY` dans `src/lib/nav-permissions-registry.ts` est marqué `@deprecated`. Il sert uniquement de valeur initiale dans `useNavPermissions` pendant le premier rendu (avant que l'API réponde). La source de vérité est désormais la table `NavItem`.

**À faire après validation en production :**
1. Supprimer les 4 clés AppConfig nav (`nav_permissions`, `nav_positions`, `nav_promoted_positions`, `nav_labels`) — elles ne sont plus lues ni écrites.
2. Supprimer `NAV_REGISTRY` de `nav-permissions-registry.ts` — le hook n'aura plus besoin du fallback.

---

## Seed

```bash
npx tsx prisma/seed-nav-items.ts
```

Idempotent (upsert sur `navKey`). À relancer si vous restaurez la DB ou si les defaults du registre ont changé.
