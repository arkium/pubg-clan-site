# Logique de calcul de la page Dashboard membre

Ce document decrit la logique de la page `/members/[id]/dashboard`: sources de donnees, periodes, aggregations, formules d affichage et points d attention.

## Resume rapide

- La page combine 2 APIs:
  - `GET /api/members/[id]/dashboard` pour les cartes stats, la progression, la comparaison clan, les squads frequents et le top 5.
  - `GET /api/members/[id]/matches` pour le tableau d historique des matchs (tri + pagination).
- Les blocs du dashboard suivent la regle mode clan sans solo.
- L historique des matchs est un bloc separe qui gere ses propres donnees.
- Les cadres `Squads preferes` et `Meilleures performances` suivent aussi la periode selectionnee (`Semaine`, `Mois`, `Tous`).
- Les cartes `Stats principales` reposent sur `PlayerStats` (table pre-agregee), pas sur une aggregation live match par match.
- Les blocs `Top performances` et `Squads preferes` sont calcules a la volee depuis les tables `Match` et `SquadMember`.
- La page maintient 2 periodes distinctes:
  - `period` pour les stats dashboard (`week | month | all`)
  - `matchPeriod` pour l historique des matchs (`week | month | all`)
- Le bloc `Historique des matchs` est affiche en bas de page (apres `Squads preferes` et `Meilleures performances`).

## Fichiers a connaitre

- Page: `src/app/members/[id]/dashboard/page.tsx`
- Hook dashboard + historique: `src/hooks/usePlayerDashboard.ts`
- API dashboard: `src/app/api/members/[id]/dashboard/route.ts`
- Composants dashboard:
  - `src/components/dashboard/PlayerStats.tsx`
  - `src/components/dashboard/ProgressionChart.tsx`
  - `src/components/dashboard/ComparisonRadar.tsx`
  - `src/components/dashboard/SquadFrequency.tsx`
  - `src/components/dashboard/MatchHistory.tsx`
- Types: `src/types/dashboard.ts`

## Orchestration cote page

La page charge en parallele:

1. Donnees dashboard via `usePlayerDashboard(memberId, period)`
2. Historique via `usePlayerMatches(memberId, matchPeriod, limit, offset, sortBy, sortDirection)`

Etat principal:

- `period`: periode des stats dashboard
- `matchPeriod`: periode de l historique
- `matchSortKey`: `pubgCreatedAt | kills | damageDealt | placement`
- `matchSortDir`: `asc | desc`
- `matchOffset`: pagination historique
- `MATCH_LIMIT`: `10`

## API dashboard: `GET /api/members/[id]/dashboard`

Regle metier appliquee:

- mode clan sans solo sur les blocs du dashboard
- l historique n est pas calcule par cette route

## Parametres d entree

- `id`: entier positif
- `period`: `week | month | all` (defaut `week`)

Validation:

- `memberId` invalide -> `400`
- membre introuvable -> `404`
- erreur interne -> `500`

## Periode appliquee pour les stats dashboard

La route derive une cle `periodKey` pour la table `PlayerStats`:

- `all` -> `all-time`
- `month` -> `month-YYYY-MM` (mois calendaire)
- `week` -> `week-YYYY-WW` (semaine ISO)

Important:

- Cette logique est basee sur des cles pre-calculees dans `PlayerStats`.
- Elle n utilise pas une fenetre glissante 7/30 jours dans cette route.

## Periode appliquee aux cadres dashboard

Pour les blocs dashboard calcules a la volee (`topPerformances`, `squads`), la route applique egalement une plage de dates alignee sur la periode UI:

- `week`: semaine calendaire lundi 00:00 -> dimanche 23:59:59.999
- `month`: mois calendaire en cours
- `all`: pas de filtre date

## Bloc `member`

La route lit `ClanMember` et renvoie:

- `id`, `displayName`, `pubgPlayerName`, `platformShard`, `createdAt`
- `avatarUrl` depuis `identities[0].user.avatarUrl` si present

## Bloc `stats`

Source:

- `playerStats.findUnique({ memberId_period: { memberId, period: periodKey } })`

Champs renvoyes:

- kills, damage, assists, revives
- matches joues, matches gagnes, `winRate`
- moyennes par partie
- `badgeType`

Comportement UI:

- si `stats === null`, la carte affiche un message de donnees indisponibles.

## Bloc `clanAverage`

Source:

- tous les `PlayerStats` des membres actifs du meme clan sur la meme `periodKey`

Calcul:

- moyenne arithmetique sur chaque metrique (`avgKills`, `avgDamage`, `avgWinRate`, `avgMatches`, `avgAssists`, `avgRevives`)

## Bloc `progression`

Objectif:

- alimenter `Progression (4 semaines)`

Calcul:

