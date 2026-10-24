# Cartes du clan

> Page `/clans/[clanId]/stats/maps`, livrée le 2026-10-23 : refonte de l'ancienne « Heatmap kills » d'après la maquette
> Claude Design « Cartes clan - Fait ». Brief, chiffres mesurés et prompt : [cartes-clan.md](../TODO/cartes-clan.md).
> *Destiné à l'équipe de développement.*

## 1. Ce que montre la page

Où le clan gagne, où il perd des places et qui porte l'escouade, carte par carte.

- **Le verdict** (3 cartes ; une à la fois avec chevrons sous 640 px) :
  - *Carte forte* : le plus grand écart de Top 10 **au-dessus** de la moyenne des clans ;
  - *Carte à travailler* : le plus grand écart **en dessous**, avec sa tendance ;
  - *Carte la plus jouée* : sa part des parties.
  Une carte forte ou à travailler n'est désignée que si l'écart est du bon côté de zéro : un clan au-dessus de la
  moyenne partout n'a pas de carte « à travailler » (cas de 47R sur tout l'historique, mesuré le 2026-10-23).
- **Performance par carte** : une tuile par carte. Quatre chiffres principaux (Parties, Top 1, Win rate, Top 10), puis
  trois secondaires (Place moyenne, Kills / partie, Dégâts / partie). Sous le Top 10, la place et les kills : l'écart à
  la moyenne des clans (« +10 pts clans », « −1,2 clans »). Sous le Top 10 seulement : la tendance depuis la période
  précédente (« ▲ 10 pts »). Enfin le joueur phare, dont le nom mène à sa page Cartes.
- **Tri** : liste « Trier par » et bouton de sens. Médailles `RankCell` sur les trois premières tuiles comparables.
- **Filtres** : `PeriodFilter` (Semaine / Mois / Tous, « Mois » par défaut, `usePagePeriod`) et type de partie (Normal /
  Ranked / Casual / Tournois, comme la Ligue). Docké sur mobile : période et rappel court du tri, puis le type sur une
  seconde rangée resserrée (exception notée dans `ui-conformance.test.ts`).

## 2. Règles de calcul (`src/lib/clan-maps.ts`, pur et testé)

- **Une partie = une partie d'escouade du clan** (une ligne par `SquadMatch`) : placement de l'équipe, kills et dégâts
  des seuls membres actifs. C'est la règle de la Ligue des clans ; compter par joueur multiplierait les parties.
- **Moyenne des clans** : même règle sur tous les clans actifs ayant un clan PUBG, même période, même type de partie.
- **Échantillon** : sous `CLAN_MAPS_MIN_SAMPLE` (10) parties sur une carte, la tuile est estompée, marquée « Échantillon
  faible », rangée en fin de liste. Elle n'a ni écart, ni tendance, ni joueur phare, et n'entre pas dans le verdict.
- **Tendance** : même nature de période juste avant (semaine ou mois civil précédent) ; rien pour « Tous », ni quand la
  période précédente compte moins de 10 parties sur la carte.
- **Joueur phare** : membre actif avec le plus de kills par partie, d'au moins 10 parties sur la carte ; à égalité, le
  plus grand nombre de parties.

## 3. API — `GET /api/clans/[clanId]/map-stats?period=&matchType=`

- Garde : `requireNavPermission('clan.heatmap-kills')`. La clé de l'ancienne page est gardée, car elle protège la
  route (`NAV_GUARD_KEYS`).
- `period` : `week`, `month` ou `all` (défaut `month`). `matchType` : `parseLeagueMatchType` (défaut `official` ;
  `casual` couvre aussi l'Air Royale).
- Service `src/lib/clan-map-stats-service.ts` : quatre lectures SQL en parallèle (clan, période précédente, moyenne des
  clans, joueurs phares). La moyenne des clans est gardée 5 min en mémoire.
- Mesuré en lecture seule sur la production, sur « Mois » (618 parties, 8 cartes, 36 clans) : 1 à 3 s à froid, 70 à
  150 ms avec la moyenne en cache.
- Réponse : `ClanMapStatsPayload` (`src/lib/clan-maps.ts`) — clan, période, type, seuil, `comparedClans`, totaux,
  lignes par carte, verdict.

## 4. Accès, liens et menu

- Page publique : visiteurs compris.
- `/clans/[clanId]/stats/heatmap-kills` redirige vers la nouvelle adresse : redirection HTTP 307 de `next.config.ts`
  depuis le 2026-10-24 (avant, une page qui répondait 200 puis rafraîchissait).
- Lien depuis « Style de jeu du clan » : section « Aller plus loin » (Cartes, Armurerie, Carrière).
- SEO : `CLAN_PAGES`, chemin `/stats/maps`.
- Vue d'ensemble : groupe « Progresser ».
- Menu : le registre porte le libellé « Cartes » et l'adresse `/clans/:clanId/stats/maps`. En production, la ligne
  `NavItem` gardait « Heatmap kills », l'ancienne adresse et une surcharge de rôle `superuser` (lue le 2026-10-23).
  Le jour même, à la demande de l'utilisateur, la surcharge a été effacée et le libellé passé à « Cartes ».
  Reste l'adresse : après le déploiement, lancer `npx tsx scripts/cleanup-admin-nav.ts` (simulation), puis `--apply`.
  Jusque-là, l'ancienne adresse redirige vers la page.
- Chiffres en Teko (`t-hero`, charte §3) : 22 px dans les tuiles, 40 px dans le verdict. `app-stat-tile__value`, classe
  partagée avec la page Cartes du joueur, n'est pas utilisée ici : déclarée après `t-hero`, elle remettrait Inter 16 px.
- Supprimée avec l'ancienne page : la route `telemetry/heatmap`, dernier lecteur SQL de `SquadMatchTelemetry.summary`.

## 5. Tests

- Vitest :
  - `clan-maps.test.ts` : lignes, échantillon, verdict, joueurs phares, tri ;
  - `clan-map-stats-route-contracts.test.ts` : garde, période précédente, type, cache, erreurs ;
  - `admin-cleanup-plans.test.ts` : réouverture de l'entrée de menu.
- Playwright : `e2e/clan-maps.spec.ts`, réponse simulée calculée par les mêmes fonctions (`e2e/support/clan-maps.ts`).
  Couvre le visiteur, le verdict, les tuiles, le tri, l'état vide, le bandeau docké sur mobile et la redirection.
