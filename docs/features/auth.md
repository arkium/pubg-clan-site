# Authentification et gestion de session

Ce document décrit le système d'authentification du site : connexion, activation par invitation, récupération de mot de passe, bootstrap du premier compte Owner, structure de session, sélection de clan et switch de membre.

---

## 1. Flux de connexion

**Page :** `/login`  
**Endpoint :** `POST /api/auth/login`

### Payload

```json
{
  "email": "joueur@exemple.com",
  "password": "motdepasse"
}
```

### Règles de validation

- Refusé si l'état de setup est `pending_activation`.
- Refusé si les identifiants sont invalides (compte inexistant, mauvais mot de passe).
- Refusé si le compte n'est pas actif ou pas encore vérifié.

### Réponse utile

| Champ | Description |
|---|---|
| `activeMemberId` | ID du membre actif par défaut |
| `defaultClanId` | ID du clan principal |
| `canSwitchClan` | `true` si l'utilisateur a la permission wildcard `*` |

### Effets côté client

1. Création d'un cookie de session httpOnly côté serveur.
2. Stockage de `selectedClanId` et `canSwitchClan` dans `localStorage`.
3. Redirection : vers `?redirect=...` si présent dans la query string, sinon vers `/members/[activeMemberId]/dashboard` (fallback `/members`).

---

## 2. États de setup

La route `GET /api/setup/status` expose trois états qui conditionnent l'affichage de la page `/login` :

| État | Signification | Comportement UI |
|---|---|---|
| `first_run` | Initialisation globale non terminée | Affiche le composant d'initialisation |
| `pending_activation` | Clan initialisé, activation Owner en attente | Affiche `PendingActivation` avec renvoi d'email possible |
| `completed` | Application utilisable normalement | Affiche le formulaire de connexion |

---

## 3. Activation d'un compte par invitation

### Émission d'une invitation

**Endpoint :** `POST /api/clans/[clanId]/members/[memberId]/invite`  
**Permission requise :** `manage_members`

Deux cas supportés :
- Invitation par email (`sendEmail=true`).
- Invitation via copie d'un lien Discord (`sendEmail=false`).

Traitement :
1. Révocation des invitations actives précédentes pour ce membre.
2. Génération d'un token et de son hash (jamais stocké en clair).
3. Persistance dans `MemberInvite`.
4. Construction du lien : `/activate?token=...`.
5. Envoi par email si activé.

### Utilisation du lien d'activation

**Page :** `/activate`  
**Vérification de contexte :** `GET /api/auth/activate/context?token=...`  
**Soumission :** `POST /api/auth/activate`

```json
{
  "token": "...",
  "password": "nouveaumotdepasse",
  "displayName": "PseudoOptional",
  "loginEmail": "optionnel@exemple.com"
}
```

**Règles :**
- Token non trouvé, révoqué, déjà accepté ou expiré (TTL 48h) → rejet.
- Membre inactif → rejet.
- Membre déjà lié à un autre compte incompatible → rejet.

**Effets en cas de succès :**
- Création ou mise à jour du `UserAccount`.
- Création de `MemberIdentity` (`isPrimary = true`).
- Marquage `acceptedAt` sur l'invitation.
- Passage du setup à `completed` si nécessaire.
- Création de session et connexion immédiate.

---

## 4. Récupération de mot de passe

### Demande de lien

**Page :** `/reset-password` (sans token)  
**Endpoint :** `POST /api/auth/password/forgot`

```json
{ "email": "joueur@exemple.com" }
```

