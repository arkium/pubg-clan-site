# Clans — Structure, synchronisation PUBG et gestion des membres

Ce document décrit la structure des clans dans l'application, les rôles disponibles, la synchronisation avec l'API PUBG, la gestion des membres, la page overview et les crons liés.

---

## 1. Distinction fondamentale — Deux systèmes de gestion clan

Ces deux systèmes coexistent et ne doivent pas être confondus.

| | PUBG API Clans | Gestion interne (site) |
|---|---|---|
| **Source** | `api.pubg.com/shards/{shard}/clans/…` | Base de données locale (Prisma) |
| **Périmètre** | Données officielles PUBG (nom, tag, membres PUBG) | Membres trackés sur le site, rôles, invitations, stats |
| **Membres** | Liste des `accountId` PUBG de tous les membres du clan | Membres ajoutés manuellement avec `pubgPlayerName` / `pubgAccountId` |
| **Statut** | Partiellement consommé (nom, tag, memberCount) | Complet — gestion de rôles, invitations, stats |

---

## 2. Structure de données

### Table `Clan`

```prisma
model Clan {
  id            Int      // ID interne (auto-increment)
  name          String   // Nom du clan (depuis PUBG API)
  tag           String   // Tag court (ex. [MCL])
  platformShard String   // "steam" (shard)
  pubgClanId    String?  // ID PUBG du clan (ex. "clan.f.steam.abc123")
  clanStats     Json?    // JSON agrégé (voir section 6)
  isActive      Boolean  // false = clan archivé
}
```

### Table `ClanMember`

```prisma
model ClanMember {
  id             Int      // ID interne
  displayName    String   // Nom affiché sur le site
  pubgPlayerName String   // Nom PUBG (utilisé pour les appels API)
  pubgAccountId  String?  // ID PUBG du joueur (résolu à la première sync)
  platformShard  String
  isActive       Boolean  // false = membre archivé (quitté le clan)
  clanId         Int?     // FK vers Clan
}
```

### Tables de rôles

- `ClanRole` : définit les rôles custom du clan (nom, permissions associées).
- `ClanMemberRole` : table de liaison `ClanMember` ↔ `ClanRole`.

---

## 3. Rôles et hiérarchie

### Hiérarchie complète

```
SuperUser (rôle plateforme, cumulable avec un rôle clan)
  ├── Accès total à TOUS les clans
  ├── Seul à pouvoir changer de clan actif dans l'UI
  ├── Gère les triggers manuels cross-clan
  ├── Peut créer / archiver des clans
  ├── Peut être simultanément Owner d'un clan
  └── Géré via script CLI (voir docs/ops/superuser-bootstrap.md)

Owner (par clan)
  ├── Accès total à SON clan uniquement
  ├── Gère membres, rôles, sync, config et cron de son clan
  └── Ne peut pas agir sur un autre clan

Admin (par clan)
  ├── Gestion opérationnelle de SON clan uniquement
  ├── Invitations, promotion Member ↔ Admin
  ├── Sync des matchs
  └── Ne peut pas promouvoir au rôle Owner ni accéder aux crons

Moderator (par clan)
  ├── Animation du clan : défis, annonces, notifications
  ├── Peut inviter des membres (pas les retirer)
  ├── Accès rapports + export
  └── Aucune gestion de rôles, aucun accès sync/cron

Member (par clan)
  ├── Accès lecture seul à SON clan
  └── Aucune action de gestion
```

### Matrice des permissions

| Action | SuperUser | Owner | Admin | Moderator | Member |
|---|---|---|---|---|---|
| Voir toutes les pages d'un clan | ✅ tous clans | ✅ sien | ✅ sien | ✅ sien | ✅ sien |
| Changer de clan actif | ✅ | ❌ | ❌ | ❌ | ❌ |
| Créer / archiver un clan | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gérer les membres (inviter) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Retirer / archiver un membre | ✅ | ✅ | ✅ | ❌ | ❌ |
| Promouvoir Member ↔ Admin | ✅ | ✅ | ✅ | ❌ | ❌ |
| Promouvoir / révoquer Owner | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gérer défis (créer, modifier) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Sync matchs manuel | ✅ | ✅ | ✅ | ❌ | ❌ |
| Sync stats manuel | ✅ | ✅ | ❌ | ❌ | ❌ |
| Voir / piloter cron de son clan | ✅ | ✅ | ❌ | ❌ | ❌ |
| Voir rapports | ✅ | ✅ | ✅ | ✅ | ✅ |
| Exporter rapports | ✅ | ✅ | ❌ | ✅ | ❌ |
| Gérer notifications / annonces | ✅ | ✅ | ✅ | ✅ | ❌ |
| Gérer config clan (settings) | ✅ | ✅ | ❌ | ❌ | ❌ |

