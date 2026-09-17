# Objets consommés

Livré le 2026-09-17. Pages `/clans/[clanId]/stats/items` et `/members/[id]/items`, entrées de navigation
`clan.items` et `member.items`.

Répond à : **qu'est-ce que l'escouade consomme réellement en match ?** Soins, boosts, carburant et gadgets, objet par
objet, et non plus un simple compteur de boosts.

## Source : `LogItemUse`, pas `LogHeal`

`LogItemUse` porte directement `item.category` et `item.subCategory` :

```json
{"item": {"itemId": "Item_Heal_FirstAid_C",          "category": "Use",        "subCategory": "Heal"}}
{"item": {"itemId": "Item_Boost_AdrenalineSyringe_C", "category": "Use",        "subCategory": "Boost"}}
{"item": {"itemId": "Item_JerryCan_C",                "category": "Use",        "subCategory": "Fuel"}}
{"item": {"itemId": "Item_Mountainbike_C",            "category": "Use",        "subCategory": "Gadget"}}
{"item": {"itemId": "Item_Ammo_762mm_C",              "category": "Ammunition", "subCategory": "None"}}
```

`LogHeal` ne sert pas au détail par objet : son `itemId` est vide en production.

Le même événement couvre aussi les munitions et les accessoires : la persistance ne garde que `category === 'Use'`.
Sur une capture réelle, cela ramène 1 356 événements à 476 objets réellement consommés.

## Ce qui change dans le parser

- Nouveau tableau `itemUseSamples` (`{actorKey, itemId, category, subCategory}`), capturé **sans filtre** : sur le
  chemin de synchronisation principal, `clanMemberKeys` est vide, donc la résolution contre le roster se fait à la
  persistance.
- `boostsUsed` ne repose plus sur une détection par sous-chaîne de l'`itemId` (`boost`, `energy`, `adrenaline`,
  `painkiller`) mais sur `subCategory === 'Boost'`. Plus robuste, et couvre les objets ajoutés par les futures
  saisons. Les valeurs déjà stockées pour les anciens matchs gardent l'ancien calcul : elles ne sont pas recalculées.
- Les rappels (`recalls`) restent reconnus par leur `itemId` (`bluechip`), faute de sous-catégorie dédiée.

## Ce qui est enregistré

Table `MemberItemUseStat` (migration `20260917200000_add_member_item_use_stat`), sur le modèle de
`MemberThrowableStat` : `squadMatchId`, `memberId`, `itemId`, `category`, `subCategory`, `count`, `matchDate`, unique
sur `(squadMatchId, memberId, itemId)`. Remplacement idempotent à chaque reparse du match.

Un objet sans sous-catégorie déclarée est rangé sous `Unknown` plutôt que rattaché arbitrairement à une famille.

**Pas de rattrapage possible** : comme pour les lancers, les échantillons ne sont pas stockés dans
`SquadMatchTelemetry`. Seuls les matchs analysés après le déploiement auront leur détail par objet. Les matchs plus
anciens ne peuvent être récupérés qu'en les resynchronisant, dans la fenêtre de 14 jours du CDN PUBG.

## Les pages

Le même panneau (`ItemUsePanel`) sert aux deux portées :

- indicateurs : objets consommés, moyenne par match, famille dominante ;
- répartition par famille (Soins, Boosts, Carburant, Gadgets, Non classés) ;
- objets les plus consommés, en cartes sur mobile et en tableau sur desktop, avec icône (`ItemIcon`) et libellé
  (`resolveItemName`) ;
- classement par membre, sur la page clan seulement.

Filtre de période : semaine, mois, tous.

## Icônes

Les objets observés en production ont leur icône, sauf `Item_BulletproofShield_C` (bouclier pliable) : `ItemIcon`
n'affiche alors rien, le libellé reste correct. Après une nouvelle saison, relancer
`npm run sync:pubg-assets -- --items` pour couvrir les nouveaux objets.

Piège déjà traité : l'`itemId` du vélo est `Item_Mountainbike_C` (« b » minuscule) alors que l'asset est
`Item_MountainBike_C.png`. Une table d'alias dans `itemIconUrl()` s'en charge — invisible sur Windows, cassant sur
Linux sans cet alias.

## Contrôle sur données réelles

```bash
node --max-old-space-size=8192 node_modules/tsx/dist/cli.mjs scripts/inspect-item-use.ts [capture.json]
```

Compare un comptage manuel du fichier brut avec la sortie du parser, puis simule les lignes persistées. Les captures
sont tronquées à une taille maximale, donc illisibles par `JSON.parse` : le script lit le texte événement par
événement. Mesure du 2026-09-17 sur une capture réelle de 28 Mo : **1 356 événements comptés à la main, 1 356
échantillons produits par le parser**, dont 476 de catégorie `Use` — le reste étant des munitions.

## Voir aussi

- [Armes](weapons.md) — les lancers d'utilitaires (`MemberThrowableStat`), même schéma de persistance
- [Parser télémétrie](../telemetry/parser.md)
- `docs/TODO/todo.md`, section « `LogItemUse` (catégorie `Use`) »
