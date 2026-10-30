-- Zones d'impact (docs/TODO/zones-d-impact.md, lot 1) : touches et dégâts par zone du corps, par membre et par période,
-- écrits par le recalcul des agrégats de télémétrie sous les clés de MemberTelemetryStats. Additive : une table vide,
-- aucune donnée touchée ; la semaine, le mois et « tous » courants se remplissent à la première passe du worker
-- d'agrégats, les semaines passées par scripts/backfill-body-zone-stats.ts.

-- CreateTable
CREATE TABLE `MemberBodyZoneStats` (
    `id` VARCHAR(191) NOT NULL,
    `memberId` INTEGER NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `periodType` VARCHAR(191) NOT NULL,
    `side` VARCHAR(191) NOT NULL,
    `zone` VARCHAR(191) NOT NULL,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `damage` DOUBLE NOT NULL DEFAULT 0,
    `matchesMeasured` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MemberBodyZoneStats_period_side_zone_idx`(`period`, `side`, `zone`),
    UNIQUE INDEX `MemberBodyZoneStats_memberId_period_side_zone_key`(`memberId`, `period`, `side`, `zone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MemberBodyZoneStats` ADD CONSTRAINT `MemberBodyZoneStats_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `ClanMember`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
