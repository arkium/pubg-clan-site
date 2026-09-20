# Notifications Discord

Diffusion de résultats du clan sur Discord via **webhooks entrants**. Aucun bot à héberger, aucune permission serveur invasive : le clan colle une URL de webhook et le site poste dessus.

Deux flux indépendants, chacun avec son propre webhook et son propre interrupteur :

| Flux | Déclenchement | Destinataire |
|---|---|---|
| **Alerte Top 1** | Automatique, à la synchronisation d'un match gagné | Canal « victoires » du clan |
| **Résultats de tournoi** | Manuel, après prévisualisation par un administrateur | Canal « tournois » du clan, ou canal propre à un tournoi |

> À ne pas confondre avec les [notifications internes](notifications.md) (in-app / email / push), qui s'adressent à un membre. Ici la cible est un canal Discord, et la configuration est par clan, pas par membre.

---

## Modèle de données

### Configuration — `ClanConfig`

La configuration complète tient dans une seule ligne `ClanConfig`, clé `discord_notifications`, valeur JSON :

```json
{
  "top1": {
    "enabled": false,
    "webhookUrl": "",
    "teamModes": { "duo": true, "trio": true, "squad": true },
    "matchTypes": { "official": true, "casual": true, "airoyale": false, "custom": false },
    "minClanMembers": 2,
    "mention": { "type": "none", "roleId": "" }
  },
  "tournament": {
    "enabled": false,
    "webhookUrl": "",
    "mention": { "type": "none", "roleId": "" },
    "includeStandings": true
  }
}
```

La lecture passe toujours par `normalizeDiscordSettings()` ([discord-config.ts](../../src/lib/discord/discord-config.ts)) : un JSON absent, corrompu, partiel ou contenant des clés inconnues retombe silencieusement sur les valeurs par défaut. Aucun appelant n'a donc à gérer une configuration mal formée.

### Dédoublonnage — `DiscordNotificationLog`

| Champ | Type | Description |
|---|---|---|
| `id` | Int | Clé primaire auto-incrémentée |
| `clanId` | Int | Clan émetteur (cascade à la suppression du clan) |
| `kind` | String | `top1` ou `tournament_round` |
| `refId` | String(191) | `squadMatchId` pour un Top 1, `{tournamentId}:{squadMatchId}` pour une manche |
| `sentAt` | DateTime | Date d'envoi |

Contrainte `@@unique([clanId, kind, refId])` — c'est elle, et non du code applicatif, qui garantit l'absence de doublon.

### Surcharge par tournoi — `Tournament.discordWebhookUrl`

Colonne nullable `VARCHAR(500)`. Renseignée, elle prend le pas sur le webhook Tournoi du clan pour ce tournoi précis (cas d'usage : un tournoi annoncé sur le serveur Discord d'un autre clan). Validée à l'écriture par `normalizeDiscordWebhookOverride()` dans [tournament-service.ts](../../src/lib/tournament-service.ts).

---

## Configuration

Page `/clans/[clanId]/settings/discord`, accessible depuis le hub des paramètres du clan. Entrée de navigation `admin.discord-notifications`, rôle `admin`, semée par `scripts/seed-discord-nav.ts`.

Toutes les routes API exigent la permission **`manage_settings`** sur le clan concerné.

### Section Top 1

| Réglage | Valeurs | Défaut |
|---|---|---|
| Activation | on / off | off |
| URL du webhook | `https://discord.com/api/webhooks/…` ou `https://discordapp.com/api/webhooks/…` | vide |
| Modes d'équipe | Duo / Trio / Squad | les trois activés |
| Types de match | Officiel / Casual / Matchs IA / Custom | Officiel + Casual |
| Membres du clan minimum | 2, 3 ou 4 | 2 |
| Mention | Aucune, `@here`, `@everyone`, ID de rôle | Aucune |

### Section Tournois

| Réglage | Valeurs | Défaut |
|---|---|---|
| Activation | on / off | off |
| URL du webhook | même format | vide |
| Bouton « 📋 Identique au canal Top 1 » | recopie l'URL du webhook Top 1 | — |
| Classement général provisoire | inclus / masqué | inclus |
| Mention | Aucune, `@here`, `@everyone`, ID de rôle | Aucune |

### Validation

L'URL doit correspondre à `^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$`. Un webhook vide est accepté tant que le flux correspondant est désactivé ; activer un flux sans URL est refusé en 400. Un ID de rôle doit être numérique (5 à 20 chiffres).

### Aperçu

