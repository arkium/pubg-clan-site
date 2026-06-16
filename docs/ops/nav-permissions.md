# Système de permissions de navigation

## Vue d'ensemble

Chaque bouton de navigation de l'application (sections clan, sections membre, menus admin/owner, navigation principale) est géré par un système de permissions dynamique. L'owner peut modifier les rôles requis, l'ordre d'affichage, les libellés et (pour la nav principale) les destinations cibles — sans toucher au code, depuis la page `/settings/nav-permissions`.

---

## Fichiers impliqués

| Rôle | Fichier |
|---|---|
| Registre des items (source de vérité) | `src/lib/nav-permissions-registry.ts` |
| Service DB (lecture/écriture AppConfig) | `src/lib/nav-permissions-service.ts` |
| API REST | `src/app/api/settings/nav-permissions/route.ts` |
| Hook client (cache sessionStorage) | `src/hooks/useNavPermissions.ts` |
| Navigation principale sidebar | `src/components/ClanNavigation.tsx` |
| Navigation section clan | `src/components/ClanSectionNav.tsx` |
| Navigation section membre | `src/components/MemberSectionNav.tsx` |
| Navigation section admin/owner | `src/components/SettingsSectionNav.tsx` |
| Page de gestion owner | `src/app/settings/nav-permissions/page.tsx` |

---

## Structure d'un item de navigation

```typescript
type NavItemDef = {
  navKey: string         // clé unique, ex: 'clan.stats-weapons'
  section: NavSection    // 'nav-primary' | 'clan-section' | 'member-section' | 'admin-menu' | 'owner-menu'
  label: string          // libellé par défaut
  hrefTemplate: string   // ex: '/clans/:clanId/stats/weapons'
  defaultRole: NavRole   // valeur par défaut codée dans le registre
  description: string    // explication courte pour la page de gestion
}
```

---

## Registre `NAV_REGISTRY`

Défini dans `src/lib/nav-permissions-registry.ts`. C'est la source de vérité : tout bouton absent du registre n'existe pas.

### Sections et contenu

| Section | Items (navKeys principaux) | Défaut rôle |
|---|---|---|
| `nav-primary` | `primary.dashboard`, `primary.mon-clan`, `primary.mon-compte` | `none` |
| `clan-section` | `clan.challenges`, `clan.overview`, `clan.members`, `clan.matches`, `clan.stats`, `clan.stats-weapons`, `clan.stats-weapons-categories`, `clan.heatmap-kills`, `clan.positions`, `clan.drop-zones`, `clan.awards`, `clan.leaderboard`, `clan.reports` | mixte |
| `member-section` | `member.dashboard`, `member.stats`, `member.weapons`, `member.map-stats`, `member.drop-zones`, `member.heatmap`, `member.matches`, `member.rewards`, `member.notifications`, `member.notification-preferences` | `none` |
| `admin-menu` | `admin.add-player`, `admin.players-roles`, `admin.map-labels`, `admin.weapon-labels`, `admin.weapon-categories`, `admin.phase-labels`, `admin.login-welcome` | `admin` |
| `owner-menu` | `owner.telemetry-dashboard`, `owner.telemetry-errors`, `owner.telemetry-sync-batch`, `owner.cron`, `owner.telemetry-recoveries`, `owner.telemetry-matches`, `owner.email-delivery`, `owner.pubg-api`, `owner.nav-permissions`, `owner.switch-clan` | `owner` |

Rôles par défaut notables dans `clan-section` :
- `none` : `clan.challenges`, `clan.matches`, `clan.stats`, `clan.awards`, `clan.leaderboard`, `clan.reports`.
- `admin` : `clan.overview`, `clan.members`.
- `owner` : `clan.stats-weapons`, `clan.stats-weapons-categories`, `clan.heatmap-kills`, `clan.positions`, `clan.drop-zones`.

Pour ajouter un bouton : ajouter une entrée dans `NAV_REGISTRY` avec un `navKey` unique, puis ajouter le lien dans le composant de navigation correspondant. Aucune autre modification n'est nécessaire.

---

## Les cinq rôles

