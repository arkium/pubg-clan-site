# Bandeaux collants et filtre de période — cohérence des pages joueurs

> **Spécification — cadrage validé le 2026-09-25, à implémenter (phase 0 d'abord)**
> *Référence design system : [`docs/ui/index.html#sticky-toolbar`](../ui/index.html#sticky-toolbar) (section 23),
> à mettre à jour par ce chantier (§8)*
> *Destiné à l'équipe de développement.*
>
> Revue contre le code le 2026-09-25 : la première version de ce document tenait les pages existantes pour un
> standard établi. Elles sont en réalité configurées chacune à sa façon, et la période — le premier filtre que le
> joueur manipule — n'a ni le même libellé ni le même sens d'une page à l'autre (§3).

---

## 1. Le besoin

Sur la plupart des pages joueurs, les filtres vivent dans un bloc statique en haut de page : dès que le joueur
descend dans un tableau ou une carte, ils disparaissent, et changer de période oblige à remonter. Le but n'est pas
seulement de les rendre collants, mais que **toutes les pages se comportent, se présentent et s'expriment de la
même façon** : même bandeau, même place, même contrôle de période, mêmes mots, même sens.

---

## 2. Décisions

| Sujet | Décision | Date |
|---|---|---|
| Libellé de l'option « sans limite » de la période | **« Tous »** — jamais « Tout », « All Time » ni « Tous les temps » | 2026-09-25 |
| Sens de « Semaine » et « Mois » | **Calendaire partout** : semaine ISO du lundi 00:00 au dimanche 23:59, mois civil. « Mois dernier » / « Il y a 2 mois » = mois civils précédents. Le calendrier d'activité du joueur s'aligne aussi | 2026-09-25 |
| Contenu du bandeau docké **sur mobile** (< 640 px) | **La période seule.** Une page sans période ne docke rien sur mobile | 2026-09-25 |
| Contenu du bandeau docké sur ordinateur | Les contrôles seulement ; compteurs, dates de mise à jour et notes restent au repos | proposé par cette revue |
| Héro de `/clans` | **N'est plus collant** : la page rejoint le standard (bandeau recherche + tri, rien de docké sur mobile). Conséquence acceptée : l'image du clan survolé n'est plus visible une fois la page défilée | 2026-09-25 |
| Libellés des mois précédents | **« Mois dernier »** et **« Il y a 2 mois »** (valeurs inchangées : `month-1`, `month-2`) | 2026-09-25 |
| Option « sans filtre » de **tous** les filtres | **« Tous »**, accordé en **« Toutes »** quand le filtre est féminin (carte, catégorie, ville, arme, notification) ; jamais « Tout » ni l'anglais | 2026-09-25 (accord précisé par cette revue) |
| Persistance de la période | L'URL fait foi (`?period=`), une mémoire limitée à la visite pré-remplit les pages ouvertes sans paramètre (§4.E) | 2026-09-25 |
| Pages SuperUser | **Non alignées** : elles gardent leur vocabulaire d'exploitation | 2026-09-25 |
| Captures automatisées | **Playwright adopté**, moteurs **Chromium et WebKit** (§7.C) | 2026-09-25 |
| Base de données des tests Playwright | **Aucune base de test** : le serveur local tel que le configure `.env` (mode visiteur, crons coupés) ; tous les appels d'API du navigateur sont interceptés, seules des lectures serveur atteignent la base (§7.C) | 2026-09-25 |
| Workflow GitHub `main_smkclan.yml` (déploiement Azure) | **Obsolète** : la production se déploie par build autonome et systemd (CLAUDE.md, [deployment.md](../ops/deployment.md)) — à supprimer | 2026-09-25 |

Pourquoi le calendaire : c'est ce que calculent déjà tous les agrégats (classements, awards, comparateur,
statistiques de télémétrie, cache des matchs). Quatre API seulement comptent en jours glissants (§3.C). Les
aligner donne un sens unique à « Semaine ». Conséquence assumée : le lundi matin, « Semaine » est presque vide —
c'est déjà le cas aujourd'hui sur la vue d'ensemble et le classement du clan.

---

## 3. État du code au 2026-09-25

### A. Ce qui existe

| Élément | Rôle | Usages |
|---|---|---|
| [`DockingToolbar`](../../src/components/ui/DockingToolbar.tsx) (export nommé) + [`useStickyToolbar`](../../src/hooks/useStickyToolbar.ts) | Bandeau qui se docke sous le header. Détection par sentinelle + `IntersectionObserver` et ref callback (le bug `useRef` + `useEffect` est déjà corrigé dans le hook) | 3 pages |
| [`StickySectionNav`](../../src/components/ui/StickySectionNav.tsx) | Navigation par ancres collante | 3 pages |
| Collants sur mesure | `/clans` (héro + barre de recherche), chronologie de combat, en-tête de tableau d'`overview` | 3 endroits |

Les trois pages qui utilisent `DockingToolbar` ont trois configurations différentes :

| Page | `variant` | Largeur demandée | Position du bandeau | Contenu docké |
|---|---|---|---|---|
| [`/clans/[clanId]/overview`](../../src/app/clans/[clanId]/overview/page.tsx) | `panel` | `app-container` | hors du conteneur | compteur + date + 3 contrôles |
| [`/clans/[clanId]/leaderboard`](../../src/app/clans/[clanId]/leaderboard/page.tsx) | `panel` | `max-w-6xl` | dans `<main className="flex-1">` | compteur + date + 3 contrôles + **un paragraphe de note** |
| [`/clans/[clanId]/settings/members`](../../src/app/clans/[clanId]/settings/members/page.tsx) | `card` (défaut) | `max-w-6xl` (défaut) | hors du conteneur | recherche, tris, actions |

### B. Défauts à corriger avant de généraliser

| # | Défaut | Où | Effet |
|---|---|---|---|
| 1 | La largeur par défaut `max-w-6xl` (72rem) **ne s'applique jamais** : la règle `div.mx-auto { max-width: var(--app-content-max-width) }`, hors couche CSS, l'emporte sur l'utilitaire Tailwind | [globals.css:195](../../src/app/globals.css#L195) | Alignement correct, mais par accident : la vraie grille est `--app-content-max-width` (64rem) |
| 2 | Placé dans `<main className="app-container">` — la structure imposée par le CLAUDE.md —, le bandeau docké ne peut pas s'étendre sur toute la largeur | modèle de la 1re version de ce document | Les références le sortent du conteneur ; les pages cibles ont trois structures `<main>` différentes (§6) |
| 3 | Hauteur du header codée en dur à trois endroits (71/73 px) ; le header passe à la ligne sur écran étroit (`flex-wrap`) ; la prop `topOffsets` déplace la détection mais pas le `top` affiché | [DockingToolbar.tsx](../../src/components/ui/DockingToolbar.tsx), [useStickyToolbar.ts](../../src/hooks/useStickyToolbar.ts), design system | Header sur deux lignes → bandeau partiellement masqué |
| 4 | Les marges du repos (`my-4 sm:my-6`) disparaissent au docking | DockingToolbar | Le contenu remonte d'environ 48 px à la bascule — **à mesurer sur `overview`** |
| 5 | La branche dockée hors `app-container` perd `sm:flex-row` | DockingToolbar | Mise en page différente entre repos et docké |
| 6 | Les menus déroulants n'ont ni hauteur maximale ni défilement | [globals.css:806](../../src/app/globals.css#L806) (`.member-section-nav-mobile-menu`) | Une fois docké, la fin d'un long menu (« Joueur ») devient **inaccessible sur mobile** |
| 7 | `StickySectionNav` se colle à `top-20` / `top-24` (80 / 96 px) sous un header de 71/73 px, avec un style sombre cyan translucide (`text-slate-200`, non remappé par le thème) | [StickySectionNav.tsx](../../src/components/ui/StickySectionNav.tsx) | Un vide sous le header ; un second langage visuel ; contraste en thème clair à vérifier |
| 8 | Les ancres utilisent `scroll-mt-40` (160 px) | pages à `StickySectionNav` | Header + bandeau + navigation dépasseraient 160 px : titres de section masqués |
| 9 | `/clans` a un héro **lui-même collant** (`sticky top-20`), la barre de recherche se colle dessous par un `calc` | [clans/page.tsx:120](../../src/app/clans/page.tsx#L120), [ClanSelector.tsx:337](../../src/components/ClanSelector.tsx#L337) | Un bandeau migré passerait sous le héro — **décidé : le héro n'est plus collant** |
| 10 | Les séparateurs de la chronologie de combat sont `sticky top-2`, sans conteneur défilant trouvé entre eux et la page | [MatchCombatTimeline.tsx:319](../../src/components/telemetry/MatchCombatTimeline.tsx#L319) | Probablement collés sous le header (`z-40`) — **à vérifier** |
| 11 | Le modèle de code à copier de la section 23 utilise `useRef` + `useEffect([])` et les anciens décalages 58/72 px | [docs/ui/index.html](../ui/index.html#sticky-toolbar) | Recopier le modèle réintroduit le bug de la sentinelle derrière un état de chargement |
| 12 | Aucune marge de défilement pour le focus clavier | global | Un élément focalisé peut finir sous les bandeaux (WCAG 2.2, critère 2.4.11) |

Bon modèle à conserver : l'en-tête de tableau collant d'`overview` vit **dans un conteneur défilant**
(`max-h-[48.65rem] overflow-auto`) et ne gêne donc aucune autre couche.

### C. La période n'est pas cohérente

**Libellés** (pages joueurs) :

| Libellé de l'option « sans limite » | Pages |
|---|---|
| « Tous » (cible) | overview, leaderboard, stats, weapons, weapons/categories, items, zone-closures, heatmap-kills, drop-zones (clan et joueur), comparator, members weapons / map-stats / dashboard / matches |
| « Tout » | [stats/positions](../../src/app/clans/[clanId]/stats/positions/page.tsx#L106), [telemetry/opponents](../../src/app/clans/[clanId]/telemetry/opponents/page.tsx#L391), [members heatmap](../../src/app/members/[id]/heatmap/page.tsx#L252) |
| « All Time » | [awards](../../src/app/clans/[clanId]/awards/page.tsx#L40), [clans-leaderboard](../../src/app/clans-leaderboard/page.tsx#L13) |
| « 7 jours » / « 30 jours » à la place de « Semaine » / « Mois » | [members heatmap](../../src/app/members/[id]/heatmap/page.tsx#L240) |

**Sens** — `week` et `month` sont calendaires dans les cinq services d'agrégats (`awards-service`,
`clan-comparator-service`, `period-aggregates`, `stats-calculator`, `matches-cache-service`), mais **glissants
(7 / 30 jours) dans quatre API joueurs**, même quand l'écran affiche « Semaine » :

| API glissante | Page(s) concernée(s) |
|---|---|
| [`/api/members/[id]/matches`](../../src/app/api/members/[id]/matches/route.ts#L19) | Matchs du joueur **et** bloc matchs du tableau de bord (`usePlayerDashboard`) |
| [`/api/clans/[clanId]/encountered-players`](../../src/app/api/clans/[clanId]/encountered-players/route.ts#L27) | Adversaires rencontrés |
| [`/api/members/[id]/activity-heatmap`](../../src/app/api/members/[id]/activity-heatmap/route.ts#L46) | Calendrier d'activité |
| [`/api/clans/[clanId]/bot-stats`](../../src/app/api/clans/[clanId]/bot-stats/route.ts#L15) | Statistiques du clan (section bots) — alors que le reste de la même page est calendaire |

`squad-detector` compte aussi en glissant, mais sa route (`squad-analysis`) n'a aucun appelant.

**Contrôle** — boutons segmentés presque partout, mais menu déroulant sur les armes (clan et joueur) et le
calendrier d'activité. **Types** — une dizaine d'alias pour la même notion (`TelemetryPeriod`, `SquadPeriod`,
`LeaderboardPeriod`, `AwardPeriod`, `ZonePeriod`, `ItemUsePeriod`, `HeatmapPeriod`, `DashboardPeriod`…), et cinq
implémentations du calcul de la semaine ISO.

**Mois précédents** — « Mois-1 » / « Mois-2 » dans les options de
[telemetry/matches](../../src/app/clans/[clanId]/telemetry/matches/page.tsx#L75), le libellé de
[clans/[clanId]/matches](../../src/app/clans/[clanId]/matches/page.tsx#L31) et, en minuscules, dans
[SquadMatchList](../../src/components/SquadMatchList.tsx#L31) : à renommer « Mois dernier » / « Il y a 2 mois ».

**Autres filtres** — un seul « Tout » subsiste hors période sur les pages joueurs : le type de match des
[awards](../../src/app/clans/[clanId]/awards/page.tsx#L45). Les « Toutes » des cartes, catégories, villes, armes et
notifications sont déjà correctement accordés.

**Hors périmètre, par décision** : les pages SuperUser gardent leur vocabulaire d'exploitation (Observatoire
« 7 jours / 30 jours / Tous les temps » en glissant, récupérations de télémétrie `7d` / `30d`).

---

## 4. Le standard cible

### A. Un seul bandeau de page

- **Un seul réglage.** `DockingToolbar` prend pour défauts `variant="panel"` et la grille `app-container` ; une page
  joueur n'en change jamais. La variante `card` reste réservée à l'administration existante (`settings/members`).
- **Place dans la page.** Le bandeau est un enfant direct de la colonne de contenu, **hors** de tout conteneur de
  largeur, pour pouvoir s'étendre sur toute la colonne une fois docké (à droite de la barre latérale sur
  ordinateur). Squelette d'une page à bandeau :

  ```tsx
  <main className="app-main space-y-6">          {/* pleine largeur : pas d'app-container ici */}
    <div className="app-container">{/* fil d'Ariane, en-tête de page */}</div>
    <DockingToolbar>{({ isSticky }) => (/* voir « Contenu » */)}</DockingToolbar>
    <div className="app-container space-y-6">{/* tableaux, cartes, graphiques */}</div>
  </main>
  ```

  La règle du CLAUDE.md (`main.app-container app-main`) devient : *pages sans bandeau* inchangées ; *pages à
  bandeau* : `main.app-main` pleine largeur, blocs internes en `app-container`.
- **Contenu, une seule arborescence.** `children({ isSticky })` : les contrôles sont toujours rendus au même endroit
  (jamais démontés : un champ de recherche garde son focus pendant la bascule) ; compteurs, dates et notes sont
  rendus seulement au repos (`{!isSticky && …}`). Sur mobile, en mode docké, tout ce qui n'est pas la période est
  masqué par une classe dédiée du composant. Une page sans période ne docke pas sur mobile.
- **Hauteur du header en variable CSS.** `--app-header-height`, tenue à jour par le header (`ResizeObserver`),
  utilisée à la fois par le `top` du bandeau, par la détection du hook et par les marges de défilement. Fin des
  valeurs 71/73 en dur ; la prop `topOffsets` disparaît.
- **Pas de saut.** La hauteur occupée au repos est réservée pendant le docking (ou les marges sont rendues
  identiques), pour que le contenu ne remonte pas à la bascule. À valider sur `overview` avant la phase 1.
- **Règles inchangées** de la section 23 : sentinelle + `IntersectionObserver` (pas d'écoute du défilement pour
  la détection), jamais de `border-y` ni de `border-t` sur le bandeau docké, bascule instantanée sans transition
  géométrique, contenu intérieur aligné sur la grille (`app-container`, 64rem).

### B. Une seule couche collante sous le header

- **Header, puis au plus un bandeau.** Une page ne superpose jamais deux éléments collants.
- **Les ancres vont dans le bandeau.** Sur les pages qui ont aussi une navigation par ancres (armes du joueur,
  statistiques du clan, catégories d'armes), les liens deviennent une seconde ligne du bandeau sur ordinateur ;
  `StickySectionNav` ne reste autonome que sur une page sans bandeau, collée à `var(--app-header-height)`, avec le
  style `panel`.
- **Marges de défilement.** `--app-sticky-offset` = hauteur du header + hauteur du bandeau docké. Elle alimente
  `scroll-padding-top` (focus clavier, ancres) et remplace les `scroll-mt-40` en dur.
- **Tableaux.** Un en-tête de tableau collant vit dans un conteneur défilant (modèle `overview`), jamais contre la
  page.
- **Superposition** : header `z-40`, bandeau `z-30`, menus ouverts dans le bandeau `z-60` (dans son contexte),
  en-têtes de tableau `z-10`.

### C. Un seul contrôle de période

- **`src/lib/period.ts`** : type `Period` (`'week' | 'month' | 'all'`, plus `'month-1' | 'month-2'` pour les pages de
  matchs), options et libellés (`Semaine`, `Mois`, `Tous`, `Mois dernier`, `Il y a 2 mois`), et **un calcul
  calendaire unique** des bornes (semaine ISO, mois civil, mois précédents), dans le même fuseau que les agrégats
  existants (heure du serveur). Il expose aussi la résolution de la période d'une page (§4.E), en fonction pure.
- **`PeriodFilter`** (`src/components/ui/PeriodFilter.tsx`) : boutons segmentés à toutes les tailles d'écran, avec
  retour à la ligne (`wrap`) si les options ne tiennent pas — à vérifier à 375 px pour les quatre options des pages
  de matchs. Le menu déroulant n'est plus utilisé pour la période.
- **Aligner les quatre API glissantes** (§3.C) sur le calcul calendaire.
- **Renommer** « Tout », « All Time », « 7 jours », « 30 jours », « Mois-1 » et « Mois-2 » (§3.C).
- **Option « sans filtre » des autres filtres** : « Tous », ou « Toutes » pour un filtre féminin (carte, catégorie,
  ville, arme, notification). La forme longue (« Toutes les villes ») reste permise quand le filtre n'a pas de
  libellé visible.
- Les cinq calculs existants de la semaine ISO convergeront plus tard vers `src/lib/period.ts` : ils produisent des
  clés de cache (`week-2026-39`), à migrer avec précaution, hors de ce chantier.

### D. Menus déroulants

`.member-section-nav-mobile-menu` reçoit une hauteur maximale (de l'ordre de `min(60vh, 24rem)`) et un défilement
interne. **Préalable** à tout docking d'un menu déroulant (catégorie, carte, joueur).

### E. Persistance de la période — *confirmée le 2026-09-25*

Aujourd'hui, une page est démontée quand on la quitte (`cacheComponents` n'est pas activé dans `next.config`) : la
période choisie est perdue à chaque navigation, sauf sur le parcours des matchs, qui transmet déjà `?period=` de la
liste à la soirée, au match et au débriefing (le comparateur le lit aussi).

- **L'URL fait foi pour la page** (`?period=month`) : un lien partagé montre exactement la même période ; le bouton
  retour et le rechargement la conservent.
- **Une mémoire limitée à la visite** (`sessionStorage`) pré-remplit la période quand le joueur arrive sur une page
  **sans** paramètre (menu latéral, navigation de section).
- **Ordre de priorité** : URL, puis mémoire de la visite, puis défaut de la page. Une valeur que la page ne propose
  pas (par exemple `all` sur les matchs du clan) est ignorée.
- **Changer de période** : `router.replace('?period=…', { scroll: false })` — pas d'entrée d'historique à chaque clic,
  pas de remontée de la page (option documentée dans `node_modules/next/dist/docs`, `use-router.md`) — et mise à
  jour de la mémoire.
- **Un seul point d'entrée** : un hook `usePagePeriod(options, défaut)` (lecture de `useSearchParams` sous
  `Suspense`, piège n° 5 du CLAUDE.md). Il signale quand la période est résolue, pour que la page ne charge pas ses
  données deux fois (défaut, puis période mémorisée). La résolution elle-même est une fonction pure de
  `src/lib/period.ts`, testable.

Pourquoi pas l'une ou l'autre seule : l'URL seule obligerait à ajouter `?period=` à tous les liens internes (fragile) ;
la mémoire seule afficherait, sur un lien partagé, la période du destinataire. Pourquoi une mémoire de visite plutôt
que permanente (`localStorage`) : en revenant le lendemain, le joueur retrouve la semaine en cours plutôt qu'un
réglage oublié.

---

## 5. Plan par phases

Chaque phase se livre avec ses tests et sa documentation (§7, §8). Les priorités de l'inventaire (§6) sont les
phases : il n'y a pas d'autre échelle.

### Phase 0 — Fondations (aucune page migrée)

1. `DockingToolbar` : défauts `panel` / `app-container`, contenu au repos / docké / docké mobile, variable
   `--app-header-height`, anti-saut, même mise en page dans les deux états.
2. Header : publication de `--app-header-height` ; `--app-sticky-offset` et `scroll-padding-top` globaux.
3. `StickySectionNav` : `top` sur la variable, style `panel` ; les pages concernées l'intègrent au bandeau quand elles
   migrent.
4. Menus déroulants : hauteur maximale et défilement.
5. Période : `src/lib/period.ts`, `PeriodFilter`, `usePagePeriod` (§4.E), les quatre API alignées sur le
   calendaire, les libellés renommés sur toutes les pages — période, mois précédents et option « sans filtre » des
   autres filtres —, y compris celles qui ne dockent qu'en phase 2 ou 3.
6. Chronologie de combat : vérifier dans un navigateur, corriger le `top` si les séparateurs passent sous le header.
7. Réaligner les références : `overview` et `leaderboard` passent au contenu docké « contrôles seulement » (la note du
   classement reste au repos) et à la grille `app-container`.
8. Playwright (§7.C) : installation (Chromium, WebKit), interception de toutes les API du navigateur avec blocage des
   appels imprévus, premiers tests sur les deux pages de référence.
9. Documentation (§8) et test de conformité (§7), avec ses listes d'exceptions de départ.

### Phase 1 — Pages les plus consultées

`/clans/[clanId]/stats/weapons`, `ItemUsePanel` (objets du clan et du joueur), `/clans-leaderboard`,
`/members/[id]/matches`, `/members/[id]/weapons`, `/clans/[clanId]/matches`.

### Phase 2 — Cartes, espaces tactiques et comparaisons

- Clan : `/clans/[clanId]/stats/positions`, `…/stats/zone-closures`, `…/stats/heatmap-kills`, `…/drop-zones`,
  `…/stats/weapons/categories`, `…/telemetry/opponents` ;
- Joueur : `/members/[id]/map-stats`, `…/heatmap`, `…/drop-zones` ;
- Global : `/clans/comparator`.

### Phase 3 — Le reste

- Clan : `/clans/[clanId]/awards`, `…/members`, `…/stats`, `…/telemetry/matches`, `…/challenges`,
  `…/matches/session/[date]`, la page télémétrie d'un match (`…/telemetry/matches/[matchId]/telemetry`) ;
- Joueur : `/members/[id]/stats`, `…/nemesis`, `…/dashboard`, `…/notifications` ;
- Global : `/clans` (héro rendu statique, barre de recherche en `DockingToolbar`), `/tournaments`,
  `/tournaments/[tournamentId]`.

---

## 6. Inventaire des pages joueurs

« Écart à corriger » ne liste que les écarts **vérifiés** de libellé, de sens ou de type de contrôle (§3.C) ; ils
sont tous corrigés en phase 0, indépendamment du docking. « Docké mobile » applique la décision du §2.

### A. Clan (`/clans/[clanId]/*`)

| Route | Filtres | Collant aujourd'hui | Écart période | Docké mobile | Phase |
|---|---|---|---|---|---|
| `overview` | Période, type de match, mode d'équipe | ✅ bandeau (référence à réaligner) | — | Période | 0 |
| `leaderboard` | Période, type de match, mode d'équipe | ✅ bandeau (largeur, note dockée) | — | Période | 0 |
| `stats/weapons` | Période, catégorie, joueur, tri (menus déroulants) | ❌ | menu déroulant | Période | 1 |
| `stats/items` (`ItemUsePanel`) | Période | ❌ | — | Période | 1 |
| `matches` | Période (Semaine, Mois), mode de jeu | ❌ | libellé « Mois-1 » | Période | 1 |
| `stats/positions` | Période, carte, phase, joueur | ❌ | « Tout » | Période | 2 |
| `stats/zone-closures` | Période, carte, joueur, phase | ❌ | — | Période | 2 |
| `stats/heatmap-kills` | Période, carte | ❌ | — | Période | 2 |
| `drop-zones` | Période, affichage, carte, joueur | ❌ | — | Période | 2 |
| `stats/weapons/categories` | Période + ancres de catégories | ⚠️ ancres seules (`top-20`) | — | Période | 2 |
| `telemetry/opponents` | Période, recherche | ❌ | « Tout » + sens glissant | Période | 2 |
| `awards` | Période, type de match, rafraîchir | ❌ | « All Time » (période), « Tout » (type de match) | Période | 3 |
| `members` | Tri A-Z / Z-A | ❌ | — | rien | 3 |
| `stats` | Ancres + période du style de jeu | ⚠️ ancres seules (`top-20`) | bots en sens glissant | Période | 3 |
| `telemetry/matches` | Période (Semaine, Mois, Mois-1, Mois-2) | ❌ | « Mois-1 / Mois-2 » | Période | 3 |
| `challenges` | Onglets de statut | ❌ | — | rien | 3 |
| `matches/session/[date]` | Jour précédent / suivant | ❌ | — | rien | 3 |
| `telemetry/matches/[matchId]/telemetry` | 1 contrôle (page de 2 000 lignes) | ❌ | — | rien | 3 |
| `telemetry/matches/[matchId]/debrief` | — | ⚠️ chronologie `sticky top-2` | — | — | 0 (vérification) |

### B. Joueur (`/members/[id]/*`)

| Route | Filtres | Collant aujourd'hui | Écart période | Docké mobile | Phase |
|---|---|---|---|---|---|
| `matches` (`MatchHistory`) | Date, période, tris | ❌ | sens glissant | Période | 1 |
| `weapons` | Période, catégorie (menus déroulants) + ancres | ⚠️ ancres seules (`top-24`) | menu déroulant | Période | 1 |
| `items` (`ItemUsePanel`) | Période | ❌ | — | Période | 1 |
| `map-stats` | Portée, période, joueur | ❌ | — | Période | 2 |
| `heatmap` | Portée, période, carte (menus déroulants) | ❌ | « 7 jours / 30 jours / Tout » + sens glissant + menu déroulant | Période | 2 |
| `drop-zones` | Portée, période, carte, joueur, affichage | ❌ | — | Période | 2 |
| `stats` | Saison / Ranked, rafraîchir | ❌ | — | rien | 3 |
| `nemesis` | Arme | ❌ | — | rien | 3 |
| `dashboard` | Période de comparaison ; bloc matchs | ❌ | bloc matchs en sens glissant | Période | 3 |
| `notifications` | 5 contrôles de filtre | ❌ | — | rien | 3 |

### C. Pages globales

| Route | Filtres | Collant aujourd'hui | Écart période | Docké mobile | Phase |
|---|---|---|---|---|---|
| `/clans-leaderboard` | Période, tri | ❌ | « All Time » | Période | 1 |
| `/clans/comparator` | Période | ❌ | — | Période | 2 |
| `/clans` | Tri, recherche | ⚠️ héro collant (à rendre statique) + barre `top-[calc(…)]` | — | rien | 3 |
| `/tournaments` | Recherche, statut, format | ❌ | — | rien | 3 |
| `/tournaments/[tournamentId]` | Granularité | ❌ | — | rien | 3 |

**Sans filtre, non concernées** : `/clans/[clanId]/tournaments`, `…/challenges/[challengeId]`,
`…/members/pending`, `/clans/mutations`, `/members/[id]/rewards`, `…/notification-preferences`, `/account`,
`/members`, et les pages de redirection (`/clans/[clanId]/matches/[matchId]/telemetry`,
`/tournaments/[tournamentId]/matches/[matchId]`).

**Hors périmètre (outils d'administration)** : `/clans/[clanId]/settings/*`, `…/telemetry/dashboard`,
`…/telemetry/errors`, `…/telemetry/recoveries`, `…/telemetry/sync-batch-manual`, `/members/add`,
`/members/manage` et `/settings/*`. Ils adopteront le composant standard s'ils ajoutent un bandeau, sans être
migrés par ce chantier.

**Structures `<main>` des pages de phase 1** — trois différentes, à ramener au squelette du §4.A :
`mx-auto max-w-6xl` (armes et matchs du clan), `app-container app-main` (objets, armes du joueur, classement
général), et **aucune largeur maximale** pour les matchs du joueur (`app-page-surface px-4`).

---

## 7. Tests

Vitest tourne en Node et ne collecte que `src/lib/**/*.test.ts` : il ne rend aucun composant. Le rendu est donc
vérifié par Playwright (§7.C), à installer en phase 0 ; le dépôt n'a aujourd'hui ni jsdom, ni Testing Library, ni
Playwright.

### A. Automatisés

| Fichier | Contenu |
|---|---|
| `src/lib/period.test.ts` | Bornes calendaires : lundi 00:00 et dimanche 23:59 dans la semaine, lundi 00:00 suivant hors ; changement de mois et d'année pour `month`, `month-1`, `month-2` ; `all` sans borne ; libellés (`Tous`, `Mois dernier`, `Il y a 2 mois`) ; résolution de la période d'une page (URL, puis mémoire, puis défaut ; valeur non proposée ignorée) |
| Tests de contrat des quatre API alignées | Les bornes transmises à Prisma sont calendaires (date de référence figée) — dans `src/lib/*-route-contracts.test.ts` |
| `src/lib/ui-conformance.test.ts` | Test statique qui lit les sources et garantit la cohérence dans le temps (détails ci-dessous) |

Le test de conformité vérifie :
1. que chaque page d'une **liste déclarée** (les pages à filtres du §6) utilise `DockingToolbar`, directement ou par
   un composant partagé (`ItemUsePanel`…) ;
2. qu'aucune page ne définit ses propres options de période, et qu'aucun libellé « Tout », « All Time »,
   « 7 jours », « 30 jours », « Mois-1 » ou « Mois-2 » n'apparaît dans une page joueur, quel que soit le filtre ;
3. qu'aucun `sticky top-20`, `top-24`, `top-2` ou `top-[calc(…)]` n'apparaît hors des composants de `ui/` ;
4. que `DockingToolbar` ne contient ni `border-y`, ni `border-t`, ni `transition-all` sur son état docké ;
5. qu'aucun composant n'écoute `window` `scroll` pour se docker (`StickySectionNav`, qui l'écoute pour son lien
   actif, est une exception nommée) ;
6. que chaque page qui affiche `PeriodFilter` obtient sa période par `usePagePeriod`, sans état de période local.

Les points 1 à 3 et 6 démarrent avec une **liste d'exceptions** (les pages pas encore migrées) qui rétrécit à chaque
phase : le test passe dès la phase 0 et interdit immédiatement toute nouvelle divergence.

### B. Recette manuelle — à chaque page migrée

Largeurs 375, 768 et 1 280 px ; thèmes clair et sombre.

- [ ] Le bandeau se docke sous le header **sans vide** ni ligne parasite, et **sans saut** du contenu.
- [ ] Contenu docké : contrôles seulement sur ordinateur, **période seule** sur mobile ; rien sur mobile pour une page
      sans période.
- [ ] Alignement : les contrôles restent sur la grille des cartes et tableaux (64rem).
- [ ] Un long menu déroulant ouvert depuis le bandeau docké se parcourt jusqu'au bout, sur mobile.
- [ ] Au clavier, aucun élément focalisé ne disparaît sous le header ou le bandeau.
- [ ] Une ancre amène son titre juste sous le bandeau, pas dessous.
- [ ] Header sur deux lignes (écran étroit, nom de clan long) : le bandeau reste entièrement visible.
- [ ] Une seule couche collante sous le header.
- [ ] Changer de période ne fait pas remonter la page, et met `?period=` dans l'URL.
- [ ] Une page ouverte depuis le menu reprend la période choisie pendant la visite ; un lien partagé, le rechargement
      et le bouton retour conservent la période.
- [ ] Cohérence : « Semaine » couvre la même plage (depuis lundi) sur la vue d'ensemble, les matchs du joueur et le
      calendrier d'activité.

### C. Playwright — décidé le 2026-09-25

**Installation (phase 0).** `@playwright/test` en dépendance de développement ; moteurs **Chromium** et **WebKit**
(`npx playwright install chromium webkit`). WebKit, avec le profil iPhone de Playwright, approche le comportement de
Safari sur iPhone (éléments collants, flou d'arrière-plan) : une approximation, pas un iPhone réel. Configuration
`playwright.config.ts` à la racine (fichier de configuration, autorisé à la racine) ; tests dans `e2e/`, que Vitest ne
collecte pas, et inversement. Scripts `test:e2e` et `test:e2e:update`, distincts de `test:telemetry` (Vitest).

**Environnement — sans base de test.** Le serveur local tourne tel que le configure `.env` : **mode visiteur**
(`DISABLE_AUTH_PERMISSIONS="true"`), crons coupés, base distante. Playwright le lance (`webServer`) ou réutilise
`npm run dev` s'il tourne déjà (`reuseExistingServer`).
- **Tous les appels d'API du navigateur sont interceptés** (`page.route('**/api/**')`) par des réponses figées ; un
  appel sans réponse prévue est **bloqué et fait échouer le test**. Aucun test ne peut donc écrire en base, et les
  captures restent stables malgré les dates relatives et les compteurs.
- Seules les lectures du rendu serveur atteignent la base, vérifiées le 2026-09-25 : l'état d'installation
  (`getSetupState`, trois lectures ; il n'écrit que si l'état d'installation change, ce qui n'arrive pas en
  fonctionnement normal) ; sans cookie, la session n'est pas lue.
- Le mode visiteur ouvre toutes les pages sauf `/account` et `/settings` ([proxy.ts](../../src/proxy.ts)) : toutes
  les pages joueurs du chantier sont accessibles sans connexion.
- La base distante doit être joignable, comme pour `npm run dev`.

Une base de test dédiée ne deviendrait nécessaire que pour des tests qui exercent de vraies écritures, hors de ce
chantier.

**Ce que vérifient les tests** — assertions géométriques d'abord, plus robustes que les captures :
- après défilement, le haut du bandeau touche le bas du header (à 1 px près) et le bandeau couvre la colonne de
  contenu ;
- un repère du contenu ne bouge pas de plus de 2 px à la bascule (pas de saut) ;
- sur mobile docké, seule la période est visible ;
- un long menu ouvert depuis le bandeau docké se fait défiler jusqu'à son dernier élément ;
- au clavier, aucun élément focalisé n'est recouvert (test par `elementFromPoint` au centre de l'élément) ;
- une ancre amène le titre de sa section sous le bandeau ;
- persistance : `?period=` dans l'URL sans remontée, période reprise sur une page ouverte depuis le menu, conservée
  au rechargement et au retour ;
- sur le profil iPhone (WebKit), le bandeau reste collé sous le header et lisible pendant le défilement ;
- captures `toHaveScreenshot()` des états repos, docké et menu ouvert, à 375, 768 et 1 280 px, en thèmes clair et
  sombre (thème posé dans `localStorage` avant le chargement), textes variables masqués.

**Captures de référence.** Générées et comparées sur le même système : le rendu des polices diffère entre Windows et
Linux. Si les tests passent un jour en intégration continue, y générer les captures dans l'image Docker officielle de
Playwright.

**Quand.** Phase 0 : les deux pages de référence. Chaque page migrée ajoute ensuite ses tests, et chaque phase se
clôt sur une exécution complète.

---

## 8. Documentation

| Document | Mise à jour | Phase |
|---|---|---|
| [docs/ui/index.html §23](../ui/index.html#sticky-toolbar) | Remplacer le modèle à copier par l'usage du composant ; grille `app-container` (64rem) ; variable de hauteur du header ; règles du §4 (contenu docké, mobile, couche unique, ancres, menus) | 0 |
| [docs/ui/components.md](../ui/components.md) | Exemple `SegmentedControl` : « Tout » → « Tous » ; entrées `DockingToolbar`, `PeriodFilter`, `StickySectionNav` | 0 |
| [CLAUDE.md](../../CLAUDE.md) | Tableau « Composants UI partagés » : `DockingToolbar`, `PeriodFilter`, `StickySectionNav` ; « Checklist nouvelle page » : bandeau si filtres, période via `PeriodFilter` et `usePagePeriod` ; structure `main.app-main` des pages à bandeau (§4.A) ; scripts `test:e2e` / `test:e2e:update` et règle « tout appel d'API du navigateur est intercepté, aucun test n'écrit en base » | 0 |
| `docs/ops/tests-e2e.md` (nouveau) | Prérequis (mode visiteur, base distante joignable), réponses figées et blocage des appels imprévus, lancer Playwright, régénérer les captures de référence | 0 |
| [docs/features/member-dashboard.md](../features/member-dashboard.md) (lignes 139 et 270), [matches.md](../features/matches.md) (ligne 217) | Les fenêtres glissantes deviennent calendaires | 0 |
| [docs/features/awards.md](../features/awards.md) (ligne 136) | « All Time » → « Tous » ; type de match « Tout » → « Tous » | 0 |
| Ce document | Colonne « Collant aujourd'hui » et phase de chaque page mises à jour à chaque livraison | chaque phase |

---

## 9. Critères de fin

- Toutes les pages du §6 docken selon le §4, ou figurent en exception justifiée.
- `src/lib/period.ts` est la seule source des options et des bornes de période des pages joueurs.
- Le test de conformité passe **sans liste d'exceptions**.
- Les tests Playwright passent sur toutes les pages migrées.
- La section 23 du design system décrit le composant, sans modèle à recopier.

---

## 10. Questions

**Toutes tranchées le 2026-09-25** (détail au §2) : héro de `/clans` non collant ; « Mois dernier » / « Il y a 2
mois » ; « Tous » étendu à tous les filtres (accordé en « Toutes ») ; persistance confirmée (URL + mémoire de visite) ;
pages SuperUser non alignées ; Playwright avec Chromium et WebKit, sans base de test ; workflow Azure obsolète.

Action hors chantier, signalée dans [todo.md](todo.md) : supprimer le workflow obsolète
[main_smkclan.yml](../../.github/workflows/main_smkclan.yml). Il se déclenche encore à chaque push sur `main` et tente
un déploiement vers une Web App Azure qui ne sert plus.
