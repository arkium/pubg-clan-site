CREATE TABLE `KillEvent` (
    `id` VARCHAR(191) NOT NULL,
    `squadMatchId` VARCHAR(191) NOT NULL,
    `clanId` INTEGER NOT NULL,
    `killerAccountId` VARCHAR(191) NULL,
    `killerRawKey` VARCHAR(191) NULL,
    `killerMemberId` INTEGER NULL,
    `victimAccountId` VARCHAR(191) NULL,
    `victimRawKey` VARCHAR(191) NULL,
    `victimMemberId` INTEGER NULL,
    `weaponName` VARCHAR(191) NULL,
    `distance` DOUBLE NULL,
    `headshot` BOOLEAN NOT NULL DEFAULT false,
    `timestampSeconds` DOUBLE NULL,
    `matchDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `KillEvent_squadMatchId_idx`(`squadMatchId`),
    INDEX `KillEvent_clanId_victimMemberId_matchDate_idx`(`clanId`, `victimMemberId`, `matchDate`),
    INDEX `KillEvent_clanId_killerMemberId_matchDate_idx`(`clanId`, `killerMemberId`, `matchDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `KillEvent`
    ADD CONSTRAINT `KillEvent_squadMatchId_fkey`
    FOREIGN KEY (`squadMatchId`) REFERENCES `SquadMatch`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `KillEvent`
    ADD CONSTRAINT `KillEvent_clanId_fkey`
    FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `KillEvent`
    ADD CONSTRAINT `KillEvent_killerMemberId_fkey`
    FOREIGN KEY (`killerMemberId`) REFERENCES `ClanMember`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `KillEvent`
    ADD CONSTRAINT `KillEvent_victimMemberId_fkey`
    FOREIGN KEY (`victimMemberId`) REFERENCES `ClanMember`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
