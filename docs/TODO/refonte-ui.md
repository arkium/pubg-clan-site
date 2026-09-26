# Refonte UI — accent, tableaux de classement, mobile

> **Spécification — proposée le 2026-09-26, corrigée et maquette validée le 2026-09-26, à implémenter (phase 0 d'abord).**
> Maquette de référence : `docs/ui/refonte/maquettes/Refonte adaptée.html` (proposition 2b de `Audit design.dc.html`,
> adaptée aux décisions du §3). Complète [sticky.md](sticky.md) sans le contredire : le bandeau, la période et la couche
> collante unique restent tels quels. Fiches des composants : [composants-refonte.md](../ui/composants-refonte.md).
> Destiné à l'équipe de développement et à Claude Code.

---

## 1. Le besoin

Les pages joueurs partagent désormais le même bandeau et la même période, mais leurs **états actifs**, leurs **rangs**,
leurs **rayons**, leur **vocabulaire** et leurs **tableaux** divergent encore. L'objectif est **un look cohérent d'une
page à l'autre** : une règle écrite une fois dans `src/components/ui` ou `globals.css`, et vérifiée par
`ui-conformance.test.ts`, s'applique à toutes les pages, sans maquetter chacune.

---

## 2. Constats (audit du 2026-09-26, page `/clans/[clanId]/leaderboard`, vérifiés contre le code)

| # | Constat | Où |
|---|---|---|
| 1 | État actif des segmented presque invisible en sombre : `--theme-toggle-item-active-bg` = slate-800 (`rgb(30 41 59)`) sur fond slate-950 ; en clair, bleu-800 plein | `globals.css` l. 57 et 149, `SegmentedControl` (`bg-blue-600 text-white`) |
| 2 | `--theme-ui-accent` défini (indigo-500 clair / indigo-400 sombre) mais inutilisé | `globals.css` l. 68 et 160 |
| 3 | Rangs en **emoji** 🥇🥈🥉 dans 7 fichiers, alors que 11 autres affichent les **médailles SVG** (`/icons/medal-*.svg`) | `Leaderboard.tsx`, awards, défis, débriefing (§6.A) |
| 4 | Tri par un segmented de 7 options, alors que `patterns.md` documente le tri au clic sur l'en-tête | `Leaderboard.tsx` |
| 5 | Sections en `rounded` (4 px) à côté de panneaux à 12 px et d'un bandeau à 16 px | `Leaderboard.tsx`, `LeaderboardStats.tsx` |
| 6 | Fil de retour en `zinc` dans une UI `slate` | `NavigationTrail.tsx` |
| 7 | Vocabulaire mixte : Damage, Winner, Win Rate, Top performers, « TOP Kills/Matchs », « Actifs » ; info-bulle « RǸduire » (`Ǹ`) | `Leaderboard.tsx`, `LeaderboardStats.tsx`, `ClanNavigation.tsx` l. 1075 |
| 8 | 14 colonnes en `table-fixed` : en-têtes qui se chevauchent (capture `classement-docke-light-chromium-desktop`) | `Leaderboard.tsx` |
| 9 | Sans progression, chaque valeur porte un « • » (5 par ligne) | `Leaderboard.tsx` (`renderValueWithTrend`) |
| 10 | Colonnes Solo/Duo/Trio/Squad affichées quel que soit le mode d'escouade filtré | `Leaderboard.tsx` |
| 11 | Distinctions absentes des lignes du tableau ; calcul local dupliqué (`LeaderboardStats`), alors que `src/lib/distinction-badges.ts` et le `badgeType` du serveur existent | `Leaderboard.tsx`, `LeaderboardStats.tsx` |
| 12 | Mobile : 12 tuiles par joueur | `Leaderboard.tsx` |

---

## 3. Décisions

| Sujet | Décision | Date |
|---|---|---|
| Accent | **`--theme-ui-accent`** pour tout état actif : segmented, en-tête trié, lien de nav actif, puces de tri, focus, liens d'action. Les palettes de données (modes, rôles, placements, distinctions) ne changent pas | 2026-09-26 |
| État actif d'un segmented | Clair : fond `--app-surface`, texte `--theme-ui-accent-text` (indigo-700), ombre légère + anneau `--theme-ui-accent-ring`, conteneur `--theme-toggle-track`. Sombre : fond `--theme-ui-accent-soft`, texte `--theme-ui-accent-text` (indigo-100), même anneau | 2026-09-26 |
| Nav latérale active | Fond `--theme-ui-accent-soft`, filet gauche `inset 2px 0 0` accent, icône en accent | 2026-09-26 |
| **Rangs 1–3** | **Médailles SVG** existantes (`/icons/medal-gold.svg`, `medal-silver.svg`, `medal-bronze.svg`) partout, via `RankCell`. Plus aucun emoji ; **pas** de pastille « #1 » (`app-podium-badge`) pour un rang | 2026-09-26 |
| Tri | **Clic sur l'en-tête** (`SortableTh`), second clic = inversion. Colonne triée teintée (`--theme-ui-accent-tint` via `<col>`), libellé en accent avec ↓ / ↑ | 2026-09-26 |
| Rappel du tri | Au docking sur ordinateur, texte « Tri : Kills ↓ » aligné à droite du bandeau (ce n'est pas un contrôle ; sticky.md §4.A respecté). Absent sur mobile | 2026-09-26 |
| Tendances | Affichées seulement si la progression existe pour la ligne ; sinon rien (pas de « • ») | 2026-09-26 |
| Colonnes de mode | Duo / Trio / Squad affichées seulement pour le mode d'escouade « Tous » ; Solo n'est jamais une colonne (le filtre « Solo » affiche déjà ces chiffres) | 2026-09-26 |
| Distinctions | Calcul unique `src/lib/distinctions.ts`, **appuyé sur** `distinction-badges.ts` (icônes, libellés) et le `badgeType` calculé par le serveur quand il existe ; icônes 16 px à côté du nom dans le tableau, 20 px sur le podium | 2026-09-26 |
| **Thème — `dark:`** | **Conservés** : les `dark:` existants restent sur toutes les pages. Les nouveaux composants passent par les tokens (qui gèrent déjà les deux thèmes). `docs/ui/themes.md` est corrigé en ce sens | 2026-09-26 |
| **Hauteurs** | **Inchangées** : bandeau d'image à 10rem / 13rem (`min-h`), header actuel (sur deux lignes à 375 px). Pas de `PageBanner` à hauteur fixe, pas de header à 60 px | 2026-09-26 |
| En-tête de page | Le compteur de membres et la date de synchro passent **dans le bandeau d'image** (sans changer sa hauteur) ; la note du mode « Tous » passe dans une info-bulle à côté du libellé « Mode d'escouade » | 2026-09-26 |
| Hiérarchie | `PodiumCards` (top 3 du critère trié) puis `DistinctionStrip`, à la place des 5 cartes « Top performers » | 2026-09-26 |
| Longueur | 10 lignes puis « Afficher les N autres joueurs » (`ShowMoreToggle`) | 2026-09-26 |
| Rayons | Contrôle 7–10 px, carte/panneau 12 px (`--app-panel-radius`), bandeau d'image 16 px (inchangé). Tout bloc bordé passe par `.app-panel` / `.app-table-shell` | 2026-09-26 |
| Vocabulaire | Dégâts, Victoires (en-tête « Top 1 »), Win rate, K/M, Temps, Jours actifs, Distinctions ; types de match inchangés (Officiel, Casual, Custom, Tous) | 2026-09-26 |
| Mobile (< 768 px) | `MobileRankList` à la place du tableau ; tri par puces « Trier par » (non dockées, état actif en accent) | 2026-09-26 |

---

## 4. Le standard cible

### A. Page de classement (modèle) — écrans 1 à 5 de la maquette

```
div.app-main-flush
  div.app-container.app-gutter      NavigationTrail · bandeau d'image (hauteur actuelle) : titre, compteur, synchro
  DockingToolbar                    [repos] intitulés de groupe · PeriodFilter · type de match · mode d'escouade (+ info-bulle)
                                    [docké, ordinateur] contrôles seuls + dockedAside « Tri : Kills ↓ »
  div.app-container.app-gutter
    PodiumCards                     top 3 du critère trié, médailles SVG
    DistinctionStrip                5 distinctions
    div.app-table-shell (md+)       SortableTh, RankCell, colonnes de mode conditionnelles, tfoot Total clan, ShowMoreToggle
    MobileRankList (< md)           puces « Trier par », lignes dépliables
```

### B. Tableaux de classement (toutes pages)

- `table-layout: auto`, cellules numériques `tabular-nums`, alignées à droite, padding horizontal **9 px** (12–14 px pour la
  première et la dernière colonne).
- Pas de largeur fixe sur les colonnes de mode ; la somme des largeurs fixes ne dépasse jamais la largeur de la carte.
- En-tête : `app-table-head`, 11 px, `uppercase`, `tracking 0.04em`.
- Rang : `RankCell` (médaille SVG pour 1–3, numéro ensuite).
- L'en-tête n'est pas collant contre la page (couche unique, sticky.md §4.B).

### C. Mobile

- Lignes de 56 px minimum, cible tactile de 44 px minimum.
- Ligne : rang (médaille ou numéro) · nom + distinctions · sous-ligne « N matchs · K/M · Win rate » · valeur du critère
  trié (17 px, gras) + libellé (10 px, accent).
- Toucher = déplier : grille de 3 colonnes (Dégâts, Top 1, Temps, Duo, Trio, Squad).
- Docké : période seule (inchangé, `compact`). Header inchangé.

---

## 5. Plan par phases

### Phase 0 — Fondations (aucune page migrée)

1. Tokens (`composants-refonte.md`) : état actif de `.app-segmented-control__item--active`, de `SectionAnchorNav` et de
   la sidebar sur `--theme-ui-accent` ; `SegmentedControl` perd `bg-blue-600 text-white`.
2. `src/lib/distinctions.ts` : calcul unique (déplacé depuis `LeaderboardStats`), appuyé sur `distinction-badges.ts`,
   testé dans `src/lib/distinctions.test.ts`.
3. Composants `src/components/ui` : `RankCell`, `SortableTh` (+ hook `useTableSort`), `PodiumCards`, `DistinctionStrip`,
   `MobileRankList`.
4. `DockingToolbar` : slot optionnel `dockedAside` (rendu seulement si `isSticky && !compact`).
5. `NavigationTrail` en tokens ; correction de « RǸduire ».
6. Contrôles de conformité (§7) intégrés à `src/lib/ui-conformance.test.ts`, avec les listes d'exceptions mesurées du §6.
7. Documentation : `docs/ui/components.md`, `tables.md`, `themes.md` (règle sur `dark:`, §3), `index.html` (sections
   concernées), `CLAUDE.md` (règles de `docs/ui/refonte/CLAUDE.additions.md`).
8. Captures Playwright : l'accent change **les 20 captures** (`e2e/visual.spec.ts-snapshots/`) — les régénérer et les
   relire toutes, pas seulement `classement-*`.

### Phase 1 — Page de référence

`/clans/[clanId]/leaderboard` au standard §4.A (`page.tsx`, `Leaderboard.tsx`, `LeaderboardStats.tsx`). Nouveau test
Playwright : clic sur l'en-tête = tri et inversion ; colonnes de mode masquées hors « Tous » ; rappel du tri visible une
fois docké sur ordinateur, absent sur mobile.

### Phase 2 — Tableaux de classement

`/clans-leaderboard`, `/clans/[clanId]/overview` (tableau), `…/stats/weapons`, `…/drop-zones`, `…/stats/positions`,
`…/stats/zone-closures`, `/members/[id]/map-stats`, `…/nemesis`, `…/drop-zones`, `/clans/[clanId]/awards`, défis
(`ChallengeLeaderboard`, `ChallengeCard`, page d'un défi), débriefing d'un match (`MatchDebriefView`).

### Phase 3 — Le reste

Toutes les pages restantes pour le vocabulaire, les rayons et l'accent (aucune recomposition, `dark:` conservés).

---

## 6. Inventaire mesuré (2026-09-26)

### A. Rangs en emoji → médailles SVG

| Fichier | Usage | Phase |
|---|---|---|
| `src/components/Leaderboard.tsx` | Rang du classement du clan | 1 |
| `src/app/clans/[clanId]/awards/page.tsx` | `MEDAL_BY_RANK` en emoji (top 3 des awards) | 2 |
| `src/components/ChallengeLeaderboard.tsx` | Rang d'un défi | 2 |
| `src/components/ChallengeCard.tsx` | Podium d'un défi | 2 |
| `src/app/clans/[clanId]/challenges/[challengeId]/page.tsx` | Podium d'un défi | 2 |
| `src/components/ChallengeCreator.tsx` | Libellés des récompenses « 🥇 1er » | 2 |
| `src/components/telemetry/MatchDebriefView.tsx` | `PODIUM_MEDALS` du débriefing | 2 |

Déjà en médailles SVG (**conservées**, rien à changer) : pages `members`, `overview`, `stats` du clan, `members/[id]/stats`,
`tournaments/[tournamentId]`, `CityInsightsPanel`, `DropPressureStatsPanel`, `ClanLeaderboardTable`,
`MemberLifetimeStatsPanel`, `SquadSynergies`, `TopPerformers`. Elles passeront par `RankCell` quand leur page migre.

### B. Autres écarts

| Contrôle | Fichiers | Phase |
|---|---|---|
| Segmented de tri au-dessus d'un tableau (`options={SORT_OPTIONS}`) | `Leaderboard.tsx` | 1 |
| Distinctions calculées localement | `LeaderboardStats.tsx` | 0 (déplacé) |
| En-têtes en anglais (Damage, Winner, Top performers) | `Leaderboard.tsx`, `LeaderboardStats.tsx`, page télémétrie d'un match | 1 et 3 |
| État actif en couleur codée en dur dans `src/components/ui` | `SegmentedControl.tsx`, `SectionAnchorNav.tsx` | 0 |
| Coquille `Ǹ` | `ClanNavigation.tsx` | 0 |

---

## 7. Tests

Contrôles statiques ajoutés à `src/lib/ui-conformance.test.ts` (Vitest), écrits avec les aides existantes du fichier
(`listSources`, chemins normalisés en `/` — surtout pas `fs.globSync`, absent des types Node du projet et qui rend des
`\` sous Windows) ; détail et expressions dans `docs/ui/refonte/ui-conformance.additions.md` :

1. aucun emoji de médaille (🥇🥈🥉) — exceptions : §6.A, rétrécies à chaque phase ;
2. pas de segmented de tri au-dessus d'un tableau (`<SegmentedControl … options={SORT_OPTIONS}`) ;
3. distinctions calculées uniquement par `src/lib/distinctions.ts` ;
4. aucun état actif codé en dur (`bg-(blue|indigo|slate)-NNN text-white`) dans `src/components/ui` ;
5. libellés de colonnes en français (Damage, Winner, Top performers, « TOP Kills/Matchs ») ;
6. aucun caractère `Ǹ`.

**Pas de contrôle « aucun `dark:` »** (décision du §3).

Playwright : test de la page de référence (phase 1) et captures des 4 profils, clair et sombre. Commandes :
`npm run test:telemetry` (Vitest, tout `src/lib` — attention, `drop-pressure-match-type.test.ts`,
`matches-cache-match-type.test.ts` et `tracked-isolation.test.ts` écrivent dans la base de `DATABASE_URL` : les exclure
avec `--exclude` quand elle pointe la production),
`npm run test:e2e`, `npm run test:e2e:update`.

---

## 8. Recette — à chaque page migrée

Largeurs 375, 768, 1280 px ; thèmes clair et sombre ; comparer à la maquette.

- [ ] État actif lisible dans les deux thèmes (contraste texte ≥ 4.5:1).
- [ ] Rang 1–3 en médaille SVG, aucun emoji.
- [ ] Clic sur un en-tête : tri, second clic : inversion ; colonne teintée ; rappel du tri visible une fois docké (ordinateur).
- [ ] Aucune colonne tronquée, aucun débordement horizontal de la carte.
- [ ] Aucun « • » quand la progression est vide.
- [ ] Colonnes de mode masquées hors « Tous ».
- [ ] Mobile : liste compacte, lignes dépliables, période seule une fois docké.
- [ ] Hauteur du bandeau d'image et du header inchangée.
- [ ] Vocabulaire conforme au §3.

---

## 9. Critères de fin

- Les contrôles du §7 passent sans liste d'exceptions.
- Plus aucun emoji de rang ; aucune page ne calcule ses distinctions localement.
- Les tests Playwright passent sur toutes les pages migrées.
