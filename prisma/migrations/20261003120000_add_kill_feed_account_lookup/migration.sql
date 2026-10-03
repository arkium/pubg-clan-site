-- CreateTable
CREATE TABLE `KillFeedAccountLookup` (
    `pubgAccountId` VARCHAR(191) NOT NULL,
    `platformShard` VARCHAR(191) NOT NULL DEFAULT 'steam',
    `notFound` BOOLEAN NOT NULL DEFAULT false,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`pubgAccountId`, `platformShard`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

