# Logique de calcul de la page Matchs clan

Ce document explique comment est calculee la page `/clans/[clanId]/matches`, avec les memes thematiques que la doc leaderboard: source des donnees, filtres, methodes d aggregation, formules et points d attention.

## Resume rapide

- La page Matchs consomme l API `GET /api/clans/[clanId]/matches`.
- Le calcul est fait a la volee depuis `SquadMatch` et `SquadMember`, avec un enrichissement de duree via `Match`.
- La periode supportee est `week` ou `month`.
- Le filtre mode (`duo`, `trio`, `squad`) est applique selon le nombre de membres clan detectes dans le match, pas sur `gameMode` PUBG brut.
- Les blocs principaux renvoyes sont: `squads`, `stats`, `modePerformance`, `sessions`, `synergies`, `topPerformers`.
- La liste detaillee des matchs n est plus sur la page principale: elle est accessible par sous-page de date depuis `Recap par soiree`.

## Route et fichier principal

- API: `src/app/api/clans/[clanId]/matches/route.ts`
- Page UI: `src/app/clans/[clanId]/matches/page.tsx`
- Hook client: `src/hooks/useSquadMatches.ts`
- Types: `src/types/squad-matches.ts`

## Contrat de reponse (payload)

Les champs majeurs renvoyes par l API Matchs sont:

- `stats`: KPI globaux de la periode/mode
- `modePerformance`: agrégats duo/trio/squad utilises par le cadre `Performances duo/trio/squad`
- `sessions`: recap par date
- `synergies`: top paires et top squads
- `topPerformers`: tops individuels (kills, damage, survie)

## Parametres d entree

La route accepte:

- `period`: `week` ou `month` (defaut `week`)
- `gameMode`: `duo`, `trio` ou `squad` (optionnel)

Validation appliquee:

- `clanId` doit etre un entier positif.
- `gameMode` est ignore s il n est pas dans la liste autorisee.

## Periode appliquee

La page Matchs travaille sur des periodes calendaires, alignees avec le leaderboard:

- `week`: du lundi 00:00:00 au dimanche 23:59:59.999
- `month`: du premier jour du mois 00:00:00 au dernier jour du mois 23:59:59.999

Le filtre temporel est applique sur `SquadMatch.createdAt`.

## Notion de mode equipe utilisee

Le mode retenu pour les filtres et la dispo des modes est derive du nombre de membres du clan presents dans le `SquadMatch`:

- `<= 2` membres -> `duo`
- `3` membres -> `trio`
- `>= 4` membres -> `squad`

Important:

- ce mapping n utilise pas directement `SquadMatch.gameMode`.
- le filtre `gameMode` de la page porte donc sur le mode equipe clan detecte.

## Source des donnees chargees

### 1. Matchs equipe (`SquadMatch`)

La route charge tous les `SquadMatch` de la periode pour lesquels au moins un membre actif du clan est present.

Pour chaque match, la route inclut:

- les membres (`SquadMember`) ordonnes par `memberId`
- les stats membre (kills, damage, assists, revives, placement)

Puis construit `squads` avec:

- metadonnees match (`pubgMatchId`, map, placement, createdAt)
- totaux match (`totalKills`, `totalDamage`, `totalAssists`, `totalRevives`)
- liste des membres
- `isWin = placement === 1`

### 2. Duree moyenne par match (`Match`)

La duree (`durationSeconds`) est enrichie via un `groupBy` sur `Match`:

- groupement par `pubgMatchId`
- filtre sur les membres actifs du clan
- moyenne `_avg.duration`

Ensuite:

- `durationSeconds = round(avgDuration)`
- fallback a `0` si la valeur est absente

## Etapes d aggregation

Apres chargement de `squads`, la route applique le filtre `gameMode` (si fourni), puis calcule les blocs ci-dessous.

Tous les cadres principaux de la page Matchs partagent maintenant la meme base de calcul (`filteredSquads`) cote API:

- `Performances duo/trio/squad` (bloc `modePerformance`)
- `Synergies`
- `Meilleures performances`

Objectif:

- eviter un calcul client different pour un des cadres
- garantir la coherence des chiffres affiches pour une meme periode/mode

### A. Stats globales (`stats`)

Accumulation sur `filteredSquads`:

- `totalKills += match.totalKills`
- `totalDamage += match.totalDamage`
- `matchCount += 1`
- `wins += isWin ? 1 : 0`

Formule:

- `winRate = wins / matchCount` (sinon `0`)

### A bis. Performance par mode clan (`modePerformance`)

La route calcule aussi les agrégats par mode clan (`duo`, `trio`, `squad`) sur la meme boucle `filteredSquads`:

- `matches`
- `kills`
- `wins`
- `losses`
- `damage`
- `assists`
- `durationSeconds`

Ce bloc alimente directement le cadre `Performances duo/trio/squad` de la page.

### B. Sessions par jour (`sessions`)

Regroupement par date ISO `YYYY-MM-DD` derivee de `createdAt`.

Pour chaque session:

- liste des matchs du jour
- `totalDuration` (somme)
- `totalKills` (somme)
- `totalDamage` (somme)
- `winRate` (wins / nombre de matchs du jour)
- membres uniques presents dans la session

