CREATE TABLE `ClanAwardsCache` (
    `id` VARCHAR(191) NOT NULL,
    `clanId` INTEGER NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `periodKey` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `computedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ClanAwardsCache_clanId_period_key`(`clanId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ClanAwardsCache`
    ADD CONSTRAINT `ClanAwardsCache_clanId_fkey`
    FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
