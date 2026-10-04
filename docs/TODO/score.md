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

## Hors périmètre

Ne pas ajouter de bonus ou de coefficient par mode (duo / trio / squad) : ce sera traité à
part, une fois la nouvelle formule validée.
