# Catalogue des composants réutilisables

## Principe

Tous les composants listés ici doivent être importés depuis leurs fichiers respectifs. Ne jamais réécrire leur logique inline dans une page. Ne jamais écrire directement les classes CSS thématiques qu'ils encapsulent (ex : `app-placement-badge--winner`).

Les styles des composants UI sont centralisés dans `src/app/globals.css`.

---

## Composants UI (`src/components/ui/`)

### `SegmentedControl`

Fichier : `src/components/ui/SegmentedControl.tsx`

Rôle : groupe de boutons segmentés pour les filtres de période, les onglets et les sélecteurs de métrique. Remplace les boutons radio visuels.

```typescript
type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string; disabled?: boolean }[]
  value: T
  onChange: (value: T) => void
  size?: 'xs' | 'sm'           // défaut: 'xs'
  wrap?: boolean               // autoriser le retour à la ligne
  fullWidthOnMobile?: boolean  // pleine largeur sur mobile
  className?: string
}
```

Classes CSS internes : `app-segmented-control`, `app-segmented-control__item`, `app-segmented-control__item--active`, `app-segmented-control__item--xs`, `app-segmented-control__item--sm`.

Exemple d'usage :

```tsx
import SegmentedControl from '@/components/ui/SegmentedControl'

<SegmentedControl
  options={[
    { value: 'official', label: 'Officiel' },
    { value: 'all', label: 'Tous' },
  ]}
  value={matchType}
  onChange={setMatchType}
  size="xs"
/>
```

Chaque bouton porte `aria-pressed`. Pour la **période**, ne pas l'utiliser directement : `PeriodFilter` (ci-dessous).
L'option « sans filtre » s'écrit « Tous », ou « Toutes » pour un filtre féminin (carte, catégorie, ville, arme).

---

### `DockingToolbar`

Fichier : `src/components/ui/DockingToolbar.tsx` (export nommé)

Rôle : **le** bandeau de filtres d'une page joueur. Au repos, panneau aligné sur la grille ; au défilement, collé sous
le header sur toute la largeur de la colonne. Règles complètes : `docs/ui/index.html#sticky-toolbar`, décisions :
`docs/TODO/sticky.md`.

```tsx
<DockingToolbar ariaLabel="Filtres du classement" /* dockOnMobile={false} si pas de période */>
  {({ isSticky, compact }) => (
    <div className="flex w-full flex-col gap-3">
      {!isSticky && <p>{/* compteurs, notes : au repos */}</p>}
      <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
      {!compact && <SegmentedControl … />}
    </div>
  )}
</DockingToolbar>
```

- À placer hors de tout conteneur de largeur : page en `div.app-main-flush`, blocs internes en `app-container app-gutter`.
- `variant="card"` réservé à l'administration existante (`settings/members`).
- Attributs de test : `data-docking-toolbar`, `data-docked`, `data-compact`, sentinelle `data-docking-sentinel`.

---

### `PeriodFilter` et `usePagePeriod`

Fichiers : `src/components/ui/PeriodFilter.tsx`, `src/hooks/usePagePeriod.ts`, `src/lib/period.ts`

Rôle : le contrôle de période unique (boutons segmentés, libellés Semaine / Mois / Tous / Mois dernier / Il y a 2 mois,
semaine ISO et mois civils) et la résolution de la période d'une page.

```tsx
const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')
useEffect(() => { if (!ready) return; /* charger */ }, [period, ready])
<PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
```

- L'URL fait foi (`?period=`), puis la mémoire de la visite (`sessionStorage`), puis le défaut. Changer de période
  remplace l'URL par `history.replaceState` (ni rendu serveur, ni remontée) ; `{ serverRendered: true }` pour une page
  rendue côté serveur à partir de `?period=`.
