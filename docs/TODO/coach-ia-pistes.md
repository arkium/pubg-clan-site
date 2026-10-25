# Coach IA — pistes d'évolution et faisabilité

> Relevé du 2026-10-24, à partir de cinq axes proposés par une analyse externe, **vérifiés contre le code** de la
> branche `feat/coach-ia` (lots 0 à 8 livrés, [chatbot-ia.md](chatbot-ia.md)). Chaque piste dit ce qui existe déjà, ce
> qui manque, l'effort et les risques, pour choisir l'ordre. Rien ici n'est implémenté. *Destiné à l'utilisateur et à
> l'équipe de développement.*

Règles qui bornent toutes les pistes (CLAUDE.md, « Coach IA ») : le modèle ne choisit jamais un identifiant ; les
pseudos renvoyés par les outils sont des données, pas des consignes ; aucun outil ne parcourt les blobs de toutes les
parties du clan (une question = quelques lectures bornées) ; chaque question coûte des tokens (hypothèse 5 000 en
entrée) ; rien ne part sur Discord qui ne parte déjà (pseudos de l'escouade des alertes Top 1 : oui ; compte, e-mail :
jamais).

| # | Piste | Faisable aujourd'hui | Effort | Valeur | Rang conseillé |
|---|---|---|---|---|---|
| 2 | Boutons 1-clic sur les pages | Oui, tout existe (`CoachContextButton`, `useCoach`) | ½ jour | Haute, surtout mobile | **1** |
| 1c | Pilules d'action en fin de réponse | Oui, côté serveur, sans le modèle | ½ jour | Haute | **2** |
| 1a | Horodatages cliquables vers le replay 2D | Oui (`MatchReplay2D` accepte `startAt`), un paramètre d'URL à ajouter | 1 jour | Haute | **3** |
| 4a | « Où je me situe ? » face à la Ligue (centiles) | **Fait le 2026-10-24** : outil `getPlayerBenchmark` (`players-ranking.ts` calculait déjà les centiles entre clans) | ½ jour | Haute | ~~4~~ fait |
| 3c | Équilibre de l'armement de l'escouade | Oui (`MemberWeaponStats`, `weaponStatsGz` par partie) | 1 jour | Moyenne | 5 |
| 1b | Pseudos et clans cliquables | Oui, avec des liens générés par le serveur, jamais par le modèle | 1 jour | Moyenne | 6 |
| 3a | Indice de cohésion (distance entre coéquipiers) | Par partie : oui (`positionSamplesGz`). Sur toutes les parties : précalcul nécessaire | 1 jour + 2 à 3 jours | Haute, inédite | 7 |
| 4b | Détecteur de « victoires manquées » | Par partie : oui (`phaseSnapshots`, `deathSamples`). Sur un mois : même précalcul que 3a | avec 3a | Moyenne | 8 |
| 5a | Chronique de soirée automatique | Oui (cron, webhook Discord par clan, page Soirée), à cadrer : coût, ton, opt-in | 2 jours | Moyenne à haute | 9 |
| 5b | Alerte de record personnel | Partiellement : les maxima existent, pas l'« avant » | 1 à 2 jours | Moyenne | 10 |
| 3b | Utilitaires sous pression (fumigène avant knock) | **Non** : aucun horodatage des objets consommés ni lancés | parser + migration, parties futures seulement | Moyenne | 11 |
| 6a | Mémoire personnelle du joueur (objectifs, préférences) | Oui, **par compte**, explicite, visible et effaçable par le joueur ; jamais lue par le SuperUser (§6) | 2 jours | Haute | à décider |
| 6b | Règles apprises des votes « Inexact » (écrites par le SuperUser) | Oui, cheap : une table, un bouton dans l'onglet Questions, un bloc borné du prompt (§6) | 1 jour | Haute | à décider |
| 6c | Bibliothèque de « meilleures réponses » (few-shot) | Possible mais coûteux en tokens et porteur de pseudos : reporté (§6) | — | Faible | non |

---

## 1. Navigation bidirectionnelle : des liens dans les réponses

### 1a. Horodatages cliquables vers le replay 2D — faisable

- **Existe** : `MatchReplay2D` prend `startAt: { seconds, key }` et s'y positionne (`seekTo`) ;
  `MatchDebriefView` garde `replayStart` en état et l'onglet vient de l'URL (`?tab=…`, `DEBRIEF_TAB_PARAM`). Le prompt
  impose déjà l'horloge du replay (« 18:42 »), et `getMatchDebrief` renvoie ses événements avec cette horloge.
