# Page « Cartes » du clan — brief de refonte

> **Décisions du 2026-10-23.** Refonte de `/clans/[clanId]/stats/heatmap-kills` en page **Cartes** du clan, sur le
> modèle de la page Cartes du joueur (`/members/[id]/map-stats`). Nouvelle adresse `/clans/[clanId]/stats/maps`
> (l'ancienne redirige), ouverte aux visiteurs, liens remis dans le menu et les pages du clan. Blocs retenus :
> performance par carte, verdict et joueur phare, comparaison aux autres clans et tendance. Écarté pour cette version :
> villes d'atterrissage et de combat par carte.
> *Destiné à l'équipe de développement et à Claude Design (prompt au §5).*
>
> **Livré le 2026-10-23** (maquette « Cartes clan - Fait ») — fiche de la fonctionnalité :
> [features/cartes-clan.md](../features/cartes-clan.md). Les chiffres des §2 et §3 sont ceux mesurés pour le brief.

## 1. Constat — la page actuelle

- Titre et bandeau de développement visibles des visiteurs : « Vue map-level pour preparer la couche geospatiale
  detaillee », « Heatmap geospatiale fine non disponible avec parser v1… ».
- Chiffres sans sens pour un joueur : « Kill events » compte **tous les kills du lobby** (≈ 93 par partie, pas ceux du
  clan), « Position events » compte des points GPS bruts (582 166).
- Clés techniques affichées (`Zulu_Main`), pas de hero, pas de bandeau de filtres de la charte.
- Menu : l'entrée « Heatmap kills » (`clan.heatmap-kills`) est réservée au SuperUser en base (`roleOverride =
  superuser`) ; la page Cartes du joueur, elle, est ouverte à tous.

## 2. Données — à compter par **partie d'escouade**

Une partie = un `SquadMatch` auquel au moins un membre du clan a participé ; placement, kills (`totalKills`) et dégâts
(`totalDamage`) sont ceux de l'équipe. **Ne pas** reprendre l'agrégat `scope=clan` de `/api/members/[id]/map-stats`,
qui compte une ligne par joueur et par partie : sur 30 jours, 47R y a « 934 parties » et « 50 Top 1 » sur Erangel
pour 324 parties et 20 Top 1 réelles.

Mesuré le 2026-10-23 (lecture seule, 47RONIN47 `[47R]`, clan 292, parties officielles, 30 derniers jours) :

| Carte | Parties | Top 1 | Win rate | Top 10 | Place moy. | Kills / partie | Dégâts / partie | Top 10 moy. des clans | Top 10 période préc. |
|---|---|---|---|---|---|---|---|---|---|
| Erangel | 324 | 20 | 6,2 % | 47 % | 12,9 | 4,2 | 681 | 48 % | 60 % |
| Sanhok | 105 | 10 | 9,5 % | 55 % | 11,3 | 4,7 | 636 | 48 % | — (2 parties) |
| Vikendi | 73 | 4 | 5,5 % | 52 % | 11,9 | 4,0 | 625 | 49 % | 50 % |
| Rondo | 68 | 4 | 5,9 % | 47 % | 13,0 | 4,6 | 694 | 51 % | 72 % |
| Paramo | 57 | 12 | 21,1 % | 60 % | 8,3 | 4,8 | 698 | 62 % | 70 % |
| Karakin | 57 | 11 | 19,3 % | 72 % | 7,6 | 4,7 | 601 | 66 % | 68 % |
| Deston | 38 | 4 | 10,5 % | 53 % | 11,4 | 5,5 | 800 | 50 % | — (2 parties) |
| Miramar | 19 | 5 | 26,3 % | 63 % | 9,5 | 7,8 | 1 128 | 50 % | — (3 parties) |
| Taego | 5 | 1 | 20,0 % | 60 % | 7,6 | 6,8 | 1 248 | 52 % | — |

Moyenne des clans : toutes les parties officielles des 37 clans suivis sur la même période, carte par carte.

Joueur phare (au moins 10 parties sur la carte, kills par partie) : Erangel Twitch_Niouskk 2,63 (63 parties) ; Sanhok
Twitch_Niouskk 2,52 ; Vikendi NovakTV 2,96 ; Rondo NovakTV 2,79 ; Paramo Twitch_Niouskk 3,00 ; Karakin Menez69 2,94
(100 % de Top 10) ; Deston Twitch_Niouskk 3,00 ; Miramar NovakTV 2,64.

## 3. Règles proposées

- **Échantillon** : sous 10 parties, la tuile est estompée, marquée « échantillon faible », sans verdict ni comparaison.
- **Verdict** (bandeau en tête, cartes d'au moins 10 parties) :
  - *Carte forte* : plus grand écart de Top 10 au-dessus de la moyenne des clans (Miramar, +13 pts) ;
  - *Carte à travailler* : plus grand écart en dessous (Rondo, −4 pts, et −25 pts sur la période précédente) ;
  - *Carte la plus jouée* : part des parties (Erangel, 43 %).
- **Comparaison** : chaque indicateur clé (Top 10, place moyenne, kills / partie) porte son écart à la moyenne des
  clans, en couleur (au-dessus en `--pos`, en dessous en `--neg`) ; pas de couleur sous l'échantillon minimal.
- **Tendance** : écart à la période précédente de même durée, en `RankMovement`-like ▲ / ▼ ; rien si la période
  précédente compte moins de 10 parties (règle « Tendances » de la charte : ne rien afficher plutôt que « • »).
- **Joueur phare** : membre actif avec le plus de kills par partie sur la carte, au moins 10 parties ; son nom renvoie
  à sa page Cartes.

## 4. Accès et liens

- Adresse `/clans/[clanId]/stats/maps` ; `/clans/[clanId]/stats/heatmap-kills` redirige (liens déjà publiés).
- Menu « Mon clan » : entrée **« Cartes »** (clé `clan.heatmap-kills` gardée : elle sert de garde d'API), rôle
  « aucun » au lieu de `superuser` en base, rangée avec « Style de jeu du clan » et « L'armurerie du clan ».
- Vue d'ensemble : groupe « Progresser », avec l'indice « carte forte : … ».
- Page Style de jeu du clan : carte de lien vers Cartes, comme la page Style de jeu du joueur.
- SEO : `CLAN_PAGES` (`src/lib/seo/page-seo.ts`), chemin `/stats/maps`, libellé « Cartes ».
- Après la refonte : la route `/api/clans/[clanId]/telemetry/heatmap`, qui ne sert qu'à l'ancienne page, disparaît.

## 5. Prompt pour Claude Design

Joindre les deux captures de référence :
`C:\Users\Pagnol\AppData\Local\Temp\claude\d--Sources-pubg-clan-site\205a3223-7f94-4949-80c2-33abe4244122\scratchpad\maps-member.png`
(page Cartes du joueur, le modèle) et
`C:\Users\Pagnol\AppData\Local\Temp\claude\d--Sources-pubg-clan-site\205a3223-7f94-4949-80c2-33abe4244122\scratchpad\maps-clan.png`
(page actuelle du clan, à remplacer).

```text
Conçois la page « Cartes » d'un clan PUBG pour le site chickendinner.fr (statistiques de clans PUBG: BATTLEGROUNDS,
en français, tutoiement). Elle remplace une page technique (capture « maps-clan.png ») et doit ressembler à la page
« Cartes » d'un joueur, déjà refaite (capture « maps-member.png ») : même hero, même bandeau de filtres, mêmes tuiles
par carte. Lecteurs : les membres du clan et les visiteurs (page publique, sans connexion).

