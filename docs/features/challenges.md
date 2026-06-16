# Challenges

Les challenges permettent à un clan d'organiser des compétitions internes ponctuelles entre membres. Un défi a une durée bornée, un type de métrique mesurée, et des récompenses en points attribuées aux 3 premiers.

---

## Modèles de données

### `Challenge`

| Champ | Type | Description |
|---|---|---|
| `id` | string (UUID) | Identifiant unique |
| `clanId` | number | Clan auquel le défi appartient |
| `title` | string | Titre du défi |
| `description` | string \| null | Description optionnelle |
| `type` | string | Clé de type parmi les types définis (voir ci-dessous) |
| `duration` | `'daily' \| 'weekly' \| 'monthly'` | Durée du défi |
| `startDate` | Date | Début automatique (minuit du jour de création) |
| `endDate` | Date | Fin calculée depuis `duration` |
| `target` | number \| null | Objectif chiffré optionnel (ex. 50 kills) |
| `criteria` | JSON | Critères supplémentaires libres (objet) |
| `rewards` | JSON | Points attribués (`'1st'`, `'2nd'`, `'3rd'`) |
| `topReward` | number \| null | Points du 1er (dénormalisé pour tri rapide) |
| `status` | `'pending' \| 'active' \| 'ended'` | État du cycle de vie |

### `ChallengeParticipant`

| Champ | Type | Description |
|---|---|---|
| `id` | string (UUID) | Identifiant unique |
| `challengeId` | string | Référence au défi |
| `memberId` | number | Référence au membre |
| `progress` | number | Score courant (métrique mesurée) |
| `rank` | number \| null | Rang final (null tant que le défi n'est pas terminé) |
| `reward` | number \| null | Points gagnés (null tant que le défi n'est pas terminé) |
| `joinedAt` | Date | Date d'inscription |
| `finishedAt` | Date \| null | Date de clôture pour ce participant |

### `ChallengeRewards`

```typescript
type ChallengeRewards = {
  '1st'?: number   // points pour le 1er
  '2nd'?: number   // points pour le 2ème
  '3rd'?: number   // points pour le 3ème
  [key: string]: number | undefined
}
```

Les points sont crédités dans `PlayerRewards.totalPoints` à la clôture du défi.

---

## Types de défis

Définis dans `src/lib/challenge-types.ts` :

| `key` | Nom | Description | Métrique |
|---|---|---|---|
| `kill_race` | Kill Race | Qui obtient le plus de kills ? | `kills` |
| `damage_race` | Damage Race | Le plus gros dealer de dégâts gagne | `damage` |
| `win_streak` | Win Streak | Le plus grand nombre de victoires squad | `squadWins` |
| `squad_synergy` | Squad Synergy | Meilleures performances d'une escouade de 3 | `squadStats` |
| `survival_expert` | Survival Expert | Meilleur placement moyen | `placementAverage` |

---

## Cycle de vie

### 1. Création (`POST /api/clans/[clanId]/challenges`)

Permission requise : `edit_clan` (Admin ou Owner).

Champs requis dans le body :

```typescript
type CreateChallengeInput = {
  title: string                       // requis
  description?: string                // optionnel
  type: string                        // clé de type, ex. "kill_race"
  duration: 'daily' | 'weekly' | 'monthly'  // requis
  target?: number                     // objectif chiffré optionnel
  rewards: ChallengeRewards           // au moins '1st' recommandé
  criteria?: Record<string, unknown>  // critères libres
}
```

Les dates `startDate` et `endDate` sont calculées automatiquement :
- `startDate` = minuit du jour courant
- `endDate` = startDate + 1 jour (`daily`), + 7 jours (`weekly`), + 1 mois (`monthly`)

Le défi est créé avec le statut `pending`.

### 2. Activation (`activateChallenge`)

Passe le statut à `active`. Crée automatiquement un `ChallengeParticipant` avec `progress = 0` pour chaque membre actif du clan (upsert). Déclenche une notification `challenge_started` à tous les membres.

### 3. Participation manuelle (`POST .../join`)

Un membre peut rejoindre un défi `active` après sa création. Utilise le même upsert — si le participant existait déjà, aucun changement.

### 4. Mise à jour du score (`updateParticipantProgress`)

Fonction interne `challenge-service.ts`. Met à jour `progress` d'un participant. Le déclenchement (cron, webhook, API) est à implémenter selon le type de métrique.

### 5. Clôture (`endChallenge`)

Calcule le classement final (`participants` triés par `progress` desc). Attribue `rank`, `reward` et `finishedAt` à chaque participant. Crédite les points dans `PlayerRewards` via une transaction. Passe le statut à `ended`.

---

## Routes API

### `GET /api/clans/[clanId]/challenges`

Liste les défis du clan.

**Query params** :
- `?status=active|ended|pending` (optionnel — tous si absent)

**Réponse 200** :
```json
{
  "challenges": [
    {
      "id": "uuid",
      "title": "Kill Race semaine",
      "type": "kill_race",
      "status": "active",
      "startDate": "2026-06-10T00:00:00.000Z",
      "endDate": "2026-06-17T00:00:00.000Z",
      "participants": [ ... ]  // top 3 participants, triés par progress desc
    }
  ]
}
```

### `POST /api/clans/[clanId]/challenges`

Crée un nouveau défi. Requiert `edit_clan`.

**Body** : `CreateChallengeInput`

**Réponse 201** : `{ "challenge": Challenge }`

### `GET /api/clans/[clanId]/challenges/[challengeId]`

Retourne le défi avec tous ses participants (triés par `progress` desc).

**Réponse 200** : `{ "challenge": Challenge & { participants: ChallengeParticipant[] } }`

### `GET /api/clans/[clanId]/challenges/[challengeId]/leaderboard`

Retourne le défi et le classement avec avatars.

**Réponse 200** :

```typescript
type LeaderboardEntry = {
  rank: number
  memberId: number
  displayName: string
  avatarUrl: string | null
  progress: number          // score actuel ou final
  reward: number            // points gagnés (ou potentiels si défi actif)
  joinedAt: Date
}

// { challenge: Challenge, leaderboard: LeaderboardEntry[] }
```

### `POST /api/clans/[clanId]/challenges/[challengeId]/join`

Le membre authentifié rejoint le défi. Requiert une session valide (`getActorMemberId`) et que le membre appartienne au clan.

**Conditions** : le défi doit être `active`. Retourne 400 si `Challenge is not active`.

**Réponse 201** : `{ "participant": ChallengeParticipant }`

---

## Pages UI

### `/clans/[clanId]/challenges`

Liste des défis du clan. Filtrable par statut. Carte par défi avec titre, type, dates, top 3 participants.

### `/clans/[clanId]/challenges/[challengeId]`

Détail d'un défi — classement complet, règles, progression, récompenses.
