# Clans — Endpoint PUBG API, données disponibles et conception des pages

Ce document décrit ce que l'API PUBG expose pour les clans, ce qui est effectivement consommé et stocké aujourd'hui, et propose la conception de deux pages — une pour le membre et une pour le clan.

Sources de vérité du code :
- `src/lib/pubg.ts` — `fetchPubgClanById()`, `fetchPlayerClan()`, types `PubgClanResource`, `PubgClan`
- `src/lib/clan-service.ts` — `syncTrackedClanStats()`, `upsertTrackedClanFromPubg()`
- `prisma/schema.prisma` — modèles `Clan`, `ClanMember`
- `src/app/api/clans/route.ts` — liste des clans
- `src/app/api/clans/[clanId]/members/route.ts` — gestion des membres

---

## Distinction fondamentale — Deux systèmes de gestion clan

> **À ne pas confondre.** Ces deux systèmes coexistent.

| | PUBG API Clans | Gestion interne (site) |
|---|---|---|
| **Source** | `api.pubg.com/shards/{shard}/clans/…` | Base de données locale (Prisma) |
| **Périmètre** | Données officielles PUBG (nom, tag, membres PUBG) | Membres trackés sur le site, rôles, invitations, stats |
| **Membres** | Liste des `accountId` PUBG de tous les membres du clan | Membres ajoutés manuellement avec `pubgPlayerName` / `pubgAccountId` |
| **Statut** | Partiellement consommé (nom, tag, memberCount) | ✅ Complet — gestion de rôles, invitations, stats |
| **Sync** | Manuelle / cron — pas de sync automatique de la liste des membres | N/A |

---

## 1. Endpoints PUBG API Clans — Ce qui est disponible

### 1.1 Endpoints consommés

| Endpoint | Usage dans l'app |
|---|---|
| `GET /shards/{shard}/clans?filter[clanIds]={id}` | Lookup clan par PUBG clan ID → nom, tag, memberCount |
| `GET /shards/{shard}/clans/{clanId}` | Fallback direct si le premier échoue |
| `GET /shards/{shard}/players/{playerId}` | Récupère le `clanId` depuis les attributs du joueur (lors de l'ajout d'un membre) |

### 1.2 Endpoints disponibles mais non consommés

| Endpoint | Données exposées | Intérêt |
|---|---|---|
| `GET /shards/{shard}/clans/{clanId}/members` | Liste complète des membres PUBG (accountId + nom) | **Élevé** — permettrait l'auto-sync des membres |

---

## 2. Ce que l'API PUBG fournit — Réponse clan

### Champs retournés par `GET /shards/{shard}/clans/{clanId}`

L'API retourne un objet JSON:API (`type: "clan"`) avec :

**Attributs principaux (`attributes`) :**

| Champ API (variantes possibles) | Type | Description | Stocké en DB |
|---|---|---|---|
| `name` / `clanName` / `title` | string | Nom du clan | ✅ `Clan.name` |
| `tag` / `clanTag` | string | Tag court (ex. `[ABC]`) | ✅ `Clan.tag` |
| `memberCount` / `membersCount` / `clanMemberCount` | number | Nombre de membres PUBG | ✅ dans `Clan.clanStats` JSON |
| `clanLevel` | number | Niveau du clan PUBG | ❌ non stocké |
| `clanPoints` | number | Points cumulés du clan | ❌ non stocké |
| `createdAt` | string (ISO 8601) | Date de création du clan PUBG | ❌ non stocké |

> **Note :** L'API utilise des noms de champs incohérents selon les shards et versions. Le code gère plusieurs variantes via `pickString()` et `pickNumber()` (`src/lib/pubg.ts:371`).

**Relationships (si présentes) :**

| Relation | Type | Contenu | Consommé |
|---|---|---|---|
| `members` | array | Liste des `accountId` des membres du clan PUBG | ❌ non consommé |
| `clans` | object | Référence au clan (depuis un joueur) | ✅ lu lors de `fetchPlayerClan()` |

### Type `PubgClan` (objet normalisé par l'app)

```typescript
// src/lib/pubg.ts:363
export type PubgClan = {
  id: string          // PUBG clan ID (ex: "clan.f.steam.abc123")
  name: string        // Nom du clan
  tag: string         // Tag court
  memberCount: number | null
  raw: Record<string, unknown>  // Réponse brute complète
}
```

---

## 3. Ce qui est stocké en base de données

### Table `Clan`

```prisma
model Clan {
  id            Int      // ID interne (auto-increment)
  name          String   // Nom du clan (depuis PUBG API)
  tag           String   // Tag (depuis PUBG API)
  platformShard String   // "steam" (shard)
  pubgClanId    String?  // ID PUBG du clan (ex: "clan.f.steam.abc123")
  clanStats     Json?    // JSON agrégé — voir structure ci-dessous
  isActive      Boolean
}
```

