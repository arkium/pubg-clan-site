-- CreateTable
CREATE TABLE `PlayerStats` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `periodType` VARCHAR(191) NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `totalKills` INTEGER NOT NULL DEFAULT 0,
    `totalDamage` DOUBLE NOT NULL DEFAULT 0,
    `totalAssists` INTEGER NOT NULL DEFAULT 0,
    `totalRevives` INTEGER NOT NULL DEFAULT 0,
    `matchesPlayed` INTEGER NOT NULL DEFAULT 0,
    `matchesWon` INTEGER NOT NULL DEFAULT 0,
    `winRate` DOUBLE NOT NULL DEFAULT 0,
    `avgKillsPerGame` DOUBLE NOT NULL DEFAULT 0,
    `avgDamagePerGame` DOUBLE NOT NULL DEFAULT 0,
    `badgeType` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PlayerStats_memberId_period_key`(`memberId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PlayerStats` ADD CONSTRAINT `PlayerStats_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
