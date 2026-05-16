-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `data` JSON NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_memberId_read_createdAt_idx`(`memberId`, `read`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationPreference` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `squadDetected` BOOLEAN NOT NULL DEFAULT true,
    `topPerformance` BOOLEAN NOT NULL DEFAULT true,
    `challengeStarted` BOOLEAN NOT NULL DEFAULT true,
    `reportReady` BOOLEAN NOT NULL DEFAULT true,
    `inviteReminder` BOOLEAN NOT NULL DEFAULT false,
    `emailNotifications` BOOLEAN NOT NULL DEFAULT false,
    `pushNotifications` BOOLEAN NOT NULL DEFAULT true,
    `inAppNotifications` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `NotificationPreference_memberId_key`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NotificationPreference` ADD CONSTRAINT `NotificationPreference_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
