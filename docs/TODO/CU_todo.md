# À faire : Conformité Légale & Conditions d'Utilisation

En se basant sur l'analyse de `CU.md` et les obligations légales (notamment pour un site géré depuis la Belgique), voici la liste des actions à implémenter.

## 1. Modifications de l'Interface (Footer)
- [ ] **Ajouter le disclaimer KRAFTON** dans le footer global (ex: `src/app/layout.tsx` ou le composant Footer). C'est la recommandation principale pour protéger la clé API :
  > *PUBG: BATTLEGROUNDS est une marque déposée de KRAFTON, Inc. Ce site est un projet communautaire non officiel et n'est ni affilié à, ni sponsorisé, ni approuvé par KRAFTON, Inc.*
- [ ] **Ajouter un lien** vers la future page de mentions légales et CGU.

## 2. Création de la page Légale (`/legal` ou `/cgu`)
Il faut créer une nouvelle page accessible publiquement, regroupant 3 aspects clés :

### A. Mentions Légales (Obligatoires en Belgique)
Même si le domaine est un `.fr`, si tu opères depuis la Belgique, la législation belge (notamment le Code de Droit Économique - CDE) impose d'afficher :
- [ ] **Identité de l'éditeur** : Nom et prénom (si tu es un particulier) ou informations de ton association/entreprise, et un moyen de contact (ex: `contact@chickendinner.fr`).
- [ ] **Hébergement** : Nom de l'hébergeur du site (ex: Vercel, OVH, etc.), sa raison sociale, son adresse postale et son numéro de téléphone.

### B. Conditions Générales d'Utilisation (CGU)
- [ ] Indiquer systématiquement la **Date de dernière mise à jour** en haut du document.
- [ ] Préciser que le service est fourni gratuitement et "en l'état" pour la communauté.
- [ ] Indiquer que les données de match (pseudos, stats, télémétrie) sont issues de l'API officielle PUBG et que `chickendinner.fr` n'est pas responsable de l'exactitude de ces données ou des coupures de service de l'API.

### C. Politique de Confidentialité & RGPD
- [ ] Indiquer systématiquement la **Date de dernière mise à jour** en haut du document.
- [ ] **Données publiques PUBG** : Expliquer que le site stocke des identifiants PUBG et des historiques de matchs, qui sont des données de jeu publiques.
- [ ] **Données privées** : Préciser comment sont gérés les e-mails (utilisés pour le login/invitations des admins) et garantir qu'ils ne sont pas vendus à des tiers.
- [ ] **Droit à l'oubli / Désinscription** : Fournir une adresse e-mail ou une procédure expliquant comment un joueur peut exiger la suppression de ses données de la base du site, conformément au RGPD.
- [ ] **Cookies** : Préciser que le site n'utilise que des cookies techniques nécessaires au fonctionnement (sessions). *(Note : Si tu ajoutes plus tard Google Analytics ou autre outil de suivi, il faudra obligatoirement un bandeau de consentement).*

## 3. Actions Techniques Sous-jacentes
- [ ] **Créer l'adresse e-mail de contact** (ex: `contact@chickendinner.fr` ou `privacy@chickendinner.fr`) pour gérer les demandes d'utilisateurs.
- [ ] **Créer le fichier de Licence** : Ajouter un fichier `LICENSE.md` à la racine du projet contenant la mention de droits d'auteur (Propriétaire).
- [ ] **(Optionnel mais recommandé)** Prévoir ou définir la procédure technique à suivre le jour où un utilisateur demandera la purge de ses données (script pour anonymiser un `Player` ou supprimer un `ClanMember`).

## 4. Choix de la Licence (Code Source)
Pour protéger ton travail, il faut définir sous quelle licence ton code est distribué (à placer dans un fichier `LICENSE` à la racine du projet). Voici les 3 meilleures options selon ton objectif :
- [x] **Propriétaire (Tous droits réservés)** : *(Choisi)* Ton dépôt GitHub étant privé, c'est le comportement par défaut. Ajouter un fichier `LICENSE.md` contenant `Copyright (c) 2026 chickendinner.fr - Tous droits réservés` est recommandé pour protéger ton code en cas de fuite.
- [ ] **Licence MIT** : *Recommandé pour un projet communautaire ouvert.* C'est la licence open-source la plus courante. Elle autorise tout le monde à reprendre ton code, le modifier et l'héberger de son côté, à condition de te créditer.
- [ ] **Licence AGPLv3** : *Recommandé pour contrer les profiteurs.* C'est une licence open-source "virale". Si quelqu'un utilise ton code pour ouvrir un site concurrent, il sera **obligé** de rendre son propre code source public sous la même licence.
