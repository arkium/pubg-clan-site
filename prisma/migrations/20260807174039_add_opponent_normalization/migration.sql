-- CreateTable
CREATE TABLE `Player` (
    `id` VARCHAR(191) NOT NULL,
    `pubgAccountId` VARCHAR(191) NOT NULL,
    `platformShard` VARCHAR(191) NOT NULL DEFAULT 'steam',
    `pubgPlayerName` VARCHAR(191) NOT NULL,
    `opponentClanId` VARCHAR(191) NULL,
    `clanResolvedAt` DATETIME(3) NULL,
    `resolveAttempts` INTEGER NOT NULL DEFAULT 0,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Player_opponentClanId_idx`(`opponentClanId`),
    INDEX `Player_pubgPlayerName_idx`(`pubgPlayerName`),
    UNIQUE INDEX `Player_pubgAccountId_platformShard_key`(`pubgAccountId`, `platformShard`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OpponentClan` (
    `id` VARCHAR(191) NOT NULL,
    `pubgClanId` VARCHAR(191) NOT NULL,
    `platformShard` VARCHAR(191) NOT NULL DEFAULT 'steam',
    `tag` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,
    `isFavorite` BOOLEAN NOT NULL DEFAULT false,
    `resolvedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OpponentClan_isFavorite_idx`(`isFavorite`),
    UNIQUE INDEX `OpponentClan_pubgClanId_platformShard_key`(`pubgClanId`, `platformShard`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClanEncounter` (
    `id` VARCHAR(191) NOT NULL,
    `clanId` INTEGER NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `encounterCount` INTEGER NOT NULL DEFAULT 1,
    `teammateEncounterCount` INTEGER NOT NULL DEFAULT 0,
    `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClanEncounter_clanId_encounterCount_idx`(`clanId`, `encounterCount`),
    UNIQUE INDEX `ClanEncounter_clanId_playerId_key`(`clanId`, `playerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Player` ADD CONSTRAINT `Player_opponentClanId_fkey` FOREIGN KEY (`opponentClanId`) REFERENCES `OpponentClan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClanEncounter` ADD CONSTRAINT `ClanEncounter_clanId_fkey` FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClanEncounter` ADD CONSTRAINT `ClanEncounter_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
