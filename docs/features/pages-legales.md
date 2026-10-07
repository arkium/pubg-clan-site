# Pages légales et footer

Quatre pages publiques. Le footer du site et celui de la vitrine lient les trois premières ; « Retirer mes données »
n'y figure pas (décision du 2026-10-05) : on y arrive par le bouton de la section « Tes droits » de `/confidentialite`,
et le footer marque alors « Confidentialité » (`aria-current="true"`).

| Page | Contenu |
|---|---|
| `/mentions-legales` | Éditeur, hébergement, marques et affiliation KRAFTON, origine des données, conditions d'utilisation |
| `/confidentialite` | Données traitées (dont le journal des actions d'administration, ajouté le 07/10/2026), ce qui n'est pas collecté, finalité et conservation (journal : 12 mois), cookies et stockage, droits |
| `/confidentialite/demande` | Formulaire « Retirer mes données » (masquer, purger, corriger, autre) |
| `/a-propos` | Ce que le site ne fait pas, d'où viennent les données, affiliation et références |

Maquette source : Claude Design, projet « Audit design avec améliorations », fichier « Pages legales - A faire ».
Fond : [docs/TODO/CU.md](../TODO/CU.md) (analyse de conformité) et [CU_todo.md](../TODO/CU_todo.md). Décisions du
2026-10-05 : variante 1a « Document » (sommaire latéral, tout déplié), footer 1a sur une ligne, demandes enregistrées
en base avec alerte aux SuperUsers, adresse de contact `contact@chickendinner.fr`.

## 1. Où vivent les textes

- **Coordonnées et mentions partagées** : `src/lib/legal/legal-info.ts`, module pur — éditeur, contact, hébergeur,
  autorité de contrôle, mention KRAFTON au mot près, liens du footer, date de mise à jour (`LEGAL_UPDATED_AT`, à
  changer à chaque modification d'un texte).
- **Pages** : `src/app/mentions-legales`, `src/app/confidentialite`, `src/app/a-propos` (composants serveur, titre
  d'onglet par `metadata`) ; gabarit commun `src/components/legal/LegalLayout.tsx` (bandeau d'image, sommaire,
  sections en `.app-panel`).
- **Footer** : `src/components/SiteFooter.tsx` (client, pour marquer la page courante en accent). Son contenu,
  `LegalFooterContent`, est aussi celui du footer de la vitrine `/` (`.home-footer`, `HomeShowcase.tsx`), qui masque le
  footer du site : un seul rendu, seules les marges diffèrent pour suivre chaque page.
- **Images générées par IA** : les photos des bandeaux et des cartes « Nouveautés » de l'accueil (`public/*.jpg`) sont
  générées avec Gemini (Google). Les mentions
  légales le signalent (section « Marques et affiliation »), par transparence (AI Act, art. 50) : à garder tant que
  ces images sont en ligne.
- **Accès sans session** : `LEGAL_PATHS` est ajouté à `PUBLIC_PATHS` et `PENDING_ACTIVATION_ALLOWED_PATHS` de
  `src/proxy.ts` (correspondance exacte). Une nouvelle page légale = une entrée dans `LEGAL_LINKS` (footer) ou, hors footer, dans `LEGAL_PATHS`.

## 2. Ce que les pages affirment — vérifié contre le code (2026-10-05)

| Affirmation | Réalité dans le code |
|---|---|
| Un seul cookie | `pubg_clan_session` (`src/lib/auth-session.ts`), httpOnly, 7 jours ; aucun traceur ni outil d'audience |
| Préférences dans le navigateur | `localStorage` : `pubg_app_theme`, `selectedClanId`, `canSwitchClan`, `pubg_nav_collapsed`, tri de tableaux ; `sessionStorage` : fil d'Ariane, période, cache de droits |
| Compte du site | `UserAccount` : e-mail, mot de passe (bcrypt), nom affiché, URL d'avatar libre (chargée chez un tiers) |
| Pas de nom civil ni d'IP liée à un profil | aucun champ nom/prénom/adresse ; aucune IP ni user-agent lus ou stockés par l'application. Les journaux Nginx gardent les IP côté serveur, sans lien avec un profil |
| Joueurs croisés en partie | `EncounteredPlayer`, `Player`, `KillEvent` : pseudo, account_id, clan ; affichés sur Némésis (publique en mode visiteur) |
| Résultats publiés sur Discord | si un admin du clan active les webhooks : alerte Top 1 (pseudos de l'escouade, kills, dégâts, survie, carte) et résultats de tournoi (clans, MVP) — [discord-notifications.md](discord-notifications.md). Transfert chez Discord Inc. (États-Unis), signalé ; marque Discord citée dans les mentions légales |
| Conservation | aucune purge automatique ; sessions 7 jours ; tracés GPS purgés à la main (`/api/superuser/database/purge-telemetry`) |

Toute nouvelle donnée personnelle (champ, cookie, traceur) doit être ajoutée au tableau de `/confidentialite`.

## 3. Formulaire « Retirer mes données »

- **Validation** : `validatePrivacyRequest` (`src/lib/legal/privacy-request.ts`), partagée par le formulaire et la
  route. Pseudo (32 caractères), type, motif facultatif (1 000), e-mail (190), case « titulaire du compte » obligatoire.
- **Route** : `POST /api/privacy-requests`, publique. Réponses : 201 `{ ok, id }`, 400 `{ error, fieldErrors }`,
  429 (limite), 500.
- **Anti-abus** : champ piège `website` (rempli → faux succès, rien n'est enregistré) ; 3 demandes par heure et par
  adresse (`X-Real-IP` posé par Nginx), 30 par heure pour tout le site. Compteurs en mémoire du processus, perdus au
  redémarrage ; l'adresse ne sert que de clé et n'est jamais écrite.
- **Effets** : ligne `PrivacyRequest` (statut `pending`), notification `privacy_request` à chaque SuperUser lié à un
  membre, e-mail à `contact@chickendinner.fr` (détail, échéance à un mois). Une panne SMTP ne perd pas la demande.
  Aucun accusé de réception n'est envoyé au demandeur : le formulaire servirait sinon à envoyer des e-mails à
  n'importe quelle adresse.

### Traitement — manuel

Il n'existe **aucun outil de masquage** (pas de champ « masqué » sur `ClanMember`, `Player` ni `EncounteredPlayer`) et
la suppression d'un membre (`DELETE /api/members/[id]?hard=true`, SuperUser) laisse en base `KillEvent`,
`PlayerClanChange`, `Player`, `EncounteredPlayer` et la télémétrie brute. D'où la formulation de la page : « Un
administrateur applique la demande à la main ».

1. Vérifier que le compte appartient au demandeur (capture du profil en jeu).
2. Appliquer la demande, répondre par e-mail sous un mois (RGPD art. 12).
3. Clore la demande dans **Plateforme › Demandes de confidentialité** (`/settings/privacy-requests`, SuperUser) :
   « Traitée » ou « Refusée » pose `status` et `handledAt`, « Rouvrir » les efface. La page affiche l'échéance d'un
   mois (`privacyRequestDeadline`) et signale les demandes en retard. Routes : `GET /api/settings/privacy-requests`
   (`?status=all`), `PATCH /api/settings/privacy-requests/[id]`.

Chantiers ouverts : outil de masquage d'un pseudo sur toutes les pages publiques, script de purge complète d'un
account_id.

## 4. Points à valider par l'éditeur

- **Hébergeur** : OVH SAS, déduit de l'adresse du serveur (217.182.143.43, plage OVH) — à confirmer.
- **Identité de l'éditeur** : « Arkium » seul. Le droit belge (Code de droit économique) demande en principe un nom ou
  une dénomination, une adresse et un e-mail.
- **Autorité de contrôle** : APD belge (site exploité depuis la Belgique), pas la CNIL.
- **Adresse `contact@chickendinner.fr`** : à créer sur le serveur de messagerie.
- **Base légale et durées** : intérêt légitime (statistiques publiques), exécution du service (compte) ; durées
  écrites telles que le code les applique.

## 5. Tests

- `src/lib/legal/privacy-request.test.ts` : validation, champ piège, limite, échéance d'un mois, textes.
- `src/lib/legal/privacy-request-route.test.ts` : contrats de la route (Prisma, notifications et e-mail simulés) et
  accès sans session aux quatre pages par le proxy.
- `e2e/legal.spec.ts` : footer, navigation, sommaire, formulaire (réponse de l'API figée), aucun défilement horizontal.
