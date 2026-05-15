-- AlterTable
ALTER TABLE `Match` ADD COLUMN `headshotKills` INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN `revives` INTEGER NOT NULL DEFAULT 0;
