# Zones d'impact — statistiques par joueur et par clan, progression par semaine

> Plan du 2026-10-29, **implémenté le 2026-10-30** (non déployé, migration à appliquer — §9). But : sortir les zones
> d'impact (tête, torse, bassin, bras, jambes) du débriefing d'une seule partie pour en faire une statistique de
> période — semaine, mois, tous — par joueur et par clan, avec une progression semaine après semaine. *Destiné à l'utilisateur et à l'équipe de développement.*

## 1. Constat (code et production, lecture seule, 2026-10-29)

### 1.1 La donnée existe déjà, par joueur et par partie

- Le parseur écrit, pour **chaque joueur** de chaque partie analysée, `bodyZonesDealt` et `bodyZonesTaken` dans
  `memberStats` (`SquadMatchTelemetry.memberStatsGz`, compressé) : par zone, touches et dégâts
  (`src/lib/pubg-telemetry/body-zones.ts`, `parser.ts` — `LogPlayerTakeDamage.damageReason`, depuis le 2026-09-13,
  commit `a7ad49a`).
- Le regroupement par escouade de la capture n'est qu'un **choix d'affichage** du débriefing : `match-debrief-payload.ts`
  fusionne les joueurs de l'équipe mise en avant (`mergeBodyZoneBreakdowns`) en `telemetry.squadBodyZones`.
- Règles du parseur à conserver telles quelles : un dégât qu'un joueur s'inflige ne compte pas en « infligé »
  (`killerKey !== victimKey`) mais compte en « subi » ; une touche à 0 dégât (gilet) compte ; les dégâts sans
  localisation (zone bleue, chute, explosion, véhicule) vont en `other`, jamais sur une partie du corps. Le parseur ne
  distingue pas un bot d'un joueur dans ces compteurs.
- Rien ne lit ces zones hors du débriefing : ni agrégat, ni page de période, ni outil du Coach.

### 1.2 Volume disponible (base de production)

| Donnée | Valeur |
|---|---|
| Parties analysées (`status = success`) | 39 246 |
| …dont analysées depuis le parseur à zones (`parsedAt ≥ 2026-09-13`) | **29 854** |
| …avant, sans zones, **non récupérables** en production (aucune copie `.telemetry-captured`, CDN PUBG à 14 jours) | ~9 400 |

