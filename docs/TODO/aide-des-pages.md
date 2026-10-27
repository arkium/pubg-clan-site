# « D'où viennent ces chiffres ? » — aide en bas des pages joueur et clan

> Plan du 2026-10-27. **Rien n'est implémenté.** *Destiné à l'utilisateur et à l'équipe de développement.*
>
> Point de départ, un message de joueur : « ton site prend en compte les données de chaque joueur et clan depuis quel
> jour ? Quand on consulte les données d'un joueur, serait-il possible de sélectionner le mode de jeu (officiel,
> casu, tournoi, parties persos…) ? ». Aucune page ne répond clairement :
>
> - **depuis quand** : la Méthodologie dit que PUBG garde ses données environ 14 jours, pas que l'historique d'un
>   joueur commence environ 14 jours avant l'arrivée de son clan sur le site (ex. Pagiotte : arrivé le 23 mai 2026,
>   premières parties enregistrées le 12 mai) ;
> - **ce qui est compté** : aucune page ne dit que les pages d'un joueur ne comptent, pour la plupart, que les parties
>   normales — et elles ne suivent pas toutes la même règle (§3).

## 1. Décisions

| # | Sujet | Proposition | État |
|---|---|---|---|
| D1 | Titre de la barre | **« D'où viennent ces chiffres ? »** (annonce les deux réponses : depuis quand, ce qui est compté) plutôt que « De quoi on parle ? » | proposé |
| D2 | Forme | La barre repliée de « Comment ça marche ? » (tournois, Coach IA) : icône accent, « Afficher » / « Masquer », chevron ; repliée par défaut, **dans le HTML** (`<details>`) | proposé |
| D3 | Une seule source | Un registre `src/lib/page-scope.ts` lu par la barre **et** par la Méthodologie : les trois textes (page, barre, Méthodologie) ne peuvent pas diverger | proposé |
| D4 | Dates réelles | Le calcul de l'outil `getDataCoverage` du Coach devient un service partagé, servi aux pages par deux routes : la barre et le Coach donnent les mêmes dates | proposé |
| D5 | Filtre de type sur les pages joueur | Normal / Ranked / Casual / Tournois · Custom / Tous, comme les pages de clan — la vraie réponse au joueur, et des barres plus simples | proposé — « oui » de l'utilisateur à confirmer au lot 7 |
| D6 | « En bref » de la vue d'ensemble d'un clan | **Jamais invisible** : un texte montré aux robots et caché aux visiteurs est du « texte caché » au sens de la politique anti-spam de Google (risque de pénalité manuelle), et le bloc porte les seuls liens explorables vers les 12 autres pages du clan. Le **replier dans la barre** de la page : reste dans le HTML, liens compris | proposé |
| D7 | Méthodologie | Nouvelle section « Pages d'un joueur, pages d'un clan », générée par le registre ; chaque barre renvoie à sa ligne | proposé |

## 2. Contenu de la barre

Quatre lignes, qui suivent les filtres de la page (période, type de partie, carte, joueur) :

| Ligne | Exemple (tableau de bord d'un joueur, filtre « Semaine ») |
|---|---|
| **Période** | Semaine du 26 octobre : lundi 0 h → dimanche 23 h 59 (heure de Paris) ; soirée de 6 h à 6 h quand la page compte par soirée |
| **Parties comptées** | Parties normales seulement — Ranked, Casual et parties perso exclues ; avec un filtre de type : « Type : Ranked » |
| **Source** | Résultats officiels PUBG ; sur une page tirée de la télémétrie : « parties analysées : 736 sur 812 (91 %) » |
| **Depuis quand** | Données depuis le 12 mai 2026, environ 14 jours avant l'arrivée sur le site ; selon la page : positions sur la carte gardées `GEO_RETENTION_DAYS` jours (`GEO_PROTECTED_RETENTION_DAYS` pour un Top 1 ou une partie custom), objets consommés depuis le 18 septembre 2026, fins de zone depuis septembre 2026, carrière PUBG depuis la création du compte |
| *Lien* | Méthodologie › Pages d'un joueur (ou d'un clan), à l'ancre de la page |

