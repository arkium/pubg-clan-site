# Idées — Comparaison de performances entre clans

Aujourd'hui, le site est strictement mono-clan : isolation garantie par `ensureMemberInClan()`, aucune page ne compare deux clans entre eux. Ce document propose des pistes pour introduire une dimension **inter-clans**, en s'appuyant au maximum sur les données déjà collectées (`clanStats`, `PlayerStats`, `Match`, `SquadMatch`) plutôt que sur de nouveaux pipelines.

---

## 0. Constat de départ

| Élément | État actuel |
|---|---|
| Isolation clan | Stricte — un Owner/Admin/Member ne voit que son propre clan (voir `docs/features/clans.md` §3, `docs/TODO/TODO2.md`) |
| Données déjà agrégées par clan | `Clan.clanStats` (JSON) : totaux kills/damage/matches/winRate + top performers, recalculé chaque nuit par `syncTrackedClanStats()` |
| Multi-clan en DB | Oui — `GET /api/clans` liste déjà tous les clans actifs avec comptage membres/matchs |
| SuperUser | Seul rôle à avoir une vue cross-clan aujourd'hui |

Toute fonctionnalité de comparaison inter-clans est donc un **choix de politique de confidentialité** autant qu'une feature technique : faut-il que ce soit public (visible par tous les clans), opt-in par clan, ou réservé au SuperUser ? Voir section 6.

---

## 1. Classement public inter-clans ("Ligue des clans")

**Pourquoi c'est utile :** c'est la fonctionnalité la plus évidente et la plus motivante — donner à chaque clan un rang par rapport aux autres, pas seulement en interne.

**Données disponibles :** `Clan.clanStats.tracked.aggregated` existe déjà pour chaque clan actif (kills, damage, matches, winRate, assists, revives). Aucun nouveau pipeline de calcul n'est nécessaire, juste une agrégation de lecture sur tous les clans.

**Ce qu'on peut construire :**
- Page `/clans-leaderboard` (ou `/ligue`) listant tous les clans actifs, triable par winRate, kills totaux, damage moyen par match, matches joués
- Colonnes : rang, nom + tag, effectif tracké, winRate, kills totaux, damage moyen
- Filtrage par période (week/month/all) en réutilisant la même logique de fenêtre que le leaderboard interne

**Difficulté :** faible. Route API `GET /api/clans-leaderboard` qui lit `clanStats` pour tous les clans `isActive`, tri en mémoire. Composant réutilisable (`Leaderboard.tsx` déjà existant peut être adapté).

**Point d'attention :** comparer des totaux bruts favorise les gros clans (plus de membres = plus de kills). Voir section 4 sur la normalisation.

---

## 2. Score de puissance de clan ("Clan Power Rating")

**Pourquoi c'est utile :** un score unique, facile à afficher en badge, qui résume la force d'un clan mieux qu'un classement multi-colonnes.

**Ce qu'on peut construire :**
- Formule composite normalisée (0–100) combinant winRate, K/D moyen du clan, dégâts moyens par match, et un facteur de régularité (écart-type des perfs hebdo)
- Historique du score dans le temps (courbe) en stockant un snapshot périodique — nouvelle table légère `ClanPowerRatingHistory (clanId, period, score)` ou simplement une entrée JSON ajoutée dans `clanStats` à chaque recalcul nocturne
- Évolution ± affichée comme delta (même pattern que les deltas du leaderboard interne)

**Difficulté :** moyenne. Le calcul lui-même est simple ; la partie "historique dans le temps" demande une nouvelle table ou un append JSON, et une décision sur la fenêtre de calcul (rolling 30 jours ?).

**Inspiration :** systèmes de type Elo/Glicko pour classer des équipes — ici plus simple car pas de confrontations directes à arbitrer (voir section 3 pour la vraie version compétitive).

---

## 3. Détection de rivalité — clans qui se croisent dans le même match

**Pourquoi c'est utile :** c'est l'idée la plus "moderne" et différenciante — PUBG est un battle royale, donc deux clans trackés peuvent littéralement s'affronter dans le même match sans le savoir. Détecter ces croisements et en faire un classement "face-à-face" est une fonctionnalité qu'aucun site classique de stats PUBG ne propose.

**Données disponibles :** `Match` stocke déjà le `matchId` PUBG par membre. Si deux membres de deux clans différents ont le même `matchId`, c'est un croisement détecté.

**Ce qu'on peut construire :**
- Job (cron ou requête à la demande) qui trouve les `matchId` partagés entre `ClanMember` de clans différents
- Pour chaque croisement : quel clan a eu le meilleur placement moyen / le plus de kills / a survécu le plus longtemps dans ce match précis
- Tableau "Confrontations directes" par paire de clans : nombre de croisements, bilan (qui a fini devant qui), landing zones communes si la télémétrie est disponible
- Notification optionnelle : "Votre clan a croisé [Clan X] dans un match le 12/07 — vous avez fini devant"

