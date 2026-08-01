CREATE TABLE `DropPressureStat` (
    `id` VARCHAR(191) NOT NULL,
    `squadMatchId` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `mapName` VARCHAR(191) NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `matchDate` DATETIME(3) NOT NULL,
    `nearbyPlayerCount250m` INTEGER NOT NULL,
    `nearbyOpponentCount250m` INTEGER NULL,
    `pressureLevel` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `DropPressureStat_squadMatchId_memberId_key`(`squadMatchId`, `memberId`),
    INDEX `DropPressureStat_memberId_matchDate_idx`(`memberId`, `matchDate`),
    INDEX `DropPressureStat_matchDate_pressureLevel_idx`(`matchDate`, `pressureLevel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `DropPressureStat`
    ADD CONSTRAINT `DropPressureStat_squadMatchId_fkey`
    FOREIGN KEY (`squadMatchId`) REFERENCES `SquadMatch`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `DropPressureStat`
    ADD CONSTRAINT `DropPressureStat_memberId_fkey`
    FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;