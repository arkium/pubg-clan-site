# Lifetime Stats — Données disponibles, implémentation actuelle et conception des pages

Ce document décrit ce que l'API PUBG expose pour les statistiques de carrière (lifetime), ce qui est effectivement stocké et affiché aujourd'hui, puis propose la conception de deux pages — une pour le membre et une pour le clan — avec un filtre par mode de jeu.

Source de vérité du code :
- `src/lib/pubg.ts` — `PubgGameModeStats`, `fetchLifetimeStats()`
- `prisma/schema.prisma` — `MemberLifetimeStats`
- `src/app/api/members/[id]/stats/route.ts`
- `src/app/api/clans/[clanId]/lifetime-stats/route.ts`
- `src/app/clans/[clanId]/stats/page.tsx` — page clan déjà implémentée
- `src/app/members/[id]/stats/page.tsx` — page membre déjà implémentée

---

## Objectif — Deux pages

| Page | URL cible | Statut | Remarque |
|---|---|---|---|
| **Page membre** | `/members/[id]/stats` | ✅ Existe | Lifetime + saison + médailles, sans filtre mode |
| **Page clan** | `/clans/[clanId]/stats` | ✅ Existe | TOP 3 par métrique + telemetry playstyle, sans filtre mode |

Les deux pages existent mais **n'ont aucun filtre par mode de jeu**. Toutes les stats lifetime sont actuellement agrégées tous modes confondus (squad + duo + solo + leurs variantes FPP). L'objectif est d'ajouter la dimension mode.

---

## 1. Ce que l'API PUBG fournit — Endpoint Lifetime

`GET /shards/{shard}/players/{playerId}/seasons/lifetime`

Retourne `gameModeStats` avec **une entrée par mode** :

| Clé | Mode de jeu |
|---|---|
| `squad` | Escouade vue 3ème personne |
| `squad-fpp` | Escouade 1ère personne |
| `duo` | Duo vue 3ème personne |
| `duo-fpp` | Duo 1ère personne |
| `solo` | Solo vue 3ème personne |
| `solo-fpp` | Solo 1ère personne |

Certains shards exposent aussi une clé `all` qui agrège tous les modes.

### Champs disponibles par mode (type `PubgGameModeStats`, `src/lib/pubg.ts:126`)

| Champ API | Type | Description |
|---|---|---|
| `kills` | number | Kills totaux |
| `assists` | number | Assists |
| `damageDealt` | number | Dégâts infligés |
| `wins` | number | Victoires (1er place) |
| `losses` | number | Défaites |
| `revives` | number | Coéquipiers relevés |
| `dBNOs` | number | Ennemis mis à terre (knockouts) |
| `headshotKills` | number | Kills en headshot |
| `longestKill` | number | Distance du kill le plus long (mètres) |
| `maxKillStreaks` | number | Plus haute série de kills dans un match |
| `mostSurvivalTime` | number | Meilleur temps de survie dans un seul match (secondes) |
| `boosts` | number | Boosters consommés (total carrière) |
| `heals` | number | Soins consommés (total carrière) |
| `rideDistance` | number | Distance en véhicule cumulée (mètres) |
| `walkDistance` | number | Distance à pied cumulée (mètres) |
| `swimDistance` | number | Distance à la nage cumulée (mètres) |
| `vehicleDestroys` | number | Véhicules détruits |
| `roadKills` | number | Kills depuis un véhicule |
| `teamKills` | number | Kills d'alliés |
| `suicides` | number | Suicides |
| `weaponsAcquired` | number | Armes ramassées (total carrière) |

> **Ce que l'API ne fournit PAS en lifetime :** `top10s`, `avgRank`, `kda`, `deaths` (présents dans ranked) — ces champs n'existent que dans les endpoints season et ranked, pas en lifetime.

---

## 2. Ce qui est actuellement stocké — `MemberLifetimeStats`

La table stocke **6 colonnes JSON**, une par catégorie. Les modes sont tous **agrégés ensemble** — aucune distinction squad / duo / solo.

```
MemberLifetimeStats
├─ memberId (unique)
├─ combat   JSON
├─ victory  JSON
├─ support  JSON
├─ vehicle  JSON
├─ movement JSON
├─ other    JSON
└─ lastRefreshedAt
```

