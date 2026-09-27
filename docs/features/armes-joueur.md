# Armes d'un joueur — deux sources, deux onglets

Refonte livrée le 2026-09-27 (maquette Claude Design « Armes joueur », écrans 24a à 24f). Page `/members/[id]/weapons`.
Ancienne page archivée dans `archive/refonte-ui/armes-joueur/`. Sources de données détaillées : [Stats armes](weapons.md)
§1 (télémétrie) et §2 (maîtrise PUBG).

| Onglet (`?source=`) | Source | Période |
|---|---|---|
| **Suivi par le site** (défaut) | `GET /api/members/[id]/telemetry/weapons` + `GET /api/members/[id]/throwables` | Semaine / Mois / Tous (`usePagePeriod`, défaut Semaine) |
| **Carrière PUBG** (`?source=pubg`) | `GET /api/members/[id]/weapon-mastery` (POST pour rafraîchir) | Aucune : toute la carrière, synchronisée chaque nuit |

## 1. Ce que l'analyse de cohérence a corrigé

| Constat (page d'avant, maquette, données réelles) | Décision |
|---|---|
| Deux tableaux empilés, 7 et 9 colonnes en défilement horizontal, pagination à 5 boutons deux fois ; on ne savait pas pourquoi la période ne changeait que le second | **Deux onglets**, chacun avec sa source nommée et sa note en bas ; **cartes paginées** (6 par page, 4 sur mobile, ‹ 1 / 2 ›), aucun défilement horizontal |
| Maquette : paliers « Bronze / Argent / Or / Maître / Légende », présentés comme des exemples | `tier` (`TierCurrent`) est le **niveau d'expert** PUBG : +1 chaque fois qu'une arme passe le niveau 100 et repart de zéro ([pubg.com/fr/news/2847](https://pubg.com/fr/news/2847), lien donné le 2026-09-27). Relevé en base : 0 à 6, lié aux kills (une arme niveau 99 peut être expert 1 ou 6). Affiché « Expert N », **aucun nom inventé** ; la barre des paliers devient « Niveaux d'expert » |
| Maquette : niveau sur 100 ; doc : « 1 à 10+ » | Niveaux réels **1 à 99** (24 116 lignes, 2026-09-27) : l'anneau montre le niveau sur 100, sa couleur suit le niveau d'expert. Arme la plus maîtrisée = niveau d'expert, puis niveau, puis XP |
| Maquette onglet PUBG : « kill max » et tri « Distance » | `longestKillDistance` n'est renseigné que sur **105 lignes sur 24 116** (0,4 %) : retiré. Tri Niveau / Kills / Dégâts / **Knocks** ; la carte montre dégâts et XP |
| La catégorie de la maîtrise était calculée sur `weaponName` (« HK416 ») : le catalogue ne le connaît pas (alias « m416 ») et presque tout tombait dans « Autre » | Catégorie et libellé par l'**identifiant télémétrie** (`Item_Weapon_HK416_C` → `WeapHK416_C`, `masteryTelemetryId`) : 59 identifiants sur 61 reconnus, les 2 autres (grenade de zone, bombe collante) rangés dans Explosifs. La route renvoie `weaponLabel` (réglage `/settings/weapon-labels`) |
| Maquette : lancers « sur la période » — la route des lancers n'avait pas de période | `?period=week\|month` ajouté à `GET /api/members/[id]/throwables` (`MemberThrowableStat.matchDate`, index `[memberId, matchDate]`), même calendrier que la télémétrie |
| Lancers réels : l'objet le plus lancé de la semaine était « Juju » (53) | `Item_Weapon_Juju_C` = **orbe mystérieux** de l'événement Jujutsu Kaisen (PC, 10 au 24 septembre 2026), lancé sur une boîte de l'île de départ ([pubg.com/en/news/10991](https://pubg.com/en/news/10991)). Pomme, pierre, boule de neige et orbe **ne sont pas des lancers de combat** : écartés de l'emplacement 5 (`NON_COMBAT_THROWS`) |
| Maquette : loadout slot 1 = meilleur fusil d'assaut, slot 2 = meilleur DMR ou sniper | **Règle de l'armurerie du clan** (`buildLoadout`, décision du 2026-09-27) : slot 1 = l'arme la plus meurtrière, slot 2 = la meilleure d'une **autre famille** ; 3 pistolet, 4 mêlée, 5 lancers en pastilles (4 premiers, « +N autres ») |
| Télémétrie : une arme apparaît sous plusieurs identifiants (M416 et M416 de Duncan, Molotov et son feu au sol) ; des lignes ne sont pas des armes (`None`, véhicules, poings) — `None` porte des kills jusqu'à 164 m qui pouvaient faire un record | Variantes **fusionnées** par le catalogue (`aggregateMemberWeapons`) ; `OTHER` écarté du râtelier, des records et de l'arme de prédilection |
| Maquette : médailles « 1er / 2e / 3e » en pastilles | `RankCell` (médailles SVG), trois premiers en kills de la liste affichée (§6 bis) |
| Maquette : « 7 j / 30 j / Tout » | `PeriodFilter` du site : **Semaine / Mois / Tous** (calendaires) |
| Bouton « Synchro ↻ » pour tout le monde — la route POST refuse un visiteur | Bouton pour un membre connecté du clan du joueur ou un SuperUser ; sinon la date de synchro seule |
| Ancres « Maîtrise armes » / « Stats télémétrie » dans le bandeau | Supprimées (onglets). Le test d'ancres de `e2e/sticky-toolbar.spec.ts` passe sur le style de jeu du clan |

## 2. La page

- **Bandeau** (`DockingToolbar`) sur une ligne, **docké aussi sur mobile** : exception nommée à sticky.md §2
  (`MOBILE_DOCKED_EXTRA_CONTROLS`) — onglet (« Site » / « PUBG » sur mobile), période (Site) ou date de synchro (PUBG),
  pastille de catégorie (icône seule sur mobile tant qu'aucune n'est choisie, en accent sinon ; `?cat=`). La catégorie
  filtre **la liste** ; l'arme de prédilection, le loadout et les records portent sur toute la période.
- **Site** : arme de prédilection (kills, précision, headshots, kill max, parties), loadout, trois records (kill le plus
  long ; meilleure précision, 100 tirs minimum ; headshot machine, 5 kills minimum — seuils des hauts faits de
  l'armurerie), « Ton râtelier » trié par Kills / Précision / Headshots / Distance.
- **PUBG** : arme la plus maîtrisée (anneau de niveau, « Expert N », kills, knocks, dégâts, headshots), carrière toutes
  armes et répartition par niveau d'expert, « Maîtrise par arme » triée par Niveau / Kills / Dégâts / Knocks. Les armes
  jamais utilisées (niveau 0, aucun kill) n'ont pas de carte. Barres Knocks et Headshots relatives à la meilleure arme :
  l'API ne donne ni tirs ni touches.
- Changer de période garde les cartes, estompées, pendant le rechargement (`usePageData`). Aucun lien vers une page
  inexistante : la page ne pointe que vers le tableau de bord du joueur (fil d'Ariane).

Logique pure : `src/lib/weapons/member-arsenal.ts`. Composants : `src/components/member-weapons/MemberWeaponsSections.tsx`.
Images : `ArmoryWeaponImage` variante `card` (silhouette et icône carrée à la hauteur du cadre).

## 3. Routes

| Route | Changement |
|---|---|
| `GET /api/members/[id]/throwables?period=week\|month` | Période **facultative** (sans : tout) ; la réponse porte `period` |
| `GET /api/members/[id]/weapon-mastery` | Chaque ligne porte `weaponLabel` (libellé du site par l'identifiant télémétrie) |
| `GET /api/members/[id]/telemetry/weapons` | Inchangée |

Contrôle en lecture seule des données : `npx tsx scripts/check-member-weapons.ts [memberId]` (niveaux d'expert,
niveaux, fraîcheur des synchros, identifiants, lignes d'un joueur, lancers).

## 4. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/weapons/member-arsenal.test.ts` | Fusion des variantes, écart des lignes hors arme, moyenne pondérée, loadout (famille différente), records et seuils, tris, catégorie de la maîtrise, arme la plus maîtrisée (expert avant niveau), totaux, niveaux d'expert, lancers de combat |
| `src/lib/weapons/member-weapons-route-contracts.test.ts` | Période des lancers (calendrier, période inconnue), libellé de la maîtrise |
| `src/lib/ui-conformance.test.ts` | Exception nommée du bandeau docké complet sur mobile |
| `e2e/member-weapons.spec.ts` | Arme de prédilection (variantes fusionnées), loadout et lancers, records (la ligne `None` ne bat pas le Kar98k), cartes paginées, médailles, tri, catégorie et `?cat=`, période qui ne recharge pas la maîtrise, bandeau docké sur une ligne ; onglet PUBG : expert, carrière, synchro sans bouton pour un visiteur, lien direct `?source=pubg&cat=AR`, rafraîchissement par un membre connecté. Données : `e2e/support/member-weapons.ts` |