Les deux aperçus de la page ne sont pas des maquettes : ils appellent les vrais générateurs d'embed (`buildTop1WebhookPayload`, `buildTournamentRoundWebhookPayload`, purs et donc importables côté client) et passent le payload à [`DiscordEmbedPreview`](../../src/components/discord/DiscordEmbedPreview.tsx). L'aperçu ne peut pas diverger du message envoyé.

### Boutons de test

« Tester le webhook Top 1 » et « Tester le webhook Tournoi » postent un message d'exemple sur l'URL saisie, **sans avoir à enregistrer au préalable**. En cas de refus, le message d'erreur exact renvoyé par Discord est affiché dans un bandeau.

---

## Flux 1 — Alerte Top 1

### Déclenchement

`notifyTop1IfEligible(clanId, squadMatchId)` est appelée depuis `analyzeMatchForSquads()` ([squad-detector.ts](../../src/lib/squad-detector.ts)), sur **les deux chemins** :

1. création d'un nouveau `SquadMatch` ;
2. complétion d'un `SquadMatch` déjà créé par un autre clan suivi présent dans le même lobby PUBG.

Le second chemin compte : sans lui, le deuxième clan d'un match croisé n'aurait jamais son alerte.

### Conditions cumulatives

L'envoi n'a lieu que si toutes ces conditions sont réunies :

1. `top1.enabled` est vrai ;
2. `top1.webhookUrl` est une URL de webhook Discord valide ;
3. `squadMatch.placement === 1` ;
4. `squadMatch.matchType` fait partie des types cochés ;
5. le nombre de membres **du clan** dans l'escouade atteint `minClanMembers` ;
6. le mode d'équipe déduit de ce nombre (`teamModeFromMemberCount`) est coché ;
7. aucune ligne `DiscordNotificationLog` n'existe déjà pour ce couple clan/match.

### Ordre du verrou anti-doublon

La ligne `DiscordNotificationLog` est insérée **avant** l'appel HTTP, et supprimée si Discord refuse. Ce choix est délibéré :

| Ordre | Conséquence |
|---|---|
| Envoyer puis noter | Un crash entre les deux → renvoi au prochain passage. **Doublon.** |
| Noter puis envoyer, sans annuler | Discord en panne → alerte perdue définitivement. |
| **Noter, envoyer, annuler si refus** ← retenu | Ni doublon, ni perte sur panne réseau. |

Cas résiduel assumé : un crash du processus entre l'insertion et l'envoi laisse le verrou posé et l'alerte n'est jamais publiée. Perdre une alerte est jugé moins grave que spammer le canal.

### Contenu du message

