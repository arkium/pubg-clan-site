-- AlterTable
ALTER TABLE `SquadMatchTelemetry`
    ADD COLUMN `summary` JSON NULL,
    ADD COLUMN `weaponStats` JSON NULL,
    ADD COLUMN `memberStats` JSON NULL;