### Structure du champ `clanStats` (JSON)

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
    "raw": { /* réponse brute API */ }
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

### Table `ClanMember`

```prisma
model ClanMember {
  id             Int      // ID interne
  displayName    String   // Nom affiché sur le site (peut différer du nom PUBG)
  pubgPlayerName String   // Nom PUBG (utilisé pour les appels API)
  pubgAccountId  String?  // ID PUBG du joueur (résolu à la première sync)
  platformShard  String
  isActive       Boolean  // false = membre archivé (quitté le clan)
  clanId         Int?     // FK vers Clan
}
```

---

## 4. Ce qui n'est pas consommé — Lacunes identifiées

### 4.1 Liste des membres PUBG (`relationships.members`)

**Lacune principale.** L'API PUBG fournit la liste des `accountId` de tous les membres du clan officiel PUBG. Cette liste n'est pas consommée.

**Conséquences actuelles :**
- Les membres sont ajoutés **manuellement** sur le site
- Il n'y a pas de détection automatique des membres qui ont rejoint le clan PUBG
- Il n'y a pas de détection automatique des membres qui ont quitté le clan PUBG
- Divergence possible entre le clan PUBG officiel et les membres trackés sur le site

**Ce que ça permettrait :**
- Détecter automatiquement les nouveaux membres PUBG → proposer de les ajouter au site
- Détecter automatiquement les départs → proposer d'archiver (`isActive = false`)
- Afficher un diff "PUBG vs Site" pour l'admin

### 4.2 Champs clan non stockés

| Champ API | Valeur pour le site | Effort |
|---|---|---|
| `clanLevel` | Progression du clan, badge de niveau | Faible — ajouter une colonne `clanLevel Int?` |
| `clanPoints` | Points cumulés de tous les membres | Faible — ajouter `clanPoints Int?` |
| `createdAt` | Ancienneté du clan PUBG | Faible — ajouter `pubgCreatedAt DateTime?` |

---

## 5. Fonctions disponibles dans `src/lib/pubg.ts`

| Fonction | Description |
|---|---|
| `fetchPubgClanById(clanId, shard)` | Lookup clan par PUBG clan ID — retourne `PubgClan \| null` |
| `fetchPlayerClan(playerId, shard)` | Récupère le clan d'un joueur via son profil PUBG |
| `searchPlayerByName(name, shard)` | Résout le `accountId` PUBG depuis un nom de joueur |

---

## 6. Conception des deux pages

---

### Page A — Membre : `/members/[id]/clan` (nouvelle)

**Objectif :** Donner au joueur une vue de sa place dans le clan — son rôle, son historique, ses stats par rapport au groupe.

#### Bloc 1 — Identité dans le clan

| Info | Source |
|---|---|
| Nom affiché | `ClanMember.displayName` |
| Nom PUBG | `ClanMember.pubgPlayerName` |
| Rôle dans le clan | `ClanMemberRole → ClanRole.name` (Owner / Admin / Moderator / Member) |
| Depuis quand membre | `ClanMember.createdAt` |
| Compte site lié | `ClanMember.identities.length > 0` → oui / non |
| Lien PUBG | `ClanMember.pubgAccountId` → ID vérifié ou en attente |

#### Bloc 2 — Statistiques rapides (snapshot all-time)

Depuis `PlayerStats` (all-time) ou `MemberLifetimeStats` :

| KPI | Valeur | Source |
|---|---|---|
| Kills totaux | — | `PlayerStats.totalKills` (all-time) |
| Dégâts totaux | — | `PlayerStats.totalDamage` |
| Matchs joués | — | `PlayerStats.matchesPlayed` |
| Win rate | — | `PlayerStats.winRate` |
| K/M | — | calculé |

**Position dans le clan** (depuis `/api/members/[id]/stats` → `clanRanks`) :

Afficher les médailles obtenues sur les métriques lifetime (déjà calculé).

#### Bloc 3 — Lien avec le clan PUBG officiel

Si `ClanMember.pubgAccountId` est résolu et que le clan a un `pubgClanId` :

| Info | Source |
|---|---|
| Membre du clan PUBG officiel | Vérifiable via `fetchPlayerClan()` |
| Statut de vérification | « Vérifié », « Non vérifié », « Hors clan PUBG » |

---

### Page B — Clan : `/clans/[clanId]/overview` (nouvelle) ou enrichissement de `/clans/[clanId]/settings`

**Objectif :** Vue d'ensemble du clan pour l'admin — données PUBG officielles, roster comparé, sync status.