### Correspondance champ API → champ DB

| Catégorie DB | Champ DB | Champ API source | Mode agrégé |
|---|---|---|---|
| **combat** | `kills` | `kills` | Tous modes |
| | `deaths` | `losses` | Tous modes |
| | `kdRatio` | `kills / losses` (calculé) | Tous modes |
| | `headshots` | `headshotKills` | Tous modes |
| | `assists` | `assists` | Tous modes |
| | `knockouts` | `dBNOs` | Tous modes |
| | `highestKillstreak` | `maxKillStreaks` | Tous modes |
| | `longestKill` | `longestKill` | Tous modes |
| | `teamkills` | `teamKills` | Tous modes |
| | `suicides` | `suicides` | Tous modes |
| **victory** | `wins` | `wins` | Tous modes |
| | `losses` | `losses` | Tous modes |
| | `winLossRatio` | `wins / losses` (calculé) | Tous modes |
| | `longestTimeAlive` | `mostSurvivalTime` | Tous modes |
| **support** | `teammatesRevived` | `revives` | Tous modes |
| | `boostsUsed` | `boosts` | Tous modes |
| | `healed` | `heals` | Tous modes |
| **vehicle** | `vehiclesDestroyed` | `vehicleDestroys` | Tous modes |
| | `roadkills` | `roadKills` | Tous modes |
| **movement** | `drivenDistance` | `rideDistance` | Tous modes |
| | `walkedDistance` | `walkDistance` | Tous modes |
| | `swamDistance` | `swimDistance` | Tous modes |
| **other** | `weaponsPicked` | `weaponsAcquired` | Tous modes |
| | `damageGiven` | `damageDealt` | Tous modes |

**Tous les champs de `PubgGameModeStats` sont donc stockés** — la lacune principale n'est pas des champs manquants, c'est l'**absence de ventilation par mode de jeu**.

---

## 3. Champs disponibles mais non stockés

| Champ API | Remarque |
|---|---|
| Stats par mode individuel (`squad`, `duo`, `solo`…) | L'API retourne chaque mode séparément mais le code agrège tout via `aggregateGameModeStats()` ou prend la clé `all` |
| Matchs joués par mode | Calculable comme `wins + losses` par mode, mais non stocké |
| K/M (kills par match) par mode | Dérivé de `kills / (wins + losses)` par mode, mais non stocké |
| Win rate par mode | Dérivé de `wins / (wins + losses)` par mode, mais non stocké |

---

## 4. Ce qui est déjà affiché

### Page membre `/members/[id]/stats`

- **Résumé médailles** : encart avec comptage des médailles Or/Argent/Bronze + 4 KPI en-tête (wins, K/D, kills, dégâts)
- **Saison & ranked** : 3 dernières saisons (ranked + normal squad), bouton refresh
- **Stats lifetime complètes** via `MemberLifetimeStatsPanel` :
  - Groupe Combat : kills, deaths, K/D, headshots, assists, knockouts, kill streak, longest kill, teamkills, suicides
  - Groupe Victoires : wins, losses, W/L ratio, temps max en vie
  - Groupe Support : relèves, boosts, soins
  - Groupe Véhicules : véhicules détruits, roadkills
  - Groupe Déplacements : distance véhicule, pied, nage
  - Groupe Autres : armes ramassées, dégâts infligés
- Pour chaque métrique : **médaille clan** si le joueur est #1/#2/#3 parmi les membres actifs
- Aucun filtre par mode de jeu

### Page clan `/clans/[clanId]/stats`

- **Carte playstyle** (télémétrie) avec filtre semaine/mois/tous : aggression %, support %, discipline zone %, stats détaillées, TOP 3 agressifs/supports/disciplinés
- **TOP 3 par métrique** pour les 6 groupes (Combat, Victoires, Support, Véhicules, Déplacements, Autres) :
  - Chaque carte affiche la valeur clan + le podium des 3 meilleurs membres
  - Groupes repliables par section
- Aucun filtre par mode de jeu
- Noms dans le podium non cliquables (pas de lien vers le profil)

---

## 5. Lacunes et gaps identifiés