Charte à respecter (celle de la capture du joueur) :
- thème sombre par défaut (fond bleu nuit, panneaux légèrement plus clairs, bord fin), thème clair à prévoir aussi ;
- accent jaune or pour tout état actif (période choisie, tri, puce active) ; couleurs sémantiques vert = mieux,
  rouge = moins bien, bleu ciel = information, orange = attention ;
- titre du hero en capitales condensées (police Teko), sur une photo de carte papier ;
- chiffres en grand et gras, libellé court dessous ; médailles or / argent / bronze pour les 3 premières tuiles ;
- largeur de contenu 1024 px, version mobile 375 px sans défilement horizontal (rangées trop larges : pagination
  par chevrons, pas de scroll).

Structure de la page, de haut en bas :
1. Hero : « LES CARTES DU CLAN », sous-titre « Où [47R] gagne, où il perd des places, et qui porte l'escouade sur
   chaque carte. » Fil d'Ariane « Retour à Vue d'ensemble ».
2. Bandeau de filtres collant : Période (Semaine · Mois · Tous), Type de partie (Normal · Ranked · Casual ·
   Tournois). Quand il est docké, il rappelle le tri actif.
3. Verdict (3 cartes côte à côte, une ligne paginée par chevrons sur mobile) :
   - Carte forte : Miramar — 63 % de Top 10, +13 pts au-dessus de la moyenne des clans ;
   - Carte à travailler : Rondo — 47 % de Top 10, 4 pts sous la moyenne, en baisse de 25 pts sur la période
     précédente ;
   - Carte la plus jouée : Erangel — 324 parties, 43 % du total.
