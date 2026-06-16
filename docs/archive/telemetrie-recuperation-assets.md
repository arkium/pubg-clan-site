# Recuperation des assets de telemetrie PUBG

Ce document decrit le codage necessaire pour recuperer les fichiers de telemetrie PUBG (assets CDN) et les preparer a l'analyse, en s'appuyant sur la stack actuelle du projet.

## Reponse courte a la question

Oui, avoir des exemples reels de fichiers telemetrie est tres utile, et meme recommande.

Pourquoi:

- Le schema des evenements varie selon les types de partie, les maps, et les versions.
- Certains champs sont absents ou differents selon l'evenement (`LogPlayerKill` vs `LogPlayerKillV2`).
- Les cas limites (bots, noms changes, joueur absent dans un event, distance nulle, etc.) ne sont visibles qu'avec des fichiers reels.
- Les gros volumes (10+ Mo) permettent de valider la robustesse streaming et les seuils memoire.

Ce qu'il faut preparer comme corpus minimum:

- 10 a 20 matchs recents (moins de 14 jours) couvrant duo/trio/squad.
- Plusieurs cartes (au moins Erangel + 1 autre).
- Cas de jeu varies: victoire, top 5, elimination precoce, match avec revives, match avec vehicules.
- 1 ou 2 assets volumineux pour valider le streaming.

## Etat actuel du projet (points d'ancrage)

Le pipeline actuel existe deja:

- `src/lib/pubg.ts`
  - API PUBG via queue (`enqueuePubgApiRequestWithMetadata`).
  - `fetchMatchDetails(matchId, playerId, shard)` recupere le resume match et les rosters.
  - Aujourd'hui, la fonction ne remonte pas explicitement l'URL telemetrie asset.
- `src/app/api/clans/[clanId]/sync-matches/route.ts`
  - Import des matchs par membre.
  - Detection squad via `analyzeMatchForSquads`.
- `src/lib/squad-detector.ts`
  - Persistance des `SquadMatch` / `SquadMember`.
- `src/lib/cron-jobs.ts`
  - Orchestration du sync quotidien.

Conclusion: on doit ajouter une etape post-import pour recuperer puis parser la telemetrie des `SquadMatch` recents.

## Strategie recommandee pour recuperer la telemetrie

1. Extraire l'URL asset telemetrie depuis la reponse `matches/{id}`.
2. Telecharger le JSON asset depuis le CDN (`assets.pubg.com`) hors queue RPM PUBG API.
3. Parser en streaming (pas de `JSON.parse` global sur gros payloads).
4. Filtrer les evenements utilises pour les membres du clan.
5. Stocker uniquement les agregats.

## Reference a pubg.js (ickerio/pubg.js)

Oui, on peut et on doit s'inspirer de pubg.js pour les patterns API PUBG, mais sans copier tel quel.

Bonnes pratiques a reprendre depuis pubg.js:

- Centraliser la logique HTTP dans une couche client unique (`Client._baseRequest` dans pubg.js).
- Extraire l'asset telemetrie depuis le match (`relationships.assets[].attributes.URL`).
- Exposer une API simple de recuperation de telemetrie (analogue a `getTelemetry(url)`).
- Valider les parametres en entree (id, shard, url) avant d'appeler le reseau.
- Garder un modele de domaine clair (`Match`, `Asset`, `Participant`) pour separer parsing et transport.

Adaptations indispensables pour ce projet (differences volontaires):

- Conserver `src/lib/pubg.ts` comme gateway officielle pour `api.pubg.com` avec la queue `api-throttle` existante.
- Ne pas faire passer les assets CDN telemetrie par la queue RPM PUBG API (comme deja note dans vos docs).
- Ajouter des garde-fous de production absents de pubg.js historique: limite de taille asset, timeout configurable, retries bornes, traces cron.
- Privilegier un parsing streaming et des agregats persistes (pas de conservation du JSON brut).
- Integrer la reprise sur erreur via `CronExecution` + statut telemetry par match.

Ce qu'il ne faut pas reprendre en l'etat:

- Telechargement telemetrie en mode objet complet en memoire pour les gros fichiers.
- Gestion d'erreur trop generique (perte de contexte `status`, `endpoint`, `matchId`).
- Dependance a un appel direct unique sans metriques d'observabilite.

Decision de cadrage:

- pubg.js sert de reference de design API (structure match/asset/telemetry),
- votre implementation garde les contraintes SRE du projet (cron, observabilite, idempotence, memoire).

