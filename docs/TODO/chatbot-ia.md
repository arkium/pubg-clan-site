# Coach IA — spécification et plan d'implémentation

> **Document de référence du chantier « Coach IA »** : toute décision nouvelle s'inscrit au §0, toute case cochée du
> plan (§13) porte sa date et son commit. Destiné à l'équipe de développement, au SuperUser et à Claude Design.
>
> - **Statut (2026-10-24) :** **lots 0 à 8 livrés** sur la branche **`feat/coach-ia`** (commits par lot, §13) ;
>   reste le lot 9 (tests de bout en bout, build, mise en production avec le Coach fermé). Maquettes « Coach IA - Fait »
>   et « Coach IA - Compléments » relues (§11). `main` reste la production, rien n'y est fusionné avant le lot 9.
> - **Charte :** [docs/ui/index.html#coach-ia](../ui/index.html#coach-ia) (section 44) — composants du Coach traduits
>   dans les jetons du site, reportés dans `globals.css`. Elle fait foi sur la maquette pour les couleurs, rayons,
>   tailles et animations.
> - **Fiche de la fonctionnalité** (ce que le code fait, à jour) : [docs/features/coach-ia.md](../features/coach-ia.md).
>   Ce document garde l'historique des décisions et le plan.
> - **Pistes d'évolution** (liens dans les réponses, boutons 1-clic, cohésion, benchmark, chronique de soirée),
>   faisabilité vérifiée contre le code et ordre conseillé : [coach-ia-pistes.md](coach-ia-pistes.md) (2026-10-24).

**Objectif :** un assistant conversationnel réservé aux membres connectés, qui répond à partir de la télémétrie PUBG
du site (débriefing, armes, adversaires, largages). Mis en avant sur la vitrine publique comme raison de rejoindre ou
d'inscrire son clan.

---

## 0. Décisions

| Date | Sujet | Décision | Source |
|---|---|---|---|
| 2026-10-24 | Nom | **« Coach IA »** partout : bouton, menu, titre du tiroir, page, vitrine, fiche `coach-ia.md`. Dans le code : `coach` (`src/lib/coach/`, `src/components/coach/`, tables `Coach*`, adresses `/coach`) | Utilisateur |
| 2026-10-24 | Budget | **2 € par compte et par mois** (réglable), plus une limite anti-rafale de 20 questions par heure glissante et un plafond global du mois | Utilisateur (2 €) ; le reste : proposition retenue |
| 2026-10-24 | Fournisseur | **Gemini, le modèle le moins cher qui tient les appels d'outils** ; modèle **choisi par le SuperUser dans une liste**, sur une page d'administration dédiée (§9) | Utilisateur |
| 2026-10-24 | Modèle par défaut | **`gemini-3.5-flash-lite`** (0,30 $ / 2,50 $ par million de tokens) — l'essai du lot 0 (§3.4) écarte `3.1-flash-lite`, qui invente des chiffres sans appel d'outil (2 fois sur 2), et `2.5-flash-lite`, qui répond 404 aux nouveaux comptes | Essai du 2026-10-24 |
| 2026-10-24 | Liste des fils | Demandée à Claude Design (prompt §11.4) | Utilisateur |
| 2026-10-24 | Charte | Composants ajoutés à `docs/ui/index.html` (section 44) ; la maquette est traduite dans les jetons du site | Utilisateur |
| 2026-10-24 | Branche | Tout le chantier sur **`feat/coach-ia`** ; `main` = production, fusion au lot 9 seulement | Utilisateur |
| 2026-10-24 | Compléments | « Coach IA - Compléments » livrée (écrans 0 à N, clair et sombre, desktop et mobile), relue au §11.5 ; **statuts des modèles inversés** dans la maquette, à corriger | Claude Design |

| 2026-10-24 | P1 à P7 | **Confirmées** telles quelles (tableau ci-dessous) | Utilisateur |
| 2026-10-24 | Clé Gemini | Projet Google Cloud et clé créés par l'utilisateur, `GEMINI_API_KEY` dans le `.env` local (jamais dans le dépôt) | Utilisateur |
| 2026-10-24 | Horaires et benchmark | Outils `getPlaySchedule` (calendrier d'activité, heure de Paris) et `getPlayerBenchmark` (classement inter-clans, piste 4a) ; couverture des pages notée dans la fiche — les pages sans outil (carrière, style de jeu, villes, fin de zone, awards…) s'ajoutent à la demande | Utilisateur |
| 2026-10-24 | Questions fréquentes | Regroupement par mots-clés avec tolérance (Jaccard ≥ 0,6) au lieu du texte exact — « qui pose un problème » et « qui posent problème » faisaient deux lignes ; liste paginée par 10 | Utilisateur |
| 2026-10-24 | Lexique | Six lignes de jargon dans le prompt système (§6 : loot / stuff / sac, drop, knock, wipe, smokes, nades, M4 / Beryl / Kar / Mini, snipe / pompe, chicken / Top 1, soirée, map), traduites vers le bon outil sans demander de précision — pas de dictionnaire long, qui coûterait des tokens à chaque question | Analyse externe, validée par l'utilisateur |
| 2026-10-24 | Cartes | Outil `getMapPerformance` (§5.2) pour la page « Cartes » ; panoplie bornée à 11 outils pour éviter la fatigue de sélection du modèle | Analyse externe, validée par l'utilisateur |
| 2026-10-24 | Loot | « Mon loot » = les objets consommés et lancés (soins, boosts, grenades), pas les largages : outil `getItemUsage` (§5.2) et vocabulaire dans le prompt ; le site ne connaît pas le contenu du sac et l'outil le dit | Utilisateur |
| 2026-10-24 | Tournois | Deux outils **publics** (`getTournaments`, `getTournamentResults`, §5.2) et le contexte `/tournaments/[id]` : les tournois sont des pages publiques, le clan du joueur ne sert qu'à le situer ; demandé après l'essai connecté (« qui a gagné le tournoi ? » refusé) | Utilisateur |

**Propositions confirmées le 2026-10-24** (elles ont valeur de décision) :

| # | Sujet | Proposition | Lot |
|---|---|---|---|
| P1 | Déclencheur | Bouton « Coach IA » dans l'en-tête (comme la maquette) + entrée de la palette `Ctrl+K` + bouton contextuel du débriefing. Pas de bouton flottant (il tomberait sur les toasts `fixed bottom-4 right-6`), pas de `Ctrl+J` (téléchargements du navigateur) | 5 |
| P2 | Tiroir : pousser ou recouvrir | Recouvre la page sous 1 600 px de large (le replay garde sa largeur), la pousse au-delà ; à valider sur le débriefing | 5 |
| P3 | Conservation des fils | 12 mois, purgés par la maintenance de 01:15 (qui purge déjà le journal des actions au-delà de 12 mois) | 1 |
| P4 | Ouverture | Interrupteur général seul en V1 (pas de réglage par clan) | 1 |
| P5 | Joueur qui change de clan | Ses fils restent à son compte ; les outils ne lisent que son clan actuel | 3 |
| P6 | Taux de change | Réglage `1 $ = 0,86 €`, corrigé par le SuperUser | 1 |
| P7 | Icône du Coach | **Bouclier** (Lucide `shield`, choix par défaut de la maquette) plutôt que radar ; section 44 de la charte mise à jour | 5 |

---

## 1. Accès

| Profil | Accès |
|---|---|
| Visiteur (et mode visiteur du site) | **Aucun appel au modèle.** Teaser : tiroir aux réponses floutées et carte « Exclusivité membres » (§8.6) |
| Compte connecté, membre actif d'un clan | Coach complet, données de **son** clan, quota et budget (§2) |
| SuperUser | Sans quota ni budget, même sans membre actif ; page d'administration (§9) |

Raisons du verrou : chaque question coûte un appel payant et des lectures de télémétrie ; ouvert aux visiteurs, le
Coach serait une cible de spam et un ChatGPT gratuit.

**Garde serveur :** `requireClanAccess(request, clanId, 'member')` (`src/lib/auth/admin-guards.ts`) — membre **actif**
du clan de l'adresse, SuperUser admis même sans membre, 401 sans session et 403 sinon, **jamais ouverte par le mode
visiteur**. Aucun contrôle écrit à la main.

---

## 2. Budget et quotas

### 2.1 Règles

| Règle | Valeur par défaut | Portée |
|---|---|---|
| Budget mensuel | **2 €** | par **compte** (`UserAccount`), mois calendaire de Paris |
| Limite horaire | 20 questions | par compte, **fenêtre glissante** d'une heure |
| Anti-rafale | 1 question toutes les 4 s | par compte, contrôlé **côté serveur** |
| Longueur d'une question | 400 caractères | — |
| Historique envoyé au modèle | 10 derniers messages du fil | — |
| Tours d'appels d'outils | 4 au plus par question | — |
| Plafond global du mois | 50 € | tout le site ; atteint → Coach fermé jusqu'au 1er du mois |
| Interrupteur général | ouvert / fermé | coupe le Coach sans redéploiement |

- **Par compte, pas par membre :** une session change de membre actif (`/api/auth/switch-member`) ; un quota par membre
  se multiplierait par le nombre de membres liés au compte.
- **Réservation :** la question est inscrite (`CoachUsage`, statut `pending`) **avant** l'appel au modèle, puis
  complétée (tokens, coût, statut). Un onglet fermé pendant la réponse ne rend pas la question gratuite.
- **Erreur du fournisseur :** la question ne compte pas dans la limite horaire ; son coût éventuel compte au budget.
- **Supprimer un fil ne rend rien** : le décompte lit `CoachUsage`, qui survit aux fils.
- **Ordre des refus** (`decideCoachQuota`, `src/lib/coach/coach-quota.ts`) : clé d'API absente (ferme tout, SuperUser
  compris) → Coach fermé par le SuperUser (les membres seulement : le SuperUser passe, pour la soirée de test du
  lot 9) → plafond global → rafale → limite horaire → budget du compte. Un budget à **0 €** ne laisse passer aucune
  question. Le SuperUser n'a ni limite ni budget, mais ses questions sont comptées dans le coût du mois.

### 2.2 Ce que voit le joueur

- Pastille de l'en-tête : questions restantes **de l'heure** (« 14 / 20 », maquette).
- À partir de 80 % du budget du mois : la pastille passe en `--game-warn` et affiche « Budget du mois : 82 % ».
  Jamais de montant en euros côté joueur.
- Limite horaire atteinte : saisie désactivée, « Prochaine question à 22:14 ». Budget du mois épuisé : « Ton budget
  de questions revient le 1er novembre ». Coach fermé : « Le Coach IA est en pause ».

### 2.3 Ordre de grandeur (mesuré le 2026-10-24, §3.4)

Mesure de l'essai du lot 0 (`scripts/coach-model-probe.ts`, outils bouchons, une question = un tour d'outil) :
**≈ 1 400 tokens en entrée et 150 à 250 en sortie** par question, réflexion nulle sur les Flash-Lite. Les vrais outils
renverront plus de données et l'historique s'ajoutera : hypothèse de production **5 000 en entrée, 300 en sortie**
(à remesurer au lot 9). 2 € ≈ 2,33 $ au taux de 0,86.

