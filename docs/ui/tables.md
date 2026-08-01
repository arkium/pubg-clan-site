# Inventaire des tableaux

## Résumé

L'application ne dispose pas d'un composant `<Table>` générique partagé. Chaque tableau conserve son propre markup, mais la base visuelle est centralisée dans `src/app/globals.css` via les classes `app-table-shell`, `app-table-head`, `app-table-row`, les variantes de podium et les tokens de thème.

Les tableaux les plus interactifs sont le classement clan, l'historique des matchs membre, l'historique PUBG API et le rapport détaillé. La pagination n'existe que sur les vues d'historique chargeant par pages. Le tri côté serveur est utilisé pour `MatchHistory` ; les autres tableaux trient localement.

---

## Inventaire par page

| Vue | Route | Composant / tableau | Pagination | Tri | Filtrage |
|---|---|---|---|---|---|
| Classement du clan | `/clans/[clanId]/leaderboard` | `Leaderboard` | Non | Oui (local, colonnes : Kills, K/M, Damage, Win Rate, Matchs) | Oui — période + mode `Clan` / `Inclus Solo` |
| Classement challenge | `/clans/[clanId]/challenges/[challengeId]` | `ChallengeLeaderboard` | Non | Non | Non |
| Dashboard membre — historique matchs | `/members/[id]/dashboard` | `MatchHistory` | Oui | Oui (serveur) | Oui — période |
| Page matchs membre — historique | `/members/[id]/matches` | `MatchHistory` | Oui | Oui (serveur) | Oui — période |
| Page matchs membre — imports récents | `/members/[id]/matches` | Tableau inline | Non | Non | Non |
| Récap soirée | `/clans/[clanId]/matches` | `SessionRecap` | Non | Non | Non |
| Rapport détaillé | `/clans/[clanId]/reports/[reportId]` | `ReportStats` | Non | Oui (local) | Non |
| Radar comparatif | `/members/[id]/dashboard` | `ComparisonRadar` | Non | Non | Non |
| Monitoring PUBG API | `/settings/pubg-api` | Tableau inline | Oui | Non | Oui — erreurs uniquement + taille de page |
| Checks cron | `/clans/[clanId]/settings/cron` | Tableau checks | Non | Non | Non |
| Historique cron | `/clans/[clanId]/settings/cron` | Tableau historique | Non | Non | Non |

### Notes par tableau

**Classement clan (`Leaderboard`)** : les distinctions joueur (Top Killer, Top Damage, Best Win Rate, MVP, Best K/M) sont calculées à la volée sur les données de la période sélectionnée. Le mode `Inclus Solo` intègre les matchs `solo clan` (un seul membre du clan présent dans la partie).

**Historique matchs (`MatchHistory`)** : le tri est global et piloté côté serveur. Un clic sur un en-tête envoie `sortBy` et `sortDirection` à l'API `/api/members/[id]/matches`, qui applique le tri avant la pagination. Voir la section "Mécanisme de tri MatchHistory" ci-dessous.

**Rapport détaillé (`ReportStats`)** : tri local sur kills, damage, matchs, assists, win rate.

**Monitoring PUBG API** : le filtre `errorsOnly` réduit l'historique aux seuls appels en erreur.

**Historique cron** : affiche les colonnes action, statut, début, durée, source (`manual` / `scheduler` / `system`), message. Alimenté par la table `CronExecution`.

---

## Centralisation du thème

La base commune des tableaux se trouve dans `src/app/globals.css` :

- Variables : `--app-border`, `--app-panel-radius`, `--app-panel-shadow`.
- Classes d'enveloppe : `app-panel`, `app-panel-muted`.
- Surcharges thème sous `body[data-app-theme]` pour les couleurs de fond, texte et bordure.

Le standard des tableaux de classement utilise :

- `app-table-shell` pour le cadre, le fond, le rayon et l'ombre ;
- `app-table-head` pour l'en-tête thémé ;
- `app-table-row` pour les séparateurs et le survol ;
- `app-table-row--top1`, `--top2` et `--top3` pour les rangs du podium ;
- `app-podium-badge` et ses variantes `--gold`, `--silver`, `--bronze` pour les rangs ;
- `tabular-nums` et un alignement à droite pour les métriques numériques.

Lorsqu'un tableau comporte trop de colonnes pour le mobile, une vue en liste synthétique remplace le tableau à partir du breakpoint `md` au lieu d'imposer un défilement horizontal à toute la page.

---

## Standard des boutons segmentés

Les filtres de période et les sélecteurs de métrique au-dessus des tableaux utilisent `SegmentedControl` (voir `docs/ui/components.md`). Classes CSS associées :

- `app-segmented-control` — conteneur du groupe.
- `app-segmented-control__item` — chaque bouton.
- `app-segmented-control__item--active` — état sélectionné.

Points de contrôle visuel :

- Le conteneur externe épouse le rayon du panneau parent sans second arrondi visible.
- Les boutons centraux restent plats (sans rayon).
- Les boutons d'extrémité (premier et dernier) reprennent le rayon du cadre.
- En thème sombre : fond, bordures et état actif restent lisibles sans halo clair.
- En mobile : le groupe reste compact et ne casse pas la hauteur des cartes voisines.

---

## Mécanisme de tri — `MatchHistory`

Le tri de `MatchHistory` est global et côté serveur, pas local sur la page courante.

**Côté UI :**

```typescript
type SortKey = 'pubgCreatedAt' | 'kills' | 'damageDealt' | 'placement'
type SortDirection = 'asc' | 'desc'

const [sortKey, setSortKey] = useState<SortKey>('pubgCreatedAt')
const [sortDir, setSortDir] = useState<SortDirection>('desc')

function handleSortClick(key: SortKey) {
  if (key === sortKey) {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  } else {
    setSortKey(key)
    setSortDir('desc')
  }
}
```

**Requête API :**

```
GET /api/members/[id]/matches?sortBy=kills&sortDirection=desc&page=1&pageSize=20
```

**Côté API :** le tri est exécuté dans le `findMany` Prisma avant `take`/`skip`, garantissant que la pagination reflète l'ordre trié global.

Clés de tri supportées par l'API :

| Clé | Colonne |
|---|---|
| `pubgCreatedAt` | Date du match |
| `kills` | Kills |
| `damageDealt` | Dégâts |
| `placement` | Placement |

---

## Mécanisme de tri — `Leaderboard`

Le tri du classement clan est local (client-side) car toutes les données de la période sont chargées en une seule requête.

```typescript
type LeaderboardSortKey = 'kills' | 'kpm' | 'damage' | 'winRate' | 'matches'

const [sortKey, setSortKey] = useState<LeaderboardSortKey>('kills')
const [sortDir, setSortDir] = useState<SortDirection>('desc')
```

Le changement de période ou de mode (`clan` / `inclus_solo`) déclenche un nouveau fetch.

---

## Homogénéisation future

Les tableaux historiques qui n'utilisent pas encore ces classes peuvent migrer progressivement vers ce standard sans introduire de composant générique tant que leurs comportements restent très différents.
