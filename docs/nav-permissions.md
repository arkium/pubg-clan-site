# Permissions et ordre de navigation

Ce document décrit le système de gestion dynamique des boutons de navigation : niveaux d'accès par rôle, couleurs d'indication, visibilité conditionnelle et ordre d'affichage. Tout est configurable depuis une page owner sans toucher le code.

---

## Vue d'ensemble

Chaque bouton de navigation (section clan, section membre, menu sidebar admin/owner, navigation principale) possède :

- un **rôle minimum requis** pour être visible (`none`, `member`, `admin`, `owner`, `hidden`)
- une **position dans la liste** de sa section
- un **libellé personnalisable**
- une **destination configurable** (boutons `nav-primary` uniquement)
- une **couleur** qui indique visuellement le niveau d'accès

Ces paramètres ont des valeurs par défaut définies dans le code (registre). L'owner peut les surcharger via `/settings/nav-permissions`, les overrides étant stockés en base sans migration Prisma.

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
| Styles CSS des rôles | `src/app/globals.css` |

---

## Registre des items (`NAV_REGISTRY`)

Chaque item est défini une seule fois dans `NAV_REGISTRY` avec les champs :

```typescript
type NavItemDef = {
  navKey: string          // clé unique ex: 'clan.stats-weapons'
  section: NavSection     // 'nav-primary' | 'clan-section' | 'member-section' | 'admin-menu' | 'owner-menu'
  label: string           // libellé par défaut
  hrefTemplate: string    // ex: '/clans/:clanId/stats/weapons'
  defaultRole: NavRole    // valeur par défaut codée en dur
  description: string     // explication courte pour la page de gestion
}
```

Les cinq sections et leur contenu actuel :

| Section | Nb items | Usage |
|---|---|---|
| `nav-primary` | 3 | Boutons principaux sidebar (Dashboard, Mon clan, Mon compte) |
| `clan-section` | 13 | Onglets nav horizontale sous `/clans/[clanId]/` |
| `member-section` | 10 | Onglets nav horizontale sous `/members/[id]/` |
| `admin-menu` | 7 | Liens section nav pour les admins |
| `owner-menu` | 10 | Liens section nav réservés à l'owner |

Pour ajouter un nouveau bouton : ajouter une entrée dans `NAV_REGISTRY` avec un `navKey` unique. Aucune autre modification de fichier n'est nécessaire — la page de gestion et les navigations le découvrent automatiquement.

---

## Les cinq rôles

| Rôle | Valeur | Qui peut voir |
|---|---|---|
| `none` | Tous | Tous les utilisateurs connectés (et visiteurs si pas de garde auth) |
| `member` | Membre | Utilisateurs ayant une session valide |
| `admin` | Admin | Utilisateurs avec `manage_members`, `manage_roles` ou `manage_settings` |
| `owner` | Owner | Utilisateurs avec la permission wildcard `*` |
| `hidden` | Masqué | Personne — le bouton est désactivé **et** invisible pour tous |

La hiérarchie est inclusive : un owner voit tout, un admin voit `admin` + `member` + `none`, etc.
Le rôle `hidden` est orthogonal : il masque le bouton pour tout le monde, y compris l'owner.

Implémentation dans `ClanSectionNav.tsx` :

```typescript
function canAccess(role: NavRole, isOwner: boolean, isAdmin: boolean): boolean {
  if (role === 'hidden') return false
  if (role === 'none' || role === 'member') return true
  if (role === 'admin') return isAdmin
  if (role === 'owner') return isOwner
  return true
}
```

`isOwner = hasWildcard('*')` — `isAdmin = hasWildcard || manage_members || manage_roles || manage_settings`.

---

## Couleurs d'indication visuelle

Les boutons affichent une bordure colorée selon le rôle requis. Cela permet de repérer d'un coup d'œil quels boutons sont réservés sans ouvrir la page de gestion.

| Rôle | Couleur | Classes CSS | Visible par |
|---|---|---|---|
| `none` / `member` | Aucune | `clan-section-nav-link` (base) | Tous |
| `admin` | Rouge | `clan-section-nav-link--admin` / `--admin-active` | Admins+ |
| `owner` | Ambre/doré | `clan-section-nav-link--owner` / `--owner-active` | Owner |
| `hidden` | Gris | (badge `Masqué` en page gestion uniquement) | Personne |

