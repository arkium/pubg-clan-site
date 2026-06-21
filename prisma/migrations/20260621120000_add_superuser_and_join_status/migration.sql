-- AlterTable
ALTER TABLE `UserAccount`
  ADD COLUMN `isSuperUser` TINYINT(1) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `ClanMember`
  ADD COLUMN `joinStatus` VARCHAR(191) NOT NULL DEFAULT 'active';