Tri final:

- sessions triees par date descendante
- matchs dans chaque session tries par `createdAt` descendant

### C. Synergies (`synergies`)

Deux aggregats sont produits:

- `topPairs`: toutes les paires de membres (combinaisons 2 a 2)
- `topSquads`: compositions de 3 ou 4 membres exactes

Clé de regroupement:

- concat des `memberId` tries, avec `:`

Pour chaque cle:

- `matchesPlayed`
- `wins`
- `totalKills`
- `totalDamage`
- `winRate = wins / matchesPlayed`

Regle de tri des synergies:

1. `matchesPlayed` desc
2. `winRate` desc
3. `totalKills` desc

Puis limitation:

- `topPairs`: 5 premiers
- `topSquads`: 5 premiers

### D. Top performers (`topPerformers`)

Aggregation par membre:

- `matchesPlayed`
- `totalKills`
- `totalDamage`
- `placementTotal` (somme des placements de match)

Metrique derivee:

- `averagePlacement = placementTotal / matchesPlayed`

Trois classements sont renvoyes:

- `kills`: tri par kills desc
- `damage`: tri par damage desc
- `survival`: tri par averagePlacement asc (plus petit = meilleur)

Tie-break commun:

1. metrique principale
2. `matchesPlayed` desc
3. `displayName` asc

Puis limitation:

- 5 premiers par categorie

## Modes disponibles (`availableModes`)

La route expose les modes detectes sur la periode via:

- `new Set(teamModeFromMemberCount(match.members.length))`

Point important:

- cette liste est calculee sur `squads` avant application du filtre `gameMode`.
- le client s en sert pour activer/desactiver les boutons de filtre.

## Mapping labels de carte

La route renvoie `mapLabels` via `getMapLabels()` pour remplacer les noms bruts de map dans l UI.

## Cache client

Le hook `useSquadMatches` applique un cache memoire en front:

- cle: `clanId:period:gameMode`
- reutilise les donnees deja chargees pour une meme combinaison

## Limites actuelles

- Pas de pagination sur `squads`.
- Synergies et top performers limites au top 5.
- Le mode `solo` n existe pas sur cette page: on parle uniquement de matchs equipe detectes.

## Navigation detail par date (recap par soiree)

Depuis `Récap par soirée`, chaque carte de date est cliquable et ouvre une sous-page:

- route: `/clans/[clanId]/matches/session/[date]`
- parametres conserves: `period` et `gameMode` (query string)

Sur cette sous-page:

- les cartes de performance de la page Matchs sont conservees (resume + performances duo/trio/squad)
- la section matchs reprend le rendu de `Derniers matchs ensemble` sans limite (liste complete des matchs de la date)

### Comportement de la page principale apres evolution

- La section `Derniers matchs ensemble` a ete retiree de `/clans/[clanId]/matches` pour eviter la duplication avec la sous-page date.
- Le parcours detail devient: page Matchs -> `Recap par soiree` -> detail date.

### Validation et filtrage de la sous-page

Sur `/matches/session/[date]`:

- la date est validee au format `YYYY-MM-DD`
- si `clanId` est invalide, redirection vers `/clans`
- la liste est filtree localement sur `match.createdAt.slice(0, 10) === date`

### Navigation entre dates

La sous-page calcule toutes les dates de session disponibles, puis derive:

- `previousDate` (date plus ancienne)
- `nextDate` (date plus recente)

UI associee:

- bouton `Retour aux matchs` vers `/clans/[clanId]/matches` en conservant `period` et `gameMode`
- boutons `Soiree precedente` / `Soiree suivante` actifs si date disponible, sinon etat desactive
- version mobile optimisee: boutons de navigation alignes et labels compacts

### Reutilisation des composants UI

Les sous-pages et sections associees reposent sur des composants mutualises:

- `SquadMatchList` reutilise pour le detail date avec `limit={sessionMatches.length}`
- `PlacementBadge` pour les classements de match
- `PlayerNameBadge` pour les noms de joueurs dans la liste des matchs et les synergies
- `TeamModeBadge` pour les blocs mode (duo/trio/squad)

## Point d attention

Comme les aggregations sont faites a la volee, le cout augmente avec:

- le nombre de `SquadMatch` dans la periode
- la taille moyenne des teams (combinatoire des paires)

Si la volumetrie augmente fortement, envisager:

1. un cache serveur court sur la reponse API
2. une borne configurable sur le nombre de matchs aggregates
3. une pagination/virtualisation de la liste `squads`

## Fichiers a connaitre

- `src/app/api/clans/[clanId]/matches/route.ts`: calcul principal
- `src/hooks/useSquadMatches.ts`: chargement + cache client
- `src/app/clans/[clanId]/matches/page.tsx`: composition UI
- `src/app/clans/[clanId]/matches/session/[date]/page.tsx`: detail par date + navigation precedente/suivante
- `src/components/SessionRecap.tsx`: cartes de recap cliquables vers la sous-page
- `src/components/SquadMatchList.tsx`: rendu des cartes match (reutilise en detail date)
- `src/components/SquadSynergies.tsx`: synergies avec badges joueurs
- `src/types/squad-matches.ts`: contrat de donnees