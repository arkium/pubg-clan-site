CREATE TABLE `Tournament` (
    `id` VARCHAR(191) NOT NULL,
    `organizerClanId` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `gameMode` VARCHAR(191) NULL,
    `mapName` VARCHAR(191) NULL,
    `rules` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Tournament_organizerClanId_status_idx`(`organizerClanId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TournamentClan` (
    `id` VARCHAR(191) NOT NULL,
    `tournamentId` VARCHAR(191) NOT NULL,
    `clanId` INTEGER NOT NULL,

    UNIQUE INDEX `TournamentClan_tournamentId_clanId_key`(`tournamentId`, `clanId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Tournament`
    ADD CONSTRAINT `Tournament_organizerClanId_fkey`
    FOREIGN KEY (`organizerClanId`) REFERENCES `Clan`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TournamentClan`
    ADD CONSTRAINT `TournamentClan_tournamentId_fkey`
    FOREIGN KEY (`tournamentId`) REFERENCES `Tournament`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TournamentClan`
    ADD CONSTRAINT `TournamentClan_clanId_fkey`
    FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
