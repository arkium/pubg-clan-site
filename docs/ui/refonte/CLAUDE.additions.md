## Refonte UI (docs/TODO/refonte-ui.md) — règles

À ajouter au CLAUDE.md, section « Règles UI ».

- **Accent** : tout état actif (segmented, en-tête trié, nav active, focus, lien d'action) utilise `--theme-ui-accent` et ses dérivés (`-text`, `-soft`, `-tint`, `-ring`). Jamais `bg-blue-600`, `bg-slate-800` ni une teinte en dur pour un état actif.
- **Rangs** : `RankCell` (`app-podium-badge`) pour tout rang affiché. Aucun emoji de médaille.
- **Tri de tableau** : `SortableTh` + `useTableSort`. Pas de segmented de tri au-dessus d'un tableau ; sur mobile, puces « Trier par » de `MobileRankList`.
- **Distinctions** : calculées uniquement par `src/lib/distinctions.ts`.
- **Tendances** : ne rien afficher quand la progression est absente (pas de « • »).
- **Colonnes conditionnelles** : une colonne qui vaut 0 par construction pour le filtre actif n'est pas rendue (ex. Duo/Trio/Squad hors mode « Tous »).
- **Tableaux** : `app-table-shell`, `table-layout: auto`, padding horizontal 9 px pour les cellules numériques, aucune largeur fixe dont la somme dépasserait la carte.
- **Rayons** : bloc bordé = `.app-panel` / `.app-panel-muted` / `.app-table-shell`. Jamais `rounded` + `border` écrits à la main.
- **Vocabulaire** : Dégâts, Victoires / Top 1, Win rate, K/M, Temps, Jours actifs, Distinctions. Pas d'anglais pour les libellés de colonnes (sauf K/M, Win rate).
- **Thème** : jamais de `dark:` (rappel de `docs/ui/themes.md`) — y compris dans `ClanNavigation` et `DockingToolbar`.
- **Bandeau** : rappel du tri via `dockedAside` de `DockingToolbar`, jamais un contrôle.
- **Avant de livrer une page** : `npm run test` (conformité) et `npm run test:e2e` ; captures clair/sombre à 375, 768, 1280 px.
