-- CreateTable
CREATE TABLE `ResourcePoint` (
    `id` VARCHAR(191) NOT NULL,
    `mapName` VARCHAR(40) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `comment` VARCHAR(280) NULL,
    `createdByUserId` INTEGER NULL,
    `validatedByUserId` INTEGER NULL,
    `validatedAt` DATETIME(3) NULL,
    `lastConfirmedAt` DATETIME(3) NULL,
    `confirmationCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ResourcePoint_mapName_status_idx`(`mapName`, `status`),
    INDEX `ResourcePoint_createdByUserId_status_idx`(`createdByUserId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResourceReport` (
    `id` VARCHAR(191) NOT NULL,
    `pointId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(12) NOT NULL,
    `proposedX` DOUBLE NULL,
    `proposedY` DOUBLE NULL,
    `proposedKind` VARCHAR(20) NULL,
    `comment` VARCHAR(280) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `userId` INTEGER NOT NULL,
    `resolvedByUserId` INTEGER NULL,
    `resolvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ResourceReport_status_pointId_idx`(`status`, `pointId`),
    INDEX `ResourceReport_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResourceConfirmation` (
    `id` VARCHAR(191) NOT NULL,
    `pointId` VARCHAR(191) NOT NULL,
    `userId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ResourceConfirmation_pointId_createdAt_idx`(`pointId`, `createdAt`),
    INDEX `ResourceConfirmation_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResourceMapState` (
    `mapName` VARCHAR(40) NOT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `recheckSince` DATETIME(3) NULL,
    `updatedByUserId` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`mapName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResourceAction` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` INTEGER NULL,
    `action` VARCHAR(24) NOT NULL,
    `mapName` VARCHAR(40) NOT NULL,
    `pointId` VARCHAR(191) NULL,
    `summary` VARCHAR(255) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `undoneAt` DATETIME(3) NULL,
    `undoneByUserId` INTEGER NULL,

    INDEX `ResourceAction_createdAt_idx`(`createdAt`),
    INDEX `ResourceAction_mapName_createdAt_idx`(`mapName`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResourceVehicleSpot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mapName` VARCHAR(40) NOT NULL,
    `family` VARCHAR(10) NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `observations` INTEGER NOT NULL,
    `matches` INTEGER NOT NULL,
    `computedAt` DATETIME(3) NOT NULL,

    INDEX `ResourceVehicleSpot_mapName_family_idx`(`mapName`, `family`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ResourceVehicleMapStat` (
    `mapName` VARCHAR(40) NOT NULL,
    `analysedMatches` INTEGER NOT NULL,
    `windowDays` INTEGER NOT NULL,
    `computedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`mapName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ResourcePoint` ADD CONSTRAINT `ResourcePoint_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `UserAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourcePoint` ADD CONSTRAINT `ResourcePoint_validatedByUserId_fkey` FOREIGN KEY (`validatedByUserId`) REFERENCES `UserAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceReport` ADD CONSTRAINT `ResourceReport_pointId_fkey` FOREIGN KEY (`pointId`) REFERENCES `ResourcePoint`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceReport` ADD CONSTRAINT `ResourceReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceReport` ADD CONSTRAINT `ResourceReport_resolvedByUserId_fkey` FOREIGN KEY (`resolvedByUserId`) REFERENCES `UserAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceConfirmation` ADD CONSTRAINT `ResourceConfirmation_pointId_fkey` FOREIGN KEY (`pointId`) REFERENCES `ResourcePoint`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceConfirmation` ADD CONSTRAINT `ResourceConfirmation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserAccount`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ResourceAction` ADD CONSTRAINT `ResourceAction_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `UserAccount`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