| Rôle | Valeur | Qui peut voir |
|---|---|---|
| `none` | Tous | Tous les utilisateurs (pas de garde d'auth sur le bouton) |
| `member` | Membre | Utilisateurs avec session valide |
| `admin` | Admin | Utilisateurs avec `manage_members`, `manage_roles`, `manage_settings` ou `*` |
| `owner` | Owner | Utilisateurs avec la permission wildcard `*` |
| `hidden` | Masqué | Personne — bouton invisible et désactivé pour tous, y compris l'owner |

La hiérarchie est inclusive : un owner voit tout sauf `hidden`. Le rôle `hidden` est orthogonal — il s'applique indépendamment du rôle de l'utilisateur.

Implémentation dans les composants de navigation :

```typescript
function canAccess(role: NavRole, isOwner: boolean, isAdmin: boolean): boolean {
  if (role === 'hidden') return false
  if (role === 'none' || role === 'member') return true
  if (role === 'admin') return isAdmin
  if (role === 'owner') return isOwner
  return true
}

// isOwner = permissions.includes('*')
// isAdmin = permissions.includes('*') || permissions.includes('manage_members')
//         || permissions.includes('manage_roles') || permissions.includes('manage_settings')
```

---

## Couleurs d'indication visuelle

Les liens de navigation affichent une bordure colorée selon le rôle requis.

| Rôle | Couleur | Classes CSS |
|---|---|---|
| `none` / `member` | Aucune (style standard) | `clan-section-nav-link` |
| `admin` | Rouge | `clan-section-nav-link--admin` / `--admin-active` |
| `owner` | Ambre/doré | `clan-section-nav-link--owner` / `--owner-active` |
| `hidden` | (badge dans page gestion uniquement) | — |

Utilitaire `getRoleLinkClass(role, active, variant)` dans `nav-permissions-registry.ts` :

```typescript
getRoleLinkClass('admin', false, 'section')  // → 'clan-section-nav-link--admin'
getRoleLinkClass('owner', true,  'section')  // → 'clan-section-nav-link--owner-active'
getRoleLinkClass('admin', false, 'submenu')  // → 'clan-submenu-link--admin'
getRoleLinkClass('none',  true,  'section')  // → 'clan-section-nav-link--active'
```

Ne jamais hardcoder `border-red-400` directement dans un composant de navigation — utiliser `getRoleLinkClass`.

---

## Stockage — Table `AppConfig`

Les overrides sont stockés dans la table `AppConfig` (modèle Prisma existant). Seules les surcharges par rapport aux valeurs par défaut du registre sont persistées. Si l'owner remet un item à son rôle par défaut, l'entrée est supprimée.

| Clé AppConfig | Contenu | Type |
|---|---|---|
| `nav_permissions` | Overrides de rôle | `Record<navKey, NavRole>` |
| `nav_positions` | Ordres personnalisés par section | `Record<section, string[]>` |
| `nav_labels` | Libellés personnalisés | `Record<navKey, string>` |
| `nav_targets` | Destinations des boutons `nav-primary` | `Record<navKey, string>` |

---

## Service `nav-permissions-service.ts`

Fonctions principales :

| Fonction | Rôle |
|---|---|
| `getNavPermissionOverrides()` | Lit les overrides de rôle depuis `AppConfig` |
| `getNavItemRole(navKey)` | Retourne le rôle effectif (override ou défaut) |
| `setNavPermission(navKey, role)` | Écrit ou supprime un override de rôle |
| `getNavPositions()` | Lit les ordres personnalisés |
| `setNavSectionOrder(section, orderedKeys)` | Valide et persiste l'ordre d'une section |
| `getNavLabels()` | Lit les libellés personnalisés |
| `setNavLabel(navKey, label)` | Écrit ou supprime un libellé |
| `getNavTargets()` | Lit les destinations personnalisées (`nav-primary`) |
| `setNavTarget(navKey, targetNavKey)` | Valide et persiste une destination |

`setNavSectionOrder` valide que `orderedKeys` contient exactement tous les navKeys de la section.

Destinations configurables (`nav-primary`) :
- `primary.mon-clan` → doit pointer vers un item de la section `clan-section`.
- `primary.dashboard` → doit pointer vers un item de la section `member-section`.

---

## API REST

Route : `src/app/api/settings/nav-permissions/route.ts`

### GET `/api/settings/nav-permissions`

Public (pas d'authentification requise). Retourne uniquement les overrides :

```json
{
  "roles":     { "clan.stats-weapons": "owner" },
  "positions": { "clan-section": ["clan.matches", "clan.stats", "..."] },
  "labels":    { "clan.matches": "Parties" },
  "targets":   { "primary.mon-clan": "clan.members" }
}
```

Les clés absentes du retour utilisent les valeurs par défaut du registre côté client.

### PUT `/api/settings/nav-permissions`

Owner uniquement (`requireRole(['Owner'])`). Corps JSON avec `action` :

```json
// Changer un rôle
{ "action": "role", "navKey": "clan.stats-weapons", "role": "member" }

// Réordonner une section
{ "action": "position", "section": "clan-section", "orderedKeys": ["clan.matches", "..."] }

// Renommer un bouton
{ "action": "label", "navKey": "clan.matches", "label": "Parties" }

// Changer la destination d'un bouton nav-primary
{ "action": "target", "navKey": "primary.mon-clan", "targetNavKey": "clan.members" }
```

---

## Hook client `useNavPermissions`

Utilisé par tous les composants de navigation pour charger rôles, positions, libellés et destinations en une seule requête.

- Cache `sessionStorage` avec TTL 5 minutes (clé `nav_permissions_cache`).
- Retourne `{ roles, positions, labels, targets }`.
- En cas d'erreur fetch : retourne des objets vides — les valeurs par défaut du registre s'appliquent.
- `invalidateNavPermissionsCache()` : vide le cache (à appeler après tout PUT réussi).

---

## Page de gestion `/settings/nav-permissions`

Accès : Owner uniquement (redirection sinon).

### Structure

Un panneau par section, dans l'ordre : `nav-primary`, `clan-section`, `member-section`, `admin-menu`, `owner-menu`.

### Chaque carte d'item affiche

- Poignée de drag (6 points) — pour réordonner.
- Badge de position (#N dans la section).
- Compteur N/total.
- Nom de l'item et badge de rôle actuel.
- Badge "Modifié" si le rôle diffère du défaut du registre.
- Route (`hrefTemplate`) en monospace.
- Description de la fonctionnalité.
- Sélecteur de rôle : 5 boutons (`Tous`, `Membre`, `Admin`, `Owner`, `Masqué`). Le défaut du registre est marqué d'un ✦.
- Champ libellé : input texte avec auto-save à la perte de focus.
- Sélecteur de destination (section `nav-primary` uniquement).
- Feedback inline : `✓ Sauvegardé` / `✗ Erreur` (disparaît après 2 s).

### Drag & drop

Implémenté via l'API HTML5 native (`draggable`, `onDragStart`, `onDragEnter`, `onDragEnd`). Pas de librairie externe. La réorganisation est limitée à l'intérieur d'une même section. En cas d'erreur API lors du drop, le feedback s'affiche mais l'ordre local n'est pas rollback (rechargement de page pour réinitialiser).

### Auto-save

- Changement de rôle : PUT immédiat au clic.
- Changement d'ordre : PUT au drop.
- Changement de libellé : PUT au blur (perte de focus).
- Changement de destination : PUT à la sélection.
- Après chaque PUT réussi : `invalidateNavPermissionsCache()`.

---

## Ajouter un nouveau bouton de navigation

1. Ajouter l'entrée dans `NAV_REGISTRY` avec un `navKey` unique, la section, le label, le `hrefTemplate`, le `defaultRole` et la description.
2. Ajouter le lien dans le composant de navigation correspondant (`ClanSectionNav`, `MemberSectionNav`, `SettingsSectionNav`) en utilisant le même `navKey`.
3. Pour les pages admin/owner, inclure `<SettingsSectionNav section="admin-menu" />` (ou `owner-menu`) en haut du `<main>`.
4. La page `/settings/nav-permissions` et l'API découvrent automatiquement le nouvel item.

---

## Limites connues

- Le drag & drop ne fonctionne pas entre sections.
- Pas de rollback de position en cas d'erreur API — rechargement de page requis.
