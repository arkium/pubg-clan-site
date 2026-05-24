-- CreateTable
CREATE TABLE `CronExecution` (
    `id` VARCHAR(191) NOT NULL,
    `clanId` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `triggeredBy` INTEGER NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'manual',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `message` VARCHAR(191) NULL,
    `details` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CronExecution_clanId_startedAt_idx`(`clanId`, `startedAt`),
    INDEX `CronExecution_clanId_action_status_idx`(`clanId`, `action`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CronExecution` ADD CONSTRAINT `CronExecution_clanId_fkey` FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
