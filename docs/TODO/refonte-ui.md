# Refonte UI — accent, tableaux de classement, mobile

> **Spécification — proposée le 2026-09-26.** Maquettes de référence : `Audit design.dc.html` (écrans 2b, 3a, 3b, 3c, 3d).
> Complète [sticky.md](sticky.md) sans le contredire : le bandeau, la période et la couche collante unique restent tels quels.
> Destiné à l'équipe de développement et à Claude Code.

---

## 1. Le besoin

Les pages joueurs partagent désormais le même bandeau et la même période, mais leurs **états actifs**, leurs **rangs**,
leurs **rayons**, leur **vocabulaire** et leurs **tableaux** divergent encore. L'objectif est qu'une règle écrite une fois
dans `src/components/ui` ou `globals.css`, et vérifiée par `ui-conformance.test.ts`, s'applique à toutes les pages,
sans maquetter chacune.

---

## 2. Constats (audit du 2026-09-26, page `/clans/[clanId]/leaderboard`)

| # | Constat | Où |
|---|---|---|
| 1 | État actif des segmented presque invisible en sombre : `--theme-toggle-item-active-bg` = slate-800 sur fond slate-950 | `globals.css` (`.app-segmented-control__item--active`) |
| 2 | `--theme-ui-accent` défini (indigo-500 clair / indigo-400 sombre) mais inutilisé | `globals.css` l. 68 et 160 |
| 3 | Rangs en emoji 🥇🥈🥉 dans le classement, `app-podium-badge` ailleurs (drop zones, armes, cartes, némésis) | `Leaderboard.tsx` |
| 4 | Tri par un segmented de 7 options, alors que `patterns.md` documente le tri au clic sur l'en-tête | `Leaderboard.tsx` |
| 5 | Sections en `rounded` (4 px) à côté de panneaux à 12 px et d'un bandeau à 16 px | `Leaderboard.tsx`, `LeaderboardStats.tsx` |
| 6 | Préfixe `dark:` utilisé malgré `themes.md` | `ClanNavigation.tsx`, `DockingToolbar.tsx` (variant `card`) |
| 7 | Fil de retour en `zinc` dans une UI `slate` | `NavigationTrail.tsx` |
| 8 | Vocabulaire mixte : Damage, Winner, Win Rate, Top performers, « TOP Kills/Matchs », « Actifs » ; info-bulle « RǸduire » (`\u01F8`) | `Leaderboard.tsx`, `LeaderboardStats.tsx`, `ClanNavigation.tsx` |
| 9 | 14 colonnes en `table-fixed` dans 936 px : en-têtes qui se chevauchent (capture `classement-docke-light-chromium-desktop`) | `Leaderboard.tsx` |
| 10 | Sans progression, chaque valeur porte un « • » (5 par ligne) | `Leaderboard.tsx` (`renderValueWithTrend`) |
| 11 | Colonnes Solo/Duo/Trio/Squad affichées quel que soit le mode d'escouade filtré | `Leaderboard.tsx` |
| 12 | Distinctions absentes des lignes du tableau ; calcul dupliqué entre `Leaderboard` et `LeaderboardStats` | les deux composants |
| 13 | Mobile : 12 tuiles par joueur, header sur deux lignes à 375 px | `Leaderboard.tsx`, `ClanNavigation.tsx` |

---

## 3. Décisions