## Fonctions a coder (design cible)

## 1) Extension de la resolution de match

Fichier cible: `src/lib/pubg.ts`

Ajouter un type dedie:

```ts
export type ResolvedPubgMatchWithTelemetry = ResolvedPubgMatch & {
  telemetryAssetUrl: string | null
  telemetryGeneratedAt?: string | null
}
```

Ajouter une fonction d'extraction d'asset depuis `included`:

```ts
type PubgAssetAttributes = {
  URL?: string
  url?: string
  createdAt?: string
}

type PubgAssetItem = {
  id?: string
  type?: string
  attributes?: PubgAssetAttributes
}

function resolveTelemetryAssetFromIncluded(included: PubgIncludedItem[]) {
  const asset = included.find((item) => item.type === 'asset') as PubgAssetItem | undefined
  if (!asset) {
    return { telemetryAssetUrl: null, telemetryGeneratedAt: null }
  }

  const telemetryAssetUrl = asset.attributes?.URL ?? asset.attributes?.url ?? null
  const telemetryGeneratedAt = asset.attributes?.createdAt ?? null

  return { telemetryAssetUrl, telemetryGeneratedAt }
}
```

Ajouter une variante de lecture match:

```ts
export async function fetchMatchDetailsWithTelemetryAsset(
  matchId: string,
  playerId: string,
  shard: string = 'steam'
): Promise<ResolvedPubgMatchWithTelemetry> {
  const base = await fetchMatchDetails(matchId, playerId, shard)

  const response = await queuedPubgGet<PubgMatchResponse>(`/shards/${shard}/matches/${matchId}`)
  const included = Array.isArray(response.data.included) ? response.data.included : []
  const telemetry = resolveTelemetryAssetFromIncluded(included)

  return {
    ...base,
    telemetryAssetUrl: telemetry.telemetryAssetUrl,
    telemetryGeneratedAt: telemetry.telemetryGeneratedAt,
  }
}
```

Note implementation:

- Pour eviter 2 appels HTTP au meme endpoint, idealement factoriser `fetchMatchDetails` pour reutiliser la meme reponse interne.
- Garder la compatibilite de l'API existante (`fetchMatchDetails`) pour limiter les regressions.

## 2) Client de telechargement asset (CDN)

Nouveau fichier cible: `src/lib/pubg-telemetry/client.ts`

Objectif: telecharger le flux JSON telemetry avec garde-fous.

```ts
export type DownloadTelemetryOptions = {
  timeoutMs: number
  maxAssetSizeBytes: number
}

export type DownloadTelemetryResult = {
  stream: ReadableStream<Uint8Array>
  contentLength: number | null
  contentType: string | null
}

export async function downloadTelemetryFromAsset(
  url: string,
  options: DownloadTelemetryOptions
): Promise<DownloadTelemetryResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Telemetry asset download failed: ${response.status} ${response.statusText}`)
    }

    const contentLengthHeader = response.headers.get('content-length')
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null

    if (contentLength && contentLength > options.maxAssetSizeBytes) {
      throw new Error(`Telemetry asset too large (${contentLength} bytes)`)
    }

    if (!response.body) {
      throw new Error('Telemetry asset has no body stream')
    }

    return {
      stream: response.body,
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
      contentType: response.headers.get('content-type'),
    }
  } finally {
    clearTimeout(timeout)
  }
}
```

Points importants:

- Pas de passage par `pubgApi` ni `api-throttle` (CDN different de `api.pubg.com`).
- Timeout strict + seuil de taille max.
- Aucune serialisation JSON complete dans cette couche.

Lien avec pubg.js:

- pubg.js propose un pattern equivalent via `getTelemetry(url)`.
- Ici on etend ce pattern avec des contraintes backend (abort controller, bornes taille, et metadonnees de suivi).

## 3) Fonction utilitaire pour recuperer un lot de matchs a traiter

Nouveau fichier cible: `src/lib/pubg-telemetry/backlog.ts`

Objectif: reutiliser les matchs deja importes (`SquadMatch`) pour construire une file de traitement.

```ts
import { prisma } from '@/lib/prisma'

