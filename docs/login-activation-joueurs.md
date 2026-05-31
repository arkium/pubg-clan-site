# Login et activation joueurs

Ce document decrit le fonctionnement du login, de l activation des joueurs par invitation et du reset de mot de passe.

## Resume rapide

- Le login se fait via email + mot de passe sur `/login`.
- L activation joueur se fait via un token d invitation sur `/activate?token=...` (validite 48h).
- Le reset de mot de passe se fait via `/reset-password` avec envoi d un lien email (validite 30 min).
- Les routes publiques sans session sont: `/login`, `/activate`, `/reset-password`.

## Etats de setup

La route `GET /api/setup/status` expose 3 etats:

- `first_run`: initialisation globale non terminee.
- `pending_activation`: clan initialise mais activation Owner en attente.
- `completed`: application utilisable normalement.

Comportement UI:

- `first_run` affiche le composant d initialisation.
- `pending_activation` affiche le composant `PendingActivation` avec renvoi d email possible.
- `completed` affiche le formulaire de connexion.

## Flux login

## Interface

- Page: `/login`
- Champs: `email`, `password`
- Lien secondaire: `Mot de passe oublie ?` vers `/reset-password`

## API

- Endpoint: `POST /api/auth/login`
- Payload:
  - `email`
  - `password`

Validation et regles:

- Refuse si setup = `pending_activation`.
- Refuse si identifiants invalides.
- Authentifie seulement les comptes actifs et verifies.

Reponse utile:

- `activeMemberId`
- `defaultClanId`
- `canSwitchClan`

Effets client:

- Creation de session cookie serveur.
- Stockage local de `selectedClanId` et `canSwitchClan`.
- Redirection:
  - vers `redirect` si present dans query string
  - sinon vers `/members/[activeMemberId]/dashboard` (ou `/members` en fallback)

## Flux activation joueur

## Emission d invitation

- API admin: `POST /api/clans/[clanId]/members/[memberId]/invite`
- Permission requise: `manage_members`
- Cas supportes:
  - invitation email (`sendEmail=true`)
  - invitation copy Discord (`sendEmail=false`)

Traitement cote service:

- Revocation des invitations actives precedentes pour ce membre.
- Generation d un token + hash.
- Persistance dans `MemberInvite`.
- Construction du lien: `/activate?token=...`
- Envoi email si active.

## Utilisation du lien d activation

- Page: `/activate`
- Validation de contexte: `GET /api/auth/activate/context?token=...`
- Soumission: `POST /api/auth/activate`

Payload activation:

- `token`
- `password`
- `displayName` (optionnel)
- `loginEmail` (optionnel, requis pour certains flux Discord)

Regles metier:

- Token non trouve, revoque, accepte ou expire -> rejet.
- Membre inactif -> rejet.
- Si le membre est deja lie a un autre compte incompatible -> rejet.

Effets en cas de succes:

- Creation/mise a jour du `UserAccount`.
- Liaison `MemberIdentity` (isPrimary).
- Marquage `acceptedAt` sur l invitation.
- Passage setup a `completed` si necessaire.
- Creation session + connexion immediate.

## Flux mot de passe oublie

## Demande de lien

- Page: `/reset-password` (sans token)
- API: `POST /api/auth/password/forgot`
- Payload: `email`

Comportement:

- Reponse volontairement neutre (ne confirme jamais si l email existe).
- Si compte valide:
  - revocation des tokens reset actifs precedents
  - creation d un token reset (TTL 30 min)
  - envoi d un email avec lien `/reset-password?token=...`

## Reinitialisation

- Page: `/reset-password?token=...`
- Verification token: `GET /api/auth/password/reset/context?token=...`
- Soumission: `POST /api/auth/password/reset`
- Payload:
  - `token`
  - `newPassword`

Regles:

- Token invalide/expire/utilise/revoque -> rejet.
- Compte inactif/non verifie -> rejet.
- Nouveau mot de passe identique a l ancien -> rejet.

Effets en cas de succes:

- Mise a jour du `passwordHash`.
- Marquage `usedAt` du token courant.
- Revocation des autres tokens reset actifs.
- Revocation des sessions actives du compte (relogin requis partout).

## Securite et bonnes pratiques

- Les tokens ne sont jamais stockes en clair, uniquement en hash.
- Les liens token ont une duree de vie courte.
- Le message de demande reset est neutre pour limiter l enumeration d emails.
- Les routes de changement de mot de passe en session exigent le mot de passe actuel.

## Modeles Prisma concernes

- `UserAccount`
- `MemberIdentity`
- `MemberInvite`
- `UserSession`
- `PasswordResetToken`

## Fichiers de reference

- `src/app/login/page.tsx`
- `src/app/activate/page.tsx`
- `src/app/reset-password/page.tsx`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/activate/route.ts`
- `src/app/api/auth/activate/context/route.ts`
- `src/app/api/auth/password/forgot/route.ts`
- `src/app/api/auth/password/reset/context/route.ts`
- `src/app/api/auth/password/reset/route.ts`
- `src/app/api/clans/[clanId]/members/[memberId]/invite/route.ts`
- `src/lib/auth-service.ts`
- `src/proxy.ts`
- `prisma/schema.prisma`
