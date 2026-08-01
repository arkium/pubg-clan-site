CREATE TABLE `PositionMetricCell` (
    `id` VARCHAR(191) NOT NULL,
    `squadMatchId` VARCHAR(191) NOT NULL,
    `clanId` INTEGER NOT NULL,
    `memberId` INTEGER NOT NULL,
    `mapName` VARCHAR(191) NOT NULL,
    `phase` INTEGER NOT NULL,
    `metric` VARCHAR(191) NOT NULL,
    `xIndex` INTEGER NOT NULL,
    `yIndex` INTEGER NOT NULL,
    `eventCount` INTEGER NOT NULL,
    `matchDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PositionMetricCell_match_metric_cell_key`(`squadMatchId`, `memberId`, `phase`, `metric`, `xIndex`, `yIndex`),
    INDEX `PositionMetricCell_clanId_matchDate_mapName_metric_idx`(`clanId`, `matchDate`, `mapName`, `metric`),
    INDEX `PositionMetricCell_memberId_matchDate_metric_idx`(`memberId`, `matchDate`, `metric`),
    INDEX `PositionMetricCell_clanId_mapName_phase_metric_idx`(`clanId`, `mapName`, `phase`, `metric`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PositionMetricCell`
    ADD CONSTRAINT `PositionMetricCell_squadMatchId_fkey`
    FOREIGN KEY (`squadMatchId`) REFERENCES `SquadMatch`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PositionMetricCell`
    ADD CONSTRAINT `PositionMetricCell_clanId_fkey`
    FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PositionMetricCell`
    ADD CONSTRAINT `PositionMetricCell_memberId_fkey`
    FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;