| Lacune | Impact | Effort |
|---|---|---|
| Pas de filtre par mode de jeu | Les stats squad/duo/solo sont mélangées, trompeur pour un site de clan | Moyen — nécessite extension DB |
| Pas de matchs joués en lifetime | K/M, win rate global non calculables sans `rounds played` | Faible — `wins + losses` suffit |
| Noms non cliquables dans les podiums clan | Impossible d'accéder au profil depuis le classement | Faible — ajouter `<Link>` |
| Pas de valeur clan en lifetime membre | La page membre ne dit pas "le clan a X kills au total" | Faible — déjà en API clan |
| Pas de rang numérique affiché ("tu es #2") | Le membre voit sa médaille mais pas son rang exact | Faible — déjà calculé en API |
| Pas de comparaison avec la moyenne clan | La page membre manque d'un contexte "tu es au-dessus/dessous de la moyenne" | Moyen |
| Pas de filtre/recherche dans les groupes | Sur un clan de 20+, les podiums ne montrent que 3 joueurs — pas de classement complet | Moyen |

---

## 6. Filtre par mode de jeu — Architecture

### Option A — Colonne JSON par mode dans `MemberLifetimeStats` (recommandée)

Ajouter des colonnes JSON pour chaque mode dans la table existante :

```prisma
model MemberLifetimeStats {
  // ...champs existants (stats tous modes agrégés conservés)
  combat   Json   // agrégat actuel — inchangé pour compatibilité
  victory  Json
  support  Json
  vehicle  Json
  movement Json
  other    Json

  // Nouveaux : stats par mode individuel
  squadStats     Json?   // stats du mode "squad" uniquement
  squadFppStats  Json?   // stats du mode "squad-fpp" uniquement
  duoStats       Json?   // stats du mode "duo" uniquement
  duoFppStats    Json?   // optionnel
  soloStats      Json?   // stats du mode "solo" uniquement
  soloFppStats   Json?   // optionnel
}
```

Chaque colonne JSON contiendrait les mêmes champs que le blob `combat`/`victory`/etc., mais pour un seul mode.

**Avantage :** pas de nouvelle table, migration simple, compatibilité ascendante totale.

### Option B — Table `MemberLifetimeModeStats` (plus propre, plus flexible)

```prisma
model MemberLifetimeModeStats {
  id       Int        @id @default(autoincrement())
  memberId Int
  member   ClanMember @relation(...)
  gameMode String     // "squad", "squad-fpp", "duo", "solo"...

  kills             Int   @default(0)
  deaths            Int   @default(0)
  assists           Int   @default(0)
  damageDealt       Float @default(0)
  headshots         Int   @default(0)
  knockouts         Int   @default(0)
  wins              Int   @default(0)
  losses            Int   @default(0)
  revives           Int   @default(0)
  longestKill       Float @default(0)
  maxKillStreak     Int   @default(0)
  mostSurvivalTime  Float @default(0)
  boosts            Int   @default(0)
  heals             Int   @default(0)
  rideDistance      Float @default(0)
  walkDistance      Float @default(0)
  swimDistance      Float @default(0)
  vehicleDestroys   Int   @default(0)
  roadKills         Int   @default(0)
  weaponsAcquired   Int   @default(0)
  teamKills         Int   @default(0)
  suicides          Int   @default(0)

  lastRefreshedAt DateTime
  @@unique([memberId, gameMode])
}
```

**Avantage :** typage fort, requêtes SQL directes, agrégation flexible. Recommandé si le filtre par mode devient central.

### Sélecteur de mode proposé

```
[ Tous modes ]  [ Squad ]  [ Duo ]  [ Solo ]
```

- **Tous modes** : comportement actuel (agrégat) — rétrocompatible
- **Squad** : `squad` + `squad-fpp` combinés (ou séparément selon préférence)
- **Duo** : `duo` + `duo-fpp`
- **Solo** : `solo` + `solo-fpp`

---

## 7. Conception des deux pages

---

### Page A — Membre `/members/[id]/stats` (amélioration de l'existant)

La page existe. Les améliorations proposées s'ajoutent à l'affichage actuel.

#### Ajout : sélecteur de mode (en-tête de page)

```
[ Tous modes ]  [ Squad ]  [ Duo ]  [ Solo ]
```

Le sélecteur filtre tous les blocs de stats ci-dessous. Nécessite l'Option A ou B de la section 6.