| Sujet | Décision |
|---|---|
| Accent | **`--theme-ui-accent`** pour tout état actif : segmented, en-tête trié, lien de nav actif, focus, liens d'action. Les palettes de données (modes, rôles, placements, distinctions) ne changent pas |
| État actif d'un segmented | Clair : fond `#fff`, texte `#4338ca`, ombre `0 1px 2px rgb(15 23 42 / .08)` + anneau `inset 0 0 0 1px rgb(99 102 241 / .45)`, conteneur `#f1f5f9`. Sombre : fond `rgb(129 140 248 / .16)`, texte `#e0e7ff`, anneau `inset 0 0 0 1px rgb(129 140 248 / .5)`, conteneur `#020617` |
| Nav latérale active | Fond accent à 8 % (clair) / 12 % (sombre), filet gauche `inset 2px 0 0` accent, icône en accent |
| Rangs 1–3 | **`RankCell`** → `app-podium-badge--gold/silver/bronze`. Plus aucun emoji de médaille |
| Tri | **Clic sur l'en-tête** (`SortableTh`), second clic = inversion. Colonne triée teintée (`accent` à 6 % clair / 7 % sombre via `<col>`), libellé en accent avec ↓ / ↑ |
| Rappel du tri | Au docking sur ordinateur, texte « Tri : Kills ↓ » aligné à droite du bandeau (ce n'est pas un contrôle ; §4.A de sticky.md respecté). Absent sur mobile |
| Tendances | Affichées seulement si la progression existe pour la ligne ; sinon rien (pas de « • ») |
| Colonnes de mode | Duo / Trio / Squad affichées seulement pour le mode d'escouade « Tous » ; Solo n'est jamais une colonne (le filtre « Solo » affiche déjà ces chiffres) |
| Distinctions | Calcul unique dans `src/lib/distinctions.ts` ; icônes 16 px à côté du nom dans le tableau, 20 px sur le podium |
| En-tête de page | Bandeau 144 px (120 px mobile), dégradé horizontal, compteur de membres et date de synchro **dans le bandeau** ; la note du mode « Tous » passe dans une info-bulle à côté du libellé « Mode d'escouade » |
| Hiérarchie | `PodiumCards` (top 3 du critère trié) puis `DistinctionStrip`, à la place des 5 cartes Top performers |
| Longueur | 10 lignes puis « Afficher les N autres joueurs » (`ShowMoreToggle`) |
| Rayons | Contrôle 7–10 px, carte/panneau 12 px (`--app-panel-radius`), bandeau d'image 14–16 px. Tout bloc bordé passe par `.app-panel` / `.app-table-shell` |
| Vocabulaire | Dégâts, Victoires (en-tête « Top 1 »), Win rate, K/M, Temps, Jours actifs, Distinctions ; types de match inchangés (Officiel, Casual, Custom, Tous) |
| Thème | Aucun `dark:` ; `NavigationTrail` en tokens `--theme-ui-text-muted` |
| Mobile (< 768 px) | `MobileRankList` à la place du tableau ; tri par puces « Trier par » (non dockées) ; header à 60 px (bouton joueur en icône 40 px, statut sur une ligne) |

---

## 4. Le standard cible

### A. Page de classement (modèle)

```
div.app-main-flush
  div.app-container.app-gutter      NavigationTrail · PageBanner (titre, compteur, synchro)
  DockingToolbar                    PeriodFilter · type de match · mode d'escouade (+ info-bulle) · [docké] rappel du tri
  div.app-container.app-gutter
    PodiumCards                     top 3 du critère trié
    DistinctionStrip                5 distinctions
    div.app-table-shell (md+)       table avec SortableTh, RankCell, colonnes de mode conditionnelles, tfoot Total clan, ShowMoreToggle
    MobileRankList (< md)           puces « Trier par », lignes dépliables
```

### B. Tableaux de classement (toutes pages)

- `table-layout: auto`, cellules numériques `tabular-nums`, alignées à droite, padding horizontal **9 px** (12 px pour la première et la dernière colonne).
- Pas de largeur fixe sur les colonnes de mode ; la somme des largeurs fixes ne dépasse jamais la largeur de la carte.
- En-tête : `app-table-head`, 11 px, `uppercase`, `tracking 0.04em`.
- L'en-tête n'est pas collant contre la page (couche unique, sticky.md §4.B).

### C. Mobile

- Lignes de 56 px minimum, cible tactile de 44 px minimum.
- Ligne : rang (badge ou numéro) · nom + distinctions · sous-ligne « N matchs · K/M · Win rate » · valeur du critère trié (17 px, gras) + libellé (10 px, accent).
- Toucher = déplier : grille de 3 colonnes (Dégâts, Top 1, Temps, Duo, Trio, Squad).
- Docké : période seule (inchangé, `compact`).

---

## 5. Plan par phases

### Phase 0 — Fondations (aucune page migrée)

1. Tokens : états actifs de `.app-segmented-control__item--active` et de la sidebar sur `--theme-ui-accent` (valeurs §3).
2. `src/lib/distinctions.ts` : calcul unique (déplacé depuis `Leaderboard` / `LeaderboardStats`), testé dans `src/lib/distinctions.test.ts`.
3. Composants `src/components/ui` : `RankCell`, `SortableTh` (+ hook `useTableSort`), `PodiumCards`, `DistinctionStrip`, `MobileRankList`, `PageBanner` (voir `docs/ui/composants-refonte.md`).
4. `DockingToolbar` : slot optionnel `dockedAside` (rendu seulement si `isSticky && !compact`).
5. `NavigationTrail` en tokens ; correction de « RǸduire » ; suppression des `dark:` de `ClanNavigation` et de `DockingToolbar`.
6. Header mobile à 60 px.
7. Contrôles de conformité (`ui-conformance.additions.ts`) avec listes d'exceptions de départ.
8. Documentation : `docs/ui/components.md`, `tables.md`, `themes.md`, `index.html` (sections concernées), `CLAUDE.md`.

### Phase 1 — Page de référence

`/clans/[clanId]/leaderboard` au standard §4.A. Captures Playwright régénérées (`classement-repos-*`, `classement-docke-*`), plus un nouveau test : clic sur l'en-tête = tri et inversion, colonnes de mode masquées hors « Tous ».

### Phase 2 — Tableaux de classement

`/clans-leaderboard`, `/clans/[clanId]/overview` (tableau), `…/stats/weapons`, `…/drop-zones`, `…/stats/positions`, `…/stats/zone-closures`, `/members/[id]/map-stats`, `…/nemesis`, `…/drop-zones`, `/clans/[clanId]/awards`.

### Phase 3 — Le reste

Toutes les pages restantes pour le vocabulaire, les rayons et l'accent (aucune recomposition).

---

## 6. Recette — à chaque page migrée

Largeurs 375, 768, 1280 px ; thèmes clair et sombre.

- [ ] État actif lisible dans les deux thèmes (contraste texte ≥ 4.5:1).
- [ ] Rang 1–3 en `app-podium-badge`, aucun emoji.
- [ ] Clic sur un en-tête : tri, second clic : inversion ; colonne teintée ; rappel du tri visible une fois docké (ordinateur).
- [ ] Aucune colonne tronquée, aucun débordement horizontal de la carte.
- [ ] Aucun « • » quand la progression est vide.
- [ ] Colonnes de mode masquées hors « Tous ».
- [ ] Mobile : liste compacte, lignes dépliables, période seule une fois docké, header sur une ligne.
- [ ] Vocabulaire conforme au §3.

---

## 7. Critères de fin

- Les contrôles ajoutés à `ui-conformance.test.ts` passent sans liste d'exceptions.
- Aucune page n'importe `RANK_MEDALS` ni ne calcule ses distinctions localement.
- Les tests Playwright passent sur toutes les pages migrées.
