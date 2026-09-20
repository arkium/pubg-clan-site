# Modèle de données

Schéma Prisma : `prisma/schema.prisma`. Provider `mysql`, engine library (Rust in-process). 54 modèles au total (les sections ci-dessous ne détaillent que les principaux).

## Vue d'ensemble par domaine

### Authentification et comptes

| Modèle | Rôle |
|---|---|
| `UserAccount` | Compte utilisateur (email/mot de passe) |
| `UserSession` | Sessions actives (token hashé, expiration) |
| `PasswordResetToken` | Tokens de réinitialisation de mot de passe |
| `MemberIdentity` | Liaison entre un `UserAccount` et un `ClanMember` |
| `MemberInvite` | Invitations par email pour rejoindre le clan |

### Clan et membres

| Modèle | Rôle |
|---|---|
| `Clan` | Clan PUBG (nom, tag, shard, stats, niveau) |
| `ClanMember` | Joueur membre du clan (profil PUBG + statut actif) |
| `ClanRole` | Rôle personnalisé au niveau clan (avec permissions JSON) |
| `ClanMemberRole` | Table de jonction membre ↔ rôle |
| `Permission` | Registre global des permissions disponibles |
| `PlayerClanChange` | Journal des changements d'appartenance de clan — détectés ou décidés (voir [Cycle de vie du clan](../features/cycle-de-vie-clan.md)) |
| `ClanLifecycleRun` | Passage du cron de synchronisation d'appartenance : compteurs, mode, coupe-circuit. Sert aussi de verrou entre process |

### Matchs

| Modèle | Rôle |
|---|---|
| `Match` | Match individuel d'un membre (stats kills/damage/placement) |
| `SquadMatch` | Match d'équipe détecté (plusieurs membres présents) |
| `SquadMember` | Participation d'un membre dans un `SquadMatch` (stats détaillées) |
| `SquadMatchTelemetry` | Données de télémétrie parsées pour un `SquadMatch` |

### Statistiques calculées

| Modèle | Rôle |
|---|---|
| `PlayerStats` | Stats agrégées par membre et par période (week/month/all-time) |
| `MemberWeaponStats` | Stats par arme et par période (issues de la télémétrie) |
| `MemberTelemetryStats` | Scores comportementaux par période (agressivité, soutien, discipline de zone) |
| `MemberSeasonStats` | Stats de saison PUBG (ranked + normal) |
| `MemberWeaponMastery` | Maîtrise des armes (niveau, XP, stats lifetime PUBG) |
| `MemberLifetimeStats` | Stats lifetime agrégées par catégorie (combat, victoire, soutien, véhicule, mouvement) |
| `ClanSynergyTelemetryStats` | Synergies entre paires de membres (revives mutuels, co-kills, dégâts partagés) |

### Rapports, challenges et récompenses

| Modèle | Rôle |
|---|---|
| `Report` | Rapport périodique du clan (hebdo/mensuel) |
| `ReportSection` | Section d'un rapport (contenu JSON par type) |
| `Challenge` | Défi de clan (objectif, critères, récompenses) |
| `ChallengeParticipant` | Participation et progression d'un membre à un défi |
| `ChallengeReward` | Définition d'une récompense (points, badge) |
| `PlayerRewards` | Total de points et badges obtenus par un membre |

### Notifications

| Modèle | Rôle |
|---|---|
| `Notification` | Notification in-app pour un membre |
| `NotificationPreference` | Préférences de notification par membre (email/push/in-app par type) |
| `DiscordNotificationLog` | Journal des messages Discord déjà publiés par un clan — l'unique `(clanId, kind, refId)` est le mécanisme anti-doublon (voir [notifications Discord](../features/discord-notifications.md)) |

### Configuration et opérations

| Modèle | Rôle |
|---|---|
| `AppConfig` | Configuration clé-valeur de l'application (texte libre, persistée en DB) |
| `CronExecution` | Journal d'exécution des tâches planifiées |
| `PubgApiCallLog` | Journal des appels à l'API PUBG (rate limit, durée, statut) |

