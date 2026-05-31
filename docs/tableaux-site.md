# Inventaire des tableaux du site

Ce document liste les tableaux visibles dans l’application, avec les contrôles disponibles et le niveau de centralisation du thème.

## Résumé rapide

- Les tableaux les plus interactifs sont le classement clan, l’historique des matchs membre, l’historique PUBG API et les stats détaillées du rapport.
- La pagination existe seulement sur les vues d’historique qui chargent leurs données par pages.
- Le tri est surtout présent sur les tableaux orientés performance.
- Le filtrage existe sur certaines pages d’historique et sur le monitoring PUBG API.
- Il n’existe pas de composant table unique partagé, mais la base visuelle est centralisée dans `src/app/globals.css` via des tokens et des surcharges de thème.

## Tableaux et contrôles

| Vue | Route | Composant / tableau | Pagination | Tri | Filtrage | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Classement du clan | `/clans/[clanId]/leaderboard` | `Leaderboard` | Non | Oui (`Kills`, `K/M`, `Damage`, `Win Rate`, `Matchs`) | Oui, période + mode `Clan` / `Inclus Solo` | Le tri agit sur la période sélectionnée. Le mode `Inclus Solo` inclut les stats `solo clan` (un seul membre du clan dans le match). Les distinctions joueur sont calculees a la volee (Top Killer, Top Damage, Best Win Rate, MVP, Top K/M). |
| Classement challenge | `/clans/[clanId]/challenges/[challengeId]` | `ChallengeLeaderboard` | Non | Non | Non | Tableau simple de progression / points. |
| Tableau de bord membre, historique des matchs | `/members/[id]/dashboard` | `MatchHistory` | Oui | Oui (serveur) | Oui, période | Tableau réutilisé aussi sur la page matchs membre. Le tri est appliqué côté API avant pagination. |
| Page matchs membre, historique des matchs | `/members/[id]/matches` | `MatchHistory` | Oui | Oui (serveur) | Oui, période | Même composant que sur le dashboard. Le tri est appliqué côté API avant pagination. |
| Page matchs membre, imports récents | `/members/[id]/matches` | Tableau d’import des matchs récents | Non | Non | Non | Liste d’attente d’import, pas de pagination. |
| Récap par soirée | `/clans/[clanId]/matches` | `SessionRecap` | Non | Non | Non | Tableau récapitulatif par mode. |
| Rapport détaillé | `/clans/[clanId]/reports/[reportId]` | `ReportStats` | Non | Oui | Non | Tri par kills, damage, matches, assists, win rate. |
| Radar comparatif | `/members/[id]/dashboard` | `ComparisonRadar` | Non | Non | Non | Petit tableau de comparaison joueur / clan. |
| Monitoring PUBG API | `/settings/pubg-api` | Tableau d’historique des appels API | Oui | Non | Oui, `errorsOnly` + taille de page | Le filtrage réduit l’historique aux erreurs. |
| Monitoring cron, checks | `/clans/[clanId]/settings/cron` | Tableau des checks | Non | Non | Non | Tableau d’état / diagnostic. |
| Monitoring cron, historique | `/clans/[clanId]/settings/cron` | Tableau de l’historique des cron | Non | Non | Non | Dernières exécutions enregistrées. |

## Centralisation du thème

Le thème des tableaux est partiellement centralisé.

- La base commune se trouve dans `src/app/globals.css`, avec des variables comme `--app-border`, `--app-panel-radius`, `--app-panel-shadow`, ainsi que des tokens de thème pour les couleurs et les fonds.
- Les classes génériques comme `app-panel` et `app-panel-muted` fournissent une enveloppe visuelle cohérente.
- Les surcharges sous `body[data-app-theme]` remappent les utilitaires Tailwind fréquents pour harmoniser le mode clair et le mode sombre.

En revanche, il n’existe pas de composant table unique ni de style table dédié partagé partout. Chaque tableau garde son propre markup, ses espacements, ses en-têtes et ses variantes visuelles.

## Standard Réutilisable

Le standard commun pour les groupes de boutons segmentés est désormais centralisé via les classes suivantes :

- `app-segmented-control` pour le conteneur du groupe.
- `app-segmented-control-item` pour chaque bouton segmenté.
- `app-segmented-control-item-active` pour l’état sélectionné.

Usages actuellement branchés sur ce standard :

- [src/components/dashboard/PlayerStats.tsx](src/components/dashboard/PlayerStats.tsx) pour le sélecteur de période.
- [src/components/dashboard/MatchHistory.tsx](src/components/dashboard/MatchHistory.tsx) pour le sélecteur de période.
- [src/components/dashboard/ProgressionChart.tsx](src/components/dashboard/ProgressionChart.tsx) pour le sélecteur de métrique.

Points de contrôle visuel pour vérification :

- Le conteneur extérieur doit épouser le rayon du panneau sans ajouter de second arrondi visible.
- Les boutons du milieu doivent rester plats.
- Les boutons du bord gauche et droit doivent reprendre le rayon utile du cadre.
- En thème sombre, le fond, les bordures et l’état actif doivent rester lisibles sans halo clair.
- En mobile, le groupe doit rester compact et ne pas casser la hauteur des cartes ou des sections voisines.

## Mécanisme de tri (MatchHistory)

Le tri de `MatchHistory` ne se fait plus localement sur la page courante. Il est désormais global et piloté côté serveur.

- Côté UI, un clic sur l’en-tête d’une colonne (`Date`, `Kills`, `Damage`, `Place`) met à jour `sortKey` et `sortDir` (asc/desc).
- Ces valeurs sont envoyées à l’API `/api/members/[id]/matches` via les paramètres `sortBy` et `sortDirection`.
- Côté API, le tri est exécuté dans la requête `findMany` avant `take`/`skip` (pagination).
- Résultat: la pagination reflète l’ordre trié global, et non un tri limité aux lignes déjà affichées.

Clés de tri supportées:

- `pubgCreatedAt`
- `kills`
- `damageDealt`
- `placement`

## Conclusion

Si tu veux homogénéiser davantage les tableaux, le meilleur point d’entrée est de créer un composant ou des classes utilitaires communes pour les tables, puis de les faire reposer sur les tokens déjà présents dans `src/app/globals.css`.