# Notifications

Le systeme de notifications informe les membres du clan d'evenements pertinents (partie en escouade, performance, defi lance, rappel d'invitation) et previent les Owners et le SuperUser des demandes a traiter. Chaque membre peut configurer ses preferences par canal et par type.

---

## Acces — donnees personnelles (2026-10-10)

Notifications et preferences sont **personnelles** : seules les routes gardees par `requireOwnMember`
(`src/lib/auth/own-member-guard.ts`) y accedent — le compte lie au membre (`MemberIdentity`, tous ses membres lies,
pas seulement l'actif) et le SuperUser. Un coequipier recoit 403, une requete sans session 401 ; le mode visiteur ne les
ouvre jamais. Avant cette date, `requireSameClanAsMember` laissait tout membre actif du clan lire, marquer comme lues et
**supprimer** les notifications d'un autre — y compris celles des demandes « Retirer mes donnees », qui portent le pseudo
et l'e-mail du demandeur. Controle : `src/lib/auth/own-member-guard.test.ts` (chaque handler des trois routes).

Menu : les entrees `member.notifications` et `member.notification-preferences` (`PERSONAL_NAV_KEYS`,
`src/lib/nav-permissions-registry.ts`) ne s'affichent que pour un membre du compte connecte — ni au visiteur, ni sur le
profil d'un coequipier. Leur role de menu n'y change rien.

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
| `inviteReminder` | boolean | false | Rappel d'invitation d'amis |
| `emailNotifications` | boolean | false | Envoi par email |
| `pushNotifications` | boolean | true | Notification push (infrastructure en place, non branchee — absente de la page) |
| `inAppNotifications` | boolean | true | Notification in-app (creation en base) |

Les preferences sont creees avec les valeurs par defaut au premier acces via upsert. Liste des champs et valeurs par
defaut : **une seule source**, `src/lib/notification-preferences.ts` (route, service d'envoi, page) ;
`notification-preferences.test.ts` la compare au client Prisma et aux `@default` du schema. L'ancien champ `reportReady`,
retire du schema le 2026-08-20 avec les rapports, etait reste dans la route : Prisma refusant tout argument inconnu, la
lecture et l'enregistrement des preferences echouaient (500) jusqu'au 2026-10-10.

---

## Types de notifications

Definis dans `src/types/notifications.ts` :

| Type | Declencheur | Donnees contextuelles |
|---|---|---|
| `squad_detected` | Nouveau `SquadMatch` detecte lors de la sync des matchs | `squadMatchId`, `pubgMatchId`, `placement`, `mapName` |
| `top_performance` | Performance en tete du clan sur une periode (kills, damage, win rate) | `memberId`, `metric`, `period`, `badge` |
| `challenge_started` | Activation d'un defi via `activateChallenge()` | `challengeId`, `clanId` |
| `invite_reminder` | Rappel envoi d'invitation (throttle : 1 fois par 12h max) | `memberId`, `sentAt` |
| `join_request` | Demande d'adhesion (`/api/join`) — aux Owners du clan | `pendingMemberId`, `clanId` |
| `clan_creation_request` | Clan cree en attente de validation — aux SuperUsers | `clanId`, `clanName`, `clanTag`, `creatorPlayerName` |
| `privacy_request` | Demande « Retirer mes donnees » — aux SuperUsers | numero, type, pseudo, e-mail de reponse |

Les quatre premiers se coupent dans les preferences ; les trois demandes a traiter ne se coupent pas (`isTypeEnabled`
rend `true`), mais ne sont creees en base que si le canal in-app est actif. Libelles affiches : `NOTIFICATION_TYPE_LABELS`
(`src/types/notifications.ts`) ; icone et couleur : `src/components/notifications/NotificationTypeTile.tsx`. Le type
`report_ready` a disparu avec les rapports (2026-08-20).

---

## Canaux d'envoi

La fonction interne `createNotificationForMember()` dispatche selon les preferences :

1. **In-app** : si `inAppNotifications === true`, cree une ligne `Notification` en base.
2. **Email** : si `emailNotifications === true`, envoie via `sendEmail()` a l'adresse du compte utilisateur lie (uniquement si l'email est verifie, le compte actif et l'adresse reelle — jamais `@local.invalid` : `getNotificationEmailRecipient`). Detail ci-dessous.
3. **Push** : si `pushNotifications === true`, log en console (`[Notification] Push queued for member X`). L'infrastructure push est preparee mais non branchee a un service externe.

Une notification desactivee (`isTypeEnabled` retourne false) est silencieusement ignoree — aucune entree en base.

---

## E-mail d'une notification (2026-10-10)

**Gabarit unique** : `buildNotificationEmail` (`src/lib/notification-email.ts`), texte brut comme les autres e-mails du
site. Objet = titre de la notification ; corps = salutation, titre, message, lien vers les notifications du membre, puis
un pied : raison de l'envoi, lien vers les preferences, lien « Ne plus recevoir ces e-mails ». Les titres et messages des
quatre types ordinaires sont en francais depuis cette date (ils partent tels quels ; les lignes deja en base restent en
anglais).

**Apercu** : la route GET des preferences renvoie `email` — adresse, `deliverable`, `senderReady` (SMTP configure, par
`getEmailSenderStatus`) et `preview`, un e-mail d'exemple construit par **ce meme gabarit**, liens reels compris. La page
des preferences l'affiche sous « Voir un exemple d'e-mail » (`NotificationEmailPreview`) et dit ce qui empecherait
l'envoi (compte non verifie, envoi non active).

**Desabonnement** (`src/lib/notification-unsubscribe.ts`) : jeton signe HMAC-SHA256 par membre (`<memberId>.<signature>`),
sans table ni expiration. Il ne coupe que le canal e-mail (`emailNotifications = false`).

- Texte de l'e-mail → page publique `/notifications/desabonnement?t=…` (`PUBLIC_PATHS` du proxy, `noindex`) : elle
  **demande confirmation** — les messageries et antivirus ouvrent les liens avant le destinataire, un GET ne change rien.
- En-tetes `List-Unsubscribe` / `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) → `POST
  /api/notifications/unsubscribe?t=…`, desabonnement en un clic depuis la messagerie (Gmail, Outlook, Apple Mail).
- Secret : `NOTIFICATION_LINK_SECRET`, sinon `AUTH_BOOTSTRAP_SECRET` (jamais la valeur d'exemple de `.env.example`, ni
  une cle de moins de 16 caracteres). Sans secret utilisable : ni lien ni en-tetes — le pied garde le lien des
  preferences, et l'apercu le dit. Changer de secret invalide les liens deja envoyes (la page renvoie alors vers la
  connexion).

Confidentialité : la page `/confidentialite` décrit notifications, préférences et e-mails (consentement, messagerie
d'OVH, arrêt d'un clic) depuis le 2026-10-10 — [pages-legales.md](pages-legales.md). À reprendre si le gabarit change de
contenu ou si l'envoi change de prestataire.

Tests : `notification-email.test.ts`, `notification-unsubscribe.test.ts`, `notification-unsubscribe-route.test.ts`,
`notification-unsubscribe-proxy.test.ts` (page ouverte sans session, pages joueur toujours fermées).

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
  total: number        // notifications du filtre courant (pagination)
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

**Body** : objet partiel avec n'importe quel sous-ensemble des 7 champs boolean (`pickPreferenceUpdate` ignore le reste).

```typescript
// Exemple : desactiver les emails et activer les rappels d'invitation
{ emailNotifications: false, inviteReminder: true }
```

**Reponse 200** : `{ preferences: NotificationPreferenceItem }`

---

## Composant `NotificationBell`

Fichier : `src/components/NotificationBell.tsx`

Cloche de notification avec badge du compteur de non lues (`unreadCount` de la route GET) et panneau des 8 dernieres.
**Branchee nulle part** (constat du 2026-10-10) : les notifications s'atteignent par `/account` (lien de chaque membre
lie) et par la section « Mon profil » du menu. Son style precede la charte.

---

## Pages UI

Les deux pages suivent la charte (`docs/ui/index.html`, 2026-10-10) et partagent leurs etats d'acces
(`src/components/notifications/NotificationAccessState.tsx` : invitation a se connecter sur 401, « Donnees
personnelles » avec un lien vers les siennes sur 403).

### `/members/[id]/notifications`

Banniere des pages joueur ; bandeau sans docking mobile (statut en segmented, type en menu compact, Preferences et
« Tout marquer comme lu ») ; notifications groupees par jour de Paris, tuile de type, point d'accent sur les non lues ;
pagination numerotee (`total` de la route GET). Actions : marquer comme lue, supprimer, tout marquer comme lu.

### `/members/[id]/notification-preferences`

Banniere des pages joueur ; deux panneaux — « Ce qui te previent » (les quatre types qui se coupent) et « Comment les
recevoir » (sur le site, par e-mail) —, interrupteurs de la charte enregistres a chaque bascule (PATCH d'un seul champ,
toast, retour a l'etat precedent si l'enregistrement echoue). Encadre d'avertissement quand aucun canal n'est actif. Le
canal push n'est pas propose : il n'envoie rien.
