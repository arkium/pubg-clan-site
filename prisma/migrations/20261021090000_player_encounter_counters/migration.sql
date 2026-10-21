-- Fin d'EncounteredPlayer, étape 2 (docs/TODO/inventaire-2026-10-20.md §6) : compteurs tous clans confondus sur
-- Player, et index de priorité de la résolution. Additive : aucune donnée supprimée. MariaDB 10.11 ajoute les
-- colonnes sans reconstruire la table ; l'index (~755 000 lignes) se crée en ligne. Remplissage :
-- scripts/backfill-player-encounter-counters.ts (simulation par défaut, puis --apply).

-- AlterTable
ALTER TABLE `Player` ADD COLUMN `combatInteractionsCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `encounterCount` INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `idx_player_resolution_priority` ON `Player`(`clanResolvedAt`, `combatInteractionsCount`, `encounterCount`, `resolveAttempts`);