---

## Détail des modèles clés

### Clan

```
id, name, tag, platformShard (défaut "steam")
pubgClanId, clanStats (Json), clanLevel, clanPoints
pubgCreatedAt, pubgMemberCount, pubgMembersSyncedAt
isActive, isSystem, createdAt, updatedAt
```

Contrainte unique : `(name, platformShard)` et `(pubgClanId, platformShard)`.

`isSystem` marque le **clan technique** du shard (`Ungrouped` / `UNG`), parking des joueurs sans clan qu'on continue de suivre. Un clan système n'a pas de `pubgClanId`, n'est jamais renommé depuis l'API PUBG et n'apparaît pas dans les sélecteurs côté joueur. L'identification passe **toujours** par ce champ, jamais par le nom — voir [Cycle de vie du clan](../features/cycle-de-vie-clan.md).

### ClanMember

```
id, displayName, pubgPlayerName, pubgAccountId
platformShard (défaut "steam"), isActive, clanId
archivedAt, archivedReason, contactEmail
```

Contrainte unique : `(pubgPlayerName, platformShard)`. Le champ `isActive` filtre les membres qui ont quitté le clan sans supprimer leurs données.

`isActive: false` recouvre désormais **quatre** situations distinctes : adhésion en attente, membre rejeté, arrêt de suivi, et archivage du parking. Seul `archivedReason` distingue la dernière — une requête qui filtre `isActive: false` sans qualifier davantage les mélange toutes.

`contactEmail` est l'adresse laissée sur `/join` lors d'une demande de **création** de clan. Elle vit sur `ClanMember` parce que c'est la seule table qui connaît déjà le pseudo du demandeur à ce stade : `UserAccount` n'existe pas encore (son `passwordHash` est non nullable) et `Clan` perdrait le lien avec le joueur.

### MemberIdentity

Table de jonction `UserAccount` ↔ `ClanMember`. Un compte utilisateur peut être lié à plusieurs membres (multi-clan), mais chaque membre n'a qu'un seul `userId` par identité (`memberId UNIQUE`). Le champ `isPrimary` désigne le membre actif principal pour le compte.

### UserSession

```
id (cuid), userId, tokenHash (UNIQUE), expiresAt, revokedAt
activeMemberId  — membre actuellement sélectionné dans la session
```

La session stocke `activeMemberId` pour savoir quel profil de joueur est actif quand un compte est lié à plusieurs membres.

### Match vs SquadMatch

- `Match` : un enregistrement par membre par match PUBG. Représente les stats brutes récupérées depuis l'API PUBG. Inclut les matchs solos et en équipe.
- `SquadMatch` : représente un match où plusieurs membres du clan ont joué ensemble. Créé par le service de détection d'équipe (`src/lib/squad-detector.ts`).
- `SquadMember` : participations individuelles dans un `SquadMatch`. Champs plus riches que `Match` : `timeSurvived`, `rideDistance`, `walkDistance`, `swimDistance`, `boosts`, `heals`, `vehicleDestroys`, `roadKills`, `longestKill`, `teamKills`, `weaponsAcquired`.

### SquadMatchTelemetry

Données de télémétrie parsées pour un `SquadMatch`. Champ `status` : `pending` → `running` → `done` | `failed` | `dead_letter`.

Champs JSON de données parsées :
- `summary` — résumé du match
- `weaponStats` — statistiques par arme
- `memberStats` — stats par membre
- `positionSamples` — échantillons de position (heatmap)
- `trajectorySegments` — segments de trajectoire
- `deathSamples`, `landingSamples`, `phaseSnapshots`
- `killSamples`, `shotSamples`, `damageSamples`
- `knockoutSamples`, `reviveSamples`, `vehicleSamples`

`attemptCount` et `nextRetryAt` gèrent les retries. Les jobs bloqués en `running` depuis plus de 10 min sont récupérés automatiquement au démarrage du worker.

