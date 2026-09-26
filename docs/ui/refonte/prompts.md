# Demandes à coller dans Claude Code (VS Code)

Une demande par session, sur la branche `refonte-ui`. Claude Code lit `CLAUDE.md` automatiquement.

## Phase 0 — Fondations

> Lis `docs/TODO/refonte-ui.md` et `docs/ui/composants-refonte.md`. Réalise la **phase 0** (§5) sans migrer de page :
> tokens d'accent et état actif des segmented, `src/lib/distinctions.ts` + tests, composants `RankCell`, `SortableTh` /
> `useTableSort`, `PodiumCards`, `DistinctionStrip`, `MobileRankList`, `PageBanner`, slot `dockedAside` de
> `DockingToolbar`, `NavigationTrail` en tokens, correction de « RǸduire », suppression des `dark:`, header mobile à 60 px.
> Fusionne `handoff/ui-conformance.additions.ts` dans `src/lib/ui-conformance.test.ts` avec ses exceptions.
> Mets à jour `docs/ui/components.md`, `tables.md`, `themes.md`. Termine par `npm run test` et `npm run lint`.

## Phase 1 — Page de référence

> Applique `docs/TODO/refonte-ui.md` §4.A à `/clans/[clanId]/leaderboard` (`page.tsx`, `Leaderboard.tsx`,
> `LeaderboardStats.tsx`). Retire ces fichiers des listes d'exceptions de `ui-conformance.test.ts`.
> Ajoute un test Playwright : tri au clic sur l'en-tête et inversion ; colonnes de mode masquées hors « Tous » ;
> rappel du tri visible une fois docké sur ordinateur, absent sur mobile. Régénère les captures `classement-*`
> (`npm run test:e2e:update`) et vérifie la recette §6.

## Phase 2 — Une page à la fois

> Applique `docs/TODO/refonte-ui.md` §4.B à `<route>` : `RankCell`, `SortableTh`, colonnes conditionnelles,
> vocabulaire §3. Pas de recomposition de la page au-delà du tableau. Mets à jour les exceptions et les captures.

## Phase 3 — Balayage

> Liste les fichiers restants dans les exceptions de `ui-conformance.test.ts` et corrige-les (vocabulaire, rayons,
> accent, `dark:`). Objectif : listes d'exceptions vides.
