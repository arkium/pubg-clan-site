-- AlterTable
ALTER TABLE `Clan`
    DROP INDEX `Clan_name_key`,
    ADD COLUMN `pubgClanId` VARCHAR(191) NULL,
    ADD COLUMN `clanStats` JSON NULL;

-- AlterTable
ALTER TABLE `ClanMember`
    DROP INDEX `ClanMember_pubgPlayerName_key`;

-- CreateIndex
CREATE UNIQUE INDEX `Clan_name_platformShard_key` ON `Clan`(`name`, `platformShard`);

-- CreateIndex
CREATE UNIQUE INDEX `Clan_pubgClanId_platformShard_key` ON `Clan`(`pubgClanId`, `platformShard`);

-- CreateIndex
CREATE UNIQUE INDEX `ClanMember_pubgPlayerName_platformShard_key` ON `ClanMember`(`pubgPlayerName`, `platformShard`);
