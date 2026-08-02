# Refonte navigation — Menu slider et sous-menus

Mis à jour au 2026-06-25.

## Contexte

Cette refonte concerne les trois couches de navigation du shell :

| Composant | Rôle actuel |
|---|---|
| `ClanNavigation.tsx` | Shell (layout) — sidebar desktop fixe, header mobile + drawer |
| `SectionNav.tsx` | Sous-nav de section — barre horizontale desktop + dropdown mobile dans chaque page |
| `MobileDropdownNav.tsx` | Composant dropdown réutilisable (filtre, nav section mobile) |

## Problèmes identifiés

1. **Sidebar non contextuelle** — quand on navigue dans une section (ex: Admin), la sidebar montre toujours les 3 liens primaires ; les sous-pages actives ne sont pas visibles.
2. **Navigation mobile fragmentée** — sur mobile, la navigation est répartie entre le drawer (liens primaires) et un dropdown dans le contenu de la page (SectionNav) ; l'utilisateur doit chercher à deux endroits.
3. **Icônes dupliquées** — `renderNavIcon()` existe dans `ClanNavigation.tsx` ET `SectionNav.tsx` avec des variantes légèrement différentes ; toute mise à jour doit être faite deux fois.
4. **Admin / Owner / SuperUser** — un seul lien d'entrée en sidebar ; impossible de sauter directement d'un item à l'autre sans passer par la page intermédiaire.
5. **SectionNav visuellement faible** — pills horizontales sans titre de section, se perd dans le flux de contenu.

## Choix retenus

| Point | Décision |
|---|---|
| Sidebar desktop | Contextuelle étendue — affiche dynamiquement les sous-items de la section active sous les liens primaires |
| Mobile primary | Drawer unifié — le drawer absorbe les sous-items de section (même logique que sidebar) |
| Mobile sous-nav | Barre overflow +N — 3 items fixes + bouton "+N ▾" ; l'item actif est toujours visible (permuté en position 1 si nécessaire) ; zéro scroll horizontal |
| Icônes | Extraire en `src/components/ui/NavIcon.tsx` partagé |
| SectionNav desktop | Masqué (`hidden lg:hidden`) — la sidebar prend le relais |

## Architecture cible

```
ClanNavigation.tsx
  ├─ Sidebar desktop (lg:sticky)
  │    ├─ Logo clan + toggle thème
  │    ├─ Liens primaires : Dashboard · Mon clan · Mon compte
  │    └─ Section contextuelle (dépend du pathname courant)
  │         ├─ Titre : "MON CLAN" / "MON PROFIL" / "ADMIN" / …
  │         ├─ Items de la section active (filtrés par permissions)
  │         └─ Séparateur + items de rôle (owner/admin/superuser)
  ├─ Header sticky (tous breakpoints)
  └─ Drawer mobile (slide gauche, lg:hidden)
       ├─ Liens primaires
       └─ Section contextuelle (même logique que sidebar)

SectionNav.tsx (adapté)
  ├─ Desktop (lg:) : masqué — la sidebar prend le relais
  └─ Mobile (<lg:) : barre overflow +N dans le contenu
       ├─ 3 items visibles + bouton "+N ▾" pour les suivants
       ├─ L'item actif est toujours visible (permuté en position 1 si nécessaire)
       └─ Zéro scroll horizontal — dropdown pour les items cachés

NavIcon.tsx (nouveau)
  └─ Composant unique pour toutes les icônes de navigation
```

## Maquettes

Voir `docs/ui/index.html` section **12 — Navigation**, sous-section **Refonte nav**, pour les exemples visuels interactifs (clair + sombre) :

- **Sidebar contextuelle étendue** — 3 états : Mon clan · Classement actif, Mon clan · dark, Tableau de bord actif (section Mon profil)
- **Drawer mobile unifié** — 2 états : light (Stats globales active) + dark (admin, Joueurs et rôles active)
- **Barre overflow +N** — 3 états : fermé light (Mon clan, Classement actif), dropdown ouvert light (Mon profil, item actif en 6e position), fermé dark (Notifications actif permuté en tête)

