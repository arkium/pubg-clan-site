-- AlterTable
ALTER TABLE `EncounteredPlayer` ADD COLUMN `playerId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `EncounteredPlayer_playerId_idx` ON `EncounteredPlayer`(`playerId`);

-- AddForeignKey
ALTER TABLE `EncounteredPlayer` ADD CONSTRAINT `EncounteredPlayer_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill playerId for already-existing rows, matching on the same
-- (pubgAccountId, platformShard) identity used by Player's unique index.
UPDATE `EncounteredPlayer` ep
INNER JOIN `Player` p
  ON p.`pubgAccountId` = ep.`pubgAccountId` AND p.`platformShard` = ep.`platformShard`
SET ep.`playerId` = p.`id`
WHERE ep.`playerId` IS NULL;

-- CreateTable
CREATE TABLE `EncounteredPlayerResolutionRun` (
    `id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'cron',
    `status` VARCHAR(191) NOT NULL DEFAULT 'running',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `candidatesSelected` INTEGER NOT NULL DEFAULT 0,
    `resolvedFromCache` INTEGER NOT NULL DEFAULT 0,
    `pubgApiCalls` INTEGER NOT NULL DEFAULT 0,
    `resolvedWithClan` INTEGER NOT NULL DEFAULT 0,
    `resolvedWithoutClan` INTEGER NOT NULL DEFAULT 0,
    `failed` INTEGER NOT NULL DEFAULT 0,
    `backlogRemaining` INTEGER NULL,
    `rateLimitRemainingBefore` INTEGER NULL,
    `rateLimitRemainingAfter` INTEGER NULL,
    `triggeredByUserId` INTEGER NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EncounteredPlayerResolutionRun_startedAt_idx`(`startedAt`),
    INDEX `EncounteredPlayerResolutionRun_status_startedAt_idx`(`status`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