#### Bloc 1 — KPI hero (4 chiffres clés, actuellement partiel)

| KPI | Source | Amélioration |
|---|---|---|
| Kills | `combat.kills` | ✅ affiché |
| K/D ratio | `combat.kdRatio` | ✅ affiché |
| Victoires | `victory.wins` | ✅ affiché |
| Dégâts totaux | `other.damageGiven` | ✅ affiché |
| Matchs joués | `victory.wins + victory.losses` | ❌ à ajouter |
| Win rate | `wins / matchs` (calculé) | ❌ à ajouter |
| K/M | `kills / matchs` (calculé) | ❌ à ajouter |

#### Bloc 2 — Position dans le clan (actuellement : médailles uniquement)

Afficher pour chaque métrique le **rang numérique** ("tu es #2 sur les kills") et la valeur de référence du #1.

| Métrique | Rang clan actuel | #1 clan (valeur) | Ta valeur |
|---|---|---|---|
| Kills | #2 | PlayerX — 4 520 | 4 100 |
| K/D | #1 | Toi — 3.2 | — |
| Wins | #3 | PlayerY — 280 | 215 |

#### Bloc 3 — Stats détaillées par groupe (déjà implémenté, à enrichir)

Conserver les 6 groupes existants (Combat, Victoires, Support, Véhicules, Déplacements, Autres) mais en les filtrant par le mode sélectionné.

**Métriques à ajouter dans les groupes :**

| Groupe | Métrique à ajouter | Source |
|---|---|---|
| Combat | Matchs joués par mode | `wins + losses` par mode |
| Combat | K/M (kills par match) | `kills / matchs` |
| Victoires | Win rate | `wins / matchs` |
| Victoires | Top 10 ratio | non disponible en lifetime (voir note) |

> **Note :** `top10s` et `avgRank` ne sont PAS disponibles dans l'endpoint lifetime — ils n'existent que dans l'endpoint season. Pour ces métriques, référencer le document [Season Stats](season-stats.md).

#### Bloc 4 — Comparaison avec la moyenne du clan

Un graphique ou tableau comparant le joueur à la moyenne des membres actifs :

| Métrique | Valeur joueur | Moyenne clan | Écart |
|---|---|---|---|
| K/D | 3.2 | 2.1 | +52% |
| Win rate | 12.5% | 8.3% | +51% |
| Kills/match | 4.1 | 2.8 | +46% |

---

### Page B — Clan `/clans/[clanId]/stats` (amélioration de l'existant)

La page existe avec TOP 3 par métrique. Les améliorations proposées :

#### Ajout : sélecteur de mode (en-tête de page)

```
[ Tous modes ]  [ Squad ]  [ Duo ]  [ Solo ]
```

Filtre toutes les métriques et podiums affichés en dessous.

#### Bloc 1 — Totaux clan (nouveauté)

Un encart synthèse au-dessus des podiums : totaux agrégés de tous les membres pour le mode sélectionné.

| Total clan | Valeur |
|---|---|
| Kills totaux | 48 320 |
| Dégâts totaux | 5 234 100 |
| Victoires | 1 245 |
| Matchs joués | 12 870 |
| Win rate moyen | 9.7% |
| K/D moyen | 2.3 |

#### Bloc 2 — Podiums TOP 3 par groupe (déjà implémenté, à améliorer)

**Améliorations des podiums existants :**
- Rendre les noms **cliquables** → lien vers `/members/{id}/stats`
- Afficher le **rang complet** (pas seulement TOP 3) via un accordéon "Voir tous"
- Filtrer par mode via le sélecteur

**Podiums existants :**

| Groupe | Métrique | Ordre |
|---|---|---|
| Combat | Kills | desc |
| | K/D ratio | desc |
| | Headshots | desc |
| | Assists | desc |
| | Knockouts | desc |
| | Série max | desc (record) |
| | Distance max kill | desc (record) |
| | Morts | asc (moins = mieux) |
| | Teamkills | desc (anecdotique) |
| | Suicides | asc (anecdotique) |
| Victoires | Wins | desc |
| | Win rate (V/D) | desc |
| | Temps max en vie | desc (record) |
| | Défaites | asc (anecdotique) |
| Support | Relèves | desc |
| | Boosts | desc |
| | Soins | desc |
| Véhicules | Véhicules détruits | desc |
| | Roadkills | desc |
| Déplacements | Distance en véhicule | desc |
| | Distance à pied | desc |
| | Distance à la nage | desc |
| Autres | Armes ramassées | desc |
| | Dégâts infligés | desc |

