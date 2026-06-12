-- AlterTable
ALTER TABLE `Clan`
  ADD COLUMN `clanLevel`           INT          NULL,
  ADD COLUMN `clanPoints`          INT          NULL,
  ADD COLUMN `pubgCreatedAt`       DATETIME(3)  NULL,
  ADD COLUMN `pubgMemberCount`     INT          NULL,
  ADD COLUMN `pubgMembersSyncedAt` DATETIME(3)  NULL;
