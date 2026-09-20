-- CreateTable
CREATE TABLE `PlayerClanChange` (
    `id` VARCHAR(191) NOT NULL,
    `pubgAccountId` VARCHAR(191) NULL,
    `platformShard` VARCHAR(191) NOT NULL DEFAULT 'steam',
    `clanMemberId` INTEGER NULL,
    `previousClanId` INTEGER NULL,
    `newClanId` INTEGER NULL,
    `previousPubgClanId` VARCHAR(191) NULL,
    `previousPubgClanTag` VARCHAR(191) NULL,
    `newPubgClanId` VARCHAR(191) NULL,
    `newPubgClanTag` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'applied',
    `runId` VARCHAR(191) NULL,
    `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `appliedAt` DATETIME(3) NULL,
    `acknowledgedAt` DATETIME(3) NULL,
    `acknowledgedByUserId` INTEGER NULL,
    `triggeredByUserId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PlayerClanChange_status_detectedAt_idx`(`status`, `detectedAt`),
    INDEX `PlayerClanChange_clanMemberId_idx`(`clanMemberId`),
    INDEX `PlayerClanChange_runId_idx`(`runId`),
    INDEX `PlayerClanChange_pubgAccountId_platformShard_idx`(`pubgAccountId`, `platformShard`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PlayerClanChange` ADD CONSTRAINT `PlayerClanChange_clanMemberId_fkey` FOREIGN KEY (`clanMemberId`) REFERENCES `ClanMember`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerClanChange` ADD CONSTRAINT `PlayerClanChange_previousClanId_fkey` FOREIGN KEY (`previousClanId`) REFERENCES `Clan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlayerClanChange` ADD CONSTRAINT `PlayerClanChange_newClanId_fkey` FOREIGN KEY (`newClanId`) REFERENCES `Clan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

