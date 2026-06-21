-- CreateTable
CREATE TABLE `ClanConfig` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `clanId` INTEGER NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClanConfig_clanId_idx`(`clanId`),
    UNIQUE INDEX `ClanConfig_clanId_key_key`(`clanId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClanConfig` ADD CONSTRAINT `ClanConfig_clanId_fkey` FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