Règles d'écriture : tutoiement ; vocabulaire du site (« parties normales » pour `official`, libellés des filtres
`LEAGUE_MATCH_TYPE_OPTIONS`) ; **jamais de faux zéro** pendant un chargement (« — », CLAUDE.md piège n° 13) ; aucun
chiffre en dur dans le texte : dates et parts viennent du service (D4), seuils des constantes du code.

## 3. Inventaire de départ (à compléter au lot 1)

**À vérifier après le chantier « place d'une partie partagée »** ([place-partie-partagee.md](place-partie-partagee.md)),
qui modifie plusieurs de ces routes. « Lu » = vu dans le code le 2026-10-27 ; le reste est à relever.

### Pages d'un joueur (`/members/[id]/…`, 11 pages de données)

| Page | Source | Parties comptées | Période | Note |
|---|---|---|---|---|
| `dashboard` | `Match` du joueur ; classement du clan ; carrière PUBG | **normales** (lu : `matchType: 'official'`) | filtre de page ; calendrier : 5 dernières semaines | la carte « Carrière » n'a pas de période |
| `stats` (Carrière PUBG) | `MemberLifetimeStats`, `MemberSeasonStats` (API PUBG, nuit) | **toutes les parties du compte, hors du site** | aucune | seule page qui remonte avant l'arrivée sur le site |
| `matches` | `Match` du joueur | **tous les types**, avec une étiquette (lu) | Semaine / Mois / Tous | |
| `heatmap` (activité) | `Match` / `SquadMatch` | **normales** (lu) | à relever | |
| `map-stats` | `Match` / `SquadMatch` | **normales** (lu) | à relever | |
| `drop-zones` | télémétrie (`landingSamples`) | **tous les types** (aucun filtre de type dans la route) | Semaine / Mois / Tous | périmètre joueur, duo, clan |
| `weapons` | `MemberWeaponStats` (télémétrie) | à relever | Tous / Mois | |
| `items` | `MemberItemUseStat`, `MemberThrowableStat` | à relever | filtre de période (lu) | objets par objet depuis le 18 septembre 2026 |
| `nemesis` | `KillEvent` (kill feed) | à relever | semaine / mois / tout l'historique suivi (lu) | |
| `playstyle` | `MemberTelemetryStats` ; binômes : `ClanSynergyTelemetryStats` | binômes : **normales** (lu) ; le reste à relever | filtre de période | rôles relatifs au meilleur du clan |
| `rewards` | à relever | à relever | à relever | |

Hors du chantier : `notifications`, `notification-preferences` (pages personnelles, sans statistique).

### Pages d'un clan (`/clans/[clanId]/…`, 17 pages hors administration)

