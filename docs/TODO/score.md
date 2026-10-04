Je veux changer le calcul du Power Score de la Ligue Inter-Clans (/clans-leaderboard).

## Pourquoi

Le calcul actuel (src/lib/clan-league.ts, clanPowerScore) pose deux problèmes :

1. Il ne tient pas compte du nombre de parties. Un clan qui joue 1 partie et la gagne obtient
   100 % de win rate, soit 10 000 points, et reste premier toute la semaine devant des clans
   qui jouent tous les jours.
2. Le win rate pèse trop (environ la moitié du score) et c'est du tout ou rien : un top 2
   rapporte autant qu'une élimination en premier.

## Nouvelle formule

Étape 1 : score brut du clan sur la période

  Score brut = Points de placement moyens × 250
             + Dégâts moyens
             + Kills moyens × 10
             + Knocks moyens × 5

Les points de placement remplacent le win rate. Chaque partie rapporte des points selon la
place finale : 1er = 10, 2e = 6, 3e = 5, 4e = 4, 5e = 3, 6e = 2, 7e = 1, 8e = 1, au-delà = 0.
On fait la moyenne sur toutes les parties du clan dans la période. Dégâts, kills et knocks
restent calculés comme aujourd'hui (stats cumulées des membres actifs présents, moyenne par
partie).

Étape 2 : pondération par le volume

  Power Score = (n × Score brut + M × Score moyen de la ligue) / (n + M)

- n = nombre de parties du clan sur la période.
- M = 20 (constante réglable). Cela revient à ajouter 20 parties fictives au niveau moyen de
  la ligue : avec peu de parties, le score reste proche de la moyenne ; plus un clan joue,
  plus son propre niveau pèse.
- Score moyen de la ligue = le score brut calculé sur l'ensemble des lignes clan × partie de
  la même fenêtre [from, to), tous clans confondus (totaux mis en commun, puis formule de
  l'étape 1). Ne pas faire la moyenne des scores des clans : elle serait faussée par ceux qui
  n'ont joué qu'une partie.

Étape 3 : seuil de qualification

Un clan n'est classé que s'il a joué un minimum de parties sur la période : 5 pour la semaine,
15 pour le mois, 30 pour « Tous » (constantes réglables). En dessous, il n'a pas de rang et
apparaît dans un bloc séparé « En qualification » avec sa progression (par exemple
« 3 / 5 parties »). Ses parties comptent quand même dans le score moyen de la ligue.

## Implémentation

- Mettre le barème, le coefficient 250, M et les seuils en constantes nommées et exportées
  dans src/lib/clan-league.ts, pour qu'on puisse les régler sans toucher à la logique.
- standingsBetween doit appliquer la même règle quelle que soit la fenêtre : période en cours,
  période précédente (flèches) et classements soirée par soirée (fil de la ligue) doivent
  rester cohérents entre eux. Le fil, les titres et previousRank ne portent que sur les clans
  classés. Un clan qui franchit le seuil n'est pas un événement du fil (même logique que le
  « pas classé la veille » actuel).
- Ajouter les points de placement moyens à LeagueStanding et aux critères de classement
  (LEAGUE_CRITERIA). Garder le win rate comme critère et comme colonne : il reste affiché, il
  ne sert plus au Power Score.
- Les colonnes affichent toujours les valeurs brutes (win rate, dégâts, kills, knocks moyens).
  Seul le Power Score est pondéré.
- Chercher tous les usages de clanPowerScore dans le projet (annuaire, vue d'ensemble,
  comparateur, etc.). Il ne doit rester qu'une seule formule sur tout le site. Si un appelant
  n'a pas les places par partie ou le nombre de parties, ne pas improviser : me le signaler.
- Mettre à jour le texte d'explication du Power Score affiché sur la page, les tests
  (clan-league.test.ts) et docs/features/ligue-clans.md.
- Intégrer la séparation par type de partie :
  - Ajouter `competitive` (Ranked) à `ClanMatchTypeFilter` (src/types/squad-matches.ts).
  - Adapter `loadLeagueRows` (src/lib/clan-league-service.ts) pour qu'il accepte un filtre `matchType` au lieu de `WHERE sm.matchType = 'official'` en dur, et modifier la clé de cache (`cache.get`) en conséquence.
  - Ajouter un sélecteur de type de match (Normal, Ranked, Casual, Tournois/Custom) sur la page `/clans-leaderboard` et dans son API, pour permettre de visualiser le classement selon le type de partie.

## Vérification attendue

Avant de considérer le travail terminé, à partir des données réelles :

1. Me donner les moyennes de la ligue sur le mois en cours (points de placement, dégâts,
   kills, knocks) et la part de chaque terme dans le score moyen. L'objectif est que le
   placement représente environ 40 % du score. Si la part mesurée sort de la fourchette
   35-45 %, me proposer un coefficient ajusté, sans le changer de ta propre initiative.
2. Me montrer le classement du mois en cours avant et après (rang, parties, ancien score,
   nouveau score), avec les clans en qualification.
3. Ajouter des tests couvrant au minimum : un clan à 1 partie gagnée n'est pas classé ; à
   performance égale, le clan qui a le plus de parties est le moins tiré vers la moyenne ;
   une 2e place rapporte des points alors qu'elle ne comptait pas avant.
