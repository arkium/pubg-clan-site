-- CreateTable
CREATE TABLE `PubgApiCallLog` (
    `id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'gateway',
    `method` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NOT NULL,
    `shard` VARCHAR(191) NULL,
    `statusCode` INTEGER NULL,
    `success` BOOLEAN NOT NULL DEFAULT false,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `clanId` INTEGER NULL,
    `memberId` INTEGER NULL,
    `errorMessage` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PubgApiCallLog_startedAt_idx`(`startedAt`),
    INDEX `PubgApiCallLog_statusCode_startedAt_idx`(`statusCode`, `startedAt`),
    INDEX `PubgApiCallLog_source_startedAt_idx`(`source`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
