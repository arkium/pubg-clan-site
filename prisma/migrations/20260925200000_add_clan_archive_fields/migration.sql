-- Arret de suivi d'un clan (docs/TODO/clan-archive.md §4).
-- Un clan archive (le SuperUser a arrete de le suivre, ou a refuse sa demande) et un
-- clan en attente de validation ont tous deux isActive = false : archivedAt les
-- distingue. Migration purement additive : deux colonnes nullables, aucun backfill
-- (aucun clan refuse en base au 2026-09-25, verifie par scripts/check-clan-archive-state.ts).
ALTER TABLE `Clan` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `archivedReason` VARCHAR(191) NULL;