### Implémentation

- Les rôles clan sont stockés dans `ClanRole` / `ClanMemberRole`.
- Le statut SuperUser est sur `UserAccount.isSuperUser` (booléen).
- Les routes API vérifient via `requireRole(['Owner'])`, `requireRole(['Owner', 'Admin'])` ou `requireSuperUser()`.
- Le bypass SuperUser est automatique : `ensureMemberInClan()` laisse passer si `isSuperUser = true`.
- Un Owner du clan A ne peut pas agir sur le clan B (isolation garantie par `ensureMemberInClan()`).
- La promotion/révocation du rôle Owner est réservée au SuperUser.

---

## 4. Synchronisation PUBG — Ce qui est consommé

### Endpoints PUBG consommés

| Endpoint | Usage |
|---|---|
| `GET /shards/{shard}/clans?filter[clanIds]={id}` | Lookup clan par PUBG clan ID → nom, tag, memberCount |
| `GET /shards/{shard}/clans/{clanId}` | Fallback direct si le premier échoue |
| `GET /shards/{shard}/players/{playerId}` | Récupère le `clanId` depuis les attributs du joueur (lors de l'ajout d'un membre) |

### Endpoint disponible mais non consommé

| Endpoint | Données exposées | Impact actuel |
|---|---|---|
| `GET /shards/{shard}/clans/{clanId}/members` | Liste complète des membres PUBG (accountId + nom) | Les membres sont ajoutés manuellement ; aucune détection automatique des arrivées/départs |

### Données importées depuis l'API PUBG

| Champ API | Stocké en DB |
|---|---|
| `name` / `clanName` / `title` | `Clan.name` |
| `tag` / `clanTag` | `Clan.tag` |
| `memberCount` | Dans `Clan.clanStats` (JSON) |
| `clanLevel` | Non stocké |
| `clanPoints` | Non stocké |
| `createdAt` | Non stocké |

L'API utilise des noms de champs incohérents selon les shards. Le code gère plusieurs variantes via `pickString()` et `pickNumber()` dans `src/lib/pubg.ts`.

### Type normalisé `PubgClan`

```typescript
// src/lib/pubg.ts
export type PubgClan = {
  id: string          // PUBG clan ID (ex: "clan.f.steam.abc123")
  name: string
  tag: string
  memberCount: number | null
  raw: Record<string, unknown>
}
```

### Fonctions disponibles

| Fonction | Description |
|---|---|
| `fetchPubgClanById(clanId, shard)` | Lookup clan par PUBG clan ID |
| `fetchPlayerClan(playerId, shard)` | Récupère le clan d'un joueur depuis son profil PUBG |
| `searchPlayerByName(name, shard)` | Résout le `accountId` PUBG depuis un nom de joueur |

---

## 5. Gestion des membres

### Ajout d'un membre — flux manuel (invitation)

Les membres peuvent être ajoutés manuellement par un Owner/Admin. L'ajout crée un enregistrement `ClanMember` avec le `pubgPlayerName`. Le `pubgAccountId` est résolu au premier appel API (sync matchs ou lifetime stats).

**Endpoint invitation :** `POST /api/clans/[clanId]/members/[memberId]/invite`  
**Permission requise :** `manage_members`

Génère un token d'invitation et envoie un email ou un lien Discord. Voir `docs/features/auth.md` — section 3 pour le détail du flux d'activation.

### Ajout d'un membre — flux auto-inscription (`/join`)

Un nouveau joueur peut rejoindre ou créer un clan via la page `/join` sans intervention préalable d'un Owner.

