-- AlterTable
ALTER TABLE `Clan` ADD COLUMN `lastMatchAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `ClanMember` ADD COLUMN `lastMatchAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Clan_lastMatchAt_idx` ON `Clan`(`lastMatchAt`);

-- CreateIndex
CREATE INDEX `ClanMember_clanId_lastMatchAt_idx` ON `ClanMember`(`clanId`, `lastMatchAt`);
