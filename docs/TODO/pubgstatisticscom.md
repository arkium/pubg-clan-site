# Analyse Comparative : PUBGStatistics.com vs Notre Projet (pubg-clan-site)

> **Document de référence & d'inspiration produit**  
> Analyse du site [pubgstatistics.com](https://pubgstatistics.com/player/D1) (profil exemple `/player/D1`, `/squad`, `/global`, `/weapons`, `/maprotation`).  
> Rapprochement avec l'architecture et les données existantes de `pubg-clan-site`.

---

## 1. Vue d'ensemble de PUBGStatistics.com

**PUBGStatistics.com** est un tracker PUBG moderne, épuré et centré sur l'analytique poussée du joueur et de son escouade.

### Principes UI / UX remarquables :
* **Design System sobre et ultra-dense** : Dark mode natif, cartes à bordures nettes (*sharp borders*), typographie Geist Sans / Geist Mono, badges de métriques compacts (*chips*), indicateurs colorés par thématique (`destructive` pour le combat, `chart-2` pour le support, `primary` pour le classement).
* **Tooltips explicatifs sur chaque KPI** : Chaque ratio ou formule est documenté directement au survol (ex: explication exacte de ce qui compte ou ne compte pas pour le blue zone, les bots ou le team damage).
* **Normalisation des métriques** : Par exemple, les courbes de survie et le *Kill Flow* sont étirés / normalisés sur 25 minutes pour permettre des comparaisons rigoureuses d'un match à l'autre, quelle que soit la durée réelle.

---

## 2. Décomposition des Statistiques et Fonctionnalités du Profil Joueur (`/player/[name]`)

Le profil joueur propose une granularité rarement vue sur les trackers grand public (comme PUBG.op.gg ou Tracker.gg) grâce à l'exploitation fine des événements de match et de télémétrie :

### 2.1. Métriques de Combat & Létalité (*Combat & Lethality*)

| Métrique | Description & Formule | Particularité / Intérêt |
|---|---|---|
| **K/D & KDA** | `Kills / Deaths` et `(Kills + Assists) / Deaths`. | Les morts incluent la zone bleue et les chutes. |
| **Human vs Bot Kills** | Distingue les kills réels des bots (ex: *2 131 humains, 123 bots* = 5% Bot Kill Rate). | **Essentiel** aujourd'hui sur PUBG pour évaluer le vrai niveau sans biais bot. |
| **Combat Ratio** | `(Kills + Knocks sans kill) / (Deaths + Knocks survécus)` | Mesure le ratio net des duels gagnés vs perdus, en valorisant un knock même si l'ennemi a été ranimé ou volé. |
| **Knock Ratio** | `Knocks non convertis vs Knocks subis mais relevés` | Indique si le joueur a tendance à coucher des ennemis sans les finir ou à se faire relever souvent par ses équipiers. |
| **Kills / 100 Dmg** | `(Kills / Dégâts) * 100` (ex: 0.57 kills/100 dmg = 174 dmg par kill). | Mesure l'efficience de finition. Un joueur bas "arrose" beaucoup sans concrétiser ; un joueur haut est un finisseur chirurgical. |
| **Kills Volés (*Kill Steals*)** | • **Kills que tu as volés** (*Kills you stole*)<br>• **Kills qui t'ont été volés** (*Stolen from you*) | Analyse les dégâts majoritaires : si un allié met 90% des dégâts et que tu mets la dernière balle, c'est un kill volé. Statistiques très ludiques pour une communauté de clan ! |
| **Distance Moyenne de Kill** | Distance moyenne en mètres sur les frags. | Positionnement sniper vs assaut. |

---

### 2.2. Métriques d'Engagement & Pression (*Engagement Spread*)

Ces métriques exploitent les événements de dégâts (*Damage Events*) de la télémétrie pour évaluer comment le joueur anime les combats :

| Métrique | Définition & Formule | Interprétation |
|---|---|---|
| **Damage Ratio** | `Dégâts infligés aux humains / Dégâts reçus des humains` | Exclut la zone bleue et les chutes. Ratio > 1 = inflige plus qu'il n'encaisse. |
| **Players You Hurt** | Nombre moyen d'adversaires humains distincts touchés par match. | Reflète la largeur d'engagement et la prise d'information active. |
| **Players Hurting You** | Nombre moyen d'adversaires humains distincts qui touchent le joueur par match. | Indique si le joueur s'expose à des tirs croisés multi-angles. |
| **Player Pressure** | `Players You Hurt / Players Hurting You` | Si > 1, le joueur touche plus d'adversaires distincts qu'il n'en subit. |
| **Teams You Hurt** | Nombre moyen d'équipes ennemies distinctes touchées par match. | Mesure la pression exercée sur le lobby (prise à partie de plusieurs rosters). |
| **Team Pressure** | `Teams You Hurt / Teams Hurting You` | Si > 1, le joueur initie les combats plus souvent qu'il ne se fait surprendre / cibler. |

---

### 2.3. Métriques de Soutien (*Support*)

| Métrique | Description |
|---|---|
| **Revive Ratio** | `Coéquipiers ranimés / Fois où un coéquipier t'a ranimé` (ex: 1.49 = grand secouriste). |
| **Ammo Given** | Nombre total de munitions données/jetées au sol pour l'équipe (extrait de la télémétrie d'inventaire). |
| **Smokes Used** | Nombre de fumigènes utilisés (badge WIP). |

