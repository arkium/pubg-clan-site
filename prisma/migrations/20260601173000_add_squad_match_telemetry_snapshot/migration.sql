-- CreateTable
CREATE TABLE `SquadMatchTelemetry` (
    `id` VARCHAR(191) NOT NULL,
    `squadMatchId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `parserVersion` VARCHAR(191) NOT NULL,
    `parsedAt` DATETIME(3) NOT NULL,
    `sourceGeneratedAt` DATETIME(3) NULL,
    `contentLength` INTEGER NULL,
    `bytesDownloaded` INTEGER NULL,
    `errorCode` VARCHAR(191) NULL,
    `errorMessage` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SquadMatchTelemetry_squadMatchId_key`(`squadMatchId`),
    INDEX `SquadMatchTelemetry_status_updatedAt_idx`(`status`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SquadMatchTelemetry` ADD CONSTRAINT `SquadMatchTelemetry_squadMatchId_fkey` FOREIGN KEY (`squadMatchId`) REFERENCES `SquadMatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
