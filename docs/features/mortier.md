# Mortier — entraînement et guide

Page `/mortier`, entrée « Mortier » du menu principal, juste sous « Tournois ». Un mini-jeu pour apprendre à régler
le mortier de PUBG à la grille de la carte, un classement « Artilleurs du clan » et un guide en quatre fiches.

Maquette source : Claude Design, projet « Audit design avec améliorations », fichier « Mortier - A faire » (bureau
1280 px et mobile 375 px : avant le tir, après le tir, fin de série, guide). Décisions prises le 2026-10-04 :
séries enregistrées en base, fond de carte haute définition officiel, difficultés par tolérance et dénivelé, lien dans
le menu latéral.

## 1. Règles du jeu

Toutes les règles vivent dans `src/lib/mortar/mortar-game.ts`, fichier pur partagé par la page, les routes et les
tests e2e.

| Règle | Valeur | Source |
|---|---|---|
| Portée | 121 à 700 m ; en dessous, le mortier refuse de tirer | jeu |
| Réglage | flèches ±1 m, Maj + flèche et boutons ±25 m, défaut 300 m à chaque cible | maquette |
| Série | 10 cibles, un tir par cible | maquette |
| Au but | écart ≤ tolérance de la difficulté | décision 2026-10-04 |
| Score d'une série | moyenne des écarts absolus, au dixième de mètre (le plus bas est le meilleur) | maquette |

| Difficulté | Au but | Distances | Dénivelé |
|---|---|---|---|
| Facile | ±15 m | 150 à 400 m | aucun |
| Moyen | ±10 m | 121 à 700 m | aucun |
| Difficile | ±5 m | 121 à 700 m | ±10 à ±40 m, par pas de 10 m, jamais nul |

**Dénivelé (mode Difficile).** L'obus retombe en cloche : une cible plus haute que le tireur est touchée plus tôt sur
la trajectoire. Règle d'entraînement : chaque mètre de dénivelé décale l'impact d'un demi-mètre
(`MORTAR_ELEVATION_FACTOR = 0.5`), soit **5 m de plus par 10 m de hauteur**, 5 m de moins par 10 m plus bas.
C'est une simplification assumée — le jeu ne publie pas sa balistique ; le coefficient se règle en un seul endroit.

**Cibles.** `generateMortarTargets(seed, difficulty)` tire les dix cibles d'une graine (générateur déterministe) :
même graine, mêmes cibles côté navigateur et côté serveur. Chaque cible a son propre tireur, placé au hasard sur
l'extrait : c'est ce qui permet de couvrir toute la portée, 700 m compris, sur 1 000 × 600 m. Une cible n'est
retenue que si sa distance et le réglage qu'elle demande (dénivelé compris) restent dans la portée.

**Impact.** Sur la ligne tireur → cible, à la distance réellement parcourue (`réglage − 0,5 × dénivelé`). Écart
signé au mètre : négatif = trop court, positif = trop long.

## 2. Carte

Extrait de 1 000 × 600 m de Sanhok autour de Bootcamp (de 1 500 à 2 500 m d'ouest en est, de 1 700 à 2 300 m du nord au sud),
calé sur la grille de 100 m du jeu : `public/maps/mortar/sanhok-bootcamp.webp` (1 400 × 840 px, 154 Ko).

- Source : carte officielle haute définition `Sanhok_Main_High_Res.png` du dépôt `github.com/pubg/api-assets`
  (8 192 px pour 4 096 m, 0,5 m par pixel ; 75 Mo, **non versionnée**).
- Reproduire ou changer l'extrait : `npx tsx scripts/build-mortar-map.ts <chemin/Sanhok_Main_High_Res.png>`. Les
  constantes du script doivent rester alignées sur `MORTAR_MAP`.
- Bandeau de la page : `/nouveaute-mortier.jpg` (depuis le 2026-10-05, auparavant `/cartographie-tactique.jpg`), la même
  image que la carte « Nouveautés » de la vitrine — générée par IA, signalé dans les mentions légales.

## 3. Enregistrement des séries et classement

Une série se joue entièrement dans le navigateur ; le serveur ne fait que fixer la graine au départ et recalculer le
score à l'arrivée. Un client ne peut donc pas envoyer un faux écart : seuls ses dix réglages et ses temps comptent.

| Route | Rôle |
|---|---|
| `POST /api/mortar/series` `{ difficulty }` | Membre connecté : ouvre une série (une seule ouverte par joueur) et renvoie sa graine. Visiteur : graine seule, `recorded: false`, rien n'est écrit. |
| `POST /api/mortar/series/:seriesId/finish` `{ shots }` | Dix `{ setting, timeMs }` : contrôlés (portée, temps plausibles, somme des temps ≤ temps réel écoulé), score recalculé depuis la graine, record comparé au meilleur précédent. |
| `GET /api/mortar/leaderboard?clanId=&difficulty=` | « Artilleurs du clan » : membres actifs du clan ayant fini une série à ce niveau, meilleur écart moyen et nombre de séries ; dix premiers + ligne du lecteur. |

Contrat des réponses : `src/lib/mortar/mortar-api.ts`. Service : `src/lib/mortar/mortar-service.ts`.

**Table `MortarSeries`** (migration `20261004190000_add_mortar_series`) : une ligne par série — membre, difficulté,
graine, statut (`started` puis `finished`), écart moyen, tirs au but, temps moyen, détail des dix tirs. Le classement
lit les séries `finished` des membres **actuellement** dans le clan : un joueur transféré emporte ses records.

> **Base.** Migration **appliquée le 2026-10-04** sur la base de `.env` (`pubg_clan_smk`, distante, partagée par le
> développement et la production) par `npx prisma migrate deploy` ; `migrate diff` vide ensuite. Sans la table, les
> trois routes répondent 500 et la page se rabat sur une série non enregistrée.

Détails du service : graine de 10 caractères hexadécimaux (`crypto`) ; départ 201 (série enregistrée) ou 200
(visiteur) ; fin de série contrôlée dans l'ordre 401 (pas de membre actif), 404, 403 (série d'un autre), 409 (déjà
terminée, ou expirée au-delà de 2 h), 400 (tirs invalides, ou somme des temps supérieure au temps réel écoulé + 5 s),
réponses d'erreur `{ error, code }` ; la mise à jour ne vaut que si la série est encore `started` (deux envois
simultanés : le second reçoit 409). Un écart égal au record n'est pas un nouveau record. Classement départagé par le
meilleur écart, puis le nombre de séries, puis le nom.

