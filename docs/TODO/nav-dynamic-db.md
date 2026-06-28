# TODO — Navigation dynamique en base de données

**Objectif :** remplacer le registre statique `nav-permissions-registry.ts` par une table Prisma `NavItem`, afin de pouvoir ajouter, supprimer et réorganiser les entrées de navigation depuis l'UI sans redéploiement.

> **✅ IMPLÉMENTATION COMPLÈTE** — 2026-06-28

---

## État de la refonte navigation (voir `nav-refonte.md`)

Les phases 1 à 4 de `nav-refonte.md` sont **terminées**. Points importants pour ce TODO :

| Élément | État | Impact |
|---|---|---|
| `src/components/ui/NavIcon.tsx` | ✅ créé | Ne pas recréer |
| `SectionNav.tsx` | ✅ supprimé | Ne plus référencer ce fichier |
| Sidebar contextuelle `renderCtxSection()` | ✅ en place | Base du fix sous-menus |
| Drawer mobile unifié | ✅ en place | Même logique que sidebar |
| Phase 5 tests (admin/owner/superuser) | ✅ fix implémenté | Voir "Fix sous-menus" ci-dessous |

---

## Comportement à corriger en parallèle

### Sous-menus Admin/Owner toujours visibles sur les pages SuperUser

- [x] Extraire une fonction `renderFullCtxSection(section, title, titleClass, mobile)` réutilisable à partir de la logique existante de `renderCtxSection()`
- [x] Quand `activeSection === 'superuser-menu'` ET `showAdminMenu` → rendre `renderFullCtxSection('admin-menu', ...)` au lieu du bouton unique
- [x] Quand `activeSection === 'superuser-menu'` ET `showOwnerMenu` → rendre `renderFullCtxSection('owner-menu', ...)` au lieu du bouton unique
- [x] Même correction dans le drawer mobile
- [x] Validé en production — Admin et Owner visibles en entier depuis une page SuperUser

---

## Phase 1 — Migration schema Prisma ✅

- [x] Ajouter le modèle `NavItem` dans `prisma/schema.prisma`
- [x] Créer la migration `20260628120000_add_nav_item` manuellement (drift DB détecté, reset impossible) + appliquer via `prisma db execute` + `prisma migrate resolve --applied`
- [x] Écrire `prisma/seed-nav-items.ts` — insère tous les items du `NAV_REGISTRY` actuel, `sortOrder` = index dans le tableau, idempotent via `upsert` sur `navKey`
- [x] Exécuter le seed : **46 lignes** insérées en DB

> Note : le fichier `prisma/migrations/20260621120000_add_superuser_and_join_status/migration.sql` a été restauré depuis git (il était absent, bloquant `prisma migrate dev`).

---

## Phase 2 — Mise à jour du service ✅

Fichier : `src/lib/nav-permissions-service.ts`