Les tokens CSS correspondants (définis dans `globals.css`) :

```
--theme-admin-nav-border / --theme-admin-nav-bg / --theme-admin-nav-text
--theme-admin-nav-hover-bg / --theme-admin-nav-active-border / --theme-admin-nav-active-bg

--theme-owner-nav-border / --theme-owner-nav-bg / --theme-owner-nav-text
(idem pour hover et active)
```

Ces tokens ont des variantes light et dark via `[data-app-theme='dark']` dans `globals.css`. Ne jamais hardcoder `border-red-400` directement dans les composants — utiliser les classes CSS nommées ci-dessus ou la fonction `getRoleLinkClass()`.

### `getRoleLinkClass(role, active, variant)`

Utilitaire dans `nav-permissions-registry.ts` qui retourne la classe CSS finale :

```typescript
getRoleLinkClass('admin', false, 'section')  // → 'clan-section-nav-link--admin'
getRoleLinkClass('owner', true,  'section')  // → 'clan-section-nav-link--owner-active'
getRoleLinkClass('admin', false, 'submenu')  // → 'clan-submenu-link--admin'
getRoleLinkClass('none',  true,  'section')  // → 'clan-section-nav-link--active'
```

---

## Visibilité conditionnelle

Un bouton dont le `role` est supérieur à ce que l'utilisateur courant peut voir est **masqué** (pas simplement désactivé). Le rôle `hidden` masque le bouton pour tout le monde.

Le filtrage se fait dans chaque composant de navigation avant le rendu :

```typescript
const visibleItems = orderedRaw.filter((item) =>
  canAccess(getItemRole(item.navKey, navRoles.roles), isOwner, isAdmin)
)
```

`getItemRole(navKey, overrides)` retourne l'override DB s'il existe, sinon le `defaultRole` du registre.

Comportements attendus :
- Un membre ordinaire ne voit jamais les boutons `admin` ni `owner`.
- Un admin voit les boutons `admin` mais pas `owner`.
- Un owner voit tout sauf les boutons `hidden`.
- Si un item est masqué pour l'utilisateur courant, il disparaît entièrement de la navigation (pas de placeholder).

---

## Position des boutons

L'ordre d'affichage de chaque section peut être personnalisé depuis la page de gestion. L'ordre est persisté dans `AppConfig` sous la clé `nav_positions` (JSON).

Structure stockée :

```json
{
  "clan-section": ["clan.matches", "clan.stats", "clan.overview", "..."],
  "owner-menu": ["owner.cron", "owner.nav-permissions", "..."]
}
```

Si une section n'a pas d'entrée dans `nav_positions`, l'ordre du `NAV_REGISTRY` est utilisé tel quel.

Application de l'ordre dans `ClanSectionNav` :

```typescript
const sectionOrder = navRoles.positions['clan-section']
const orderedRaw = sectionOrder
  ? [...rawItems].sort((a, b) => {
      const ai = sectionOrder.indexOf(a.navKey)
      const bi = sectionOrder.indexOf(b.navKey)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  : rawItems
```

Un item absent de `sectionOrder` est poussé à la fin (index 999).

---

## Libellés personnalisés

L'owner peut renommer le libellé affiché de n'importe quel bouton. L'override est persisté dans `AppConfig` sous la clé `nav_labels`.

Les composants utilisent le libellé custom si disponible, sinon le défaut du registre :

```typescript
navPerms.labels[item.navKey] ?? item.label
```

Appliqué dans : `MemberSectionNav`, `SettingsSectionNav`, et la navigation principale `ClanNavigation`.

---

## Destinations configurables (`nav-primary`)

Les boutons de la section `nav-primary` (Dashboard, Mon clan) peuvent avoir une **destination personnalisée** choisie parmi les items d'une autre section :

- `primary.dashboard` → destination parmi les items `member-section`
- `primary.mon-clan` → destination parmi les items `clan-section`

L'override est persisté dans `AppConfig` sous la clé `nav_targets`. La valeur est le `navKey` de la destination choisie ; `resolveHref()` remplace ensuite les paramètres (`:clanId`, `:memberId`) au moment du rendu.

---

