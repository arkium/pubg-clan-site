-- CreateTable
CREATE TABLE `MemberItemUseStat` (
    `id` VARCHAR(191) NOT NULL,
    `squadMatchId` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `subCategory` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL,
    `matchDate` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `MemberItemUseStat_memberId_matchDate_idx`(`memberId`, `matchDate`),
    INDEX `MemberItemUseStat_subCategory_matchDate_idx`(`subCategory`, `matchDate`),
    UNIQUE INDEX `MemberItemUseStat_squadMatchId_memberId_itemId_key`(`squadMatchId`, `memberId`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- AddForeignKey
ALTER TABLE `MemberItemUseStat` ADD CONSTRAINT `MemberItemUseStat_squadMatchId_fkey` FOREIGN KEY (`squadMatchId`) REFERENCES `SquadMatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE `MemberItemUseStat` ADD CONSTRAINT `MemberItemUseStat_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
