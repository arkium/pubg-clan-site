# Arborescence de navigation — Refonte UI

Cartographie complète des pages du site, organisée par parcours utilisateur. Sert de base à la refonte complète de la charte graphique ("fonte"/police + thème visuel).

Source de vérité actuelle (ordre de priorité runtime) :

1. API + DB de permissions nav (`/api/settings/nav-permissions`) — utilisée par `useNavPermissions` en production.
2. Fallback code `src/lib/nav-permissions-registry.ts` — utilisé seulement si l'API n'a pas encore répondu.
3. Arborescence réelle des fichiers `src/app/**/page.tsx` pour l'existence effective des routes.

Conséquence : toute décision de rôle/ordre doit être répliquée dans la configuration DB, sinon le registre local ne suffit pas à garantir le comportement en runtime.

Légende rôle : **Tous** · **Membre** · **Admin** · **Owner** · **SuperUser** · *(caché par défaut)*

La colonne **Position** indique l'ordre recommandé dans la navigation, avec numérotation hiérarchique : `1` est une page de premier niveau (menu), `1.1` est une sous-page accessible depuis `1` (lien direct / détail / breadcrumb), `1.1.1` une sous-sous-page, etc.

---

> Les anciennes listes d'état courant (Pages transverses, Espace Clan, Espace Membre, Menu Admin, Menu Owner, Menu SuperUser) ont été retirées de ce document : leur contenu est repris et complété par le §9 « Menu fixe » et l'arbre unifié du §8. Rien n'a été perdu — voir §9 pour les pages qui n'apparaissaient nulle part ailleurs (alias PUBG, outils SuperUser).

## 5 groupes de "familles" de gabarits pour la refonte de fonte

Utile pour scoper le travail de refonte visuelle par type de page plutôt que par route individuelle :

1. **Pages liste/tableau** — `/clans`, `/members`, `clan.members`, `clan.leaderboard`, `clan.reports`, `clan.challenges`, settings admin (labels/alias)
2. **Pages dashboard/stats à cartes & graphiques** — `member.dashboard`, `member.stats`, `member.weapons`, `clan.stats*`, `owner.telemetry-dashboard`
3. **Pages détail** — `[matchId]/telemetry`, `[reportId]`, `[challengeId]`, `member.matches`
4. **Pages carto/heatmap** (canvas/SVG interactif) — `clan.heatmap-kills`, `clan.positions`, `clan.drop-zones`, `member.map-stats`, `member.drop-zones`
5. **Pages formulaire/settings** — `members/add`, `settings/*`, `clans/[clanId]/settings/*`

---

*Fichier généré depuis l'état du code au 2026-08-18. À tenir à jour si de nouvelles routes sont ajoutées.*



## 8. Proposition — arbre de navigation unifié

