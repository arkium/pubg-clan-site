const fs = require('fs')

let content = fs.readFileSync('docs/TODO/todo.md', 'utf8')

// Update checkmarks
content = content.replace(
  "- [ ] Faire pointer `ClanMember` vers `playerId` (FK `Player`) au lieu de stocker `pubgAccountId` en dur — hors scope Phase 1, lié au flux \"Suivre\"/\"Compléter\" reporté",
  "- [x] Faire pointer `ClanMember` vers `playerId` (FK `Player`) au lieu de stocker `pubgAccountId` en dur — implémenté en phase 2, avec fallback sur pubgAccountId"
)

content = content.replace(
  "- [ ] **Suivre un adversaire externe** (création de `ClanMember`) — **hors scope Phase 1**, reporté après audit des requêtes leaderboard/stats/badges pour exclure un futur statut `joinStatus='tracked'`",
  "- [x] **Suivre un adversaire externe** (création de `ClanMember` avec statut `tracked`) — Isolation des requêtes statistiques mise en place (`joinStatus: 'active'` exigé)"
)

content = content.replace(
  "- [ ] **Compléter un clan déjà suivi** (bouton d'ajout direct) — **action hors scope Phase 1**. La **détection** est en revanche implémentée en lecture seule : colonne \"Membres manquants\" sur le tableau 1, calculée par jointure `Player.opponentClanId → OpponentClan.pubgClanId = Clan.pubgClanId` moins les `ClanMember.pubgAccountId` déjà présents",
  "- [x] **Compléter un clan déjà suivi** (bouton d'ajout direct) — Bouton \"Ajouter\" fonctionnel dans les lignes du tableau 1"
)

content = content.replace(
  "- [ ] Favori joueur — pas implémenté, dépend du flux \"Suivre\" reporté",
  "- [x] Favori joueur — implémenté via étoile ⭐️ cliquable"
)

content = content.replace(
  "- [ ] Ligne dépliable → détail des joueurs de ce clan adverse — **remplacé par la spec détaillée ci-dessous**",
  "- [x] Ligne dépliable → détail des joueurs de ce clan adverse — **remplacé par la spec détaillée ci-dessous**"
)

content = content.replace(
  "- [ ] Bouton \"Suivre ce joueur\" avec sélecteur de clan — **non fait**, dépend du flux `ClanMember` reporté",
  "- [x] Bouton \"Suivre ce joueur\" avec sélecteur de clan — Implémenté avec un `<select>` déroulant et auto-refresh UI"
)

content = content.replace(
  "- [ ] Badge \"Membre de <clan>\" pour joueur déjà suivi ailleurs — **non fait**, dépend du flux reporté",
  "- [x] Badge \"Membre de <clan>\" pour joueur déjà suivi ailleurs — badge vert émeraude"
)

// Add Phase 2 recap at the end of the file
const phase2Recap = `

#### Phase 2 — Suivi, Favoris & UI — ✅ Implémenté le 2026-08-08

Objectif : Finaliser la fonctionnalité de "Watchlist" en permettant d'ajouter des joueurs suivis sans corrompre les calculs statistiques des clans.

**Modèle et API :**
- [x] Ajout de \`isFavorite\` sur \`Player\` et lien \`playerId\` sur \`ClanMember\`.
- [x] Route \`PATCH /api/settings/players/[id]/favorite\` pour le système d'étoiles.
- [x] Route \`POST /api/settings/opponents/track\` pour insérer un \`ClanMember\` de statut \`joinStatus: 'tracked'\`.

**UI :**
- [x] Boutons "Ajouter" activés pour les membres manquants détectés (Tableau 1).
- [x] Boutons "Suivre" avec menu déroulant pour affecter un adversaire à un clan suivi (Tableau 2).
- [x] Étoiles de favori interactives pour chaque joueur (Tableau 2).
- [x] Toast de notifications modernes et rafraîchissement automatique des tableaux après interaction.

**Isolation Stricte (Watchlist) :**
- [x] Patch global sur \`src/lib/stats-calculator.ts\`, \`cron-jobs.ts\`, \`report-generator.ts\`, et \`matches-cache-service.ts\` pour filtrer \`isActive: true, joinStatus: 'active'\`.
- [x] Création du test unitaire \`tracked-isolation.test.ts\` pour garantir l'étanchéité des calculs.
`

content += phase2Recap

fs.writeFileSync('docs/TODO/todo.md', content, 'utf8')
console.log('todo.md updated successfully')
