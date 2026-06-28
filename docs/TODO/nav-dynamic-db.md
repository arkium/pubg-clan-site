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

**Comportement actuel** (`ClanNavigation.tsx` lignes 1043–1074) :

Quand `activeSection === 'superuser-menu'` : la section SuperUser s'affiche en entier via `renderCtxSection()`, **mais** Admin et Owner se réduisent à un seul bouton d'entrée car :
```tsx
{activeSection !== 'admin-menu' && showAdminMenu
  ? renderSubmenuLink({ navKey: 'admin.entry', ... })   // bouton unique
  : null}
{activeSection !== 'owner-menu' && showOwnerMenu
  ? renderSubmenuLink({ navKey: 'owner.entry', ... })   // bouton unique
  : null}
```

**Comportement voulu :**
Quand on est sur une page SuperUser, Admin et Owner restent complètement déployés (tous leurs items visibles), pas réduits à un seul bouton.

**Fix dans `ClanNavigation.tsx` :**
- [x] Extraire une fonction `renderFullCtxSection(section, title, titleClass, mobile)` réutilisable à partir de la logique existante de `renderCtxSection()`
- [x] Quand `activeSection === 'superuser-menu'` ET `showAdminMenu` → rendre `renderFullCtxSection('admin-menu', 'Admin', 'sidebar-ctx-nav-title')` au lieu du bouton unique
- [x] Quand `activeSection === 'superuser-menu'` ET `showOwnerMenu` → rendre `renderFullCtxSection('owner-menu', 'Owner', 'sidebar-ctx-nav-title')` au lieu du bouton unique
- [x] Même correction dans le drawer mobile
- [ ] Étendre le même principe pour les pages Owner si jugé utile (SuperUser + Admin restent déployés)
- [ ] Tester : rôle superuser sur `/settings/cron` → vérifier Admin et Owner visibles en entier

---

## Phase 1 — Migration schema Prisma ✅

### 1.1 Nouveau modèle `NavItem`

```prisma
model NavItem {
  id              Int      @id @default(autoincrement())
  navKey          String   @unique
  section         String                         // NavSection native
  label           String
  hrefTemplate    String
  defaultRole     String                         // NavRole
  description     String   @default("")
  sortOrder       Int      @default(0)           // ordre dans la section native
  sectionOverride String?                        // si non-null : section d'affichage différente
  roleOverride    String?                        // remplace defaultRole au runtime
  labelOverride   String?                        // remplace label au runtime
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([section, sortOrder])
  @@map("NavItem")
}
```

- [x] Ajouter le modèle `NavItem` dans `prisma/schema.prisma`
- [x] Créer la migration `20260628120000_add_nav_item` manuellement (drift DB détecté, reset impossible) + appliquer via `prisma db execute` + `prisma migrate resolve --applied`

> Note : le fichier `prisma/migrations/20260621120000_add_superuser_and_join_status/migration.sql` a été restauré depuis git (il était absent, bloquant `prisma migrate dev`).

### 1.2 Migration + seed

- [x] Écrire `prisma/seed-nav-items.ts` — insère tous les items du `NAV_REGISTRY` actuel, `sortOrder` = index dans le tableau, idempotent via `upsert` sur `navKey`
- [x] Exécuter le seed : **46 lignes** insérées en DB

---

## Phase 2 — Mise à jour du service ✅

Fichier : `src/lib/nav-permissions-service.ts`

- [x] Remplacer tous les `NAV_REGISTRY.filter(...)` / `NAV_REGISTRY.find(...)` par des requêtes Prisma `navItem.findMany` / `navItem.findUnique`
- [x] Trier par `sortOrder` dans les requêtes (`orderBy: { sortOrder: 'asc' }`)
- [x] Supprimer l'import `NAV_REGISTRY` du service
- [x] `createNavItem(data)` — insère un nouvel item avec `sortOrder` = max de la section + 1
- [x] `updateNavItem(navKey, patch)` — met à jour label, role, description, hrefTemplate
- [x] `deleteNavItem(navKey)` — supprime l'item
- [x] `reorderSection(section, orderedKeys)` — bulk update `sortOrder` sur les items de la section
- [x] `moveToSection(navKey, targetSection)` — met à jour `sectionOverride`
- [x] Adapter `getNavPositions()` / `getNavPromotedPositions()` pour lire `sortOrder` depuis la table

