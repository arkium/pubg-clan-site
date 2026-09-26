# Débriefing tactique d'un match

> **Refonte livrée le 2026-09-26** — *destiné à l'équipe de développement.*
> Maquette : Claude Design, projet « Accueil chickendinner », fichier « Débrief télémétrie » (audit, écrans 7a à 7c
> pour l'existant, 8a à 8h pour la proposition ; composant `DebriefPropose`).

Pages : `/clans/[clanId]/telemetry/matches/[matchId]/debrief` (vue clan) et `/tournaments/[tournamentId]/matches/[matchId]`
(vue tournoi, même composant `MatchDebriefView`, avec le bandeau de la manche en plus).

---

## 1. Ce qui a changé

| Audit de la maquette | Réponse |
|---|---|
| 1 · Le thème clair ne s'appliquait pas (`bg-slate-950/900` codés en dur, textes remappés éteints) | Jetons partout : `.app-panel`, `.app-panel-muted`, classes Tailwind remappées, accent. Les couleurs sémantiques deviennent des jetons `--debrief-*` en clair et en sombre (`globals.css`, bloc « Débriefing tactique »). Seule la carte (replay, vignette de l'en-tête) reste sombre, par nature |
| 2 · Onglets : 4 accents, icône + emoji, pas de `tablist`, onglet perdu au rechargement | Un seul accent souligné, `role="tablist"` / `tab` / `tabpanel`, flèches ← → au clavier, onglet porté par `?tab=` (`combat` par défaut, absent de l'URL). Libellés : Chronologie, Replay, Escouade, Duels. Sur mobile, 4 cases égales avec icône |
| 3 · Vocabulaire anglais, emojis comme données, chiffres en `font-mono` | Kills, Mises à terre, Réanimations, Rappels, Tête, Assistances, Dégâts ; aucun emoji ; chiffres en Inter `tabular-nums` |
| 4 · Combat Log : cartes bordées à ~12 teintes, une ligne `nowrap`, marqueurs de phase collants, légende de 4 lignes | Liste continue groupée par phase, 2 lignes par événement, filet coloré pour les **seuls** kills et morts de l'escouade ; en-têtes de phase non collants (une seule couche collante) ; légende réduite à « Sources » (infobulle) ; détail dépliable : arme, distance, zone touchée, « Voir dans le replay → » |
| 5 · Replay : 3 barres de contrôle au-dessus d'une carte pleine largeur | Carte + barre de lecture sous la carte, panneau latéral de 300 px (joueurs affichés, suivi caméra, calques en interrupteurs, « Aller à ») ; sous la carte sur mobile |
| 6 · Escouade en tableau de 7 colonnes, Duels avec 3 paragraphes de légende | Cartes de joueur ; duels en deux colonnes avec score (+14 / −4) ; zones d'impact en barres, silhouette `DamageBodySvg` conservée à gauche sur ordinateur |

La bande des équipes suit la maquette : cartes paginées (4 par page, 2 sur mobile), classement, kills, « Chicken
dinner » ou « Out à mm:ss », barre de survie avec repères de phase, bouton « Escouade analysée ».

## 2. Écarts assumés avec la maquette

| Maquette | Implémentation | Pourquoi |
|---|---|---|
| Deux portées : Escouade / Tout le match | Troisième portée « Clans suivis » quand d'autres clans du site sont dans la partie | Filtre existant, conservé pour ne rien perdre (chronologie et replay) |
| Pastille de classement « #3 » teintée or/argent/bronze | `PlacementBadge` dans l'en-tête, `RankCell` (médailles) dans la bande | Règles de la refonte UI (§6 bis du CLAUDE.md) |
| « 2 fumigènes · 1 grenade » pour tous | Lancers des seuls membres suivis | `MemberThrowableStat` n'existe que pour les membres suivis |
| Distances à pied / en véhicule pour tous | Membres suivis seulement (API PUBG) | Voir §3, bug des distances de la télémétrie |

## 3. Bugs corrigés en passant (constatés sur une partie réelle du 2026-09-26)

- **Plusieurs « #1 »** dans la bande des équipes : une équipe partie avant l'avion (ni classement de fin, ni mort)
  passait « en vie à la fin », donc #1 estimé. `listMatchTeams` ne l'estime plus quand le lobby a son classement de fin
  (LogMatchEnd) : elle reste non classée, en fin de liste.
- **Lancers jamais affichés** : la vue lisait `smokeGrenadeCount`, alors que l'API renvoie une ligne par objet
  (`itemId`, `count`). Résumé désormais calculé par `throwableSummary`.
- **Distances fausses** : `memberStats.onFootDistanceMeters` / `vehicleDistanceMeters` sont en **centimètres** (unité
  de la carte) malgré leur nom, et comptent le vol et le parachute (« 861100m (pied) » pour 3,3 km réels). Le
  débriefing affiche `SquadMember.walkDistance` / `rideDistance` (mètres, API PUBG), servis dans `match.members`.
  Le champ de la télémétrie n'est plus lu pour l'affichage ; sa correction dans le parser reste à faire (§6).
- **« Arme »** affiché pour une mise à terre sans arme connue : la valeur de remplacement est supprimée du payload.

## 4. Données ajoutées au payload (`loadMatchDebriefPayload`)

| Champ | Source |
|---|---|
| `match.matchType` | `SquadMatch.matchType` (« Officiel », sinon `MatchTypeBadge`) |
| `match.durationSeconds` | `MAX(Match.duration)` par `pubgMatchId` ; `null` si aucune ligne |
| `match.members[].walkDistance`, `rideDistance` | `SquadMember`, mètres |
| `match.teams[].eliminatedAt` | Mort du dernier joueur de l'équipe (`deathSamples`, epoch) moins `createdAt` : secondes de match ; `null` si un joueur n'est jamais mort |

Côté client : nombre d'équipes du lobby (« #1 / 25 ») par `teamCountFromPhaseSnapshots` (même règle que la vitrine
de l'accueil), débuts de phase par `phaseStartTimes`, heure des duels = `timestampSeconds` du kill (epoch) moins
`createdAt`.

## 5. Fichiers

| Fichier | Rôle |
|---|---|
| `src/components/telemetry/MatchDebriefView.tsx` | En-tête, bande des équipes, onglets, Escouade, Duels |
| `src/components/telemetry/MatchCombatTimeline.tsx` | Chronologie |
| `src/components/telemetry/MatchReplay2D.tsx` | Rendu réorganisé (le moteur de dessin n'a pas changé) ; prop `startAt` pour « Voir dans le replay » |
| `src/lib/pubg-telemetry/debrief-view.ts` | Logique pure : onglet, horloge, phases, filtres et regroupement, pagination, survie, précision, distances, barres de zones, lancers |
| `src/lib/pubg-telemetry/match-teams.ts` | Équipe partie avant l'avion, `eliminatedAtEpoch` |
| `src/app/globals.css` (fin) | Jetons `--debrief-*`, `.debrief-seg`, `.debrief-chip`, `.debrief-row`, `.debrief-switch` |

## 6. Tests et suites

| Fichier | Contenu |
|---|---|
| `src/lib/pubg-telemetry/debrief-view.test.ts` | 15 tests des fonctions pures |
| `src/lib/pubg-telemetry/match-teams.test.ts` | + équipe partie avant l'avion, heure d'élimination |
| `e2e/debrief.spec.ts` | En-tête ; onglet dans l'URL, rechargement, clavier ; filtres, détail, lien vers le replay ; pagination et changement d'escouade ; cartes de joueur ; fond clair en thème clair — 4 profils |

**Reste à faire**

- Parser : convertir les distances de `memberStats` en mètres et exclure le vol et le parachute ; sans cela, aucune
  distance fiable pour les coéquipiers non suivis.
- Replay : pas de test e2e du canevas (payload `/replay` volumineux) — le test vérifie seulement l'ouverture de
  l'onglet et l'état d'erreur.
