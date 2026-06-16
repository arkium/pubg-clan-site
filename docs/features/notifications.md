# Notifications

Le systeme de notifications informe les membres du clan d'evenements pertinents (match detecte, performance, defi lance, rapport pret). Chaque membre peut configurer ses preferences par canal et par type.

---

## Modeles de donnees

### `Notification`

| Champ | Type | Description |
|---|---|---|
| `id` | string (UUID) | Identifiant unique |
| `memberId` | number | Membre destinataire |
| `type` | `NotificationType` | Type de notification (voir ci-dessous) |
| `title` | string | Titre court |
| `message` | string | Corps du message |
| `data` | JSON | Metadonnees contextuelles (ids, liens, valeurs) |
| `read` | boolean | Statut de lecture (defaut : false) |
| `readAt` | Date \| null | Date de lecture |
| `createdAt` | Date | Date de creation |

### `NotificationPreference`

| Champ | Type | Defaut | Description |
|---|---|---|---|
| `memberId` | number | — | Cle primaire unique (un par membre) |
| `squadDetected` | boolean | true | Nouveau match squad detecte |
| `topPerformance` | boolean | true | Meilleure performance de la periode |
| `challengeStarted` | boolean | true | Nouveau defi lance dans le clan |
| `reportReady` | boolean | true | Rapport periodique pret |
| `inviteReminder` | boolean | false | Rappel d'invitation d'amis |
| `emailNotifications` | boolean | false | Envoi par email |
| `pushNotifications` | boolean | true | Notification push (infrastructure en place, non branchee) |
| `inAppNotifications` | boolean | true | Notification in-app (creation en base) |

Les preferences sont creees avec les valeurs par defaut au premier acces via upsert.

---

## Types de notifications

Definis dans `src/types/notifications.ts` :

| Type | Declencheur | Donnees contextuelles |
|---|---|---|
| `squad_detected` | Nouveau `SquadMatch` detecte lors de la sync des matchs | `squadMatchId`, `pubgMatchId`, `placement`, `mapName` |
| `top_performance` | Performance en tete du clan sur une periode (kills, damage, win rate) | `memberId`, `metric`, `period`, `badge` |
| `challenge_started` | Activation d'un defi via `activateChallenge()` | `challengeId`, `clanId` |
| `report_ready` | Generation d'un rapport termine | `reportId`, `memberId`, `link`, `reportType` |
| `invite_reminder` | Rappel envoi d'invitation (throttle : 1 fois par 12h max) | `memberId`, `sentAt` |

---

## Canaux d'envoi

La fonction interne `createNotificationForMember()` dispatche selon les preferences :

1. **In-app** : si `inAppNotifications === true`, cree une ligne `Notification` en base.
2. **Email** : si `emailNotifications === true`, envoie via `sendEmail()` a l'adresse du compte utilisateur lie (uniquement si l'email est verifie et le compte actif).
3. **Push** : si `pushNotifications === true`, log en console (`[Notification] Push queued for member X`). L'infrastructure push est preparee mais non branchee a un service externe.

Une notification desactivee (`isTypeEnabled` retourne false) est silencieusement ignoree — aucune entree en base.

---

## Logique de deduplication

Deux notifications appliquent un throttle :

- **`top_performance`** : verifie qu'aucune notification du meme titre n'a ete envoyee aujourd'hui avant de creer.
- **`invite_reminder`** : verifie qu'aucune notification du type n'a ete envoyee dans les 12 dernieres heures.

---

## Routes API

### `GET /api/members/[id]/notifications`

**Query params** :
- `?read=true|false` (optionnel — toutes si absent)
- `?type=squad_detected|top_performance|...` (optionnel)
- `?limit=10` (max 50)
- `?offset=0`

**Reponse 200** :

```typescript
{
  notifications: NotificationItem[]
  unreadCount: number  // total non lues (independant des filtres)
}

type NotificationItem = {
  id: string
  memberId: number
  type: string
  title: string
  message: string
  data: unknown
  read: boolean
  readAt: string | null
  createdAt: string
}
```

### `PATCH /api/members/[id]/notifications`

Marque des notifications comme lues en masse.

**Body** :
```typescript
{ read: true; all?: boolean; ids?: string[] }
// all=true marque toutes les non-lues du membre
// ids=[...] marque uniquement les IDs fournis
```

**Reponse 200** : `{ success: true, updatedCount: number }`

### `PATCH /api/members/[id]/notifications/[notifId]`

Marque une notification specifique comme lue ou non lue.

**Body** : `{ read: boolean }`

**Reponse 200** : `{ success: true }`

### `DELETE /api/members/[id]/notifications/[notifId]`

Supprime definitivement une notification.

**Reponse 200** : `{ success: true }`

### `GET /api/members/[id]/notification-preferences`

Retourne les preferences du membre (cree avec les valeurs par defaut si absentes).

**Reponse 200** : `{ preferences: NotificationPreferenceItem }`

### `PATCH /api/members/[id]/notification-preferences`

Met a jour un ou plusieurs champs de preferences.

**Body** : objet partiel avec n'importe quel sous-ensemble des 8 champs boolean.

```typescript
// Exemple : desactiver les emails et activer les rappels d'invitation
{ emailNotifications: false, inviteReminder: true }
```

**Reponse 200** : `{ preferences: NotificationPreferenceItem }`

---

## Composant `NotificationBell`

Fichier : `src/components/NotificationBell.tsx`

Cloche de notification affichee dans la barre de navigation. Affiche un badge avec le compteur de notifications non lues (`unreadCount` de la route GET). Au clic, ouvre un panneau ou redirige vers la page de notifications.

---

## Pages UI

### `/members/[id]/notifications`

Liste des notifications du membre, filtrables par type et statut de lecture. Actions : marquer comme lu, supprimer, marquer tout comme lu.

### `/members/[id]/notification-preferences`

Formulaire de preferences : cases a cocher par type de notification et par canal (in-app, email, push). Sauvegarde via PATCH.