## Stockage — AppConfig

Quatre clés dans la table `AppConfig` (modèle Prisma existant, pas de migration) :

| Clé | Contenu |
|---|---|
| `nav_permissions` | `Record<navKey, NavRole>` — overrides de rôle uniquement (les défauts ne sont pas stockés) |
| `nav_positions` | `Record<section, string[]>` — ordres personnalisés uniquement (si identique au défaut, supprimé) |
| `nav_labels` | `Record<navKey, string>` — libellés personnalisés uniquement (si vide/défaut, supprimé) |
| `nav_targets` | `Record<navKey, string>` — destinations personnalisées pour les boutons `nav-primary` |

Seules les **surcharges** sont persistées : si l'owner remet un item à son rôle par défaut, l'entrée est supprimée du JSON pour garder le stockage minimal.

---

## API REST

Route : `src/app/api/settings/nav-permissions/route.ts`

### GET `/api/settings/nav-permissions`

Public (pas d'auth requise). Retourne :

```json
{
  "roles":     { "clan.stats-weapons": "owner", "clan.reports": "admin" },
  "positions": { "clan-section": ["clan.matches", "clan.stats", "..."] },
  "labels":    { "clan.matches": "Parties" },
  "targets":   { "primary.mon-clan": "clan.members" }
}
```

Seuls les overrides sont retournés ; les clients appliquent les défauts du registre pour les clés absentes.

### PUT `/api/settings/nav-permissions`

Owner uniquement (`requireRole(['Owner'])`). Corps JSON avec `action` :

**Changer un rôle :**
```json
{ "action": "role", "navKey": "clan.stats-weapons", "role": "member" }
```

**Changer l'ordre d'une section :**
```json
{ "action": "position", "section": "clan-section", "orderedKeys": ["clan.matches", "clan.stats", "..."] }
```

**Changer le libellé d'un bouton :**
```json
{ "action": "label", "navKey": "clan.matches", "label": "Parties" }
```

**Changer la destination d'un bouton nav-primary :**
```json
{ "action": "target", "navKey": "primary.mon-clan", "targetNavKey": "clan.members" }
```

`orderedKeys` doit contenir exactement tous les navKeys de la section (validation côté service).

---

## Hook client `useNavPermissions`

Utilisé par tous les composants de navigation et la page de gestion pour charger rôles, positions, libellés et destinations en une seule requête.

- Cache sessionStorage avec TTL de 5 minutes (clé `nav_permissions_cache`).
- Retourne `{ roles, positions, labels, targets }` (tous `Record<string, string>`).
- En cas d'erreur fetch : retourne `{ roles: {}, positions: {}, labels: {}, targets: {} }` — les défauts du registre s'appliquent.
- `invalidateNavPermissionsCache()` : supprime l'entrée sessionStorage (à appeler après tout PUT pour que la prochaine navigation voie les nouvelles valeurs).

---

## Composant `SettingsSectionNav`

`src/components/SettingsSectionNav.tsx` — barre de navigation horizontale affichée en haut des pages admin et owner.

**Props :** `section: 'admin-menu' | 'owner-menu'`

Comportement :
- Lit `useNavPermissions()` pour l'ordre et les libellés custom.
- Filtre les items masqués (`hidden`) et inaccessibles selon le rôle de l'utilisateur courant.
- Résout les hrefs (`resolveHref`) en remplaçant `:clanId` par le clan sélectionné.
- Détecte l'item actif par correspondance de l'URL courante.
- Mobile : `MobileDropdownNav` (dropdown). Desktop : liens horizontaux avec couleurs de rôle.

Chaque page admin/owner inclut ce composant en haut de son `<main>` :

```tsx
<SettingsSectionNav section="owner-menu" />
```

---

## Navigation sidebar (`ClanNavigation`)

La sidebar affiche **un seul bouton d'entrée** par section admin/owner (au lieu d'une liste complète de liens). Ce bouton pointe vers le premier item accessible de la section selon l'ordre configuré.

Calcul du lien d'entrée :