#### Bloc 1 — Fiche clan PUBG

Depuis `Clan.clanStats.pubg` :

| Champ | Valeur affichée |
|---|---|
| Nom officiel PUBG | `pubg.name` |
| Tag | `pubg.tag` |
| ID PUBG | `pubg.clanId` |
| Membres PUBG officiels | `pubg.memberCount` |
| Membres trackés sur le site | `tracked.membersCount` |
| Différence | `memberCount - tracked.membersCount` → écart affiché avec badge |
| Dernière sync | `clanStats.syncedAt` |

**Exemple d'affichage :**

```
Clan PUBG : [MCL] Mon Clan
Membres PUBG officiel : 18    Membres trackés : 12    ⚠ Écart : 6
Dernière sync : il y a 2 jours
```

#### Bloc 2 — Agrégats clan (depuis `clanStats.tracked.aggregated`)

| Métrique clan | Valeur |
|---|---|
| Kills totaux (all-time) | 48 320 |
| Dégâts totaux | 5 234 100 |
| Matchs joués | 12 870 |
| Victoires | 1 245 |
| Win rate moyen | 9.7% |
| Assists totaux | 12 440 |
| Relèves totales | 3 180 |

Top performers (depuis `clanStats.tracked.topPerformers`) :
- Top Killer, Top Damage, Best Win Rate — 3 cartes avec nom et valeur

#### Bloc 3 — Diff PUBG vs Site (nécessite consommation de l'endpoint membres PUBG)

> **Dépend de la lacune 4.1.** Nécessite de consommer `GET /clans/{clanId}/members`.

Un tableau comparatif :

| Joueur PUBG | Présent sur le site | Action suggérée |
|---|---|---|
| PlayerX (account: abc…) | ✅ Oui — PlayerX | — |
| PlayerY (account: def…) | ✅ Oui — PlayerY | — |
| PlayerZ (account: ghi…) | ❌ Non | Bouton "Ajouter au site" |
| — | PlayerW (sur site) | ⚠ Absent du clan PUBG — Archiver ? |

#### Bloc 4 — Roster membres actifs

Tableau de tous les membres actifs, avec pour chacun :

| Membre | Rôle | Depuis | Compte site | Lien PUBG | Dernière sync |
|---|---|---|---|---|---|
| PlayerA | Owner | 2024-03-12 | ✅ | ✅ | il y a 1h |
| PlayerB | Member | 2024-08-05 | ✅ | ✅ | il y a 2h |
| PlayerC | Member | 2025-01-20 | ❌ (invitation en attente) | ✅ | il y a 3 jours |

- Colonne **Compte site** : `ClanMember.identities.length > 0`
- Colonne **Lien PUBG** : `ClanMember.pubgAccountId` résolu ou non
- Colonne **Dernière sync** : `MemberLifetimeStats.lastRefreshedAt`

Actions disponibles par ligne : Inviter / Changer de rôle / Archiver.

---

## 7. Idées d'évolution — Auto-sync des membres

### Option A — Détection à la demande (effort faible)

Un bouton "Comparer avec le clan PUBG" sur la page admin :
1. Appelle `GET /shards/{shard}/clans/{pubgClanId}` → récupère les `accountId` membres
2. Croise avec `ClanMember.pubgAccountId` en DB
3. Affiche le diff sans modifier quoi que ce soit
4. L'admin choisit manuellement qui ajouter ou archiver

**Prérequis :** Consommer le champ `relationships.members` dans `fetchPubgClanById()`.

### Option B — Cron de surveillance (effort moyen)

Un cron quotidien (ou hebdomadaire) qui :
1. Récupère la liste des membres PUBG officiels du clan
2. Détecte les nouveaux comptes non encore trackés
3. Envoie une notification admin → "3 nouveaux membres détectés dans le clan PUBG"
4. Détecte les comptes qui ne sont plus dans le clan PUBG
5. Envoie une notification admin → "PlayerX a quitté le clan PUBG"

Aucune modification automatique des membres — l'admin valide toujours.

### Option C — Sync automatique totale (effort élevé)

Sync automatique bidirectionnelle :
- Nouveau membre PUBG → créé en `ClanMember` avec `isActive = true`
- Membre parti du clan PUBG → `isActive = false` automatiquement

**Risque :** un joueur peut être dans le clan PUBG mais ne pas vouloir être tracké sur le site. Besoin d'une politique de consentement.

---

## 8. Champs à ajouter au schéma (évolutions P1)