---

## Plan d'implémentation

### Phase 1 — Icônes partagées

- [x] Créer `src/components/ui/NavIcon.tsx`
  - Props : `label: string`, `className?: string`
  - Fusion des deux `renderNavIcon` (`SectionNav.tsx` + `ClanNavigation.tsx`)
  - Résoudre les divergences d'icônes entre les deux fonctions
- [x] Remplacer `renderNavIcon(label)` dans `SectionNav.tsx` par `<NavIcon label={item.label} />`
- [x] Remplacer `renderNavIcon(label)` dans `ClanNavigation.tsx` par `<NavIcon label={...} />`
- [x] Vérifier TypeScript (`npx tsc --noEmit`)

### Phase 2 — Sidebar contextuelle (desktop)

- [x] Dans `ClanNavigation.tsx`, détecter la section active via `pathname` :
  - `/clans/[id]/…` → `clan-section`
  - `/members/[id]/…` → `member-section`
  - `/clans/[id]/settings/members`, `/settings/…` → `admin-menu`
  - `/clans/[id]/telemetry/…` → `owner-menu`
  - `/settings/nav-permissions`, `/settings/clans` → `superuser-menu`
- [x] Récupérer les items de `NAV_REGISTRY` pour la section active
- [x] Appliquer les mêmes filtres de permissions que dans `SectionNav` (`canAccess`)
- [x] Afficher le bloc contextuel sous les liens primaires dans la sidebar
- [x] Gérer l'état actif des items (match pathname — `EXACT_MATCH_KEYS` compris)
- [x] Gérer le bouton "Mon profil" quand un admin/owner/superUser consulte un autre membre
- [x] Appliquer les styles `.sidebar-ctx-nav-*` (voir design system HTML)

### Phase 3 — Mobile : drawer unifié + barre overflow +N

- [x] Dans `ClanNavigation.tsx`, injecter le bloc contextuel dans le drawer mobile (même logique que sidebar)
- [x] Le drawer ferme automatiquement à la navigation (`closeMobileDrawer` sur click item)
- [x] Dans `SectionNav.tsx`, remplacer le `MobileDropdownNav` par une barre overflow +N :
  - Afficher les 3 premiers items (ou permuter l'actif en position 1 s'il est au-delà)
  - Les items suivants masqués dans un dropdown déclenché par un bouton "+N ▾" / "+N ▴"
  - Fermeture du dropdown : clic en dehors ou navigation
  - Classes : `.mobile-overflow-nav`, `.mobile-overflow-nav-item`, `.mobile-overflow-nav-more`, `.mobile-overflow-nav-dropdown`, `.mobile-overflow-nav-dropdown-item`
  - Masquer sur desktop : classe `lg:hidden`
- [x] Sur desktop, masquer `SectionNav` entièrement

### Phase 4 — Nettoyage SectionNav

- [x] `<SectionNav section="…" />` retiré des 43 pages (import + JSX)
- [x] `src/components/SectionNav.tsx` supprimé — plus aucun consommateur
- [x] `MobileDropdownNav` reste fonctionnel pour ses usages hors-nav (ex : filtres) — non modifié

### Phase 5 — Tests

- [ ] Tester toutes les sections : `clan-section`, `member-section`, `admin-menu`, `owner-menu`, `superuser-menu`
- [ ] Tester les rôles : membre standard, admin, owner, superuser
- [ ] Tester "Mon profil" (admin/owner/superUser visitant un autre membre)
- [ ] Tester le thème clair et sombre
- [ ] Tester sur mobile (drawer, fermeture, navigation rapide avec overflow +N)
- [ ] Tester sur tablet (breakpoint `lg:` = 1024px)
- [ ] Tester sur desktop (sidebar fixe)
- [x] TypeScript sans erreur (`npx tsc --noEmit`) — aucune erreur nouvelle introduite
- [x] Lint (`npm run lint`) — aucune erreur nouvelle introduite

---

## Pages utilisant `<SectionNav>`

