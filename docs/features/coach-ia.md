# Coach IA

Assistant conversationnel **réservé aux membres connectés** : il explique les parties, les armes, les objets consommés
(« loot »), les adversaires, les largages, les cartes, les horaires de jeu, la place du joueur parmi tous les clans,
le classement du clan, sa position en Ligue et les tournois du site à partir de la télémétrie du site, en flux mot à
mot, dans un tiroir ou en page plein écran. Modèle Gemini (Google) appelé côté serveur ; chaque question coûte, donc quota, budget et
interrupteur. Spécification, décisions et plan : [docs/TODO/chatbot-ia.md](../TODO/chatbot-ia.md) ; charte des
composants : [docs/ui/index.html#coach-ia](../ui/index.html#coach-ia) (section 44).

Livré sur la branche `feat/coach-ia` le 2026-10-24 (lots 0 à 8) ; mise en production au lot 9, **Coach fermé** par
défaut (`coach_enabled` absent de `AppConfig` = fermé), ouvert ensuite par le SuperUser depuis `/settings/coach`.

---

## 1. Accès

| Profil | Ce qu'il voit |
|---|---|
| Visiteur, mode visiteur du site | Teaser : tiroir aux réponses floutées, carte « Exclusivité membres » (`/join`, `/login`). **Aucun appel au modèle, aucun appel aux API du Coach.** |
| Compte connecté, membre actif d'un clan | Coach complet sur les données de **son** clan ; quota et budget |
| SuperUser | Sans quota ni budget, même sans membre actif, et même Coach fermé (soirée de test) ; page `/settings/coach` |

Garde serveur du flux : `requireClanAccess(request, clanId, 'member')` (`src/lib/auth/admin-guards.ts`) — 401 sans
session, 403 hors du clan, jamais ouverte par le mode visiteur. Les fils sont des données personnelles : propriétaire
(lecture aussi pour le SuperUser), un fil étranger répond **404** (`coach-conversation-service.ts`).

**La clé `GEMINI_API_KEY` ne sort jamais du serveur** : lue par `coach-config.ts` seulement, `apiKeyPresent` (booléen)
est tout ce que l'administration reçoit. Sans clé, le Coach est fermé pour tous, SuperUser compris.

## 2. Quota et budget (`src/lib/coach/coach-quota.ts`)

Réglages (`AppConfig`, clés `coach_*`, `coach-config.ts`, cache 30 s) : budget **2 € par compte et par mois** (mois
calendaire de Paris), plafond global **50 €**, taux `1 $ = 0,86 €`, **20 questions par heure glissante**, anti-rafale
4 s, 400 caractères par question, 10 messages d'historique, 4 tours d'outils. Par **compte** (`UserAccount`), pas par
membre : changer de membre actif ne multiplie rien.

- Ordre des refus (`decideCoachQuota`) : clé absente → Coach fermé (membres seulement) → plafond global → rafale →
  limite horaire → budget du compte. Codes : `coach_paused` (503), `global_budget`, `too_fast`, `hourly_limit`,
  `monthly_budget` (429, `retryAt`).
- **Réservation** : la question est inscrite dans `CoachUsage` (`pending`) **avant** l'appel, puis complétée (tokens,
  coût en micro-dollars, statut `ok` / `aborted` / `error`). Un onglet fermé pendant la réponse ne rend pas la question
  gratuite ; une erreur du fournisseur ne compte pas dans l'heure ; supprimer un fil ne rend rien.