> **⚠️ Cible, pas état actuel.** Ce chapitre décrit une IA visée pour la refonte, en réflexion — il ne reflète pas le comportement actuel du code. Écarts connus à date (voir `ClanNavigation.tsx`, `nav-permissions-registry.ts`) :
> - La nav réelle est une liste plate par section (pas d'arbre dépliable) ; l'indentation ci-dessous est une convention de doc, pas un composant existant.
> - `clan.overview` et `clan.members` sont en rôle **Admin** par défaut dans le registre, pas **Tous** comme indiqué en 8.1. **Décidé : on ouvre à Tous** — passer `defaultRole` à `none` pour `clan.overview`/`clan.members` dans `nav-permissions-registry.ts` puis répliquer dans la config DB de permissions nav.
> - `/clans` redirige aujourd'hui vers `/clans/[clanId]/members`, pas vers `/overview`.
> - La page Overview lie directement vers `/members/[id]/dashboard`, sans passer par la page Membres — Overview et Membres sont deux entrées parallèles, pas parent/enfant.
> - `Ligue` (`/clans-leaderboard`) et `Comparateur` (`/clans/comparator`) n'ont aujourd'hui aucun lien cliquable vers une page de clan — le rattachement au sous-arbre clan (positions 31 et 33 en 8.1) reste à développer.
> - La route membre `/members/[id]/heatmap` est référencée par la nav, mais la page n'existe pas dans `src/app` à date : à créer ou retirer de l'arbre cible.
> - Plusieurs pages marquées **Tous** en 8.1 sont **Owner** dans l'état actuel du registre (`stats/weapons*`, `heatmap-kills`, `positions`, `drop-zones`) : décision finale de rôle à figer avant migration.
>
> À retravailler avant d'en faire la nouvelle référence.

**Mécanisme envisagé :** pas un menu latéral imbriqué, mais une navigation fil-à-fil page à page — chaque page contient un lien explicite vers la page suivante de l'arbre (ex. Overview → lien vers Membres), et une barre de navigation en haut de page permet de revenir à la page d'appel (celle depuis laquelle on est arrivé), plutôt qu'un retour fixe vers un parent unique. Ça résout l'écart « Overview lie directement vers le dashboard membre » listé ci-dessus : ce lien direct reste valide tant que le retour ramène bien à Overview et pas à Membres. Implique de construire un composant de fil d'ariane / historique de provenance, absent du code actuel (aucun composant `Breadcrumb` trouvé dans `src/`).
>
> **Décidé :** stockage de la page d'appel via `sessionStorage` (pile de navigation, cohérente par onglet), avec un parent par défaut déclaré statiquement par page en repli si l'utilisateur arrive par URL directe (pas d'entrée dans la pile). Priorité d'implémentation : ce composant passe avant les skeletons et la palette de commande du §12, car il est bloquant pour tester le mécanisme carte+retour sur une vraie page (Overview en PoC).

*Exemple concret :* la page Overview résume le clan sous forme de cartes (membres, matchs, stats, awards…) ; cliquer sur une carte redirige vers la page de détail correspondante, avec la barre de retour pointant vers Overview. Chaque carte de la page Overview est donc un des liens « page suivante » du point ci-dessus — c'est ce qui matérialise concrètement les enfants d'Overview dans l'arbre du §8.1 (Membres, Matchs, Stats, etc.), plutôt qu'un sous-menu.

Fusion des points 6 et 7 : un seul arbre reflétant le vrai chemin de clic, tous rôles confondus. `Ligue` (3) et `Comparateur` (4) suivent la même logique que `Clans` (2) : ce sont d'autres portes d'entrée vers un clan, donc leurs enfants mènent au même sous-arbre clan (overview → membres → membre → ses pages, matchs, stats, etc.) plutôt que d'être des pages isolées.

La colonne **Position** est un simple numéro d'ordre séquentiel (1, 2, 3…) dans chaque tableau — l'indentation (`▸`) devant le nom de la page indique le niveau hiérarchique réel (profondeur dans l'arbre complet), à la place de l'ancienne numérotation `X.Y.Z`. Un item plus indenté que la ligne au-dessus reste son enfant ; un item avec la même indentation est son frère. Certaines pages du tableau Configuration (8.2) restent indentées à un niveau profond même si leur parent direct n'apparaît pas dans le même tableau : leur vrai parent est visible dans 8.1 (ex. « Demandes en attente » est enfant de « Membres », listé en 8.1).

### 8.1 Contenu & Stats (consultation)

| Position | Route | Page | Rôle |
|---|---|---|---|
| 1 | `/`                                            | Accueil / redirection | Tous |
| 2 | `/clans`                                       | Liste des clans | Tous |
| 3 | `/clans/[clanId]/overview`                     | ▸ Vue d'ensemble | Tous |
| 4 | `/clans/[clanId]/members`                      | ▸▸ Membres | Tous |
| 5 | `/members/[id]/dashboard`                      | ▸▸▸ Tableau de bord d'un membre | Tous |
| 6 | `/members/[id]/stats`                          | ▸▸▸▸ Stats globales | Tous |
| 7 | `/members/[id]/weapons`                        | ▸▸▸▸ Armes | Tous |
| 8 | `/members/[id]/matches`                        | ▸▸▸▸ Matchs | Tous |
| 9 | `/members/[id]/map-stats`                      | ▸▸▸▸ Cartes | Tous |
| 10 | `/members/[id]/nemesis`                       | ▸▸▸▸ Némésis | Tous |
| 11 | `/members/[id]/drop-zones`                    | ▸▸▸▸ Drop zones | Tous |
| 12 | `/members/[id]/heatmap`                       | ▸▸▸▸ Calendrier d'activité | Tous *(route à implémenter ou à retirer)* |
| 13 | `/members/[id]/rewards`                       | ▸▸▸▸ Récompenses | Tous |
| 14 | `/clans/[clanId]/matches`                     | ▸▸ Matchs du clan | Tous |
| 15 | `/clans/[clanId]/matches/[matchId]/telemetry` | ▸▸▸ Détail télémétrie d'un match | Tous |
| 16 | `/clans/[clanId]/matches/session/[date]`      | ▸▸▸ Session de matchs (par date) | Tous |
| 17 | `/clans/[clanId]/stats`                       | ▸▸ Stats agrégées | Tous |
| 18 | `/clans/[clanId]/stats/weapons`               | ▸▸ Stats armes | Owner (état actuel) / Tous (cible) |
| 19 | `/clans/[clanId]/stats/weapons/categories`    | ▸▸▸ Catégories d'armes | Owner (état actuel) / Tous (cible) |
| 20 | `/clans/[clanId]/stats/heatmap-kills`         | ▸▸ Heatmap des kills | Owner (état actuel) / Tous (cible) |
| 21 | `/clans/[clanId]/stats/positions`             | ▸▸ Cartographie tactique | Owner (état actuel) / Tous (cible) |
| 22 | `/clans/[clanId]/leaderboard`                 | ▸▸ Classement des membres | Tous |
| 23 | `/clans/[clanId]/awards`                      | ▸▸ Awards / distinctions | Tous |
| 24 | `/clans/[clanId]/challenges`                  | ▸▸ Challenges | Tous |
| 25 | `/clans/[clanId]/challenges/[challengeId]`    | ▸▸▸ Détail d'un challenge | Tous |
| 26 | `/clans/[clanId]/reports`                     | ▸▸ Rapports (hebdo/mensuel) 🗑️ | Admin |
| 27 | `/clans/[clanId]/reports/[reportId]`          | ▸▸▸ Détail d'un rapport 🗑️ | Admin |
| 28 | `/clans/[clanId]/drop-zones`                  | ▸▸ Drop zones | Owner (état actuel) / Tous (cible) |
| 29 | `/clans-leaderboard`                          | Ligue — classement public de tous les clans | Tous |
| 30 | `/clans/[clanId]/overview`                    | ▸ Clan cliqué depuis le classement → même sous-arbre qu'en #3 | Tous |
| 31 | `/clans/comparator`                           | Comparateur de clans | Tous |
| 32 | `/clans/[clanId]/overview`                    | ▸ Clan sélectionné dans le comparateur → même sous-arbre qu'en #3 | Tous |

> 🗑️ **Rapports (#26, #27) — suppression décidée.** Redondant avec les pages Stats vivantes. À supprimer : pages `reports/*`, `report-generator.ts`, cron hebdo/mensuel, modèles Prisma `Report`/`ReportSection`, entrée `clan.reports` du registre nav.

### 8.2 Configuration & Administration

Même principe qu'en 8.1 (hub avec cartes → détail, retour vers la page d'appel). Audit du code (`Link`/`href` réels) : contrairement à Overview, **la quasi-totalité de ces liens n'existe pas encore** — seules deux paires sont câblées aujourd'hui (Notifications ↔ Préférences, Télémétrie Matchs → Session par date). Colonne **Lien** : ✓ = carte déjà présente dans le code, ✱ = carte à créer pour que la page hub pointe réellement vers l'enfant.

| Position | Route | Page | Rôle | Lien |
|---|---|---|---|---|
| 1 | `/account` | Mon compte | Membre | — |
| 2 | `/members/[id]/notifications` | ▸ Notifications | Membre | ✱ (aucune carte sur `/account` aujourd'hui) |
| 3 | `/members/[id]/notification-preferences` | ▸▸ Préférences de notifications | Membre | ✓ (aller-retour Notifications ↔ Préférences déjà codé) |
| 4 | `/clans/[clanId]/settings` | Paramètres du clan *(hub à créer)* | Admin | — |
| 5 | `/clans/[clanId]/settings/members` | ▸ Joueurs et rôles | Admin | ✱ (page hub inexistante) |
| 6 | `/clans/[clanId]/settings/login-welcome` | ▸ Accueil login (branding) | Admin | ✱ (page hub inexistante) |
| 7 | `/clans/[clanId]/members/pending` | Demandes en attente → à rattacher comme carte sur Membres (8.1 #4) | Admin | ✱ (`/clans/[clanId]/members` ne lie pas vers pending) |
| 8 | `/clans/[clanId]/telemetry/dashboard` | Télémétrie — Dashboard | Owner | — |
| 9 | `/clans/[clanId]/telemetry/errors` | ▸ Erreurs | Owner | ✱ (dashboard n'a aucun lien sortant) |
| 10 | `/clans/[clanId]/telemetry/sync-batch-manual` | ▸ Sync batch manuel | Owner | ✱ |
| 11 | `/clans/[clanId]/telemetry/recoveries` | ▸ Recoveries | Owner | ✱ |
| 12 | `/clans/[clanId]/telemetry/matches` | ▸ Matchs (liste jobs) | Owner | ✱ |
| 13 | `/clans/[clanId]/telemetry/matches/[matchId]/telemetry` | ▸▸ Détail | Owner | ✱ (page confirmée ; lien sortant explicite à standardiser) |
| 14 | `/clans/[clanId]/telemetry/matches/session/[date]` | ▸▸ Session (par date) | Owner | ✓ (lien réel matches → session) |
| 15 | `/clans/[clanId]/telemetry/opponents` | ▸ Adversaires rencontrés | Owner | ✱ |
| 16 | `/members` | Liste des membres (accès direct, hors clan) | Admin | — |
| 17 | `/members/add` | ▸ Ajouter un joueur | Admin | ✱ (retour add→members existe, mais pas l'aller) |
| 18 | `/members/manage` | ▸ Gestion des joueurs | Admin | ✱ |
| 19 | `/members/[id]/dashboard` | ▸ Tableau de bord → même sous-arbre qu'en 8.1 #5 | Tous | ✱ |

### 8.3 Authentification (hors périmètre configuration/stats)

| Position | Route | Page | Rôle |
|---|---|---|---|
| 1 | `/login` | Connexion | — |
| 2 | `/activate` | ▸ Activation SuperUser | — |
| 3 | `/reset-password` | ▸ Réinitialisation mot de passe | — |
| 4 | `/join` | Rejoindre un clan | — |

Menus latéraux **Admin / Owner / SuperUser** : ce sont des raccourcis de sidebar, pas un vrai parcours de clic (l'utilisateur y accède directement depuis n'importe quelle page, pas en descendant dans l'arbre) — ils sont déjà 100% des pages de configuration/administration, cohérents avec le tableau 8.2 ci-dessus. Ils restent en listes plates, hors de cet arbre unifié — leur contenu complet est repris au §9.

---

## 9. Menu fixe (proposition)

Remplace les anciennes listes d'état courant (Pages transverses, Espace Clan, Espace Membre, Menu Admin, Menu Owner, Menu SuperUser, désormais supprimées de ce document) par une proposition unique de menu fixe. Reconstitué depuis `ClanNavigation.tsx` (`primaryLinks`, `adminEntryHref`/`ownerEntryHref`/`superuserEntryHref`) et les anciennes listes `admin-menu`/`owner-menu`/`superuser-menu` du registre, en y intégrant les pages qui n'apparaissent nulle part dans l'arbre unifié du §8.

**Pourquoi un menu fixe et pas des cartes :** le mécanisme fil-à-fil du §8 marche pour du contenu navigable de proche en proche (Overview → Membres → Membre…). Il ne marche pas pour les 11 pages de réglages purs listées ci-dessous (⚠️) : ce sont des outils isolés, sans page parente naturelle vers laquelle on « tomberait » en cliquant — personne ne visite `/settings/phase-labels` en suivant un fil de cartes. Elles doivent rester listées dans un menu fixe classique.

### 9.1 Ancrages toujours visibles (tous rôles)

| Entrée | Cible | Visible pour | Où dans le §8 |
|---|---|---|---|
| Dashboard | `/members/:memberId/dashboard` (1ʳᵉ page autorisée de `member-section`) | Tous | Racine du sous-arbre 8.1 #5 |
| Mon clan | `/clans/:clanId/members` (1ʳᵉ page autorisée de `clan-section`) | Tous | Entrée directe dans le sous-arbre clan (hors passage par Overview — cf. écart ligne 37) |
| Ligue | `/clans-leaderboard` | Tous | 8.1 #29 |
| Comparateur | `/clans/comparator` | Tous | 8.1 #31 |
| Mon compte | `/account` | Membre | 8.2 #1 |

### 9.2 Sous-menu Admin (fixe)

| Page | Route | Où dans le §8 |
|---|---|---|
| Ajouter un joueur | `/members/add` | 8.2 #17 |
| Joueurs et rôles | `/clans/[clanId]/settings/members` | 8.2 #5 |
| Accueil login (branding) | `/clans/[clanId]/settings/login-welcome` | 8.2 #6 |
| Demandes en attente | `/clans/[clanId]/members/pending` | 8.2 #7 |
| Alias cartes PUBG | `/settings/map-labels` | ⚠️ absent du §8 |
| Alias armes PUBG | `/settings/weapon-labels` | ⚠️ absent du §8 |
| Alias catégories armes | `/settings/weapon-categories` | ⚠️ absent du §8 |
| Alias phases PUBG | `/settings/phase-labels` | ⚠️ absent du §8 |

### 9.3 Sous-menu Owner (fixe)

| Page | Route | Où dans le §8 |
|---|---|---|
| Dashboard télémétrie | `/clans/[clanId]/telemetry/dashboard` | 8.2 #8 |
| Erreurs télémétrie | `/clans/[clanId]/telemetry/errors` | 8.2 #9 |
| Sync batch manuel | `/clans/[clanId]/telemetry/sync-batch-manual` | 8.2 #10 |
| Recoveries télémétrie | `/clans/[clanId]/telemetry/recoveries` | 8.2 #11 |
| Télémétrie matchs | `/clans/[clanId]/telemetry/matches` | 8.2 #12 |
| Adversaires rencontrés | `/clans/[clanId]/telemetry/opponents` | 8.2 #15 |
| Changer de clan | `/clans` | 8.1 #2 (action différente : switch) |
| Test email | `/settings/email-delivery` | ⚠️ absent du §8 |
| Monitoring PUBG API | `/settings/pubg-api` | ⚠️ absent du §8 |
| Permissions nav | `/settings/nav-permissions` | ⚠️ absent du §8 (doublon avec l'entrée SuperUser ci-dessous) |

### 9.4 Sous-menu SuperUser (fixe)

| Page | Route | Où dans le §8 |
|---|---|---|
| Tous les clans (switch) | `/clans` | 8.1 #2 |
| Ops Cron | `/settings/cron` | ⚠️ absent du §8 |
| Config plateforme | `/settings/nav-permissions` | ⚠️ absent du §8 (doublon avec l'entrée Owner ci-dessus) |
| Télémétrie cross-clans | `/settings/telemetry-recoveries` | ⚠️ absent du §8 |
| Adversaires (vue transverse) | `/settings/opponents` | ⚠️ absent du §8 |
| Import de matchs PUBG | `/settings/match-import` | ⚠️ absent du §8 |

**Bilan :** 11 pages (les ⚠️ ci-dessus) n'apparaissent dans aucun tableau du §8 — toutes des outils de configuration purs. Rien n'est perdu tant que ce §9 reste à jour ; c'est désormais la seule source pour ces routes dans ce document.

**Décidé :** ce menu fixe reste une sidebar permanente (desktop) / drawer (mobile), en plus du fil d'ariane du §8 — la liste plate contextuelle (`renderCtxSection`) est ce qui est remplacée par les cartes + retour, pas la sidebar elle-même. Choix le moins risqué : le point d'ancrage de toute la navigation ne change pas de mécanisme en même temps que le reste.

## 10. Ce qui manque avant de démarrer le chantier

Le §8 couvre l'inventaire de navigation (routes, rôles réels vs déclarés, liens à créer). Il ne couvre pas encore :

1. **Contrat de source de vérité runtime.** Le doc doit systématiquement distinguer : config DB (effective), registre fallback, et pages existantes. Sans ce contrat, les changements de rôles peuvent sembler corrects en code mais ne pas s'appliquer en prod.
2. **Contrat de fil d'ariane/provenance.** Définir explicitement : profondeur max de pile, comportement au refresh, nouvel onglet, accès direct URL, query params, hash, et fallback quand l'historique est absent/invalide.
3. **Matrice des parents de repli (URL directe).** Une table exhaustive `route -> parent par défaut` est nécessaire, sinon chaque page implémente sa propre logique de retour.
4. **Direction visuelle — toujours ouvert.** Le fichier ouvre sur « refonte de la charte graphique (fonte + thème) » (ligne 3) mais ne contient aucune décision de police, de palette ou de densité. Le §"5 groupes de gabarits" scope le travail par type de page, sans direction concrète.
5. **Plan de bascule — partiellement tranché.** Mécanisme de retour du fil d'ariane décidé (§8 : `sessionStorage`, priorité au fil d'ariane avant skeletons/palette de commande, voir §12). Reste ouvert : ordre de migration des familles de pages et stratégie de rollback.
6. **Décisions déjà prises mais à matérialiser.** Ouverture Overview/Membres à Tous, suppression Rapports, création des hubs `settings`/télémétrie et cartes manquantes (§8.2) : ce sont maintenant des tickets d'implémentation.

## 11. Stratégie de tests

L'infra actuelle ne contient que Vitest, utilisé uniquement pour le parsing télémétrie (`npm run test:telemetry`, voir `package.json`). Aucune lib de test composant (Testing Library, Playwright) n'est installée — donc rien à réutiliser tel quel pour de la nav/UI.

| Niveau | Outil | Ce qu'on teste | Nouvelle dépendance ? |
|---|---|---|---|
| Unit | Vitest (déjà en place) | Logique pure : résolution fil d'ariane/retour (page d'appel → cible), `getItemRole`/permissions nav (`nav-permissions-registry.ts`), regroupement hub → enfants | Non |
| E2E ciblé | Playwright (à ajouter) | Un seul parcours critique verrouillé avant propagation : Overview → carte → détail → retour, en thème clair et sombre | Oui |
| Manuel | Checklist existante | Reste de la checklist « nouvelle page » déjà écrite dans `CLAUDE.md` (rendu clair/sombre, mobile, `app-panel`, pas de couleurs hardcodées) | Non |

Pas de regression visuelle automatisée (Chromatic, Playwright screenshots en CI) proposée pour l'instant : coût d'infra disproportionné vu la taille du projet ; la checklist manuelle couvre déjà ce risque page par page.

## 12. Pistes de modernisation UI

Trois pistes concrètes, cohérentes avec l'existant (`lucide-react` déjà en dépendance, tokens de thème déjà en place dans `globals.css`, `ClanNavigation.tsx` déjà assez moderne visuellement — `backdrop-blur`, `rounded-2xl`, `ring-inset`) :

1. **🥇 Fil d'ariane visible en haut de page** — priorisé, premier chantier. Pas juste un bouton « retour ». Cohérent avec le mécanisme et le stockage `sessionStorage` décidés en §8 ; remplace avantageusement le `sidebar-ctx-nav` plat actuel sur les pages profondes (ex. `telemetry/matches/[matchId]/telemetry`, 5 niveaux de profondeur). PoC recommandé sur Overview (déjà le hub le plus riche en cartes réelles).
2. **Skeletons au lieu du texte "Loading..."** brut, visible sur plusieurs pages actuellement. Gain de perception de vitesse quasi gratuit — pas de nouvelle lib nécessaire. Après le fil d'ariane.
3. **Palette de commande (⌘K)** pour sauter directement à une page ou un membre. Pertinent vu le volume de routes (30+ recensées en §8 et §9) et l'absence de recherche dans `ClanNavigation.tsx` aujourd'hui. Dernière des trois — dépend le moins des autres chantiers.

Ordre de priorité validé ; le contenu détaillé de chaque piste reste à spécifier avant implémentation.

## 13. Checklist d'exécution anti-oubli

Objectif : dérouler la refonte sans divergence entre doc, runtime et pages réelles.

### 13.1 Contrat technique minimal (à figer avant code)

1. **Provenance/Breadcrumb**
	- Stockage : `sessionStorage` par onglet.
	- Pile bornée : max 30 entrées.
	- Déduplication : même URL consécutive ignorée.
	- Reset : clear sur logout et sur changement de clan.
2. **Règles d'accès direct URL**
	- Si la pile est vide/invalide, utiliser le parent de repli statique de la route.
	- Si le parent de repli est inaccessible (rôle), remonter au premier lien autorisé de section.
3. **Source de vérité des rôles**
	- Modifier d'abord la config DB nav permissions.
	- Garder `nav-permissions-registry.ts` aligné comme fallback de sécurité.

### 13.2 Matrice parent de repli (v1)

| Route | Parent de repli | Notes |
|---|---|---|
| `/clans/[clanId]/overview` | `/clans` | Entrée sous-arbre clan |
| `/clans/[clanId]/members` | `/clans/[clanId]/overview` | Si indisponible : `/clans` |
| `/members/[id]/dashboard` | `/clans/[clanId]/members` | `clanId` résolu via membre actif |
| `/members/[id]/stats` | `/members/[id]/dashboard` | Idem pour toutes sous-pages membre |
| `/members/[id]/weapons` | `/members/[id]/dashboard` |  |
| `/members/[id]/matches` | `/members/[id]/dashboard` |  |
| `/members/[id]/map-stats` | `/members/[id]/dashboard` |  |
| `/members/[id]/nemesis` | `/members/[id]/dashboard` |  |
| `/members/[id]/drop-zones` | `/members/[id]/dashboard` |  |
| `/members/[id]/heatmap` | `/members/[id]/dashboard` | Route à créer/valider |
| `/members/[id]/rewards` | `/members/[id]/dashboard` |  |
| `/clans/[clanId]/matches/[matchId]/telemetry` | `/clans/[clanId]/matches` |  |
| `/clans/[clanId]/matches/session/[date]` | `/clans/[clanId]/matches` |  |
| `/clans/[clanId]/challenges/[challengeId]` | `/clans/[clanId]/challenges` |  |
| `/clans/[clanId]/telemetry/matches/[matchId]/telemetry` | `/clans/[clanId]/telemetry/matches` |  |
| `/clans/[clanId]/telemetry/matches/session/[date]` | `/clans/[clanId]/telemetry/matches` |  |

### 13.3 Plan de migration en 4 passes

1. **Infra nav** : store provenance + composant breadcrumb + fallback statique.
2. **Hubs** : Overview, settings clan, telemetry dashboard (cartes sortantes).
3. **Rôles & liens** : alignement DB/registre/pages + ouverture Overview/Membres à Tous.
4. **Nettoyage** : suppression progressive Rapports (UI -> API -> cron -> Prisma -> nav keys).

### 13.4 Tableau de suivi par route (à dupliquer pour chaque lot)

Légende rapide : ✅ validé/existant · ⚠️ à valider/à implémenter · ❌ absent · 🗑️ suppression planifiée.

| Route | Existe dans `src/app` | Rôle cible validé | Parent fallback défini | Lien entrant | Lien sortant | Test manuel OK | E2E OK |
|---|---|---|---|---|---|---|---|
| `/` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ☐ | ☐ |
| `/clans/[clanId]/overview` | ✅ | ⚠️ (ouverture à Tous) | ✅ | ✅ | ⚠️ (hub à finaliser) | ☐ | ☐ |
| `/clans/[clanId]/members` | ✅ | ⚠️ (ouverture à Tous) | ✅ | ✅ | ⚠️ (lien pending à ajouter) | ☐ | ☐ |
| `/members/[id]/dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ | ☐ | ☐ |
| `/members/[id]/stats` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/members/[id]/weapons` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/members/[id]/matches` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/members/[id]/map-stats` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/members/[id]/nemesis` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/members/[id]/drop-zones` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/members/[id]/heatmap` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/members/[id]/rewards` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/matches` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ☐ | ☐ |
| `/clans/[clanId]/matches/[matchId]/telemetry` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/matches/session/[date]` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/stats` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ☐ | ☐ |
| `/clans/[clanId]/stats/weapons` | ✅ | ⚠️ (Owner -> Tous à trancher) | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/stats/weapons/categories` | ✅ | ⚠️ (Owner -> Tous à trancher) | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/stats/heatmap-kills` | ✅ | ⚠️ (Owner -> Tous à trancher) | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/stats/positions` | ✅ | ⚠️ (Owner -> Tous à trancher) | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/leaderboard` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/awards` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/challenges` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ☐ | ☐ |
| `/clans/[clanId]/challenges/[challengeId]` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/reports` | ✅ | 🗑️ | ⚠️ | ✅ | 🗑️ | ☐ | ☐ |
| `/clans/[clanId]/reports/[reportId]` | ✅ | 🗑️ | ⚠️ | ✅ | 🗑️ | ☐ | ☐ |
| `/clans/[clanId]/drop-zones` | ✅ | ⚠️ (Owner -> Tous à trancher) | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans-leaderboard` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ (lien vers clan à ajouter) | ☐ | ☐ |
| `/clans/comparator` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ (lien vers clan à ajouter) | ☐ | ☐ |
| `/account` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ (carte notifications à créer) | ☐ | ☐ |
| `/members/[id]/notifications` | ✅ | ✅ | ⚠️ | ⚠️ (depuis account à ajouter) | ✅ | ☐ | ☐ |
| `/members/[id]/notification-preferences` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ☐ | ☐ |
| `/clans/[clanId]/settings` | ❌ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/settings/members` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/settings/login-welcome` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/members/pending` | ✅ | ✅ | ⚠️ | ⚠️ (depuis members à ajouter) | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/telemetry/dashboard` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ (cartes sortantes à créer) | ☐ | ☐ |
| `/clans/[clanId]/telemetry/errors` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/telemetry/sync-batch-manual` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/telemetry/recoveries` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/telemetry/matches` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ☐ | ☐ |
| `/clans/[clanId]/telemetry/matches/[matchId]/telemetry` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/telemetry/matches/session/[date]` | ✅ | ✅ | ✅ | ✅ | ⚠️ | ☐ | ☐ |
| `/clans/[clanId]/telemetry/opponents` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/members` | ✅ | ✅ | ⚠️ | ✅ | ✅ (redirect) | ☐ | ☐ |
| `/members/add` | ✅ | ✅ | ⚠️ | ⚠️ (aller depuis members/manage) | ✅ | ☐ | ☐ |
| `/members/manage` | ✅ | ✅ | ⚠️ | ✅ | ✅ (redirect) | ☐ | ☐ |
| `/login` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ☐ | ☐ |
| `/activate` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ☐ | ☐ |
| `/reset-password` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ☐ | ☐ |
| `/join` | ✅ | ✅ | ⚠️ | ✅ | ✅ | ☐ | ☐ |
| `/settings/map-labels` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/settings/weapon-labels` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/settings/weapon-categories` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/settings/phase-labels` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/settings/email-delivery` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/settings/pubg-api` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/settings/nav-permissions` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/settings/cron` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/settings/telemetry-recoveries` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/settings/opponents` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |
| `/settings/match-import` | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ☐ | ☐ |

### 13.4.1 Tickets issus du tableau de suivi

Chaque ticket doit faire disparaître au moins un `⚠️` du tableau 13.4 et être vérifié avant de cocher le test manuel ou E2E correspondant.

| ID | Lot | Routes concernées | Cible technique | Critère d'acceptation |
|---|---|---|---|---|
| NAV-01 | Décision rôles | Overview, Membres | DB nav permissions + `src/lib/nav-permissions-registry.ts` | `clan.overview` et `clan.members` sont accessibles à Tous dans l'API/DB et dans le fallback ; un rôle non autorisé ne voit ni l'entrée ni la page. |
| NAV-02 | Décision rôles | Stats armes, catégories, heatmap kills, positions, drop zones | DB nav permissions + registre fallback | Le rôle cible est explicitement choisi (Tous ou Owner), identique dans DB et registre, puis testé avec un membre et un Owner. |
| NAV-03 | Parents fallback | `/`, `/clans`, toutes les routes dont la colonne est ⚠️ | Matrice §13.2 + futur registre statique des parents | Chaque route dynamique dispose d'un parent résoluble avec ses paramètres ; une URL directe revient au parent autorisé, puis au premier lien autorisé de section si nécessaire. |
| NAV-04 | Hub clan | `/clans/[clanId]/overview` | Page Overview et composant de navigation contextuelle | Les cartes Overview pointent vers Membres, Matchs, Stats, Leaderboard, Awards, Challenges et Drop zones ; chaque détail conserve Overview comme provenance de repli. |
| NAV-05 | Hub membres | `/clans/[clanId]/members`, `/clans/[clanId]/members/pending` | Page Membres + page Pending | Un lien visible vers Pending existe pour un Admin ; un membre standard ne voit pas ce lien ; le retour depuis Pending fonctionne. |
| NAV-06 | Hub paramètres | `/clans/[clanId]/settings` | Nouvelle page `src/app/clans/[clanId]/settings/page.tsx` | Le hub existe, est protégé par le rôle Admin, et expose les cartes Joueurs et rôles et Accueil login. |
| NAV-07 | Hub télémétrie | `/clans/[clanId]/telemetry/dashboard` | Page dashboard télémétrie | Le dashboard expose des liens vers Erreurs, Sync batch manuel, Recoveries, Matchs et Adversaires ; les liens sont masqués hors Owner. |
| NAV-08 | Détails match | Routes telemetry `[matchId]` et `session/[date]` | Pages détail/session + breadcrumb | Chaque détail propose un retour vers la liste ou la session d'origine ; l'accès direct utilise le fallback de §13.2. |
| NAV-09 | Sous-pages membre | Stats, Armes, Matchs, Cartes, Némésis, Drop zones, Heatmap, Récompenses | Pages `src/app/members/[id]/**` | Le dashboard membre expose les destinations utiles et chaque sous-page revient au dashboard sans URL codée en dur incorrecte. |
| NAV-10 | Entrées inter-clans | `/clans-leaderboard`, `/clans/comparator` | Pages de classement/comparateur | Cliquer sur un clan ouvre son Overview avec le bon `clanId`, puis le retour revient à la page d'origine. |
| NAV-11 | Compte et notifications | `/account`, `/members/[id]/notifications` | Pages compte/notifications | Une carte ou entrée depuis le compte mène aux notifications du membre courant ; l'accès inverse vers les préférences reste disponible. |
| NAV-12 | Routes de gestion membres | `/members`, `/members/add`, `/members/manage` | Pages de gestion membres | Les entrées Aller/Retour sont cohérentes, notamment Members -> Add et Members -> Manage ; les redirections existantes sont conservées. |
| NAV-13 | Menu fixe settings | Toutes les routes `/settings/*` du §9 | `ClanNavigation.tsx` + pages settings | Chaque entrée du menu fixe pointe vers une page existante, reste filtrée par rôle et possède un fallback de retour documenté. |
| NAV-14 | Suppression rapports | `/clans/[clanId]/reports*` | Pages, API, cron, Prisma et clés nav associés | Les rapports sont supprimés ou redirigés selon la décision finale ; aucune entrée nav, carte ou tâche cron ne pointe encore vers ces routes. |
| NAV-15 | Breadcrumb/provenance | Toutes les routes profondes | Store `sessionStorage` + composant breadcrumb | La pile est bornée à 30, dédupliquée, réinitialisée au logout/changement de clan et remplacée par le fallback si elle est absente ou invalide. |
| NAV-16 | Parcours critique | Overview -> carte -> détail -> retour | Test unitaire + E2E Playwright à ajouter | Le parcours passe en thème clair et sombre, sur desktop et mobile ; l'URL et le contexte de retour sont corrects après navigation directe et refresh. |
| NAV-17 | Direction visuelle (hors vagues, §14.3) | Toutes les pages, par famille de gabarit (§"5 groupes") | Police, palette, densité — décisions à trancher puis appliquées via tokens CSS `globals.css` | Une police et une palette sont choisies et documentées ; chaque famille de gabarit est migrée sans régression clair/sombre ; aucune dépendance avec NAV-01→16. |

### 13.5 Gate de fin de PR (obligatoire)

1. La route est présente dans `src/app` ou explicitement marquée "à créer".
2. Le rôle est aligné dans DB + fallback registre.
3. Le breadcrumb revient à la page d'appel, sinon au parent de repli.
4. Les liens aller/retour existent (pas seulement une route accessible manuellement).
5. Le parcours critique E2E passe : Overview -> carte -> détail -> retour (clair + sombre).

## 14. Propositions pour combler les lacunes (§10)

Réponses concrètes aux 7 trous identifiés en relecture. Chaque proposition est actionnable telle quelle ; à valider avant de lancer NAV-15/NAV-06.

### 14.1 Spec du composant Breadcrumb (bloquant NAV-15)

- **Fichier :** `src/components/ui/NavigationTrail.tsx` (nommage cohérent avec les autres composants `ui/` du §6 de CLAUDE.md).
- **Montage :** pas dans `layout.tsx` (async server, pas d'accès `sessionStorage`). Chaque page client l'inclut explicitement juste sous `ClanSectionNav` / la nav de section membre, au-dessus du contenu — même position que le futur remplaçant de `sidebar-ctx-nav`.
- **Props :**
  ```typescript
  type NavigationTrailProps = {
    currentLabel: string
    fallbackParent: { href: string; label: string } // depuis le registre §14.2
  }
  ```
- **Source des libellés (pas de duplication) :** `nav-permissions-registry.ts` a déjà un champ `label` par entrée (`'Dashboard'`, `'Mon clan'`, `"Vue d'ensemble"`, etc. — vérifié dans le code). `currentLabel` et les `label` du registre §14.2 doivent lire ce même champ plutôt que redéfinir leur propre texte : `nav-parent-registry.ts` importe les labels depuis `nav-permissions-registry.ts` au lieu de les recopier. Une seule route → un seul libellé, dans un seul fichier source.
- **Stockage :** clé sessionStorage `pubg-nav-stack`, tableau `{ href: string; label: string; ts: number }[]`, plafonné à 30 entrées (FIFO), déduplication si `href` identique à la dernière entrée poussée.
- **Comportement au montage :** lit la pile, si l'avant-dernière entrée existe → l'affiche comme lien "retour" ; sinon utilise `fallbackParent`. Pousse ensuite l'entrée courante (`currentLabel` + `pathname` réel) sur la pile.
- **Reset de la pile :**
  - Sur logout : dans le handler `useAuthSession()` qui appelle déjà `POST /api/auth/logout`, ajouter `sessionStorage.removeItem('pubg-nav-stack')`.
  - Sur changement de clan : dans `useSelectedClan()`, au moment où le `clanId` stocké change.

### 14.2 Registre des parents de repli (bloquant NAV-03)

- **Fichier :** `src/lib/nav-parent-registry.ts`, à côté de `nav-permissions-registry.ts` (même style d'implémentation, un seul fichier source de vérité pour le fallback statique).
- **Forme :** table de patterns de route → `{ hrefTemplate, label }`, résolue avec les params dynamiques de la page appelante (`clanId`, `id`, `matchId`, etc.), initialisée directement depuis la table §13.2.
- **API exposée :** `getFallbackParent(routeKey: string, params: Record<string, string | number>): { href: string; label: string } | null`, consommée par `NavigationTrail`.
- **Test unitaire (§11) :** un cas par ligne de la table §13.2 — vérifie la résolution avec params et le cas "parent indisponible → remonte au premier lien autorisé de section".

### 14.3 Direction visuelle — proposition de découplage

Aucune décision de police/palette/densité n'existe à ce jour, et rien dans NAV-01→16 n'en dépend : la refonte de nav (breadcrumb, hubs, rôles) est de l'infra, la refonte de charte est un chantier visuel séparé.

**Proposition :** découpler explicitement. Créer **NAV-17 — Direction visuelle** (police + palette + densité, scope par les 5 familles de gabarits déjà en §"5 groupes") comme chantier indépendant, sans bloquer 13.3. Les nouveaux composants (`NavigationTrail`, hubs) sont construits avec les tokens CSS existants (`app-panel`, remapping Tailwind de CLAUDE.md) pour rester neutres vis-à-vis de la future refonte visuelle. Ticket ajouté à la table 13.4.1 et hors séquencement 14.5 (voir note en 14.5).

### 14.4 Infra de test E2E (bloquant NAV-16)

**Proposition :**
- `npm install -D @playwright/test`, config minimale `playwright.config.ts` à la racine, dossier `e2e/`.
- Script `package.json` : `"test:e2e": "playwright test"`.
- Exécution **locale uniquement** pour l'instant (pas de job CI existant identifié dans le repo) — décision alignée avec §11 qui écarte déjà la regression visuelle automatisée pour raison de coût d'infra. Un futur pipeline CI reste une décision séparée, hors scope nav.
- Premier test : le parcours NAV-16 (Overview → carte → détail → retour, clair + sombre, desktop + mobile via les viewports Playwright).

### 14.5 Ordre de dépendance entre tickets NAV-01→16

Séquencement proposé, en 4 vagues alignées sur le plan de migration §13.3 :

| Vague | Tickets | Raison |
|---|---|---|
| 1 — Décisions & infra pure | NAV-01, NAV-02, NAV-03, NAV-15 | Aucun ne dépend d'une page existante ; NAV-15 dépend de la spec §14.1, NAV-03 du registre §14.2. Tout le reste consomme ces rôles/fallbacks/le breadcrumb. |
| 2 — Hubs | NAV-04, NAV-05, NAV-06, NAV-07 | Consomment les rôles de la vague 1. NAV-06 est un développement neuf (page inexistante), à prévoir plus long que les autres hubs. |
| 3 — Sous-pages & entrées | NAV-08, NAV-09, NAV-10, NAV-11, NAV-12, NAV-13 | Câblage de liens vers/depuis les hubs de la vague 2 ; peuvent se paralléliser entre eux une fois la vague 2 posée. |
| 4 — Nettoyage & validation | NAV-14, NAV-16 | NAV-14 (suppression Rapports) est indépendant mais mieux fait en fin de chantier pour ne pas bruiter le diff de nav. NAV-16 valide l'ensemble une fois toutes les autres vagues posées. |

**NAV-17 (direction visuelle)** n'entre dans aucune vague : chantier séparé (§14.3), sans dépendance vers/depuis NAV-01→16, peut démarrer et avancer en parallèle à tout moment.

### 14.6 Rollback

Pas de feature flag proposé : `NavigationTrail` est additif (une page qui ne l'inclut pas garde son comportement actuel) et chaque page l'intègre dans un commit dédié. **Rollback = revert du commit d'intégration** sur la page concernée, sans toucher aux autres pages déjà migrées. Le composant lui-même et le registre §14.2 restent inertes tant qu'aucune page ne les importe, donc leur ajout initial ne présente pas de risque de régression à revert.

### 14.7 Hub `/clans/[clanId]/settings` (NAV-06)

Page à créer, `src/app/clans/[clanId]/settings/page.tsx`, calquée sur le patron Overview (§8, "hub avec cartes → détail") :
- Client component, protégé Admin (même garde que les autres pages `settings/*` existantes).
- Structure standard `app-container` + `app-main` + `ClanSectionNav`.
- Deux cartes sortantes minimum pour satisfaire le critère d'acceptation NAV-06 : **Joueurs et rôles** (`/clans/[clanId]/settings/members`) et **Accueil login** (`/clans/[clanId]/settings/login-welcome`), réutilisant le pattern de carte déjà utilisé sur Overview plutôt qu'un nouveau composant.