| Page | Filtre de type déjà présent (lu) | Note |
|---|---|---|
| `overview` | type et mode (indicateurs de villes) | reçoit aussi « En bref » replié (D6) |
| `matches`, `matches/session/[date]` | — (mode d'équipe) | tous les types, soirée de 6 h à 6 h |
| `leaderboard` | oui | |
| `awards` (Distinctions) | oui | |
| `members` | — | effectif |
| `stats` (Style de jeu) | oui | |
| `stats/maps` (Cartes) | oui | |
| `stats/career` | — | carrière PUBG des comptes, aucune période |
| `stats/opponents` | à relever | kill feed |
| `stats/positions` | à relever | télémétrie, positions limitées par la rétention |
| `stats/weapons` | à relever | télémétrie |
| `stats/zone-closures` | à relever | fins de zone depuis septembre 2026, biais de survie |
| `drop-zones` | — | tous les types |
| `challenges`, `challenges/[challengeId]` | à relever | règles du défi |
| `telemetry/matches/[matchId]/debrief` | — | une partie : état de la télémétrie, rétention des positions |

Hors du chantier : `coach` (a déjà son « Comment ça marche ? »), `settings/**` (administration).

**Incohérence à trancher** (D5) : sur les pages joueur, tableau de bord, activité et cartes ne comptent que les
parties normales, la liste des parties et les largages comptent tout. La barre la rendra visible ; le filtre de type
la supprime.

## 4. Lots

| Lot | Contenu | Contrôles |
|---|---|---|
| **0** | Attendre que l'autre session ait commité la place partagée, la rétention des positions et la réécriture de la Méthodologie (copie de travail du 2026-10-27) | `git status` propre sur les fichiers concernés |
| **1** | Inventaire complet (§3) relu par l'utilisateur, puis registre `src/lib/page-scope.ts` : une entrée par page (source, types, période, date de départ, notes, ancre) | Test : chaque `page.tsx` de `src/app/members/[id]/` et de `src/app/clans/[clanId]/` (hors `settings/`, `coach/`, pages personnelles) a une entrée, et chaque entrée une page — sur le modèle de `ui-conformance.test.ts` |
| **2** | Service partagé `src/lib/data-coverage-service.ts` (repris de `getDataCoverage`, qui l'appelle ensuite) ; `GET /api/members/[id]/data-coverage` (`requireSameClanAsMember`, lecture seule) et `GET /api/clans/[clanId]/data-coverage` (même garde que les pages du clan, mode visiteur compris) ; cache de 5 minutes ; ajout de la fraîcheur (dernière synchronisation, analyses en attente — piste 7b de [coach-ia-pistes.md](coach-ia-pistes.md)) | Tests de contrat dans `src/lib/` ; mesure sur la vraie base en lecture seule (le Coach : 250 ms joueur, 610 ms clan) ; outil du Coach inchangé dans ses résultats |
| **3** | Composant `PageScopeNote` (« D'où viennent ces chiffres ? »), patron commun avec `CoachHelp` et le guide des tournois (classes de barre généralisées) ; props : clé du registre, période, type, carte, données du service | Rendu selon les filtres (Vitest pur sur le texte produit) ; contraste clair et sombre ; mobile replié |
| **4** | Pose en bas des 28 pages (`app-container`, après le contenu, avant le pied de page) | Test de présence du lot 1 ; e2e : réponses figées des deux routes dans `e2e/support/pages.ts`, présence et dépliage sur un échantillon de pages ; captures de référence régénérées |
| **5** | « En bref » de la vue d'ensemble replié dans la barre (D6), liens compris ; même traitement proposé pour l'annuaire, la Ligue, la lecture de zone et la carte des ressources | HTML du serveur : mots et liens inchangés (`scripts/seo-raw-html-audit.ts`) ; `structured-data.test.ts` ; e2e de la vue d'ensemble |
| **6** | Méthodologie : section « Pages d'un joueur, pages d'un clan » générée par le registre, une ancre par page ; `METHODOLOGY_UPDATED_AT` | `e2e/legal.spec.ts` ; liens des barres vers les ancres |
| **7** | Filtre de type sur les pages joueur (D5) : `matchType` dans les routes `dashboard`, `activity-heatmap`, `map-stats`, `calendar`, `drop-zones`… ; filtre dans le bandeau (`ToolbarGroup` « Type de partie », libellés `LEAGUE_MATCH_TYPE_OPTIONS`, « Tous ») ; défaut : Normal, comme aujourd'hui | Tests de route par type ; e2e des pages joueur ; bandeau docké sur mobile (`ui-conformance.test.ts`) |

Contrôles de chaque lot : `npx tsc --noEmit`, `npm run lint`, `npm run test:telemetry` (dont `tutoiement.test.ts`),
e2e des pages touchées puis suite complète sur le build si l'interface change (`E2E_PORT=3001`). Aucune écriture en
base : le chantier ne fait que lire.

## 5. Risques

- **Textes qui dérivent** des calculs : le registre est la seule source, et le test du lot 1 échoue sur une page sans
  entrée ; une règle de calcul changée sans son entrée reste possible — le registre cite pour chaque page la route ou
  le service qui la porte, à relire à chaque changement.
- **Hauteur sur mobile** : barre repliée par défaut, une ligne.
- **Coût des dates** : une lecture SQL par page ouverte, mise en cache ; jamais le bilan complet de télémétrie.
- **Mode visiteur** : les pages de clan sont publiques ; la route du clan ne doit rien dire de plus que les pages
  (pas de pseudo ni de compte, des dates et des volumes seulement).
