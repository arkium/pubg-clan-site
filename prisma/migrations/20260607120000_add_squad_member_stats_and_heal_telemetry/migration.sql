-- P1.1 — Nouveaux champs ParticipantStats dans SquadMember (issus du résumé match PUBG API)
ALTER TABLE `SquadMember`
  ADD COLUMN `knockouts`       INT    NOT NULL DEFAULT 0,
  ADD COLUMN `headshotKills`   INT    NOT NULL DEFAULT 0,
  ADD COLUMN `timeSurvived`    INT    NOT NULL DEFAULT 0,
  ADD COLUMN `rideDistance`    DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `walkDistance`    DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `swimDistance`    DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `boosts`          INT    NOT NULL DEFAULT 0,
  ADD COLUMN `heals`           INT    NOT NULL DEFAULT 0,
  ADD COLUMN `vehicleDestroys` INT    NOT NULL DEFAULT 0,
  ADD COLUMN `roadKills`       INT    NOT NULL DEFAULT 0,
  ADD COLUMN `longestKill`     DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `teamKills`       INT    NOT NULL DEFAULT 0,
  ADD COLUMN `weaponsAcquired` INT    NOT NULL DEFAULT 0;

-- P1.3 — Agrégats LogHeal dans MemberTelemetryStats
ALTER TABLE `MemberTelemetryStats`
  ADD COLUMN `avgHealsUsed`       DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `avgHealAmount`      DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `avgBoostsUsed`      DOUBLE NOT NULL DEFAULT 0;

-- P3.2 — Vitesse max véhicule (LogVehicleLeave.maxSpeed)
ALTER TABLE `MemberTelemetryStats`
  ADD COLUMN `maxVehicleSpeedKph` DOUBLE NOT NULL DEFAULT 0;

-- P3.1 — Zones de drop (LogParachuteLanding)
ALTER TABLE `SquadMatchTelemetry`
  ADD COLUMN `landingSamples` JSON NULL;

-- P2.1 — Stats par saison + ranked (nouveaux endpoints PUBG API)
CREATE TABLE `MemberSeasonStats` (
  `id`                INT          NOT NULL AUTO_INCREMENT,
  `memberId`          INT          NOT NULL,
  `seasonId`          VARCHAR(191) NOT NULL,
  `rankedGameMode`    VARCHAR(191) NULL,
  `rankedTier`        VARCHAR(191) NULL,
  `rankedSubTier`     VARCHAR(191) NULL,
  `rankedPoints`      DOUBLE       NOT NULL DEFAULT 0,
  `rankedBestTier`    VARCHAR(191) NULL,
  `rankedBestSubTier` VARCHAR(191) NULL,
  `rankedBestPoints`  DOUBLE       NOT NULL DEFAULT 0,
  `rankedKills`       INT          NOT NULL DEFAULT 0,
  `rankedDamage`      DOUBLE       NOT NULL DEFAULT 0,
  `rankedWins`        INT          NOT NULL DEFAULT 0,
  `rankedMatches`     INT          NOT NULL DEFAULT 0,
  `rankedAssists`     INT          NOT NULL DEFAULT 0,
  `rankedRevives`     INT          NOT NULL DEFAULT 0,
  `normalKills`       INT          NOT NULL DEFAULT 0,
  `normalDamage`      DOUBLE       NOT NULL DEFAULT 0,
  `normalWins`        INT          NOT NULL DEFAULT 0,
  `normalLosses`      INT          NOT NULL DEFAULT 0,
  `normalAssists`     INT          NOT NULL DEFAULT 0,
  `normalRevives`     INT          NOT NULL DEFAULT 0,
  `normalMatches`     INT          NOT NULL DEFAULT 0,
  `lastRefreshedAt`   DATETIME(3)  NOT NULL,
  `createdAt`         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`         DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `MemberSeasonStats_memberId_seasonId_key` (`memberId`, `seasonId`),
  KEY `MemberSeasonStats_memberId_fkey` (`memberId`),
  CONSTRAINT `MemberSeasonStats_memberId_fkey`
    FOREIGN KEY (`memberId`) REFERENCES `ClanMember` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- P2.2 — Weapon Mastery (endpoint PUBG API carrière par arme)
CREATE TABLE `MemberWeaponMastery` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `memberId`        INT          NOT NULL,
  `weaponId`        VARCHAR(191) NOT NULL,
  `weaponName`      VARCHAR(191) NOT NULL,
  `kills`           INT          NOT NULL DEFAULT 0,
  `headshots`       INT          NOT NULL DEFAULT 0,
  `knockouts`       INT          NOT NULL DEFAULT 0,
  `shots`           INT          NOT NULL DEFAULT 0,
  `hits`            INT          NOT NULL DEFAULT 0,
  `damage`          DOUBLE       NOT NULL DEFAULT 0,
  `level`           INT          NOT NULL DEFAULT 0,
  `xpTotal`         INT          NOT NULL DEFAULT 0,
  `tier`            INT          NOT NULL DEFAULT 0,
  `lastRefreshedAt` DATETIME(3)  NOT NULL,
  `createdAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`       DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `MemberWeaponMastery_memberId_weaponId_key` (`memberId`, `weaponId`),
  KEY `MemberWeaponMastery_memberId_fkey` (`memberId`),
  CONSTRAINT `MemberWeaponMastery_memberId_fkey`
    FOREIGN KEY (`memberId`) REFERENCES `ClanMember` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
