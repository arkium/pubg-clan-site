# Composants de la refonte — fiches

Valeurs relevées sur les maquettes 2b (sombre) et 3a–3d (clair, mobile). Toutes les couleurs passent par des tokens ;
les valeurs hexadécimales ci-dessous sont les valeurs résolues, à ne pas recopier en dur.

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
  --theme-ui-accent-text: rgb(224 231 255 / 1);
  --theme-ui-accent-soft: rgb(129 140 248 / 0.16);
  --theme-ui-accent-tint: rgb(129 140 248 / 0.07);
  --theme-ui-accent-ring: rgb(129 140 248 / 0.5);
  --theme-toggle-track: rgb(2 6 23 / 1);
}

.app-segmented-control { background-color: var(--theme-toggle-track); padding: 3px; gap: 2px; border-radius: 10px; }
.app-segmented-control__item { border-radius: 7px !important; }
.app-segmented-control__item--active {
  background-color: var(--app-surface);                 /* sombre : var(--theme-ui-accent-soft) */
  color: var(--theme-ui-accent-text);
  box-shadow: 0 1px 2px rgb(15 23 42 / .08), inset 0 0 0 1px var(--theme-ui-accent-ring);
}
html[data-app-theme='dark'] .app-segmented-control__item--active { background-color: var(--theme-ui-accent-soft); }
```

## `RankCell`

`src/components/ui/RankCell.tsx` — `{ rank: number; size?: 'sm' | 'md' }`

- 1 / 2 / 3 → `<span class="app-podium-badge app-podium-badge--gold|silver|bronze">#1</span>` (10 px, padding 3×7 ; `md` : 11 px, 3×9).
- ≥ 4 → numéro 12 px, `font-semibold`, `--theme-ui-text-muted`, `tabular-nums`, décalé de 6 px.

## `SortableTh` + `useTableSort`

```ts
function useTableSort<K extends string>(initial: K): {
  sortKey: K; sortDir: 'asc' | 'desc'
  onSort: (key: K) => void          // même clé = inversion, sinon desc
  colTint: (key: K) => string       // 'var(--theme-ui-accent-tint)' | 'transparent'
}
```

- `<th>` : 11 px, 600, uppercase, `tracking 0.04em`, `--theme-ui-text-muted` ; actif : `--theme-ui-accent`, suffixe ` ↓` / ` ↑`.
- `aria-sort="descending|ascending|none"`, rendu comme `<button>` interne pour le focus clavier.
- Teinte de colonne posée sur `<col style={{ background: colTint(key) }}>`.
- Colonne non triable (Top 1) : même style, sans bouton, `title="Victoires (top 1)"`.

## `PodiumCards`

`{ entries: Ranked[]; metricLabel: string; metric: (e) => string }` — grille 3 colonnes, gap 12 px.

- Carte : `.app-panel`, padding 16×18, gap 14.
- Ligne 1 : `RankCell size="md"` à gauche, icônes de distinction 20 px à droite.
- Ligne 2 : avatar 40 px (rayon 12, `app-avatar`) · nom 15 px 700 · sous-ligne 12 px muted « 30 matchs · 2,00 K/M » · valeur 24 px 700 `tabular-nums` + libellé 11 px uppercase en accent.
- Mobile : non affiché (la liste porte déjà le rang).

## `DistinctionStrip`

`{ items: { key: DistinctionBadgeKey; memberName: string; value: string }[] }`

- Libellé « Distinctions » 11 px uppercase muted, puis pastilles : hauteur 32, rayon plein, `.app-panel` sans ombre, padding 0 12 0 5, icône 22 px, libellé muted, nom 600, valeur 12 px `tabular-nums`.
- Mobile : cartes 132 px en défilement horizontal (icône 20, libellé 11, nom 13/700, valeur 12).

## `PageBanner`

`{ title; icon; image; meta?: ReactNode }` — hauteur 144 px (mobile 120), rayon 14, `background-position: center 30%`.

- Voile : `linear-gradient(90deg, rgb(2 6 23 / .9) 0%, rgb(2 6 23 / .5) 55%, rgb(2 6 23 / .1) 100%)` (mobile : vertical, `to top`).
- Titre 26 px (19 mobile) 700, `tracking -0.02em`, blanc ; icône 22 px `yellow-400`.
- Méta : pastille « 24 membres » (fond blanc 14 %, bordure blanc 28 %) · point `emerald-400` 6 px · « Synchronisé le 21/09 à 22:00 ».

## `DockingToolbar` — slot `dockedAside`

Rendu à droite (`margin-left: auto`), seulement si `isSticky && !compact` : « Tri : **Kills ↓** », 12 px muted, valeur en accent. Aucun contrôle.

## `MobileRankList`

`{ entries; sortKey; onSortChange; metric; metricLabel }` — visible `< md`, remplace la liste de tuiles.

- Au-dessus : « Trier par » (11 px uppercase) + puces 30 px de haut en défilement horizontal ; active : fond indigo-900 (`#312e81`), texte blanc, suffixe ↓.
- Ligne (`<button>`, min 56 px, padding 10×12) : rang 30 px · nom 14/600 + distinctions 14 px · sous-ligne 12 muted · valeur 17/700 + libellé 10 px accent · chevron.
- Dépliée : grille 3 colonnes, gap 6, retrait gauche 52 px ; tuiles `--app-surface-muted`, rayon 8, padding 6×8, libellé 10 px uppercase, valeur 13/600.
- 8 lignes, puis « Afficher les N autres ».

## Header mobile (< 640 px)

Hauteur 60 px : menu 40×40 (rayon 12, bordure) · puce clan flexible 40 px (logo 28, nom 13/700 + tag muted, statut 10 px uppercase) · bouton joueur 40×40 en icône (`title` = nom ou « Choisir un joueur »).