- **Manque** : un paramètre d'URL `t=<secondes>` lu au montage pour poser `replayStart` ; dans le tiroir, le rendu des
  réponses (`coach-markdown.ts`, qui ne connaît que le gras) doit reconnaître `mm:ss` et en faire un lien
  `…/debrief?tab=replay&t=1122` — **seulement** quand le message porte un `contextPath` de match et que la valeur ne
  dépasse pas la durée de la partie.
- **Piège** : « 21:47 » est aussi une heure d'horloge (étiquette du bandeau). Ne lier que dans une réponse de match,
  et seulement les valeurs plausibles ; au besoin demander au modèle d'écrire les instants du replay entre crochets
  (`[18:42]`) pour lever l'ambiguïté.
- **Effort** : 1 jour (paramètre d'URL, rendu, test du parseur, e2e du débriefing).

### 1b. Pseudos et clans cliquables — faisable, avec une règle

- **Existe** : `playerShortUrl(context, memberId)` → `/j/[memberId]` (`src/lib/short-links.ts`), pages joueur publiques
  (hors index). Un clan adverse n'a pas de page, l'annuaire `/clans` ne couvre que les clans suivis.
- **Manque** : les outils ne renvoient aucun identifiant (test d'étanchéité : « sans `memberId` »). Pour lier, l'outil
  renverrait, pour les **membres du clan seulement**, un champ `link: '/j/123'` fabriqué par le serveur, et le prompt
  demanderait au modèle de le recopier en lien Markdown ; le rendu n'accepterait que des chemins relatifs d'une liste
  blanche (`/j/`, `/m/`, `/clans/`, `/members/`). Le modèle n'invente alors aucune adresse : il recopie ou n'a rien.
- **Risque** : un pseudo est un texte tiers ; le lien vient de l'identifiant serveur, jamais du texte — à tester.
- **Effort** : 1 jour. Valeur moyenne : la fiche joueur est déjà à un clic dans les classements.

### 1c. Pilules d'action en fin de réponse — faisable, le meilleur rapport

- **Idée** : après la réponse, deux ou trois raccourcis (« Voir ma fiche Beryl M762 », « Ouvrir le débriefing »,
  « Zones de largage d'Erangel ») **calculés par le serveur d'après les outils appelés**, envoyés dans l'événement
  `done` du flux (`actions: [{ label, href }]`). Le modèle n'y touche pas : aucune adresse inventée, aucun token.
- **Existe** : la liste des appels d'outils par réponse (`CoachMessage.toolCalls`), les adresses des pages.
- **Effort** : ½ jour (service + rendu dans `CoachPanel`, classe `.coach-suggestion` déjà dessinée).

## 2. Boutons 1-clic contextuels — faisable, à faire en premier

- **Existe** : `CoachContextButton` (« Débriefer ce match avec le Coach ») ouvre le tiroir avec le contexte de la page ;
  `useCoach()` expose `open()`, `close()`, `toggle()`.
- **Manque** : `open({ ask })` qui envoie la question à l'ouverture (`useCoachChat` sait déjà envoyer), puis des boutons
  sur les pages : débriefing (« Autopsie de la défaite » / « Les clés du Top 1 » selon le placement), Armes
  (« Diagnostic de mon arsenal »), Soirée (« Bilan en 3 points »), Cartes (« Notre pire carte »). Sans émoji (charte).
- **Coût** : un clic = une question, comptée dans le quota et le budget ; rien de plus.
- **Effort** : ½ jour. C'est ce qui aide le plus sur téléphone, où taper est pénible.

## 3. Croisements que les tableaux ne montrent pas

### 3a. Indice de cohésion de l'escouade — faisable par partie, précalcul pour le reste

- **Existe** : `positionSamplesGz` (par membre : `memberKey`, `phase`, `timestampSeconds`, `x`, `y`, `inVehicle`) et
  `knockoutSamplesGz` (horodatage du premier knock), décodés par `decodeTelemetryRow`. Le débriefing n'a **aucune**
  mesure de distance entre coéquipiers aujourd'hui (l'« Isolement : 145 m » de la maquette était une invention de
  Claude Design).
- **Par partie** : calculer dans `getMatchDebrief` l'écartement moyen par phase (distance au barycentre de l'escouade)
  et l'écartement au moment du premier knock — quelques milliers d'échantillons, quelques dizaines de millisecondes.
  **1 jour.**
- **Sur les parties gagnées / perdues du mois** : interdit de décoder des dizaines de blobs par question. Il faut un
  **précalcul à l'analyse** (le worker écrit une ligne par partie : écartement moyen, écartement au premier knock,
  avantage numérique en dernière phase — voir 4b), plus un rattrapage sur les positions déjà stockées (modèle :
  `telemetry:zone-reading:backfill`). Table nouvelle ou colonnes sur `SquadMatchTelemetry`, migration, worker,
  rattrapage, outil `getSquadCohesion({ period })`. **2 à 3 jours.** Valeur haute et inédite sur le site.