### PlayerStats — Stratégie de périodes

```
memberId, period, periodType
startDate, endDate
totalKills, totalDamage, totalAssists, totalRevives
matchesPlayed, matchesWon, winRate, avgKillsPerGame, avgDamagePerGame
badgeType
```

**`period`** : clé composite unique par membre et par période.
- Semaine ISO : `"week-2026-23"` (année-numéro de semaine ISO sur 2 chiffres)
- Mois : `"month-2026-06"`
- All-time : `"all-time"`

**`periodType`** : `"week"` | `"month"` | `"all"`

Contrainte unique : `(memberId, period)`. Le recalcul écrase l'enregistrement existant (upsert).

**`badgeType`** : badge calculé à la volée pour le leaderboard (`top_killer`, `top_damage`, `best_wr`, `mvp`). Non persisté dans les stats finales — calculé live dans la route API.

### MemberTelemetryStats

Stats comportementales issues de l'analyse de la télémétrie, agrégées par période :

| Champ | Signification |
|---|---|
| `aggressionScore` | Score d'agressivité (proximité des combats, initiative) |
| `supportScore` | Score de soutien (revives, soins alliés) |
| `zoneDisciplineScore` | Score de discipline de zone bleue |
| `avgBlueZoneHits` | Nombre moyen de touches par la zone bleue |
| `avgFirstContactPhase` | Phase de jeu moyenne du premier contact ennemi |
| `avgCircleDelaySeconds` | Délai moyen avant d'entrer dans la zone sûre |
| `avgCircleDelayPercent` | Délai relatif en % du temps de zone |
| `avgSafeZonePresencePercent` | % du temps passé dans la zone sûre |
| `avgOnFootDistanceMeters` | Distance à pied moyenne par match |
| `avgVehicleDistanceMeters` | Distance en véhicule moyenne par match |
| `avgDamageTaken` | Dégâts reçus moyens par match |
| `avgHealsUsed`, `avgHealAmount` | Utilisation moyenne des soins |
| `avgBoostsUsed` | Utilisation moyenne des boosts |
| `maxVehicleSpeedKph` | Vitesse max en véhicule atteinte |

Contrainte unique : `(memberId, period)`.

### ClanSynergyTelemetryStats

Statistiques de synergies entre paires de membres (`memberAId`, `memberBId`) :
- `reviveCount` : nombre de fois que A a ranimé B ou B a ranimé A sur la période
- `coKillCount` : kills effectués en coopération
- `sharedDamageEvents` : événements de dégâts partagés

Contrainte unique : `(clanId, period, memberAId, memberBId)`.

### MemberSeasonStats

Deux modes :
- **Ranked** : stats du meilleur mode ranked trouvé (`rankedGameMode`) avec tier, sub-tier, points, meilleur tier historique
- **Normal** : stats agrégées en mode squad normal

`lastRefreshedAt` permet de savoir quand la dernière synchronisation avec l'API PUBG a eu lieu.

### MemberLifetimeStats

Stats lifetime regroupées en 6 blocs JSON : `combat`, `victory`, `support`, `vehicle`, `movement`, `other`. Structure interne dictée par l'API PUBG.

### AppConfig

Table clé-valeur générique :
```
key  (PK)  — identifiant de la config
value      — valeur texte libre (db.Text)
createdAt, updatedAt
```