- [x] Remplacer tous les `NAV_REGISTRY.filter(...)` / `NAV_REGISTRY.find(...)` par des requêtes Prisma
- [x] Trier par `sortOrder` dans les requêtes (`orderBy: { sortOrder: 'asc' }`)
- [x] Supprimer l'import `NAV_REGISTRY` du service
- [x] `createNavItem(data)` — insère un nouvel item avec `sortOrder` = max de la section + 1
- [x] `updateNavItem(navKey, patch)` — met à jour label, hrefTemplate, description
- [x] `deleteNavItem(navKey)` — supprime l'item
- [x] `setNavSectionOrder(section, orderedKeys)` — bulk update `sortOrder` (tous items de la section d'affichage, natifs ET role-promus)
- [x] `moveToSection(navKey, targetSection)` — met à jour `sectionOverride`
- [x] `getNavPositions()` — retourne les items groupés par **section d'affichage réelle** (role-aware via `getDisplaySection()`)
- [x] `getDisplaySection(row)` — helper interne : `ROLE_TO_DISPLAY_SECTION[effectiveRole] ?? (sectionOverride ?? section)`

> Note : les 4 clés AppConfig nav (`nav_permissions`, `nav_positions`, `nav_promoted_positions`, `nav_labels`) ne sont plus lues/écrites.

---

## Phase 3 — Mise à jour de l'API ✅

Fichier : `src/app/api/settings/nav-permissions/route.ts`

- [x] GET retourne `{ items, roles, positions, promotedPositions, labels }`
- [x] `action: 'role'` → `setNavPermission`
- [x] `action: 'position'` → `setNavSectionOrder` (flat, all items in display section)
- [x] `action: 'label'` → `setNavLabel`
- [x] `action: 'create'` → `createNavItem`
- [x] `action: 'update'` → `updateNavItem` (label, hrefTemplate, description)
- [x] `action: 'delete'` → `deleteNavItem`
- [x] `action: 'move-section'` → `moveToSection`

---

## Phase 4 — Mise à jour du composant navigation ✅

Fichier : `src/components/ClanNavigation.tsx`

- [x] Hook `useNavPermissions` retourne maintenant `items: NavItemDef[]` (initialisé avec `NAV_REGISTRY` comme fallback, remplacé par les données DB dès que l'API répond)
- [x] `ClanNavigation.tsx` n'importe plus `NAV_REGISTRY` — tout vient du hook via `navPerms.items`
- [x] Import `NAV_REGISTRY` retiré de `ClanNavigation.tsx`

---

## Phase 5 — Mise à jour de la page `/settings/nav-permissions` ✅

Fichier : `src/app/settings/nav-permissions/page.tsx`

- [x] La page charge `items` depuis l'API GET — `allItems` state (plus de `NAV_REGISTRY`)
- [x] État `displayOrder: Record<NavSection, string[]>` — liste plate par section d'affichage, sans distinction natif/promu
- [x] `displaySections` : simple mapping `displayOrder[s]` → `NavItemDef[]`
- [x] Drag & drop **libre** : n'importe quel item vers n'importe quelle position dans sa section, sans restriction native/promue
- [x] Drag cross-section → `PUT { action: 'move-section' }` + mise à jour optimiste avec rollback
- [x] Modal **Ajouter** → champs navKey, section, label, hrefTemplate, defaultRole, description + `PUT { action: 'create' }`
- [x] Modal **Modifier** → champs section, label, hrefTemplate, description + `PUT { action: 'update' }` + éventuel `PUT { action: 'move-section' }` si section changée
- [x] Icône poubelle + confirmation inline → `PUT { action: 'delete' }` + retrait optimiste avec rollback
- [x] `handleRoleChange` : met à jour `displayOrder` si le changement de rôle déplace l'item entre sections

---

## Phase 6 — Nettoyage ✅

- [x] `NAV_REGISTRY` marqué `@deprecated` dans `nav-permissions-registry.ts` (conservé comme fallback initial du hook)
- [x] `getItemRole()` marqué `@deprecated`
- [x] Import `NAV_REGISTRY` supprimé du service et du composant `ClanNavigation.tsx`
- [x] `docs/ops/nav-permissions.md` mis à jour
- [x] `docs/sommaire.md` mis à jour
- [ ] Supprimer les 4 clés AppConfig nav en production (après validation)
- [ ] Supprimer complètement `NAV_REGISTRY` de `nav-permissions-registry.ts` (après validation en production)

---

## Ordre d'exécution recommandé

```
Fix sous-menus (indépendant, livrable immédiatement)     ✅
    ↓
Phase 1 (schema + seed)                                  ✅
    ↓
Phase 2 (service)                                        ✅
    ↓
Phase 3 (API)                                            ✅
    ↓
Phase 4 (ClanNavigation)                                 ✅
    ↓
Phase 5 (page admin)                                     ✅
    ↓
Phase 6 (nettoyage)                                      ✅ (2 items post-validation prod restants)
```
