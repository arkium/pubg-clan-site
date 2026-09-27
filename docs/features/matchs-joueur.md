# Matchs d'un joueur — un carnet de vol

Refonte livrée le 2026-09-27 (maquette Claude Design « Matchs joueur », écrans 26a à 26e). Page `/members/[id]/matches`,
route `GET /api/members/[id]/matches?period=&limit=all`. Anciens fichiers archivés dans
`archive/refonte-ui/matchs-joueur/` (page, `MatchHistory`, qui n'avait pas d'autre utilisateur).

## 1. Ce que l'analyse de cohérence a corrigé

| Constat (page d'avant, maquette, données réelles) | Décision |
|---|---|
| Tableau de 10 lignes trié par colonnes, sans résumé ; parties non regroupées par soirée | **Chiffres clés** (kills, dégâts, meilleure place, place moyenne), **chronologie**, **barre des modes**, **soirées** (journée de jeu `sessionDateOf`, 06:00 à 06:00 heure de Paris) |
| Filtre par date exacte (champ date + « Effacer ») qui disparaissait quand le bandeau collait | Retiré : les soirées le remplacent ; la soirée ouverte vit dans l'URL (`?soiree=2026-09-26`) pour les liens partagés |
| Route plafonnée à 100 parties par appel ; la maquette veut toute la période | `limit=all` : toute la période en un appel (relevé du 2026-09-27, joueur 75 : 16 parties sur la semaine, 163 sur le mois, 371 et 27 soirées sur « Tous ») ; regroupement et pagination côté page |
| La route renvoyait `squad: []` : pas de coéquipiers pour la carte de fin de partie | `squad` porte les **coéquipiers du clan** de la partie (sans le joueur) |
| Maquette : « #3/25 » — le nombre d'équipes n'était pas renvoyé | `teamCount` lu dans la télémétrie (`teamCountFromPhaseSnapshots`, colonnes compressées décodées) : 307 parties en ≈ 160 ms, aucune valeur manquante. Sans télémétrie analysée, la place seule |
| Maquette : états « prête / en cours / expirée » ; la route ne donnait que `telemetryAvailable` | `telemetryStatus` : `success`, `pending`, `failed`, `expired` (`isTelemetryDataExpiredError`), `null` sans partie de clan. Bouton **Débriefing** si prête, **État** (audit technique) sinon, aucun bouton sans squad |
| Mode Duo / Trio / Squad : 61 parties sur 371 n'ont aucun coéquipier du clan (aucun `SquadMatch` enregistré) | Mode = **membres du clan dans l'équipe**, comme la Soirée du clan (décision du 2026-09-27) ; « **Sans le clan** » pour les autres, sans télémétrie ni débriefing |
| Maquette : « 7 j / 30 j / Tout » | `PeriodFilter` du site : Semaine / Mois / Tous (calendaires) |
| Chronologie en défilement horizontal (plan de vol de la Soirée du clan) | **Pagination** par 10 parties (5 sur mobile), ouverte sur les plus récentes ; le découpage part des plus récentes : la page ouverte est pleine, c'est la plus ancienne qui est incomplète |

## 2. La page

- **Bandeau d'image** : « Carnet de vol de {joueur} », parties de la période, temps de jeu, chicken dinners.
- **Bandeau** (`DockingToolbar`) sur une ligne, **docké aussi sur mobile** : exception nommée à sticky.md §2
  (`MOBILE_DOCKED_EXTRA_CONTROLS`) — période et pastille de mode (menu avec le nombre de parties par mode, `?mode=`).
- **Chiffres clés** (`KpiGrid` des pages Matchs) : kills et par partie, dégâts et par partie, meilleure place (puis le
  plus de kills) avec carte et jour, place moyenne.
- **Chronologie** : une étape par partie (jour à chaque nouvelle soirée, séparateur, heure, miniature de carte, couronne
  sur un top 1, place, kills), reliées en pointillés jusqu'à la dernière étape de la page. Toucher une étape ouvre sa
  soirée (et sa page de soirées), met la carte en avant et l'amène à l'écran.
- **Barre des modes** : parties, kills et top 1 par mode, temps de jeu.
- **Soirées** : 4 par page, la plus récente ouverte (ou celle de l'URL) ; date, « Ce soir », horaires, kills, meilleure
  place, tampon « Chicken dinner(s) », une pastille de place par partie (12, 6 sur mobile, puis « +N »).
- **Carte de fin de partie** : carte, mode, type (parties personnalisées signalées), heure et durée, #place/équipes,
  kills, dégâts, assists, réanimations, coéquipiers, état de la télémétrie, bouton.
- Changer de période ou de mode garde la page, estompée, pendant le rechargement, et revient sur les parties récentes.

Logique pure : `src/lib/player-matches.ts`. Composants : `src/components/player-matches/PlayerMatchesSections.tsx`.

## 3. Route — `GET /api/members/[id]/matches`

Mode historique (au moins un de `period`, `limit`, `offset`) : `limit=all` pour toute la période, sinon 1 à 100 (le
tableau de bord garde `limit=5`). Chaque partie porte en plus `squad` (coéquipiers du clan), `teamCount` et
`telemetryStatus`. Le mode détection (sans paramètre) est inchangé.

Contrôle en lecture seule : `npx tsx scripts/check-member-matches.ts [memberId]` (volume par période, soirées, modes,
télémétrie, coût du nombre d'équipes).

## 4. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/player-matches.test.ts` | Modes (« Sans le clan »), chiffres clés, chronologie (ordre, page ouverte pleine, soirée de la veille à 01:30), soirées (ordre, fin, page d'une soirée, date d'URL), état de la télémétrie |
| `src/lib/player-matches-route-contracts.test.ts` | `limit=all` sans pagination, limite du tableau de bord, coéquipiers, télémétrie expirée, nombre d'équipes, partie sans squad |
| `src/lib/ui-conformance.test.ts` | Exception nommée du bandeau docké complet sur mobile |
| `e2e/player-matches.spec.ts` | Appel unique, chiffres clés, période ; chronologie paginée (10 / 5) sans défilement ; soirées par 4, liens Débriefing / État, partie sans le clan ; étape qui ouvre sa soirée ; mode et `?mode=` ; lien partagé `?soiree=` ; bandeau docké sur une ligne. Données : `e2e/support/player-matches.ts` |