| Modèle | Entrée $ / M | Sortie $ / M | Mesuré / question (essai) | Estimé en production | Questions pour 2 € |
|---|---|---|---|---|---|
| `gemini-2.5-flash-lite` | 0,10 | 0,40 | **404** — plus ouvert aux nouveaux comptes | — | — |
| `gemini-3.1-flash-lite` | 0,25 | 1,50 | 0,0007 $ | 0,0017 $ | ≈ 1 370 — **écarté** (chiffres inventés hors outil, §3.4) |
| **`gemini-3.5-flash-lite`** (défaut) | 0,30 | 2,50 | 0,0008 $ | 0,0023 $ | **≈ 1 000** |
| `gemini-3.8-flash` (jusqu'au 31/12/2026) | 0,75 | 3,75 | 0,0035 $ (réflexion ≈ 1 100 tokens) | 0,009 $ | ≈ 260 |
| `gemini-3.6` / `3.8-flash` à partir du 1er janvier 2027 | 1,50 | 7,50 | — | 0,018 $ | ≈ 130 |

Mesure du lot 3 avec les **vrais outils** (`scripts/coach-tools-probe.ts`, clan 3) : un résultat d'outil pèse 100 à
700 tokens ; une question à deux tours d'outils ≈ 3 000 à 4 000 tokens en entrée — l'hypothèse de 5 000 tient.

Un joueur assidu (30 questions par soirée, 8 soirées par mois) consomme environ **0,50 €** avec le modèle par défaut :
les 2 € sont un **plafond de sécurité**. Aujourd'hui **22 comptes** peuvent utiliser le Coach (relevé du 2026-10-24 :
22 comptes, 632 membres actifs dont 583 ont joué sur 30 jours) — pire cas théorique 44 € par mois, d'où le plafond
global à 50 €.

---

## 3. Fournisseur et modèles

### 3.1 Relevé des modèles Gemini (2026-10-24)

Source : pages officielles `ai.google.dev/gemini-api/docs/pricing`, `/models`, `/deprecations`, `/thinking`, lues le
2026-10-24 (prix des 2.5 et de 3-flash-preview lus sur un résumé, à recontrôler). **Prix de sortie = réflexion
comprise.**

| Identifiant | Statut | Entrée $ / M | Sortie $ / M | Arrêt annoncé |
|---|---|---|---|---|
| `gemini-3.1-flash-lite` | stable | 0,25 | 1,50 | **au plus tôt le 7 mai 2027** |
| `gemini-3.5-flash-lite` | stable, recommandé par Google pour un nouveau projet | 0,30 | 2,50 | aucun |
| `gemini-3.6-flash` | stable | 0,75 → 1,50 au 01/01/2027 | 3,75 → 7,50 | aucun |
| `gemini-3.8-flash` | stable, recommandé | 0,75 → 1,50 au 01/01/2027 | 3,75 → 7,50 | aucun |
| `gemini-2.5-flash-lite` | **indisponible** : 404 « no longer available to new users » (essai du 2026-10-24) | 0,10 | 0,40 | aucun |
| `gemini-2.5-flash` | accès limité (même famille, non essayé) | 0,30 | 2,50 | aucun |

- Aucune page ne liste les appels d'outils modèle par modèle : **l'essai du lot 0 (§3.4) a tranché** pour
  `3.5-flash-lite`.
- Réflexion : `thinkingLevel` au plus bas disponible — `minimal` sur les Flash-Lite (réflexion mesurée à 0 token) ;
  **refusé (400) par `3.8-flash`**, qui prend `low`. La réflexion compte dans `maxOutputTokens` : à 1 024, la réponse
  de `3.8-flash` a été coupée (`MAX_TOKENS`) → 4 096 pour les Flash.
- **Niveau payant obligatoire** (projet Google Cloud avec facturation) : au niveau gratuit et dans AI Studio, Google
  utilise les questions et réponses pour améliorer ses produits, relecture humaine comprise. Plafond de dépense
  également posé côté Google.

### 3.2 Catalogue et choix dans l'administration

- Catalogue dans le code (`src/lib/coach/coach-models.ts`, pur) : identifiant, libellé, fournisseur, prix d'entrée et
  de sortie, **changements de prix datés** (1er janvier 2027 pour les Flash), statut (recommandé, accès limité), date
  d'arrêt au plus tôt, **réglage de réflexion** (`thinkingLevel` : `minimal` pour les Flash-Lite, `low` pour les Flash)
  et `maxOutputTokens` (1 024 pour les Flash-Lite, 4 096 pour les Flash, réflexion comprise). Une ligne par modèle
  proposé ; ajouter un modèle = une ligne + un déploiement. **V1 :** `gemini-3.5-flash-lite` (défaut),
  `gemini-3.1-flash-lite`, `gemini-3.8-flash`, `gemini-3.6-flash` ; les 2.5 ne sont pas proposés (404).
- Le SuperUser choisit le modèle actif dans cette liste (§9) ; le choix vit dans `AppConfig` (`coach_model`).
  Bouton « Tester » : une question type avec un outil, avant de basculer.
- Alerte au salon d'administration 30 jours avant la date d'arrêt du modèle actif, et au premier changement de prix
  (entrées de `src/lib/admin-alerts/catalog.ts`).

### 3.3 Intégration

- **API REST appelée directement** (`fetch`, `streamGenerateContent?alt=sse`), **côté serveur seulement** ; clé
  `GEMINI_API_KEY` dans `.env` (jamais `NEXT_PUBLIC_`). Sans clé, le Coach est fermé (pas de plantage). Décision du
  2026-10-24, lot 3 : le flux et les appels d'outils ont été éprouvés en REST à l'essai du lot 0 ; pas de SDK
  (`@google/genai` ou Vercel AI SDK) en V1 — une dépendance de moins, et le flux arrive tel que le serveur le relaie.
- Derrière une interface interne `CoachModelProvider` (`streamAnswer({ model, system, history, question, tools,
  runTool, maxToolRounds, signal, onDelta })`, `src/lib/coach/coach-provider.ts`) : changer de modèle Gemini = changer
  d'identifiant ; un autre fournisseur plus tard = un nouvel adaptateur, sans toucher aux outils ni aux routes.
  Adaptateur : `coach-provider-gemini.ts` (niveau de réflexion du catalogue, repli sans réglage sur 400, parts du
  modèle réexpédiées telles quelles entre deux tours, délai de 30 s par tour, abandon par le `signal` du client).

### 3.4 Essai du lot 0 (2026-10-24)

