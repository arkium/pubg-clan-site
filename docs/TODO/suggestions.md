# Suggestions d'amélioration — Stats et fonctionnalités

Idées de stats et fonctionnalités qui apporteraient une vraie valeur au clan. L'angle directeur est toujours "aider chaque joueur à identifier ce qu'il peut améliorer" — pas juste afficher des chiffres.

---

## Stats individuelles à mettre en place

### Précision par arme et par distance

**Pourquoi c'est utile :** savoir si un joueur choisit la bonne arme pour la bonne portée. Un joueur qui tire des rafales de SMG à 200 m ne va pas gagner des duels.

**Données disponibles :** `MemberWeaponStats` a déjà `shotsFired`, `hitsLanded`, `avgDistance`, `kills`, `headshots` par arme et par période.

**Ce qu'on peut construire :**
- Taux de précision (`hitsLanded / shotsFired`) par arme, trié du meilleur au moins bon
- Comparer le `avgDistance` d'utilisation à la portée efficace attendue (table de référence hardcodée par arme)
- Mettre en évidence les armes où le joueur performe au-dessus de la moyenne du clan vs en dessous

**Page suggérée :** section "Mes armes" dans le dashboard membre, avec un tableau triable et un indicateur vert/rouge par rapport à la moyenne clan.

---

### Score de positionnement (Circle IQ)

**Pourquoi c'est utile :** mourir dans la zone bleue est l'une des erreurs les plus coûteuses en PUBG. Un joueur avec un bon "Circle IQ" manage son rotation avant que la zone ferme.

**Données disponibles :** `MemberTelemetryStats` a déjà `blueZoneHitsRate` et `circleDelayPercent`.