Parties à zones par semaine ISO de la partie (`SquadMatch.createdAt`) : S35 13 · S36 1 698 · S37 3 017 · S38 3 213 ·
S39 3 435 · S40 3 823 · S41 3 750 · S42 4 304 · S43 4 725 · S44 1 876 (jusqu'au jeudi 29/10). S36 et S37 viennent de
re-parses : ces parties ont leurs zones. **« Tous » commence donc mi-septembre 2026**, à dire sur les pages.

### 1.3 Les agrégats de période gardent déjà l'historique hebdomadaire

- `recalculateTelemetryPeriodAggregatesForClan` (`src/lib/pubg-telemetry/period-aggregates.ts`) lit `memberStats`
  de chaque partie de la période et écrit `MemberTelemetryStats`, `MemberWeaponStats`, `ClanSynergyTelemetryStats` sous
  les clés `week-YYYY-WW`, `month-YYYY-MM`, `all-time` (`getPeriodKey`). Le recalcul **n'efface que la clé qu'il
  réécrit** : les semaines passées restent — `MemberTelemetryStats` porte une ligne par membre et par semaine depuis
  `week-2026-23`. La mécanique « une ligne par semaine » existe donc ; il manque les zones dans ce qui est agrégé
  (`parseSnapshotMemberStatsRows` ignore `bodyZonesDealt` / `bodyZonesTaken`).
- Déclenchement : le worker de télémétrie met en file un recalcul du clan après chaque lot de parties analysées
  (`enqueueTelemetryAggregateRecalcJob`, file `telemetry_recalc_aggregates`, vidée par
  `scripts/telemetry-aggregate-worker.ts`) ; à la main par `npm run telemetry:batch -- --recalc-aggregates-only`,
  `scripts/recalc-scores.ts` et la route `telemetry/recalc-aggregates-batch`. Aucun cron ne recalcule.
- **Les semaines passées sont figées** : le recalcul ne vise que la semaine, le mois et le « tous » de l'instant
  (`referenceDate = new Date()`). Une partie du dimanche soir importée le lundi, ou un tournoi synchronisé tard,
  n'entre jamais dans la semaine écoulée. Ce défaut touche déjà les armes et les synergies.
- Bornes : semaine ISO du lundi 00:00 au dimanche 23:59 et mois civil, **heure locale du serveur** — pas la règle
  « soirée = journée de jeu à 06:00 » (`sessionDateOf`), réservée aux soirées. Pas de type de match ni de mode
  d'équipe dans `MemberTelemetryStats` : tous les types mélangés, comme les pages Style de jeu.
- Progression : `RankMovement` (évolution d'un rang contre la période précédente, Ligue et `/players`) est le seul
  composant d'évolution ; `src/lib/dashboard-progression.ts` (`getLastWeekKeys`, 8 semaines, en UTC) n'est plus
  importé nulle part depuis la refonte du tableau de bord du 2026-09-27.

## 2. Principe

1. **Même passe, nouvelles lignes** : le recalcul d'agrégats accumule les zones de chaque membre pendant la lecture de
   `memberStats` qu'il fait déjà, et les écrit dans une table `MemberBodyZoneStats`. Aucune lecture de télémétrie en
   plus, aucun changement du parseur ni des colonnes JSON.
2. **Le clan est une somme** : ses zones = somme des lignes de ses membres actifs (`clanPlacementMemberWhere`,
   `src/lib/clan-placement.ts`) à la lecture. Pas de table de clan, pas de double écriture.
3. **La progression lit les semaines passées** : une requête `period IN (…)` sur les 8 dernières clés `week-*`, rien
   à calculer en plus. Les clés viennent de `getPeriodKey` (heure locale, comme l'écriture) ; la copie UTC de
   `dashboard-progression.ts` est supprimée.
4. **Un taux ne s'affiche que sur un échantillon suffisant** : au moins 30 touches localisées sur le côté et la période
   pour un joueur, 100 pour un clan ; en dessous, « échantillon faible », aucune tendance. Un taux de tête sur trois
   parties bouge n'importe comment.
5. **La semaine écoulée reste vivante deux jours** : le recalcul couvre aussi la semaine précédente le lundi et le
   mardi, et le mois précédent les 1er et 2 du mois. Profite aux armes et aux synergies, au même prix.
6. **Deux pages, une section chacune** : « Zones d'impact » dans le Style de jeu du joueur (`/members/[id]/playstyle`)
   et dans le Style de jeu du clan (`/clans/[clanId]/stats`). Le débriefing ne change pas. L'Armurerie non plus :
   elle est rangée par catégorie d'arme, le croisement zone × arme viendra avec elle (§8).
7. **Une migration** : la table. Le rattrapage des semaines passées est un script, par lots.

## 3. Indicateurs et règles (à valider)

Vocabulaire du débriefing conservé : **Tirs infligés** / **Tirs subis** ; Tête, Torse, Bassin, Bras, Jambes ; « à la
tête » ; « dégâts non localisés ».

| Indicateur | Calcul | Côté | Rôle |
|---|---|---|---|
| Touches et dégâts par zone | sommes des lignes de la période | les deux | les deux silhouettes et leurs barres, comme au débriefing |
| Part d'une zone | touches de la zone / touches localisées | les deux | lecture de la silhouette |
| **Taux de tête** | touches tête / touches localisées | infligés | l'indicateur phare (`summarizeBodyZones.headHitRate`, déjà défini) |
| Part de tête subie | idem | subis | « on te touche à la tête » |
| Part haut / bas du corps subi | (tête + torse) / localisées contre (bras + jambes) / localisées | subis | exposition : beaucoup de bras et de jambes = des adversaires qui ne touchent que ce qui dépasse de l'abri |
| Part des dégâts non localisés | dégâts `other` / dégâts totaux | les deux | subis : zone bleue, chute, explosion (placement) ; infligés : explosifs, véhicules |
| Touches et dégâts localisés par partie | sommes / parties mesurées | les deux | comparer des semaines de volumes différents |
| Évolution | taux de la période − taux de la période précédente, en points | infligés, subis | ▲ / ▼ avec `--theme-ui-positive` / `--theme-ui-negative` ; rien pour « Tous » (règle de `RankMovement`) |
| Série hebdomadaire | taux de tête des 8 dernières semaines ISO, quelle que soit la période choisie | infligés | mini-barres ; une semaine sous l'échantillon est dessinée vide |
| Comparaison au clan | part de la zone du clan (somme des membres actifs) en regard, écart en points | les deux | comme le profil de jeu (« +4 pts vs clan ») |
| Classement du clan | membres par taux de tête, échantillon atteint d'abord, puis parties, puis nom ; `previousRank` sur la période précédente | infligés | tableau du Style de jeu du clan |

Constantes dans un module pur, `src/lib/body-zone-stats.ts` : `BODY_ZONE_MIN_HITS_MEMBER = 30`,
`BODY_ZONE_MIN_HITS_CLAN = 100`, `BODY_ZONE_WEEKS = 8`, `BODY_ZONES_SINCE = '2026-09-13'`.

« Parties mesurées » = parties où la ligne `memberStats` du membre porte les tableaux de zones (présents, même vides,
depuis le 2026-09-13). Une partie analysée avant n'entre ni au numérateur ni au dénominateur.

## 4. Lots

### Lot 1 — Table et calcul

- **Prisma** : `MemberBodyZoneStats` — `id`, `memberId` (→ `ClanMember`, cascade), `period`, `periodType`, `side`
  (`dealt` | `taken`), `zone` (`head` | `torso` | `pelvis` | `arms` | `legs` | `other`), `hits Int`, `damage Float`,
  `matchesMeasured Int`, `createdAt`, `updatedAt` ; `@@unique([memberId, period, side, zone])`,
  `@@index([period, side, zone])`. Migration `add_member_body_zone_stats` par `prisma migrate dev` ; `migrate diff`
  vide ensuite. Douze lignes au plus par membre et par période ; quelques centaines de membres actifs × 65 périodes
  par an ≈ 300 000 lignes par an, bien sous 100 Mo index compris. Pas de rétention à prévoir avant un million.
- **`period-aggregates.ts`** : `parseSnapshotMemberStatsRows` lit `bodyZonesDealt` / `bodyZonesTaken` (tableaux
  tolérants : zone inconnue → `other`, nombre non fini → 0, clé absente → `null`, pas `[]`) ; l'accumulateur par
  membre cumule les deux côtés par zone (`addBodyZoneHit`) et compte `matchesMeasured` quand les tableaux sont
  présents ; écriture dans la même transaction que les autres agrégats (`deleteMany` sur la clé puis `createMany` par
  lots de `resolveAggregateWriteBatchSize()`), zones à 0 touche et 0 dégât non écrites (comme `serializeBodyZones`) ;
  `memberBodyZoneRows` ajouté au résumé.
- **Semaine et mois précédents** : `periodsToRecalculate(referenceDate)` (pure, exportée) rend la liste des
  `(period, referenceDate)` : semaine courante ; semaine précédente le lundi et le mardi ; mois courant ; mois précédent
  les 1er et 2 ; « tous ». `recalculateTelemetryPeriodAggregatesForClan` la parcourt — file du worker, batch, route et
  script y passent tous. Le résumé garde `period` + `periodKey`, inchangé.
- **`src/lib/body-zone-stats.ts`** (pur, sans Prisma) : types `BodyZoneSide`, `BodyZoneStatsRow` ;
  `summarizeBodyZoneSide(rows, minHits)` → touches, dégâts, parts par zone, taux de tête (`null` sous l'échantillon),
  part non localisée, haut / bas, par partie ; `sumBodyZoneRows(rows)` (clan) ; `bodyZoneTrend(current, previous)` →
  écart en points ou `null` ; `lastWeekKeys(now, count)` par `getPeriodKey('week', …)` ; `rankMembersByHeadRate(rows,
  minHits)` avec l'ordre du §3. `dashboard-progression.ts` supprimé.
- **Rattrapage** : `scripts/backfill-body-zone-stats.ts` — `--clan <id>` ou `--all-clans`, `--from-week 2026-36`,
  `--to-week 2026-43`, `--months 2026-09`, `--dry-run` ; appelle le recalcul d'une période donnée (la fonction interne
  `recalculateTelemetryPeriodForClan` devient exportée) ; un clan à la fois, journal par clan et semaine, reprise par
  `--from-clan` (le rattrapage d'agrégats en masse a déjà planté au hasard : relancer par lots restants). La semaine et
  le mois courants, et « tous », se recalculent d'eux-mêmes à la première passe du worker après déploiement.
  **Effet de bord à écrire dans le journal** : les lignes figées de ces semaines (`MemberTelemetryStats`,
  `MemberWeaponStats`, synergies) sont réécrites avec les parties arrivées après coup — comparer avant / après sur un
  clan (lot 7) avant de lancer les autres.

### Lot 2 — Routes et Coach

- `GET /api/members/[id]/telemetry/body-zones?period=week|month|all` — `requireSameClanAsMember(…, { readOnly:
  true })` comme `telemetry/playstyle` ; une requête `period IN (clé, clé précédente, 8 semaines)` ; réponse par
  `buildTelemetrySuccessResponse` : `member`, `period`, `periodKey`, `matchesMeasured`, `dealt` et `taken`
  (résumés du §3), `previous` (résumés, `null` pour « tous »), `weeks[]` (`periodKey`, taux de tête, touches,
  `belowSample`). Clé de période par `getPeriodKey` importée, **pas** une nouvelle copie de `getIsoWeek`.
- `GET /api/clans/[clanId]/telemetry/body-zones?period=` — `requireNavPermission('clan.stats')` comme
  `telemetry/playstyle` du clan ; membres actifs seulement ; `clan` (sommes, résumés, `previous`, `weeks[]`) et
  `members[]` (`memberId`, `displayName`, `matchesMeasured`, résumés, `rank`, `previousRank`, `belowSample`).
- **Coach IA** : outil `getBodyZones` (`playerName` facultatif, `period` `all` | `month` | `week`) dans
  `createCoachTools`, fermeture sur `clanId` / `memberId`, résumés seuls ; entrée dans le tableau des outils de
  `docs/features/coach-ia.md`. Rien dans le prompt système.

### Lot 3 — Style de jeu du joueur

- Section `sec-zones` « Zones d'impact » après « Mobilité, cercle et survie », sans ancre (trois ancres tiennent sur
  375 px, pas quatre — même choix que « Meilleures formations »). Sous-titre : « Touches localisées par la télémétrie
  des parties mesurées. Les dégâts que tu t'infliges ne comptent pas comme infligés. »
- Deux `.app-panel` « Tirs infligés » / « Tirs subis » : `DamageBodySvg` (`size="sm"`, `showValues={false}`, variante
  `dealt` / `received`) à gauche sur ordinateur, barres par zone à droite, totaux (« 110 touches · 13 % à la tête »,
  « + 217 dégâts non localisés ») — la mise en page du débriefing (`MatchDebriefView`), extraite en composant partagé
  `BodyZonePanel` (`src/components/telemetry/`) plutôt que recopiée.
- Sous chaque panneau : ligne « vs clan » (part de tête du clan, écart en points, `null` sans accès au clan) et, côté
  infligé, bande « 8 dernières semaines » en mini-barres (taux de tête, semaine vide sous l'échantillon, dernière barre
  en accent), évolution ▲ / ▼ en points contre la période précédente — masquée pour « Tous ».
- États : aucune partie mesurée → « Aucune touche localisée sur la période » ; échantillon faible → taux en gris,
  « 12 touches, 30 au moins pour un taux », pas d'évolution ; rechargement → réponse précédente estompée
  (`usePageData`). Jamais un faux zéro.
- `page-scope-entries.ts`, entrée `playstyle` : source complétée (« zones d'impact »), note « Zones d'impact : parties
  analysées depuis le 13 septembre 2026 », `code` complété ; `page-scope.test.ts` l'impose.

### Lot 4 — Style de jeu du clan

- Section `sec-zones` « Zones d'impact » après « Profil de jeu » : les deux panneaux du lot 3 sur la somme des membres
  actifs, chiffres clés (taux de tête du clan, part haut / bas subie, part non localisée subie), bande des 8 semaines.
- Tableau des membres (`app-table-shell`, `SortableTh` + `useTableSort`, tri par défaut : Tête %) : Joueur
  (`PlayerNameBadge`, lien vers son Style de jeu), Parties, Touches, Tête %, Torse %, Bras + jambes % subis,
  Évolution (`RankMovement`, colonne absente pour « Tous ») ; rangs par `RankCell` ; membres sous l'échantillon en bas,
  « — » et sans rang, comme les joueurs non classés de `/players`. Mobile : `MobileRankList`.
- Ancre « Impacts » ajoutée aux ancres de la page si elle tient sur 375 px avec les quatre existantes (à vérifier en
  Playwright) ; sinon sans ancre.
- `page-scope-entries.ts`, entrée `stats` du clan : même complément qu'au lot 3. Aucune entrée de navigation nouvelle.

### Lot 5 — Documentation

`docs/features/membres.md` §3 bis, `docs/features/statistiques.md`, `docs/features/coach-ia.md` (outil),
`docs/architecture/api-reference.md` (deux routes), `docs/ui/components.md` (`BodyZonePanel`, `DamageBodySvg` hors du
débriefing), `CLAUDE.md` (une ligne : zones de période lues dans `MemberBodyZoneStats`, jamais `memberStats` dans une
page), ce plan (§9), `docs/sommaire.md`.

## 5. Tests (Vitest, `src/lib/**`)

| Fichier | Ce qu'il vérifie |
|---|---|
| `body-zone-stats.test.ts` (nouveau) | résumés d'un côté (parts, taux de tête, non localisé, haut / bas, par partie) ; taux `null` sous 30 touches et sur 0 ; somme de clan ; tendance en points, `null` sans période précédente ; 8 clés de semaine dans l'ordre, continues au passage d'année ; classement : échantillon atteint d'abord, puis parties, puis nom, `previousRank` |
| `period-aggregates.test.ts` | lignes `MemberBodyZoneStats` écrites par membre, côté et zone ; idempotence sur deux passes ; partie sans tableaux de zones ni comptée ni mesurée ; zone inconnue en `other` ; `periodsToRecalculate` : semaine précédente le lundi et le mardi seulement, mois précédent les 1er et 2 seulement, « tous » toujours |
| `body-zones-route-contracts.test.ts` (nouveau, Prisma simulé, handlers importés depuis `src/app/`) | joueur : 400 sur un identifiant invalide, garde de clan, une seule requête `period IN`, `previous: null` pour « tous », série de 8 semaines ordonnée ; clan : membres actifs seuls, somme et classement, `previousRank` ; aucune colonne `memberStats` lue |
| `coach-tools.test.ts` | `getBodyZones` déclaré, étanche au scope (un autre clan ne sort rien), résumés sans donnée d'authentification |
| `page-scope.test.ts`, `ui-conformance.test.ts`, `tutoiement.test.ts`, `admin-action-log-routes.test.ts` | entrées de portée relues ; pages à bandeau déjà listées ; nouveaux textes ; routes en lecture seule, rien à envelopper |

## 6. Playwright (`e2e/`, toutes les API figées)

- `e2e/player-playstyle.spec.ts` : section « Zones d'impact » avec ses deux panneaux et ses chiffres ; état
  « échantillon faible » sans flèche ; « Tous » sans évolution ; aucun défilement horizontal. Réponse figée de
  `GET /api/members/:id/telemetry/body-zones` dans `e2e/support/pages.ts` (bloc des pages Style de jeu) — un appel sans
  réponse figée fait échouer le test.
- `e2e/stats.spec.ts` : section du clan, tri par les en-têtes, colonne Évolution absente pour « Tous », membres sous
  l'échantillon en bas ; ancres si une cinquième est ajoutée. Réponse figée de `GET /api/clans/:id/telemetry/body-zones`.
- Quatre projets (ordinateur, mobile, clair, sombre) ; `visual.spec.ts` ne capture ni le Style de jeu du joueur ni
  celui du clan : pas de capture de référence à régénérer. Aucun script ajouté : rien pour la CSP.

## 7. Contrôles

**Avant de commiter** : `npx tsc --noEmit`, `npm run lint`, Vitest complet, specs Playwright touchées sur les quatre
projets ; `migrate diff` vide après la migration.

**Mesure de référence** : `scripts/check-body-zone-stats.ts` (nouveau, lecture seule) — pour un clan et une semaine,
recalcule les touches par membre et par zone directement depuis `memberStats` (`decodeTelemetryRow`) et les compare
aux lignes de `MemberBodyZoneStats` ; recoupe aussi un joueur sur une partie : ses touches du débriefing doivent
tenir dans son total de la semaine.

**Déploiement** :

1. `migrate deploy`, puis les **quatre** services (`web`, `telemetry-worker`, `cron`, `telemetry-aggregates`) : le
   worker d'agrégats doit tourner avec le nouveau code avant tout rattrapage.
2. Première passe du worker (dans l'heure, dès une partie analysée) : la semaine, le mois et « tous » portent des
   zones ; la section s'affiche pour un clan actif. Avant : « Aucune touche localisée », jamais un zéro.
3. Rattrapage sur **un** clan (`--clan`, S36 → S43 et septembre), hors heures de jeu ; `check-body-zone-stats.ts`
   sans écart ; relevé avant / après des lignes `MemberTelemetryStats` de ces semaines (nombre de parties par membre :
   un écart = les parties arrivées après coup, attendu et à noter dans le journal). Puis les autres clans par lots.
4. Non-régression : durée d'un recalcul d'agrégats d'un clan (`CronExecution`, action `telemetry_recalc_aggregates`)
   avant / après — une période de plus le lundi, le mardi et les 1er et 2 du mois, rien les autres jours ; taille de la
   table après rattrapage (attendue : quelques dizaines de milliers de lignes).
5. Retour arrière : tout est additif ; la table peut rester, les sections se retirent sans migration.

## 8. Hors de ce plan

- **Zone × arme** (l'arme est dans `LogPlayerTakeDamage`) : nouvelle clé de `memberStats` écrite par le parseur, donc
  pour les parties à venir seulement ; sa place est l'Armurerie (« taux de tête au fusil de précision, à l'AR »).
- **`/players`** : un centile « Tête » (le rôle « Tireur à distance » compte déjà la part de kills en headshot) ; une
  distinction (`src/lib/distinctions.ts`) ; l'idée de `todo.md` d'un « % de kills au headshot cette semaine » dans le
  rapport hebdomadaire.
- **Type de match** : la table n'en porte pas, comme `MemberTelemetryStats` — un `matchType` multiplierait les lignes
  par quatre et séparerait la section du reste du Style de jeu ; à reprendre avec les « agrégats sans type » de
  `aide-des-pages.md`.
- **Bots** : le parseur compte les touches sur un bot comme les autres ; mesurer leur part (parties contre des bots
  déjà repérées par la route `bot-stats`) avant de décider d'un filtre.
- **Carte « Profil de jeu » du tableau de bord** : une ligne « Tête : 13 % des touches (▲ 2 pts) » vers la section ;
  après une semaine de lecture de la page.
- **Rétention** des lignes hebdomadaires : rien avant un million de lignes (§4, lot 1).

## 9. État (2026-10-30)

**Implémenté, non commité, non déployé.** Lots 1 à 5 ; maquette « Zones-impact » de Claude Design (page du joueur ; la
page du clan, coupée dans la réponse, suit la même grammaire).

### 9.1 Décisions (le « à trancher » du 2026-10-29)

- **Seuils** : 30 touches pour un joueur, 100 pour un clan, sur le côté et la période ; une semaine de la série
  hebdomadaire suit le seuil du joueur (ou du clan). En dessous : « Échantillon faible », silhouette et barres en gris,
  aucun taux, aucune évolution.
- **Période précédente vivante deux jours** : semaine précédente le lundi et le mardi, mois précédent les 1er et 2
  (`periodsToRecalculate`). Profite aussi aux armes et aux synergies.
- **8 semaines** (`BODY_ZONE_WEEKS`), la même série quelle que soit la période choisie.
- **Ancre « Impacts »** : ajoutée (cinquième ancre de la page du clan). Mesurée en Playwright : une ligne à 768 et
  1 280 px, deux lignes sur mobile (375 px, iPhone) **avec ou sans elle** — elle n'ajoute aucune ligne. Le joueur reste
  sans ancre (quatre ne tiennent pas à 375 px).

### 9.2 Écarts au plan, et pourquoi

- **Clés de période sorties dans un module pur** : `src/lib/pubg-telemetry/period-keys.ts` (`getISOWeek`,
  `getPeriodKey`, `getPeriodBounds`, `previousPeriodReference`, `lastWeekKeys`, `periodsToRecalculate`), réexporté
  par `period-aggregates.ts` : le service et les tests les lisent sans Prisma. **Correction au passage** : l'année
  d'une clé de semaine est l'année ISO — le 1er janvier 2027 donne `week-2026-53` (l'ancien code écrivait
  `week-2027-53`). Concerne les jours de fin et de début d'année seulement.
- **Pas de `sumBodyZoneRows`** : le clan se résume en passant les lignes de tous ses membres actifs à
  `summarizeBodyZones` ; une fonction de moins, même résultat.
- **Chiffres clés du clan** (maquette) : taux de tête du clan, haut du corps subi, bras et jambes subis, touches par
  partie. **Aucune part de dégâts non localisés** : relevé en production pendant l'implémentation, 62 % des dégâts
  infligés tombent en `other` (contre 19 % sur les captures de juin du débriefing). Tant que l'écart n'est pas
  expliqué (explosifs, véhicules, bots, ou une famille de `damageReason` mal classée par le parseur), seul le
  montant s'affiche (« + 340 dégâts non localisés »), jamais une part. À instruire avant toute part (§8).
- **Tableau du clan** : nom en lien simple vers le Style de jeu du membre, comme les autres classements —
  `PlayerNameBadge` mène au tableau de bord et sert aux pastilles. Tri par défaut Tête %, rangs par `RankCell`,
  évolution par `RankMovement` (colonne absente pour « Tous ») ; membres sous l'échantillon en bas, « — », sans rang ;
  sur mobile, `MobileRankList` des classés et une ligne « Sous l'échantillon : … ».
- **Coach** : en plus de l'outil, une ligne dans la liste des domaines du prompt (chaque outil y figure), un domaine
  de l'aide « Ce qu'il sait faire » (`coach-help.test.ts` l'impose) et un message d'attente. Pas de règle nouvelle.
- **Côté subi** : une baisse de la part de tête subie s'affiche en vert (« vs clan » et évolution).

### 9.3 Fichiers

| Rôle | Fichiers |
|---|---|
| Table | `prisma/schema.prisma` (`MemberBodyZoneStats`), `prisma/migrations/20261030180000_add_member_body_zone_stats/` — `migrate diff` n'annonçait que cette table |
| Calcul | `src/lib/pubg-telemetry/period-aggregates.ts` (zones accumulées dans la passe existante, `recalculateTelemetryPeriodForClan` exportée), `period-keys.ts` |
| Lecture | `src/lib/body-zone-stats.ts` (pur), `src/lib/body-zone-service.ts` ; routes `GET /api/members/[id]/telemetry/body-zones`, `GET /api/clans/[clanId]/telemetry/body-zones` |
| UI | `src/components/telemetry/BodyZonePanel.tsx` (partagé avec `MatchDebriefView`), `src/components/body-zones/BodyZoneSections.tsx`, pages `/members/[id]/playstyle` et `/clans/[clanId]/stats`, `page-scope-entries.ts` |
| Coach | `getBodyZones` dans `coach-tools.ts` ; `coach-help.ts`, `coach-chat-service.ts`, `coach-prompt.ts` |
| Scripts | `scripts/backfill-body-zone-stats.ts` (simulation par défaut, `--apply`), `scripts/check-body-zone-stats.ts` (lecture seule) |
| Supprimés | `src/lib/dashboard-progression.ts` et son test (copie UTC des clés de semaine, plus importée) |
| Docs | `docs/ui/index.html#zones-impact-periode`, `docs/ui/components.md` (`BodyZonePanel`), `docs/features/membres.md` §3 bis, `docs/features/statistiques.md`, `docs/features/coach-ia.md`, `docs/architecture/api-reference.md`, `CLAUDE.md`, `docs/sommaire.md` |

### 9.4 Contrôles faits

- `npx tsc --noEmit`, ESLint sur les fichiers touchés, Vitest complet (2 758 tests) : verts.
- Playwright (quatre projets, serveur de dev) : `player-playstyle`, `stats`, `debrief`, `sticky-toolbar`, `career`,
  `coach`, `members`, `player-matches`, `overview` — 347 verts ; puis `debrief` et `visual` après la correction de la
  colonne de valeur — 40 verts. Sept écarts dans la première passe : deux passent seuls (charge du serveur de dev) ;
  cinq du Coach sur mobile viennent de `/clans/[id]/overview`, **hors de ce chantier** — le segmented « Normal · Ranked ·
  Casual · Tournois · Tous » y fait 382 px sur 375, la page défile de côté et le bouton flottant sort de l'écran
  (aucun fichier de cette page modifié dans la copie de travail).
- Rendu vérifié par captures en clair et en sombre, ordinateur, tablette et mobile, sans défilement horizontal ; une
  valeur de barre passait sur deux lignes sur un clan (« 2 632 · 50 % ») : colonne de valeur de 72 px **au moins**,
  sans retour à la ligne (le débriefing ne change pas).
- Simulation du rattrapage (lecture seule), clan 25, S36 → S43 et septembre : 213, 291, 338, 312, 270, 311, 447 et 508
  parties par semaine, 1 220 pour septembre — environ 3 900 relectures de `memberStats` pour ce clan.

### 9.5 Reste à faire (déploiement)

1. `npx prisma migrate deploy` (la migration est **la seule écriture de schéma**), puis redémarrer les quatre services
   (`web`, `telemetry-worker`, `cron`, `telemetry-aggregates`).
2. Attendre une passe du worker d'agrégats : semaine, mois et « tous » se remplissent seuls ; avant, la section dit
   « Aucune touche localisée sur la période », jamais un zéro.
3. Rattrapage d'**un** clan, hors heures de jeu, **après accord** :
   `npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/backfill-body-zone-stats.ts --clan 25 --from-week 2026-36 --to-week 2026-43 --months 2026-09 --apply`
   puis `scripts/check-body-zone-stats.ts --clan 25 --week 2026-43` sans écart, et le relevé avant / après des lignes
   `MemberTelemetryStats` de ces semaines (§7). Puis les autres clans par lots (`--all-clans`, reprise `--from-clan`).
4. Mesures du §7 (durée d'un recalcul le lundi, taille de la table).
