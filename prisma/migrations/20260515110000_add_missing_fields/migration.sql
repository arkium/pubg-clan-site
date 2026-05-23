-- AlterTable: add headshotKills, revives, pubgCreatedAt to Match
ALTER TABLE `Match`
  ADD COLUMN `headshotKills` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `revives` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `pubgCreatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- CreateTable: MemberLifetimeStats
CREATE TABLE `MemberLifetimeStats` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `memberId` INTEGER NOT NULL,
    `combat` JSON NOT NULL,
    `victory` JSON NOT NULL,
    `support` JSON NOT NULL,
    `vehicle` JSON NOT NULL,
    `movement` JSON NOT NULL,
    `other` JSON NOT NULL,
    `lastRefreshedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MemberLifetimeStats_memberId_key`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MemberLifetimeStats` ADD CONSTRAINT `MemberLifetimeStats_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
