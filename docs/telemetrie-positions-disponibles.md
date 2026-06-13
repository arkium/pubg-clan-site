# Données de position PUBG — Inventaire complet

Ce document liste toutes les données de position disponibles dans les fichiers de télémétrie PUBG,
leur source (événement), leur état dans le projet, et si un filtrage par membres du clan est pertinent.

---

## Données actuellement stockées en DB

| Champ DB | Source événement | Contenu | Joueurs concernés | Filtrable clan ? |
|---|---|---|---|---|
| `positionSamples` | `LogPlayerPosition` | Position `(x, y)` échantillonnée toutes les N secondes par joueur | Tous (100) | ✅ Oui — seuls les membres du clan sont affichés |
| `trajectorySegments` | `LogPlayerPosition` | Segment `(fromX,fromY) → (toX,toY)` entre deux samples consécutifs | Tous (100) | ✅ Oui — idem |
| `deathSamples` | `LogPlayerKill` / `LogPlayerKillV2` | Position de la victime au moment de la mort | Tous (100) | ✅ Oui — seules les morts des membres du clan sont affichées |
| `landingSamples` | `LogParachuteLanding` | Position d'atterrissage initiale (parachute) | Tous (100) | ⚠️ Partiel — les points individuels filtrent sur le clan, mais la heatmap globale utilise tous les joueurs |

---

## Données de position disponibles mais non stockées

### 1. Position du tueur au moment du kill

**Événement :** `LogPlayerKill` / `LogPlayerKillV2`

| Champ disponible | Description |
|---|---|
| `killer.location.x` / `killer.location.y` | Position du tireur au moment du kill |
| `victim.location.x` / `victim.location.y` | Position de la victime (→ déjà dans `deathSamples`) |
| `distance` | Distance kill (déjà dans `memberStats.weapons.killDistanceMax`) |

