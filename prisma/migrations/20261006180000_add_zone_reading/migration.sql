-- CreateTable
CREATE TABLE `ZoneReadingMatch` (
    `squadMatchId` VARCHAR(191) NOT NULL,
    `mapName` VARCHAR(64) NOT NULL,
    `matchDate` DATETIME(3) NOT NULL,
    `teamMode` VARCHAR(8) NOT NULL,
    `flightSource` VARCHAR(10) NOT NULL,
    `lineStartX` INTEGER NOT NULL,
    `lineStartY` INTEGER NOT NULL,
    `lineEndX` INTEGER NOT NULL,
    `lineEndY` INTEGER NOT NULL,
    `circles` JSON NOT NULL,
    `circleCount` INTEGER NOT NULL,
    `finalX` INTEGER NOT NULL,
    `finalY` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ZoneReadingMatch_mapName_teamMode_matchDate_idx`(`mapName`, `teamMode`, `matchDate`),
    PRIMARY KEY (`squadMatchId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZoneReadingSeries` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `mapName` VARCHAR(64) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'started',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `rounds` JSON NOT NULL,
    `meanError` DOUBLE NULL,
    `betterThanCenter` INTEGER NULL,
    `betterThanLine` INTEGER NULL,
    `withPlaneError` DOUBLE NULL,
    `withoutPlaneError` DOUBLE NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `ZoneReadingSeries_memberId_mapName_status_idx`(`memberId`, `mapName`, `status`),
    INDEX `ZoneReadingSeries_mapName_status_idx`(`mapName`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ZoneReadingMatch` ADD CONSTRAINT `ZoneReadingMatch_squadMatchId_fkey` FOREIGN KEY (`squadMatchId`) REFERENCES `SquadMatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZoneReadingSeries` ADD CONSTRAINT `ZoneReadingSeries_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