---

### 2.4. Visualisations Graphiques & Modules Visuels

1. **Activity Grid (Calendrier style GitHub)** :
   - Grille de contribution annuelle affichant chaque jour joué avec un carré dont l'opacité dépend du volume de parties.
   - Permet de voir la régularité et les périodes d'activité en un clin d'œil.
2. **Damage per Day (Points Trend)** :
   - Graphique linéaire / aire montrant l'évolution des dégâts moyens jour par jour dans le temps.
3. **Kill Flow (Timeline normalisée sur 25 minutes)** :
   - Chaque match est normalisé sur une échelle de 25 minutes pour aligner les événements (early drop, mid game, end game) et voir où se concentrent les kills et les morts du joueur.
4. **Distribution des Frags (*Kills per match*)** :
   - Histogramme montrant la fréquence des matchs à 0 frag, 1 frag, 2 frags, 3 frags, 4 frags, 5+ frags.
5. **Distribution des Dégâts (*Damage per match*)** :
   - Histogramme par tranches de dégâts (0, 50+, 100+, 150+, 200+, 300+, 500+...).
6. **Chronobiologie & Heures de jeu** :
   - **When you play** : Répartition des parties par heure de la journée (dans le fuseau horaire du joueur).
   - **Performance by hour** : K/D moyen selon l'heure de la journée (joue-t-on mieux à 14h ou à 23h ?).