**Podiums à ajouter (métriques dérivées) :**

| Nouveau podium | Formule | Mode ciblé |
|---|---|---|
| Matchs joués | `wins + losses` | Tous / Squad / Duo / Solo |
| Kills par match | `kills / (wins + losses)` | Tous / Squad |
| Win rate % | `wins / (wins + losses)` | Tous / Squad / Duo |
| Dégâts par match | `damageDealt / (wins + losses)` | Tous / Squad |
| Assists par match | `assists / (wins + losses)` | Squad (rôle soutien) |
| Revives par match | `revives / (wins + losses)` | Squad (rôle soutien) |

#### Bloc 3 — Carte playstyle (télémétrie, déjà implémentée)

Conserver la section existante avec le filtre semaine/mois/tous. Elle est indépendante du mode et reste pertinente en tout état de cause.

#### Bloc 4 — Tableau de bord "profils de joueurs" (nouveau)

Une vue alternative au podium : un tableau compact avec tous les membres actifs et leurs métriques clés, triable par colonne :

| Joueur | Kills | K/D | Wins | Win% | K/M | Relèves |
|---|---|---|---|---|---|---|
| PlayerA | 8 234 | 3.8 | 312 | 14.2% | 5.1 | 421 |
| PlayerB | 6 100 | 2.4 | 198 | 9.8% | 3.7 | 189 |
| … | | | | | | |

Ce tableau est différent du leaderboard (`/clans/[clanId]/leaderboard`) car il porte sur les **stats de carrière lifetime** et non sur les matchs DB période semaine/mois.

---

## 8. Badges lifetime (transversaux)

Distinctions permanentes calculées depuis les lifetime stats, affichables sur le profil membre et dans les podiums clan :

| Badge | Condition | Mode |
|---|---|---|
| Tueur de carrière | Plus grand `kills` lifetime du clan | Tous / Squad |
| Précision absolue | Plus grand ratio `headshots / kills` | Tous |
| Survivant | Plus grand `longestTimeAlive` | Tous |
| Sauveur de clan | Plus grand `revives` | Squad |
| Meilleur K/D | Plus grand `kdRatio` | Tous |
| Conducteur fou | Plus grande `drivenDistance` | Tous |
| Sniper longue distance | Plus grand `longestKill` | Tous |
| Win machine | Plus grand `winLossRatio` | Squad / Solo |

---

## 9. APIs existantes

| Route | Méthode | Comportement actuel |
|---|---|---|
| `/api/members/[id]/stats` | `GET` | Retourne stats lifetime en cache + rangs clan |
| `/api/members/[id]/stats` | `POST` | Force refresh PUBG API + recalcule rangs |
| `/api/clans/[clanId]/lifetime-stats` | `GET` | Retourne lifetime de tous les membres actifs |

Pour le filtre par mode, il faudra soit :
- Ajouter un query param `?mode=squad` aux routes existantes
- Créer de nouvelles routes dédiées si la logique diverge trop

---

## 10. Fichiers clés à modifier

| Fichier | Action |
|---|---|
| `prisma/schema.prisma` | Ajouter colonnes JSON par mode à `MemberLifetimeStats`, ou créer `MemberLifetimeModeStats` |
| `src/lib/pubg.ts` | `fetchLifetimeStats()` — mapper chaque mode séparément au lieu d'agréger |
| `src/lib/cron-jobs.ts` | `syncSeasonStatsDaily()` / cron lifetime — stocker les nouveaux champs par mode |
| `src/app/api/members/[id]/stats/route.ts` | Exposer les stats par mode + rangs par mode |
| `src/app/api/clans/[clanId]/lifetime-stats/route.ts` | Ajouter agrégation par mode + métriques dérivées |
| `src/app/members/[id]/stats/page.tsx` | Ajouter `SegmentedControl` mode + blocs rang numérique + comparaison moyenne |
| `src/app/clans/[clanId]/stats/page.tsx` | Ajouter `SegmentedControl` mode + totaux clan + noms cliquables + tableau membres |