- Côté joueur : pastille « 14 / 20 » (restant de l'heure), « Budget du mois : 82 % » à partir de 80 %, jamais de
  montant en euros. Coût : `coach-cost.ts` (prix du catalogue à la date, réflexion facturée en sortie).

## 3. Modèle et fournisseur

- Catalogue pur `src/lib/coach/coach-models.ts` : `gemini-3.5-flash-lite` (défaut, recommandé — seul modèle de l'essai
  du 2026-10-24 à ne jamais inventer de chiffre hors outil), `gemini-3.1-flash-lite` (secours ; arrêt au plus tôt le
  7 mai 2027), `gemini-3.8-flash` et `gemini-3.6-flash` (prix doublé au 1er janvier 2027, réflexion `low`, 4 096
  tokens de sortie). Ajouter un modèle = une entrée + un déploiement.
- Adaptateur `coach-provider-gemini.ts` derrière l'interface `CoachModelProvider` (`coach-provider.ts`) : API REST
  `streamGenerateContent?alt=sse` sans SDK, appels d'outils, parts du modèle réexpédiées telles quelles entre deux tours
  (signature de réflexion), 30 s par tour, abandon par le `signal` du client. Erreurs typées `CoachProviderError`
  (`unauthorized`, `rate_limited`, `unavailable`, `bad_request`, `timeout`, `aborted`, `network`).
- Essais : `npx tsx scripts/coach-model-probe.ts [--list]` (outils bouchons, coût affiché) ; bouton « Tester » de
  `/settings/coach` (question minuscule avec un outil et un code aléatoire : accès, durée, appel d'outil, chiffres
  inventés sans outil).

## 4. Données (`prisma/schema.prisma`, migration `20261024120000_coach_ia`)

| Table | Rôle |
|---|---|
| `CoachConversation` | Fil d'un compte (`userId`), rattaché au membre et au clan du moment (`SetNull`), titre tiré de la première question, `contextLabel` (« Erangel · 22 oct. 21:47 · Top 3 ») |
| `CoachMessage` | Question ou réponse ; `contextPath`, `toolCalls` (audit : nom, arguments, `failed` si l'appel n'a rien rendu), `unverified` (chiffres sans résultat d'outil), `feedbackScore` ±1, `feedbackNote`, `reviewedAt` |
| `CoachUsage` | Une ligne par question facturée : modèle, statut, tokens, `costMicroUsd` — sans relation, survit aux fils |
| `CoachRule` (lot 10, 2026-10-25) | Règle apprise écrite par le SuperUser : `text` (200), `enabled`, `fromMessageId` (vote « Inexact » d'origine, `SetNull`), `createdById` ; 20 actives au plus, injectées dans le prompt quand `coach_rules_enabled` est ouvert |
| `CoachMemory` (lot 11, 2026-10-25) | Mémoire personnelle **par compte** (`userId`, cascade ; membre et clan indicatifs) : `key` (goal · role · preference · avoid · note), `text` (200, les mots du joueur), `baseline` (mesure de départ datée), `expiresAt` (90 jours après la dernière mise à jour) ; 8 lignes par compte ; jamais lue par le SuperUser |

Aucune adresse e-mail dans ces tables. Conservation (`coach-retention.ts`, maintenance de 01:15) : fil inactif depuis
12 mois supprimé avec ses messages, usage après 13 mois. Demande « Purger mon historique » :
`npx tsx scripts/purge-coach-history.ts --pubg-name <pseudo>` (simulation), puis `--apply`.

## 5. Outils (`src/lib/coach/coach-tools.ts`)

`createCoachTools({ clanId, memberId, memberName })` : le clan et le membre sont **liés dans la fermeture**, le modèle ne
passe que des filtres — il ne choisit jamais le clan ni le compte, et un `matchId` d'un autre clan est refusé.

**`rememberAboutMe`** (lot 11, `coach-memory-service.ts`, seulement quand `coach_memory_enabled` est ouvert) : lié au
compte **et à la question en cours** — `text` doit être une partie du message du joueur (comparaison sans casse,
accents ni ponctuation), sinon `not_in_message` et rien n'est retenu ; `baseline` (mesure de départ d'un objectif
chiffré) n'est acceptée que si sa valeur figure dans un résultat d'outil de la même réponse (`baseline_unverified`
sinon). Déclaré en plus des dix-neuf outils, après eux.

| Outil | Source (la même que la page) |
|---|---|
| `getRecentMatches` | les toutes dernières parties du clan (10 au plus, `truncated` quand il y en a d'autres), soirée par `sessionDateOf`, état de la télémétrie, `summary` calculé par le serveur sur les parties listées — **pas** le bilan d'une soirée |
| `getSessions` | la page « Soirée » en chiffres : parties du clan entre `sessionBoundsOf(from, to)` (06:00 à 06:00 heure de Paris, inverse exact de `sessionDateOf`), toutes parties par défaut, 31 soirées au plus (7 sans date). Par soirée : parties, Top 1, Top 10, place moyenne, meilleure et pire place, kills et dégâts par partie, heures, carte la plus jouée, meilleur joueur ; totaux et soirées sans partie ; une date seule ajoute cartes, modes, types, membres et 40 parties avec identifiants. C'est l'outil de « samedi », « hier », « le 23 » (2026-10-25) |
| `getMatchDebrief` | `loadMatchDebriefPayload` : phases, escouade, 60 événements au plus, clans adverses |
| `getWeaponStats` | `MemberWeaponStats` + `aggregateMemberWeapons`, 8 armes au plus |
| `getItemUsage` | `loadItemUseStats` (la page « Objets consommés », sans la famille `None`) + `MemberThrowableStat` : soins, boosts, carburant, gadgets par famille et par objet, par partie, comparé au clan ; grenades lancées. C'est ce que le joueur appelle son « loot » ou son sac — le site ne connaît ni le contenu du sac ni les munitions ramassées, l'outil le dit |
| `getOpponentRecord` | `OpponentClan` → joueurs → `KillEvent`, dernière rencontre (`ClanEncounter`) — jamais `EncounteredPlayer` |
| `getDropZones` | la page « Zones de drop » : `DropPressureStat` (un saut = un membre dans une partie) lu par `drop-zones-view.ts` (`spotStats`, `jumpProfile`, `memberJumpSummaries`). Sans carte : chaque carte et ses premiers spots ; avec une carte : profil de saut, spots (pression en adversaires, roi, placements par partie), hors-ville à part, qui saute où. Période (90 jours par défaut, semaine, mois, tout), `scope: 'player'` / `playerName` pour « mes drops », borne de 20 000 sauts avec `truncated` et `since` (réécrit le 2026-10-25) |
| `getMapPerformance` | `loadClanMapStats` (la page « Cartes » : parties d'escouade, moyenne des clans en cache 5 min) : verdict, puis chaque carte — parties, Top 1, win rate, Top 10, place, kills et dégâts par partie, écart aux clans, tendance, joueur phare ; une carte seule par `mapName` |
| `getPlaySchedule` | la page « Calendrier d'activité » (`Match` du joueur, ou `SquadMatch` du clan avec `scope: 'clan'`), **heure de Paris**, soirée commençant à 06:00 (`sessionDateOf`) : parties et Top 1 par jour de la semaine, trois créneaux favoris, plage habituelle en semaine et le week-end (20e–80e centile des heures), soirées actives, temps de jeu, parties et heures par soirée — `buildPlaySchedule`, pur |
| `getCareerStats` | la page « Carrière PUBG » (`MemberLifetimeStats`, `MemberSeasonStats` — le cache synchronisé chaque nuit, **jamais un appel à l'API PUBG** depuis le Coach) : parties, Top 1, win rate, K/D, kills, headshots, knocks, dégâts, réanimations, soins, temps de jeu, jours joués, records, distances ; par mode (`squad`, `duo`, `solo`) ; médailles au podium du clan (`clanMedalRanks`, tous modes) ; saisons (palier Ranked, points, parties normales) |
| `getClanPlaystyle` | la page « Style de jeu du clan » (`MemberTelemetryStats`, `ClanSynergyTelemetryStats` de la période) : rôles Fragger / Medic / Ghost (moyenne du clan, top 3), mobilité, cercle, survie (`playstyleRoles`, `playstyleThemes`), coopération (`cooperationSummary`, meilleurs binômes) et le joueur face au clan (`playerRoleComparison`, `cooperationPartners`). Ces scores sont **relatifs au meilleur du clan**, pas des centiles entre clans |
| `getPlayerBenchmark` | le classement inter-clans `/players` (`getPlayersRanking`, cache 5 min, parties officielles de clan) : rang et part des joueurs dépassés pour chaque critère (dégâts, kills, knocks, réanimations, survie, quatre rôles), joueur juste devant et écart, rang de la période précédente, scores de rôle sur 100 (**centiles entre clans**, pas le style de jeu relatif au clan), moyennes ; en qualification : parties manquantes |
| `getClanCareer` | la page « Carrière PUBG du clan » (`MemberLifetimeStats` des membres actifs, `careerHeadline`, `computeCareerGroups` — jamais l'API PUBG) : quatre totaux, sept familles avec valeur du clan (total, moyenne, record), podium en une ligne, place du joueur ; `group` pour une seule famille. Cumuls de toute la carrière des comptes, aucune période (2026-10-25) |
| `getCityInsights` | les indicateurs de villes des tableaux de bord (`city-insights.ts`) plus la métrique `death` de `PositionMetricCell` (`rankCellsByCity`) : ville la plus fréquentée, zone de combat favorite, Top 5 par présence, kills, dégâts, réanimations et morts, kills contre morts ville par ville, part hors des villes, comparaison au clan pour un joueur ; défauts des pages (semaine ; parties officielles pour le clan, toutes pour un joueur). Les positions brutes de plus de trois semaines sont purgées : `since` le dit (2026-10-25) |
| `getZoneClosures` | la page « Fin de zone » (`loadZoneClosureSummary`, `zone-closure-view.ts`) : centre / bord / dehors à chaque fermeture du cercle, distance moyenne en % du rayon, verdict, titres, phase par phase, villes d'arrivée, joueurs profilés du plus central au plus excentré, place du joueur ; carte par défaut = la plus jouée ; biais de survie rappelé (`lowSample`, note) (2026-10-25) |
| `getClanLeaderboard` | `PlayerStats` de la période (`statsPeriodKeys`), 15 membres, le joueur situé |
| `getLeagueStanding` | `getClanLeague` (cache 5 min) : rang, Power score, voisins, ou parties manquantes |
| `getTournaments` | `listTournamentOverviews` (cache 5 min) : tournois publiés du site, filtres statut / titre, vainqueur ou leader, podium, place du clan quand elle est connue |
| `getTournamentResults` | même moteur que la page d'un tournoi (`computeTournamentModeStandings`, `buildRoundViews`, `pickMvp`) : barème, classement (20 lignes + celle du clan), manches avec podium et score du clan (`roundRank` aux points, `gamePlacement` en jeu), MVP ; `you` — le joueur (ou `playerName`) manche par manche, ses totaux, ses MVP et ses armes du tournoi (`KillEvent` des manches) — et `clanWeapons` (2026-10-25) |

Les tournois sont des pages **publiques**, quel que soit le clan organisateur : ces deux outils lisent ce que la page
montre, et le clan du joueur ne sert qu'à le situer (`yours`, `yourClan`) ; un brouillon reste invisible. Ajoutés le
2026-10-24 après l'essai connecté : sur la page d'un tournoi, « qui a gagné le tournoi ? » était refusé.

Chaque outil se borne (nombre de parties, période) ; jamais le bilan complet de télémétrie. Résultats sans donnée
d'authentification. Mesure sur la vraie base : `npx tsx --conditions=react-server scripts/coach-tools-probe.ts`
(lecture seule).

**Listes bornées et calculs** (2026-10-25, après le fil 9 : « aucune partie vendredi » déduit des 10 dernières parties,
moyenne fausse). Tout résultat coupé le dit (`truncated`, `itemsTruncated`, `roundsTruncated`, `standingsTruncated`,
`matchListTruncated`) ; les moyennes, totaux et pourcentages sont calculés par le serveur (`summary`, `totals`,
`placementSummary`) et le prompt interdit au modèle de les refaire. Les outils de période (cartes, classement, Ligue)
gardent la semaine des pages — lundi à minuit — et le disent dans leur `note` ; une semaine soirée par soirée passe par
`getSessions`.

**Couverture des pages** (2026-10-25). Avec outil : débriefing et replay, parties et soirées, armes, objets consommés,
adversaires / Némésis, largages, villes et zones de combat, fin de zone, cartes du clan, calendrier d'activité, carrière
PUBG du joueur et du clan, saisons, style de jeu du clan et du joueur, classement du clan, Ligue, joueurs inter-clans,
tournois. **Sans outil** (le Coach le dit s'il est interrogé) : cartes du joueur (`/members/[id]/map-stats`),
distinctions et awards, défis, mortier, lecture de zone, carte des ressources. La liste à faire est tenue dans le plan
(docs/TODO/chatbot-ia.md §13, « Outils à la demande »).

## 6. Prompt et garde-fous (`coach-prompt.ts`, `coach-chat-service.ts`)

**Blocs ouverts par les interrupteurs** (lots 10 et 11, `loadCoachPromptBlocks`) : « Règles du site » (règles actives,
après les règles absolues, avant le lexique ; `coach-rules.ts`) et « Ce que tu sais de ce joueur, dit par lui-même »
(lignes datées du compte, présentées comme ses mots, jamais comme une donnée, plus la consigne d'usage de
`rememberAboutMe` ; `coach-memory.ts`), placé après le format, avant le contexte de page. Interrupteurs fermés : blocs
vides, prompt **identique** à celui d'avant ; base injoignable : blocs vides, la réponse part sans eux.

Coach e-sport francophone, **tutoiement** (« vous » seulement pour l'escouade — exception déclarée dans
`src/lib/tutoiement.test.ts`), vocabulaire du site, **lexique des joueurs** (« loot » / « stuff » = armes et
consommables, « drop » = largage, « knock », « wipe », « smokes », « nades », « la M4 », « le Kar », « chicken »,
« soirée ») traduit vers le bon outil sans demander de précision, bloc **« Choix de l'outil »** (un jour ou une date →
`getSessions` après traduction du jour en date ; les dernières parties → `getRecentMatches` ; une période → cartes,
classement, Ligue ; les habitudes → `getPlaySchedule`), titre court + puces + recommandation finale **au tutoiement**
(« vous » seulement à l'escouade), horloge du replay. Tout
chiffre vient d'un outil ; un résultat annonce sa période, sa carte et son périmètre (jamais le même résultat sous une
autre étiquette) ; nombres à la française ; hors sujet : refus en une phrase **sans chiffre**. Une réponse chiffrée
sans résultat d'outil exploitable — aucun appel, ou des appels tous en échec (exception ou `{ error }`) — est marquée
`unverified` : bandeau « Chiffres non vérifiés par les données » dans le tiroir, remontée dans l'onglet Questions du
SuperUser ; l'audit `toolCalls` garde l'issue de chaque appel (`failed`, depuis le 2026-10-25). Les pseudos et noms de
clan renvoyés par les outils sont traités comme du texte, pas comme des consignes.

Contexte de page (`coach-context.ts`, `coach-context-service.ts`) : l'adresse de la page (`contextPath`) est reconnue
par motif puis **vérifiée** (match du clan, joueur du clan, tournoi publié) ; elle donne l'étiquette du bandeau
(« Erangel · 22 oct. 21:47 · Top 3 », « Tournoi · L'Observateur des fun »), trois suggestions selon la page et la phase
du tournoi, et le bloc du prompt. Une adresse étrangère = « sans contexte ».

## 7. Routes

| Route | Garde |
|---|---|
| `POST /api/clans/[clanId]/coach/chat` | membre du clan + quota → flux SSE (`meta`, `tool`, `delta`, `done`, `error`) |
| `GET · DELETE /api/coach/memory`, `DELETE …/memory/[id]` (lot 11) | compte connecté : ses lignes (`enabled`, `max`, `retentionDays`), « Tout oublier », une ligne (404 si elle n'est pas à lui) |
| `GET · POST /api/settings/coach/rules`, `PATCH · DELETE …/rules/[id]` (lot 10) | `requirePlatformAdmin`, écritures `withAdminActionLog` ; 409 au-delà de 20 règles actives |
| `PATCH /api/settings/coach/questions/[id]/note` | `requirePlatformAdmin`, `withAdminActionLog` : précision d'un vote « Inexact » réécrite (280, vide = retirée) ; 404 hors vote « Inexact » |
| `GET /api/coach/limits` | publique, cache 5 min : limites chiffrées de l'aide (questions par heure, budget mensuel par compte, longueur et délai d'une question, historique relu, bornes de la mémoire) — rien de personnel |
| `GET /api/coach/quota` | session |
| `GET /api/coach/conversations`, `GET · PATCH · DELETE …/[id]` | propriétaire (lecture SuperUser), 404 sinon |
| `POST /api/coach/messages/[id]/feedback` | propriétaire |
| `GET · PUT /api/settings/coach`, `POST …/test-model`, `GET …/usage`, `GET …/questions`, `POST …/questions/[id]/reviewed` | `requirePlatformAdmin`, écritures sous `withAdminActionLog` |

Le flux est lu par `fetch` + lecteur de flux (`EventSource` ne fait pas de POST). En-têtes `X-Accel-Buffering: no` et
`Cache-Control: no-cache, no-transform` (`COACH_SSE_HEADERS`) : Nginx ne bufferise pas, rien à configurer
([deployment.md](../ops/deployment.md), « Flux du Coach IA »). `request.signal` interrompt le modèle quand le tiroir
se ferme ; ce qui a été dit reste dans le fil (`aborted`) et la question compte.

## 8. Interface (`src/components/coach/`, `src/app/clans/[clanId]/coach/page.tsx`)

- **Déclencheurs** : bouton « Coach IA » dans l'en-tête (`CoachTrigger`, bordure et icône en accent comme le bouton
  flottant depuis le 2026-10-25, masqué sous 640 px — le header ne grandit jamais), relayé sous 640 px par le
  **bouton flottant** `CoachFab` (bas droite, icône seule nommée « Coach IA »,
  masqué tant que le panneau est ouvert, absent de la page plein écran, sous les toasts — 2026-10-25), entrée de la
  palette `Ctrl+K`, bouton « Débriefer ce match avec le Coach » du débriefing (`CoachContextButton`), entrée de menu
  `clan.coach` (rôle `member`, seed `scripts/seed-coach-nav.ts`).
- **Tiroir** (`CoachDrawer`, `CoachPanel` en variante `drawer`) : 440 px à droite, monté à la première ouverture puis
  gardé caché (le fil reste) ; panneau à 85 % de la hauteur sur mobile. En-tête (icône bouclier, tag du clan, « En
  ligne », pastille de quota, Fils · Agrandir · Fermer), bandeau de contexte détachable, suggestions, bulles, votes
  Utile · Inexact (+ précision) · Copier, saisie de 400 caractères, mention « Coach IA expérimental · Données de l'API
  PUBG » (AI Act, art. 50).
- **« Ce que le Coach sait de toi »** (lot 11) : bouton de l'en-tête (icône cerveau), présent seulement quand la mémoire
  est ouverte (`memoryEnabled` du quota) ; liste des lignes du compte — clé, les mots du joueur, date, mesure de départ
  —, « Oublier » par ligne, « Tout oublier » ; relue à la fin de chaque réponse (`useCoachMemory`). Dans le tiroir elle
  remplace le fil, sur la page plein écran la liste des fils. Sous 768 px, le bouton « Agrandir » du panneau disparaît
  (`.coach-maximize`) pour lui laisser la place : la page plein écran reste accessible par le menu.
- **Carte « Coach IA » de `/account`** (`CoachAccountCard`, 2026-10-25) : lien « Ouvrir le Coach » vers la page du clan
  du membre (à défaut, le clan choisi dans le menu), le nombre de lignes retenues quand la mémoire personnelle est
  ouverte (une lecture de `GET /api/coach/memory`), et l'aide (`CoachHelp` en variante `card`).
- **Aide** (`src/lib/coach/coach-help.ts`, `CoachHelp`, 2026-10-25) : « Ce qu'il sait faire » — un domaine par groupe
  d'outils avec des questions d'exemple qu'un outil sait servir (`coach-help.test.ts` vérifie que chaque outil déclaré
  est couvert, pour ne jamais suggérer une question hors des fonctions) —, « Ses limites » (chiffrées d'après
  `GET /api/coach/limits` : « 20 questions par heure et 2 € de budget par mois », « au plus 400 caractères, à 4 s
  d'écart », historique relu, bornes de la mémoire quand elle est ouverte), « Pour l'améliorer »
  (votes, précision, contexte de page, noms du site, fil ; conseil « retiens que… » quand la mémoire est ouverte).
  Partout la même barre « Comment ça marche ? » (`<details>`, « Afficher » / « Masquer » et chevron à droite) qui déplie
  les trois blocs d'un coup : sur la carte de `/account` (domaines en liste) et sous le panneau de la page plein écran
  (section `#aide`, domaines avec exemples) — reliée depuis le mot d'accueil du tiroir.
- **Plein écran** `/clans/[clanId]/coach` (`CoachPanel` en variante `page`) : fil de 760 px et liste des fils (nouveau,
  renommer, supprimer). `noindex` (`CLAN_PAGES`, `src/lib/seo/page-seo.ts`).
- **Teaser** visiteur et **carte de la vitrine** (`CoachRow` de `HomeShowcase.tsx`, rendue seulement quand le Coach est
  ouvert — `src/app/page.tsx`). Image provisoire `/cartographie-tactique.jpg` (`public/vitrine-coach-ia.jpg` à fournir).
- Hooks : `useCoachQuota`, `useCoachConversations`, `useCoachChat` (`src/hooks/`) ; contexte `CoachProvider`
  (`src/components/coach/CoachContext.tsx`) posé dans le layout racine. Aucun appel API tant que le tiroir n'est pas
  ouvert ; aucun `localStorage` au premier rendu. Styles : classes `.coach-*` de `globals.css`, jetons seulement.

## 9. Administration `/settings/coach` (SuperUser)

`AdminAccessGate` (platform) dans `src/app/settings/coach/layout.tsx`, onglets `SettingsTabsShell`, entrée
`superuser.coach` du registre (seed `scripts/seed-coach-admin-nav.ts`), carte du hub Plateforme (groupe « Site »).

- **Réglages** (lots 10 et 11) : carte « Règles apprises et mémoire personnelle », deux interrupteurs enregistrés seuls
  (`rulesEnabled`, `memoryEnabled`), fermés par défaut.
- **Questions** (lot 10) : section « Règles apprises » (`CoachRulesSection`) — compteur « N / 20 actives · ≈ T tokens
  par question », saisie d'une règle (8 à 200 caractères, impératif, tutoiement), liste avec interrupteur, modification
  et suppression confirmée ; « En faire une règle » sur un vote « Inexact » rattache le vote (`fromMessageId`) et laisse
  le texte vide : la note du joueur n'entre jamais dans le prompt. La mémoire personnelle n'apparaît nulle part ici.
  La **précision du joueur** d'un vote « Inexact » se réécrit en place (crayon, `PATCH …/questions/[id]/note`, 280
  caractères, vide = retirée, journalisé) : une note vague (« la réponse n'est pas juste ») devient le diagnostic de la
  relecture, source de la règle — demande du 2026-10-25.

| Onglet | Contenu |
|---|---|
| Réglages | Interrupteur (enregistré tout de suite), clé présente ou absente, tuiles radio des modèles (prix, coût estimé par question au taux courant, plafond de sortie, pastilles recommandé / prix doublé / arrêt, note de l'essai, **Tester** avec résultat sous la tuile), budgets et limites en brouillon + « Enregistrer » |
| Consommation | Mois de Paris : coût, questions répondues, comptes actifs, coût par question, erreurs, interrompues ; jauge du plafond global (repère 80 %) ; par modèle ; comptes au-delà de 80 % de leur budget ; erreurs des 24 h |
| Questions | Votes Utile / Inexact / à relire ; questions fréquentes sur 30 jours **regroupées par mots-clés** (`questionTokens` : accents, ponctuation, mots vides, tournures de demande et terminaisons ignorés ; deux questions qui partagent 60 % de leurs mots-clés font une ligne, le libellé est la formulation la plus fréquente, « · N formulations » quand elles diffèrent), 200 groupes au plus, paginées par 10 ; chaque vote « Inexact » avec question, précision du joueur, réponse, outils, bouton « Relu » — **jamais le compte** |

Rapports purs dans `coach-admin-report.ts` (tests `coach-admin-report.test.ts`), lectures dans
`coach-admin-service.ts`, routes testées par `coach-admin-routes.test.ts`.

## 10. Alertes et boîte « À traiter »

Entrées de `src/lib/admin-alerts/catalog.ts`, envoi par `src/lib/coach/coach-alerts.ts` (mémoire dans `AppConfig`,
jamais deux fois) : `coach_budget` (plafond global à 80 %, puis atteint — une fois par niveau et par mois),
`coach_provider_errors` (5 réponses en erreur en 15 min, puis silence 6 h), `coach_model_notice` (arrêt ou changement
de prix du modèle actif dans les 30 jours, vérifié chaque matin avec la veille). Ligne « Réponses du Coach IA signalées
« Inexact » à relire » dans la boîte « À traiter » (`src/lib/admin-inbox/build.ts`, ton `info`).

## 11. Confidentialité et mentions

- `/confidentialite` : lignes « Questions au Coach IA » et « Consommation du Coach IA », transfert chez Google (API
  Gemini, niveau payant, pas d'entraînement, traitement possible hors UE), finalité, base légale (exécution du service),
  conservation 12 / 13 mois, suppression d'un fil par le joueur, purge sur demande. Lot 11 (2026-10-25) : ligne « Ce que
  tu demandes au Coach IA de retenir » (en tes mots, mesure de départ comprise ; visible et effaçable dans le panneau,
  jamais lu par l'administrateur), conservation 90 jours après la dernière mise à jour ; les mémoires partent chez Google
  avec le prompt, comme la question. Purge sur demande étendue (`purge-coach-history.ts`).
- `/mentions-legales` : réponses générées par un modèle d'IA (origine des données, condition d'utilisation).
- Ce qui part chez Google : la question, le fil en cours, les résultats d'outils (pseudos PUBG et tags de clan, déjà
  publics dans le jeu, statistiques de parties). Jamais l'adresse e-mail ni l'identifiant du compte.
- Marque : « Données de l'API PUBG », jamais « Données officielles » (`KRAFTON_DISCLAIMER`).

## 12. Mise en production (lot 9)

1. `npx prisma migrate deploy` (migration `20261024120000_coach_ia`).
2. `GEMINI_API_KEY` dans le `.env` du serveur (propriétaire `smk`, puis recopie dans `.next/standalone/.env` ou
   rebuild — [deployment.md](../ops/deployment.md)). Projet Google Cloud **avec facturation** et plafond de dépense
   posé côté Google.
3. Déployer ; le Coach reste **fermé** (`coach_enabled` absent). `npx tsx scripts/seed-coach-nav.ts` et
   `npx tsx scripts/seed-coach-admin-nav.ts` (entrées de menu, idempotents).
4. Vérifier derrière Nginx que le flux arrive mot à mot (`/settings/coach` → « Tester », puis une question en tant que
   SuperUser, qui passe outre la pause).
5. Interrupteur ouvert depuis `/settings/coach` ; la carte de la vitrine apparaît avec lui.
6. Bilan après une semaine (onglet Consommation) : coût réel par question, votes « Inexact », questions hors sujet.
7. Lots 10 et 11 (2026-10-25) : `deploy.sh` applique la migration additive `20261025180000_coach_rules_memory` (deux
   tables vides) ; rien ne change tant que `coach_rules_enabled` et `coach_memory_enabled` restent fermés. Ouvrir les
   règles après la première semaine de votes relus, la mémoire ensuite — depuis l'onglet Réglages.

## 13. Tests

Vitest (`src/lib/coach/*.test.ts`) : réglages et bornes, quota (fenêtre glissante, mois de Paris, plafond global,
SuperUser), coût et catalogue, contexte, outils (étanchéité, parties compressées), fournisseur (flux simulé), routes
(session, clan, 404 d'un fil étranger, flux SSE sans crédit consommé), rapports d'administration, alertes, routes
d'administration, règles apprises (`coach-rules.test.ts` : bornes, bloc, cache, routes), mémoire personnelle
(`coach-memory.test.ts` : étanchéité du texte, baseline vérifiée, borne de 8, outil lié au compte, aucune lecture depuis
l'administration), conservation et purge ; `admin-action-log-routes.test.ts` (écritures journalisées),
`tutoiement.test.ts`, `ui-conformance.test.ts`. Playwright `e2e/coach.spec.ts` : lot 9.
