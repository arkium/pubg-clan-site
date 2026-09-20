-- CreateTable
CREATE TABLE `ClanLifecycleRun` (
    `id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'cron',
    `status` VARCHAR(191) NOT NULL DEFAULT 'running',
    `mode` VARCHAR(191) NOT NULL DEFAULT 'observe',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `membersScanned` INTEGER NOT NULL DEFAULT 0,
    `apiCalls` INTEGER NOT NULL DEFAULT 0,
    `statesHasClan` INTEGER NOT NULL DEFAULT 0,
    `statesNoClan` INTEGER NOT NULL DEFAULT 0,
    `statesUnknown` INTEGER NOT NULL DEFAULT 0,
    `discrepanciesFound` INTEGER NOT NULL DEFAULT 0,
    `awaitingConfirmation` INTEGER NOT NULL DEFAULT 0,
    `movementsPlanned` INTEGER NOT NULL DEFAULT 0,
    `movementsApplied` INTEGER NOT NULL DEFAULT 0,
    `circuitBreakerTripped` BOOLEAN NOT NULL DEFAULT false,
    `movesRatioPercent` DOUBLE NULL,
    `triggeredByUserId` INTEGER NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClanLifecycleRun_status_startedAt_idx`(`status`, `startedAt`),
    INDEX `ClanLifecycleRun_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