**Anti-triche, limite assumée.** La graine est forcément connue du navigateur, donc les cibles aussi : un joueur
outillé peut calculer les réglages parfaits. Le contrôle des temps borne seulement la vitesse. Une protection
complète demanderait de servir les cibles une à une avec un horodatage serveur par tir — disproportionné pour un
entraînement.

## 4. Page

`src/app/mortier/page.tsx` et `src/components/mortar/` — selon la charte UI (`docs/ui/index.html`).

- **Bandeau** photo, titre Teko, onglets Entraînement / Guide (`?tab=guide`).
- **Entraînement.** Avant le tir : difficulté, tolérance, progression de la série (pastilles au but / raté / en
  cours), chronomètre, carte avec grille, « Toi » et « Cible » (dénivelé en Difficile), réglage en chiffre héros,
  curseur, ±25, « Tirer ». Après le tir : ligne et distance réelle, impact, verdict (« Trop court de 18 m »,
  « Trop long… », « Au but »), ton tir / distance / écart, « Cible suivante ». Fin de série : écart moyen, tirs au
  but, temps moyen, record perso (tampon « Nouveau record »), barres divergentes des dix tirs, « Rejouer ». Un
  visiteur joue sans enregistrement et est invité à se connecter.
- **Artilleurs du clan** : clan sélectionné, difficulté affichée, rangs par `RankCell`, ligne du lecteur à l'accent
  (« Toi »).
- **Guide** : 01 Les bases (sol à plat, ciel dégagé, portée, zone hachurée trop près) ; 02 Mesurer à la grille
  (3 carrés × 2 carrés = 361 m, table `mortarGridTable`) ; 03 Corriger le tir (dénivelé, pas de 25 m) ; 04 Jouer en
  équipe (tireur, observateur, annonces courtes). Chaque fiche renvoie vers l'entraînement à la difficulté qui
  l'exerce (01 Facile, 02 Moyen, 03 Difficile, 04 Moyen).

Choix de mise en œuvre (`src/components/mortar/`, utilitaires purs dans `src/lib/mortar/mortar-view.ts`) :

- **Une série demandée et pas encore jouée est réutilisée pendant 15 s** par un nouveau montage : le shell remonte la
  page quand la session arrive, ce qui aurait ouvert une série de plus à chaque visite d'un membre. Au pire, une
  seule série `started` reste par joueur (la suivante la supprime au départ).
- **Onglets** : `window.history.replaceState(null, …)` plutôt que `router.replace`, qui recréait la page et perdait la
  série ; l'entraînement reste monté quand on lit le guide, la série en cours est conservée.
- **Chronomètre** : temps de visée cumulé de la série (pas le temps écoulé) ; chaque tir est borné de 300 ms à
  5 min, les bornes que la route de fin de série accepte.
- **Clavier** : flèches ±1 m, Maj + flèche ±25 m, Entrée = Tirer. « Rejouer » est en tête du bilan, visible sans
  défiler. Un visiteur voit trois indicateurs (pas de record).
- **Menu** : entrée `primary.mortar` (`ClanNavigation.tsx`, `nav-permissions-registry.ts`), icône viseur choisie par
  son libellé dans `src/components/ui/NavIcon.tsx`.

## 5. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/mortar/mortar-game.test.ts` | Cibles déterministes et dans la portée pour chaque difficulté, écart et verdict, dénivelé, impact, score d'une série, contrôle des tirs reçus, table de la grille, formats |
| `src/lib/mortar/mortar-route-contracts.test.ts` | Départ visiteur / membre, score recalculé côté serveur, record, refus (série d'un autre, terminée, expirée, tirs ou temps invalides), classement |
| `e2e/mortar.spec.ts` | Page complète, toutes les API simulées : tir, verdict, série, résumé et record, visiteur, classement, guide, lien du menu, aucun défilement horizontal |

## 6. Limites et pistes

- Une seule carte (Sanhok, Bootcamp). D'autres extraits se produisent avec le même script ; il faudrait alors une
  clé de carte dans la série et le classement.
- Le dénivelé est une règle d'entraînement simplifiée (§1).
- Les séries `started` abandonnées restent en base jusqu'au départ suivant du même joueur, qui les supprime.
- La télémétrie connaît déjà les tirs de mortier réels (`Mortar_Projectile_C`, catégorie « Spécial » de
  l'armurerie) : un « tableau de chasse au mortier » du clan pourrait compléter l'entraînement.