`npx tsx scripts/coach-model-probe.ts` — API REST sans SDK, flux SSE, cinq outils **bouchons** (chiffres inventés,
clan [47R]), prompt système du §6, quatre questions : débriefing (Q1), armes (Q2), adversaire (Q3), hors sujet
« écris-moi une fonction Python » (Q4). Deux passes (`--out`, fichiers `coach-probe-1.json` et `coach-probe-2.json` du
scratchpad de la session). `--list` montre les modèles ouverts à la clé (14 Gemini 2.5 / 3, dont `2.5-flash-lite`,
qui refuse pourtant à l'appel).

| Modèle | Outils | Flux | Français | Q4 hors sujet | Tokens / question | Coût / question | Délai |
|---|---|---|---|---|---|---|---|
| `gemini-2.5-flash-lite` | — | — | — | — | — | — | **404** « no longer available to new users » |
| `gemini-3.1-flash-lite` | appelés à chaque fois, bons arguments | 10 à 15 blocs | « vous » fréquent (à l'escouade), titres `###` | **refuse puis invente une analyse chiffrée** (420 dégâts, 28:15, 85 %…) — **2 fois sur 2**, sans outil | 1 400 entrée · 230 sortie · 0 réflexion | 0,0007 $ | 1er mot 0,6 à 1,0 s, total 1,4 à 2,5 s |
| **`gemini-3.5-flash-lite`** | appelés à chaque fois, bons arguments | 9 à 11 blocs | tutoiement, « vous » seulement à l'escouade, tous les chiffres issus de l'outil | refus en une phrase, **aucun chiffre** (2 / 2) | 1 400 entrée · 150 sortie · 0 réflexion | 0,0008 $ | 1er mot 0,6 à 1,0 s, total 1,1 à 2,7 s |
| `gemini-3.8-flash` | appelés | oui | bon | refus propre | 1 300 entrée · 80 sortie · **1 100 réflexion** | 0,0035 $ | 1er mot 3 à 3,5 s, total 3 à 12 s |

Enseignements :
- **`3.5-flash-lite` par défaut** : seul modèle sans invention sur quatre questions et deux passes, le moins verbeux ;
  18 % plus cher que `3.1` en relatif, négligeable en absolu.
- `3.1-flash-lite` reste au catalogue en secours, jamais par défaut ; son arrêt est possible dès mai 2027.
- `3.8-flash` : `thinkingLevel: minimal` refusé (400) ; avec sa réflexion par défaut, **la réponse Q1 a été coupée**
  (`MAX_TOKENS` à 1 024, la réflexion compte dans `maxOutputTokens`). Pour les Flash : `low` et 4 096.
- Le flux SSE arrive par morceaux (9 à 15 par réponse) : le mot à mot du tiroir est réaliste.
- Entre deux tours, les parts de réponse du modèle sont renvoyées telles quelles (signature de réflexion comprise) :
  les Gemini 3 l'exigent.
- Le prompt « refuse et ramène au jeu » a suffi à faire inventer une analyse à `3.1` : la consigne hors sujet
  interdit désormais tout chiffre (§6), et un garde-fou serveur marque les réponses chiffrées sans outil.
- Coût réel de l'essai : 0,012 $ pour 18 questions.

---

## 4. Données

### 4.1 Modèle Prisma

```prisma
/// Fil du Coach IA. Appartient à un compte : seul ce compte (et le SuperUser) le lit.
model CoachConversation {
  id        Int           @id @default(autoincrement())
  userId    Int
  memberId  Int?          // membre actif à la création ; null pour un SuperUser sans membre
  clanId    Int?          // clan du contexte à la création — figé
  title     String        @db.VarChar(120) // tiré de la première question
  contextLabel String?    @db.VarChar(120) // « Erangel · 22 oct. 21:47 · Top 3 » : contexte de la première question (liste des fils)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  user      UserAccount   @relation(fields: [userId], references: [id], onDelete: Cascade)
  member    ClanMember?   @relation(fields: [memberId], references: [id], onDelete: SetNull)
  clan      Clan?         @relation(fields: [clanId], references: [id], onDelete: SetNull)
  messages  CoachMessage[]

  @@index([userId, updatedAt])
  @@index([memberId])
  @@index([clanId])
}

model CoachMessage {
  id             Int       @id @default(autoincrement())
  conversationId Int
  role           String    @db.VarChar(16)  // "user" | "assistant" — le prompt système n'est pas stocké
  content        String    @db.Text
  contextPath    String?   @db.VarChar(191) // page d'où part la question, après validation (§7.2)
  toolCalls      Json?                      // outils appelés et leurs paramètres (audit) ; null = réponse sans outil
  unverified     Boolean   @default(false)  // chiffres dans la réponse sans appel d'outil (§6)
  feedbackScore  Int?                       // +1 Utile · -1 Inexact
  feedbackNote   String?   @db.VarChar(280) // précision facultative d'un « Inexact »
  reviewedAt     DateTime?                  // vote « Inexact » relu par le SuperUser
  createdAt      DateTime  @default(now())
  conversation   CoachConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@index([feedbackScore, reviewedAt])
}

/// Une ligne par question facturée : quota glissant, budget du compte, coût du mois. Survit à la suppression d'un fil.
model CoachUsage {
  id             Int      @id @default(autoincrement())
  userId         Int
  clanId         Int?
  conversationId Int?
  model          String   @db.VarChar(64)
  status         String   @db.VarChar(16) // "pending" | "ok" | "error" | "aborted" | "refused"
  tokensIn       Int      @default(0)
  tokensOut      Int      @default(0)     // réflexion comprise
  costMicroUsd   Int      @default(0)
  createdAt      DateTime @default(now())

  @@index([userId, createdAt])
  @@index([createdAt])
}
```

Pourquoi pas le modèle d'origine (`AiConversation` / `AiMessage` / `AiUsageQuota`) : une ligne par membre avec
`count` + `windowEnd` est une fenêtre **fixe** ; `memberId` obligatoire excluait le SuperUser ; et la cascade sur
`ClanMember` ne se déclenche jamais (un membre est archivé, pas supprimé ; son `clanId` est nullable et change).

### 4.2 Réglages (`AppConfig`)

Sur le modèle de `pubg_api_rate_limit_rpm` (`src/lib/pubg-rate-limit-config-service.ts`) : valeur en base, page
d'administration, repli sur la variable d'environnement puis sur la valeur par défaut.

`coach_enabled` (**faux par défaut** : le SuperUser ouvre) · `coach_model` · `coach_budget_per_account_eur` (2) ·
`coach_global_budget_eur` (50) · `coach_usd_eur_rate` (0,86) · `coach_hourly_limit` (20) · `coach_min_interval_seconds`
(4) · `coach_max_input_chars` (400) · `coach_history_messages` (10) · `coach_max_tool_rounds` (4). Le plafond de sortie
et le niveau de réflexion viennent du catalogue, par modèle (§3.2). Module : `src/lib/coach/coach-config.ts`
(`getCoachSettings`, `setCoachSettings`, `sanitizeCoachSettingsPatch`, bornes `COACH_SETTING_BOUNDS`).

Variables d'environnement : `GEMINI_API_KEY` (obligatoire, lue par `hasCoachApiKey()` seulement), `COACH_MODEL`
(repli). Une ligne chacune dans le tableau « Environment Variables » de CLAUDE.md et dans `.env.example` ; état
affiché dans `/settings/configuration` (section « Coach IA »).

### 4.3 Conservation et effacement

- Fils et messages : 12 mois après leur dernière activité (P3), puis suppression par la maintenance de 01:15.
  `CoachUsage` : 13 mois (comparaison d'un mois sur l'autre).
- Le joueur supprime un fil lui-même. La demande « Purger mon historique » (`purge`,
  `src/lib/legal/privacy-request.ts`) supprime ses fils, messages et lignes d'usage.
- Aucune adresse e-mail dans les tables `Coach*`.

---

## 5. Outils du Coach

### 5.1 Cas d'usage

| Domaine | Question type | Sources réelles |
|---|---|---|
| Débriefing d'un match | « Pourquoi on s'est fait wipe sur la dernière partie d'Erangel ? » | `debrief-view.ts` (phases, distances, survie), `KillEvent`, colonnes `*Gz` de `SquadMatchTelemetry` par `decodeTelemetryRow` |
| Performance individuelle | « Je suis meilleur au Beryl ou au M416 ? » | `MemberWeaponStats`, catégories de `src/lib/weapons/weapon-categories.ts` |
| Dynamique d'escouade | « Quelle est notre meilleure composition à 4 ? » | `SquadMatch`, `ClanSynergyTelemetryStats` |
| Adversaires | « Notre bilan face à [VPR] ? » | `Player`, `ClanEncounter` — **jamais `EncounteredPlayer`** (en cours de retrait) |
| Largage | « Survie à Pecado contre Chumacera ? » | `DropPressureStat`, `landingSamplesGz` (`LogParachuteLanding` est un évènement PUBG, pas une table) |

### 5.2 Outils de la V1

1. `getRecentMatches({ limit?, mapName? })` — parties récentes du clan (10 au plus), soirée par `sessionDateOf`, état de
   la télémétrie.
2. `getMatchDebrief({ matchId })` — `loadMatchDebriefPayload` (même source que la page) : en-tête, phases, escouade
   (kills, dégâts, mises à terre, dégâts subis), 60 événements de l'escouade au plus à l'horloge du replay, clans
   adverses rencontrés ; télémétrie non analysée = dit tel quel.
3. `getWeaponStats({ playerName?, weaponCategory?, period? })` — `MemberWeaponStats` (`all-time` ou mois en cours) +
   `aggregateMemberWeapons`, 8 armes au plus ; un autre joueur n'est cherché que dans le clan.
4. `getOpponentRecord({ clanTag })` — `OpponentClan` → ses joueurs (200 au plus) → `KillEvent` du clan : kills
   échangés, matchs avec combat, tueurs et armes adverses, dernière rencontre (`ClanEncounter`).
5. `getDropZones({ mapName })` — `DropPressureStat` des 90 derniers jours (une ligne par partie), ville par
   `locationForPercent`, pression, placement moyen, Top 10 et Top 1 par ville.
6. `getClanLeaderboard({ period?, sortBy? })` — `PlayerStats` de la période (`statsPeriodKeys`, agrégats de 03:00) :
   15 membres au plus, le joueur situé, sans identifiant. Ajouté le 2026-10-24 après l'essai connecté : « quels
   membres freinent le clan en ligue ? » restait sans réponse.
7. `getLeagueStanding({ period? })` — `getClanLeague` (même calcul que la page Ligue) : rang, Power score, rang
   précédent, clans voisins, moyennes de la ligue, ou parties manquantes pour être classé.

8. `getTournaments({ status?, search?, limit? })` — `listTournamentOverviews` (cache 5 min) : tournois publiés du site,
   vainqueur ou leader, podium, place du clan quand elle est connue. Ajouté le 2026-10-24 après l'essai connecté :
   sur la page d'un tournoi, « qui a gagné le tournoi ? » était refusé (« tournoi extérieur »).
9. `getTournamentResults({ tournamentId })` — même moteur que la page du tournoi (`computeTournamentModeStandings`,
   `buildRoundViews`, `pickMvp`) : barème, classement (20 lignes + celle du clan), manches avec podium et score du
   clan, MVP. Tournois = pages **publiques**, quel que soit l'organisateur ; un brouillon reste invisible. Contexte
   `/tournaments/[id]` reconnu (étiquette « Tournoi · titre », suggestions selon la phase).
10. `getItemUsage({ playerName?, period? })` — `loadItemUseStats` (page « Objets consommés », famille `None` exclue)
    + `MemberThrowableStat` : soins, boosts, carburant, gadgets par famille et par objet, par partie, comparé au clan
    (moyenne par joueur et par partie, rang, plus gros consommateur) ; grenades lancées. Ajouté le 2026-10-24 après
    l'essai connecté : « et mon loot ? » déclenchait `getDropZones` — le prompt nomme désormais « loot » et « sac ».
    Contexte `/members/[id]/items` reconnu.
11. `getMapPerformance({ period?, matchType?, mapName? })` — `loadClanMapStats` (page « Cartes », docs/features/cartes-clan.md) :
    verdict (carte forte, à travailler, la plus jouée) et chaque carte avec écart aux clans, tendance et joueur phare.
    Ajouté le 2026-10-24 sur la recommandation d'une analyse externe (seule page de données sans outil : « quelle est
    notre pire carte ? » n'avait que `getRecentMatches`, borné à 10 parties). Contexte `/clans/[id]/stats/maps` reconnu.
    La panoplie reste serrée : « Style de jeu » (rôles, synergies) n'a pas d'outil, à juger à l'usage.
12. `getPlaySchedule({ playerName?, scope?, period? })` — le calendrier d'activité (`Match` du joueur, `SquadMatch` du
    clan), heure de Paris, soirée dès 06:00 : parties et Top 1 par jour, créneaux favoris, plage habituelle semaine /
    week-end, soirées, temps de jeu. Ajouté le 2026-10-24 : « mon horaire de jeu en semaine ? » restait sans réponse.
    Contexte `/members/[id]/heatmap` reconnu.
13. `getPlayerBenchmark({ playerName?, period?, mode? })` — « Où je me situe ? » (piste 4a de coach-ia-pistes.md) :
    classement inter-clans `/players` (`getPlayersRanking`) — rang et part des joueurs dépassés par critère, joueur
    juste devant, rang précédent, scores de rôle (centiles entre clans). Contexte `/players` reconnu.

Module : `src/lib/coach/coach-tools.ts` (`createCoachTools({ clanId, memberId, memberName })`), tests
`coach-tools.test.ts`. Mesure sur la vraie base : `npx tsx scripts/coach-tools-probe.ts` (lecture seule).

### 5.3 Règles

- **Le modèle ne choisit jamais le clan ni le compte.** `clanId`, le membre et les droits sont liés par le serveur
  **dans la fermeture** de chaque outil ; le modèle ne passe que des filtres. Un `matchId` est accepté seulement s'il
  appartient au clan.
- **Mêmes services que les pages** : le Coach ne contredit pas l'écran.
- **Budget de lecture** : chaque outil se borne (nombre de parties, période). Jamais le bilan complet de télémétrie
  (~9 s), jamais un parcours des blobs de toutes les parties du clan.
- Une partie dont la télémétrie n'est pas encore analysée renvoie ce statut : le Coach répond « télémétrie pas encore
  analysée », pas « je n'ai pas ce match ».
- Résultats d'outils **sans donnée d'authentification** (ni e-mail, ni identifiant de compte).

---

## 6. Persona et prompt système

- Coach e-sport PUBG francophone : tactique, direct, précis, encourageant.
- **Tutoiement** au joueur ; « vous » seulement pour l'escouade (seule exception de `src/lib/tutoiement.test.ts`).
  Vocabulaire du site : Dégâts, Victoires / Top 1, Win rate, K/M, Temps, « Power score », « Ligue des clans ».
- Format : un titre court, 3 à 5 puces, chiffres en gras, une recommandation finale ; tableaux Markdown courts.
  Horloge au format du replay (« 18:42 »).
- **Anti-hallucination :** tout chiffre vient d'un outil. Sans donnée, le Coach le dit.
- **Hors sujet** (devoirs, code, autre jeu) : refus en une phrase et **une question possible, sans aucun chiffre** —
  « refuse et ramène au jeu » seul a fait inventer une analyse complète à `3.1-flash-lite` (§3.4).
- **Garde-fou serveur :** une réponse qui contient des chiffres alors qu'aucun outil n'a été appelé dans le tour est
  marquée `unverified` (`CoachMessage.toolCalls` vide + chiffres) ; le tiroir l'affiche sous un bandeau « Chiffres non
  vérifiés par les données » et elle remonte dans l'onglet Questions du SuperUser.
- **Données ≠ consignes :** pseudos et noms de clan renvoyés par les outils sont saisis par des tiers ; le prompt
  système les traite comme du texte.

---

## 7. Routes API

### 7.1 Liste

| Route | Garde | Rôle |
|---|---|---|
| `POST /api/clans/[clanId]/coach/chat` | `requireClanAccess(…, 'member')` + quota | Question → flux SSE |
| `GET /api/coach/conversations` | session, fils du compte | Liste des fils |
| `GET · PATCH · DELETE /api/coach/conversations/[id]` | propriétaire ou SuperUser | Lire, renommer, supprimer |
| `POST /api/coach/messages/[id]/feedback` | propriétaire | Utile / Inexact (+ précision) |
| `GET /api/coach/quota` | session | Restant de l'heure, % du mois, état du Coach |
| `GET · PUT /api/settings/coach` | `requirePlatformAdmin`, PUT par `withAdminActionLog` | Réglages et modèle |
| `POST /api/settings/coach/test-model` | idem, `withAdminActionLog` | Essai d'un modèle |
| `GET /api/settings/coach/usage` · `/questions` | `requirePlatformAdmin` | Consommation, questions, votes |
| `POST /api/settings/coach/questions/[id]/reviewed` | idem, `withAdminActionLog` | Vote relu |

Conventions Next 16 : `await params`, `Response.json()`, jamais `NextResponse`. Les fils sont des **données
personnelles** : propriétaire (lecture aussi pour le SuperUser), la condition de propriété est dans la requête
(`coach-conversation-service.ts`) ; un fil ou une réponse qui n'est pas au compte répond **404, pas 403** — son
existence n'est pas révélée. Jamais `requireSameClanAsMember`.

### 7.2 `POST /api/clans/[clanId]/coach/chat`

Entrée : `{ "conversationId": 42 | null, "contextPath": "/clans/292/telemetry/matches/<uuid>/debrief", "message": "…" }`.

1. Garde → 401 / 403. Coach fermé ou clé absente → 503 `{ error: 'coach_paused' }`.
2. Validation (zod) : longueur, fil appartenant au compte.
3. Quota et budget → 429 `{ error: 'hourly_limit' | 'monthly_budget' | 'too_fast', retryAt }`.
4. `contextPath` reconnu par motif (`parseCoachContextPath`, pur) puis **vérifié** par `resolveCoachContext`
   (`coach-context-service.ts` : le match compte un membre du clan, le joueur en est membre, le clan de l'adresse est
   celui de la session) ; sinon « sans contexte ». Le contexte donne l'étiquette du bandeau, les trois suggestions et
   le bloc du prompt (`coach-context.ts`).
5. Réservation `CoachUsage` (`pending`), message utilisateur enregistré.
6. Appel au modèle, outils, flux ; message du Coach enregistré à la fin, **même interrompu** (`aborted`).

Flux (`text/event-stream`, lu par `fetch` + lecteur de flux — `EventSource` ne fait pas de POST) :
`event: tool` (« Je consulte tes parties… »), `event: delta` (texte), `event: done` (`messageId`, restant),
`event: error` (code).

**Premier flux SSE du site :** Nginx bufferise par défaut (`docs/ops/deployment.md`, bloc `location /`) → en-têtes
`X-Accel-Buffering: no` et `Cache-Control: no-cache, no-transform` ; vérifier sur le **build** que la compression de
Next ne retient pas le flux. `request.signal` interrompt l'appel au modèle à la fermeture du tiroir.

---

## 8. Interface

Charte : [docs/ui/index.html#coach-ia](../ui/index.html#coach-ia). Règles du site : jetons `--theme-ui-*` et
`--game-*` (jamais d'hex en dur), conteneur `.charte` (accent jaune PUBG `#f2a900`, pas l'ambre de la maquette),
**thème clair et sombre**, rayons 6 · 8 · 10 · 14 · pilule, texte ≥ 11 px, Teko pour les titres et chiffres héros,
un seul bouton rempli par écran (Envoyer), tiroir en 220 ms `cubic-bezier(.22,1,.36,1)`, `prefers-reduced-motion`
respecté, hauteur du header inchangée, aucun `localStorage` lu au premier rendu (CLAUDE.md §13).

### 8.1 Déclencheurs (P1)

- Bouton « Coach IA » dans l'en-tête du shell, à droite ; teinté quand le tiroir est ouvert. **Masqué sous 640 px**
  (il passerait à la ligne et grandirait le header) : sur mobile, le Coach s'ouvre par l'entrée « Coach IA » du menu
  (page plein écran) et par les boutons contextuels.
- Entrée « Coach IA » de la palette `Ctrl+K` (`GlobalCommandPalette`).
- Bouton contextuel « Débriefer ce match avec le Coach » à côté des onglets du débriefing (`CoachContextButton`).
- Le tiroir est monté à sa première ouverture puis gardé caché : fermer et rouvrir retrouve le fil en cours.

### 8.2 Tiroir desktop (maquette 1a)

440 px à droite, pleine hauteur sous le header. En-tête : tuile d'icône (bouclier, P7), « COACH IA » en Teko, tag du clan
(`ClanTag`), pastille « En ligne », pastille de quota, boutons Fils · Agrandir · Fermer. Bandeau de contexte
détachable : « Erangel · 22 oct. 21:47 · Top 3 » (un match n'a **pas de numéro** : identifiant PUBG). Fil : accueil et
3 suggestions selon la page, bulles, réponse structurée, actions Utile · Inexact · Copier. Saisie : 400 caractères,
compteur, Entrée pour envoyer, Maj + Entrée pour aller à la ligne, mention « Coach IA expérimental · Données de l'API
PUBG » (≥ 11 px). Contexte lu par `usePathname()`.

### 8.3 Plein écran `/clans/[clanId]/coach` (maquette 1b + compléments)

Fil centré sur 760 px et **liste des fils** à gauche (« Nouveau fil », groupes par date, renommer, supprimer) —
dessinée (§11.5, écran A ; dans le tiroir et sur mobile, écran B). Entrée `CLAN_PAGES` en `noindex` (`src/lib/seo/page-seo.ts`), entrée de menu dans
`PERSONAL_NAV_KEYS` (`src/lib/nav-permissions-registry.ts`).

### 8.4 Mobile < 768 px (maquettes 2a, 2b)

Panneau montant à 85 % de la hauteur, poignée, en-tête compacté, cibles de 44 px, saisie collée au-dessus du clavier
(`visualViewport`), fermeture par glissement ou ✕. Aucun défilement horizontal.

### 8.5 États (dessinés, §11.5 — écrans C à K)

Réponse en cours (indicateur d'outil, texte qui arrive, bouton Arrêter) · erreur du modèle (Réessayer) · limite
horaire atteinte · budget du mois à 80 % puis épuisé · Coach en pause · page sans contexte · télémétrie pas encore
analysée · nouveau fil vide · vote enregistré (+ précision d'un « Inexact ») · contexte détaché · texte copié.

### 8.6 Teaser visiteur (maquettes 3a, 3b)

Depuis une page avec shell en mode visiteur : tiroir « Réservé aux membres », messages d'exemple floutés
(`aria-hidden`), carte « Exclusivité membres · Débloque ton Coach IA » avec « Inscrire mon clan avec mon pseudo PUBG »
(`/join`) et « Se connecter » (`/login`). **Aucun appel au modèle**, saisie désactivée. Le texte ne promet pas un accès
immédiat : une inscription attend la décision du SuperUser puis l'activation du compte
(docs/features/inscription-clan.md §1).

### 8.7 Vitrine `/`

- Carte `PhotoPointsCard` de `HomeShowcase.tsx` : eyebrow « Coach IA », tampon « Exclusivité membres » (nouvelle prop,
  le seul tampon actuel étant `isNew`), titre « Ton Coach IA » / accent « disponible 24/7 », trois points (débriefing
  immédiat, armes, adversaires), lien « Rejoindre un clan pour débloquer le Coach → » vers `/join`, image
  `public/vitrine-coach-ia.jpg`. Rangée par paires : la carte fait rangée avec une autre ou prend toute la largeur.
- La vitrine est plein écran **sans shell** : pas de tiroir ; un éventuel extrait de conversation y est figé, marqué
  « Exemple », pseudos fictifs (jamais un joueur extérieur au site, docs/features/accueil.md).
- **La carte sort avec le Coach**, pas avant.

---

## 9. Page SuperUser `/settings/coach`

`<AdminAccessGate>` dans le `layout.tsx` de son dossier, bandeau `AdminPageBanner`, entrée du menu Plateforme,
routes `requirePlatformAdmin`, écritures enveloppées par `withAdminActionLog`. Trois onglets :

1. **Réglages** — interrupteur général ; **liste des modèles** en tuiles radio (pas de `<select>` natif) : libellé,
   identifiant, prix d'entrée et de sortie, coût estimé par question, statut (recommandé, accès limité, arrêt au plus
   tôt le …, prix qui change le …), bouton « Tester » (résultat sous la tuile : durée, appel d'outil réussi, ou cause
   de l'échec — ex. accès limité) ; budget par compte (2,00 €), plafond global (50 €), taux
   $ → €, limite horaire, anti-rafale, longueur, historique, tours d'outils, tokens de sortie.
2. **Consommation** — mois en cours : coût, questions, comptes actifs, coût moyen par question, jauge du plafond
   global ; par modèle ; comptes au-delà de 80 % de leur budget ; erreurs du fournisseur.
3. **Questions** — questions fréquentes sur 30 jours (pseudonymisées : le compte n'est pas affiché, seul le clan ;
   regroupées par **mots-clés** depuis le 2026-10-24 — accents, ponctuation, mots vides, tournures de demande et
   terminaisons ignorés, deux questions à 60 % de mots-clés communs font une ligne ; par sens en V2 si cela ne
   suffit pas), 200 groupes au plus, paginées par 10 ; votes « Inexact » à relire avec la question, la précision du
   joueur, la réponse, les outils appelés, bouton « Relu ».

Alertes (entrées de `src/lib/admin-alerts/catalog.ts`, jamais `sendDiscordWebhook` direct) : plafond global à 80 % et
atteint ; erreurs répétées du fournisseur ; arrêt annoncé ou changement de prix du modèle actif. Boîte « À traiter »
(`src/lib/admin-inbox/build.ts`) : votes « Inexact » non relus.

---

## 10. Conformité

- **`/confidentialite`** : ligne « Questions au Coach IA » — questions et réponses envoyées à Google (Gemini API,
  niveau payant, données non utilisées pour l'entraînement), lieu de traitement et **transfert hors UE** le cas
  échéant, conservation 12 mois, lecture pseudonymisée par le SuperUser pour améliorer le Coach.
- **Mentions légales** : usage d'un modèle d'IA pour les débriefings.
- **AI Act, art. 50** : informer qu'on parle à une IA — applicable à partir du 2 août 2026 (calendrier du règlement,
  vérifier qu'aucun report ne la vise) ; la mention sous la saisie y répond.
- **Marque** : « Données de l'API PUBG », jamais « Données officielles » (contredirait `KRAFTON_DISCLAIMER`,
  `src/lib/legal/legal-info.ts`). Icône du Coach : icône du site, pas d'élément graphique PUBG.
- **Effacement** : §4.3.

---

## 11. Maquettes Claude Design

### 11.1 Accès

Projet « Audit design avec améliorations » (id `24ddb696-76de-4e03-9d41-1d3eaf729f38`). Lecture par Claude in Chrome :
`https://claude.ai/design/p/24ddb696-76de-4e03-9d41-1d3eaf729f38?file=<fichier>&via=share`. L'import par le MCP
`claude_design` ne fonctionne pas depuis l'extension VS Code, et `DesignSync` sert à synchroniser une bibliothèque de
composants, pas à lire une maquette. **Claude Design autonome ferme le 14 décembre 2026** : récupérer les maquettes
utiles avant (export dans `docs/ui/refonte/maquettes/`, ignoré par git).

### 11.2 « Coach IA - Fait » (livrée le 2026-10-24)

Brief : prompt de l'annexe A. Six écrans, tous en thème sombre, tous cliquables :

| # | Écran | Contenu |
|---|---|---|
| 1a | Desktop 1 440 px | Débriefing à gauche, tiroir de 440 px à droite (en-tête, quota 14 / 20, contexte détachable, accueil, 3 suggestions, question, réponse Isolement / Prise en tenaille / Dégâts subis + Recommandation, Utile · Inexact · copier, saisie 144 / 400). Bouton « Coach IA » dans l'en-tête du site |
| 1b | Tiroir agrandi | Fil centré sur 760 px — **sans liste des fils** |
| 2a | Mobile 375 px | Panneau à 85 %, poignée, en-tête compacté |
| 2b | Mobile, clavier ouvert | Saisie au-dessus du clavier |
| 3a | Teaser desktop | Réponses floutées, carte « Exclusivité membres », deux boutons |
| 3b | Teaser mobile | Même carte dans le panneau |

Points remontés par Claude Design : émojis remplacés par des icônes (à garder) ; « Bilan face aux [47R] » vise le
propre clan du joueur (→ un clan adverse, affiché seulement si le match en contient un) ; « Joueur A » (→ pseudo réel) ;
casque dessiné à la main (→ icône du site) ; compteur à 144 (sans objet) ; chiffres d'exemple (jamais repris).

### 11.3 Écarts à corriger à l'implémentation

| Maquette | Implémentation |
|---|---|
| « Match #324 » | « Erangel · 22 oct. 21:47 · Top 3 » |
| « J'ai analysé **votre** match … Que veux-**tu** » | « J'ai analysé le match de ton escouade » |
| « Données officielles PUBG » | « Données de l'API PUBG » |
| « ANALYSE DE LA PHASE 5 (18M42S) » | « Phase 5 · 18:42 », titre en couleur de texte (le jaune est réservé à l'accent) |
| Ambre `#F59E0B`, couleurs en dur | Jetons `--theme-ui-accent*`, `--game-*` |
| Sombre seulement | Clair et sombre |
| Pas de liste des fils, états absents | Compléments §11.4 |

### 11.4 Prompt complémentaire pour Claude Design

**Envoyé et livré le 2026-10-24** → relecture au §11.5. Fichier : « Coach IA - Complements.dc.html » (l'accent a été
refusé par le système de fichiers de Claude Design).

```text
Repars de « Coach IA - Fait.dc.html » et complète-le dans un nouveau fichier « Coach IA - Compléments.dc.html ».
Le produit s'appelle désormais « Coach IA » partout (titre du tiroir compris : « COACH IA »).

Charte à respecter (celle du site, pas celle du premier prompt) :
- accent unique jaune PUBG #F2A900 ; un seul bouton rempli par écran (Envoyer) ; tout état sélectionné est
  « teinté » (fond jaune à 12 %, anneau jaune, texte jaune foncé en clair / jaune clair en sombre) ;
- le jaune ne sert qu'à l'accent : titres des réponses en couleur de texte, pas en jaune ;
- couleurs de jeu : vert = positif / kill, rouge = mort / dégâts subis, orange = mise à terre / alerte,
  bleu ciel = donnée neutre / zone ;
- rayons 6 (badge), 8 (bouton), 10 (tuile, champ), 14 (carte, tiroir), pilule ; texte jamais sous 11 px ;
- Teko pour les titres et les chiffres mis en avant, Inter pour le reste ; icônes Lucide ;
- jamais de <select> natif ni de défilement horizontal ;
- chaque écran en thème CLAIR et en thème SOMBRE.

Corrections sur les écrans existants :
- plus de « Match #324 » : un match n'a pas de numéro. Bandeau de contexte : « Erangel · 22 oct. 21:47 · Top 3 » ;
- tutoiement strict : « Salut NovakTV ! J'ai analysé le match de ton escouade. Que veux-tu décortiquer ? » ;
- titre de réponse « Phase 5 · 18:42 » (format horloge du replay) ;
- suggestion « Bilan face aux [VPR] » (un clan adverse ; [47R] est le clan du joueur) ;
- mention sous la saisie : « Coach IA expérimental · Données de l'API PUBG » ;
- remplace le casque dessiné à la main par une icône Lucide (propose deux options).

Écrans à ajouter (desktop 1440 px et mobile 375 px sauf mention) :
A. Plein écran avec la liste des fils à gauche (280 px) : bouton « Nouveau fil », fils groupés « Aujourd'hui »,
   « Cette semaine », « Plus ancien » ; chaque fil : titre, contexte court (carte · date), heure ; fil actif teinté ;
   menu « … » Renommer / Supprimer (confirmation en modale). Fil centré sur 760 px à droite.
B. Liste des fils dans le tiroir de 440 px (bouton « Fils » de l'en-tête) et dans le panneau mobile.
C. Réponse en cours : ligne « Je consulte tes parties… » avec indicateur, texte qui arrive, bouton « Arrêter ».
D. Erreur du modèle : message court et bouton « Réessayer ».
E. Limite horaire atteinte : pastille « 0 / 20 », saisie désactivée, « Prochaine question à 22:14 ».
F. Budget du mois : pastille orange « Budget du mois : 82 % » ; puis épuisé : « Ton budget de questions revient
   le 1er novembre ».
G. Coach en pause (coupé par l'administrateur) : tiroir lisible, saisie remplacée par « Le Coach IA est en pause ».
H. Page sans contexte (ex. page Membres) : accueil générique et trois suggestions générales
   (« Comment s'est passée notre dernière soirée ? », « Quelle est ma meilleure arme ? », « Où atterrir sur Miramar ? »).
I. Télémétrie pas encore analysée : « La télémétrie de ce match n'est pas encore analysée. Reviens demain matin. »
J. Votes : « Utile » actif teinté ; « Inexact » ouvre un champ facultatif « Qu'est-ce qui est faux ? » (280 caractères)
   et « Envoyer » ; puis « Merci, c'est noté ».
K. Contexte détaché : bandeau remplacé par « + Ajouter le contexte de la page ».

Page d'administration (SuperUser), desktop 1280 px et mobile 375 px, bandeau photo sombre avec titre Teko
« COACH IA », trois onglets :
L. Réglages : interrupteur « Coach ouvert » ; liste des modèles en tuiles radio (tuile active teintée) avec nom,
   identifiant, prix entrée / sortie par million de tokens, coût estimé par question, statut en pastille
   (« Recommandé », « Accès limité », « Arrêt au plus tôt le 7 mai 2027 », « Prix doublé au 1er janvier 2027 ») et
   bouton « Tester » ; données d'exemple :
   gemini-3.1-flash-lite 0,25 $ / 1,50 $ (actif) · gemini-3.5-flash-lite 0,30 $ / 2,50 $ · gemini-3.8-flash
   0,75 $ / 3,75 $ · gemini-2.5-flash-lite 0,10 $ / 0,40 $ (accès limité) ;
   champs : budget par compte et par mois 2,00 €, plafond global du mois 50 €, taux 1 $ = 0,86 €, questions par heure 20,
   délai entre deux questions 4 s, longueur 400, historique 10 messages ; bouton « Enregistrer ».
M. Consommation : quatre chiffres (coût du mois 7,40 €, 1 760 questions, 14 comptes actifs, 0,004 € par question),
   jauge du plafond global, tableau par modèle, comptes au-delà de 80 % de leur budget, erreurs du fournisseur.
N. Questions : questions fréquentes regroupées (sans nom de joueur) ; votes « Inexact » à relire : question,
   réponse, outils appelés, précision du joueur, bouton « Relu ».

Livre tous les écrans cliquables, en clair et en sombre, et liste à la fin ce qui reste à trancher.
```

### 11.5 « Coach IA - Compléments » (livrée le 2026-10-24)

Réponse au prompt du §11.4, 73 pages. **Chaque écran existe en quatre versions** : desktop sombre et clair (1 440 px ;
1 280 px pour l'administration), mobile sombre et clair (375 px) — sauf A, desktop seulement. Tout est cliquable :
fils (ouvrir, renommer, supprimer avec confirmation en modale), envoi, arrêt, réessai, votes, contexte, onglets
d'administration, choix du modèle, test, enregistrement.

| # | Écran | Ce que montre la maquette |
|---|---|---|
| 0a / 0b | Icône | Deux options Lucide : **bouclier** (`shield`, utilisée par défaut) et radar — P7 |
| base | Écrans corrigés | Contexte « Erangel · 22 oct. 21:47 · Top 3 », accueil tutoyé, « Phase 5 · 18:42 », « Bilan face aux [VPR] », « Données de l'API PUBG », titres en couleur de texte, « ton escouade a perdu », « mise à terre » |
| base2 | Teaser visiteur | Seul bouton rempli « Inscrire mon clan… », Envoyer désactivé |
| A | Plein écran | Liste de 280 px : « + Nouveau fil », groupes Aujourd'hui / Cette semaine / Plus ancien, titre + contexte court (carte · date, ou « Sans contexte ») + heure, fil actif teinté, menu « … » Renommer / Supprimer (A2 : modale de confirmation) ; fil centré sur 760 px |
| B | Fils dans le tiroir et le panneau mobile | Bouton « Fils » de l'en-tête, teinté quand la liste est affichée ; la liste remplace le fil |
| C | Réponse en cours | « Je consulte tes parties… », texte qui arrive, Envoyer remplacé par « Arrêter » |
| D | Erreur | « Le Coach IA n'a pas pu répondre. Réessaie dans un instant. » + « Réessayer » |
| E | Limite horaire | Pastille « 0 / 20 » orange, saisie désactivée, « Limite de 20 questions par heure atteinte. Prochaine question à 22:14. » |
| F1 / F2 | Budget | Pastille orange « Budget du mois : 82 % » au-dessus de la saisie ; puis « Ton budget de questions revient le 1er novembre » |
| G | Pause | Saisie remplacée par « Le Coach IA est en pause » |
| H | Sans contexte (page Membres) | Accueil générique, trois suggestions générales, pas de bandeau de contexte |
| I | Télémétrie pas analysée | Bulle du Coach « … Reviens demain matin. » |
| J1 / J2 / J3 | Votes | Utile teinté ; Inexact ouvre « Qu'est-ce qui est faux ? » (280) + Envoyer ; « Merci, c'est noté » |
| K | Contexte détaché | « + Ajouter le contexte de la page » |
| L | Administration · Réglages | Bandeau « COACH IA » + pastille « Coach ouvert », onglets ; interrupteur ; tuiles radio des modèles (nom, identifiant, prix, ≈ € / question, statuts, « Tester » — l'essai de `gemini-2.5-flash-lite` échoue : accès limité) ; champs des limites avec texte d'aide ; « Aucune modification » + « Enregistrer » (seul bouton rempli) |
| M | Administration · Consommation | « Octobre 2026 · du 1er au 24 » ; 4 KPI (7,40 €, 1 760, 14, 0,004 €) ; jauge du plafond avec repère à 80 % ; tableau par modèle (questions, entrée, sortie, coût, erreurs) ; comptes au-delà de 80 % ; erreurs du fournisseur (429, délai 30 s, 503) avec compteur |
| N | Administration · Questions | Questions fréquentes « 30 derniers jours · regroupées par sens, sans nom de joueur » (barres + nombre de formulations) ; votes « Inexact » à relire : date · carte · clan, question, précision du joueur, réponse, outils appelés en puces, « Relu » |

**Erreurs de la maquette, à corriger à l'implémentation :**

| Maquette | Implémentation |
|---|---|
| Statuts des modèles **inversés** : « Recommandé » sur 3.1-flash-lite, « Prix doublé au 1er janvier 2027 » sur 3.5-flash-lite, « Accès limité » + « Arrêt au plus tôt le 7 mai 2027 » sur 2.5-flash-lite | Catalogue du §3.1 : arrêt au plus tôt le 7 mai 2027 = **3.1-flash-lite** ; prix doublé au 1er janvier 2027 = **3.6 / 3.8 Flash** ; recommandés par Google = 3.5-flash-lite et 3.8-flash ; accès limité = 2.5 |
| Coût estimé sur 10 000 tokens en entrée et 900 en sortie | Hypothèse du doc : 12 000 / 800 ; **la mesure du lot 0 remplace les deux** |
| Pastille « 0 / 20 » orange (E) | Rouge à 0 (`--game-neg`, section 44) ; orange à 2 ou moins |
| Noms d'outils `get_match_summary`, `get_phase_events`, `get_player_positions`, `get_landing_stats`, `get_weapon_stats` | Noms du §5.2 |
| Questions « regroupées par sens » (N) | V1 : regroupement par texte normalisé (casse, accents, ponctuation) ; par sens = V2 (embeddings) |
| « Joueur A » encore présent dans les réponses | Pseudo réel |
| En-tête « Administration » + badge « SUPERUSER » propres à la maquette | Pages Plateforme du site (`/settings/coach`, `AdminPageBanner`), menu existant |

**Réponses aux dix points « à trancher » de Claude Design :**

1. Icône : bouclier (P7).
2. Quota : les deux — la pastille compte l'heure glissante, le budget du mois apparaît en bandeau à partir de 80 % (§2.1, §2.2).
3. Seuil : orange à 80 %, questions possibles jusqu'à 100 % (§2.2).
4. Fils : 12 mois (P3) ; un fil renommé garde son contexte.
5. Votes : dans l'onglet Questions, seul le clan est indiqué, jamais le compte (§2.4, §9).
6. Statuts : inversés dans la maquette, corrigés ci-dessus.
7. Coût estimé : à mesurer au lot 0.
8. Plafond global atteint : Coach en pause **pour tout le monde** jusqu'au 1er du mois (§2.1).
9. Texte : « ton escouade a perdu », « mise à terre » adoptés ; « Joueur A » = pseudo réel.
10. Réponses libres : comportement de démonstration ; dans le site, toute question passe par la route du §7.2.

---

## 12. Tests

> Vitest ne ramasse que `src/lib/**/*.test.ts` : les tests de routes importent le handler depuis `src/app/`.

- **`src/lib/coach/coach-quota.test.ts`** : fenêtre réellement glissante (20 questions à 13:59 → 21e refusée à 14:00,
  acceptée à 14:59:01) ; quota par compte même après `switch-member` ; supprimer un fil ne rend rien ; anti-rafale ;
  budget du mois (mois de Paris, changement de mois) ; plafond global ; SuperUser sans quota ni membre actif ; erreur
  du fournisseur hors limite horaire.
- **`coach-cost.test.ts`** : coût par modèle, changement de prix daté (31/12/2026 → 01/01/2027), conversion en euros.
- **`coach-context.test.ts`** : reconnaissance des adresses ; match d'un autre clan ignoré.
- **`coach-tools.test.ts`** : étanchéité (aucun outil n'accepte un clan ou un compte du modèle ; `matchId` d'un autre
  clan refusé) ; aucune donnée d'authentification dans les résultats ; `decodeTelemetryRow` sur une partie compressée.
- **`coach-route-contracts.test.ts`** (mock Prisma listant `coachConversation`, `coachMessage`, `coachUsage`) :
  401 sans session ; 403 autre clan ; 403 mode visiteur ; 403 fil d'un autre compte du même clan ; 429 par motif ;
  503 Coach en pause ; flux SSE avec un fournisseur simulé — **aucun crédit consommé**.
- **`coach-admin-routes.test.ts`** : `requirePlatformAdmin` ; écritures dans `admin-action-log-routes.test.ts`.
- **`tutoiement.test.ts`** couvre les textes du Coach et les messages d'exemple.
- **Playwright `e2e/coach.spec.ts`** : jamais d'écriture en base, tous les `/api/**` interceptés ; réponses figées
  dans `e2e/support/pages.ts`, flux SSE compris (corps `text/event-stream` figé) ; parcours visiteur (teaser, aucun
  appel au Coach), membre (ouverture, question, flux, vote, fils, rechargement), états (quota, pause) ; fixture
  `cspViolations` à zéro ; captures clair et sombre, 375 et 1 280 px ; `clickInPlace` dans un bandeau docké.

---

## 13. Plan d'implémentation

Cocher avec la date et le commit : `- [x] … — 2026-11-03, abc1234`.

### Contrôles à chaque lot

- [ ] `npm run lint` et `npx tsc --noEmit` sans erreur
- [ ] `npm run test:telemetry` (toute la suite Vitest) vert
- [ ] Conventions Next 16 : `await params`, `Response.json()`, pas de `NextResponse`, pas de `Readable.toWeb()`
- [ ] Textes : tutoiement, vocabulaire du site, « Coach IA » seul nom
- [ ] Fiche ou section de doc mise à jour dans le même commit

### Lot 0 — Préparation

- [x] Prompt du §11.4 envoyé à Claude Design ; « Coach IA - Compléments » relu, écarts notés au §11.5 — 2026-10-24, dd7250f
- [x] Branche `feat/coach-ia` créée — 2026-10-24, premier commit dd7250f (ce document, la section 44 de la charte, le sommaire, le script d'essai)
- [ ] Les deux maquettes exportées dans `docs/ui/refonte/maquettes/` (ignoré par git) **avant le 14 décembre 2026**, fermeture de Claude Design autonome
- [x] Projet Google Cloud **avec facturation**, plafond de dépense posé côté Google, clé `GEMINI_API_KEY` créée — 2026-10-24, déposée dans le `.env` local par l'utilisateur
- [x] Essai `scripts/coach-model-probe.ts` (lecture seule) sur `gemini-3.1-flash-lite` et `gemini-3.5-flash-lite` :
      appels d'outils, flux, français, quatre questions types — 2026-10-24, §3.4 (outils bouchons ; `2.5-flash-lite` et
      `3.8-flash` essayés aussi), dd7250f
- [x] Tokens réels par question mesurés ; tableau du §2.3 corrigé — 2026-10-24 (bouchons ; à remesurer au lot 9 avec les vrais outils)
- [x] Modèle par défaut confirmé au §0 ; propositions P1 à P7 confirmées — 2026-10-24 : `gemini-3.5-flash-lite`
- [x] **Contrôle :** coût moyen mesuré par question noté au §2.3 — 0,0008 $ (bouchons)

### Lot 1 — Données et réglages

- [x] Modèles `CoachConversation`, `CoachMessage`, `CoachUsage` (+ relations inverses sur `UserAccount`, `ClanMember`, `Clan`) — 2026-10-24
- [x] `migrate diff` lu (vide avant, les trois tables après), migration `20261024120000_coach_ia` écrite, client régénéré — 2026-10-24
- [x] Migration **appliquée** par l'utilisateur (`npx prisma migrate deploy` depuis son poste, base de production,
      « All migrations have been successfully applied ») — 2026-10-24 ; `migrate diff` vide et `migrate status` à jour
      vérifiés ensuite
- [x] `src/lib/coach/coach-config.ts` : réglages `AppConfig`, replis environnement et défauts (§4.2), fermé par défaut — 2026-10-24
- [x] `src/lib/coach/coach-models.ts` : catalogue (§3.2) ; `coach-cost.ts` ; tests (`coach-models`, `coach-cost`, `coach-config`) — 2026-10-24
- [x] Purge des fils de plus de 12 mois et des usages de plus de 13 mois dans la maintenance de 01:15 (`coach-retention.ts`, test, docs/ops/cron.md) — 2026-10-24
- [x] `GEMINI_API_KEY`, `COACH_MODEL` dans `.env.example` et le tableau de CLAUDE.md ; section « Coach IA » de `/settings/configuration` — 2026-10-24
- [x] **Contrôles :** `migrate diff` vide après migration (« This is an empty migration », 75 migrations, base à jour) ;
      tests `coach-*` verts, eslint et tsc OK — 2026-10-24

### Lot 2 — Quota et budget

- [x] `src/lib/coach/coach-quota.ts` : limite horaire glissante, anti-rafale, budget par compte, plafond global,
      réservation `pending`, SuperUser exempté (et libre pendant la pause, pour la soirée de test du lot 9 ; seule
      l'absence de clé ferme tout) — 2026-10-24
- [x] `GET /api/coach/quota` (`{ authenticated: false }` en 200 sans cookie, 401 jeton périmé, comme `/api/auth/session`) — 2026-10-24
- [x] `coach-quota.test.ts` (décision pure + lecture simulée, mois de Paris à cheval sur l'heure d'été) et `coach-quota-route.test.ts` — 2026-10-24
- [x] **Contrôle :** `EXPLAIN` des cinq requêtes de quota et de la liste des fils sur la base migrée — toutes par index
      (`CoachUsage_createdAt_idx` / `CoachUsage_userId_createdAt_idx`, `CoachConversation_userId_updatedAt_idx`, `Using index`) — 2026-10-24

### Lot 3 — Fournisseur, outils, prompt

- [x] ~~`@google/genai` installé~~ → **API REST directe, sans SDK** (décision du 2026-10-24, §3.3)
- [x] `coach-provider.ts` (interface) + `coach-provider-gemini.ts` (flux SSE, tours d'outils, niveau de réflexion du
      catalogue avec repli sur 400, délai par tour, `signal`) + `coach-provider-gemini.test.ts` (7 tests sur des flux
      écrits à la main) — 2026-10-24
- [x] `coach-context.ts` (motifs, étiquette, suggestions, bloc de prompt) + `coach-context-service.ts` (vérification
      en base) + tests ; `coach-prompt.ts` (§6, exception déclarée dans `tutoiement.test.ts`) — 2026-10-24
- [x] Les cinq outils du §5.2 dans `src/lib/coach/coach-tools.ts`, liés au clan par fermeture, sur les services des
      pages (`loadMatchDebriefPayload`, `aggregateMemberWeapons`, `locationForPercent`…) — 2026-10-24
- [x] `coach-tools.test.ts` (14 tests : étanchéité des déclarations, bornes, formes ; la télémétrie compressée est
      lue par le chargeur de la page, `decodeTelemetryRow` compris) — 2026-10-24
- [x] **Contrôles :** `scripts/coach-tools-probe.ts` sur la vraie base (lecture seule, clan 3) : contexte 38 ms,
      parties 286 ms, débriefing 225 ms, armes 22 ms, adversaire 192 ms, largages 182 ms — tous < 1 s ; résultats de
      100 à 700 tokens ; aucune lecture d'`EncounteredPlayer` (`grep`) — 2026-10-24

### Lot 4 — Routes API

- [x] `POST /api/clans/[clanId]/coach/chat` (§7.2) : garde `decideClanAccess`, corps validé, refus 400 / 404 / 429 / 503
      avant tout flux, puis SSE (`meta`, `tool`, `delta`, `done`, `error`) avec `X-Accel-Buffering: no` et
      `no-transform` ; `request.signal` et `cancel()` interrompent l'appel au modèle ; réponse enregistrée même
      interrompue, usage `aborted` / `error` — orchestration dans `coach-chat-service.ts` — 2026-10-24
- [x] Routes des fils (`GET /api/coach/conversations`, `GET · PATCH · DELETE …/[id]`) et du vote
      (`POST /api/coach/messages/[id]/feedback`), propriété dans la requête (`coach-conversation-service.ts`) — 2026-10-24
- [x] Marque `unverified` (chiffres sans appel d'outil, §6) posée à l'enregistrement du message — 2026-10-24
- [x] `coach-route-contracts.test.ts` (14 tests : 401, 403 autre clan, 400, 503 pause, 429 limite, 404 fil étranger,
      flux complet avec coût, non vérifié, historique borné, erreur du fournisseur, interruption, SuperUser sans membre,
      fils et votes) — 2026-10-24
- [ ] **Contrôle :** flux visible mot à mot sur le **build** local, derrière un vrai navigateur — **attend la
      migration appliquée** (les tables n'existent pas encore en base) ; 401 / 403 / 429 / 503 vérifiés par les tests

### Lot 5 — Interface membre

- [x] Classes `.coach-*` reportées de `docs/ui/index.html#coach-ia` dans `src/app/globals.css` (+ tiroir fixe,
      panneau montant sous 768 px, grille de la page plein écran) — 2026-10-24
- [x] `src/components/coach/` : `CoachContext` (`CoachProvider`, `useCoach`), `CoachTrigger`, `CoachDrawer`,
      `CoachPanel` (en-tête, contexte, fil, saisie, liste des fils, teaser), `CoachMarkdown`, `CoachContextButton` ;
      hooks `useCoachChat` (flux SSE, arrêt, votes, reprise d'un fil), `useCoachConversations`, `useCoachQuota` ;
      `coach-client.ts` (constantes et aides côté navigateur), `coach-markdown.ts` (+ test) — 2026-10-24
- [x] Déclencheurs (§8.1) : en-tête du shell (**masqué sous 640 px** : il passait à la ligne et grandissait le header ;
      entrée mobile = menu « Coach IA » et boutons contextuels), palette `Ctrl+K`, bouton « Débriefer ce match avec le
      Coach » dans le bandeau du débriefing — 2026-10-24
- [x] Plein écran `/clans/[clanId]/coach` (`NavigationTrail`, liste des fils à gauche dès 1 024 px) ; `CLAN_PAGES`
      avec `noindex` (titre « … — Coach IA », `robots: noindex`) et exclue des liens de la vue d'ensemble ; entrée
      `clan.coach` du registre (rôle `member`) + `scripts/seed-coach-nav.ts` **à lancer après déploiement** (la
      table `NavItem` fait foi) — pas de `PERSONAL_NAV_KEYS` (réservé aux pages joueur) — 2026-10-24
- [x] Panneau mobile (§8.4 : 85 % de la hauteur, poignée, cibles 44 px) ; états du §8.5 (réponse en cours avec
      l'outil appelé, erreur + Réessayer, limite horaire / budget / pause avec l'heure ou la date de retour, sans
      contexte, non vérifié, interrompu, vote avec précision, contexte détaché / rattaché) — 2026-10-24
- [x] Accessibilité : `role="dialog"` nommé, Échap ferme, focus à la saisie puis rendu au déclencheur, `aria-live`
      « Réponse du Coach terminée », votes en `aria-pressed`, teaser flouté en `aria-hidden` — 2026-10-24
- [ ] **P2** (tiroir qui pousse la page au-delà de 1 600 px) : non fait, le tiroir recouvre à toutes les largeurs —
      à juger à l'usage
- [x] **Contrôles :** captures sur le serveur de dev en **mode visiteur** (teaser), clair et sombre, 1 280 et 375 px :
      tiroir 440 × 900 px à droite, panneau 375 × 765 px (85 %) en bas, page plein écran titrée et `noindex`, bandeau
      du débriefing avec le bouton (header 71 / 73 px inchangé), aucun débordement ; aucun hex en dur dans
      `src/components/coach` ; aucun `localStorage` ; `prefers-reduced-motion` dans le CSS — 2026-10-24
- [ ] **Contrôle restant :** parcours **connecté** sur le serveur de dev (question réelle, flux mot à mot, fils,
      votes) — à faire dans un navigateur avec une session (lot 9 avec le build)

### Lot 6 — Visiteur et vitrine

- [x] Teaser du tiroir en mode visiteur (§8.6) — livré avec le lot 5 (`CoachPanel`, `visitor`)
- [x] Carte de vitrine (§8.7) : `CoachRow` dans `HomeShowcase`, rendue par `src/app/page.tsx` seulement quand le
      Coach est **ouvert** (`hasCoachApiKey() && settings.enabled`, réglage en cache 30 s) — elle sort donc d'elle-même
      avec l'interrupteur du lot 9. Lien « Ouvrir mon espace » pour un connecté, « Rejoindre un clan » sinon
- [ ] `public/vitrine-coach-ia.jpg` à fournir : la carte utilise `/cartographie-tactique.jpg` en attendant
      (`COACH_IMAGE`)
- **Contrôles :** aucun appel `/api/clans/*/coach/*` depuis un visiteur (e2e, lot 9) ; pseudos fictifs ; HTML
  serveur sans faux chiffre (la carte n'affiche aucun chiffre)

### Lot 7 — Page SuperUser

- [x] `/settings/coach` : Réglages (interrupteur enregistré tout de suite, tuiles radio des modèles avec « Tester » et
      résultat sous la tuile, budgets et limites en brouillon + « Enregistrer »), Consommation (`usage/`), Questions
      (`questions/`) — `src/app/settings/coach/**`, `src/components/settings/coach/*`, rapports purs dans
      `src/lib/coach/coach-admin-report.ts`, lectures dans `coach-admin-service.ts`
- [x] Routes `GET/PUT /api/settings/coach`, `POST …/test-model` (question minuscule avec outil, facturée au SuperUser),
      `GET …/usage`, `GET …/questions`, `POST …/questions/[id]/reviewed` — `requirePlatformAdmin`, écritures sous
      `withAdminActionLog` ; `AdminAccessGate` dans `src/app/settings/coach/layout.tsx` ; entrée `superuser.coach` du
      registre, carte du hub Plateforme (groupe « Site »), seed `scripts/seed-coach-admin-nav.ts` (après déploiement)
- [x] Alertes `coach_budget` (80 % puis atteint, mémoire `AppConfig` par mois), `coach_provider_errors` (5 en 15 min,
      silence 6 h), `coach_model_notice` (30 j avant, vérifié par la veille du matin) — `src/lib/coach/coach-alerts.ts`,
      branchées dans `runCoachChat` et `runAdminDailyDigest` ; ligne « votes Inexact à relire » dans la boîte « À traiter »
- [x] Rendu vérifié le 2026-10-24 (spec Playwright temporaire, API simulées) : trois onglets en clair et en sombre,
      1280 px et 375 px, aucun défilement horizontal — captures de référence au lot 9 avec `e2e/coach.spec.ts`
- **Contrôles :** `admin-action-log-routes.test.ts` vert ; tuiles radio (pas de `<select>`) ; aucun compte dans l'onglet
  Questions (test de route) ; la clé ne sort jamais (`apiKeyPresent` seul)

### Lot 8 — Conformité et documentation

- [x] `/confidentialite` (deux lignes du tableau, transfert chez Google, finalité, base légale, conservation, droits),
      mentions légales (origine des données, condition d'utilisation), `LEGAL_UPDATED_AT` au 24 octobre 2026 ; demande
      `purge` étendue au Coach : `purgeCoachHistoryForPubgName` (`coach-retention.ts`, test), script
      `scripts/purge-coach-history.ts` (simulation puis `--apply`), rappel dans l'e-mail de la demande et le formulaire
- [x] `docs/features/coach-ia.md` ; `docs/sommaire.md` ; `docs/features/pages-legales.md` ; section 44 de
      `docs/ui/index.html` passée de « À implémenter » à « charte » ; `docs/ops/deployment.md` (variables, flux SSE
      derrière Nginx) ; `docs/ops/settings.md` (`/settings/coach`) ; CLAUDE.md (règles du Coach, scripts)
- **Contrôle :** relecture de `/confidentialite` en clair et en sombre — faite le 2026-10-24 (captures Playwright)

### Lot 9 — Tests de bout en bout et mise en production

- [ ] `e2e/coach.spec.ts` et réponses figées (§12) ; suite complète sur le build (`E2E_PORT=3001`)
- [ ] Déploiement : migration, clé dans le `.env` du serveur (lisible par l'utilisateur des services), Coach **fermé**
- [ ] Vérification derrière Nginx : flux mot à mot en production
- [ ] Ouverture au SuperUser seul, une soirée de test, puis interrupteur ouvert à tous ; carte de vitrine en ligne
- [ ] Bilan après une semaine : coût réel par question, votes « Inexact », questions hors sujet → §0 et §2.3 mis à jour

---

## Annexe A — Prompt d'origine envoyé à Claude Design (2026-10-24)

Conservé tel qu'envoyé ; ses couleurs et son « thème sombre par défaut » ne font pas foi (voir §8 et §11.4).

```text
Conçois l'interface du « Coach Tactique IA » pour le site chickendinner.fr (statistiques et télémétrie de clans PUBG: BATTLEGROUNDS, en français, tutoiement).
L'assistant est un avantage exclusif réservé aux membres connectés d'un clan.

Charte graphique à respecter impérativement :
- Thème sombre esport par défaut : fond bleu nuit très sombre / noir (#0B0E14), panneaux et cartes en surface bleu-gris sombre (#121721), bordures subtiles (#1F2937) ;
- Accents ambre / or (#F59E0B) pour les éléments actifs, badges premium, boutons d'action et reflets ;
- Couleurs sémantiques : vert (#10B981) pour les réussites/clutches, rouge (#EF4444) pour les wipes/dégâts subis, bleu cyan (#06B6D4) pour les données neutres ;
- Typographie : Titres en capitales condensées impactantes (Teko / sans-serif robuste), corps de texte lisible et moderne (Inter) ;
- Ambiance générale : tableau de bord militaire/tactique d'analyste e-sport, épuré, sans fioritures enfantines.

Trois écrans / états à concevoir :

--- ÉCRAN 1 : VUE SPLIT-SCREEN (Desktop 1440 px) ---
La page principale à gauche affiche un débriefing de match PUBG (carte Erangel, Top 3, 18 kills de squad, onglets Replay 2D / Chronologie).
Sur la droite de l'écran, le « Tiroir Latéral » (Side Drawer, largeur 440 px) du Coach IA est ouvert :
1. En-tête du tiroir :
   - À gauche : Icône casque niveau 3 stylisé avec halo ambre, Titre « COACH TACTIQUE », tag du clan « [47R] » et puce verte « En ligne » ;
   - Au centre/droite : pastille discrète de quota « 14 / 20 questions restantes » ;
   - À droite : bouton Agrandir (icône carré 🗖) pour basculer en plein écran, et bouton Fermer (icône ✕).
2. Badge de contexte actif :
   - Petit bandeau discret sous l'en-tête : « 🎯 Contexte : Match #324 · Erangel · 18 kills » avec possibilité de le détacher.
3. Fil de discussion (Message List) :
   - Message de bienvenue du Coach : « Salut NovakTV ! J'ai analysé votre match #324. Que veux-tu décortiquer ? »
   - 3 pilules de suggestions cliquables :
     * « 💥 Pourquoi le wipe en phase 5 ? »
     * « 🎯 Qui a fait les ouvertures ? »
     * « ⚔️ Bilan face aux [47R] »
   - Bulle utilisateur (alignée à droite, fond surface sombre avec liseré ambre) :
     « Pourquoi l'escouade s'est fait sortir en zone 5 ? »
   - Réponse du Coach IA (alignée à gauche, fond carte sombre, bordure fine) :
     « Analyse de la Phase 5 (18m42s) :
     • Isolement : Joueur A était à 145m au sud-est du reste du squad.
     • Prise en tenaille : Dès son knockdown par [Viper], vous avez perdu la ligne de crête.
     • Dégâts subis : 420 dégâts reçus en 6 secondes sans couverture fumigène.
     💡 Recommandation : Engager le repli véhicule dès le début du timer de fermeture 4. »
   - Actions sous la réponse : Boutons discrets 👍 Utile · 👎 Inexact · Icône copier.
4. Pied de saisie (Chat Input Bar) :
   - Champ de saisie arrondi sombre avec placeholder « Pose une question sur ce match, tes armes... » ;
   - Compteur de caractères à droite « 142 / 400 » ;
   - Bouton d'envoi rond ambre avec icône flèche d'envoi ;
   - Mention légale discrète en petits caractères gris : « Coach IA expérimental · Données officielles PUBG ».

--- ÉCRAN 2 : FORMAT MOBILE (Mobile 375 px) ---
- Le tiroir latéral devient un « Bottom Sheet » coulissant depuis le bas de l'écran, couvrant 85 % de la hauteur.
- Une poignée de glissement (drag handle) grise centrée en tête du tiroir.
- Même en-tête compacté, même fil de discussion fluide, champ de saisie ancré au-dessus du clavier virtuel.

--- ÉCRAN 3 : TEASER VISITEUR / NON-MEMBRE (Modale d'Incitation) ---
Un utilisateur non connecté clique sur le déclencheur « Coach IA » depuis la vitrine ou la navigation :
- Le tiroir s'ouvre, mais les réponses des messages d'exemple sont rendues avec un flou prononcé (blur filter) ;
- Au premier plan, une carte centrale sombre avec liseré or :
  * Cadenas doré ou badge étincelant « EXCLUSIVITÉ MEMBRES » ;
  * Titre : « Débloque ton Coach Tactique IA » ;
  * Texte explicatif : « Le Coach IA analyse chaque tir, chaque rotation et chaque duel de ton escouade. Connecte-toi ou enregistre ton pseudo PUBG pour accéder à tes analyses personnalisées. » ;
  * Bouton principal ambre : « Inscrire mon clan avec mon pseudo PUBG » ;
  * Bouton secondaire sobre : « Se connecter ».

Livre les trois écrans avec leurs composants fidèles à la charte sombre et dorée de chickendinner.fr.
```