```typescript
function getFirstSectionHref(section: 'admin-menu' | 'owner-menu', fallback: string): string {
  const items = NAV_REGISTRY.filter(i => i.section === section && i.navKey !== 'owner.switch-clan')
  // tri par nav_positions si défini
  const first = ordered.find(i => {
    if (getItemRole(i.navKey, navPerms.roles) === 'hidden') return false
    if (role === 'owner') return isOwner
    if (role === 'admin') return isAdmin
    return true
  })
  return first ? resolveHref(first.hrefTemplate) : fallback
}
```

La navigation détaillée entre les pages admin/owner est assurée par `SettingsSectionNav` à l'intérieur de chaque page.

---

## Page de gestion `/settings/nav-permissions`

Accessible uniquement aux owners (redirection si non owner). Accessible via le menu owner sidebar « Permissions nav ».

### Structure de la page

Un panneau par section (`nav-primary`, `clan-section`, `member-section`, `admin-menu`, `owner-menu`), chacun affichant :
- Nombre d'items et compteurs de rôles par section.
- Indicateur de sauvegarde de l'ordre (`Sauvegarde… / ✓ Ordre sauvegardé / ✗ Erreur ordre`).
- Liste verticale triée des items (l'ordre est visuellement significatif).

### Chaque carte d'item

- **Poignée de drag** (6 points) à gauche — change de couleur au survol.
- **Badge de position** (`#N` dans un rond) — position absolue dans la section.
- **Compteur** `N / total` en haut à droite.
- **Nom** de l'item + badge de rôle actuel.
- **Badge "Modifié"** si le rôle est différent du défaut du registre.
- **Route** en monospace (hrefTemplate).
- **Description** de la fonctionnalité.
- **Sélecteur de rôle** : 5 boutons (`Tous`, `Membre`, `Admin`, `Owner`, `Masqué`), le bouton actif est coloré, le défaut est marqué d'un ✦.
- **Champ libellé** : input texte pour renommer le bouton (auto-save à la perte de focus).
- **Sélecteur de destination** (section `nav-primary` uniquement) : dropdown pour choisir la page cible parmi les items de la section correspondante.
- **Feedback inline** : `✓ Sauvegardé` / `✗ Erreur` apparaît sur la carte après chaque sauvegarde (disparaît après 2 s).

### Drag & drop

Implémenté avec l'API HTML5 native (`draggable`, `onDragStart`, `onDragEnter`, `onDragEnd`). Pas de librairie externe.

- Deux refs (`draggingKey`, `dragOverKey`) assurent la fiabilité cross-render de la logique.
- Deux états (`draggingKeyState`, `dragOverKeyState`) alimentent uniquement le rendu visuel.
- La carte source s'opacifie pendant le drag. La carte cible reçoit un highlight bleu.
- Au drop : mise à jour optimiste de l'ordre local + appel `PUT` immédiat.
- En cas d'erreur API : le feedback s'affiche mais l'ordre local n'est pas rollback (rechargement de page pour réinitialiser).

### Auto-save

- **Changement de rôle** : PUT déclenché immédiatement au clic. Mise à jour optimiste + rollback au rôle défaut en cas d'erreur.
- **Changement d'ordre** : PUT déclenché au drop.
- **Changement de libellé** : PUT déclenché à la perte de focus (blur).
- **Changement de destination** : PUT déclenché à la sélection.
- Après chaque PUT réussi : `invalidateNavPermissionsCache()` est appelé pour que le prochain chargement de navigation voie les nouvelles valeurs.

---

## Ajouter un nouveau bouton de navigation

1. Ajouter l'entrée dans `NAV_REGISTRY` (`src/lib/nav-permissions-registry.ts`) avec un `navKey` unique, la section, le label, l'hrefTemplate, le defaultRole et la description.
2. Ajouter le lien dans le composant de navigation correspondant (`ClanSectionNav`, `MemberSectionNav`, etc.) en utilisant le même `navKey`.
3. Pour les pages admin/owner : ajouter `<SettingsSectionNav section="admin-menu" />` (ou `owner-menu`) en haut du `<main>` de la page concernée.
4. Aucune modification de la page de gestion, du service, ni de l'API n'est nécessaire.

---

## Limites connues

- Le drag & drop ne fonctionne pas entre sections (on ne peut réordonner que les items d'une même section).
- La page de gestion ne gère pas le rollback de position en cas d'erreur API (l'ordre affiché reste modifié jusqu'au rechargement).
