# Télémétrie PUBG — Stats de clan enrichies

Ce document recense les données exploitables depuis l'API télémétrie PUBG pour enrichir les statistiques de clan. Il part des fonctions déjà présentes dans `src/lib/pubg.ts` et des modèles `SquadMatch`/`SquadMember`/`Match` existants.

---

## Contexte

L'API PUBG expose deux niveaux de données pour chaque match :

1. **Résumé match** (`/matches/{matchId}`) — déjà consommé : kills, damage, assists, placement, durée, carte, mode.
2. **Télémétrie** (`/assets/{assetId}` ou URL directe dans `relationships.assets`) — fichier JSON événementiel décrivant tout ce qui s'est passé pendant la partie.

La télémétrie est disponible pendant **14 jours** après le match. Au-delà elle n'est plus accessible.

---

## Ce qu'offre la télémétrie PUBG

La télémétrie est un tableau de milliers d'événements chronologiques. Les types utiles pour le clan :

### Événements de combat

| Événement | Données utiles |
|---|---|
| `LogPlayerKill` / `LogPlayerKillV2` | killer, victim, weapon, distance, cause (gun/knock/blueZone), headshot |
| `LogPlayerTakeDamage` | attacker, victim, weapon, damageType, damage, bodyPart |
| `LogPlayerAttack` | weapon utilisée, type d'attaque (throw, shot) |

### Déplacements et zones

| Événement | Données utiles |
|---|---|
| `LogPlayerPosition` | position GPS à intervalles réguliers |
| `LogGameStatePeriodically` | zone bleue/rouge/blanche courante, nb joueurs restants |
| `LogPhaseChange` | numéro du cercle, timing |
| `LogBlueZoneDamage` | qui prend du dégât de zone |

### Véhicules

| Événement | Données utiles |
|---|---|
| `LogVehicleRide` | qui monte dans quel véhicule |
| `LogVehicleLeave` | durée dans le véhicule |
| `LogVehicleDestroy` | quel véhicule détruit, par qui |

### Loot et objets

