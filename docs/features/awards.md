# Awards du clan

Les awards sont 11 distinctions fun calculées à la volée depuis les données de match stockées dans `SquadMember`. Ils récompensent le joueur le plus remarquable dans chaque catégorie sur la période choisie.

---

## Source de données

Toutes les valeurs proviennent de la table `SquadMember` — champs extraits de la réponse `GET /matches/{matchId}` de l'API PUBG sans télémétrie supplémentaire.

Fichiers concernés :
- `src/lib/awards-service.ts` — calcul et agrégation
- `src/app/api/clans/[clanId]/awards/route.ts` — route HTTP
- `src/app/clans/[clanId]/awards/page.tsx` — page UI

---

## Les 11 awards

| `key` | `label` | `description` | `unit` | Champ `SquadMember` | Agrégation |
|---|---|---|---|---|---|
| `top_killer` | Le croc mort | Plus de kills sur la période | kills | `kills` | total |
| `top_damage` | La brute | Plus de dégâts infligés | dégâts | `damage` | total, arrondi |
| `jacky_tuning` | JACKY TUNING | Plus de distance parcourue en véhicule | m | `rideDistance` | total, arrondi |
| `le_rodeur` | Le rôdeur | Plus de distance parcourue à pied | m | `walkDistance` | total, arrondi |
| `brouteur_herbe` | Le brouteur d'herbe | Temps de survie total le plus long | s | `timeSurvived` | total |
| `alcoolique_dimanche` | L'alcoolique du dimanche | Plus de boosts consommés | boosts | `boosts` | total |
| `fou_hopital` | Le fou de l'hôpital | Plus de soins utilisés | soins | `heals` | total |
| `destructeur` | Le destructeur | Plus de véhicules détruits | véhicules | `vehicleDestroys` | total |
| `le_sniper` | Le sniper | Kill le plus long sur la période | m | `longestKill` | maximum, arrondi |
| `collectionneur` | Le collectionneur d'armes | Plus d'armes ramassées | armes | `weaponsAcquired` | total |
| `brute_metal` | La brute de métal | Plus de kills depuis un véhicule | kills | `roadKills` | total |

---

## Logique de calcul (`awards-service.ts`)

La fonction `computeClanAwards(clanId, period)` :

1. Résout les bornes de période via `getPeriodBounds()` — lundi-dimanche pour `week`, 1er-dernier pour `month`, époque → 9999 pour `all`.
2. Charge tous les `SquadMember` des membres actifs du clan dans la fenêtre temporelle avec un `findMany` Prisma incluant les 12 champs stats.
3. Agrège par `memberId` dans une `Map`. Exception : `longestKill` utilise `Math.max` au lieu d'une somme.
4. Pour chaque award, construit le top 3 des membres ayant `value > 0` via `top3ByTotal()`, trié desc.
5. Retourne l'objet `ClanAwards` avec les 11 awards dans un ordre fixe.

Les membres sans participation (valeur = 0 sur tous les matchs) ne figurent pas dans les listes `top3`.

---

## Contrat API

### `GET /api/clans/[clanId]/awards`

**Auth** : `requireRole(['Owner', 'Admin', 'Member'])`
**Query param** : `?period=week` (défaut) | `month` | `all`

**Réponse 200** :

```typescript
type AwardWinner = {
  memberId: number      // id interne ClanMember
  memberName: string    // displayName
  value: number         // valeur brute (kills, mètres, secondes...)
}

type ClanAward = {
  key: string           // identifiant stable
  label: string         // libellé affiché
  description: string   // description courte
  unit: string          // unité
  top3: AwardWinner[]   // 0 à 3 entrées (vide si aucun joueur > 0)
}

type ClanAwards = {
  clanId: number
  period: 'week' | 'month' | 'all'
  periodKey: string     // ex. "week-2026-23", "month-2026-06", "all-time"
  matchCount: number    // nombre de matchs distincts dans la période
  awards: ClanAward[]   // toujours 11 entrées dans l'ordre du tableau
}
```

**Exemple de réponse** :

```json
{
  "clanId": 1,
  "period": "week",
  "periodKey": "week-2026-23",
  "matchCount": 14,
  "awards": [
    {
      "key": "top_killer",
      "label": "Le croc mort",
      "description": "Plus de kills sur la période",
      "unit": "kills",
      "top3": [
        { "memberId": 42, "memberName": "Kraken", "value": 37 },
        { "memberId": 7, "memberName": "Pagnol", "value": 29 },
        { "memberId": 15, "memberName": "Blade", "value": 24 }
      ]
    },
    {
      "key": "le_sniper",
      "label": "Le sniper",
      "description": "Kill le plus long sur la période",
      "unit": "m",
      "top3": [
        { "memberId": 7, "memberName": "Pagnol", "value": 412 }
      ]
    }
  ]
}
```

---

## Formatage des valeurs (UI)

La page `awards/page.tsx` applique la fonction `formatAwardValue(award, value)` :

| Award key | Logique | Exemple rendu |
|---|---|---|
| `brouteur_herbe` | `Xh Ym Zs` (heures omises si 0, minutes omises si 0) | `1h 23m 45s` / `4m 12s` / `58s` |
| `unit === 'm'` et `value >= 1000` | Conversion en km, locale `fr-FR`, 2 décimales max | `48,32 km` |
| `unit === 'm'` et `value < 1000` | Mètres entiers, locale `fr-FR` | `412 m` |
| `top_damage` et autres | Entier avec séparateur milliers `fr-FR` + unité | `8 234 dégâts` |

---

## Page `/clans/[clanId]/awards`

Client Component (`'use client'`). Structure :

1. **En-tête** (`app-panel`) : titre, description, bouton Rafraichir, `ClanSectionNav`.
2. **Sélecteur de période** (`app-panel`) : `SegmentedControl` Semaine / Mois / All Time + compteur de matchs.
3. **Grille d'awards** : `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`, une carte `app-panel` par award.

Chaque carte award contient :
- Clé de l'award en label secondaire (uppercase)
- `label` en titre principal (`h2`)
- Emoji thématique (table `AWARD_EMOJI_BY_KEY` dans la page)
- `description` en texte
- Liste ordonnée `top3` avec médaille (or/argent/bronze), nom du joueur, valeur formatée dans un bloc `app-panel-muted`
- Message "Pas de données sur cette période" si `top3` est vide

**États gérés** :
- `loading` : message "Chargement des awards..."
- `error` : message d'erreur en `text-rose-800`
- `refreshing` : bouton désactivé, label "Rafraichissement..."
- Redirection login automatique si 401/403

---

## Note de performance

Le calcul est entièrement à la volée à chaque GET. Il n'y a pas de cache ni de table pré-agrégée. Sur la période `all` avec un clan actif depuis longtemps, la requête `SquadMember.findMany` peut charger plusieurs milliers de lignes. Prévoir un indicateur de chargement côté UI et envisager un cache côté route si la latence devient problématique.
