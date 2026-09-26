# Clans — Structure, synchronisation PUBG et gestion des membres

Ce document décrit la structure des clans dans l'application, les rôles disponibles, la synchronisation avec l'API PUBG, la gestion des membres, la page overview et les crons liés.

---

> 🔗 **Le suivi de l'appartenance dans le temps** — détection des départs, clan technique `Ungrouped`,
> promotion, archivage et journal des mutations — est documenté à part :
> [Cycle de vie du clan d'un joueur](cycle-de-vie-clan.md).

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

## 4bis. Le clan technique `Ungrouped`

Un clan par `platformShard` porte `isSystem: true`. Il sert de **parking** aux joueurs sans clan qu'on continue de suivre, et à ceux en transition.

Ses particularités, toutes assumées :

- pas de `pubgClanId`, donc **jamais** synchronisé depuis l'API PUBG ;
- **actif** (`isActive: true`) — ses membres continuent d'être synchronisés, c'est l'intérêt même du parking ;
- filtré du sélecteur de clan et du comparateur pour les non-SuperUsers ;
- identifié **par `isSystem`**, jamais par son nom.

`syncClanMembership()` refuse explicitement un clan système : il n'a pas de roster PUBG à comparer.

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

### 5bis. Les trois façons de faire sortir un membre

| Geste | Qui | Effet sur `ClanMember` | Sync PUBG |
|---|---|---|---|
| **Sortir du clan** (`PATCH`) | Owner | `clanId` → clan technique | maintenue |
| **Transférer de clan** (`PATCH`) | SuperUser | `clanId` → clan cible | maintenue |
| **Arrêter le suivi** (`DELETE`) | **SuperUser uniquement** | `isActive: false`, `clanId` inchangé | **arrêtée** |

`DELETE` est réservé au SuperUser depuis le 2026-09-20 : il coupe la synchronisation, donc fait disparaître le joueur de l'écosystème. Un Owner qui veut se séparer d'un membre le bascule vers le clan technique — le suivi continue et la bascule est tracée.

Les trois gestes retirent le membre des agrégats du clan. Détails et conséquences : [Cycle de vie du clan](cycle-de-vie-clan.md).

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

### Blocs affichés — refonte « vitrine » du 2026-09-26

Maquette Claude Design « Vue ensemble clan » (écrans 11a à 11f). La page passait de 8 blocs au même niveau (~3 200 px) à une
vitrine, dans cet ordre :

| Bloc | Contenu | Filtré par le bandeau ? |
|---|---|---|
| Vitrine | Image du clan (réglage `login_welcome_image_url`, page « Accueil login » ; à défaut, ou si elle ne se charge plus, `/clans/default_clan.jpg` comme le sélecteur de clan, avec un raccourci « Ajouter l’image du clan » pour qui a accès au réglage) ; fiche PUBG : tag, nom, **niveau** (`clanStats.pubg.raw.attributes.clanLevel` — la colonne `Clan.clanLevel` est vide pour tous les clans), membres PUBG (`clanStats.pubg.memberCount`) et suivis, dernière sync ; palmarès : top 1 du mois, rang en **Ligue des clans** (mois), kills depuis le début du suivi (`tracked.aggregated.totalKills`), tournoi gagné s'il y en a un, sinon parties du mois | Non |
| Briefing de la semaine | Trois faits illustrés, chacun avec son lien : dernier top 1 de la semaine (carte, heure, kills, MVP) → débriefing ; plus long kill de la semaine (`KillEvent`, distance en cm → m, tête, clan de la victime) → replay (`?tab=replay`) ; série de soirées consécutives avec un top 1 (journée de jeu, « au moins N » si elle remonte au début des soirées lues) → soirées. Carte de repli quand un fait manque | Non (semaine ISO) |
| Bandeau de filtres | Période, type de match, mode — inchangé ; il ne filtre que ce qui suit | — |
| Chiffres clés | Kills, Top 1, Dégâts moyens, Parties (`KpiGrid`, même composant que Matchs et Soirée), chacun avec un lien : Top fraggers (Classement), Revoir les top 1 (Matchs), Stats armes, Soirées | Oui |
| Performances par mode | Images duo / trio / squad, top 1 en pastille, parties, kills, win rate, lien vers les soirées | Oui |
| Duo de la période | Paire au meilleur taux de top 1 avec **au moins 5 parties ensemble** (`pickDuo`), kills de chacun, top 1, **réanimations croisées** (`/api/clans/[clanId]/telemetry/synergies`, `reviveCount`), comparaison au taux du clan | Oui |
| Synergies de squad | Barres par taux de top 1 (paires et escouades, ≥ 5 parties) ; « Toutes les synergies » déplie le panneau détaillé `SquadSynergies` (paires, escouades, réanimations et kills croisés) | Oui |
| Explorer le clan | Pages du clan (registre de navigation, droits respectés) regroupées en Jouer ensemble / Progresser / Se mesurer (`groupByIntent` : une page inconnue va dans Progresser), plus Tournois, Ligue des clans et Comparateur ; indices : parties de la semaine, membres suivis, défis en cours, joueur en tête, rang en Ligue | Non |

Données de la vitrine : `GET /api/clans/[clanId]/overview/showcase` (`src/lib/clan-showcase-service.ts`, logique pure dans
`src/lib/clan-showcase.ts`), même permission que la vue d'ensemble, gardée 5 minutes en mémoire par clan (~450 ms à froid
pour Aurore_Funeste). Le classement de la Ligue est calculé par `computeClansLeaderboard` (`src/lib/clans-leaderboard.ts`),
partagé avec `GET /api/clans-leaderboard` ; les tournois gagnés par `listTournamentOverviews()`.

