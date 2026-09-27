# Carrière PUBG d'un joueur — des états de service

Refonte livrée le 2026-09-27 (maquette Claude Design « Stats joueur », écrans 25a à 25g). Page `/members/[id]/stats`,
routes `GET|POST /api/members/[id]/stats` et `GET|POST /api/members/[id]/season-stats`, plus le bas du tableau de bord
(`/members/[id]/dashboard`) : carte Carrière PUBG et calendrier (`GET /api/members/[id]/calendar`, nouvelle). Anciens
fichiers archivés dans `archive/refonte-ui/carriere-joueur/` (page, `MemberLifetimeStatsPanel`).

## 1. Ce que l'analyse de cohérence a corrigé

| Constat (page d'avant, maquette, données réelles) | Décision |
|---|---|
| Titre « Statistiques globales » alors que le menu dit « Carrière PUBG » ; saisons, « Résumé express » et panneau complet de même poids, qui répètent les mêmes chiffres | Titre **Carrière PUBG** ; plaque et états de service, saisons, vitrine, hauts faits, quatre fiches (Combat, Victoire et survie, Soutien, Déplacements) |
| **Records additionnés entre modes** : `mergeGameModes` (`src/lib/pubg.ts`) sommait tout, y compris les maxima. Relevé du 2026-09-27, joueur 75 « tous modes » : kill le plus long 3 029 m, survie max 196 min (11 795 s), série 23 — des sommes de records par mode | `longestKill`, `maxKillStreaks`, `mostSurvivalTime` (et `roundMostKills`, `longestTimeSurvived`) prennent le **maximum** entre modes. Les valeurs déjà stockées se corrigent à la prochaine synchro (cron de nuit ou bouton). Corrige aussi la Carrière PUBG du clan, qui lit les mêmes champs |
| **Saison « Normal » = squad TPP seul** (`squad ?? squad-fpp`) : un joueur FPP affichait 0 partie | **Squad TPP + FPP additionnés** (décision du 2026-09-27) dans `fetchPlayerSeasonStats` |
| Médailles du clan aussi pour le **moins** de morts, de défaites, de suicides et pour le **plus** de teamkills (248 → médaille d'or) ; ex æquo départagés par l'ordre du tableau | Médailles seulement sur les stats où « plus = mieux » (`MEDAL_METRICS`) ; classement « compétition » : les ex æquo partagent la médaille (23, 22, 22, 22 → or, argent ×3, pas de bronze) ; une valeur nulle ne médaille pas (décision du 2026-09-27) |
| Maquette : « 142 300 PV » de soins, « barres de vie remplies » | `heals` et `boosts` de l'API sont des **nombres d'objets utilisés** : « Soins utilisés », « Boosts utilisés », phrase « N soins et boosts par partie en moyenne » |
| Maquette : paliers Bronze → Maître, « Diamant III » | Paliers relevés en base : Bronze, Argent, Or, Platine, **Cristal**, Diamant, Maître ; divisions 1 à 4 (chiffres). Palier suivant : 100 points par division, 400 par palier (Or 4 dès 1 800, Cristal 4 dès 2 600 — bandes relevées sur toutes les lignes) ; aucune cible affichée pour Diamant 1 ni Maître (non observés) |
| Maquette : onglet Ranked par défaut, « les 3 saisons » | 77 joueurs sur 410 ont joué en classé cette saison : **Ranked par défaut seulement si la saison en cours en a**, sinon Normal. Les saisons stockées (au plus 3, souvent 2) |
| « Morts » = `losses` de l'API | Libellé **Défaites** (parties sans top 1) ; le K/D PUBG est kills ÷ défaites |
| Pas de bandeau : le mode (Squad, Duo, Solo) était enfoui dans le panneau | Bandeau sur une ligne : mode Tous / Squad / Duo / Solo (`?mode=`, un mode sans données est désactivé) et synchro. Page sans période : exception nommée à sticky.md §2, **docké aussi sur mobile** (`MOBILE_DOCKING_WITHOUT_PERIOD`) |
| Bouton « Rafraîchir » pour tout le monde — la route POST refuse un visiteur | `SyncStatus` + `useCanRefreshMember` (partagés avec les Armes d'un joueur) : bouton pour un membre connecté du clan ou un SuperUser, qui rafraîchit carrière **et** saisons ; sinon « Synchro PUBG il y a N h » |
| Libellé de saison « Saison pc-2018-43 » (découpage sur le point) | « Saison 43 » (`seasonLabel`) |

## 2. La page

- **Plaque militaire** gravée au pseudo PUBG, clan et tag, top 1 × N, K/D, parties et mode ; **états de service** :
  chicken dinners, kills, ratio K/D, dégâts, puis parties, taux de top 1 et assists. Suivent le mode.
- **Saisons** : bascule Ranked / Normal. En Ranked, écusson du palier, points, meilleur palier de la saison, barre
  jusqu'au palier suivant ; les saisons côte à côte (points, parties, top 1). En Normal : squad, parties, top 1, K/D,
  dégâts par partie.
- **Vitrine du clan** : toutes les stats médaillées, chacune avec sa médaille et sa valeur, et le compte par couleur.
  Toujours calculée tous modes (« Calculée sur tous les modes. » hors « Tous »).
- **Hauts faits** : kill le plus long, série max, survie max, roadkills, véhicules détruits.
- **Fiches** : la médaille apparaît sur la ligne concernée en mode « Tous » ; une phrase calculée sous trois fiches
  (chicken dinner toutes les N parties, soins et boosts par partie, traversées d'Erangel à pied, 8 km).
- Changer de mode ne recharge rien ; la synchro garde la page, estompée, pendant le rechargement.

Logique pure : `src/lib/player-career.ts`. Composants : `src/components/player-career/CareerSections.tsx`.

## 3. Routes

| Route | Contrat |
|---|---|
| `GET /api/members/[id]/stats` | `{ memberId, member: { displayName, pubgPlayerName, clanId, clan: { name, tag } }, stats, statsByMode, clanRanks, lastRefreshedAt }`. `clanRanks` : clés de `MEDAL_METRICS` — sans `combat.deaths`, `victory.losses`, `combat.suicides`, `combat.teamkills`, avec la nouvelle clé `victory.winRate`. Sans cache, un appel à l'API PUBG (inchangé) |
| `POST /api/members/[id]/stats` | Rafraîchit la carrière (même réponse) |
| `GET|POST /api/members/[id]/season-stats` | Inchangées ; la synchro additionne squad TPP + FPP |
| `GET /api/members/[id]/calendar` | **Nouvelle** : `{ today, days: [{ date, games, wins }], hours[24] }` — parties **officielles** des 5 dernières semaines par journée de jeu (`sessionDateOf`), top 1, parties par heure de Paris |

## 4. Tableau de bord : calendrier et carte Carrière

La dernière ligne du tableau de bord est divisée en deux : les 5 dernières parties et la **carte Carrière PUBG** (mini
plaque « ×N top 1 », K/D, kills, palier Ranked de la saison en cours, médailles d'or dans le clan, lien vers la page) à
gauche ; le **calendrier** à droite.

Calendrier : 5 semaines du lundi au dimanche, la dernière est la semaine en cours ; une case par journée de jeu,
colorée selon le nombre de parties (1, 2-3, 4-5, 6+), un point doré les jours de top 1, aujourd'hui entouré, jours
futurs vides. Les jours hors de la période du tableau de bord sont estompés (semaine et mois calendaires). En bas : jours
joués sur les jours écoulés, jour favori, créneau favori (les deux heures consécutives les plus jouées, heure de Paris,
passage de minuit compris). **Aucun lien** : la carte se lit seule (la puce « Calendrier » des pages du joueur ouvre la
carte d'activité `/members/[id]/heatmap`, autre page). Parties officielles (décision du 2026-09-27), comme les chiffres
clés.

Relevé du 2026-09-27 (joueur 75) : 15 journées jouées sur 35, lundi, 20 h – 22 h.

## 5. Données et contrôle

`npx tsx scripts/check-member-career.ts [memberId]` (lecture seule) : carrière stockée, saisons et paliers, fraîcheur,
égalités des médailles, parties par jour.

**Libellé du menu** : la puce du joueur dit encore « Stats globales » — le libellé vient de la table `NavItem` (base de
production). Pour afficher « Carrière PUBG » : `/settings/nav-permissions`, libellé de `member.stats` (surcharge
`labelOverride`). L'icône (médaille) est dans le code (`src/lib/nav-icons.ts`).

## 6. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/player-career.test.ts` | Médailles (stats retenues, ex æquo, valeur nulle), vitrine et compteurs, fiches et phrases, paliers et palier suivant, saisons, calendrier (fenêtre, niveaux, période, jours joués, jour et créneau favoris) |
| `src/lib/player-career-route-contracts.test.ts` | `stats` : plaque, médailles du clan (pas de teamkills, membres actifs) ; `calendar` : journée de jeu de 06:00 à 06:00, parties officielles, heures de Paris |
| `src/lib/pubg-lifetime-engagement.test.ts` | Records d'une partie : maximum entre modes ; saison normale TPP + FPP |
| `src/lib/ui-conformance.test.ts` | Page à bandeau, exception « sans période, docké sur mobile » |
| `e2e/career.spec.ts` | Plaque et états de service par mode (`?mode=`, Solo désactivé), saisons (Ranked par défaut, palier suivant, Normal), vitrine et médailles des fiches en « Tous » seulement, hauts faits et phrases, synchro visiteur et membre connecté, bandeau docké sur une ligne. Données : `e2e/support/career.ts` |
| `e2e/members.spec.ts` | Tableau de bord : calendrier (35 cases, top 1, jours joués, créneau, aucun lien) et carte Carrière |