- `useSearchParams` exige une frontière `Suspense` : posée par les layouts `clans/[clanId]` et `members/[id]`.
- Jeux de périodes : `STANDARD_PERIODS` (semaine, mois, tous), `MATCH_PERIODS` (semaine, mois, mois dernier, il y a 2 mois).

---

### `SectionAnchorNav`

Fichier : `src/components/ui/SectionAnchorNav.tsx`

Rôle : liens d'ancre d'une page, rendus comme seconde ligne du `DockingToolbar` (jamais un second élément collant).
Une ligne qui défile horizontalement ; le lien actif suit la lecture et reste visible. Remplace `StickySectionNav`.

---

### `PlacementBadge`

Fichier : `src/components/ui/PlacementBadge.tsx`

Rôle : badge de classement de placement PUBG avec palette de couleurs par palier.

```typescript
type PlacementBadgeProps = {
  placement: number   // valeur numérique du classement
  label?: string      // surcharge du texte affiché (ex: '#2.40' pour une moyenne)
  className?: string
}
```

Logique de paliers :

| Placement | Classe CSS | Signification |
|---|---|---|
| 1 | `app-placement-badge--winner` | Victoire |
| 2 à 5 | `app-placement-badge--top5` | Top 5 |
| 6 à 10 | `app-placement-badge--top10` | Top 10 |
| 11 et plus | `app-placement-badge--default` | Hors top 10 |

Règle : toujours utiliser `PlacementBadge` pour afficher un placement. Ne jamais écrire les classes `app-placement-badge*` directement dans une page ou un autre composant.

Exemple :

```tsx
import PlacementBadge from '@/components/ui/PlacementBadge'

<PlacementBadge placement={1} />
<PlacementBadge placement={3} label="#3.2" />
```

Usages actuels : `MatchHistory`, `SquadMatchList`, `TopPerformers`, `SessionRecap`, pages membres.

---

### `TeamModeBadge`

Fichier : `src/components/ui/TeamModeBadge.tsx`

Rôle : badge du mode d'équipe (Solo/Duo/Trio/Squad) avec icône issue de `public/icons/squads/`.

```typescript
type TeamMode = 'solo' | 'duo' | 'trio' | 'squad'

type TeamModeBadgeProps = {
  mode: TeamMode
  label?: string             // surcharge du texte
  size?: 'xxs' | 'xs' | 'sm'  // défaut: 'xs'
  className?: string
}
```

Helper exporté :

```typescript
// Dérive le mode depuis le nombre de membres d'une équipe
teamModeFromMemberCount(memberCount: number): 'duo' | 'trio' | 'squad'
// 1-2 → duo, 3 → trio, 4+ → squad
```

En taille `xxs`, le label est masqué visuellement (accessible via `sr-only`).

Exemple :

```tsx
import TeamModeBadge, { teamModeFromMemberCount } from '@/components/ui/TeamModeBadge'

<TeamModeBadge mode="squad" size="xs" />
<TeamModeBadge mode={teamModeFromMemberCount(squad.members.length)} />
```

Usages actuels : `SquadMatchList`, `SquadSynergies`, `SessionRecap`, pages map-stats.

---

### `PlayerNameBadge`

Fichier : `src/components/ui/PlayerNameBadge.tsx`

Rôle : pastille compacte affichant le nom d'un joueur. Style centalisé via `app-player-name-badge`.

```typescript
type PlayerNameBadgeProps = {
  name: string
  className?: string
  title?: string   // tooltip (défaut: name)
}
```

Exemple :

```tsx
import PlayerNameBadge from '@/components/ui/PlayerNameBadge'

<PlayerNameBadge name="PlayerXYZ" />
```

Usages actuels : `SquadMatchList` (membres présents dans un match).

---

### `MobileDropdownNav`

Fichier : `src/components/ui/MobileDropdownNav.tsx`

Rôle : menu dropdown mobile pour la navigation de section. Ferme au clic extérieur, à la touche Escape et après sélection d'un item. Utilisé à l'intérieur de `ClanSectionNav` et `MemberSectionNav`.