Utilisée pour stocker des paramètres configurables via l'interface d'administration (labels, URLs, préférences d'affichage) sans nécessiter de déploiement.

### CronExecution

Journal d'exécution des tâches planifiées :
```
clanId, action, status
source  — "manual" | "cron" | "api"
triggeredBy  — userId déclencheur (si manuel)
startedAt, finishedAt, durationMs
message, details (Json)
```

Index sur `(clanId, startedAt)` et `(clanId, action, status)` pour les requêtes d'historique et de monitoring.

### PubgApiCallLog

Journal complet des appels API PUBG pour le monitoring du rate limit :
```
source, method, endpoint, shard
statusCode, success, retryCount
rateLimitLimit, rateLimitRemaining, rateLimitResetAt
startedAt, finishedAt, durationMs
clanId, memberId, errorMessage
```

Index sur `rateLimitResetAt` pour les requêtes de throttling.

---

## Relations clés

```
Clan
  └── ClanMember (1-N, clanId nullable pour SetNull on delete)
        ├── MemberIdentity (1-1 par userId)  →  UserAccount
        ├── Match (1-N)
        ├── SquadMember (1-N)  →  SquadMatch
        ├── PlayerStats (1-N, unique par period)
        ├── MemberWeaponStats (1-N, unique par period+weapon)
        ├── MemberTelemetryStats (1-N, unique par period)
        ├── MemberSeasonStats (1-N, unique par season)
        ├── MemberWeaponMastery (1-N, unique par weaponId)
        ├── MemberLifetimeStats (1-1)
        ├── ClanSynergyTelemetryStats (1-N en tant que memberA ou memberB)
        ├── Notification (1-N)
        ├── NotificationPreference (1-1)
        ├── ClanMemberRole (1-N)  →  ClanRole
        ├── ChallengeParticipant (1-N)  →  Challenge
        └── PlayerRewards (1-1)

SquadMatch
  └── SquadMatchTelemetry (1-1, unique par squadMatchId)

UserAccount
  ├── MemberIdentity (1-N)
  ├── UserSession (1-N)
  └── PasswordResetToken (1-N)

Clan
  ├── ClanRole (1-N)
  ├── Report (1-N)
  ├── Challenge (1-N)
  ├── ClanSynergyTelemetryStats (1-N)
  ├── CronExecution (1-N)
  └── MemberInvite (1-N)
```

---

### PlayerClanChange

```
id, pubgAccountId, platformShard, clanMemberId
previousClanId / newClanId          (clans du SITE — seuls utilisables pour un revert)
previousPubgClanId / newPubgClanId  (ce que l'API PUBG a renvoyé au moment de la détection)
source, status, runId
detectedAt, appliedAt, acknowledgedAt, acknowledgedByUserId, triggeredByUserId
```

`source` : `player_sync` · `auto_demotion` · `auto_transfer` · `ungrouped_promotion` · `player_refresh` · `manual_demotion` · `manual_transfer` · `manual_revert`

`status` : `observed` (écart en cours de confirmation) · `pending` (attend la validation d'un clan) · `applied` · `ignored` · `reverted`

La ligne est écrite **dans la même transaction que le mouvement** : un mouvement sans trace serait invisible, une trace sans mouvement serait un faux positif. `runId` rattache l'événement au passage de cron qui l'a produit, ce qui rend possible un revert par lot.

### ClanLifecycleRun

```
id, source, status, mode
startedAt, finishedAt, durationMs
membersScanned, apiCalls, statesHasClan / statesNoClan / statesUnknown
discrepanciesFound, awaitingConfirmation, movementsPlanned, movementsApplied
circuitBreakerTripped, movesRatioPercent, triggeredByUserId, errorMessage
```

Table dédiée plutôt que `CronExecution`, dont le `clanId` est obligatoire alors que ce cron est global. Elle sert aussi de **verrou** : un passage refuse de démarrer si un autre est encore `running`. Les passages bloqués sont fermés par `runDbMaintenance`.

---

## Gestion des migrations

Les migrations SQL sont dans `prisma/migrations/`. Chaque migration est un dossier horodaté avec un fichier `migration.sql`.

**En développement :** `npx prisma migrate dev` pour générer et appliquer une migration après modification du schéma.

**En production :** ne pas lancer `prisma migrate dev` ni `prisma migrate deploy`. Appliquer le SQL de migration manuellement sur la base de données distante. Le fichier `migration.sql` dans le dossier de la migration contient le SQL brut.

Raison : les migrations déjà appliquées manuellement sur le serveur de production peuvent avoir un checksum différent de ce que Prisma calcule, entraînant une erreur de déploiement bloquante.