- Couleur `#F1C40F` (doré Chicken Dinner)
- Titre `🍗 CHICKEN DINNER ! Top 1 pour [TAG] NomDuClan`, tronqué à 256 caractères
- Description `🗺️ Carte — Mode`
- Champ « Escouade » : une ligne par joueur avec kills, dégâts arrondis, assists et revives (assists et revives affichés seulement s'ils sont non nuls)
- Champs « Kills totaux », « Dégâts cumulés », « Survie » en ligne
- Vignette de la carte (`/maps/pubg/{mapName}.webp`) et lien vers le débriefing du match (`/clans/{clanId}/telemetry/matches/{squadMatchId}/debrief`, construit par `matchDebriefPath` de `src/lib/match-links.ts`)
- Pied de page : type de match et nombre de membres du clan

La mention configurée part dans `content`, jamais dans l'embed — un embed ne notifie personne sur Discord.

### Adaptation au mode du tournoi (2026-09-18)

Le participant d'une manche n'est plus forcément un clan : selon le mode, c'est une équipe, un joueur ou une escouade
interne. L'embed ne connaît que son libellé, déjà résolu par le service, et adapte ses intitulés et son pied de page.
Quand le partage au prorata est actif, une ligne l'annonce, faute de quoi les points décimaux ressembleraient à une
erreur. Détail des modes : [Tournois](tournois.md).

---

## Flux 2 — Résultats de tournoi

### Déclenchement

Entièrement **manuel**. Aucun cron, aucun envoi automatique. Sur `/clans/[clanId]/settings/tournaments`, le bouton « Diffuser sur Discord » de chaque tournoi ouvre [`TournamentBroadcastModal`](../../src/components/discord/TournamentBroadcastModal.tsx) :

1. la modale liste les manches comptabilisées, la plus récente présélectionnée ;
2. sélectionner une manche déclenche un `GET` de prévisualisation, rendu par le même composant d'aperçu que la page de configuration ;
3. « Confirmer et envoyer sur Discord » poste réellement le message.

Une manche déjà diffusée reste rediffusable : la modale affiche un avertissement daté et le bouton devient « Confirmer et rediffuser ». Le journal est alors mis à jour (`upsert`) plutôt que bloqué — un envoi manuel est un acte explicite, l'anti-spam vise les re-synchronisations automatiques.

### Numérotation des manches

`getTournamentMatches()` renvoie les matchs du plus récent au plus ancien ; le service les retrie en ordre chronologique, de sorte que **la manche #1 est la plus ancienne** du tournoi.

### Calcul des scores

Le barème est appliqué par `computeTournamentRoundScores()` ([tournament-service.ts](../../src/lib/tournament-service.ts)), qui partage la fonction `scoreTournamentTeam()` avec `computeTournamentStandings()`. La formule de points existe donc **en un seul endroit** : une annonce Discord ne peut pas diverger du classement affiché sur le site.

Points d'une manche pour un clan : `placementPoints[meilleurPlacement] + (kills × killPoints) + (winBonus si 1er)`.

Tri : points décroissants, puis kills décroissants, puis meilleur placement. `bestOfRounds` est volontairement ignoré ici — il ne s'applique qu'au cumul.

Le MVP est le joueur des clans participants ayant infligé le plus de dégâts, départagé par les kills.

### Résolution du webhook

`Tournament.discordWebhookUrl` s'il est valide, sinon `tournament.webhookUrl` de la configuration du clan. Si aucun des deux n'est exploitable, la prévisualisation échoue en 400 avec un message explicite. La modale indique quand la surcharge de tournoi s'applique.

### Contenu du message

- Couleur `#5865F2`
- Titre `🏆 Tournoi : {Titre} — Résultats Manche #{N}`
- Description : carte, mode, et lien « ▶️ Replay 2D de la manche » vers le débriefing de manche `/tournaments/{tournamentId}/matches/{squadMatchId}` (depuis le 2026-09-16), ouvert à tout utilisateur connecté, avec le contexte du tournoi et la bande des escouades. Les messages plus anciens pointent vers `/tournaments/…/telemetry?clanId=`, redirigé vers cette page.
- Champ « Scores de la manche » : `🥇 **[TAG] Clan** : 1er (+10 pts) · 8 kills (+8 pts) = **18 pts**`, médailles pour le podium puis `#4`, `#5`…
- Champ « ⭐ MVP de la manche »
- Champ « Classement général provisoire » si l'option est active
- Pied de page : `Manche N/Total · X clan(s) classé(s)`

---

## Client webhook

[`sendDiscordWebhook()`](../../src/lib/discord/discord-client.ts) **ne lève jamais**. Toute erreur réseau ou HTTP revient dans le résultat, pour qu'un incident Discord ne fasse jamais échouer la synchronisation PUBG appelante.

- Timeout strict de 5 s par tentative (`AbortSignal.timeout`)
- Sur `429`, respecte `retry_after` (plafonné à 5 s) et retente **une seule fois**
- Sur toute autre erreur, renvoie le statut et le corps de réponse tronqué à 500 caractères

L'appel est `await`é dans le flux de synchronisation. Le coût maximal pour une victoire est donc de l'ordre de 10 s dans le pire cas (deux tentatives), et seulement sur les matchs gagnés.

---

## Routes API

| Route | Méthode | Rôle |
|---|---|---|
| `/api/clans/[clanId]/settings/discord` | `GET` | Configuration courante + libellé du clan |
| `/api/clans/[clanId]/settings/discord` | `PUT` | Enregistrement, validation Zod des deux blocs |
| `/api/clans/[clanId]/settings/discord/test` | `POST` | Message de test — corps `{ webhookUrl, kind: 'top1' \| 'tournament' }` |
| `/api/clans/[clanId]/tournaments/[tournamentId]/discord` | `GET` | Liste des manches, avec date de diffusion précédente |
| `/api/clans/[clanId]/tournaments/[tournamentId]/discord?matchId=…` | `GET` | Payload de prévisualisation d'une manche |
| `/api/clans/[clanId]/tournaments/[tournamentId]/discord` | `POST` | Diffusion — corps `{ matchId }` |

Toutes exigent `manage_settings` sur le clan.

---

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/lib/discord/discord-config.ts` | Types, défauts, normalisation défensive, validation d'URL, rendu de mention |
| `src/lib/discord/discord-config-service.ts` | Lecture / écriture dans `ClanConfig` |
| `src/lib/discord/discord-client.ts` | POST webhook résilient |
| `src/lib/discord/discord-top1-embed.ts` | Générateur d'embed Top 1 (pur) |
| `src/lib/discord/discord-tournament-embed.ts` | Générateur d'embed résultats de manche (pur), **adapté au mode du tournoi** depuis le 2026-09-18 |
| `src/lib/discord/discord-service.ts` | Filtres, verrou, orchestration Top 1 |
| `src/lib/discord/discord-tournament-service.ts` | Scores, MVP, classement, prévisualisation et diffusion de manche |
| `src/components/discord/DiscordEmbedPreview.tsx` | Rendu in-app d'un payload Discord |
| `src/components/discord/TournamentBroadcastModal.tsx` | Modale de sélection + aperçu + confirmation |
| `scripts/seed-discord-nav.ts` | Insertion de l'entrée de navigation |

---

## Webhook d'administration — global, pas par clan

Tout ce qui précède décrit des webhooks **par clan** (`ClanConfig`). Le cycle de vie des clans en utilise un autre, **global**, stocké dans `AppConfig.clan_lifecycle_discord_webhook_url` : une mutation d'appartenance concerne toute la ligue, pas un clan en particulier, et le salon d'administration n'est pas celui des annonces.

| | Webhooks par clan | Webhook d'administration |
|---|---|---|
| Stockage | `ClanConfig` | `AppConfig` |
| Configuré depuis | Paramètres du clan | `/settings/clan-lifecycle`, onglet « Paramètres » |
| Contenu | Top 1, résultats de tournoi | Mouvements de clan détectés automatiquement |

La validation de l'URL est **partagée** (`isValidDiscordWebhookUrl`, `normalizeWebhookUrl`) : pas de seconde règle qui pourrait diverger.

Un webhook vide est un cas normal, pas une erreur : aucune notification ne part et la page l'affiche comme « non configuré ».

Voir [Cycle de vie du clan](cycle-de-vie-clan.md).

## Limites connues

- **Pas de victoire en solo, ni de seuil à 1 membre.** `detectSquadFromMatchDetails()` exige au moins deux membres du clan pour créer un `SquadMatch` : un Top 1 en solo n'existe pas dans les données et ne peut donc pas être notifié.
- **Pas de type « Ranked ».** Les seules valeurs de `SquadMatch.matchType` en base sont `official`, `casual`, `airoyale` et `custom`.
- **Les liens et vignettes dépendent de `NEXT_PUBLIC_APP_URL`.** Discord récupère les images depuis Internet : sur une instance en `localhost`, la vignette de carte ne s'affiche pas et les liens sont morts. Quand la variable est vide, les générateurs omettent proprement lien et vignette.
- **La carte du Top 1 part en vignette d'angle**, pas en image pleine largeur, pour garder le canal lisible sur un clan qui gagne souvent. Une ligne à changer dans `discord-top1-embed.ts` (`thumbnail` → `image`) si le rendu inverse est préféré.
- **Retours d'interface en bandeaux inline**, pas en toasts flottants : le projet n'a pas de composant Toast partagé, et un bandeau affiche correctement les messages d'erreur longs renvoyés par Discord.

---

## Tests

`npx vitest run src/lib/discord` — 82 tests répartis sur 7 fichiers.

Les tests de route vivent dans `src/lib/` et non à côté des routes : `vitest.config.ts` ne collecte que `src/lib/**/*.test.ts`, un fichier posé ailleurs ne serait jamais exécuté.

| Fichier | Couverture |
|---|---|
| `discord-config.test.ts` | Validation d'URL, normalisation défensive, indépendance des deux blocs, rendu des mentions |
| `discord-client.test.ts` | 204 / 400 / 404, backoff sur 429, abandon après second 429, panne réseau — sans jamais lever |
| `discord-top1-embed.test.ts` | Limites Discord, troncature du titre, agrégats, lien et vignette conditionnels, mention dans `content` |
| `discord-tournament-embed.test.ts` | Médailles et numérotation, bonus conditionnel, MVP, bloc classement optionnel, lien de replay, bornage à 1024 caractères, **intitulés par mode et note de prorata** |
| `discord-service.test.ts` | Chaque filtre isolément, dédoublonnage, relâchement du verrou sur échec, absorption d'une panne base |
| `discord-tournament-service.test.ts` | Numérotation chronologique, barème de bout en bout, MVP, priorité du webhook de tournoi, 404 sur manche étrangère, aucun POST en prévisualisation |
| `discord-route-contracts.test.ts` | Contrats des trois routes de configuration : contrôle d'accès `manage_settings`, propagation des 401/403, validation d'URL et de mention, refus divers en 400, aiguillage Top 1/Tournoi du test, 502 sur refus Discord |

Le barème par manche est testé séparément dans `src/lib/tournament-service.test.ts` (`computeTournamentRoundScores`).