> Note : les 4 clés AppConfig nav (`nav_permissions`, `nav_positions`, `nav_promoted_positions`, `nav_labels`) ne sont plus lues/écrites. Le service lit et écrit exclusivement la table `NavItem`.

---

## Phase 3 — Mise à jour de l'API ✅

Fichier : `src/app/api/settings/nav-permissions/route.ts`

- [x] Enrichir la réponse GET avec les définitions complètes des items (`items: NavItemDef[]`)
- [x] Conserver la rétro-compatibilité du contrat `{ roles, positions, promotedPositions, labels }`
- [x] Ajouter `action: 'create'` → appelle `createNavItem`
- [x] Ajouter `action: 'delete'` → appelle `deleteNavItem`
- [x] Ajouter `action: 'move-section'` → appelle `moveToSection`
- [x] Validation via `prisma.navItem.findUnique` au lieu de `NAV_REGISTRY.some`

---

## Phase 4 — Mise à jour du composant navigation ✅

Fichier : `src/components/ClanNavigation.tsx`

- [x] Hook `useNavPermissions` retourne maintenant `items: NavItemDef[]` (initialisé avec `NAV_REGISTRY` comme fallback, remplacé par les données DB dès que l'API répond)
- [x] `ClanNavigation.tsx` n'importe plus `NAV_REGISTRY` — tout vient du hook via `navPerms.items`
- [x] `getCtxSectionItems(section)` — itère sur `navPerms.items` au lieu de `NAV_REGISTRY`
- [x] `getFirstSectionHref(section, fallback)` — idem
- [x] `isNavHidden(navKey)` — lit depuis `navPerms.items`
- [x] Détection `activeSection` — itère sur `navPerms.items`
- [x] Import `NAV_REGISTRY` retiré de `ClanNavigation.tsx`

---

## Phase 5 — Mise à jour de la page `/settings/nav-permissions` ✅

Fichier : `src/app/settings/nav-permissions/page.tsx`

- [x] La page charge `items` depuis l'API GET (plus besoin de `NAV_REGISTRY`)
- [x] Import `NAV_REGISTRY` retiré de la page (remplacé par `allItems` state)
- [x] Bouton "Ajouter un item" → modal avec champs navKey, section, label, hrefTemplate, defaultRole, description + validation + appel `PUT { action: 'create' }` + rechargement
- [x] Icône poubelle sur chaque `SortableRow` + confirmation inline avant suppression + appel `PUT { action: 'delete' }` + retrait optimiste avec rollback
- [x] Drag cross-section : glisser vers une section card différente → `PUT { action: 'move-section' }` + mise à jour optimiste avec rollback

---

## Phase 6 — Nettoyage ✅

- [x] `NAV_REGISTRY` marqué `@deprecated` dans `nav-permissions-registry.ts` (conservé comme fallback initial du hook)
- [x] `getItemRole()` marqué `@deprecated` (fallback NAV_REGISTRY non atteint maintenant que `navPerms.roles` vient de la DB)
- [x] Import `NAV_REGISTRY` supprimé du service et du composant `ClanNavigation.tsx`
- [x] `docs/ops/nav-permissions.md` entièrement réécrit pour refléter l'architecture DB
- [x] `docs/sommaire.md` mis à jour
- [ ] Supprimer les 4 clés AppConfig nav en production (après validation)
- [ ] Supprimer complètement `NAV_REGISTRY` de `nav-permissions-registry.ts` (après validation en production — le hook n'en aura plus besoin)

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
Phase 6 (nettoyage)                                      ✅ (partiel — 2 items post-validation prod restants)
```
