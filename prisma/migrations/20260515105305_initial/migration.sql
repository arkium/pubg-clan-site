-- CreateTable
CREATE TABLE `ClanMember` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `displayName` VARCHAR(191) NOT NULL,
    `pubgPlayerName` VARCHAR(191) NOT NULL,
    `pubgAccountId` VARCHAR(191) NULL,
    `platformShard` VARCHAR(191) NOT NULL DEFAULT 'steam',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ClanMember_pubgPlayerName_key`(`pubgPlayerName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Match` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `pubgMatchId` VARCHAR(191) NOT NULL,
    `gameMode` VARCHAR(191) NOT NULL,
    `mapName` VARCHAR(191) NOT NULL,
    `kills` INTEGER NOT NULL,
    `knockouts` INTEGER NOT NULL,
    `assists` INTEGER NOT NULL,
    `damageDealt` DOUBLE NOT NULL,
    `placement` INTEGER NOT NULL,
    `playersAlive` INTEGER NOT NULL,
    `duration` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Match_memberId_pubgMatchId_key`(`memberId`, `pubgMatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