export async function listSquadMatchesNeedingTelemetry(limit: number) {
  return prisma.squadMatch.findMany({
    where: {
      telemetry: null, // apres ajout relation SquadMatchTelemetry
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
    include: {
      members: {
        select: {
          memberId: true,
          member: {
            select: {
              pubgAccountId: true,
              pubgPlayerName: true,
              platformShard: true,
            },
          },
        },
      },
    },
  })
}
```

Remarque schema:

- Ce code suppose une relation `SquadMatch -> SquadMatchTelemetry` en `1:1`.
- Tant que la migration n'est pas faite, filtrer avec une table temporaire de suivi ou via status en JSON.

## 4) Orchestrateur de recuperation (sans parsing complet)

Nouveau fichier cible: `src/lib/pubg-telemetry/index.ts`

Objectif: enchaîner extraction URL asset + download stream + passage au parser.

```ts
import { downloadTelemetryFromAsset } from './client'
import { parseTelemetryStreamForClan } from './parser'
import { persistTelemetrySnapshot } from './storage'

export async function syncTelemetryForSquadMatch(input: {
  squadMatchId: string
  pubgMatchId: string
  shard: string
  anyPlayerId: string
  clanMemberPlayerIds: string[]
  parserVersion: string
  timeoutMs: number
  maxAssetSizeBytes: number
}) {
  const match = await fetchMatchDetailsWithTelemetryAsset(
    input.pubgMatchId,
    input.anyPlayerId,
    input.shard
  )

  if (!match.telemetryAssetUrl) {
    return {
      status: 'failed' as const,
      errorCode: 'ASSET_URL_MISSING',
      errorMessage: 'No telemetry asset URL in match payload',
    }
  }

  const asset = await downloadTelemetryFromAsset(match.telemetryAssetUrl, {
    timeoutMs: input.timeoutMs,
    maxAssetSizeBytes: input.maxAssetSizeBytes,
  })

  const aggregates = await parseTelemetryStreamForClan(asset.stream, {
    clanMemberPlayerIds: input.clanMemberPlayerIds,
  })

  await persistTelemetrySnapshot({
    squadMatchId: input.squadMatchId,
    parserVersion: input.parserVersion,
    generatedAt: match.telemetryGeneratedAt ? new Date(match.telemetryGeneratedAt) : null,
    aggregates,
  })

  return {
    status: 'success' as const,
  }
}
```

## 5) Job de batch pour le cron existant

Nouveau fichier cible: `src/lib/pubg-telemetry/job.ts`

```ts
export async function syncTelemetryBatchForRecentSquadMatches(options: {
  maxMatchesPerRun: number
  concurrency: number
}) {
  const backlog = await listSquadMatchesNeedingTelemetry(options.maxMatchesPerRun)

  // traiter par petits lots de concurrence (2 a 4)
  // chaque erreur est capturee et n'interrompt pas le batch

  return {
    scanned: backlog.length,
    parsed: 0,
    failed: 0,
  }
}
```

Integration:

- Option A (simple): appelee a la fin de `runDailyClanSync`.
- Option B (propre): nouveau cron dedie telemetry (recommande a moyen terme).

## Declenchement manuel sans cron (implante)

Pour eviter le cron, le projet expose maintenant une action manuelle par selection de matchs:

- Endpoint: `POST /api/clans/[clanId]/telemetry/sync-selected`
- Body JSON:

```json
{
  "squadMatchIds": ["cmatch_1", "cmatch_2"]
}
```

Comportement:

- Controle de role: action reservee au role `Owner`.
- Traitement uniquement des matchs selectionnes.
- Pour chaque match:
  - recupere l'asset URL via `fetchMatchDetailsWithTelemetryAsset`,
  - telecharge le stream telemetry via `downloadTelemetryFromAsset`,
  - consomme le stream avec limite de taille pour valider la recuperation complete.
- Retourne un resume `successCount`/`failedCount` + details par `squadMatchId`.

UI associee:

- Page `clans/[clanId]/matches/session/[date]`.
- Selection des matchs via cases a cocher dans la liste.
- Bouton `Lancer recuperation (N)` pour executer sur la selection.

Ce mode est utile pour:

- valider un echantillon de matchs reels,
- refaire un traitement cible en cas d'erreur,
- avancer sur le parser sans attendre un run cron.

## Variables d'environnement a utiliser

- `TELEMETRY_SYNC_ENABLED=true|false`
- `TELEMETRY_MAX_MATCHES_PER_RUN=50`
- `TELEMETRY_FETCH_TIMEOUT_MS=30000`
- `TELEMETRY_MAX_ASSET_SIZE_MB=250`
- `TELEMETRY_PARSER_VERSION=v1`
- `TELEMETRY_CAPTURE_FIXTURES=true|false` (capture anonymisee des payloads lors du mode manuel)
- `TELEMETRY_CAPTURE_FIXTURES_DIR=.telemetry-captured` (optionnel, recommande hors `src`)
- `TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES=52428800` (optionnel, defaut 10 Mo, plafond dur 50 Mo)

Conversion utile:

```ts
const maxAssetSizeBytes = Number(process.env.TELEMETRY_MAX_ASSET_SIZE_MB ?? '250') * 1024 * 1024
```

## Capture de fixtures reelles via le bouton manuel

Le mode manuel peut maintenant capturer des fixtures telemetry reelles anonymisees pour alimenter P2.

Principe:

- declenchement: bouton `Lancer recuperation (N)` sur la page session,
- precondition: `TELEMETRY_CAPTURE_FIXTURES=true`,
- resultat: ecriture d'un fichier JSON anonymise par match dans `.telemetry-captured` (ou dossier configure),
- robustesse: un echec de capture n'interrompt pas la sync telemetry principale.

Retour UI apres clic sur le bouton manuel:

- resume succes/echecs du traitement telemetry,
- note de capture fixtures (`Fixtures capturees: X`),
- indicateur explicite des fichiers tronques (`dont Y tronquee(s)`),
- details d'erreurs de capture par `squadMatchId` si necessaire.

Nouveau bouton sur la meme page session:

- `Effacer telemetrie OK (N)`: supprime uniquement les enregistrements `SquadMatchTelemetry` en statut `success` pour les matchs selectionnes,
- supprime aussi les fichiers JSON captures correspondants dans `.telemetry-captured` (quand ils existent),
- utile pour forcer une re-recupération propre via `Lancer recuperation (N)` juste apres.

Anonymisation appliquee:

- masquage des identifiants joueurs (`accountId`, `playerId`, `characterId`, `killerName`, `victimName`, etc.),
- remappage stable des `teamId`,
- conservation des champs metier utiles (types d'evenements, armes, damages, timings) pour garder la valeur des tests.

Procedure recommandee:

1. Activer `TELEMETRY_CAPTURE_FIXTURES=true` en local.
2. Lancer la recuperation manuelle sur 2-3 matchs representatifs.
3. Verifier les fichiers crees dans `.telemetry-captured`.
4. Selectionner les meilleurs cas (standard + cas limites) et les versionner pour les tests d'integration.
5. Desactiver le flag hors phase de collecte.

Test reel recommande (fixtures capturees):

```powershell
$env:TELEMETRY_TEST_CAPTURED_FIXTURES='true'
$env:TELEMETRY_TEST_CAPTURED_FIXTURES_MAX_FILES='5'
$env:TELEMETRY_TEST_CAPTURED_FIXTURE_MAX_PARSE_MS='2000'
npm run test:telemetry
```

Le test `parser.captured-fixtures.test.ts` reste ignore par defaut et ne s'execute que si `TELEMETRY_TEST_CAPTURED_FIXTURES=true`.
Le budget de performance est configurable via `TELEMETRY_TEST_CAPTURED_FIXTURE_MAX_PARSE_MS` (defaut: 2000 ms par fixture testee).

Quand il est actif, il affiche un resume par fixture:

- taille du fichier,
- bytes effectivement lus,
- nombre d'evenements parses,
- duree de parsing en millisecondes.

Il affiche aussi un resume agrege du lot teste:

- moyenne des temps de parsing (`avgParseMs`),
- percentile 95 des temps de parsing (`p95ParseMs`),
- budget applique (`budgetMs`).

### Garde-fou stabilite (incident V8)

Un incident a montre qu'une capture de fixture tres volumineuse (plusieurs dizaines de Mo) peut declencher un crash natif V8 en environnement de dev.

Mitigation maintenant appliquee:

- limite capture active recommandee: `TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES=52428800` (50 Mo),
- plafond dur interne: 50 Mo,
- capture streaming incrementale (ecriture au fil de l'eau),
- si la limite est atteinte: troncature propre du fichier (JSON valide) avec `wasTruncated=true`,
- si `content-length` est absent: la capture est quand meme tentee et se tronque proprement a la limite,
- en cas d'erreur pendant la capture: le fichier partiel est supprime automatiquement,
- la sync telemetry principale continue normalement (pas de blocage du traitement match).

### Etat valide sur corpus reel (02/06/2026)

- corpus local capture: 20 fichiers dans `.telemetry-captured`,
- test integration reelle execute avec `TELEMETRY_TEST_CAPTURED_FIXTURES_MAX_FILES=20`,
- resultat observe: 20/20 fichiers parses, budget respecte (`avgParseMs=359.3`, `p95ParseMs=508`, budget 2000 ms).

Conseil exploitation:

- garder la limite par defaut pour la collecte continue,
- ne pas augmenter au-dela de 50 Mo (la valeur sera de toute facon plafonnee),
- redemarrer le serveur apres modification `.env` pour appliquer la nouvelle limite.

## Comment exploiter vos matchs deja presents pour le dev

Vous avez deja des matchs representant des situations de jeu. C'est ideal pour une approche incrementale:

1. Prendre les `SquadMatch` recents (moins de 14 jours) en priorite.
2. Pour chaque `SquadMatch`, prendre un `member.pubgAccountId` du roster pour appeler `fetchMatchDetailsWithTelemetryAsset`.
3. Telecharger uniquement 20 a 50 assets au debut, et conserver les metadonnees de resultat (success/failed + code erreur).
4. Construire une matrice de couverture: map, mode, volume, presence revives, presence vehicule.

Exemple de checklist de couverture:

- match avec `LogPlayerRevive`
- match avec `LogVehicleRide` et `LogVehicleLeave`
- match avec `LogPlayerKillV2`
- match avec `LogPlayerTakeDamage`
- match long (asset volumineux)

## Pourquoi les exemples reels sont indispensables pour tous les points de la doc

Sans exemples reels, vous pouvez coder la structure, mais vous ne validerez pas:

- la qualite des correlations joueur (playerId vs nom affichage),
- la stabilite des stats fun (minimum de matchs, normalisation),
- la robustesse des parsers sur variations de payload,
- les performances memoire/reseau sur assets lourds,
- la coherence metier (armes, synergies, style) par rapport a des parties reelles.

Recommendation pratique:

- Demarrer avec un "golden set" de 10-20 matchs reels.
- Ajouter 3-5 fichiers problematiques (taille, champs manquants, events inattendus).
- Garder ces cas comme fixtures de test d'integration.

## Ordre d'implementation conseille

1. Extraction URL asset + download streaming (sans parsing metier complet).
2. Parsing minimal armes + revives + co-kills.
3. Snapshot DB `SquadMatchTelemetry`.
4. Agregats periode (`MemberWeaponStats`, synergies).
5. Extensions playstyle / cercles / heatmap / loot / vehicules.

Ce sequence permet de livrer rapidement des indicateurs visibles, en minimisant le risque de regressions.

## Checklist "inspiree pubg.js" avant merge

- URL telemetrie recuperee depuis asset `included` et testee sur plusieurs matchs reels.
- Couche client dediee telemetry (CDN) separee de la couche API PUBG rate-limitee.
- Validation stricte des inputs (`matchId`, `shard`, `url`) et erreurs typées.
- Timeout + limite de taille actifs en environnement de dev et prod.
- Journalisation exploitable: `squadMatchId`, `pubgMatchId`, `assetBytes`, `durationMs`, `errorCode`.
- Tests d'integration sur un corpus reel (minimum 10 matchs multi-situations).

## Suivi d'avancement (etat au 01/06/2026)

### 1) Foundation telemetry

- [x] Extraire l'URL telemetry asset depuis `matches/{id}` (`fetchMatchDetailsWithTelemetryAsset`, `resolveTelemetryAssetFromIncluded`).
- [x] Ajouter un client CDN dedie (`src/lib/pubg-telemetry/client.ts`) avec timeout + limite de taille + validation URL.
- [x] Ajouter une lecture stream->texte avec garde-fou taille (`readTelemetryStreamAsText`).
- [x] Parser en streaming natif implemente (`parseTelemetrySnapshotFromStream`).

### 2) Parsing et persistence

- [x] Parser minimal implemente (`src/lib/pubg-telemetry/parser.ts`): summary, weaponStats, memberStats.
- [x] Table `SquadMatchTelemetry` + relation 1:1 avec `SquadMatch`.
- [x] Persistence snapshot success/failed via upsert dans `manual-sync.ts`.
- [x] Stockage JSON `summary/weaponStats/memberStats` avec fallback compatibilite si types Prisma locaux desynchronises.

### 3) Declenchement manuel

- [x] Endpoint Owner `POST /api/clans/[clanId]/telemetry/sync-selected`.
- [x] Selection de matchs en UI + bouton `Lancer recuperation (N)` sur la page session.
- [x] Retour de synthese `successCount/failedCount/processedCount` + details par match.

### 4) Exposition UI/API de l'etat

- [x] Exposition telemetry dans `GET /api/clans/[clanId]/matches` (status, parserVersion, parsedAt, bytes, erreurs).
- [x] Cartes match enrichies (`SquadMatchList`) avec statut telemetry + resume parser (si disponible).
- [x] Page provisoire de monitoring: `/clans/[clanId]/telemetry/recoveries`.
- [x] API de monitoring: `GET /api/clans/[clanId]/telemetry/recoveries` (filtree clan + synthese).
- [x] Filtres sur la page provisoire: statut, presence JSON parser, recherche texte.

### 5) Batch/Cron (reste a faire)

- [x] `listSquadMatchesNeedingTelemetry(limit)` (backlog dedie) dans `src/lib/pubg-telemetry/backlog.ts`.
- [x] Orchestrateur generique `syncTelemetryForSquadMatch(...)` dans `src/lib/pubg-telemetry/index.ts`.
- [x] Job batch dedie `syncTelemetryBatchForRecentSquadMatches(...)` dans `src/lib/pubg-telemetry/job.ts`.
- [x] Integration cron dans `runDailyClanSync` (activee via `TELEMETRY_SYNC_ENABLED=true`).

### 6) Qualite/ops (reste a renforcer)

- [x] Journalisation structuree complete (duree, bytes, shard, code erreur standardise par etape).
- [x] Tests d'integration sur corpus reel 10-20 matchs (golden set): 20 fixtures reelles capturees et validees.
- [x] Base de fixtures de non-regression + tests parser/persistence (Vitest) en place.

## Lecture rapide de l'etat actuel

- Globalement: pipeline manuel utilisable en production pour telecharger et persister les snapshots telemetry.
- Ce qui manque principalement pour "phase complete": observabilite metriques avancees (P4).

## Roadmap priorisee (prochain sprint)

### P1 - Stabiliser l'exploitation (priorite haute)

- [x] Implementer `src/lib/pubg-telemetry/backlog.ts` avec `listSquadMatchesNeedingTelemetry(limit)`.
- [x] Implementer `src/lib/pubg-telemetry/index.ts` avec `syncTelemetryForSquadMatch(...)` (orchestrateur unique).
- [x] Implementer `src/lib/pubg-telemetry/job.ts` avec traitement batch borne (concurrency 2-4, erreurs isolees).
- [x] Integrer le job telemetry dans le cron (ou appel dedie) avec compte-rendu execution.
- [x] Ajouter journalisation structuree standard (`step`, `squadMatchId`, `pubgMatchId`, `durationMs`, `bytes`, `errorCode`).

Critere de sortie P1:

- un run automatique traite un backlog de matchs sans intervention manuelle,
- les erreurs sont tracables par match,
- aucun crash batch si un match individuel echoue.

### P2 - Robustesse parser et qualite data

- [x] Basculer vers un parsing streaming reel (sans `JSON.parse` global du payload complet).
- [x] Definir une batterie de fixtures telemetry reelles (10-20 matchs reels + 3-5 cas limites): 20 matchs reels captures.
- [x] Ajouter un socle golden set synthetique versionne pour tests d'integration parser (cas standard + rotations + mix + malforme).
- [x] Ajouter un mode de capture anonymisee de fixtures reelles via le bouton manuel (`TELEMETRY_CAPTURE_FIXTURES`).
- [x] Ajouter un premier socle de tests parser + persistence (Vitest).
- [x] Ajouter controle de regression de base sur les champs critiques (`summary`, `weaponStats`, `memberStats`).

Critere de sortie P2:

- le parser passe sur corpus reel sans depassement memoire,
- les agregats restent stables entre releases (tests de non-regression verts).

### P3 - Produit et observabilite avancee

- [x] Ajouter tri multi-colonnes sur la page recoveries (date, statut, taille).
- [x] Ajouter export CSV des lignes filtrees.
- [x] Ajouter liens contextuels vers la session/match source.
- [x] Ajouter KPIs de sante telemetry (taux succes 24h/7j, mediane duree, mediane bytes).
- [x] Ajouter une fenetre de calcul KPI selectionnable (24h/7j/30j/tout).

Critere de sortie P3:

- l'equipe peut auditer et investiguer les recuperations telemetry sans SQL direct,
- la page recoveries devient un tableau de bord ops complet.