4. « Performance par carte » + « Trier par » (Parties, Top 1, Win rate, Top 10, Place moyenne, Kills / partie,
   Dégâts / partie) et bouton d'ordre. Une tuile par carte, image de la carte en tête, médaille pour le top 3 du tri :
   - ligne principale : Parties · Top 1 · Win rate · Top 10 ;
   - ligne secondaire : Place moyenne · Kills / partie · Dégâts / partie ;
   - sous Top 10, Place moyenne et Kills / partie : un petit écart à la moyenne des clans (« +7 pts vs clans »,
     vert ou rouge) et une tendance ▲ / ▼ sur la période précédente (rien quand elle n'est pas connue) ;
   - pied de tuile : « Joueur phare » — pseudo + « 2,63 kills / partie · 63 parties », cliquable.
   Une tuile de moins de 10 parties est estompée et marquée « échantillon faible », sans écart ni tendance.
5. Pied de section : une phrase de méthode — « Une partie = une partie d'escouade du clan ; moyenne des clans : les
   37 clans suivis, sur la même période et le même type de partie. »

Données réelles à utiliser (47RONIN47, [47R], 30 derniers jours, parties normales) :
Carte | Parties | Top 1 | Win rate | Top 10 | Place moy. | Kills/partie | Dégâts/partie | Top 10 moyen des clans | Top 10 période précédente | Joueur phare
Erangel | 324 | 20 | 6,2 % | 47 % | 12,9 | 4,2 | 681 | 48 % | 60 % | Twitch_Niouskk 2,63 (63 parties)
Sanhok | 105 | 10 | 9,5 % | 55 % | 11,3 | 4,7 | 636 | 48 % | — | Twitch_Niouskk 2,52 (25)
Vikendi | 73 | 4 | 5,5 % | 52 % | 11,9 | 4,0 | 625 | 49 % | 50 % | NovakTV 2,96 (28)
Rondo | 68 | 4 | 5,9 % | 47 % | 13,0 | 4,6 | 694 | 51 % | 72 % | NovakTV 2,79 (24)
Paramo | 57 | 12 | 21,1 % | 60 % | 8,3 | 4,8 | 698 | 62 % | 70 % | Twitch_Niouskk 3,00 (19)
Karakin | 57 | 11 | 19,3 % | 72 % | 7,6 | 4,7 | 601 | 66 % | 68 % | Menez69 2,94 (16)
Deston | 38 | 4 | 10,5 % | 53 % | 11,4 | 5,5 | 800 | 50 % | — | Twitch_Niouskk 3,00 (11)
Miramar | 19 | 5 | 26,3 % | 63 % | 9,5 | 7,8 | 1 128 | 50 % | — | NovakTV 2,64 (14)
Taego | 5 | 1 | 20,0 % | 60 % | 7,6 | 6,8 | 1 248 | 52 % | — | — (échantillon faible)

Vocabulaire imposé : Parties, Top 1, Win rate, Top 10, Place moyenne, Kills, Dégâts. Jamais de termes techniques
(« events », clés comme « Baltic_Main », « parser ») ni de vouvoiement.

États à montrer aussi : chargement (squelettes des tuiles, jamais de faux zéros), aucune partie sur la période
(message et lien « Voir tout l'historique »), changement de filtre (tuiles précédentes gardées, estompées, pendant le
rechargement).

Livre : la page en thème sombre et en thème clair, en 1280 px et en 375 px.
```

## 6. Après la maquette — fait le 2026-10-23

Tout est fait, sauf deux points :

- l'indice « carte forte : … » de la vue d'ensemble n'est pas fait : il demanderait une lecture de plus dans la vitrine
  du clan ;
- l'adresse de l'entrée de menu en base se corrige après le déploiement par `scripts/cleanup-admin-nav.ts` ; le rôle
  et le libellé « Cartes » ont été corrigés le 2026-10-23.

Écart à la maquette : les écarts de place et de kills aux autres clans, qui y étaient des valeurs d'exemple, sont
calculés.

1. Route `GET /api/clans/[clanId]/map-stats?period=&matchType=` : agrégats par partie d'escouade, moyenne des clans
   (cache mémoire 5 min, comme la ligue), période précédente, joueur phare ; garde `requireNavPermission('clan.heatmap-kills')`.
2. Page `/clans/[clanId]/stats/maps` d'après la maquette (charte : `DockingToolbar`, `PeriodFilter` +
   `usePagePeriod`, `MapImage`, médailles `RankCell`, `ChevronPager`) ; ajout à `ui-conformance.test.ts`.
3. Redirection de l'ancienne adresse, menu, vue d'ensemble, Style de jeu, SEO (§4) ; entrée de menu rouverte en base.
4. Tests : agrégats par escouade (pas par joueur), règles d'échantillon, verdict et tendance (Vitest), e2e de la page
   en visiteur, clair et sombre, 1280 et 375 px.
