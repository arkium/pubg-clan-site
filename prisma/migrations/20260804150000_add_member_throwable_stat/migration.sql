CREATE TABLE `MemberThrowableStat` (
    `id` VARCHAR(191) NOT NULL,
    `squadMatchId` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL,
    `matchDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MemberThrowableStat_squadMatchId_memberId_itemId_key`(`squadMatchId`, `memberId`, `itemId`),
    INDEX `MemberThrowableStat_memberId_matchDate_idx`(`memberId`, `matchDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MemberThrowableStat`
    ADD CONSTRAINT `MemberThrowableStat_squadMatchId_fkey`
    FOREIGN KEY (`squadMatchId`) REFERENCES `SquadMatch`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MemberThrowableStat`
    ADD CONSTRAINT `MemberThrowableStat_memberId_fkey`
    FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
