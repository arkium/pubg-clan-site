-- CreateTable
CREATE TABLE `MortarSeries` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `difficulty` VARCHAR(10) NOT NULL,
    `seed` VARCHAR(32) NOT NULL,
    `status` VARCHAR(10) NOT NULL DEFAULT 'started',
    `meanError` DOUBLE NULL,
    `hits` INTEGER NULL,
    `avgTimeMs` INTEGER NULL,
    `shots` JSON NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,

    INDEX `MortarSeries_memberId_difficulty_status_idx`(`memberId`, `difficulty`, `status`),
    INDEX `MortarSeries_difficulty_status_idx`(`difficulty`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MortarSeries` ADD CONSTRAINT `MortarSeries_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