**Difficulté :** moyenne à élevée. La détection est une requête SQL simple (`GROUP BY matchId HAVING COUNT(DISTINCT clanId) > 1`), mais l'exploitation fine (qui a tué qui) nécessiterait la télémétrie du match (déjà parsée dans `SquadMatchTelemetry` si le match a été sync côté clan). Sans télémétrie, on se limite à une comparaison de placement/stats basiques déjà dans `Match`.

**Point d'attention confidentialité :** ça révèle des informations sur un autre clan sans son consentement explicite (son placement, ses kills dans un match donné). À traiter en section 6.

---

## 4. Normalisation par effectif — comparer équitablement petits et gros clans

**Pourquoi c'est utile :** sans ça, tout classement brut favorise mécaniquement les clans à 30 membres actifs contre ceux à 8. Un petit clan très performant n'a aucune chance de se distinguer.

**Ce qu'on peut construire :**
- Toutes les métriques du classement inter-clans (section 1) déclinées en version "par membre actif" : kills/membre, damage moyen/membre, matches/membre
- Un filtre ou toggle "Classement brut" vs "Classement par capita", comme le toggle Clan/Inclus Solo existant sur le leaderboard interne
- Éventuellement un seuil minimum de membres actifs ou de matchs joués pour apparaître dans le classement per-capita (éviter qu'un clan à 2 membres très actifs écrase tout)

**Difficulté :** faible — division simple sur les données déjà agrégées de la section 1. À faire en même temps que la section 1, pas après.

---

## 5. Défis et événements inter-clans

**Pourquoi c'est utile :** le modèle `Challenge` existe déjà pour les défis internes à un clan. L'étendre à un scope inter-clans donnerait un vrai objectif compétitif motivant (type "guerre de clans").

**Données disponibles :** `Challenge`, `ChallengeParticipant`, `ChallengeReward` existent déjà, actuellement scopés par `clanId`.

**Ce qu'on peut construire :**
- Un `Challenge` à scope `null` clanId (global) ou un nouveau type `ClanChallenge` opposant N clans sur un objectif commun (ex. "premier clan à atteindre 10 000 kills cumulés cette semaine")
- Classement de progression en temps réel entre clans participants, affiché comme une jauge comparative
- Récompenses spécifiques (badge clan, pas seulement joueur) — nécessiterait un équivalent `ClanRewards` au modèle `PlayerRewards` existant

**Difficulté :** élevée — c'est une extension de modèle de données (nouveau champ ou nouvelle table), pas juste une vue en lecture. À envisager après les items 1–4 qui sont des "quick wins" sur données déjà là.

---

## 6. Opt-in et confidentialité — condition préalable à tout ce qui précède

**Pourquoi c'est un sujet à part entière :** le système actuel a été durci récemment (TODO2.md, étapes 3–5) précisément pour garantir l'isolation stricte entre clans. Introduire une comparaison inter-clans est un changement de philosophie qui mérite une décision explicite, pas juste un ajout de route API.

**Options à trancher :**
| Option | Description | Effort |
|---|---|---|
| Public par défaut | Tous les clans actifs apparaissent dans les classements inter-clans (comme un leaderboard PUBG mondial) | Faible — aucun nouveau champ nécessaire |
| Opt-in par clan | Un Owner active un flag `Clan.publicStatsOptIn` dans les settings pour apparaître dans les classements | Moyenne — nouveau champ + toggle dans `/clans/[clanId]/settings` |
| Réservé SuperUser | Comparaison visible uniquement en interne pour la modération/animation de la plateforme, pas exposée aux clans eux-mêmes | Faible — juste une nouvelle page réservée `requireSuperUser()` |

**Recommandation :** commencer par "Réservé SuperUser" pour valider l'intérêt et la fiabilité des chiffres sans engager de débat de confidentialité, puis basculer vers "opt-in par clan" une fois le concept validé.

---

## 7. Priorisation suggérée

| Priorité | Idée | Effort | Dépendances |
|---|---|---|---|
| 1 | Classement inter-clans brut + per-capita (§1 + §4) | Faible | Aucune — données déjà en base |
| 2 | Scope SuperUser-only en premier (§6) | Faible | Aucune |
| 3 | Clan Power Rating avec historique (§2) | Moyenne | Nouvelle table ou append JSON |
| 4 | Détection de rivalité / croisements de matchs (§3) | Moyenne à élevée | Nécessite d'itérer avec/sans télémétrie |
| 5 | Défis inter-clans (§5) | Élevée | Extension du modèle `Challenge` |

Les items 1 et 2 peuvent être livrés ensemble comme un premier lot cohérent : une page SuperUser-only `/admin/clans-leaderboard` avec classement brut et per-capita, sans aucune migration de schéma.
