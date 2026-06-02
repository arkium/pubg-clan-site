-- AlterTable
ALTER TABLE `SquadMatchTelemetry`
    ADD COLUMN `attemptCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lastAttemptAt` DATETIME(3) NULL,
    ADD COLUMN `nextRetryAt` DATETIME(3) NULL;