| Événement | Données utiles |
|---|---|
| `LogItemPickup` / `LogItemPickupFromCrate` | arme/équipement ramassé |
| `LogItemDrop` | objets abandonnés |
| `LogItemUse` | boosts, soins utilisés |
| `LogItemEquip` / `LogItemUnequip` | armes équipées (détecte l'arme finale utilisée) |

### Statut joueur

| Événement | Données utiles |
|---|---|
| `LogPlayerMakeGroggy` | knockouts donnés/reçus |
| `LogPlayerRevive` | revives avec identité des deux joueurs |
| `LogPlayerPosition` + timestamps | temps de survie précis |

---

## Données exploitables pour les stats de clan

### 1. Arsenal et préférences d'armes

- Arme la plus utilisée (nb kills par arme, par joueur)
- Arme préférée du clan (agrégat sur les matchs de la période)
- Distance moyenne des kills (sniper vs CQC vs mid-range)
- Taux de headshot par arme

**Granularité disponible :** par joueur, par match, agrégeable sur semaine/mois.

---

### 2. Comportement de jeu (agressif vs passif)

Depuis la combinaison position + timing :

- **Phase de first contact** : numéro du cercle auquel le premier kill est obtenu → indique si le joueur engage tôt ou tard
- **Distance parcourue à pied vs véhicule**
- **Dégâts reçus** (LogPlayerTakeDamage côté victim) → résistance
- **Blue zone hits** : fois où le joueur prend de la zone → indicateur de positionnement tardif

---

### 3. Stats de synergies enrichies

Actuellement `synergies` s'appuie sur la co-présence dans `SquadMember`. La télémétrie permet :

- **Revives croisés** : qui revive qui dans le clan → heatmap de sauvetage
- **Knockouts assistés** : joueur A knock, joueur B finit → co-kills
- **Dégâts partagés sur une cible** : A et B visent la même cible avant la mort

---

### 4. Heatmaps de positions

`LogPlayerPosition` toutes les ~10 s :

- **Zones de prédilection** par carte (Erangel, Miramar…) → zones de drop et de combat fréquentées
- **Trajectoires de rotation** au fil des cercles
- **Zones de mort** : où le joueur meurt le plus souvent

---

### 5. Analyse des cercles et positionnement stratégique

- **Taux de safe zone** : % de matchs où le joueur est dans le cercle à chaque phase
- **Retard moyen d'entrée dans le cercle** : secondes après fermeture
- **Finaliste map** : taille du dernier cercle atteint (proxy de endgame skill)

---

### 6. Économie de loot

- **Boosts consommés par match** (LogItemUse avec boost)
- **Soins consommés** (medkit, bandage, firstaid)
- **Armes ramassées vs armes utilisées** → sélectivité du joueur

---

### 7. Stats véhicules

- Kills depuis un véhicule (LogPlayerKill + vehicle context)
- Kills sur véhicule (roadkills)
- Véhicules détruits par le clan
- Temps passé en véhicule

---

## Proposition de calcul des stats

L'idée la plus robuste est de calculer les stats en 3 étages:

1. **Niveau événement**: lire la télémétrie et extraire des compteurs bruts.
2. **Niveau match**: agréger ces compteurs par joueur, par équipe, puis par match.
3. **Niveau période**: sommer et normaliser sur `week`, `month` ou `all`.

### 1) Niveau événement

Chaque événement alimente un compteur simple:

- `LogPlayerKill` / `LogPlayerKillV2` -> kill, headshot, distance, type de kill
- `LogPlayerTakeDamage` -> damage reçu / infligé
- `LogPlayerRevive` -> revive
- `LogPlayerMakeGroggy` -> knockout
- `LogItemUse` -> boost / soin
- `LogVehicleRide` / `LogVehicleLeave` -> temps véhicule
- `LogPlayerPosition` -> temps de survie, déplacement, zone

Règle: un événement = une incrémentation ou une mise à jour de durée. Pas de calcul complexe ici.

### 2) Niveau match

Pour chaque match, on calcule des agrégats unitaires par joueur:

- `kills`
- `headshots`
- `damageDealt`
- `assists`
- `revives`
- `knockouts`
- `placement`
- `survivalTime`
- `vehicleTime`
- `blueZoneHits`
- `distanceTraveled`

Ces agrégats servent ensuite à alimenter les vues clan et membre. La règle à garder: **un match produit un snapshot stable, réutilisable partout**.

### 3) Niveau période

Les stats affichées dans l'UI doivent être calculées sur une période calendaire stable:

- `week`: lundi 00:00 -> dimanche 23:59:59.999
- `month`: premier jour du mois -> dernier jour du mois
- `all`: tout l'historique disponible

Sur cette période, on calcule trois familles de valeurs:

#### Totaux bruts

- `totalKills`
- `totalDamage`
- `totalAssists`
- `totalRevives`
- `totalKnockouts`
- `matchesPlayed`
- `matchesWon`

#### Moyennes par match

- `avgKillsPerGame = totalKills / matchesPlayed`
- `avgDamagePerGame = totalDamage / matchesPlayed`
- `avgRevivesPerGame = totalRevives / matchesPlayed`
- `avgAssistsPerGame = totalAssists / matchesPlayed`

#### Taux et ratios

- `winRate = matchesWon / matchesPlayed`
- `headshotRate = headshots / kills`
- `killShare = playerKills / teamKills`
- `survivalRate = survivalTime / matchDuration`

### Proposition pour les blocs fun

Les blocs du type “Classement fun du match” doivent reposer sur les mêmes stats de base, mais avec un habillage éditorial.

Je recommande ce mapping:

- **Top 3 équipes**: tri par `placement asc`, puis `totalKills desc`, puis `totalDamage desc`.
- **Le croc mort**: joueur avec le plus de kills sur la période.
- **La brute**: joueur avec le plus de damage sur la période.
- **Soutiens opérationnel**: joueur avec le plus de revives.
- **Le serial killer**: joueur avec le meilleur ratio `kills / match` sur un minimum de matchs.
- **Le sniper**: joueur avec la plus grande distance moyenne de kill.
- **Le brouteur d'herbe**: joueur avec la plus grande survie moyenne.
- **L'alcoolique du dimanche**: joueur avec le plus de boosts consommés.
- **Le chasseur de tête**: joueur avec le plus grand `headshotRate`.
- **Le fou de l'hôpital**: joueur avec le plus de soins / self-heal / revive-related actions.
- **Le ressuscité**: joueur avec le plus de revives reçus ou donnés selon le sens retenu.
- **JACKY TUNING**: joueur avec le plus de temps véhicule ou de distance véhicule.
- **L'infiltré**: joueur avec le plus de survivals tardifs / phase de fin.
- **Le rodeur**: joueur avec la plus grande distance parcourue à pied.
- **Le destructeur**: joueur avec le plus de véhicules détruits.
- **Le collectionneur d'arme**: joueur avec le plus grand nombre d'armes distinctes utilisées.

### Règle de stabilité

Pour éviter des classements qui changent trop d'une partie à l'autre:

- n'afficher un award qu'au-delà d'un minimum de matchs (ex. 3)
- utiliser des valeurs normalisées quand c'est pertinent (`/match`, `/minute`, `%`)
- conserver les sources brutes en base, mais calculer les awards au moment de la lecture ou du cron

### Recommandation pratique

Je recommande de séparer les calculs en deux couches:

- **stats métier**: chiffres fiables, réutilisables, persistés en base
- **stats fun**: labels narratifs dérivés de ces chiffres, recalculables à la volée

Ça permet de faire évoluer le vocabulaire fun sans casser les agrégats métier.

---

## Idées de pages / blocs UI à créer

### Page : `/clans/[clanId]/stats/weapons`

Classement des armes du clan sur la période. Colonnes :
- Arme, kills totaux, headshots %, distance moyenne des kills, nb joueurs qui l'utilisent

### Page : `/clans/[clanId]/stats/heatmap-kills`

Overlay SVG sur carte (Erangel, Miramar…) des positions de kills du clan. Filtres : carte, période, joueur.

### Bloc : Profil de jeu (agressif / support / passif)

Sur le dashboard joueur ou la page clan. Score composite :
- **Agressif** : kills précoces, dégâts élevés, blue zone hits faibles
- **Support** : revives élevés, assists élevés, dégâts moyens
- **Passif** : survie longue, kills tardifs, faible exposition aux dégâts reçus

### Bloc : Synergies télémétrie

Extension du bloc synergies actuel :
- Top paires par revives croisés
- Top paires par co-kills (knock + finish)

### Page : `/members/[id]/weapons`

Statistiques par arme du joueur sur la période. Top 5 armes, distance préférée, évolution hebdomadaire.

---

## Contraintes techniques

### Taille des fichiers

La télémétrie est un fichier JSON de **10 à 200 Mo** par match selon la durée et le nombre de joueurs. Il n'est pas raisonnable de le télécharger à chaque requête UI.

**Stratégie recommandée :**

1. Récupérer la télémétrie lors du **cron de sync**, pas à la demande.
2. Stocker uniquement les **agrégats calculés** en base (pas le fichier brut).
3. Versionner le parsing : si on ajoute une nouvelle métrique, prévoir un job de recalcul.
4. Parser en **stream** (lecture par chunks) pour éviter de charger tout le JSON en RAM.
5. Si un fichier temporaire disque est utilisé, le placer en répertoire temporaire puis le supprimer systématiquement en `finally`.

Règle de sûreté mémoire:

- ne jamais faire de `JSON.parse` du payload complet en mémoire pour les gros assets,
- limiter la concurrence (2-4 téléchargements max),
- abandonner le traitement au-delà d'une taille seuil configurée.

### Fenêtre de disponibilité

14 jours. Le cron doit donc passer sur les matchs récents avant expiration. Si un match est importé le jour même, la télémétrie est disponible.

### Rate limit PUBG

La télémétrie est servie depuis un CDN (URL `assets.pubg.com`) et **n'est pas comptée dans le RPM de l'API PUBG** (`api.pubg.com`). Elle peut être récupérée sans passer par la queue `api-throttle`.

### Modèle de stockage suggéré

Nouveau modèle `SquadMatchTelemetry` rattaché à `SquadMatch` :

```prisma
model SquadMatchTelemetry {
  id           String     @id @default(cuid())
  squadMatchId String     @unique
  squadMatch   SquadMatch @relation(fields: [squadMatchId], references: [id], onDelete: Cascade)

  // Agrégats armes (JSON : [{weapon, kills, headshots, avgDistance}])
  weaponStats  Json?

  // Agrégats positions (JSON : [{memberId, positions: [{x,y,phase}]}])
  positionData Json?

  // Profil de jeu (JSON : [{memberId, aggressionScore, supportScore, positionScore}])
  playstyleData Json?

  // Synergies enrichies (JSON : [{memberA, memberB, reviveCount, coKills}])
  synergyData  Json?

  // Données cercles (JSON : [{memberId, phaseInCount, avgDelay}])
  circleData   Json?

  parsedAt     DateTime
  createdAt    DateTime @default(now())

  @@map("SquadMatchTelemetry")
}
```

Nouveau modèle `MemberWeaponStats` pour les agrégats par période :

```prisma
model MemberWeaponStats {
  id         String     @id @default(cuid())
  memberId   Int
  member     ClanMember @relation(fields: [memberId], references: [id], onDelete: Cascade)

  period     String   // "week-2026-20", "month-2026-05", "all-time"
  periodType String

  weaponName   String
  kills        Int    @default(0)
  headshots    Int    @default(0)
  avgDistance  Float  @default(0)
  matchCount   Int    @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([memberId, period, weaponName])
  @@map("MemberWeaponStats")
}
```

---

## Intégration dans le cron existant

Le cron `sync-matches` importe déjà les `SquadMatch`. L'intégration télémétrie s'ajoute en étape suivante :

```
[sync-matches] → import SquadMatch existant
      ↓
[sync-telemetry] → pour chaque SquadMatch sans SquadMatchTelemetry
                    → fetch URL telemetry depuis assets API PUBG
                    → parse événements utiles
                    → stocker agrégats dans SquadMatchTelemetry
                    → mettre à jour MemberWeaponStats par période
```

La fonction `getMatch` dans `pubg.ts` renvoie déjà `relationships.assets` (via `PubgMatchResponse`). Il faut :
1. Extraire l'URL télémétrie de `included` (type `asset`, attribut `URL`).
2. Créer `fetchTelemetry(url: string)` : `GET` direct sur l'URL CDN (pas par `pubgApi`).
3. Créer `parseTelemetryForClan(events, clanMemberIds)` : filtre sur les joueurs du clan.

---

## Priorité suggérée

| Priorité | Donnée | Complexité | Valeur |
|---|---|---|---|
| 1 | Stats armes (kills + headshots + distance) | Faible | Élevée |
| 2 | Revives croisés et co-kills (synergies) | Faible | Élevée |
| 3 | Profil de jeu agressif/support/passif | Moyenne | Élevée |
| 4 | Heatmap positions sur carte | Élevée | Moyenne |
| 5 | Analyse cercles et rotation | Moyenne | Moyenne |
| 6 | Économie de loot | Faible | Faible |
| 7 | Véhicules | Faible | Faible |

---

## Notes

- Les noms de modèles Prisma ci-dessus sont des suggestions ; le nommage peut être aligné sur les conventions existantes (`SquadMatchTelemetry` → `SquadTelemetry`, etc.).
- Le JSON brut de télémétrie ne doit jamais être stocké en DB (volume). Seuls les agrégats calculés.
- Les heatmaps de positions nécessitent un système de coordonnées par carte (mapping x/y PUBG → overlay SVG) : travail supplémentaire non trivial.
- L'URL télémétrie dans la réponse `getMatch` est dans `included` (type `asset`) — à extraire dans `resolveMatch` si besoin côté `pubg.ts`.
