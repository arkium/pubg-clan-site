-- AlterTable
ALTER TABLE `EncounteredPlayerResolutionRun`
  ADD COLUMN `uniqueCandidatesSelected` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `crossClanCandidatesSelected` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `encounterRowsUpdated` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `rowsResolvedPerApiCall` DOUBLE NULL;

-- CreateIndex
CREATE INDEX `EncounteredPlayer_pubgAccountId_platformShard_clanResolvedAt_idx`
  ON `EncounteredPlayer`(`pubgAccountId`, `platformShard`, `clanResolvedAt`);