**Ce qu'on peut construire :**
- Score synthétique "Circle IQ" sur 100 : combine `circleDelayPercent` (plus c'est bas = mieux) et `blueZoneHitsRate` (plus c'est bas = mieux)
- Classer les membres du clan par Circle IQ
- Tendance sur les 4 dernières semaines (s'améliore-t-il ?)

**Affichage suggéré :** widget dans le dashboard membre, comparable à la moyenne clan, avec une phrase d'insight ("Tu entres dans la zone 12 % moins vite que tes coéquipiers en moyenne").

---

### Profil de joueur — Spider chart

**Pourquoi c'est utile :** au lieu de noyer le joueur dans des chiffres, un radar à 6 axes donne immédiatement une silhouette lisible et identitaire.

**Axes suggérés (tous normalisables sur 100 depuis les données existantes) :**
- **Agressivité** — kills par match vs moyenne clan
- **Précision** — headshot rate moyen
- **Support** — revives par match
- **Survie** — temps de survie moyen
- **Mobilité** — distance à pied par match
- **Circle IQ** — inverse de `circleDelayPercent`

**Données disponibles :** tout est dans `MemberTelemetryStats` et `PlayerStats`. La normalisation se fait par rapport aux min/max du clan.

---

### Kill distance — Distribution

**Pourquoi c'est utile :** un joueur peut avoir 50 kills mais tous à courte portée. Ça révèle un style de jeu et des axes de progression (apprendre les armes longue portée).

**Données disponibles :** `MemberWeaponStats.avgDistance` par arme.

**Ce qu'on peut construire :**
- Distribution des kills par tranche : < 25 m (CQC), 25–100 m (mid), 100–200 m (longue), > 200 m (snipe)
- Identifier l'arme "signature" du joueur (celle avec le plus de kills)
- Comparer au profil du clan

---

### Évolution K/D par phase de cercle

**Pourquoi c'est utile :** certains joueurs dominent le early game mais s'effondrent au late game, ou inversement. C'est une information de coaching très concrète.

**Données disponibles :** `MemberTelemetryStats.firstKillPhase` donne la phase moyenne du premier kill. `killSamples` dans `SquadMatchTelemetry` contient la phase de chaque kill.

**Ce qu'on peut construire :**
- Répartition des kills par phase (Early 1–3, Mid 4–6, Late 7+) en pourcentage
- Comparer early/late entre membres du clan (qui est un "early rusher" vs un "late game player")

---

### Ratio damage dealt / damage taken

**Pourquoi c'est utile :** un joueur peut faire peu de kills mais infliger beaucoup de dégâts — il prépare les kills pour ses coéquipiers. Et un joueur qui prend autant qu'il inflige est souvent celui qui met l'équipe en danger.

**Données disponibles :** `MemberTelemetryStats` a `avgDamageDealt`. Il faudrait ajouter `avgDamageTaken` (depuis `LogPlayerTakeDamage` + `LogBlueZoneDamage`, les données sont dans le parser mais pas agrégées en période).

**Ce qu'on peut construire :**
- Ratio `damage dealt / damage taken` par membre et par période
- Classer le clan sur ce ratio
- Identifier les joueurs qui absorbent le plus de dégâts (pour les aider à mieux se positionner)

---

## Stats clan globales

### Tendance du clan sur 8 semaines

**Pourquoi c'est utile :** au-delà des classements hebdomadaires, voir si le clan dans son ensemble progresse ou stagne donne un indicateur de santé de la communauté.

**Données disponibles :** agréger les `PlayerStats` de tous les membres actifs par `periodKey` semaine.

**Ce qu'on peut construire :**
- Courbe du win rate moyen du clan sur 8 semaines
- Courbe du kills/match moyen du clan
- Courbe du nombre de matchs joués (indicateur d'activité)
- Un seul graphique clair, lisible en un coup d'œil

**Page suggérée :** section "Santé du clan" dans l'overview du clan.

---

### Meilleurs duos du clan

**Pourquoi c'est utile :** `ClanSynergyTelemetryStats` stocke déjà les paires de joueurs avec `reviveCount`, `coKillCount`, `matchesTogether`. C'est une donnée riche qui n'est pas encore exposée côté UI.

**Ce qu'on peut construire :**
- Top 5 des paires les plus synergiques (score : coKills + revives pondérés, normalisés par le nombre de matchs ensemble)
- "Ce duo gagne X % de ses matchs ensemble"
- Carte "Chimie d'équipe" : matrice N×N des membres du clan, chaque cellule = win rate ensemble

---

### Heatmap clan des zones de danger

**Pourquoi c'est utile :** fusionner les `damageSamples` et `killSamples` de tous les membres du clan sur une carte donne une visualisation des zones les plus dangereuses pour le clan spécifiquement — là où ils se font le plus souvent attaquer.

**Données disponibles :** `SquadMatchTelemetry.damageSamples` et `killSamples` existent mais ne sont agrégés que par match et non pas en une heatmap cumulative par carte.

**Ce qu'on peut construire :**
- Heatmap agrégée "Où notre clan prend le plus de dégâts" par carte (Erangel, Miramar, etc.)
- Comparer "où on inflige des dégâts" vs "où on en reçoit" — identifier les zones à éviter

---

### Carte des loot routes préférées

**Pourquoi c'est utile :** en combinant les zones de drop (`landingSamples`) et les trajectoires de déplacement (`trajectorySegments`), on peut visualiser les routes de loot habituelles du clan et identifier si elles convergent ou si l'équipe se disperse.

**Données disponibles :** `SquadMatchTelemetry.landingSamples` (parser v2) et `trajectorySegments`.

**Ce qu'on peut construire :**
- Visualisation des trajectoires des 15 premières secondes après le drop par membre
- Calcul de la dispersion moyenne au drop (distance entre membres de la squad) — un clan qui drope groupé joue différemment d'un clan dispersé

---

## Fonctionnalités sociales et engagement

### Badges de progression (Rank cards)

**Pourquoi c'est utile :** les awards hebdomadaires récompensent le meilleur de la semaine, mais pas les progrès sur la durée. Un système de badges de progression récompense la régularité et l'amélioration continue.

**Exemples de badges :**
- "Sniper en progression" — `avgDistance` de kill a augmenté de 20 % sur 4 semaines consécutives
- "Reviver de l'équipe" — top 1 en revives pendant 3 semaines d'affilée
- "Circle Master" — `circleDelayPercent` < 5 % pendant 1 mois

**Données disponibles :** entièrement calculable depuis `MemberTelemetryStats` et `PlayerStats` agrégés dans le temps.

---

### Objectifs personnels (Goals)

**Pourquoi c'est utile :** un joueur peut se fixer un objectif mesurable ("atteindre 55 % de headshot rate au M416") et le suivre semaine par semaine. Ça crée un engagement personnel sans que l'admin du clan ait besoin d'organiser un challenge.

**Ce qu'il faudrait :**
- Modèle `MemberGoal` : `memberId`, `metric`, `target`, `deadline`, `status`
- Page `/members/[id]/goals` : saisie de l'objectif, courbe de progression en temps réel
- Notification automatique quand l'objectif est atteint

**Difficulté :** les métriques sont hétérogènes (certaines sont dans `PlayerStats`, d'autres dans `MemberTelemetryStats`, d'autres dans `MemberWeaponStats`) — il faudra un résolveur de métrique générique.

---

### Rapport hebdomadaire enrichi avec stats télémétrie

**Pourquoi c'est utile :** le rapport hebdomadaire existe mais est basé uniquement sur les stats de base (`PlayerStats`). Avec les données télémétrie, il peut donner des insights bien plus riches.

**Sections à ajouter au rapport :**
- Meilleur Circle IQ de la semaine
- Paire la plus synergique de la semaine (revives + co-kills)
- Arme la plus utilisée par le clan cette semaine (depuis `MemberWeaponStats`)
- Insight "Cette semaine, le clan a passé X % de ses kills au headshot" (tendance vs semaine précédente)

---

### Comparaison avec les saisons PUBG

**Pourquoi c'est utile :** `MemberSeasonStats` stocke les stats ranked par saison. Actuellement il n'y a pas de vue dédiée à la progression saisonnière du clan.

**Ce qu'on peut construire :**
- Graphique "évolution du tier ranked" par membre sur les 5 dernières saisons
- Vue "Qui a le plus progressé en ranked ce mois-ci ?"
- Comparaison tier ranked vs performance en matchs squad du clan (corrélation ?)

---

## Axes techniques qui débloqueraient plusieurs stats

| Amélioration technique | Stats qu'elle débloquerait |
|---|---|
| Ajouter `avgDamageTaken` dans `MemberTelemetryStats` | Ratio dealt/taken, identification des joueurs exposés |
| Parser `LogPlayerUseThrowable` | Diversité tactique, grenadiers vs non-grenadiers |
| Stocker `rideDistance` par session depuis `LogVehicleLeave` | JACKY TUNING par type de véhicule |
| Ventiler `MemberLifetimeStats` par mode de jeu | Stats solo/duo/squad comparées |
| Agréger `damageSamples` et `killSamples` par carte sur la période | Heatmaps cumulatives clan par carte |
