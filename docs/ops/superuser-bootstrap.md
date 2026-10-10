# SuperUser — Procédure de bootstrap

> **Secret (2026-10-10).** `AUTH_BOOTSTRAP_SECRET` doit être un vrai secret : la valeur d'exemple de `.env.example` et
> toute valeur de moins de 16 caractères ferment `POST /api/auth/bootstrap-owner-invite` (`src/lib/auth/secrets.ts`,
> comparaison à temps constant). La production tournait avec la valeur d'exemple : n'importe qui aurait pu obtenir un
> lien d'activation Owner. Générer : `openssl rand -base64 32`. État visible dans Configuration du site.

## Contexte

Le rôle SuperUser est un rôle plateforme (non lié à un clan) qui donne accès à tous les clans, au changement de clan actif, et aux opérations cross-clan. Il est stocké sur `UserAccount.isSuperUser`.

Le premier SuperUser ne peut pas être créé depuis l'UI — il faut passer par le script CLI `make-superuser`.

## Script CLI

```bash
# Accorder le statut SuperUser
npm run make-superuser -- --grant email@example.com

# Révoquer le statut SuperUser
npm run make-superuser -- --revoke email@example.com

# Lister tous les SuperUsers actuels
npm run make-superuser -- --list
```

Le script est dans `scripts/make-superuser.ts`. Il requiert que le compte `UserAccount` existe déjà (l'utilisateur doit s'être connecté au moins une fois).

## Prérequis

- La migration `20260621120000_add_superuser_and_join_status` doit être appliquée (`npx prisma migrate deploy`)
- Le compte email doit exister dans la table `UserAccount`

## Bootstrap initial (nouvelle instance)

1. Déployer la migration :
   ```bash
   npx prisma migrate deploy && npx prisma generate
   ```
2. Laisser l'administrateur se connecter une première fois via l'UI pour créer son `UserAccount`
3. Accorder le statut SuperUser :
   ```bash
   npm run make-superuser -- --grant admin@example.com
   ```
4. Vérifier :
   ```bash
   npm run make-superuser -- --list
   ```

## Ce que le SuperUser peut faire (que les autres ne peuvent pas)

| Action | SuperUser | Owner |
|---|---|---|
| Accéder aux routes de tous les clans | ✅ | Son clan uniquement |
| Changer de clan actif dans l'UI | ✅ | ❌ |
| Promouvoir / révoquer le rôle Owner | ✅ | ❌ |
| Créer / archiver un clan | ✅ | ❌ |
| Trigger cron global (tous clans) | ✅ | ❌ |

## Révocation

Si un SuperUser quitte le projet ou change de rôle :

```bash
npm run make-superuser -- --revoke email@example.com
```

La révocation est immédiate — la session en cours du compte révoqué sera bloquée au prochain appel API qui vérifie `isSuperUser`.
