-- CreateTable
CREATE TABLE `PrivacyRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pubgName` VARCHAR(32) NOT NULL,
    `kind` VARCHAR(10) NOT NULL,
    `reason` TEXT NULL,
    `email` VARCHAR(190) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `handledAt` DATETIME(3) NULL,

    INDEX `PrivacyRequest_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