4. Contrôle E2E et Tests d'intégration :
   - S'assurer que le sélecteur de type de partie (Normal, Ranked, etc.) dans l'UI rafraîchit correctement le classement.
   - S'assurer par des tests que le filtre `matchType` récupère bien les parties correspondantes (notamment `competitive` pour Ranked) en ignorant les autres.

## Hors périmètre

Ne pas ajouter de bonus ou de coefficient par mode (duo / trio / squad) : ce sera traité à
part, une fois la nouvelle formule validée.

---

## État — implémenté le 2026-10-04

Fait selon ce cahier des charges : `src/lib/clan-league.ts` (formule, constantes, `leagueTableBetween`),
`src/lib/clan-league-service.ts` (filtre `matchType`, cache par période et type), route et page `/clans-leaderboard`
(sélecteur de type, bloc « En qualification », explication), tests unitaires, service (Prisma simulé) et e2e. Détail :
[ligue-clans.md](../features/ligue-clans.md) §1 bis.

### Analyse de cohérence du cahier des charges

1. **Une seule formule** : vérifié, `clanPowerScore` était déjà la seule. L'annuaire (`clan-directory-service`) et la
   vitrine de la vue d'ensemble (`clan-showcase-service`) ne lisent que le **rang** via `computeClansLeaderboard('month')`
   (type Normal) : rien à improviser. Ils n'affichent plus de rang pour un clan en qualification.
2. **Texte public oublié** : la vitrine de l'accueil (`HomeShowcase`) décrivait le score par « win rate, dégâts, kills et
   knocks » — corrigé (placement).
3. **Seuils communs à tous les types** : 5 / 15 / 30 parties valent pour Normal, Ranked, Casual et Tournois. Mesuré le
   2026-10-04, le mois ne classe que 3 clans en Ranked et **aucun** en Casual et en Tournois / Custom (0 / 10, 0 / 6
   en qualification). À trancher : seuils par type, ou accepter des classements vides hors Normal.
4. **Le placement pèse plus que prévu** : 48 à 51 % du score moyen selon la fenêtre (objectif 35-45 %), voir ci-dessous.
5. **Kills et knocks presque sans effet** : 3 % et 1,3 % du score moyen (× 10 et × 5 contre ~500 dégâts). Gardés tels
   quels (« comme aujourd'hui ») ; à revoir si on veut qu'ils comptent.
6. **Début de semaine** : le lundi, très peu de clans ont 5 parties — le classement de la semaine part presque vide et se
   remplit au fil des soirées (le bloc « En qualification » le montre).
7. **Titres** : ils ne portent plus que sur les clans classés ; le minimum de 3 parties des titres
   (`LEAGUE_TITLE_MIN_MATCHES`) devient sans effet (seuil ≥ 5), gardé si l'on baisse un seuil.
8. **Types de partie** : Normal = `official`, Ranked = `competitive`, Casual = `casual` + `airoyale` (lobbies de bots, seul
   type « casual » réellement présent en base), Tournois / Custom = `custom`. Les types `event` (284 parties sur 60
   jours), `arcade` et `rumble` ne comptent dans aucun classement. `custom` mélange tournois, TDM et « normal-solo ».
9. **`ClanMatchTypeFilter`** reçoit `competitive` ; les synergies écrites par le worker d'agrégats gardent leurs quatre
   types (rien de nouveau n'est écrit en base) et les parties Ranked restent dans « Tous » des pages de clan.

### Vérification (données réelles, lecture seule : `scripts/measure-league-score.ts`)

1. **Moyennes, mois en cours** (1er-4 octobre, Normal, 1 384 lignes) : points de placement 2,41 · dégâts 529,5 · kills
   3,60 · knocks 3,09 ; score moyen 1 182. Parts : placement **50,9 %**, dégâts 44,8 %, kills 3,0 %, knocks 1,3 %.
   Septembre : 48,0 % ; tout l'historique : 49,9 %. **Hors fourchette** : coefficient proposé **≈ 170** (161 à 181 selon
   la fenêtre) pour ramener le placement à 40 % — **non appliqué, décision attendue** (`PLACEMENT_WEIGHT`).
2. **Classement du mois avant / après** : sortie complète du script. Exemples : FrenchDucks, 1er avant (11 parties,
   6 120 points), passe en qualification (11 / 15) ; Les-Ratz, 2e avant, 1er après (123 parties) ; DEAD_NOOB 10e → 3e ;
   KeepMoveSurvive 26e → 15e. En qualification : FrenchDucks 11/15, D32 10/15, ONCRAINTDEGUN 6/15, bastian-french 3/15,
   NOZONE 1/15.
3. **Tests** : 1 partie gagnée non classée, plus de parties = moins tiré vers la moyenne, 2e place qui rapporte — et le
   filtre `matchType` (Ranked = `competitive` seul) côté service et e2e.

### Réglages (2026-10-04, suite)

Les constantes sont devenues des **réglages** modifiables par le SuperUser sur `/settings/league`
([ligue-clans.md](../features/ligue-clans.md) §5) : barème, coefficients, M, seuils **par type de partie et par période**,
zone et titres, avec un aperçu du classement avant enregistrement. Les deux décisions ouvertes ci-dessus — coefficient
du placement (≈ 170 proposé, affiché par la page avec un lien « appliquer ») et seuils hors Normal — s'y prennent sans
toucher au code. Sans enregistrement, les valeurs par défaut restent celles de ce document.
