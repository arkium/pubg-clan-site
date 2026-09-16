-- CreateTable
CREATE TABLE `SafeZonePhaseStat` (
    `id` VARCHAR(191) NOT NULL,
    `squadMatchId` VARCHAR(191) NOT NULL,
    `mapName` VARCHAR(191) NOT NULL,
    `matchDate` DATETIME(3) NOT NULL,
    `phase` INTEGER NOT NULL,
    `snapshotCount` INTEGER NOT NULL,
    `sumXPercent` DOUBLE NOT NULL,
    `sumYPercent` DOUBLE NOT NULL,
    `sumRadiusPercent` DOUBLE NOT NULL,

    INDEX `SafeZonePhaseStat_mapName_matchDate_idx`(`mapName`, `matchDate`),
    UNIQUE INDEX `SafeZonePhaseStat_squadMatchId_phase_key`(`squadMatchId`, `phase`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SafeZonePhaseStat` ADD CONSTRAINT `SafeZonePhaseStat_squadMatchId_fkey` FOREIGN KEY (`squadMatchId`) REFERENCES `SquadMatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