```typescript
type MobileDropdownNavItem = {
  key: string
  label: string | ReactNode
  href?: string
  onSelect?: () => void
  active?: boolean
  icon?: ReactNode
  role?: 'admin' | 'owner'  // colore la bordure de l'item
}

type MobileDropdownNavVariant = 'default' | 'compact' | 'minimal' | 'danger'

type MobileDropdownNavProps = {
  id: string
  label: string           // libellé affiché au-dessus du trigger
  currentLabel: string    // valeur affichée dans le bouton fermé
  items: MobileDropdownNavItem[]
  leftIcon?: ReactNode
  variant?: MobileDropdownNavVariant    // défaut: 'default'
  visibilityClass?: string              // défaut: 'md:hidden'
  className?: string
}
```

Exemple :

```tsx
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'

<MobileDropdownNav
  id="clan-nav-mobile"
  label="Navigation du clan"
  currentLabel="Matchs"
  items={[
    { key: 'matches', label: 'Matchs', href: '/clans/1/matches', active: true },
    { key: 'stats', label: 'Stats', href: '/clans/1/stats' },
  ]}
  variant="compact"
  visibilityClass="block md:hidden"
/>
```

---

### `WeaponIcon`

Fichier : `src/components/ui/WeaponIcon.tsx`

Rôle : icône d'arme PUBG chargée depuis le CDN PUBG via `weaponIconUrl(id)`. En cas d'erreur de chargement, le composant se masque silencieusement (`return null`).

```typescript
type WeaponIconProps = {
  id: string           // identifiant interne de l'arme (ex: 'Item_Weapon_AK47_C')
  label?: string       // texte alt (défaut: resolveWeaponName(id))
  size?: 'sm' | 'md' | 'lg' | 'xl'  // défaut: 'md'
  className?: string
}
```

Tailles : `sm` = 20×20 px, `md` = 24×24 px, `lg` = 32×32 px, `xl` = 48×48 px.

Applique la classe `pubg-icon-filter` pour adapter l'icône au thème.

Exemple :

```tsx
import WeaponIcon from '@/components/ui/WeaponIcon'

<WeaponIcon id="Item_Weapon_AK47_C" size="lg" />
```

---

### `VehicleIcon`

Fichier : `src/components/ui/VehicleIcon.tsx`

Rôle : icône de véhicule PUBG, identique à `WeaponIcon` mais pour les véhicules. Utilise `vehicleIconUrl(id)` et `resolveVehicleName(id)`.

```typescript
type VehicleIconProps = {
  id: string
  label?: string
  size?: 'sm' | 'md' | 'lg'  // défaut: 'md'
  className?: string
}
```

---

### `MapImage`

Fichier : `src/components/ui/MapImage.tsx`

Rôle : image de carte PUBG chargée depuis `/maps/pubg/{mapKey}.webp`. Se masque en cas d'erreur.

```typescript
type MapImageProps = {
  mapKey: string   // clé technique de la carte (ex: 'Baltic_Main' pour Erangel)
  alt?: string
  className?: string
}
```

Exemple :

```tsx
import MapImage from '@/components/ui/MapImage'

<MapImage mapKey="Baltic_Main" className="h-16 w-24" />
```

> ⚠️ `Erangel_Main` n'a **aucun fichier** dans `public/maps/pubg/` : c'est `Baltic_Main.webp` qui porte Erangel.
> `SquadMatch.mapName` ne contient que des clés techniques, mais pour une clé d'origine incertaine
> (libellé, alias), passer par `mapAssetUrl()` de `@/lib/pubg-assets`, qui renvoie `null` plutôt qu'un 404.

---

### `MapZoomControl`

Fichier : `src/components/ui/MapZoomControl.tsx` — règles partagées dans `src/lib/map-zoom.ts`

