-- CreateTable
CREATE TABLE `SquadMatch` (
    `id` VARCHAR(191) NOT NULL,
    `pubgMatchId` VARCHAR(191) NOT NULL,
    `gameMode` VARCHAR(191) NOT NULL,
    `mapName` VARCHAR(191) NOT NULL,
    `placement` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `totalKills` INTEGER NOT NULL,
    `totalDamage` DOUBLE NOT NULL,
    `totalAssists` INTEGER NOT NULL,
    `totalRevives` INTEGER NOT NULL,

    UNIQUE INDEX `SquadMatch_pubgMatchId_key`(`pubgMatchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SquadMember` (
    `id` VARCHAR(191) NOT NULL,
    `squadMatchId` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `kills` INTEGER NOT NULL,
    `damage` DOUBLE NOT NULL,
    `assists` INTEGER NOT NULL,
    `revives` INTEGER NOT NULL,
    `placement` INTEGER NOT NULL,

    UNIQUE INDEX `SquadMember_squadMatchId_memberId_key`(`squadMatchId`, `memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SquadMember` ADD CONSTRAINT `SquadMember_squadMatchId_fkey` FOREIGN KEY (`squadMatchId`) REFERENCES `SquadMatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SquadMember` ADD CONSTRAINT `SquadMember_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