**Page :** `/join`  
**Endpoint :** `POST /api/join`  
**Accès :** tout utilisateur connecté sans identité membre active

#### Flux

1. Le joueur saisit son nom PUBG et sa plateforme (`steam`, `xbox`, `psn`, `kakao`).
2. L'API résout le `pubgAccountId` via `searchPlayerByName()` (PUBG API).
3. L'API récupère le `pubgClanId` du joueur via `fetchPlayerClan()`.

**Cas 1 — Le clan PUBG existe déjà en DB :**
- Crée un `ClanMember` avec `isActive: false`, `joinStatus: 'pending'`.
- Lie le membre au `UserAccount` courant via `MemberIdentity`.
- Le joueur attend la validation d'un Owner/Admin.

**Cas 2 — Le clan PUBG est inconnu :**
- Crée un nouveau `Clan` + un `ClanMember` actif.
- Initialise les rôles par défaut du clan.
- Assigne automatiquement le rôle Owner au joueur (fondateur).

#### Gardes

- Un utilisateur déjà lié à un membre (`MemberIdentity` existante) reçoit un 409.
- Un `pubgAccountId` déjà présent en DB reçoit un 409 (évite les doublons).

#### Validation des membres en attente

**Page :** `/clans/[clanId]/members/pending`  
**Endpoint approbation :** `POST /api/clans/[clanId]/members/[memberId]/approve`  
**Endpoint rejet :** `POST /api/clans/[clanId]/members/[memberId]/reject`  
**Permission requise :** Owner ou Admin

L'approbation active le membre (`isActive: true`, `joinStatus: 'active'`) et lui assigne le rôle Member par défaut.

La route `GET /api/clans/[clanId]/members?status=pending` retourne uniquement les membres en attente.

### Champ `joinStatus`

| Valeur | Signification |
|---|---|
| `active` | Membre actif (défaut, ajout manuel ou approbation) |
| `pending` | En attente d'approbation (via flux /join) |
| `archived` | Membre archivé (a quitté le clan) |

### Changement de rôle

**Endpoint :** `PUT /api/clans/[clanId]/members/[memberId]/role`  
**Permission requise :** Owner ou Admin selon la cible. Promouvoir/révoquer Owner requiert SuperUser.

### Archivage

Un membre qui quitte le clan est passé à `isActive: false`, `joinStatus: 'archived'`. Il n'est plus inclus dans les calculs de stats ni dans les syncs, mais ses données historiques sont conservées.

---

## 6. Page `/clans/[clanId]/overview`

La page overview expose les données agrégées du clan, calculées et stockées dans `Clan.clanStats` (JSON).

### Structure du champ `clanStats`

Construit par `syncTrackedClanStats()` dans `src/lib/clan-service.ts` :

```json
{
  "syncedAt": "2026-06-09T10:00:00.000Z",
  "pubg": {
    "shard": "steam",
    "clanId": "clan.f.steam.abc123",
    "name": "Mon Clan",
    "tag": "MCL",
    "memberCount": 18,
    "raw": {}
  },
  "tracked": {
    "membersCount": 12,
    "aggregated": {
      "totalKills": 48320,
      "totalDamage": 5234100.0,
      "totalAssists": 12440,
      "totalRevives": 3180,
      "matchesPlayed": 12870,
      "matchesWon": 1245,
      "winRate": 0.0967
    },
    "topPerformers": {
      "kills":   { "memberId": 3, "displayName": "PlayerA", "value": 8234, "matchesPlayed": 312 },
      "damage":  { "memberId": 7, "displayName": "PlayerB", "value": 68420.12, "matchesPlayed": 289 },
      "winRate": { "memberId": 2, "displayName": "PlayerC", "value": 0.182, "matchesPlayed": 44 }
    }
  }
}
```

### Blocs affichés

**Bloc 1 — Fiche PUBG officielle**