7. **Durée de session (*Matches in a session*)** :
   - Fréquence des sessions selon leur longueur (combien de fois le joueur s'arrête à 1 match, 2-3 matchs, ou enchaîne 7+ matchs).
8. **Statistiques par Carte (*Map stats at a glance*)** :
   - Tableau avec : parties, victoires, win rate %, top 10 %, placement moyen, kills moyens, dégâts moyens, et **Map Score** composite (note de 0 à 10).

---

## 3. Les Autres Pages du Site PUBGStatistics

### 3.1. Escouade (`/squad`)
* Analyse multi-joueurs pour une squad fixe ou un groupe d'amis.
* Onglets :
  * **General** : Bilan global de l'escouade.
  * **Matches** : Historique groupé des matchs joués ensemble.
  * **Landings** : Cartographie des atterrissages communs.
  * **Heatmaps** : Carte de chaleur des combats de l'escouade.
  * **Maps** & **Weapons** : Cartes et armes favorites du groupe.

### 3.2. Statistiques Globales (`/global`)
* Métriques poolées sur l'ensemble de la base de données :
  * Répartition FPP vs TPP.
  * Distribution globale du K/D et du Win Rate (pour savoir où un joueur se situe par rapport à la moyenne mondiale).
  * Heatmaps globales des champs de bataille.

### 3.3. Armurerie & Calculateur de Dégâts (`/weapons`)
* Outil de comparaison d'armes côte-à-côte à jour du patch actif (ex: patch 43.1).
* **Simulateur de dégâts réel avec sélecteur de hitbox et d'armure** :
  * Choix de la zone d'impact (Tête, Cou, Torse, Bras, Mains, Jambes, Pieds).
  * Sélection du Casque (Niveau 0, 1, 2, 3) et du Gilet pare-balles (Niveau 0, 1, 2, 3).
  * Calcul automatique du **TTK** (*Time To Kill* en ms) et des **HTK** (*Hits To Kill* - nombre de balles nécessaires).
* Historique des patch notes d'équilibrage des armes (`/weapons/patch-notes`).

### 3.4. Rotation des Cartes (`/maprotation`)
* Carte des maps actives en normal et en ranked pour le patch en cours.
* Emplacement des **salles secrètes** (*Secret Rooms*), clés de sécurité, emergency pickups et véhicules garantis.

---

## 4. Comparatif Direct : PUBGStatistics.com vs Notre Projet (`pubg-clan-site`)

### 4.1. Matrice Fonctionnelle

| Domaine | PUBGStatistics.com | Notre Projet (`pubg-clan-site`) | Verdict / Synergie |
|---|---|---|---|
| **Périmètre & Cœur de cible** | Tracker public individuel & groupes d'amis libres. | **Site de Clan communautaire** (identité, gestion, membres, rôles, sous-domaines). | **Notre plateforme est plus profonde sur la dimension collective/clan.** |
| **Gestion & Identité de Clan** | ❌ Aucune gestion de clan, pas de rôles ni de permissions. | ✅ Cycles de vie complets, invitations, superuser, multi-tenancy (`smk.chickendinner.fr`), classements inter-clans. | Victoire nette de notre projet. |
| **Observatoire des Adversaires** | ❌ Inexistant (ne suit que le joueur recherché). | ✅ **Observatoire complet** : `EncounteredPlayer`, clans adverses croisés, page Némésis, historique des rivalités. | Exclusivité majeure de notre projet. |
| **Replay & Débrief Télémétrique** | ⚠️ Partiel (heatmaps, kill flow, graphiques d'impact). | ✅ **Replay 2D interactif**, trajectoires de phase, safe zones, débrief complet par match (`/telemetry`). | Notre débrief tactique est supérieur. |
| **Métriques d'Engagement & Pression** | ✅ **Très poussé** (Combat ratio, Team pressure, Player pressure, Damage ratio). | ⚠️ Partiel (scores d'agressivité, support et discipline de zone, mais pas les ratios de pression d'équipes). | **Excellente source d'inspiration pour enrichir nos stats !** |
| **Kills Volés (*Kill Steals*) & Bots** | ✅ Différenciation Bots vs Humains, détection des frags volés / subis. | ⚠️ Pas encore de détection de kill steal ni de ventilation explicite Bots vs Humains sur le dashboard. | **À importer rapidement dans notre projet.** |
| **Support & Partage d'inventaire** | ✅ Revive ratio, munitions données (*Ammo given*), fumigènes. | ⚠️ Revives comptabilisés, mais pas le Revive Ratio ni l'échange de munitions. | Notre modèle `MemberItemUseStat` stocke déjà les consommables : facile à exploiter. |
| **Visualisations & Graphiques** | ✅ Activity grid (GitHub), Kill Flow, performances par heure, histogrammes de distribution. | ⚠️ Graphiques de progression et radar, mais pas encore de heatmap calendrier ni de breakdown horaire. | **Inspiration forte pour la page dashboard & stats.** |
| **Armes & Dégâts** | ✅ Calculateur TTK/HTK interactif par hitbox et niveau d'armure. | ⚠️ Maîtrise d'armes et stats de tirs, mais pas de simulateur balistique. | Outil standalone très utile à envisager. |
| **Tournois & Défis** | ❌ Aucun. | ✅ Tournois organisés avec barèmes de points, défis de clan et récompenses. | Exclusivité de notre projet. |

---

## 5. Ce que nous pouvons intégrer dans notre projet (Opportunités & Backlog)

Nos tables Prisma actuelles (`SquadMatchTelemetry`, `KillEvent`, `MemberTelemetryStats`, `damageSamplesGz`, `killFeedSamplesGz`, `MemberItemUseStat`) contiennent **déjà 95% des données brutes nécessaires** pour calculer les métriques de PUBGStatistics sans surcoût d'API PUBG !

### 🏆 Priorité 1 : Les Ratios d'Engagement & de Combat (Quick Wins à forte valeur ajoutée)
1. **Ratio Dégâts Infligés / Reçus (*Damage Ratio*)** :
   - Déjà calculable via `damageDealt` et `damageTaken` (en filtrant les dégâts de zone bleue/chute déjà annotés dans nos blobs de télémétrie).
2. **Filtrage Bots vs Humains (*Bot Kill %*)** :
   - L'API PUBG renseigne les bots via le préfixe ou l'identifiant de compte. Afficher le % de bots dans le dashboard évite de biaiser les analyses.
3. **Kills Volés & Concédés (*Kill Steals*)** :
   - En analysant `damageSamplesGz` : si le joueur A met ≥ 60% des dégâts sur un adversaire mais que le joueur B met le coup fatal, incrémenter `stolenFromA` et `stolenByB`.
   - Idéal pour les stats de clan (créateur de rivalités amusantes entre coéquipiers).
4. **Combat Ratio & Knock Ratio** :
   - `(Kills + Knocks sans frag) / (Morts + Knocks survécus)`.

### 📊 Priorité 2 : Nouvelles Visualisations UI
1. **Activity Grid (Heatmap Calendrier)** :
   - Une grille type GitHub des 365 derniers jours montrant l'activité du joueur ou du clan.
   - Très valorisant visuellement sur le profil membre.
2. **Performance par Heure (*Chronobiologie*)** :
   - Exploiter le timestamp des matchs pour afficher un histogramme du K/D et des dégâts selon l'heure de début du match (ex: de 18h à 02h).
3. **Distributions (Histogrammes de kills & de dégâts)** :
   - Graphique en barres : % de parties à 0 kill, 1 kill, 2-3 kills, 4-5 kills, 6+ kills.

### 🛠️ Priorité 3 : Outils Complémentaires
1. **Calculateur de TTK / Hitbox Armes (`/weapons`)** :
   - Un onglet interactif permettant aux membres du clan de tester l'impact d'une Beryl vs ACE32 sur un gilet 2 ou un casque 3.
2. **Widget Rotation des Cartes** :
   - Affichage de la rotation du patch actif avec cartes interactives des pièces secrètes et points d'intérêt tactiques.

---

## 6. Synthèse & Prochaines Étapes

PUBGStatistics.com excelle dans la **mise en scène mathématique et visuelle des combats** (ratios de pression, combat ratio, efficience de kill, visualisations temporelles).  
Notre projet `pubg-clan-site` possède une base de données beaucoup plus riche sur le plan collectif, tactique et territorial (clans, observatoire, replay 2D, tournois, sous-domaines).

En intégrant les indicateurs d'engagement et les visualisations de PUBGStatistics, `pubg-clan-site` disposera du **système de statistiques le plus complet et le plus pointu de tout l'écosystème PUBG**.