### 3b. Utilitaires sous pression — pas faisable en l'état

- `MemberItemUseStat` et `MemberThrowableStat` sont des **compteurs par partie**, sans horodatage ; les échantillons
  `itemUseSamples` ne sont pas conservés (docs/features/objets-consommes.md). « Fumigène dans les 10 s avant le
  knock » exige un nouveau tableau horodaté dans la télémétrie (parser, colonne compressée, migration), et ne
  couvrirait que les parties analysées après son déploiement (fenêtre CDN de 14 jours pour le reste).
- Repli possible sans parser : corréler, par partie, fumigènes lancés et knocks subis — faible, à ne pas vendre
  comme une analyse.

### 3c. Équilibre de l'armement de l'escouade — faisable

- **Existe** : `weaponStatsGz` par partie (arme par membre : tirs, touches, kills, distances) et `MemberWeaponStats`
  par période ; catégories dans `src/lib/weapons/weapon-categories.ts` (AR, DMR, SR, SMG, LMG, SG…).
- **Par partie** : ajouter au débriefing l'arsenal de chaque membre (deux armes les plus tirées, catégorie) → le modèle
  voit « 4 DMR, 0 SR ». **½ jour.**
- **Par période** : outil `getSquadLoadout({ period })` — pour les membres actifs, catégories dominantes et paires
  fréquentes ; dit ce qu'il manque face aux clans (3a n'est pas requis). **½ jour.**

## 4. Benchmark face à la Ligue

### 4a. « Où je me situe ? » — fait le 2026-10-24 (`getPlayerBenchmark`, reste la variante par arme)

- **Existe** : `/players` classe les joueurs de tous les clans (parties officielles de clan, cache 5 min) avec des
  **centiles** Fragger / Medic / Ghost / Tireur à distance (`percentileOf`, `players-ranking.ts`,
  `players-ranking-service.ts`). Le Coach ne les lit pas encore.
- **Manque** : outil `getPlayerBenchmark({ playerName? })` : rang parmi N joueurs classés, centile de chaque mesure
  (kills, dégâts, soins, survie, distance), tendance. **½ jour.** Vocabulaire à garder : ces scores sont des centiles
  entre clans, pas le style de jeu relatif au clan (`MemberTelemetryStats`) — ne pas les mélanger (CLAUDE.md).
- **Par arme** (« ton Beryl est dans le Top 15 % de la Ligue ») : une requête sur `MemberWeaponStats` de tous les
  membres pour l'arme et la période, centile du joueur — faisable, à mesurer (index `(period, weaponName)` à
  vérifier avant, règle de `docs/ops/database-performance.md`). **½ à 1 jour.**

### 4b. Détecteur de « victoires manquées » — faisable par partie, précalcul pour la liste

- **Existe** : `phaseSnapshotsGz` (`numAlivePlayers`, `numAliveTeams` par phase) et `deathSamplesGz` /
  `knockoutSamplesGz` (quand chaque membre tombe) : à chaque phase, on sait combien de l'escouade sont vivants et combien
  d'adversaires restent. « 4 contre 2 en phase 7 et perdu » se détecte par partie.
- **Par partie** : dans `getMatchDebrief`, une ligne « avantage numérique en dernière phase : oui / non ». **½ jour.**
- **« Mes throws du mois »** : même précalcul que 3a (une ligne par partie). Le mot « choke » est à éviter dans la
  réponse : le prompt impose le constructif.

## 5. Mode proactif

### 5a. Chronique de soirée — faisable, à cadrer