```prisma
model Clan {
  // Champs existants...
  
  // Nouveaux champs depuis l'API PUBG
  clanLevel      Int?      // Niveau du clan PUBG (si exposé par l'API)
  clanPoints     Int?      // Points du clan PUBG (si exposé par l'API)
  pubgCreatedAt  DateTime? // Date de création du clan PUBG
  pubgMemberCount Int?     // Nombre de membres PUBG officiels (depuis dernière sync)
  pubgMembersSyncedAt DateTime? // Date de la dernière sync de la liste membres PUBG
}
```

---

## 9. APIs internes existantes

| Route | Méthode | Description |
|---|---|---|
| `/api/clans` | `GET` | Liste tous les clans actifs avec comptage membres + matchs |
| `/api/clans/[clanId]/members` | `GET` | Liste membres avec rôles, invitations, statut compte |
| `/api/clans/[clanId]/members/[memberId]/role` | `PUT` | Change le rôle d'un membre |
| `/api/clans/[clanId]/members/[memberId]/invite` | `POST` | Envoie une invitation par email |
| `/api/clans/[clanId]/sync-matches` | `POST` | Sync les matchs PUBG pour tous les membres actifs |
| `/api/clans/[clanId]/sync-stats` | `POST` | Recalcule les stats et met à jour `clanStats` JSON |

### API à créer

| Route | Méthode | Description |
|---|---|---|
| `/api/clans/[clanId]/pubg-diff` | `GET` | Compare membres PUBG officiels vs membres trackés |

---

## 10. Fichiers clés à modifier ou créer

| Fichier | Action |
|---|---|
| `src/lib/pubg.ts` | Étendre `fetchPubgClanById()` pour consommer `relationships.members` ; ajouter `fetchClanMembers(clanId, shard)` |
| `src/lib/clan-service.ts` | Ajouter `syncClanMembership()` pour le diff PUBG vs site |
| `prisma/schema.prisma` | Ajouter `clanLevel`, `clanPoints`, `pubgCreatedAt`, `pubgMemberCount` à `Clan` |
| `src/app/api/clans/[clanId]/pubg-diff/route.ts` | Nouvelle route — diff membres |
| `src/app/members/[id]/clan/page.tsx` | Nouvelle page membre — fiche clan du joueur |
| `src/app/clans/[clanId]/overview/page.tsx` | Nouvelle page clan — dashboard PUBG + roster + diff |

---

## 11. Checklist d'avancement

### Étape 1 — Consommer `relationships.members` (débloque tout le reste)

- [x] Ajouter `memberIds: string[] | null` au type `PubgClan` (`src/lib/pubg.ts`)
- [x] Extraire `relationships.members` dans `normalizePubgClanResource()` (`src/lib/pubg.ts`)
- [x] Ajouter `fetchClanMembers(clanId, shard)` — appel dédié à `GET /clans/{clanId}/members` (`src/lib/pubg.ts`)

### Étape 2 — Route diff backend

- [x] Créer `/api/clans/[clanId]/pubg-diff/route.ts` — croise `fetchClanMembers()` avec `ClanMember.pubgAccountId` en DB
- [x] Ajouter `syncClanMembership()` dans `src/lib/clan-service.ts` (logique diff PUBG vs site)

### Étape 3 — Schéma DB (évolutions P1)

- [x] Ajouter à `Clan` : `clanLevel Int?`, `clanPoints Int?`, `pubgCreatedAt DateTime?`, `pubgMemberCount Int?`, `pubgMembersSyncedAt DateTime?`
- [x] Générer et appliquer la migration Prisma (`20260611120000_add_clan_pubg_fields`)
- [x] Régénérer le client Prisma (`npx prisma generate`) — à faire après arrêt du serveur dev

### Étape 4 — Page B : `/clans/[clanId]/overview`

- [x] Bloc 1 — Fiche PUBG officielle + écart membres (depuis `clanStats.pubg`)
- [x] Bloc 2 — Agrégats clan + top performers (depuis `clanStats.tracked`)
- [x] Bloc 3 — Diff PUBG vs site (chargement à la demande via bouton)
- [x] Bloc 4 — Roster membres actifs avec statuts

### Étape 5 — Page A : `/members/[id]/clan`

- [ ] Bloc 1 — Identité dans le clan (rôle, dates, liens)
- [ ] Bloc 2 — Stats rapides all-time + position dans le clan
- [ ] Bloc 3 — Statut d'appartenance au clan PUBG officiel (`fetchPlayerClan()`)

### Étape 6 — Auto-sync (optionnel, choisir une option)

- [ ] **Option A** — Bouton "Comparer avec le clan PUBG" (effort faible, recommandé en premier)
- [ ] **Option B** — Cron de surveillance + notifications admin (effort moyen)
- [ ] **Option C** — Sync automatique totale avec politique de consentement (effort élevé)