**Usage potentiel :** heatmap "zones de kill" (d'où on tue), cercles de snipe.  
**Filtrable clan ?** ✅ Oui — position du tueur (si membre du clan) ou de la victime (si membre du clan).  
**Volume :** ~100 kills max par match → très léger.

---

### 2. Position des tirs

**Événement :** `LogPlayerAttack`

| Champ disponible | Description |
|---|---|
| `attacker.location.x` / `attacker.location.y` | Position du tireur au moment du tir |
| `weapon.itemId` | Arme utilisée |
| `fireWeaponStackCount` | Nombre de coups (déjà utilisé pour `shotsFired`) |

**Usage potentiel :** heatmap "où tire-t-on", analyse des angles d'engagement.  
**Filtrable clan ?** ✅ Oui — et recommandé, volume sinon énorme.  
**Volume :** 10 000–50 000 événements par match si tous les joueurs. Pour 4 membres du clan : 200–500 tirs. Nécessite un échantillonnage ou un filtre strict.

---

### 3. Position lors d'un dégât infligé / reçu

**Événement :** `LogPlayerTakeDamage`

| Champ disponible | Description |
|---|---|
| `attacker.location.x` / `attacker.location.y` | Position de l'attaquant |
| `victim.location.x` / `victim.location.y` | Position de la victime |
| `damage` | Dégâts infligés |
| `damageCauserName` | Arme/cause |

**Usage potentiel :** heatmap "zones de combat", analyse des angles où on prend des dégâts.  
**Filtrable clan ?** ✅ Oui — position du membre du clan (attaquant ou victime selon le cas).  
**Volume :** similaire à `LogPlayerAttack`, très élevé tous joueurs confondus.

---

### 4. Position d'un KO (groggy)

**Événement :** `LogPlayerMakeGroggy`

| Champ disponible | Description |
|---|---|
| `attacker.location.x` / `attacker.location.y` | Position de celui qui KO |
| `victim.location.x` / `victim.location.y` | Position de la victime KO |

**Usage potentiel :** heatmap "zones de KO", analyse défensive (où se fait-on KO ?).  
**Filtrable clan ?** ✅ Oui.  
**Volume :** ~100–200 événements par match → très léger.

---

### 5. Position de revive

**Événement :** `LogPlayerRevive`

| Champ disponible | Description |
|---|---|
| `reviver.location.x` / `reviver.location.y` | Position du soigneur |
| `victim.location.x` / `victim.location.y` | Position du revivé |

**Usage potentiel :** heatmap "zones de revive", analyse du jeu d'équipe.  
**Filtrable clan ?** ✅ Oui.  
**Volume :** < 50 événements par match → négligeable.

---

### 6. Position lors d'une montée/descente de véhicule

**Événements :** `LogVehicleRide` / `LogVehicleLeave`

| Champ disponible | Description |
|---|---|
| `character.location.x` / `character.location.y` | Position au moment de l'action |
| `vehicle.vehicleType` | Type de véhicule |

**Usage potentiel :** heatmap "zones de prise/abandon de véhicule", analyse des rotations motorisées.  
**Filtrable clan ?** ✅ Oui.  
**Volume :** 50–200 événements par match → léger.

---

### 7. Zone bleue (état global de la partie)

**Événement :** `LogGameStatePeriodically`

| Champ disponible | Description |
|---|---|
| `gameState.safetyZonePosition.x` / `.y` | Centre de la safe zone |
| `gameState.safetyZoneRadius` | Rayon de la safe zone |
| `gameState.poisonGasWarningPosition.x` / `.y` | Centre du cercle bleu entrant |
| `gameState.poisonGasWarningRadius` | Rayon du cercle bleu entrant |

**Usage potentiel :** overlay des cercles sur les heatmaps, analyse des phases.  
**Filtrable clan ?** ❌ Non applicable — données globales de la partie, pas liées à un joueur.  
**Volume :** ~180 événements par match (1 toutes les 10s) → déjà partiellement capturé dans `phaseSnapshots` (sans les coordonnées x/y du cercle).  
**Note :** les coordonnées de zone ne sont pas encore stockées. `phaseSnapshots` stocke seulement les rayons, pas les centres.

---

## Résumé — Recommandations de filtrage

| Donnée | Action recommandée |
|---|---|
| `positionSamples` | ✅ Filtrer sur membres du clan uniquement |
| `trajectorySegments` | ✅ Filtrer sur membres du clan uniquement |
| `deathSamples` | ✅ Filtrer sur membres du clan uniquement |
| `landingSamples` | ⚠️ À discuter — filtrer perdrait la heatmap globale tous joueurs |
| Position du kill (killer) | 🆕 À implémenter, filtrer sur membres du clan |
| Position des tirs | 🆕 Volume élevé — membres du clan uniquement, échantillonnage conseillé |
| Position des dégâts | 🆕 Volume élevé — membres du clan uniquement |
| Position des KO | 🆕 À implémenter, filtrer sur membres du clan |
| Position des revives | 🆕 À implémenter, filtrer sur membres du clan |
| Position véhicule | 🆕 Optionnel, filtrer sur membres du clan |
| Coordonnées zone bleue | 🆕 Données globales, pas de filtrage — enrichissement de `phaseSnapshots` |

---

## Choix à compléter

Instructions : mettre `X` dans les colonnes correspondant à ta décision.

| Donnée | Champ DB proposé | Filtrer sur clan | Garder tous joueurs | Implémenter | Ne pas implémenter | Remarques |
|---|---|---|---|---|---|---|
| Positions en jeu (`positionSamples`) | `positionSamples` ✅ | x | | x | | Echantillonage selon taille du fichier avec limite à 2000 |
| Segments de trajectoire (`trajectorySegments`) | `trajectorySegments` ✅ | x | | x | | Echantillonage selon taille du fichier avec limite à 2000 |
| Morts — position de la victime | `deathSamples` ✅ | | x | | | |
| Atterrissages parachute | `landingSamples` ✅ | | x | | | |
| **Kill — position du tueur** (membre du clan qui tue) | `killSamples` 🆕 | x | | x | | |
| **Kill — position de la victime** (membre du clan qui meurt) | `deathSamples` ✅ déjà couvert | — | — | — | — | Déjà dans `deathSamples` tous joueurs |
| **Tirs** — position du tireur (membre du clan) | `shotSamples` 🆕 | x | | x | | Echantillonage en regroupant les positions proches (périmètre paramètrable) avec limite à 2000 |
| **Dégâts infligés** — position du membre du clan qui attaque | `damageSamples` 🆕 | x | | x | |Echantillonage en regroupant les positions proches (périmètre paramètrable) |
| **Dégâts reçus** — position du membre du clan qui est touché | `damageSamples` 🆕 (même champ, rôle distinct) | x | | x | |Echantillonage en regroupant les positions proches (périmètre paramètrable) |
| **KO infligé** — position du membre du clan qui KO | `knockoutSamples` 🆕 | x | | x | | |
| **KO reçu** — position du membre du clan qui est KO | `knockoutSamples` 🆕 (même champ, rôle distinct) | x | | x | | |
| **Revive donné** — position du membre du clan qui revive | `reviveSamples` 🆕 | x | | x | | |
| **Revive reçu** — position du membre du clan qui est revivé | `reviveSamples` 🆕 (même champ, rôle distinct) | x | | x | | |
| Montée en véhicule (membre du clan) | `vehicleSamples` 🆕 | x | | x | | |
| Descente de véhicule (membre du clan) | `vehicleSamples` 🆕 (même champ, type distinct) | x | | x | | |
| Coordonnées centre zone bleue | `phaseSnapshots` ✅ enrichi | — | — | x | | Données globales, enrichissement du champ existant |
