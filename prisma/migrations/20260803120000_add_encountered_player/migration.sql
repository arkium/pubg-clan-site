CREATE TABLE `EncounteredPlayer` (
    `id` VARCHAR(191) NOT NULL,
    `clanId` INTEGER NOT NULL,
    `pubgAccountId` VARCHAR(191) NOT NULL,
    `pubgPlayerName` VARCHAR(191) NOT NULL,
    `platformShard` VARCHAR(191) NOT NULL,
    `pubgClanId` VARCHAR(191) NULL,
    `pubgClanTag` VARCHAR(191) NULL,
    `pubgClanName` VARCHAR(191) NULL,
    `clanResolvedAt` DATETIME(3) NULL,
    `resolveAttempts` INTEGER NOT NULL DEFAULT 0,
    `encounterCount` INTEGER NOT NULL DEFAULT 1,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EncounteredPlayer_clanId_pubgAccountId_key`(`clanId`, `pubgAccountId`),
    INDEX `EncounteredPlayer_clanId_encounterCount_idx`(`clanId`, `encounterCount`),
    INDEX `EncounteredPlayer_clanId_pubgClanTag_idx`(`clanId`, `pubgClanTag`),
    INDEX `EncounteredPlayer_clanResolvedAt_encounterCount_idx`(`clanResolvedAt`, `encounterCount`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `EncounteredPlayer`
    ADD CONSTRAINT `EncounteredPlayer_clanId_fkey`
    FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