44 occurrences dans 43 fichiers (une page a deux SectionNav). Conservées pour la barre overflow +N mobile.

### `section="superuser-menu"` (1 page)

- `src/app/clans/page.tsx`

### `section="owner-menu"` (11 pages)

- `src/app/settings/pubg-api/page.tsx`
- `src/app/settings/email-delivery/page.tsx`
- `src/app/settings/nav-permissions/page.tsx`
- `src/app/clans/[clanId]/telemetry/dashboard/page.tsx`
- `src/app/clans/[clanId]/telemetry/matches/page.tsx`
- `src/app/clans/[clanId]/telemetry/matches/[matchId]/telemetry/page.tsx`
- `src/app/clans/[clanId]/telemetry/matches/session/[date]/page.tsx`
- `src/app/clans/[clanId]/telemetry/errors/page.tsx`
- `src/app/clans/[clanId]/telemetry/recoveries/page.tsx` *(a aussi une `section="clan-section"` conditionnelle)*
- `src/app/clans/[clanId]/telemetry/sync-batch-manual/page.tsx`
- `src/app/clans/[clanId]/settings/cron/page.tsx`

### `section="admin-menu"` (8 pages)

- `src/app/settings/weapon-labels/page.tsx`
- `src/app/settings/weapon-categories/page.tsx`
- `src/app/settings/map-labels/page.tsx`
- `src/app/settings/phase-labels/page.tsx`
- `src/app/members/add/page.tsx`
- `src/app/clans/[clanId]/members/pending/page.tsx`
- `src/app/clans/[clanId]/settings/members/page.tsx`
- `src/app/clans/[clanId]/settings/login-welcome/page.tsx`

### `section="clan-section"` (15 pages)

- `src/app/clans/[clanId]/overview/page.tsx`
- `src/app/clans/[clanId]/leaderboard/page.tsx`
- `src/app/clans/[clanId]/members/page.tsx`
- `src/app/clans/[clanId]/matches/page.tsx`
- `src/app/clans/[clanId]/matches/session/[date]/page.tsx`
- `src/app/clans/[clanId]/matches/[matchId]/telemetry/page.tsx`
- `src/app/clans/[clanId]/drop-zones/page.tsx`
- `src/app/clans/[clanId]/awards/page.tsx`
- `src/app/clans/[clanId]/reports/page.tsx`
- `src/app/clans/[clanId]/stats/page.tsx`
- `src/app/clans/[clanId]/stats/positions/page.tsx`
- `src/app/clans/[clanId]/stats/heatmap-kills/page.tsx`
- `src/app/clans/[clanId]/stats/weapons/page.tsx`
- `src/app/clans/[clanId]/stats/weapons/categories/page.tsx`
- `src/app/clans/[clanId]/telemetry/recoveries/page.tsx` *(conditionnelle : `{clanId ? <SectionNav … /> : null}`)*

### `section="member-section"` (9 pages)

- `src/app/members/[id]/dashboard/page.tsx`
- `src/app/members/[id]/stats/page.tsx`
- `src/app/members/[id]/matches/page.tsx`
- `src/app/members/[id]/weapons/page.tsx`
- `src/app/members/[id]/map-stats/page.tsx`
- `src/app/members/[id]/drop-zones/page.tsx`
- `src/app/members/[id]/heatmap/page.tsx`
- `src/app/members/[id]/notifications/page.tsx`
- `src/app/members/[id]/notification-preferences/page.tsx`

---

## Références

- Composants : `src/components/ClanNavigation.tsx`, `src/components/SectionNav.tsx`, `src/components/ui/MobileDropdownNav.tsx`
- Registry navigation : `src/lib/nav-permissions-registry.ts`
- Permissions : `src/hooks/useNavPermissions.ts`
- Styles existants : `src/app/globals.css` (classes `clan-section-nav-*`, `member-section-nav-*`)
- Nouvelles classes CSS : `.sidebar-ctx-nav-*`, `.mobile-overflow-nav-*` (dans `docs/ui/index.html`)
- Design system : `docs/ui/index.html` (section 12 — Navigation › Refonte nav)
