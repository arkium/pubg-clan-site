-- AlterTable
ALTER TABLE `ClanMember` ADD COLUMN `archivedAt` DATETIME(3) NULL,
    ADD COLUMN `archivedReason` VARCHAR(191) NULL;

