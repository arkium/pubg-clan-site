-- Add PUBG API rate limit headers tracking
ALTER TABLE `PubgApiCallLog`
  ADD COLUMN `rateLimitLimit` INT NULL,
  ADD COLUMN `rateLimitRemaining` INT NULL,
  ADD COLUMN `rateLimitResetAt` DATETIME(3) NULL;

CREATE INDEX `PubgApiCallLog_rateLimitResetAt_idx` ON `PubgApiCallLog`(`rateLimitResetAt`);
