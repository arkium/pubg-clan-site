-- CreateTable
CREATE TABLE `AdminActionLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` INTEGER NULL,
    `memberId` INTEGER NULL,
    `isSuperUser` BOOLEAN NOT NULL DEFAULT false,
    `clanId` INTEGER NULL,
    `action` VARCHAR(120) NOT NULL,
    `method` VARCHAR(8) NOT NULL,
    `status` INTEGER NOT NULL,
    `outcome` VARCHAR(10) NOT NULL,
    `summary` JSON NULL,

    INDEX `AdminActionLog_createdAt_idx`(`createdAt`),
    INDEX `AdminActionLog_clanId_createdAt_idx`(`clanId`, `createdAt`),
    INDEX `AdminActionLog_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