Rôle : **contrôle de zoom standard de toutes les cartes interactives** — groupe horizontal `[ − | ⊙ 1× | + ]` ancré en haut à droite. Comportement de référence : `/clans/[clanId]/drop-zones`. Spécification complète (molette, glisser, bornes, placement) : [`docs/ui/index.html#zoom-carte`](index.html#zoom-carte).

```typescript
type MapZoomControlProps = {
  zoom: number
  onZoomChange: (nextZoom: number) => void // palier ±0,5 déjà borné
  onReset: () => void                      // bouton central : carte entière
  max?: number                             // défaut 4 (le replay 2D monte à 8)
  className?: string
}
```

Règles clés :

- paliers additifs de ×0,5, identiques au clic et à la molette (`stepMapZoom`) ;
- molette via écouteur natif `{ passive: false }`, ancrée sous le curseur, `preventDefault()` seulement si le zoom change ;
- glisser uniquement au-delà de ×1, vue bornée à la carte.

Utilisé par `DropZoneMapViewport` (drop zones clan/membre, positions clan, `/settings/map-labels`) et `MatchReplay2D`.

---

### `FilterDropdown`

Fichier : `src/components/ui/FilterDropdown.tsx`

Rôle : sélecteur `<select>` stylisé avec label intégré. Conçu pour les filtres simples (ex : filtre par carte, par période).

```typescript
type FilterDropdownProps = {
  id: string
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
}
```

Exemple :

```tsx
import FilterDropdown from '@/components/ui/FilterDropdown'

<FilterDropdown
  id="map-filter"
  label="Carte"
  value={selectedMap}
  options={[{ value: 'all', label: 'Toutes' }, { value: 'Erangel_Main', label: 'Erangel' }]}
  onChange={setSelectedMap}
/>
```

---

### `AppSelectField`

Fichier : `src/components/ui/AppSelectField.tsx`

Rôle : champ `<select>` avec label intégré, stylisé avec les tokens Tailwind du thème. Similaire à `FilterDropdown` mais avec un style plus formel (formulaires de paramètres).

```typescript
type AppSelectFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
  selectClassName?: string
}
```

---

## Composants de navigation

### `ClanSectionNav`

Fichier : `src/components/ClanSectionNav.tsx`

Rôle : barre de navigation horizontale des sections d'un clan. Affiche les onglets filtrés selon le rôle de l'utilisateur connecté et l'ordre configuré dans les permissions de navigation.

```typescript
type ClanSectionNavProps = {
  clanId: number
}
```

Comportement :

- Desktop (`md:` et plus) : liens horizontaux avec icônes SVG inline.
- Mobile : `MobileDropdownNav` en variant `compact`.
- Filtre les items selon `canAccess(role, isOwner, isAdmin)`.
- Applique l'ordre personnalisé depuis `useNavPermissions().positions['clan-section']`.
- Applique les libellés personnalisés depuis `useNavPermissions().labels`.
- Applique la classe de couleur de rôle via `getRoleLinkClass(role, active, 'section')`.

Items actuels (navKeys) : `clan.challenges`, `clan.stats-weapons-categories`, `clan.overview`, `clan.members`, `clan.matches`, `clan.stats`, `clan.stats-weapons`, `clan.heatmap-kills`, `clan.positions`, `clan.drop-zones`, `clan.awards`, `clan.leaderboard`, `clan.reports`.

Exemple :

```tsx
import ClanSectionNav from '@/components/ClanSectionNav'

<ClanSectionNav clanId={clanId} />
```

---

### `MemberSectionNav`

Fichier : `src/components/MemberSectionNav.tsx`

Rôle : barre de navigation horizontale des sections d'un membre. Affiche optionnellement l'identité du membre (nom, avatar, badge ranked saison).

```typescript
type MemberSectionNavProps = {
  memberId: number
  framed?: boolean             // défaut: true — encadre le bloc avec bordure et fond
  showMemberIdentity?: boolean // défaut: true — affiche le bloc identité (nom, avatar, tier)
}
```

Items actuels (navKeys) : `member.dashboard`, `member.stats`, `member.weapons`, `member.map-stats`, `member.drop-zones`, `member.heatmap`, `member.matches`, `member.rewards`, `member.notifications`, `member.notification-preferences`.

Quand `showMemberIdentity` est `true`, le composant charge `/api/members/{memberId}` et `/api/members/{memberId}/season-stats` pour afficher le nom, l'avatar et le tier ranked de la dernière saison.

---

### `SettingsSectionNav`

Fichier : `src/components/SettingsSectionNav.tsx`

Rôle : barre de navigation horizontale des pages admin ou owner. Chaque page de settings l'inclut en haut de son `<main>`.

```typescript
type Props = {
  section: 'admin-menu' | 'owner-menu'
}
```

Comportement identique à `ClanSectionNav` : filtre, ordre, libellés personnalisés, couleurs de rôle.

---

### `ClanSelector`

Fichier : `src/components/ClanSelector.tsx`

Rôle : sélecteur de clan dans le header de l'application. Permet à l'utilisateur de basculer entre ses clans. Écrit le clan actif dans `localStorage` via `useSelectedClan`.

---

## Composants dashboard et statistiques

Ces composants sont dans `src/components/` et `src/components/dashboard/`. Ils ne sont pas des composants UI génériques mais des blocs métier réutilisés sur plusieurs pages.

| Composant | Fichier | Rôle |
|---|---|---|
| `TopPerformers` | `src/components/TopPerformers.tsx` | Cartes des meilleurs joueurs de la période |
| `Leaderboard` | `src/components/Leaderboard.tsx` | Tableau classement clan avec tri et badges distinctions |
| `LeaderboardStats` | `src/components/LeaderboardStats.tsx` | Résumé stats du classement |
| `SquadSynergies` | `src/components/SquadSynergies.tsx` | Fréquence des équipes jouant ensemble |
| `SquadMatchList` | `src/components/SquadMatchList.tsx` | Liste des matchs d'une squad |
| `SessionRecap` | `src/components/SessionRecap.tsx` | Récapitulatif d'une soirée de jeu |
| `ProgressionChart` | `src/components/dashboard/ProgressionChart.tsx` | Graphe d'évolution d'une métrique |
| `WeaponCategoryPeriodFilter` | `src/components/WeaponCategoryPeriodFilter.tsx` | Filtre période pour les stats armes par catégorie |
| `MemberLifetimeStatsPanel` | `src/components/MemberLifetimeStatsPanel.tsx` | Panneau stats lifetime d'un membre |
| `ItemUsePanel` | `src/components/telemetry/ItemUsePanel.tsx` | Objets consommés : indicateurs, répartition par famille, top objets (cartes mobile + tableau desktop, `ItemIcon`), classement des membres en portée clan. Prop `scope` = `clan` ou `member`. Voir [Objets consommés](../features/objets-consommes.md) |
| `CityInsightsPanel` | `src/components/dashboard/CityInsightsPanel.tsx` | Villes et zones de combat : Top 5 commutable (présence, kills, dégâts, réanimations), ville favorite, évolution 8 semaines, lien préfiltré vers la page Positions. Props `scope` = `clan` ou `member` (ajoute la colonne de comparaison au clan). Voir [Villes et zones de combat](../features/positions-villes.md) |

---

## Métadonnées de distinctions

Fichier : `src/lib/distinction-badges.ts`

Centralise les clés, labels et chemins d'icônes SVG des distinctions joueur.

Clés définies : `top_killer`, `top_damage`, `best_wr`, `mvp`, `best_kpm`.

Assets : `public/icons/distinctions/*.svg`.

Utilisé par `Leaderboard`, `LeaderboardStats`, `PlayerStats`.

---

## Composants Télémétrie Tactique (`src/components/telemetry/`)

### `DamageBodySvg`

Fichier : `src/components/telemetry/DamageBodySvg.tsx` — règles d'usage (données réelles uniquement, `unavailable`, dégâts non localisés) dans `docs/ui/index.html#silhouette-impacts`

Rôle : silhouette anatomique humaine vectorielle (5 zones : `head`, `torso`, `pelvis`, `arms`, `legs`) avec gradient thermique d'impact (neutre, faible, moyen, critique) et tooltips interactifs au survol.

```typescript
type DamageBodySvgProps = {
  damageByZone?: Partial<Record<'head' | 'torso' | 'pelvis' | 'arms' | 'legs', number>>
  hitsByZone?: Partial<Record<'head' | 'torso' | 'pelvis' | 'arms' | 'legs', number>>
  totalDamage?: number
  size?: 'sm' | 'md' | 'lg' | number
  showLabels?: boolean
  showTooltips?: boolean
  interactive?: boolean
  variant?: 'received' | 'dealt'
  unavailable?: boolean        // aucune zone capturée : badge au lieu d'une répartition inventée
  unavailableLabel?: string
}
```

Les zones proviennent de `memberStats[*].bodyZonesDealt` / `bodyZonesTaken` (parser, `LogPlayerTakeDamage`),
agrégées par l'API en `telemetry.squadBodyZones.{dealt, taken}`. Le débriefing affiche les deux silhouettes
côte à côte ; plusieurs instances sur une page sont sûres (identifiants SVG préfixés par `useId`).

### `MatchReplay2D`

Fichier : `src/components/telemetry/MatchReplay2D.tsx`

Rôle : lecteur canvas du replay 2D (onglet « 🎮 Replay 2D » du débriefing) — lecture / vitesse / timeline,
modes de visibilité Escouade / Clans suivis / Global, suivi caméra, zoom standard `MapZoomControl` (×1 à ×8),
avion C-130 animé avec badge de cap, calques persistants (trace complète, atterrissages, éliminations) et accès
rapide « Largage » / `P1…Pn`. Il remplace l'ancien onglet statique « Carte Tactique 2D ».
L'escouade inclut les coéquipiers hors clan (turquoise) ; chaque joueur a des vies successives (mort puis rappel),
un état « à terre » visible, et le journal est filtré selon le mode de visibilité. Les avions de rappel (ambre) ne
sont dessinés que pendant leur survol ; le calque « Largages » affiche les caisses (chute, posée, pillée).
Données : `GET /api/clans/[clanId]/matches/[matchId]/replay` ; détails dans
[`docs/telemetry/replay-trajectories.md`](../telemetry/replay-trajectories.md).

### `WeaponAccuracyBadge`

Fichier : `src/components/telemetry/WeaponAccuracyBadge.tsx`

Rôle : badge d'efficacité balistique et taux de précision au tir `(hitsLanded / shotsFired) * 100` avec paliers compétitifs PUBG et barre de progression optionnelle.

```typescript
type WeaponAccuracyBadgeProps = {
  shotsFired: number
  hitsLanded: number
  weaponName?: string
  size?: 'sm' | 'md'
  showBar?: boolean
}
```

### `MatchCombatTimeline`

Fichier : `src/components/telemetry/MatchCombatTimeline.tsx`

Rôle : journal chronologique des combats découpé par phases de zone, filtres clan/lobby et cartes d'affrontements 1v1 dépliables avec silhouette corporelle intégrée.

---

## Règles de contribution

Pour tout nouveau composant UI réutilisable :

1. Créer le composant dans `src/components/ui/`.
2. Brancher les styles sur des classes thématiques dans `src/app/globals.css`.
3. Ne pas hardcoder de couleurs. Utiliser les classes Tailwind remappées ou les tokens CSS.
4. Vérifier le rendu en thème clair et sombre.
5. Vérifier les états hover, active, disabled.
6. Vérifier le rendu mobile.
7. Ajouter le composant à ce catalogue.
