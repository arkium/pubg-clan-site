-- CreateTable
CREATE TABLE `ZoneClosurePosition` (
    `id` VARCHAR(191) NOT NULL,
    `squadMatchId` VARCHAR(191) NOT NULL,
    `clanId` INTEGER NOT NULL,
    `memberId` INTEGER NOT NULL,
    `mapName` VARCHAR(191) NOT NULL,
    `matchDate` DATETIME(3) NOT NULL,
    `phase` INTEGER NOT NULL,
    `xIndex` INTEGER NOT NULL,
    `yIndex` INTEGER NOT NULL,
    `xPercent` DOUBLE NOT NULL,
    `yPercent` DOUBLE NOT NULL,
    `distanceRatio` DOUBLE NOT NULL,
    `zoneBand` VARCHAR(191) NOT NULL,
    `survivorCount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `ZoneClosurePosition_clanId_matchDate_mapName_phase_idx`(`clanId`, `matchDate`, `mapName`, `phase`),
    INDEX `ZoneClosurePosition_memberId_matchDate_idx`(`memberId`, `matchDate`),
    UNIQUE INDEX `ZoneClosurePosition_squadMatchId_memberId_phase_key`(`squadMatchId`, `memberId`, `phase`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `ZoneClosurePosition` ADD CONSTRAINT `ZoneClosurePosition_squadMatchId_fkey` FOREIGN KEY (`squadMatchId`) REFERENCES `SquadMatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ZoneClosurePosition` ADD CONSTRAINT `ZoneClosurePosition_clanId_fkey` FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `ZoneClosurePosition` ADD CONSTRAINT `ZoneClosurePosition_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