**Image d'un clan introuvable** (2026-09-27) : une image téléversée vit dans `public/uploads/clans/`, hors git ; le
lien reste en base même si le fichier disparaît du serveur (cas de FR-Alliance-BE, `/uploads/clans/clan-7-….jpg` en 404).
Aucun endroit ne laisse alors un cadre vide :

| Endroit | Repli |
|---|---|
| Vitrine (vue d'ensemble) | `useImageFallback` (`src/hooks/useImageFallback.ts`) : `/clans/default_clan.jpg` ; pour qui a accès au réglage, le raccourci devient « Remplacer l'image du clan » |
| Annuaire `/clans` (fonds de carte) | `clanBackgroundImage` (`src/lib/clan-image.ts`) : l'image par défaut posée **sous** celle du clan, en second calque CSS ; le navigateur l'affiche si la première ne se charge pas |
| Connexion, activation, activation en attente | `useImageFallback` : `/squad.jpg` |
| Header, fenêtre de changement de clan | `onError` déjà en place : `/pubg.png` |

Pour réparer un clan, il suffit de téléverser à nouveau son image depuis « Accueil login ».

**Blocs déplacés** (décision du 2026-09-26 : rien n'est supprimé du site) :

| Ancien bloc | Nouvelle place |
|---|---|
| Pression au drop, Villes et zones de combat | Page Drop zones du clan (`ClanDropInsights`), tous types de partie et tous modes comme la carte |
| Top performers (kills, dégâts, survie) | Page Awards (`ClanTopPerformers`), parties officielles, tous modes |
| Awards du mode (6 cartes, libellés anglais) | Retirés : la page Awards couvre ces distinctions |
| Roster des performances | Retiré : Membres (liste) et Classement (statistiques triables) |

---

## 6 bis. Annuaire des clans (`/clans`) — refonte du 2026-09-26

Maquette Claude Design « Clans » (écrans 12a à 12e). Page ouverte à **tous** : membres connectés, SuperUsers et visiteurs
(décision du 2026-09-26 ; les membres étaient auparavant renvoyés vers `/members`). **Ouvrir** un autre clan que le sien
suit la lecture des données : SuperUser, ou mode visiteur (`DISABLE_AUTH_PERMISSIONS`, lecture ouverte à tous — le cas en
production). Hors de ces cas, un membre n'ouvre que son clan ; les autres cartes s'affichent sans lien (« Consultable
par les membres de ce clan »). Voir [auth.md](auth.md) §7.

| Bloc | Contenu |
|---|---|
| Bandeau | `MatchesBanner` commun (« Les clans »), pastilles « N clans suivis » et « N joueurs ont joué ce soir » |
| Totaux | Une ligne : clans, joueurs, parties, heures de jeu, kills, « depuis le début du suivi » (`quickStats` de `GET /api/clans`) |
| Bandeau collant | Recherche par nom ou tag (crochets et casse ignorés) et tri Activité / Nom / Effectif / Parties (`DockingToolbar`) |
| À la une | **Clan épinglé** : son clan pour un connecté (« Mon clan »), le clan mémorisé pour un visiteur (« Dernier clan consulté ») ; **Clan du moment** : le plus de top 1 sur 7 jours, au moins 5 parties, puis le meilleur taux (jamais le clan technique). Masqué pendant une recherche |
| Clans actifs | Partie dans les 14 derniers jours ; carte compacte : image, pastille « ● N » (joueurs de la soirée), effectif, parties ensemble en 7 jours, dernière partie en relatif, top 1 en 7 jours et rang en Ligue (mois). Tri par activité par défaut : joueurs de la soirée, parties en 7 jours, dernière partie |
| En sommeil | Sans partie depuis 14 jours : liste repliée et grisée |

**Décisions du 2026-09-26**

- « En jeu ce soir » de la maquette → **« ont joué ce soir »** : joueurs distincts ayant une partie dans la soirée en
  cours (journée de jeu, `sessionDateOf`). Les parties arrivent par la synchronisation horaire : seules ~6 % sont en base
  moins de 15 minutes après leur fin, plus de la moitié après 2 h ; un « en jeu maintenant » serait presque toujours à 0.
- « +4 places en Ligue » (clan du moment) : **retiré**, aucun historique du rang n'est conservé ; remplacé par le rang du
  mois.
- « Parties » = parties **ensemble** (`SquadMatch`, au moins deux membres suivis) ; « dernière partie » =
  `Clan.lastMatchAt`, solo compris. Un clan qui ne joue qu'en solo affiche donc « 0 partie ensemble · dernière partie ce soir ».

**Données** : `GET /api/clans` (inchangée : liste, image, `quickStats`) et `GET /api/clans/directory`
(`src/lib/clan-directory-service.ts`, logique pure dans `src/lib/clan-directory.ts`) : par clan, parties et top 1 sur 7
jours glissants, joueurs de la soirée, dernière partie, rang en Ligue ; joueurs de la soirée tous clans confondus ; clan
du moment. Aucune donnée nominative ; gardée 5 minutes (~180 ms à froid). `ClanSelector` est supprimé.

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
| `/api/clans/directory` | `GET` | Annuaire : activité 7 jours, joueurs de la soirée, rang en Ligue, clan du moment (cache 5 min) |
| `/api/clans/[clanId]/overview/showcase` | `GET` | Vitrine : niveau, palmarès, briefing de la semaine, indices de navigation (cache 5 min) |
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
| `src/app/clans/[clanId]/overview/page.tsx` | Page overview clan (vitrine) |
| `src/components/clan-overview/ClanOverviewSections.tsx` | Vitrine, briefing, modes, duo, synergies, « Explorer le clan » |
| `src/lib/clan-showcase.ts`, `src/lib/clan-showcase-service.ts` | Données de la vitrine |
| `src/lib/clans-leaderboard.ts` | Classement de la Ligue des clans (partagé) |
| `src/app/clans/[clanId]/settings/cron/page.tsx` | Page pilotage cron (Owner) |
| `prisma/schema.prisma` | Schéma DB |