| Champ | Source |
|---|---|
| Nom officiel PUBG | `clanStats.pubg.name` |
| Tag | `clanStats.pubg.tag` |
| ID PUBG | `clanStats.pubg.clanId` |
| Membres PUBG officiels | `clanStats.pubg.memberCount` |
| Membres trackés sur le site | `clanStats.tracked.membersCount` |
| Écart (badge d'alerte si > 0) | `memberCount - tracked.membersCount` |
| Dernière sync | `clanStats.syncedAt` |

**Bloc 2 — Agrégats all-time** : depuis `clanStats.tracked.aggregated` (kills, dégâts, matchs, victoires, win rate, assists, relèves).

**Bloc 3 — Top performers** : depuis `clanStats.tracked.topPerformers` — Top Killer, Top Damage, Best Win Rate.

**Bloc 4 — Diff PUBG vs Site** : chargé à la demande via `GET /api/clans/[clanId]/pubg-diff`. Compare les membres PUBG officiels (depuis l'endpoint `/clans/{clanId}/members` non consommé automatiquement) avec les membres trackés en base.

**Bloc 5 — Roster membres actifs** : tableau de tous les `ClanMember.isActive = true` avec rôle, date d'adhésion, statut compte site, statut lien PUBG et date de dernière sync lifetime.

---

## 7. Permissions dans les routes API

Les routes sensibles vérifient l'appartenance au clan ET le rôle. Le SuperUser bypasse automatiquement la vérification d'appartenance clan.

| Route | Permission requise |
|---|---|
| `GET /api/clans/[clanId]/members` | Session active (lecture) |
| `PUT /api/clans/[clanId]/members/[memberId]/role` | Owner ou Admin du clan (promotion Owner : SuperUser uniquement) |
| `POST /api/clans/[clanId]/members/[memberId]/invite` | Permission `manage_members` |
| `POST /api/clans/[clanId]/members/[memberId]/approve` | Owner ou Admin du clan |
| `POST /api/clans/[clanId]/members/[memberId]/reject` | Owner ou Admin du clan |
| `POST /api/clans/[clanId]/sync-matches` | Owner du clan ou SuperUser |
| `POST /api/clans/[clanId]/sync-stats` | Owner du clan ou SuperUser |
| `GET /api/clans/[clanId]/cron-control` | Owner du clan ou SuperUser |
| `POST /api/clans/[clanId]/cron-control` | Owner du clan ou SuperUser |
| `POST /api/join` | Utilisateur connecté sans identité membre existante |

---

## 8. Routes API concernées

| Route | Méthode | Description |
|---|---|---|
| `/api/clans` | `GET` | Liste tous les clans actifs avec comptage membres + matchs |
| `/api/clans/[clanId]/members` | `GET` | Liste membres avec rôles, invitations, statut compte |
| `/api/clans/[clanId]/members/[memberId]/role` | `PUT` | Change le rôle d'un membre |
| `/api/clans/[clanId]/members/[memberId]/invite` | `POST` | Envoie une invitation par email ou lien |
| `/api/clans/[clanId]/overview` | `GET` | Données overview du clan (clanStats JSON) |
| `/api/clans/[clanId]/pubg-diff` | `GET` | Diff membres PUBG officiels vs membres trackés |
| `/api/clans/[clanId]/sync-matches` | `POST` | Sync les matchs PUBG pour tous les membres actifs |
| `/api/clans/[clanId]/sync-stats` | `POST` | Recalcule les stats et met à jour `clanStats` JSON |
| `/api/clans/[clanId]/cron-control` | `GET/POST` | Pilotage manuel des crons (Owner uniquement) |

---

## 9. Crons liés aux clans

Les crons sont initialisés dans `src/lib/cron-jobs.ts` via `initCronJobs()`.

### Conditions d'activation

- `ENABLE_CRON_JOBS=true` sur le worker cron dédié.
- `ENABLE_CRON_JOBS=false` (ou absent) sur le worker web en mode 2 workers.
- Timezone : `CLAN_MATCH_SYNC_TIMEZONE` (défaut `UTC`).

### Schedules par défaut

| Variable | Schedule | Action |
|---|---|---|
| `CLAN_MATCH_SYNC_CRON` | `0 2 * * *` | Sync des matchs PUBG |
| `CLAN_STATS_RECALC_CRON` | `0 3 * * *` | Recalcul des stats week/month/all |
| `CLAN_LIFETIME_STATS_SYNC_CRON` | `0 4 * * *` | Refresh stats lifetime PUBG |
| `WEEKLY_REPORT_GENERATION_CRON` | `0 8 * * 1` | Rapport hebdomadaire automatique |
| `MONTHLY_REPORT_GENERATION_CRON` | `0 8 1 * *` | Rapport mensuel automatique |
| `CLAN_ONLINE_REMINDER_CRON` | `0 18 * * *` | Rappels notif clan online |
| `WEEKLY_REPORT_REMINDER_CRON` | `0 9 * * *` | Rappels notif rapport |

### Ce que calcule chaque job automatique

**`daily_sync` (sync matchs)**
- Appelle `POST /api/clans/[clanId]/sync-matches` pour chaque clan actif.
- Résout le `pubgAccountId` si manquant pour chaque membre.
- Récupère les matchs récents PUBG, importe en incrémental, upsert les lignes `Match`.
- Détecte les squads via `analyzeMatchForSquads` → `SquadMatch` / `SquadMember`.
- Garde-fous : import partiel → recalcul stats ignoré ; import sans nouveaux matchs → recalcul ignoré ; import complet avec nouveaux matchs → `syncTrackedClanStats` automatique.
- Les matchs PUBG introuvables (404) sont traités en `skipped` (non bloquants).

**`daily_stats_recalc` (recalcul stats)**
- Appelle `syncTrackedClanStats(clanId)` pour chaque clan actif.
- Recalcule `PlayerStats` pour les périodes `week`, `month`, `all`.
- Attribue les badges (`top_killer`, `top_damage`, `best_wr`, `mvp`).
- Purge les stats anciennes de plus de 12 mois (hors all-time).
- Met à jour `Clan.clanStats` JSON avec les agrégats et top performers.

**`daily_lifetime_stats_sync` (stats lifetime)**
- Appelle `syncClanLifetimeStats(clanId)` pour chaque clan actif.
- Résout les comptes PUBG manquants.
- Appelle l'API PUBG lifetime par membre.
- Upsert `MemberLifetimeStats` (catégories combat/victory/support/vehicle/movement/other).
- Met à jour `lastRefreshedAt`.

**`weekly_report_auto` / `monthly_report_auto`**
- Calcule highlights, charts, progression et recommandations.
- Persiste `Report` + `ReportSection`.
- Notifie les membres actifs du clan via `notifyReportReady`.

### Observabilité des crons

Les exécutions sont tracées dans la table `CronExecution` via `startCronExecution` / `finishCronExecution` :

| Champ | Description |
|---|---|
| `action` | Nom du job (`sync_matches`, `sync_stats`, etc.) |
| `status` | `running`, `success`, `partial`, `failed` |
| `source` | `manual`, `scheduler`, `system` |
| `details` | JSON avec `errorsCount`, `skippedCount`, `statsSync`, etc. |

La page `/clans/[clanId]/settings/cron` (réservée Owner) agrège cette observabilité via `getCronOverview(clanId)` et affiche l'historique, la santé, la configuration des variables d'environnement et le snapshot du rate limit PUBG API.

---

## 10. Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/lib/clan-service.ts` | Sync clan PUBG, `syncTrackedClanStats()`, `syncClanMembership()` |
| `src/lib/cron-jobs.ts` | Orchestration des crons planifiés |
| `src/lib/stats-calculator.ts` | `recalculateStatsForClan()`, attribution badges |
| `src/lib/pubg.ts` | `fetchPubgClanById()`, `fetchPlayerClan()`, `fetchClanMembers()` |
| `src/lib/cron-observability.ts` | `getCronOverview()`, `getCronConfigurationChecks()` |
| `src/app/api/clans/route.ts` | Liste des clans |
| `src/app/api/clans/[clanId]/members/route.ts` | Gestion des membres |
| `src/app/api/clans/[clanId]/sync-matches/route.ts` | Déclenchement sync matchs |
| `src/app/api/clans/[clanId]/cron-control/route.ts` | Pilotage cron |
| `src/app/clans/[clanId]/overview/page.tsx` | Page overview clan |
| `src/app/clans/[clanId]/settings/cron/page.tsx` | Page pilotage cron (Owner) |
| `prisma/schema.prisma` | Schéma DB |