La réponse est volontairement neutre (ne confirme pas si l'email existe) pour éviter l'énumération. Si le compte est valide :
1. Révocation des tokens reset actifs précédents.
2. Création d'un token reset (TTL 30 min).
3. Envoi d'un email avec le lien `/reset-password?token=...`.

### Réinitialisation

**Page :** `/reset-password?token=...`  
**Vérification :** `GET /api/auth/password/reset/context?token=...`  
**Soumission :** `POST /api/auth/password/reset`

```json
{
  "token": "...",
  "newPassword": "nouveaumotdepasse"
}
```

**Règles :**
- Token invalide, expiré, déjà utilisé ou révoqué → rejet.
- Compte inactif ou non vérifié → rejet.
- Nouveau mot de passe identique à l'ancien → rejet.

**Effets en cas de succès :**
- Mise à jour du `passwordHash`.
- Marquage `usedAt` du token courant.
- Révocation des autres tokens reset actifs.
- Révocation de toutes les sessions actives du compte (reconnexion requise partout).

---

## 5. Bootstrap du premier compte Owner

**Endpoint :** `POST /api/auth/bootstrap-owner-invite`

Cet endpoint est utilisé lors de l'initialisation de l'application, avant qu'un premier Owner existe. Il génère l'invitation Owner initiale permettant de créer le premier compte administrateur via le flux d'activation standard (`/activate?token=...`).

Ce flux s'applique uniquement quand le setup est en état `first_run` ou `pending_activation`.

---

## 6. Structure de session

La session est gérée via un cookie httpOnly créé au moment du login ou de l'activation.

**Modèle Prisma :** `UserSession`

| Champ | Description |
|---|---|
| `userId` | ID du `UserAccount` lié |
| `token` (hash) | Token de session (jamais stocké en clair) |
| `expiresAt` | Date d'expiration |
| `createdAt` | Date de création |

**Type applicatif `UserSession` :** exposé par `GET /api/auth/session`, contient l'état de l'utilisateur courant, ses permissions, son `activeMemberId` et son `defaultClanId`.

La session est invalidée :
- À la déconnexion (`POST /api/auth/logout`).
- Lors d'une réinitialisation de mot de passe (toutes les sessions actives du compte sont révoquées).

---

## 7. Sélection de clan

**Page :** `/clans`  
**API :** `GET /api/clans`  
**Composant :** `ClanSelector`

### Contrôle d'accès

La page applique deux gardes :
1. **Authentification** : redirection vers `/login` si pas de session.
2. **Permission switch clan** : `canSwitchClan` est `true` seulement si `permissions.includes('*')`. Si absente, redirection vers `/members`.

La page est donc réservée aux profils Owner/Admin global.

### Chargement des clans

`GET /api/clans` retourne les clans actifs (`Clan.isActive = true`) triés par nom :

| Champ | Description |
|---|---|
| `id` | ID interne |
| `name` | Nom du clan |
| `tag` | Tag court |
| `platformShard` | Shard (ex. `steam`) |
| `membersCount` | Membres actifs |
| `matchesCount` | Nombre de matchs importés |

### Persistance de la sélection

Le hook `useSelectedClan` gère la persistance dans `localStorage` :
- `selectedClanId` : ID du clan sélectionné.
- `canSwitchClan` : permission de switch.
- Un événement custom `selected-clan-changed` synchronise les composants ouverts.

Comportements :
- Hydratation initiale depuis `localStorage`.
- Fallback via `GET /api/auth/session` si aucun clan n'est stocké.
- Un changement de clan est bloqué si `canSwitchClan` est `false`.

### Après sélection

`handleSelect(clanId)` appelle `setClanId(clanId)` (hook `useSelectedClan`), puis redirige vers `/clans/${clanId}/members`.

---

## 8. Switch de membre

Un `UserAccount` peut être lié à plusieurs `ClanMember` via la table `MemberIdentity`. Cette liaison permet à un utilisateur de représenter plusieurs joueurs ou d'apparaître dans plusieurs clans.

**Endpoint :** `POST /api/auth/switch-member`

Permet de changer le membre actif sans déconnexion. Le `activeMemberId` de la session est mis à jour.

---

## 9. Profil utilisateur

**Endpoint :** `GET/PUT /api/auth/profile`

Permet à l'utilisateur de consulter et mettre à jour ses informations de profil (nom affiché, email, changement de mot de passe).  
Le changement de mot de passe en session exige la saisie du mot de passe actuel.

---

## 10. Middlewares de protection

Les routes API vérifient la session via `requireRole` ou une vérification directe de session.

- **401** : session absente ou invalide.
- **403** : session présente mais rôle insuffisant.

Les routes publiques (sans session requise) sont : `/api/auth/login`, `/api/auth/activate`, `/api/auth/activate/context`, `/api/auth/password/forgot`, `/api/auth/password/reset`, `/api/auth/password/reset/context`, `/api/setup/status`.

---

## 11. Modèles Prisma concernés

- `UserAccount` — compte utilisateur
- `UserSession` — sessions actives
- `MemberIdentity` — liaison compte ↔ membre clan
- `MemberInvite` — invitations en attente
- `PasswordResetToken` — tokens de réinitialisation

---

## 12. Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/app/login/page.tsx` | Page de connexion |
| `src/app/activate/page.tsx` | Page d'activation |
| `src/app/reset-password/page.tsx` | Page de réinitialisation |
| `src/app/clans/page.tsx` | Page de sélection de clan |
| `src/app/api/auth/login/route.ts` | Endpoint de connexion |
| `src/app/api/auth/logout/route.ts` | Endpoint de déconnexion |
| `src/app/api/auth/activate/route.ts` | Endpoint d'activation |
| `src/app/api/auth/activate/context/route.ts` | Vérification token activation |
| `src/app/api/auth/password/forgot/route.ts` | Demande de reset |
| `src/app/api/auth/password/reset/route.ts` | Soumission du reset |
| `src/app/api/auth/password/reset/context/route.ts` | Vérification token reset |
| `src/app/api/auth/session/route.ts` | Session courante |
| `src/app/api/auth/switch-member/route.ts` | Switch de membre actif |
| `src/app/api/auth/bootstrap-owner-invite/route.ts` | Bootstrap Owner initial |
| `src/app/api/auth/profile/route.ts` | Profil utilisateur |
| `src/app/api/clans/route.ts` | Liste des clans |
| `src/components/ClanSelector.tsx` | Composant de sélection de clan |
| `src/hooks/useAuthSession.ts` | Hook état de session |
| `src/hooks/useSelectedClan.ts` | Hook persistance clan sélectionné |
| `src/lib/auth-service.ts` | Logique métier auth |
| `prisma/schema.prisma` | Schéma DB |