- **Existe** : cron (`src/lib/cron-jobs.ts`), webhook Discord par clan (`getDiscordSettings(clanId)`, alertes Top 1
  avec pseudos de l'escouade), page Soirée (`/clans/[clanId]/matches/session/[date]`), outils du Coach appelables
  côté serveur sans session (scope `{ clanId, memberId: 0 }`).
- **Manque** : tâche du matin (après les agrégats de 03:00) qui, pour chaque clan ayant joué la veille, demande au
  modèle trois lignes à partir des outils (`getRecentMatches`, `getMatchDebrief` du meilleur match), les enregistre
  (table `CoachDigest` : clan, soirée, texte, coût) et les affiche en tête de la page Soirée ; envoi Discord **opt-in**
  par clan (réglage à côté de l'alerte Top 1).
- **Coût** : ≈ 0,003 $ par clan et par soirée jouée (une question type) → moins de 1 € par mois pour 22 clans, à
  compter dans le plafond global (le coût des digests s'ajoute à `CoachUsage` dans `readCoachQuotaFacts`).
- **Risques** : le ton « humoristique » peut blesser (« pensée pour X qui a pris 3 headshots ») — garder la consigne
  constructive du prompt, pas de moquerie nominative ; Discord = service tiers, mêmes données que l'alerte Top 1 ;
  un texte généré est publié sans relecture → le marquer « généré par le Coach IA » (AI Act, art. 50) et offrir
  « Inexact » comme dans le tiroir.
- **Effort** : 2 jours. À lancer **après** la première semaine d'usage réel (bilan du lot 9).

### 5b. Alerte de record personnel — partiellement faisable

- **Existe** : `MemberWeaponStats.maxDistance` et `avgDistance` par période (`all-time`), recalculés par le worker
  d'agrégats (`period-aggregates.ts`) ; notifications in-app / e-mail avec préférences par type
  (docs/features/notifications.md).
- **Manque** : l'« avant » — l'agrégation remplace les lignes sans garder l'ancien maximum. Il faut comparer dans
  l'agrégation (ancien max lu avant écriture) et émettre une notification `personal_record`, donc un nouveau type
  (colonne de préférence, migration, textes, test `notification-preferences.test.ts`). **1 à 2 jours.**
- **Attention** : un record « knock à 512 m au Kar98k » n'existe que si la distance est portée par l'événement de
  knock (`knockoutSamples` n'a que la position) ; `maxDistance` est celle des **tirs touchés** de `weaponStats`. Dire
  « tir touché à 512 m », pas « knock ».

---

## 6. Mémoire du Coach — analyse d'une proposition externe (2026-10-24)

Proposition reçue : « le Coach a déjà 90 % de l'infrastructure (fils et messages en base) ; ajouter une mémoire
personnelle par joueur (`CoachPlayerMemory`, clé / valeur par `memberId`, injectée dans le prompt) et une mémoire
collective (règles apprises des votes « Inexact », validées par le SuperUser ou synthétisées par l'IA, plus une
bibliothèque des meilleures réponses en *few-shot*) ». Vérifié contre le code et les décisions du chantier.

### 6.1 Ce qui est vrai, ce qui ne l'est pas

| Affirmation | Réalité |
|---|---|
| « 90 % de l'infrastructure existe » | Les fils, messages, votes et notes existent (`CoachConversation`, `CoachMessage.feedbackScore / feedbackNote / reviewedAt`). **Rien** pour une mémoire : pas de table, pas d'injection dans le prompt (`buildCoachSystemPrompt` ne reçoit que le contexte de page), pas d'écran pour la voir ou l'effacer, pas de purge, pas de ligne de confidentialité. Disons un tiers |
| Mémoire par `memberId` | **Contraire à une décision du chantier** : fils et quota sont **par compte** (`userId`) — un compte peut avoir plusieurs membres, un membre peut changer de clan (P5 : « ses fils restent à son compte »). Une mémoire se range par `userId`, avec le membre et le clan du moment à titre indicatif |
| « Lors de ta session d'hier, ton ratio de headshots au Kar98k est monté à 28 % — ton entraînement paie » | Faisable **seulement si l'objectif garde une base de départ** : `MemberWeaponStats` existe par période (mois, depuis toujours), pas par soirée ni par semaine. Il faut stocker, avec l'objectif, la valeur mesurée le jour où il est posé (« 22 % le 24 octobre ») ; le Coach compare ensuite au mois en cours |
| « 40 % de tes éliminations étaient dues à des rotations trop tardives à pied » | **Inventé** : aucune donnée du site ne classe les causes de mort. Une « faiblesse » mémorisée ne peut venir que des mots du joueur, ou d'un chiffre renvoyé par un outil, daté — jamais d'une déduction du modèle. Sinon, la mémoire devient un réservoir d'hallucinations réinjectées à chaque question |
| « Salut NovakTV ! Lors de ta session d'hier… » à l'ouverture | Un message proactif à l'ouverture = un appel au modèle avant toute question (coût, latence). À réserver à la première question du fil, ou à la chronique de soirée (piste 5a) |
| « L'IA synthétise la règle apprise » | **À exclure** : une phrase écrite par le modèle qui entre dans le prompt système est une injection de consigne par le modèle lui-même, amorçable par un pseudo ou une question piégée. Seul le SuperUser écrit une règle, à la main |
| Bibliothèque des meilleures réponses (*few-shot*) | Chaque exemple pèse 300 à 500 tokens, à chaque question : trois exemples = +30 % de coût. Et une réponse « exemplaire » cite des **pseudos et des chiffres d'un clan**, montrés au modèle pour un joueur d'un autre clan. Le format est déjà fixé par le prompt ; le gain serait marginal. Reporté |
| « Étonnamment léger » | Le code l'est ; ce qui ne l'est pas : la **donnée personnelle** (objectifs, préférences, « faiblesses » d'une personne) — à déclarer, borner, montrer, effacer, purger, et ne jamais lire côté SuperUser |

### 6.2 Mémoire personnelle (6a) — conception retenue si elle est décidée

- **Table `CoachMemory`** : `userId` (compte, `Cascade`), `memberId?` et `clanId?` (`SetNull`, indicatifs), `key`
  (`VarChar(32)` : `goal`, `role`, `preference`, `avoid`, `note`), `text` (`VarChar(200)`, les mots du joueur),
  `baseline` (`Json?` : mesure de départ datée, posée par le serveur — ex. `{ metric: 'headshotRate', weapon:
  'Kar98k', value: 22, at: '2026-10-24' }`), `source` (`player` | `tool`), `createdAt`, `updatedAt`, `expiresAt`.
  **Au plus 8 lignes par compte**, les plus anciennes expirent (90 jours sans mise à jour) ; purge de 01:15 et script
  `purge-coach-history.ts` étendus.
- **Écriture explicite seulement** : un outil `rememberAboutMe({ key, text })` que le modèle appelle quand le joueur
  le dit (« retiens que… », « mon objectif… »), avec le texte **du message du joueur** (le serveur refuse un texte qui
  n'apparaît pas dans la question) ; jamais une déduction du modèle, jamais un texte venu d'un résultat d'outil. Un
  objectif chiffré reçoit sa `baseline` par l'outil correspondant (`getWeaponStats`, `getPlayerBenchmark`).
- **Lecture** : au début de chaque question, les lignes du compte (≤ 8 × 200 caractères ≈ 400 tokens au plus) dans
  un bloc du prompt : « Ce que tu sais de ce joueur, dit par lui (date) : … Objectif : …, mesuré à 22 % le 24/10 »,
  avec la consigne de s'y référer **seulement** quand c'est utile et de comparer à une mesure d'outil du jour.
- **Vu et effaçable par le joueur** : liste dans le panneau du Coach (entrée « Ce que le Coach sait de toi », une croix
  par ligne, « Tout oublier ») ; `DELETE /api/coach/memory/[id]`. **Jamais affiché au SuperUser** : l'onglet Questions
  ne montre pas la mémoire, même pseudonymisée ; les alertes et la boîte « À traiter » non plus.
- **Confidentialité** : nouvelle ligne de `/confidentialite` (« ce que tu demandes au Coach de retenir : objectifs,
  préférences, en tes mots ; conservé 90 jours sans mise à jour, effaçable d'un clic ») ; purge ; base légale :
  exécution du service, à ta demande. Les mémoires partent chez Google avec le prompt, comme la question.
- **Coût** : ≈ +400 tokens par question au pire (+8 %), un appel d'outil de plus quand le joueur demande de retenir.
- **Effort** : 2 jours (migration, outil, bloc du prompt, panneau, route, purge, confidentialité, tests). Valeur
  haute : c'est ce qui fait passer le Coach d'un outil de stats à un suivi.

### 6.3 Règles apprises (6b) — conception retenue si elle est décidée

- **Table `CoachRule`** : `text` (`VarChar(200)`, impératif, tutoiement), `enabled`, `fromMessageId?` (le vote
  « Inexact » d'origine, pour l'historique), `createdBy` (compte SuperUser), dates. **Au plus 20 règles actives**,
  ordonnées par date ; au-delà, l'enregistrement refuse (une règle de plus = une à retirer).
- **Écriture par le SuperUser seul**, à la main : dans l'onglet Questions, sur un vote « Inexact », un bouton
  « En faire une règle » pré-remplit le texte **vide** (pas la note du joueur : un joueur pourrait y écrire une
  consigne) ; le SuperUser rédige ; `withAdminActionLog`. Pas de synthèse automatique, pas de règle venue d'un vote
  « Utile ».
- **Lecture** : bloc « Règles du site » du prompt, après les règles absolues, avant le lexique : ≈ 20 × 40 tokens
  = 800 tokens au pire (+16 %) — d'où la borne. Le SuperUser voit le coût en tokens de ses règles sur l'onglet.
- **Exemples de bonnes règles** : « Le DBS est un fusil à pompe, pas un sniper » (mais le catalogue d'armes
  `weapon-categories.ts` le dit déjà : corriger la donnée vaut mieux qu'une règle) ; « Sur Karakin, les véhicules
  sont rares : ne propose pas de rotation en véhicule » ; « Un Top 10 n'est pas une victoire ». Une règle est un
  pansement : quand elle corrige une donnée ou un outil, corriger l'outil et retirer la règle.
- **Effort** : 1 jour (migration, section de l'onglet Questions, route, bloc du prompt, tests). Valeur haute dès la
  première semaine d'usage réel, quand les votes « Inexact » auront montré les bévues récurrentes.

### 6.4 Bibliothèque de réponses (6c) — non retenue

Coût par question, pseudos d'un clan montrés à un autre, gain faible face au format déjà imposé. Si un jour le style
dérive, deux exemples **anonymisés et fictifs**, écrits à la main dans le prompt, feront le même travail sans table.

### 6.5 Avis

Oui aux deux mémoires, dans cet ordre : **règles apprises (6b)** après la première semaine réelle (le besoin se
mesure sur les votes), puis **mémoire personnelle (6a)** avec son écran et sa ligne de confidentialité. Non à la
synthèse automatique et au *few-shot*. Décision à inscrire au §0 de [chatbot-ia.md](chatbot-ia.md) ; chacune devient
un lot du §13 avec ses contrôles (étanchéité du texte mémorisé, aucune lecture SuperUser, purge, coût mesuré).

**Décision du 2026-10-25 : les deux, règles d'abord** — implémentées comme les lots 10 et 11 de
[chatbot-ia.md §13](chatbot-ia.md) (branche `feat/coach-memoire`), chacune derrière un interrupteur fermé par défaut
(`coach_rules_enabled`, `coach_memory_enabled`, onglet Réglages de `/settings/coach`) : le prompt reste exactement
celui d'avant tant qu'ils le sont. Écarts à la conception ci-dessus : aucun ; précisions — la mesure de départ d'un
objectif n'est acceptée que si sa valeur figure dans un résultat d'outil de la même réponse (sinon l'objectif est retenu
sans mesure), et l'ouverture de la mémoire est portée par `GET /api/coach/quota` (`memoryEnabled`) pour que le panneau
n'appelle rien de plus.

---

## Ordre proposé

1. **Boutons 1-clic** (2) et **pilules d'action** (1c) — une journée, sans le modèle, effet immédiat sur mobile.
2. **Horodatages cliquables** (1a) — le débriefing devient navigable depuis la réponse.
3. **Benchmark Ligue** (4a) — un outil, les centiles existent.
4. **Arsenal de l'escouade** (3c) et **cohésion par partie** (3a, première moitié) — enrichissent `getMatchDebrief`.
5. **Précalcul par partie** (3a seconde moitié + 4b) — le vrai chantier de données, à spécifier à part.
6. **Chronique de soirée** (5a) après le bilan du lot 9 ; **records** (5b) avec le chantier des notifications ;
   **utilitaires sous pression** (3b) seulement si le parser est rouvert pour autre chose.

Chaque piste retenue entre au §13 de [chatbot-ia.md](chatbot-ia.md) comme un lot, avec ses contrôles.