1. Construction de 4 cles de semaines ISO (de la plus ancienne a la plus recente)
2. Lecture des lignes `PlayerStats` correspondantes
3. Reconstitution d un tableau complet de 4 points
4. Valeurs manquantes completees a `0`

Champs:

- `period`, `week`, `year`, `totalKills`, `totalDamage`, `winRate`, `matchesPlayed`

## Bloc `topPerformances`

Source:

- candidats depuis `Match` du membre
- filtre mode clan via `SquadMember` + `SquadMatch._count.members`

Filtre periode:

- la selection `Semaine/Mois/Tous` restreint d abord les candidats par `pubgCreatedAt`

Requete:

- tri candidats `kills desc`, puis `damageDealt desc`
- extraction des 5 premiers non-solo clan

Effet metier:

- ce top 5 est borne a la periode selectionnee.
- un match sans coequipier clan detecte (solo clan) est exclu.

## Bloc `squads`

Objectif:

- trouver les coequipiers les plus frequents avec le membre courant

Etapes:

1. Charger les `squadMatchId` de la table `SquadMember` pour le membre courant
2. Charger les autres membres sur ces memes `squadMatchId`
3. Agreger par coequipier:
   - `matchCount`
  - `totalKills` (kills ensemble = kills du membre courant + kills du coequipier sur les matchs partages)
   - `totalDamage` (damage du coequipier)
   - `wins` (placement squad = 1)
4. Deriver `winRate = wins / matchCount`
5. Trier cote API par `matchCount desc` (classement de base)
6. Limiter a `10`

Remarque:

- ce bloc applique la periode selectionnee via `squadMatch.createdAt`.

## Bloc `mapLabels`

- retourne `getMapLabels()` pour afficher les alias de cartes dans les composants.

## Affichage: details par composant

## PlayerStats

Le composant affiche 4 cartes:

- Kills
- Damage
- Win Rate
- Matchs joues

Comparaison vs clan (si `clanAverage` existe):

- `vsKills = ((totalKills - avgKills) / avgKills) * 100`
- `vsDamage = ((totalDamage - avgDamage) / avgDamage) * 100`

Regles visuelles tendance:

- `up` si ecart > `+5%`
- `down` si ecart < `-5%`
- sinon `neutral`

Badge distinction:

- rendu uniquement si `badgeType` est reconnu dans `DISTINCTION_BADGE_META`.

## ProgressionChart

Serie:

- 4 points hebdomadaires

Metriques selectionnables:

- `totalKills`, `totalDamage`, `winRate`, `matchesPlayed`

Tendance:

- compare dernier point vs precedent
- `↑`, `↓`, `→`

## ComparisonRadar

Axes compares:

- Kills, Damage, Win Rate, Assists, Revives

Normalisation:

- chaque axe est ramene a son max local (ou 100 pour win rate)

Diff tableau:

- `diff = playerValue - clanValue`
- `pct = clanValue > 0 ? diff / clanValue * 100 : 0`

## SquadFrequency

Tri d affichage:

- la liste est d abord limitee au top 10 cote API (classement base par `matchCount`)
- tri cote UI via `SegmentedControl`:
  - `Matchs`
  - `Kills`
  - `Win Rate`
- tie-break principal:
  - `Matchs`: puis `kills`, puis `displayName`
  - `Kills`: puis `matchCount`, puis `displayName`
  - `Win Rate`: puis `matchCount`, puis `displayName`

Infos affichees:

- nom du coequipier (lien vers son dashboard)
- nombre de matchs ensemble
- kills cumules et win rate ensemble
- mise en evidence win rate:
  - badge gradue selon le niveau de win rate
  - icone coupe pour le meilleur taux de la liste (ex-aequo inclus)

## Historique des matchs sur la page dashboard

Le bloc `MatchHistory` de cette page reutilise la meme API que la page `/members/[id]/matches`:

- endpoint: `GET /api/members/[id]/matches`
- tri, pagination et periode geres cote serveur
- colonne `Mode clan` incluse dans la reponse
- ce bloc garde sa logique propre et peut afficher des lignes `solo`

Pour les details complets de ce calcul, voir `docs/matchs-membre-calcul.md`.

## Points d attention

- Les periodes ne sont pas homogenes entre tous les blocs:
  - `stats` / `clanAverage`: base `PlayerStats` par cle ISO/calendaire
  - `topPerformances` / `squads`: agregation live, filtree par la periode selectionnee
  - `MatchHistory`: periode traitee par l API matches (fenetre glissante sur cette route)
- Les blocs dashboard appliquent la logique mode clan sans solo.
- Le bloc historique reste separe et conserve ses propres regles de donnees.
- La bascule de `period` met a jour les KPI dashboard, `Squads preferes` et `Meilleures performances`.
- Le bloc historique reste pilote par `matchPeriod` sur son API dediee.
