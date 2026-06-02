-- CreateTable
CREATE TABLE `MemberWeaponStats` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `periodType` VARCHAR(191) NOT NULL,
    `weaponName` VARCHAR(191) NOT NULL,
    `kills` INTEGER NOT NULL DEFAULT 0,
    `headshots` INTEGER NOT NULL DEFAULT 0,
    `avgDistance` DOUBLE NOT NULL DEFAULT 0,
    `matchCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MemberWeaponStats_memberId_period_weaponName_key`(`memberId`, `period`, `weaponName`),
    INDEX `MemberWeaponStats_period_weaponName_idx`(`period`, `weaponName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MemberTelemetryStats` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `periodType` VARCHAR(191) NOT NULL,
    `aggressionScore` DOUBLE NOT NULL DEFAULT 0,
    `supportScore` DOUBLE NOT NULL DEFAULT 0,
    `zoneDisciplineScore` DOUBLE NOT NULL DEFAULT 0,
    `avgBlueZoneHits` DOUBLE NOT NULL DEFAULT 0,
    `avgCircleDelaySeconds` DOUBLE NOT NULL DEFAULT 0,
    `matchesPlayed` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MemberTelemetryStats_memberId_period_key`(`memberId`, `period`),
    INDEX `MemberTelemetryStats_period_aggressionScore_idx`(`period`, `aggressionScore`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ClanSynergyTelemetryStats` (
    `id` VARCHAR(191) NOT NULL,
    `clanId` INTEGER NOT NULL,
    `memberAId` INTEGER NOT NULL,
    `memberBId` INTEGER NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `periodType` VARCHAR(191) NOT NULL,
    `reviveCount` INTEGER NOT NULL DEFAULT 0,
    `coKillCount` INTEGER NOT NULL DEFAULT 0,
    `sharedDamageEvents` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ClanSynergyTelemetryStats_clanId_period_memberAId_memberBId_key`(`clanId`, `period`, `memberAId`, `memberBId`),
    INDEX `ClanSynergyTelemetryStats_clanId_period_idx`(`clanId`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MemberWeaponStats` ADD CONSTRAINT `MemberWeaponStats_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MemberTelemetryStats` ADD CONSTRAINT `MemberTelemetryStats_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClanSynergyTelemetryStats` ADD CONSTRAINT `ClanSynergyTelemetryStats_clanId_fkey` FOREIGN KEY (`clanId`) REFERENCES `Clan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClanSynergyTelemetryStats` ADD CONSTRAINT `ClanSynergyTelemetryStats_memberAId_fkey` FOREIGN KEY (`memberAId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ClanSynergyTelemetryStats` ADD CONSTRAINT `ClanSynergyTelemetryStats_memberBId_fkey` FOREIGN KEY (`memberBId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
