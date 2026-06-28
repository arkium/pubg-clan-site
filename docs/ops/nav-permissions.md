# Système de permissions de navigation

## Vue d'ensemble

Chaque bouton de navigation (sections clan/membre, menus admin/owner/superuser, navigation principale) est géré par un système de permissions stocké en base de données. L'owner peut modifier les rôles requis, l'ordre, les libellés et la section d'un item depuis `/settings/nav-permissions` — sans toucher au code, sans redéploiement.

---

## Fichiers impliqués

| Rôle | Fichier |
|---|---|
| Types et fallback statique (déprecié) | `src/lib/nav-permissions-registry.ts` |
| Service DB (CRUD table NavItem) | `src/lib/nav-permissions-service.ts` |
| API REST | `src/app/api/settings/nav-permissions/route.ts` |
| Hook client (cache sessionStorage) | `src/hooks/useNavPermissions.ts` |
| Navigation sidebar | `src/components/ClanNavigation.tsx` |
| Page de gestion owner/superuser | `src/app/settings/nav-permissions/page.tsx` |

> `ClanSectionNav.tsx`, `MemberSectionNav.tsx` et `SettingsSectionNav.tsx` ont été supprimés lors de la refonte navigation (Phase 4 terminée).

---

## Table `NavItem` (source de vérité)

```prisma
model NavItem {
  id              Int      @id @default(autoincrement())
  navKey          String   @unique
  section         String                     // NavSection native
  label           String
  hrefTemplate    String
  defaultRole     String                     // NavRole
  description     String   @default("")
  sortOrder       Int      @default(0)       // ordre d'affichage dans la section native
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

## Structure d'un item de navigation

```typescript
type NavItemDef = {
  navKey: string         // clé unique, ex: 'clan.stats-weapons'
  section: NavSection    // section effective (sectionOverride ?? section)
  label: string          // libellé effectif (labelOverride ?? label)
  hrefTemplate: string   // ex: '/clans/:clanId/stats/weapons'
  defaultRole: NavRole   // rôle effectif (roleOverride ?? defaultRole)
  description: string
}
```

---

## Les six rôles

| Rôle | Qui peut voir |
|---|---|
| `none` | Tous les utilisateurs |
| `member` | Utilisateurs avec session valide |
| `admin` | Permission `manage_members`, `manage_roles`, `manage_settings` ou `*` |
| `owner` | Permission wildcard `*` |
| `superuser` | Flag `isSuperUser` uniquement |
| `hidden` | Personne — bouton invisible pour tous |

---

## Service `nav-permissions-service.ts`

Toutes les lectures/écritures passent par la table `NavItem`.

### Fonctions de lecture

| Fonction | Rôle |
|---|---|
| `getAllNavItems()` | Tous les items actifs (avec overrides appliqués) |
| `getNavPermissions()` | `[{ navKey, role }]` — rôle effectif par item |
| `getNavItemRole(navKey)` | Rôle effectif d'un item |
| `getNavPositions()` | `{ section: navKey[] }` — ordre par section |
| `getNavPromotedPositions()` | Items déplacés via `sectionOverride` |
| `getNavLabels()` | `{ navKey: label }` — libellés overridés |
| `getNavPermissionOverrides()` | `{ navKey: role }` — items avec `roleOverride` |

### Fonctions d'écriture

| Fonction | Rôle |
|---|---|
| `setNavPermission(navKey, role)` | Met `roleOverride` (null si retour au défaut) |
| `setNavLabel(navKey, label)` | Met `labelOverride` (null si retour au défaut) |
| `setNavSectionOrder(section, orderedKeys)` | Bulk update `sortOrder` |
| `setNavPromotedOrder(section, orderedKeys)` | Bulk update `sortOrder` pour items promus |
| `createNavItem(data)` | Crée un nouvel item avec `sortOrder` max+1 |
| `updateNavItem(navKey, patch)` | Patch label/hrefTemplate/description/defaultRole |
| `deleteNavItem(navKey)` | Supprime l'item |
| `moveToSection(navKey, targetSection)` | Met `sectionOverride` |

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
  "positions":         { "clan-section": ["clan.matches", "clan.stats", "..."] },
  "promotedPositions": { "admin-menu": ["clan.overview"] },
  "labels":            { "clan.matches": "Parties" }
}
```

### PUT `/api/settings/nav-permissions` — Owner/SuperUser requis

```json
// Changer un rôle
{ "action": "role", "navKey": "clan.stats-weapons", "role": "member" }

// Réordonner une section
{ "action": "position", "section": "clan-section", "orderedKeys": ["clan.matches", "..."] }

// Réordonner les items promus dans une section cible
{ "action": "promoted-position", "section": "admin-menu", "orderedKeys": ["clan.overview"] }

// Renommer un bouton
{ "action": "label", "navKey": "clan.matches", "label": "Parties" }

// Créer un nouvel item
{ "action": "create", "data": { "navKey": "clan.new-page", "section": "clan-section",
  "label": "Ma page", "hrefTemplate": "/clans/:clanId/ma-page",
  "defaultRole": "none", "description": "..." } }

// Supprimer un item
{ "action": "delete", "navKey": "clan.new-page" }

// Déplacer vers une autre section
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

- **Créer** : bouton "Ajouter un item" → modal avec champs navKey, section, label, hrefTemplate, defaultRole, description.
- **Modifier le rôle** : sélecteur inline (sauvegarde immédiate au clic).
- **Renommer** : clic sur le crayon → input inline → save au blur ou Entrée.
- **Réordonner** : drag & drop dans la même section (HTML5 natif).
- **Déplacer entre sections** : glisser un item vers une carte de section différente → `move-section`.
- **Supprimer** : icône poubelle → confirmation inline → delete.

### Affichage

- Un panneau (`app-panel`) par section dans l'ordre `nav-primary → clan → member → admin → owner → superuser`.
- Items avec `sectionOverride` apparaissent en tirets dans leur section d'affichage, avec fond distinct.
- Badge ✦ sur le bouton de rôle correspondant au `defaultRole`.
- Badge "Modifié" si `roleOverride` actif. Badge "Renommé" si `labelOverride` actif.

---

## Ajouter un nouveau bouton de navigation

Depuis l'UI : page `/settings/nav-permissions` → bouton **"Ajouter un item"**.

Aucune modification de code requise. L'item est immédiatement visible dans la navigation après création (le hook invalide son cache après l'opération réussie).

---

## `NAV_REGISTRY` — statut déprecié

`NAV_REGISTRY` dans `src/lib/nav-permissions-registry.ts` est marqué `@deprecated`. Il sert uniquement de valeur initiale dans `useNavPermissions` pendant le premier rendu (avant que l'API réponde). La source de vérité est désormais la table `NavItem`.

`getItemRole()` dans le même fichier est également déprecié : avec `navPerms.roles` chargé depuis la DB, le fallback vers `NAV_REGISTRY` n'est plus atteint.

---

## Seed

```bash
npx tsx prisma/seed-nav-items.ts
```

Idempotent (upsert sur `navKey`). À relancer si vous restaurez la DB ou si les defaults du registre ont changé.
