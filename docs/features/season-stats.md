# Season Stats

Les stats de saison agrègent les performances d'un joueur sur la saison PUBG en cours, pour les modes ranked et squad normal. Elles sont stockées dans `MemberSeasonStats` et alimentées par deux endpoints API PUBG distincts.

---

## Sources API PUBG

| Endpoint | Données | Fréquence |
|---|---|---|
| `GET /shards/{shard}/players/{playerId}/seasons/{seasonId}` | Stats normales par mode (squad, duo, solo...) | Cron daily 5h + bouton manuel |
| `GET /shards/{shard}/players/{playerId}/seasons/{seasonId}/ranked` | Stats ranked + tier/sous-tier/RP | Cron daily 5h + bouton manuel |

La saison courante est déterminée via `GET /shards/{shard}/seasons` — la première saison avec `attributes.isCurrentSeason: true`.

---

## Modèle `MemberSeasonStats`

### Champs ranked

| Champ DB | Source API | Description |
|---|---|---|
| `rankedGameMode` | mode sélectionné | Mode de jeu ranked retenu (ex. `"squad-fpp"`) |
| `rankedTier` | `currentTier.tier` | Rang actuel : Bronze, Silver, Gold, Platinum, Diamond, Master |
| `rankedSubTier` | `currentTier.subTier` | Sous-rang : I, II, III, IV, V (null si Master) |
| `rankedPoints` | `currentRankPoint` | RP courants |
| `rankedBestTier` | `bestTier.tier` | Meilleur rang atteint dans la saison |
| `rankedBestSubTier` | `bestTier.subTier` | Meilleur sous-rang atteint |
| `rankedBestPoints` | `bestRankPoint` | Pic de RP dans la saison |
| `rankedKills` | `kills` | Kills totaux en ranked |
| `rankedDamage` | `damageDealt` | Dégâts totaux en ranked |
| `rankedWins` | `wins` | Victoires en ranked |
| `rankedMatches` | `roundsPlayed` | Matchs ranked joués |
| `rankedAssists` | `assists` | Assists en ranked |
| `rankedRevives` | `revives` | Relèves en ranked |

### Champs normaux (squad uniquement)

| Champ DB | Source API | Description |
|---|---|---|
| `normalKills` | `kills` | Kills en squad normal |
| `normalDamage` | `damageDealt` | Dégâts en squad normal |
| `normalWins` | `wins` | Victoires en squad normal |
| `normalLosses` | `losses` | Défaites en squad normal |
| `normalAssists` | `assists` | Assists en squad normal |
| `normalRevives` | `revives` | Relèves en squad normal |
| `normalMatches` | `wins + losses` (calculé) | Total matchs squad normal |

### Champs de métadonnées

| Champ DB | Description |
|---|---|
| `seasonId` | Identifiant de saison PUBG (ex. `"division.bro.official.pc-2018-30"`) |
| `memberId` | Clé étrangère vers `ClanMember` |
| `lastRefreshedAt` | Date ISO 8601 du dernier refresh depuis l'API PUBG |

---

## Sélection du mode ranked

L'API PUBG retourne les stats ranked pour plusieurs modes simultanément. L'app retient le **premier mode avec un `currentTier` non nul** dans l'ordre de priorité suivant :

```
squad-fpp > squad > duo-fpp > duo > solo-fpp > solo
```

Le mode retenu est stocké dans `rankedGameMode`. Les stats des autres modes ne sont pas stockées.

---

## Cron de synchronisation

**Nom** : `daily_season_stats_sync`
**Planning** : `0 5 * * *` (5h00 UTC chaque jour)
**Variable d'environnement** : `CLAN_SEASON_STATS_SYNC_CRON` (surcharge le planning par défaut)

Le cron met à jour `MemberSeasonStats` et `MemberWeaponMastery` en parallèle pour tous les membres actifs de tous les clans. Coût : 2 appels API PUBG quota par membre (ranked + normal season).

---

## Contrats API

### `GET /api/members/[id]/season-stats`

Pas de paramètres. Pas d'authentification requise (données publiques PUBG).

**Réponse 200** :

```typescript
type MemberSeasonStatsRow = {
  id: number
  memberId: number
  seasonId: string
  // Ranked
  rankedGameMode: string | null
  rankedTier: string | null
  rankedSubTier: string | null
  rankedPoints: number
  rankedBestTier: string | null
  rankedBestSubTier: string | null
  rankedBestPoints: number
  rankedKills: number
  rankedDamage: number
  rankedWins: number
  rankedMatches: number
  rankedAssists: number
  rankedRevives: number
  // Normal squad
  normalKills: number
  normalDamage: number
  normalWins: number
  normalLosses: number
  normalAssists: number
  normalRevives: number
  normalMatches: number  // = normalWins + normalLosses
  lastRefreshedAt: string  // ISO 8601
  createdAt: string
  updatedAt: string
}

type SeasonStatsResponse = {
  memberId: number
  seasons: MemberSeasonStatsRow[]  // jusqu'à 3 saisons, ordre décroissant par seasonId
}
```

### `POST /api/members/[id]/season-stats`

Force le refresh depuis l'API PUBG pour la saison courante. Coûte 2 appels API PUBG quota.

**Réponse 200** :

```typescript
type SeasonStatsRefreshResponse = {
  memberId: number
  seasonId: string
  isOffseason: boolean
  stats: MemberSeasonStatsRow
}
```

---

## Affichage du tier

Règle d'affichage pour le rang ranked :

```
rankedTier + ' ' + rankedSubTier  →  "Gold III"
rankedTier (si rankedSubTier null)  →  "Master"
```

Couleurs suggérées par tier :

| Tier | Couleur |
|---|---|
| Bronze | Marron / `text-amber-700` |
| Silver | Gris / `text-slate-400` |
| Gold | Jaune / `text-yellow-500` |
| Platinum | Cyan / `text-cyan-400` |
| Diamond | Bleu / `text-blue-500` |
| Master | Violet-doré / `text-purple-500` |

---

## Intégration UI

La page `/members/[id]/stats` intègre les season stats dans un panneau dédié :
- Affichage des 3 dernières saisons disponibles
- Badge de tier ranked dans l'en-tête
- Tableau ranked (kills, dégâts, wins, matchs, assists, revives)
- Tableau squad normal (même métriques)
- Bouton "Rafraichir" → POST puis rechargement GET
- Métriques dérivées calculées côté client : K/M (`rankedKills / rankedMatches`), win rate (`rankedWins / rankedMatches`)

---

## Cas hors-saison

Si `rankedTier` est `null`, deux causes possibles :
1. Le joueur n'a pas joué le mode ranked pendant la saison courante.
2. Les données n'ont pas encore été fetchées via POST ou le cron.

L'UI doit afficher un état neutre ("Non classé" ou "-") plutôt qu'un tier vide.

---

## Données disponibles dans l'API PUBG mais non stockées

Les champs suivants existent dans les réponses PUBG mais ne sont pas mappés en base actuellement :

**Ranked** : `deaths`, `kd`, `kda`, `avgRank`, `winRatio`, `top10Ratio`

**Normal squad** : `dBNOs`, `headshotKills`, `longestKill`, `top10s`, `maxKillStreaks`, `mostSurvivalTime`, `timeSurvived`, `boosts`, `heals`, `walkDistance`, `rideDistance`, `swimDistance`, `vehicleDestroys`, `roadKills`, `weaponsAcquired`

Pour les ajouter, voir `docs/archive/season-stats.md` section 6 et 8 pour la migration DB et les fichiers à modifier.
