# Composants de la refonte — fiches

> Spécification : [docs/TODO/refonte-ui.md](../TODO/refonte-ui.md). Maquette validée le 2026-09-26 :
> `docs/ui/refonte/maquettes/Refonte adaptée.html`.

Valeurs relevées sur la maquette. Toutes les couleurs passent par des tokens ; les valeurs ci-dessous sont les valeurs
résolues, à ne pas recopier en dur dans les composants. Les `dark:` existants des pages sont conservés (décision du
2026-09-26) ; les composants de cette fiche n'en ajoutent pas : les tokens gèrent les deux thèmes.

## Tokens à ajouter dans `globals.css`

```css
:root {
  --theme-ui-accent-text: rgb(67 56 202 / 1);          /* indigo-700 */
  --theme-ui-accent-soft: rgb(99 102 241 / 0.08);
  --theme-ui-accent-tint: rgb(99 102 241 / 0.06);      /* colonne triée */
  --theme-ui-accent-ring: rgb(99 102 241 / 0.45);
  --theme-toggle-track: rgb(241 245 249 / 1);
}
:root[data-app-theme='dark'] {
  --theme-ui-accent-text: rgb(224 231 255 / 1);        /* indigo-100 */
  --theme-ui-accent-soft: rgb(129 140 248 / 0.16);
  --theme-ui-accent-tint: rgb(129 140 248 / 0.07);
  --theme-ui-accent-ring: rgb(129 140 248 / 0.5);
  --theme-toggle-track: rgb(2 6 23 / 1);
}

.app-segmented-control { background-color: var(--theme-toggle-track); padding: 3px; gap: 2px; border-radius: 10px; }
.app-segmented-control__item { border-radius: 7px !important; }
.app-segmented-control__item--active {
  background-color: var(--app-surface);
  color: var(--theme-ui-accent-text);
  box-shadow: 0 1px 2px rgb(15 23 42 / .08), inset 0 0 0 1px var(--theme-ui-accent-ring);
}
html[data-app-theme='dark'] .app-segmented-control__item--active { background-color: var(--theme-ui-accent-soft); }
```

`SegmentedControl` perd `bg-blue-600 text-white` (et garde `aria-pressed`) ; `SectionAnchorNav` et la sidebar passent
sur les mêmes tokens (lien actif : fond `--theme-ui-accent-soft`, filet `inset 2px 0 0 var(--theme-ui-accent)`, icône en
accent).

## `RankCell`

`src/components/ui/RankCell.tsx` — `{ rank: number; size?: 'sm' | 'md' }`

- 1 / 2 / 3 → **médaille SVG existante** : `/icons/medal-gold.svg`, `medal-silver.svg`, `medal-bronze.svg`
  (`next/image`, 24 px ; `md` : 30 px), `alt="Rang 1"`… Aucun emoji, pas de pastille `app-podium-badge`.
- ≥ 4 → numéro 12–13 px, `font-semibold`, `--theme-ui-text-muted`, `tabular-nums`, décalé de 6 px.
- Lignes 1–3 teintées comme aujourd'hui (`app-table-row--top1/2/3`).

## `SortableTh` + `useTableSort`

```ts
function useTableSort<K extends string>(initial: K): {
  sortKey: K; sortDir: 'asc' | 'desc'
  onSort: (key: K) => void          // même clé = inversion, sinon desc
  colTint: (key: K) => string       // 'var(--theme-ui-accent-tint)' | 'transparent'
}
```

- `<th>` : 11 px, 600, uppercase, `tracking 0.04em`, `--theme-ui-text-muted` ; actif : `--theme-ui-accent-text`, suffixe
  ` ↓` / ` ↑`.
- `aria-sort="descending|ascending|none"`, rendu comme `<button>` interne pour le focus clavier.
- Teinte de colonne posée sur `<col style={{ background: colTint(key) }}>`.
- Colonne non triable (Top 1) : même style, sans bouton, `title="Victoires (top 1)"`.

## `PodiumCards`

`{ entries: Ranked[]; metricLabel: string; metric: (e) => string }` — grille 3 colonnes, gap 12 px.

- Carte : `.app-panel`, padding 16×18, gap 14.
- Ligne 1 : `RankCell size="md"` (médaille) à gauche, icônes de distinction 20 px à droite.
- Ligne 2 : avatar 40 px (rayon 12, `app-avatar`) · nom 15 px 700 · sous-ligne 12 px muted « 30 matchs · 2,00 K/M » ·
  valeur 24 px 700 `tabular-nums` + libellé 11 px uppercase en accent.
- Mobile : non affiché (la liste porte déjà le rang).

## `DistinctionStrip`

`{ items: { key: DistinctionBadgeKey; memberName: string; value: string }[] }` — icônes et libellés de
`src/lib/distinction-badges.ts`.

- Libellé « Distinctions » 11 px uppercase muted, puis pastilles : hauteur 32, rayon plein, `.app-panel` sans ombre,
  padding 0 12 0 5, icône 22 px, libellé muted, nom 600, valeur 12 px `tabular-nums`.
- Mobile : cartes 132 px en défilement horizontal (icône 20, libellé 11, nom 13/700, valeur 12).

## Bandeau d'image de la page — contenu seulement

**Hauteur inchangée** (`min-h-[10rem] sm:min-h-[13rem]`, rayon 16 px, voile actuel). Seul le bas du bandeau change :

- Titre existant (icône `yellow-400`, blanc).
- Méta : pastille « 24 membres » (fond blanc 14 %, bordure blanc 28 %) · point `emerald-400` 6 px · « Synchronisé le
  21/09 à 22:00 ». Sur mobile, sur une ligne : « 24 membres · synchro 21/09 22:00 ».
- Ces deux informations quittent le bandeau de filtres.

## `DockingToolbar` — slot `dockedAside`

Rendu à droite (`margin-left: auto`), seulement si `isSticky && !compact` : « Tri : **Kills ↓** », 12 px muted, valeur en
accent. Aucun contrôle.

Au repos, chaque groupe de contrôles porte son intitulé (11 px uppercase muted : Période, Type de match, Mode d'escouade) ;
la note du mode « Tous » devient une info-bulle (ⓘ) à côté de « Mode d'escouade ». Intitulés et info-bulle disparaissent
une fois docké (`!isSticky`).

## `MobileRankList`

`{ entries; sortKey; onSortChange; metric; metricLabel }` — visible `< md`, remplace la liste de tuiles.

- Au-dessus : « Trier par » (11 px uppercase) + puces 30 px de haut en défilement horizontal ; **active : mêmes tokens
  que le segmented actif** (fond `--theme-ui-accent-soft`, anneau `--theme-ui-accent-ring`, texte
  `--theme-ui-accent-text`), suffixe ↓.
- Ligne (`<button>`, min 56 px, padding 10×12) : `RankCell` 26 px · nom 14/600 + distinctions 14 px · sous-ligne 12 muted
  · valeur 17/700 + libellé 10 px accent · chevron.
- Dépliée : grille 3 colonnes, gap 6, retrait gauche 52 px ; tuiles `--app-surface-muted`, rayon 8, padding 6×8, libellé
  10 px uppercase, valeur 13/600.
- 8 lignes, puis « Afficher les N autres ».

## Header

**Inchangé** (décision du 2026-09-26) : hauteur actuelle, y compris sur deux lignes à 375 px. Seule correction : la
coquille « RǸduire » de l'info-bulle de repli de la sidebar.
